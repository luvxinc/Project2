# V3 架构全景 — Overview

> **MGMT ERP V3 的战略目标是构建世界一流企业级 ERP 系统，**
> **技术栈对标 SAP S/4HANA / Oracle ERP Cloud / Microsoft Dynamics 365。**

---

## 1. 战略定位

| 维度 | 定义 |
|------|------|
| **企业规模** | 上市企业，几千名员工 |
| **数据规模** | 百万级交易记录，TB 级历史数据 |
| **用户并发** | 数千名内部用户同时在线 |
| **可用性** | 99.9%+ SLA |
| **合规** | SOX / SOC2 审计就绪 |
| **多语言** | 英文 (主) + 中文 |

---

## 2. 不可妥协的架构原则

1. **每个模块独立、边界清晰** — 可单独测试、可独立部署、可替换
2. **业务规则不依赖 UI** — 领域层纯净，不依赖任何框架实现细节
3. **新功能只增加少量文件** — 开闭原则 (OCP)
4. **类型变更编译期爆炸** — Kotlin 强类型 + null safety 在编译期发现问题
5. **事务一致性是生命线** — ERP 的核心价值在于数据可靠性
6. **可观测优于可猜测** — 任何生产问题必须在 5 分钟内定位
7. **安全是第一公民** — 从架构层面保证，而非事后补丁

---

## 3. 技术栈总表

### 3.1 后端 (核心引擎)

| 层级 | 技术 | 版本要求 | 不可替代 | 理由 |
|------|------|----------|----------|------|
| **语言** | Kotlin | 2.x | ✅ | null safety, 协程, 数据类, sealed class; 90%+ Fortune 500 选择 JVM |
| **框架** | Spring Boot | 3.x | ✅ | 企业级能力最强: 事务、安全、批处理、调度、消息 |
| **Web** | Spring MVC | — | ✅ | RESTful API, 同步模型; ERP 场景 MVC 足够 |
| **安全** | Spring Security | 6.x | ✅ | RBAC + ABAC + OAuth2/OIDC/SAML, 声明式安全 |
| **ORM** | Spring Data JPA (Hibernate) | — | ✅ | 声明式事务传播, 二级缓存, 批量操作, 延迟加载 |
| **替代 ORM** | Exposed (Kotlin SQL) | — | 可选 | 轻量级 SQL DSL, 某些模块可混用 |
| **数据库迁移** | Flyway | — | ✅ | 版本化 SQL 迁移, 多环境一致性, 回滚能力 |
| **验证** | Jakarta Validation (JSR 380) | — | ✅ | `@Valid`, `@NotNull`, `@Size` 注解式验证 |
| **序列化** | Jackson (kotlinx.serialization 可选) | — | ✅ | JSON 处理标准 |
| **API 文档** | SpringDoc OpenAPI 3.0 | — | ✅ | 自动生成 OpenAPI Spec → 前端 TS Client |
| **批处理** | Spring Batch | — | ✅ | 百万级数据 ETL/导入/导出/对账 |
| **调度** | Spring Scheduler / Quartz | — | ✅ | 定时任务 (备份、报表、对账) |
| **领域事件** | Spring Modulith | — | ✅ | 模块边界 + 事件驱动 + 事件日志 |
| **测试** | JUnit 5 + MockK + Testcontainers | — | ✅ | 单测 + 集成测 + 容器化测试 |

### 3.2 前端 (保留 & 增强)

