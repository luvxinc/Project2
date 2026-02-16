---
name: observability
description: 可观测架构师 — OpenTelemetry + Prometheus + Grafana + Loki + SRE。负责Metrics/Tracing/Logging/告警/事故复盘/SLO。
---

# 可观测性规范 — OpenTelemetry + Prometheus + Grafana + Loki

> **你是可观测架构师/SRE。你的职责是: 设计+实现监控体系、告警规则、事故响应、SLO 治理。**
> **⚠️ 本文件 ~14KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `三支柱`, `总览`, `架构` | → §1 三支柱总览 |
| `otel`, `opentelemetry`, `tracing`, `trace` | → §2 OTel |
| `metrics`, `prometheus`, `micrometer`, `指标` | → §3 Metrics |
| `logs`, `loki`, `日志`, `结构化` | → §4 Logs |
| `grafana`, `dashboard`, `面板` | → §5 Dashboard |
| `告警`, `alert`, `pagerduty` | → §6 告警规则 |
| `迁移`, `遗留` | → §7 遗留迁移 |
| `SRE`, `复盘`, `post-mortem`, `SLO`, `错误预算` | → §8 SRE 实践 |

---

> **可观测优于可猜测。任何生产问题必须在 5 分钟内定位。**

---

## 1. 可观测性三支柱

```
┌─────────────────────────────────────────────────────┐
│                  Application                         │
│   Spring Boot + OTel SDK (Auto-Instrumentation)      │
│                                                     │
│   Traces ──────┐   Metrics ─────┐   Logs ──────┐   │
│                │                │               │   │
└────────────────┼────────────────┼───────────────┼───┘
                 │                │               │
        ┌────────▼──────┐ ┌──────▼────┐ ┌────────▼───┐
        │ OTel Collector │ │ Prometheus│ │ Promtail   │
        └────────┬──────┘ └──────┬────┘ └────────┬───┘
                 │               │               │
        ┌────────▼──────┐       │       ┌────────▼───┐
        │    Tempo       │       │       │    Loki    │
        │ (Trace Store)  │       │       │ (Log Store)│
        └────────┬──────┘       │       └────────┬───┘
                 │               │               │
                 └───────────────┼───────────────┘
                                 │
                        ┌────────▼────────┐
                        │     Grafana      │
                        │  Dashboard +     │
                        │  Alerting        │
                        └─────────────────┘
```

| 支柱 | 技术 | 数据类型 | 回答的问题 |
|------|------|----------|------------|
| **Traces** | OTel → Tempo | 请求在各服务间的流转路径 | "这个请求为什么慢？卡在哪里？" |
| **Metrics** | OTel/Micrometer → Prometheus | 数值时序 (QPS/延迟/CPU/内存) | "系统现在的状态如何？趋势如何？" |
| **Logs** | Logback → Promtail → Loki | 结构化日志 | "出了什么错？具体原因是什么？" |

---

## 2. OpenTelemetry (OTel) — 统一遥测

### 2.1 自动注入 (Zero-Code)

```dockerfile
# Dockerfile — 使用 OTel Java Agent
FROM eclipse-temurin:21-jre-alpine
COPY --from=otel/otel-java-agent:latest /usr/local/otel/opentelemetry-javaagent.jar /otel-agent.jar
COPY app.jar app.jar
ENTRYPOINT ["java", "-javaagent:/otel-agent.jar", "-jar", "app.jar"]
```

```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0  # 开发: 100%, 生产: 0.1 (10%)

otel:
  exporter:
    otlp:
      endpoint: http://otel-collector:4317
  resource:
    attributes:
      service.name: my-app-api
      service.version: ${APP_VERSION}
      deployment.environment: ${SPRING_PROFILES_ACTIVE}
```

### 2.2 手动 Span (关键业务)

```kotlin
@Service
class ProcessPurchaseOrderUseCase(
    private val tracer: Tracer,  // OTel Tracer
) {
    @Transactional
    fun execute(command: ProcessPOCommand) {
        val span = tracer.spanBuilder("process-purchase-order")
            .setAttribute("po.id", command.poId.toString())
            .setAttribute("po.items.count", command.items.size.toLong())
            .startSpan()
        
        try {
            span.makeCurrent().use {
                // 1. 验证
                val validated = validate(command)  // 自动创建子 Span
                
                // 2. 入库
                inventoryService.receive(validated)  // 自动创建子 Span
                
                // 3. 财务
                financeService.createVoucher(validated)  // 自动创建子 Span
            }
            span.setStatus(StatusCode.OK)
        } catch (e: Exception) {
            span.setStatus(StatusCode.ERROR, e.message ?: "Unknown error")
            span.recordException(e)
            throw e
        } finally {
            span.end()
        }
    }
}
```

### 2.3 Trace ID 传播

