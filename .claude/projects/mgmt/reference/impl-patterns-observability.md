---
name: impl-patterns-observability
description: MGMT 项目可观测性实现模式库（Spring Boot OTel + Micrometer + Logback）。L1 observability.md 指向 CONTEXT.md §3 后，Agent 加载此文件获取具体实现。
---

# MGMT 可观测性实现模式 — Spring Boot + OTel Java Agent + Logback + Micrometer

> **加载时机**: 当 L1 observability.md 说"见 CONTEXT.md §3 可观测性"时，加载此文件获取 MGMT 具体实现。
> **前置**: 先确认 `CONTEXT.md §3.1` 运行栈，再加载本文件。

---

## §1 OTel Java Agent 接入（Dockerfile）

```dockerfile
# Dockerfile — 使用 OTel Java Agent 自动注入（零代码改动）
FROM eclipse-temurin:21-jre-alpine
COPY --from=otel/otel-java-agent:latest /usr/local/otel/opentelemetry-javaagent.jar /otel-agent.jar
COPY app.jar app.jar
ENTRYPOINT ["java", "-javaagent:/otel-agent.jar", "-jar", "app.jar"]
```

---

## §2 Spring Boot OTel 配置

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
      service.name: mgmt-api
      service.version: ${APP_VERSION}
      deployment.environment: ${SPRING_PROFILES_ACTIVE}
```

---

## §3 手动 Span（Kotlin + OTel SDK）

```kotlin
val span = tracer.spanBuilder("process-purchase-order")
    .setAttribute("po.id", command.poId.toString())
    .startSpan()
try {
    span.makeCurrent().use { /* 子调用自动创建子 Span */ }
    span.setStatus(StatusCode.OK)
} catch (e: Exception) {
    span.setStatus(StatusCode.ERROR, e.message ?: "Unknown")
    span.recordException(e)
    throw e
} finally {
    span.end()
}
```

---

## §4 Spring Boot Actuator Metrics 配置

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  metrics:
    tags:
      application: mgmt
      environment: ${SPRING_PROFILES_ACTIVE}
```

### 自定义业务指标（Micrometer）

```kotlin
@Component
class BusinessMetrics(private val meterRegistry: MeterRegistry) {
    // 计数器: 订单创建数
    fun orderCreated(module: String) {
        meterRegistry.counter("business.orders.created", "module", module).increment()
    }

    // 仪表盘: 当前库存量
    fun registerInventoryGauge(supplier: () -> Double) {
        Gauge.builder("business.inventory.total", supplier).register(meterRegistry)
    }

    // 定时器: 报表生成耗时
    fun recordReportGeneration(reportType: String, duration: Duration) {
        meterRegistry.timer("business.report.generation", "type", reportType).record(duration)
    }
}
```

---

## §5 Logback JSON 结构化日志

```xml
<!-- logback-spring.xml -->
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

### 日志输出示例

```json
{
  "timestamp": "2026-02-11T12:00:00.000Z",
  "level": "INFO",
  "logger": "com.example.mgmt.modules.inventory.InventoryService",
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

---

## §6 Trace ID 传播路径（MGMT 全链路）

```
traceparent Header 贯穿:
前端 → API Gateway → Spring Boot（Controller → UseCase → Repository）
     → PostgreSQL application_name
     → Kafka 消息 Header
     → Consumer（Finance/Audit/OpenSearch 同步）
```

---

## §7 数据流架构（MGMT 实际）

```
Spring Boot + OTel SDK
  → Traces → OTel Collector → Tempo
  → Metrics → Prometheus
  → Logs (Logback JSON) → Promtail → Loki

三者统一汇入 Grafana Dashboard + Alertmanager
```

---

*Version: 1.0.0 — L4 项目实现模式（从 L1 迁移）*
*Created: 2026-02-19*
*Tech Stack: Spring Boot 3.3.x / OTel Java Agent / Micrometer / Logback / Prometheus + Grafana + Loki + Tempo*