| 层级 | 技术 | 版本 | 不可替代 | 状态 |
|------|------|------|----------|------|
| **框架** | Next.js | 16.x (App Router) | ✅ | ✅ 从 V2 保留 |
| **UI 库** | React | 19.x | ✅ | ✅ 从 V2 保留 |
| **样式** | TailwindCSS | 4.x | ✅ | ✅ 从 V2 保留 |
| **组件原语** | Radix UI + shadcn/ui | — | ✅ | ✅ 从 V2 保留 |
| **数据请求** | @tanstack/react-query | 5.x | ✅ | ✅ 从 V2 保留 |
| **企业表格** | AG Grid | Enterprise | ✅ | 🆕 新增 — 百万行虚拟滚动/列拖拽/Excel 导出 |
| **表格 (轻量)** | @tanstack/react-table | 8.x | ✅ | ✅ 从 V2 保留 — 简单页面继续使用 |
| **i18n** | next-intl | 4.x | ✅ | ✅ 从 V2 保留 |
| **主题** | next-themes + ThemeContext | — | ✅ | ✅ 从 V2 保留 (Apple Design System) |
| **动画** | Anime.js | 4.x | ✅ | ✅ 从 V2 保留 |
| **图标** | Lucide React | — | ✅ | ✅ 从 V2 保留 |
| **Toast** | Sonner | — | ✅ | ✅ 从 V2 保留 |
| **图表** | Apache ECharts (或 Recharts) | — | ✅ | 🆕 新增 — 报表可视化 |
| **OpenAPI Client** | openapi-typescript-fetch (自动生成) | — | ✅ | 前后端类型安全桥梁 |
| **客户端状态** | Zustand (或 Jotai) | — | ✅ | 🆕 新增 — 轻量级客户端状态管理 |
| **URL 状态** | nuqs (Next.js URL state) | — | ✅ | 🆕 新增 — 分页/筛选/排序 URL 持久化 |
| **组件文档** | Storybook | 8.x | ✅ | 🆕 新增 — 可视化组件库文档 |
| **错误追踪** | Sentry (React SDK) | — | ✅ | 🆕 新增 — 前端运行时异常捕获 + 性能监控 |

### 3.3 数据层

| 层级 | 技术 | 版本 | 用途 | 不可替代 |
|------|------|------|------|----------|
| **主数据库 (OLTP)** | PostgreSQL | 16+ | ACID 事务, 唯一真相源 | ✅ |
| **缓存** | Redis | 7.x | Session, 权限缓存, 热点数据, 分布式锁 | ✅ |
| **搜索引擎** | OpenSearch | 2.x | 全文搜索, SKU/订单模糊查询, 日志索引 | ✅ |
| **OLAP/报表** | ClickHouse | — | 百万行聚合查询, 财务报表, 多维分析 | ✅ |
| **数据库迁移** | Flyway | — | 版本化 DDL 迁移 | ✅ |
| **连接池** | HikariCP | — | JDBC 连接池 (Spring Boot 默认) | ✅ |
| **L1 缓存** | Caffeine | — | 进程内热点缓存 (权限树/配置常量) | ✅ |
| **L2 缓存** | Redis | 7.x | 分布式缓存 (Cache-Aside 模式) | ✅ |
| **L3 CDN 缓存** | Cloudflare | — | 静态资源/i18n 文件 CDN 缓存 | ✅ |
| **缓存防护** | Redisson | — | 分布式锁 (防击穿) + Bloom Filter (防穿透) | ✅ |

### 3.4 消息、异步与实时

| 层级 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **消息队列** | Apache Kafka | 事件驱动: 库存变动→财务→审计→通知 | ✅ |
| **CDC** | Debezium 2.x (Kafka Connect) | PG WAL→Kafka→OpenSearch/ClickHouse 实时同步 | ✅ |
| **事件 Schema** | Confluent Schema Registry (Avro) | 事件 schema 版本管理, 向后兼容 | ✅ |
| **工作流引擎** | Temporal | 复杂审批流/多步骤编排 (采购→财务→收货) | ✅ |
| **任务队列** | Spring Batch + Kafka | 百万级 ETL, 大批量导入/导出/对账 | ✅ |
| **实时推送** | Spring WebSocket + STOMP + SockJS | 审批通知/库存告警/批量进度条 | ✅ |
| **SSE** | Spring MVC (SseEmitter) | Dashboard 实时刷新/导入进度 | ✅ |
| **通知引擎** | Kafka→NotificationService→多通道 | Email/WebSocket/站内/Slack/SMS 策略分发 | ✅ |