```
前端 Request
  ↓ traceparent: 00-{traceId}-{spanId}-01
API Gateway
  ↓ traceId 传递
Spring Boot (Controller → UseCase → Repository)
  ↓ traceId 传递
PostgreSQL (pg_stat_activity.application_name 含 traceId)
  ↓ traceId 传递
Kafka 消息 Header (traceparent)
  ↓ traceId 传递
Consumer (异步链路也可追踪)
```

---

## 3. Metrics — Prometheus + Micrometer

### 3.1 自动指标 (Spring Boot Actuator)

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  metrics:
    tags:
      application: my-app
      environment: ${SPRING_PROFILES_ACTIVE}
```

自动暴露的指标:

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| `http_server_requests_seconds` | HTTP 请求延迟 | P99 > 2s |
| `jvm_memory_used_bytes` | JVM 内存使用 | > 80% |
| `jvm_threads_live_threads` | 活跃线程数 | > 500 |
| `hikaricp_connections_active` | 活跃数据库连接 | > 80% pool |
| `spring_kafka_consumer_lag` | Kafka 消费延迟 | > 10000 |
| `disk_free_bytes` | 磁盘剩余 | < 10GB |

### 3.2 自定义业务指标

```kotlin
@Component
class BusinessMetrics(
    private val meterRegistry: MeterRegistry,
) {
    // 计数器: 订单创建数
    fun orderCreated(module: String) {
        meterRegistry.counter("business.orders.created", "module", module).increment()
    }
    
    // 仪表盘: 当前库存量
    fun registerInventoryGauge(supplier: () -> Double) {
        Gauge.builder("business.inventory.total", supplier)
            .register(meterRegistry)
    }
    
    // 定时器: 报表生成耗时
    fun recordReportGeneration(reportType: String, duration: Duration) {
        meterRegistry.timer("business.report.generation", "type", reportType)
            .record(duration)
    }
}
```

---

## 4. Logs — 结构化日志 + Loki

### 4.1 日志格式 (JSON)

```kotlin
// logback-spring.xml
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
            <providers>
                <timestamp/>
                <logLevel/>
                <loggerName/>
                <message/>
                <mdc/>  <!-- 包含 traceId, spanId, userId -->
                <stackTrace/>
                <arguments/>
            </providers>
        </encoder>
    </appender>
