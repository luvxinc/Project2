---
description: AI/ML 智能层 — 异常检测, 预测分析, 自然语言查询, 智能填充
---

# AI/ML 智能层

> **定位**: V3 的差异化竞争力 — 从"被动记录"升级到"主动预测"。
> **架构**: 独立 ML 微服务 (Python FastAPI), 通过 REST API 被 Spring Boot 调用。
> **阶段**: Phase 8+ (在核心 ERP 模块迁移完成后实施)

---

## 1. 能力矩阵

| 能力 | 用途 | 优先级 | 技术 |
|------|------|--------|------|
| **异常检测** | 识别异常交易、库存偏差、成本异常 | P0 | Isolation Forest / Z-Score |
| **需求预测** | 预测SKU未来需求量, 辅助补货决策 | P1 | Prophet / ARIMA / XGBoost |
| **自然语言查询** | "上月销售前10的SKU?" → SQL → 结果 | P1 | LLM API (OpenAI/Claude) |
| **智能填充** | 表单字段自动推荐 (已有 SmartFill 雏形) | P2 | 规则引擎 + ML 分类器 |
| **审批建议** | 基于历史模式推荐审批/拒绝 | P2 | 简单分类器 (Logistic Regression) |
| **文档分类** | 自动识别上传文档类型 | P3 | NLP 分类器 |

---

## 2. 架构

```
┌──────────────────────────────────────────────┐
│              Spring Boot (ERP Core)           │
│                                               │
│  ProductService ─── /api/v1/ai/anomaly ──────┼──→ ┌─────────────────────┐
│  SalesService ───── /api/v1/ai/forecast ─────┼──→ │  ML Service          │
│  VMAService ─────── /api/v1/ai/smart-fill ───┼──→ │  (Python FastAPI)    │
│                                               │    │                     │
│  ClickHouse ←── Feature Pipeline ────────────┼──→ │  scikit-learn        │
│                                               │    │  Prophet             │
└──────────────────────────────────────────────┘    │  LangChain           │
                                                     │  pandas + numpy      │
                                                     └─────────────────────┘
                                                              │
                                                     ┌────────▼────────┐
                                                     │  Model Registry  │
                                                     │  (MLflow)        │
                                                     └─────────────────┘
```

### ML Service 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| Web 框架 | FastAPI | 0.100+ | 异步 REST API |
| ML 核心 | scikit-learn | 1.x | 分类/异常检测 |
| 时序预测 | Prophet / statsmodels | — | 需求预测 |
| LLM 集成 | LangChain + OpenAI API | — | NL→SQL |
| 数据处理 | pandas + numpy | — | 特征工程 |
| 模型管理 | MLflow | — | 模型版本/部署 |
| 容器化 | Docker | — | 独立服务部署 |

---

## 3. 异常检测 (P0)

### 3.1 监控指标

| 指标 | 异常定义 | 动作 |
|------|----------|------|
| 单笔交易金额 | > 3σ (历史均值) | 标记 + 通知 |
| 日库存变动量 | 偏离预测 > 50% | 告警 |
| SKU 成本突变 | 单次变动 > 20% | 阻断 + L3 审批 |
| 登录异常 | 异常 IP / 时间 / 频率 | 锁定 + L4 通知 |

### 3.2 API 设计

```
POST /api/v1/ai/anomaly/detect
Request:  { "entity": "transaction", "data": [...] }
Response: { "anomalies": [{ "id": "...", "score": 0.95, "reason": "金额异常偏高" }] }
```

---

## 4. 需求预测 (P1)

```
历史销售数据 (ClickHouse)
    → Feature Pipeline (每日 ETL)
    → Prophet 训练 (每周重训练)
    → 预测 API

GET /api/v1/ai/forecast?sku=ABC-001&days=30
Response: {
    "sku": "ABC-001",
    "predictions": [
        { "date": "2026-03-01", "quantity": 15, "confidence": [12, 18] },
        ...
    ],
    "model_version": "v2.3",
    "last_trained": "2026-02-28T00:00:00Z"
}
```

---

## 5. 自然语言查询 (P1)

```
用户输入: "上月销售额最高的5个产品"
    ↓ LLM (NL → SQL)
SQL: SELECT sku, SUM(revenue) as total FROM sales_facts
     WHERE date >= '2026-01-01' AND date < '2026-02-01'
     GROUP BY sku ORDER BY total DESC LIMIT 5
    ↓ ClickHouse 执行
    ↓ 结果返回

安全约束:
- 只允许 SELECT 查询 (禁止 INSERT/UPDATE/DELETE)
- 只允许访问 ClickHouse 分析库 (不能查 PG 主库)
- SQL 注入防护 (参数化查询)
- 每个用户有查询配额
```

---

## 6. 与 Spring Boot 集成

```kotlin
// Spring Boot 调用 ML Service
@Service
class AiService(
    @Value("\${ml.service.url}") private val mlServiceUrl: String,
    private val restTemplate: RestTemplate,
) {
    @CircuitBreaker(name = "mlService", fallbackMethod = "anomalyFallback")
    fun detectAnomalies(transactions: List<TransactionDto>): AnomalyResult {
        return restTemplate.postForObject(
            "$mlServiceUrl/api/v1/ai/anomaly/detect",
            AnomalyRequest(entity = "transaction", data = transactions),
            AnomalyResult::class.java
        )!!
    }

    fun anomalyFallback(transactions: List<TransactionDto>, ex: Exception): AnomalyResult {
        logger.warn("ML Service 不可用, 跳过异常检测")
        return AnomalyResult(anomalies = emptyList(), fallback = true)
    }
}
```

---

## 7. 部署策略

- ML Service 作为独立 Docker 容器部署在 K8s
- 与 ERP 主服务在同一个 VPC, 内网通信
- 资源隔离: ML 任务不占用 ERP 主服务资源
- 模型文件存储在 MinIO, MLflow 管理版本

---

*Version: 1.0.0 — 2026-02-11*