### 3.5 安全与合规

| 层级 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **认证框架** | Spring Security 6 | 统一安全层 | ✅ |
| **身份协议** | OAuth2 + OIDC + SAML | 企业 SSO (Azure AD / Google Workspace / LDAP) | ✅ |
| **密钥管理** | HashiCorp Vault | 生产密钥/证书/API Key 安全存储 | ✅ |
| **数据加密** | PG TDE + AES-256 | 静态加密 (敏感字段) | ✅ |
| **审计日志** | Append-only + Signed | 不可篡改审计追踪 (SOX/SOC2 就绪) | ✅ |
| **安全扫描** | SAST + SCA + SBOM | CI 管道集成, 依赖漏洞扫描 | ✅ |
| **数据治理** | PII 加密 + 留存策略 + 脱敏 | SOX/GDPR/CCPA 合规 (→ `data-governance.md`) | ✅ |

### 3.6 API 治理

| 层级 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **API 网关** | Kong / APISIX | 限流, 认证, 路由, 熔断 | ✅ |
| **API 契约** | OpenAPI 3.0 | 强制契约, 前端 TS Client 自动生成 | ✅ |
| **API 版本** | URL 路径 `/api/v1/` | Breaking change → 新版本, 旧版本 ≥ 6 个月 deprecation | ✅ |
| **契约测试** | OpenAPI Diff (CI) | 自动检测 breaking change, 阻断不兼容合并 | ✅ |
| **内部通信** | REST (默认) + gRPC (高性能场景) | 模块间通信 | ✅ |
| **Feature Flags** | Unleash (自托管) | 灰度发布/A/B 测试/V2-V3 迁移切换 | ✅ |

### 3.7 云原生基础设施

| 层级 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **容器** | Docker | 标准化打包 | ✅ |
| **编排** | Kubernetes (K8s) | 自动扩缩, 滚动更新, 高可用 | ✅ |
| **IaC** | Terraform | 基础设施即代码, 环境一致性 | ✅ |
| **CI/CD** | GitHub Actions (或 GitLab CI) | 全链路: lint → test → SAST → build → staging → prod | ✅ |
| **制品仓库** | Harbor (或 ECR/ACR) | Docker 镜像仓库 | ✅ |
| **对象存储** | MinIO (S3 兼容) | PDF/合同/CSV/图片文件存储 | ✅ |

### 3.7a 弹性与韧性 (Resilience)

| 模式 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **熔断器** | Resilience4j CircuitBreaker | 防级联失败, 快速失败 + 降级 | ✅ |
| **限流** | Resilience4j RateLimiter | 防突发流量压垮服务 | ✅ |
| **舱壁** | Resilience4j Bulkhead | 线程池隔离, ETL 不影响 API | ✅ |
| **重试** | Resilience4j Retry | 指数退避自动重试 | ✅ |
| **超时** | Resilience4j TimeLimiter | 防无限等待 | ✅ |
| **降级** | 自定义 Fallback 策略 | Redis→PG / OpenSearch→LIKE / ClickHouse→缓存 | ✅ |

> 详见: `reference/resilience.md`

### 3.8 可观测性

| 层级 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **全链路追踪** | OpenTelemetry (OTel) | 分布式追踪, 从前端到数据库 | ✅ |
| **指标** | Prometheus | 时序指标采集 (CPU/内存/QPS/延迟) | ✅ |
| **可视化** | Grafana | Dashboard, 实时监控面板 | ✅ |
| **日志聚合** | Loki (或 ELK) | 集中日志, 错误搜索, 关联追踪 | ✅ |
| **追踪** | Tempo (或 Jaeger) | 分布式请求链路可视化 | ✅ |
| **告警** | Alertmanager + PagerDuty/Slack | 异常自动告警, 值班轮转 | ✅ |
| **错误追踪** | Sentry (Spring Boot + React SDK) | 运行时异常捕获, traceId 打通前后端 | ✅ |