</configuration>
```

输出:
```json
{
  "timestamp": "2026-02-11T12:00:00.000Z",
  "level": "INFO",
  "logger": "com.example.app.modules.inventory.InventoryService",
  "message": "Inventory received",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "user-uuid",
  "module": "inventory",
  "action": "inventory.receive",
  "productType": "WidgetA",
  "quantity": 50
}
```

### 4.2 日志规范

| 规则 | 说明 |
|------|------|
| **用 MDC 传递上下文** | traceId, userId, module 通过 MDC 自动注入 |
| **禁止 println/stdout** | 必须使用 SLF4J Logger |
| **日志等级规范** | ERROR=需要立即处理, WARN=可能问题, INFO=业务事件, DEBUG=排查 |
| **禁止日志敏感信息** | 密码/Token/SSN 不得出现在日志中 |
| **Kafka error 日志** | Consumer 失败必须包含 messageId + retryCount |

---

## 5. Grafana Dashboard

### 5.1 Dashboard 分类

| Dashboard | 数据源 | 内容 |
|-----------|--------|------|
| **Overview** | Prometheus | 系统全局: QPS, 延迟, 错误率, CPU/内存 |
| **API Performance** | Prometheus + Tempo | 每个 API 的 P50/P99 延迟, 错误追踪 |
| **Database** | Prometheus (PG Exporter) | 连接池, 查询延迟, 锁等待, 索引命中率 |
| **Kafka** | Prometheus (Kafka Exporter) | 消费延迟, 吞吐量, Partition 分布 |
| **Business** | Prometheus (自定义指标) | 订单量, 库存变动, 财务流水 |
| **Logs** | Loki | 错误日志搜索, 按 traceId 过滤 |
| **Traces** | Tempo | 分布式追踪, 慢请求分析 |

### 5.2 关键 Dashboard 面板

```
┌──────────────────────────────────────┐
│         Application - Overview          │
│                                      │
│  QPS: 1,234  │  P99: 180ms          │
│  Error Rate: 0.1%  │  4xx: 23/min   │
│                                      │
│  ┌──────────┐  ┌──────────┐         │
│  │ CPU: 45% │  │ MEM: 62% │         │
│  └──────────┘  └──────────┘         │
│                                      │
│  Active DB Connections: 12/20       │
│  Kafka Consumer Lag: 42             │
│  Redis Hit Rate: 94.7%             │
└──────────────────────────────────────┘
```

---

## 6. 告警规则

### 6.1 告警矩阵

| 告警 | 条件 | 严重级 | 通知渠道 |
|------|------|--------|----------|
| **API P99 > 2s** | 持续 5 分钟 | Warning | Slack |
| **API Error Rate > 5%** | 持续 2 分钟 | Critical | PagerDuty + Slack |
| **Pod CrashLoopBackOff** | 任何 Pod 重启 > 3 次 | Critical | PagerDuty |
| **DB Connection Pool > 80%** | 持续 3 分钟 | Warning | Slack |
| **Kafka Consumer Lag > 10000** | 持续 5 分钟 | Warning | Slack |
| **Disk Free < 10GB** | 任何节点 | Critical | PagerDuty |
| **JVM OOM** | 内存使用 > 90% | Critical | PagerDuty |
| **Certificate Expiry < 7d** | 任何证书 | Warning | Slack + Email |

### 6.2 Alertmanager 配置

```yaml
# prometheus/alerting-rules.yml
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
          / sum(rate(http_server_requests_seconds_count[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API error rate > 5%"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket[5m])) by (le)) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API P99 latency > 2s"
```

---

## 7. 遗留系统迁移

| 遗留系统 | 现代化目标 | 迁移策略 |
|----------|----------|----------|
| 自研 ErrorLog 表 | OTel Traces + Loki | 保留 PG 审计, Error 移入 Loki |
| 自研 AuditLog 表 | Append-only Audit + Kafka | PG 审计表保留, 增加签名和 Kafka 备份 |
| 自研 BusinessLog 表 | 自定义 Prometheus Metrics | 业务计数移入 Prometheus |
| 自研 AccessLog 表 | API Gateway Access Log | 移入 Kong + Loki |
| 邮件告警 | Alertmanager + PagerDuty/Slack | 邮件作为备用通道 |

---

## 8. SRE 实践

### 8.1 事故复盘 (Post-mortem)

每次 P1/P2 事故后, 必须在 48 小时内完成复盘:

```markdown
## 🔥 事故复盘: {标题}

事故时间: {YYYY-MM-DD HH:MM} - {HH:MM}
影响时长: {X 分钟}
影响范围: {哪些用户/模块受影响}
严重级: {P1/P2}

### 时间线
| 时间 | 事件 |
|------|------|
| HH:MM | 告警触发 |
| HH:MM | 开始排查 |
| HH:MM | 定位根因 |
| HH:MM | 修复部署 |
| HH:MM | 恢复确认 |

### 根因分析 (5 Whys)
1. 为什么服务挂了? → 因为 OOM
2. 为什么 OOM? → 因为内存泄漏
3. 为什么内存泄漏? → 因为缓存没有 TTL
4. 为什么没有 TTL? → 因为代码审查没检查
5. 为什么审查没覆盖? → 缓存使用没有规范

### 检测为什么慢
{为什么没有更早发现? 监控/告警的盲区?}

### 行动项
| # | 行动 | 负责人 | 期限 | 状态 |
|---|------|--------|------|------|
| 1 | 加内存告警阈值 | SRE | 1 天 | ⬜ |
| 2 | 缓存强制 TTL 规范 | QA | 1 周 | ⬜ |
| 3 | 代码审查加缓存检查项 | QA | 1 周 | ⬜ |
```

存储位置: `projects/{project}/data/audits/{YYYY-MM-DD}_postmortem_{title}.md`

### 8.2 Error Budget

```
SLO: 99.9% 可用性 (月)
    = 允许 43.2 分钟停机 / 月

已用: 15 分钟 (事故 #1 占 12 分钟, 部署占 3 分钟)
剩余: 28.2 分钟

Budget 状态:
  > 50% 剩余 → 🟢 正常发布节奏
  30-50% 剩余 → 🟡 减少变更频率
  < 30% 剩余 → 🔴 冻结发布, 只修 BUG
```

| SLO | 目标 | 月允许停机 | 衡量方式 |
|-----|------|-----------|----------|
| **可用性** | 99.9% | 43.2 分钟 | 健康检查 + HTTP 200 比率 |
| **延迟** | P99 < 2s | — | API 延迟 Histogram |
| **正确性** | 错误率 < 0.1% | — | 5xx / 总请求 |

### 8.3 On-Call 与事故响应

```
告警触发
    ↓
P1 (影响全部用户): 5 分钟内响应
P2 (影响部分用户): 15 分钟内响应
P3 (不影响用户): 下个工作日处理
    ↓
定位 → 缓解 → 修复 → 验证 → 复盘
```

---

## 9. L3 工具库引用 (按需加载)

| 场景 | 工具 | 路径 | 说明 |
|------|------|------|------|
| 告警审查 | Guard 工作流 | `workflows/guard.md` | 故障排查 + 事故响应流程 |
| 代码审查 | ECC: Review | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | 日志/指标反模式检查 |
| 编码规范 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | 结构化日志格式规范 |

---

*Version: 2.1.0 — 含 L3 工具引用*
*Based on: battle-tested enterprise patterns*
