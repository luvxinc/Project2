---
name: observability
description: 可观测架构师 SOP。Use when 需要 Metrics/Tracing/Logging、告警策略、SLO 与事故复盘。
---

# 可观测性规范 — 追踪 + 指标 + 日志

> **你是可观测架构师/SRE。你的职责是: 设计+实现监控体系、告警规则、事故响应、SLO 治理。**
> **技术栈**: 见 `CONTEXT.md §3 可观测性`（OTel SDK / 指标系统 / 日志系统 / Dashboard）

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

> **数据流**: 应用 + OTel SDK → Traces → Trace 后端；Metrics → Metrics 后端；Logs → Log 后端；三者统一汇入 Dashboard 告警和可视化。

> **技术选型**: 见 `CONTEXT.md §3 可观测性`（Tempo/Jaeger + Prometheus/VictoriaMetrics + Loki/ELK + Grafana/Kibana）

| 支柱 | 工具类型 | 数据类型 | 回答的问题 |
|------|---------|----------|------------|
| **Traces** | OTel → Trace 后端 | 请求在各服务间的流转路径 | "这个请求为什么慢？卡在哪里？" |
| **Metrics** | OTel/框架指标 → Metrics 后端 | 数值时序 (QPS/延迟/CPU/内存) | "系统现在的状态如何？趋势如何？" |
| **Logs** | 结构化日志 → Log 后端 | 结构化日志流 | "出了什么错？具体原因是什么？" |

---

## 2. OpenTelemetry (OTel) — 统一遥测

### 2.1 OTel SDK 接入

> **接入方式**: 见 `CONTEXT.md §3 后端技术栈`（Java Agent 注入 / SDK 代码集成 / 自动注入）

```yaml
# OTel 核心配置（伪配置，具体格式见 CONTEXT.md §3）
otel:
  exporter:
    endpoint: http://otel-collector:{port}
  service:
    name: {service-name}
    version: {app-version}
  environment: {deployment-env}
  sampling:
    rate: 1.0    # 开发: 100%，生产: 0.1 (10%)
```

### 2.2 手动 Span（关键业务流程）

```
手动 Span 模式（伪代码）:
  span = tracer.start("{business-operation}")
  span.set_attribute("{key}", "{value}")
  try:
    执行业务逻辑（子调用自动创建子 Span）
    span.set_status(OK)
  catch exception:
    span.set_status(ERROR, exception.message)
    span.record_exception(exception)
    throw
  finally:
    span.end()
```

### 2.3 Trace ID 传播

`traceparent` / `tracestate` Header 贯穿全链路：前端 → API Gateway → 后端（Controller/Service/Repository）→ 数据库连接备注 → 消息队列消息 Header → 消费者，实现全链路异步追踪。

---

## 3. Metrics — 指标收集

> **指标框架**: 见 `CONTEXT.md §3 可观测性`（Micrometer / OpenMetrics / 自定义 SDK）

### 3.1 自动指标（HTTP + 系统）

| 指标 | 说明 | 建议告警阈值 |
|------|------|----------|
| `http_server_requests` | HTTP 请求延迟 | P99 > 2s |
| `memory_used` | 进程内存使用 | > 80% |
| `thread_count` | 活跃线程数 | > 500 |
| `db_connection_active` | 活跃数据库连接 | > 80% pool |
| `mq_consumer_lag` | 消息队列消费延迟 | > 10000 |
| `disk_free` | 磁盘剩余 | < 10GB |

### 3.2 自定义业务指标

```
业务指标类型:
  Counter (计数器): 单调递增，如订单创建数、登录次数
  Gauge (仪表盘): 当前值，如在线用户数、库存总量
  Histogram (直方图): 分布统计，如请求耗时、文件大小
  Timer (定时器): 操作耗时，如报表生成时间

标签 (Labels/Tags):
  必须包含: module, environment
  可选: action, status, region
  禁止高基数标签（如 user_id, order_id 直接作为标签）
```

---

## 4. Logs — 结构化日志

> **日志框架**: 见 `CONTEXT.md §3 后端技术栈`（Logback / Zap / Pino 等）

### 4.1 JSON 日志格式（必须结构化）

```json
{
  "timestamp": "2026-01-01T12:00:00.000Z",
  "level": "INFO",
  "logger": "{service}.{module}.{component}",
  "message": "操作描述",
  "traceId": "otel-trace-id",
  "spanId": "otel-span-id",
  "userId": "user-uuid",
  "module": "{module-name}",
  "action": "{module}.{action}",
  "key_field_1": "value_1",
  "key_field_2": "value_2"
}
```

> **配置方式**: 见 `CONTEXT.md §3 可观测性`（Logback JSON / Morgan JSON / 结构化日志库）