### 3.9 AI/ML 智能层 (Phase 8+)

| 能力 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **异常检测** | Python FastAPI + scikit-learn | 交易/库存/成本异常自动识别 | ✅ |
| **需求预测** | Prophet / XGBoost | SKU 需求量预测, 辅助补货 | ✅ |
| **自然语言查询** | LangChain + OpenAI API | NL→SQL→ClickHouse 结果 | ✅ |
| **模型管理** | MLflow | 模型版本/A-B 测试/部署 | ✅ |

> 详见: `reference/ai-ml.md`

### 3.10 文档与报表引擎

| 类型 | 技术 | 用途 | 不可替代 |
|------|------|------|----------|
| **PDF 报表** | JasperReports | 采购单/发票/月度报表/审计报告 | ✅ |
| **Excel 导出** | Apache POI (SXSSFWorkbook) | 流式大数据量导出 | ✅ |
| **邮件模板** | Thymeleaf | HTML 邮件 (i18n) | ✅ |
| **条码** | ZXing + PDFBox | 产品条码/库存标签 | ✅ |

> 详见: `reference/document-engine.md`

---

## 4. 目标架构图

```
                     ┌──────────────────────────────┐
                     │      CDN + WAF (Cloudflare)  │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │   API Gateway (Kong/APISIX)   │
                     │   Rate Limit · Auth · Route   │
                     └──────────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────▼──────────┐  ┌──────▼──────┐  ┌───────────▼──────────┐
   │   Next.js 16 (Web)  │  │  Mobile App │  │  Third-Party / API   │
   │   React 19 + TW v4  │  │  (Future)   │  │  OpenAPI Consumers   │
   │   AG Grid + shadcn  │  │  React Native│  │                     │
   └──────────┬──────────┘  └──────┬──────┘  └───────────┬──────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │ OpenAPI 3.0 (REST / gRPC)
                     ┌──────────────▼───────────────┐
                     │                               │
                     │  Kotlin + Spring Boot 3.x     │
                     │                               │
                     │  ┌─────────────────────────┐  │
                     │  │ Modules (Spring Modulith)│  │
                     │  │ ┌──────┐ ┌──────┐ ┌────┐│  │
                     │  │ │Users │ │ VMA  │ │Purch│  │
                     │  │ │& Auth│ │      │ │ase ││  │
                     │  │ └──────┘ └──────┘ └────┘│  │
                     │  │ ┌──────┐ ┌──────┐ ┌────┐│  │
                     │  │ │Sales │ │Invent│ │Finac│  │
                     │  │ │      │ │ory   │ │e   ││  │
                     │  │ └──────┘ └──────┘ └────┘│  │
                     │  └─────────────────────────┘  │
                     │                               │
                     │  Spring Security 6 (OIDC/RBAC)│
                     │  Spring Batch (ETL/Import)     │
                     │  Temporal Client (Workflows)   │
                     │                               │
                     └──┬──────────┬─────────┬───────┘
                        │          │         │
             ┌──────────▼──┐ ┌────▼───┐ ┌───▼──────────┐
             │ PostgreSQL  │ │ Redis  │ │   Kafka       │
             │ 16 (OLTP)   │ │ 7.x   │ │  (Events)     │
             │ + Flyway    │ │ Cache/ │ │               │
             │ + HikariCP  │ │ Session│ │  Domain Events│
             └──────┬──────┘ └────────┘ │  → Consumers  │
                    │                    └──┬──────────┘
             ┌──────▼──────┐        ┌──────▼──────────┐
             │ ClickHouse  │        │   OpenSearch     │
             │ (OLAP/报表)  │        │  (全文搜索/日志)  │
             └─────────────┘        └─────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │               Observability Layer                    │
    │  OpenTelemetry → Prometheus → Grafana                │
    │  Loki (Logs) · Tempo (Traces) · Alertmanager         │
    └──────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │               Infrastructure Layer                   │
    │  Kubernetes · Terraform · Vault · Harbor             │
    │  Docker · CI/CD · MinIO (S3) · Kong (Gateway)        │
    └──────────────────────────────────────────────────────┘
```

---

## 5. Monorepo 目录结构

```
MGMTV3/
├── apps/
│   ├── api/                      # Kotlin + Spring Boot 后端
│   │   ├── src/main/kotlin/
│   │   │   └── com/mgmt/erp/
│   │   │       ├── MgmtApplication.kt
│   │   │       ├── config/       # Spring 配置
│   │   │       ├── common/       # 公共: 异常处理, 安全, 审计
│   │   │       └── modules/      # 业务模块 (Spring Modulith)
│   │   │           ├── users/
│   │   │           ├── auth/
│   │   │           ├── vma/
│   │   │           ├── products/
│   │   │           ├── purchase/
│   │   │           ├── sales/
│   │   │           ├── inventory/
│   │   │           ├── finance/
│   │   │           └── logs/
│   │   ├── src/main/resources/
│   │   │   ├── application.yml
│   │   │   ├── db/migration/     # Flyway SQL 迁移文件
│   │   │   └── i18n/             # 后端 i18n 消息
│   │   ├── src/test/kotlin/      # JUnit 5 + MockK
│   │   ├── build.gradle.kts      # Gradle (Kotlin DSL)
│   │   └── Dockerfile
│   │
│   ├── web/                      # Next.js 前端 (从 V2 保留)
│   │   ├── src/
│   │   │   ├── app/              # App Router
│   │   │   ├── components/       # 封装组件
│   │   │   ├── contexts/         # ThemeContext, AuthContext
│   │   │   ├── lib/              # API client, hooks, utils
│   │   │   └── styles/           # TailwindCSS
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── mobile/                   # React Native + Expo (未来)
│
├── packages/
│   ├── shared/                   # 纯 TS: 类型、常量 (前端共享)
│   ├── api-client/               # OpenAPI 自动生成 TS Client
│   ├── ui/                       # shadcn 二次封装组件
│   └── config/                   # ESLint / Prettier / tsconfig
│
├── infra/                        # 基础设施即代码
│   ├── terraform/                # Terraform 模块
│   ├── kubernetes/               # K8s manifests / Helm charts
│   └── docker-compose.yml        # 本地开发环境
│
├── ops/                          # 运维脚本
│   ├── scripts/
│   └── monitoring/               # Grafana dashboards, alerts
│
├── docs/                         # 文档
│   ├── architecture/
│   ├── api/
│   └── runbooks/
│
├── build.gradle.kts              # 根 Gradle (后端)
├── settings.gradle.kts
├── package.json                  # 根 pnpm (前端)
├── pnpm-workspace.yaml
└── turbo.json
```

> **注意**：V3 使用**混合构建系统** — 后端用 **Gradle (Kotlin DSL)**，前端继续用 **pnpm + Turborepo**。

---

## 6. 后端 DDD 分层 (强制)

每个业务模块必须遵循以下结构：