### 4.2 日志规范

| 规则 | 说明 |
|------|------|
| **用 MDC/Context 传递上下文** | traceId, userId, module 通过框架自动注入 |
| **禁止 println/stdout 日志** | 必须使用框架日志器 |
| **日志等级规范** | ERROR=需立即处理, WARN=潜在问题, INFO=业务事件, DEBUG=排查 |
| **禁止日志敏感信息** | 密码/Token/PII 不得出现在日志中 |
| **消费者失败日志** | 必须包含 messageId + retryCount |

---

## 5. Dashboard

### 5.1 Dashboard 分类

| Dashboard | 数据源 | 内容 |
|-----------|--------|------|
| **Overview** | Metrics | 系统全局: QPS, 延迟, 错误率, CPU/内存 |
| **API Performance** | Metrics + Traces | 每个 API 的 P50/P99 延迟, 错误追踪 |
| **Database** | Metrics (DB Exporter) | 连接池, 查询延迟, 锁等待, 索引命中率 |
| **Message Queue** | Metrics (MQ Exporter) | 消费延迟, 吞吐量, 分区分布 |
| **Business** | 自定义指标 | 业务量, 关键业务事件 |
| **Logs** | Log 后端 | 错误日志搜索, 按 traceId 过滤 |
| **Traces** | Trace 后端 | 分布式追踪, 慢请求分析 |

### 5.2 Overview Dashboard 核心面板

QPS · P99 延迟 · Error Rate · CPU/内存 · Active DB 连接 · MQ Consumer Lag · Cache Hit Rate。

---

## 6. 告警规则

### 6.1 告警矩阵

| 告警 | 条件 | 严重级 | 通知渠道 |
|------|------|--------|----------|
| **API P99 > 2s** | 持续 5 分钟 | Warning | Slack |
| **API Error Rate > 5%** | 持续 2 分钟 | Critical | PagerDuty + Slack |
| **实例 CrashLoop** | 重启 > 3 次 | Critical | PagerDuty |
| **DB Connection Pool > 80%** | 持续 3 分钟 | Warning | Slack |
| **MQ Consumer Lag > 10000** | 持续 5 分钟 | Warning | Slack |
| **Disk Free < 10GB** | 任何节点 | Critical | PagerDuty |
| **Memory > 90%** | 持续 5 分钟 | Critical | PagerDuty |
| **Certificate Expiry < 7d** | 任何证书 | Warning | Slack + Email |

### 6.2 告警规则配置

> **告警工具**: 见 `CONTEXT.md §3 可观测性`（Alertmanager / Grafana Alerts / CloudWatch Alarms）

```yaml
# 通用告警规则模式（以 Prometheus Alertmanager 格式为例）
- alert: HighErrorRate
  expr: error_rate > 0.05
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "API 错误率 > 5%"

- alert: HighLatency
  expr: p99_latency_seconds > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "P99 延迟 > 2s"
```

---

## 7. 遗留系统迁移

| 遗留方案 | 现代化目标 | 迁移策略 |
|----------|----------|----------|
| 自研 Error 表 | OTel Traces + 日志后端 | 保留 DB 审计，Error 移入 Log 后端 |
| 自研 Audit 表 | Append-only Audit + 事件流 | DB 审计表保留，增加签名和 MQ 备份 |
| 自研 Business 表 | 自定义 Metrics | 业务计数移入 Metrics 系统 |
| 自研 Access 表 | API Gateway Access Log | 移入 Gateway + Log 后端 |
| 邮件告警 | Alertmanager + PagerDuty/Slack | 邮件作为备用通道 |

---

## 8. SRE 实践

### 8.1 事故复盘 (Post-mortem)

P1/P2 事故后 48 小时内完成。格式 → `core/templates/postmortem-template.md`。
存储：`.claude/projects/{project}/data/audits/{YYYY-MM-DD}_postmortem_{title}.md`。

### 8.2 Error Budget

Budget 状态：>50% 剩余 → 正常发布；30-50% → 减少变更；<30% → 冻结发布只修 Bug。

| SLO | 目标 | 月允许停机 | 衡量方式 |
|-----|------|-----------|----------|
| **可用性** | 99.9% | 43.2 分钟 | 健康检查 + HTTP 200 比率 |
| **延迟** | P99 < 2s | — | API 延迟 Histogram |
| **正确性** | 错误率 < 0.1% | — | 5xx / 总请求 |

### 8.3 On-Call 与事故响应

P1（全用户受影响）5 分钟内响应；P2（部分用户）15 分钟；P3（无用户影响）下工作日。
响应流程：定位 → 缓解 → 修复 → 验证 → 复盘。

---

---

*Version: 3.0.0 — L1 泛化*
*Updated: 2026-02-19*