```
modules/{module}/
├── domain/                       # 领域层 (最稳定, 零框架依赖)
│   ├── model/                    # 实体 + 值对象
│   │   ├── {Module}.kt           # 聚合根
│   │   └── {ValueObject}.kt     # 值对象
│   ├── event/                    # 领域事件
│   │   └── {Module}Events.kt
│   ├── service/                  # 领域服务
│   └── repository/               # Repository 接口 (非实现)
│       └── {Module}Repository.kt
│
├── application/                  # 应用层 (用例编排)
│   ├── usecase/                  # 用例
│   │   ├── Create{Module}UseCase.kt
│   │   └── Update{Module}UseCase.kt
│   ├── command/                  # 写操作命令
│   ├── query/                    # 读操作查询
│   └── dto/                      # 数据传输对象
│       ├── {Module}Request.kt
│       └── {Module}Response.kt
│
├── infrastructure/               # 基础设施层 (可替换)
│   ├── persistence/              # JPA 实现
│   │   ├── {Module}JpaRepository.kt
│   │   └── {Module}Entity.kt    # JPA Entity (映射数据库)
│   ├── messaging/                # Kafka Producer/Consumer
│   ├── search/                   # OpenSearch 实现
│   └── cache/                    # Redis 实现
│
├── api/                          # 接口层 (Controller)
│   ├── {Module}Controller.kt     # REST API
│   └── {Module}Mapper.kt        # DTO ↔ Domain 映射
│
└── {Module}Module.kt            # Spring Modulith 模块声明
```

### 分层铁律

| 规则 | 说明 | 检查方式 |
|------|------|----------|
| **Controller 禁止写业务逻辑** | 只做入参校验 + 调用 UseCase + 返回结果 | ArchUnit Test |
| **Domain 层禁止 import Spring** | 领域层不依赖任何框架 | ArchUnit Test |
| **Domain 层禁止 import JPA** | Entity 是 Domain Model, 不是 JPA Entity | ArchUnit Test |
| **模块间通过事件通信** | 禁止直接跨模块调用 Repository | Spring Modulith 验证 |
| **所有写操作必须幂等** | 通过 Idempotency-Key 或业务唯一键 | Code Review |
| **事务边界在 UseCase 层** | `@Transactional` 只标注在 UseCase 上 | ArchUnit Test |

---

## 7. API 设计规范 (强制)

### 7.1 RESTful 命名

```
✅ GET    /api/v1/products
✅ GET    /api/v1/products/{id}
✅ POST   /api/v1/products
✅ PUT    /api/v1/products/{id}
✅ DELETE /api/v1/products/{id}
✅ GET    /api/v1/products/{id}/inventory

❌ GET    /api/v1/getProducts
❌ POST   /api/v1/createProduct
```

### 7.2 统一响应格式

```kotlin
// 成功
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "pageSize": 20, "total": 1000, "totalPages": 50 }
}

// 错误
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "traceId": "abc-123",  // OTel Trace ID, 用于链路追踪
    "details": [...]
  }
}
```

### 7.3 安全等级 (保留 V2 的 4 级模型)

| 等级 | 验证要求 | 操作类型 |
|------|----------|----------|
| L1 | Bearer Token | 查询操作 |
| L2 | Token + 密码确认 | 修改操作 |
| L3 | Token + 安全码 | 运维级 (备份/批量/数据迁移) |
| L4 | Token + 系统码 | 核弹级 (清库/销毁/角色重配) |

---

## 8. 数据库建模规范 (宪法级)

### 8.1 严禁条目 (Anti-Patterns)

| 规则 | 说明 |
|------|------|
| **禁止 Type Erasure** | 严禁用 `TEXT` 存储日期/金额/数量/ID |
| **禁止 Index-less** | 所有 lookup 字段必须建立 B-Tree 索引 |
| **货币精度** | `DECIMAL(12,2)` — 金额; `DECIMAL(12,5)` — 费率/成本 |
| **主键** | UUID v7 (时间有序) 或 BIGSERIAL |
| **时间戳** | `TIMESTAMPTZ` (带时区), Pacific Time 业务锁 |
| **软删除** | `deleted_at TIMESTAMPTZ NULL` — 不物理删除 |
| **审计字段** | 每表必须: `created_at`, `updated_at`, `created_by`, `updated_by` |

### 8.2 多层存储架构

```
写入路径: Application → PostgreSQL (OLTP) → Kafka → ClickHouse (OLAP)
                                           → Kafka → OpenSearch (Search)
                                           → Kafka → Loki (Logs)

读取路径: 查询     → PostgreSQL (事务数据)
          搜索     → OpenSearch (全文/模糊)
          报表     → ClickHouse (聚合/分析)
          热点数据  → Redis (缓存)
```

---

## 9. 国际化 (i18n) 规范 (强制)

> **从第一行代码开始就必须支持多语言，禁止后期补救。**

| 层级 | 方案 | 库 |
|------|------|-----|
| **后端** | Spring MessageSource | `messages_{locale}.properties` |
| **Web** | next-intl | `packages/shared/i18n/` |
| **Mobile** | react-i18next | `packages/shared/i18n/` |

### Key 命名规范

```
{module}.{page}.{element}

# 示例
users.list.title              # 用户 - 列表页 - 标题
vma.inventory.column_spec     # VMA - 库存 - Spec 列
common.actions.save           # 通用 - 操作 - 保存
common.errors.required        # 通用 - 错误 - 必填
```

---

## 10. 对标世界一流 ERP — 能力矩阵

| 能力 | SAP S/4HANA | Oracle ERP Cloud | V3 目标 |
|------|-------------|-------------------|---------|
| ACID 事务 | ✅ | ✅ | ✅ Spring @Transactional |
| 声明式安全 | ✅ | ✅ | ✅ Spring Security 6 |
| 企业 SSO | ✅ SAML/OIDC | ✅ Oracle IAM | ✅ OIDC/SAML |
| 实时分析 | ✅ HANA | ✅ Oracle Analytics | ✅ ClickHouse |
| 全文搜索 | ✅ HANA Text | ✅ Oracle Text | ✅ OpenSearch |
| 事件驱动 | ✅ Event Mesh | ✅ AQ | ✅ Kafka |
| 批处理 | ✅ | ✅ | ✅ Spring Batch |
| 工作流 | ✅ SAP Workflow | ✅ Oracle BPM | ✅ Temporal |
| K8s 部署 | ✅ Kyma | ✅ OCI OKE | ✅ K8s |
| IaC | ✅ Terraform | ✅ Terraform | ✅ Terraform |
| 可观测性 | ✅ Cloud ALM | ✅ OCI Monitoring | ✅ OTel+Grafana |
| API 契约 | ✅ OData/REST | ✅ REST/SOAP | ✅ OpenAPI 3.0 |
| 审计合规 | ✅ SOX | ✅ SOX/SOC2 | ✅ Append-only Audit |
| 多语言 | ✅ | ✅ | ✅ i18n |
| 现代前端 | 🟡 Fiori (非 React) | 🟡 Redwood (自研) | ✅ Next.js + React 19 |

> **V3 的前端 (Next.js 16 + React 19) 实际上超越了三大巨头的前端技术水平。**

---

## 10. 核心业务规则 (迁移时必须保持一致)

> **来源: V2 生产系统验证过的业务逻辑, 迁移到 V3 时必须 1:1 保留。**

### 10.1 FIFO 库存规则 (最重要)

| 规则 | 说明 |
|------|------|
| 按时间排序 | 先入库的先扣减 |
| 完整扣减 | 一层扣完才扣下一层 |
| 原子操作 | 扣减必须在事务中完成 |
| 成本追踪 | 每层保留入库成本 |

### 10.2 采购流程状态机

```
DRAFT → PENDING → APPROVED → SHIPPED → RECEIVED → COMPLETED
                     ↓
                 CANCELLED
```

规则: 只能顺序流转, RECEIVED 后不可取消, APPROVED 后不可改金额。

### 10.3 财务精度

| 规则 | 值 |
|------|-----|
| 金额精度 | `Decimal(10, 2)` |
| 汇率精度 | 4 位小数 |
| 默认货币 | USD |
| 采购货币 | RMB |
| Landed Cost | = 采购成本 + 物流 + 关税 + 其他 |
| 成本查询优先级 | `landedPrice ?? fifoLayer.unitCost` |

### 10.4 权限安全等级

| 等级 | 验证方式 | 操作类型 |
|------|----------|----------|
| L1 | JWT Token | 查询 |
| L2 | Token + 密码确认 | 创建/修改 |
| L3 | Token + 安全码 | 删除/批量 |
| L4 | Token + Admin + 安全码 | 数据库级操作 |

### 10.5 审计规则

所有写操作 (创建/更新/删除) 必须记录审计日志, 包含: before/after 快照, userId, IP, traceId。

---

## 11. 性能基准 (Performance SLA)

| 指标 | 目标 | 测试工具 |
|------|------|----------|
| API P95 延迟 | < 200ms | k6 |
| API P99 延迟 | < 500ms | k6 |
| 首页 LCP (Largest Contentful Paint) | < 2.5s | Lighthouse |
| 首页 FID (First Input Delay) | < 100ms | Lighthouse |
| 数据库 OLTP 查询 | < 50ms (P95) | pg_stat_statements |
| ClickHouse 聚合查询 | < 2s (百万行) | 内置 profiler |
| Spring Batch ETL 吞吐 | > 10,000 行/秒 | Spring Batch metrics |
| Kafka 端到端延迟 | < 100ms | Kafka metrics |
| 并发用户承载 | ≥ 1,000 (无降级) | k6 |
| 系统可用性 | 99.9% (≤ 8.76h/年停机) | Prometheus uptime |

---

## 12. 完整参考文件索引

| 文件 | 内容 | 优先级 |
|------|------|--------|
| `v3-architecture.md` | 本文件 — V3 架构全景, 技术栈, 分层设计, 业务规则 | — |
| `migration.md` | V2→V3 迁移五阶段计划 | P0 |
| `migration-v2.md` | V2 模块→V3 模块逐一对照 | P0 |
| `business-rules.md` | FIFO/安全等级/状态机/VMA 业务规则 | P0 |
| `conventions.md` | 日志/i18n/主题/密码/代码组织约定 | P0 |
| `kafka-design.md` | Kafka Topic/事件信封/DLT/幂等消费 | P0 |
| `search-analytics.md` | OpenSearch 索引 + ClickHouse OLAP 设计 | P0 |
| **`resilience.md`** | 🆕 弹性模式 — 熔断/限流/舱壁/重试/降级 (Resilience4j) | P0 |
| **`disaster-recovery.md`** | 🆕 灾备 — RTO/RPO/备份/主从/DR 演练 | P0 |
| **`cdc.md`** | 🆕 CDC — Debezium/Outbox Pattern/Schema Registry | P0 |
| **`notification.md`** | 🆕 通知 — 多通道/模板/偏好/Kafka 驱动 | P1 |
| **`testing-strategy.md`** | 🆕 测试 — 金字塔/覆盖率/契约/E2E/性能/混沌 | P1 |
| **`document-engine.md`** | 🆕 文档引擎 — PDF/Excel/条码/异步生成 | P1 |
| **`workflow-engine.md`** | 🆕 审批流 — Temporal 多级/会签/委托/升级 | P1 |
| **`accessibility.md`** | 🆕 无障碍 — WCAG 2.2 AA/ARIA/CI 检测 | P1 |
| **`feature-flags.md`** | 🆕 功能开关 — Unleash/灰度/迁移切换 | P2 |
| **`data-governance.md`** | 🆕 数据治理 — 分类/PII/留存/脱敏/GDPR | P2 |
| **`config-management.md`** | 🆕 配置中心 — Vault/动态密钥/密钥轮转 | P2 |
| **`ai-ml.md`** | 🆕 AI/ML — 异常检测/预测/NL→SQL (Phase 8+) | P2 |
| **`developer-experience.md`** | 🆕 DX — Storybook/Swagger/CLI/入门指南 | P2 |

---

*Version: 3.1.0 — 100% Complete Architecture*
*Created: 2026-02-11*
*Updated: 2026-02-11 (v3.1.0 — 19-GAP audit remediation)*
