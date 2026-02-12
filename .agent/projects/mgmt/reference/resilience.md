---
description: 弹性/韧性模式 — 熔断、限流、舱壁、重试、超时、降级 (Resilience4j)
---

# 弹性模式 (Resilience Patterns)

> **核心原则**: ERP 系统不能因为一个下游服务故障就整体不可用。
> **技术选型**: **Resilience4j** (Spring Boot 3 原生集成, 替代已弃用的 Hystrix)
> **权威规范**: `core/skills/backend.md`

---

## 1. 六大弹性模式

### 1.1 Circuit Breaker (熔断器)

防止反复调用失败的服务, 给下游恢复时间。

```kotlin
@CircuitBreaker(name = "redisService", fallbackMethod = "getPermissionsFallback")
fun getPermissions(userId: String): PermissionSet {
    return redisCache.getPermissions(userId)
}

fun getPermissionsFallback(userId: String, ex: Exception): PermissionSet {
    logger.warn("Redis 不可用, 降级到数据库查询: {}", ex.message)
    return permissionRepository.findByUserId(userId).toPermissionSet()
}
```

**配置**:
```yaml
resilience4j:
  circuitbreaker:
    instances:
      redisService:
        sliding-window-size: 10          # 滑动窗口大小
        failure-rate-threshold: 50       # 失败率阈值 (%)
        wait-duration-in-open-state: 30s # 熔断后等待时间
        permitted-number-of-calls-in-half-open-state: 3
      externalApi:
        sliding-window-size: 20
        failure-rate-threshold: 60
        wait-duration-in-open-state: 60s
```

**状态流转**:
```
CLOSED (正常) → 失败率>阈值 → OPEN (熔断, 直接返回降级)
    ↑                              ↓ 等待时间到
    └──── 测试成功 ←── HALF_OPEN (少量试探请求)
```

### 1.2 Rate Limiter (限流)

防止突发流量压垮服务。

```kotlin
@RateLimiter(name = "apiDefault")
@GetMapping("/api/v1/products")
fun listProducts(): ResponseEntity<ApiResponse<List<ProductDto>>> {
    // ...
}
```

**配置**:
```yaml
resilience4j:
  ratelimiter:
    instances:
      apiDefault:
        limit-for-period: 100         # 每个周期最大请求数
        limit-refresh-period: 1s      # 刷新周期
        timeout-duration: 500ms       # 等待许可的超时
      exportApi:                      # 导出 API 更严格
        limit-for-period: 5
        limit-refresh-period: 1s
```

### 1.3 Bulkhead (舱壁隔离)

隔离线程池, 防止一个慢模块耗尽所有线程导致系统瘫痪。

```kotlin
@Bulkhead(name = "etlService", type = Bulkhead.Type.THREADPOOL)
fun runEtlImport(file: MultipartFile): CompletableFuture<ImportResult> {
    // ETL 在独立线程池运行, 不影响 API 服务
}
```

**配置**:
```yaml
resilience4j:
  bulkhead:
    instances:
      etlService:
        max-concurrent-calls: 5         # 最大并发数
        max-wait-duration: 0            # 不等待, 直接拒绝
  thread-pool-bulkhead:
    instances:
      etlService:
        max-thread-pool-size: 10
        core-thread-pool-size: 5
        queue-capacity: 50
```

### 1.4 Retry (自动重试)

处理短暂网络抖动。

```kotlin
@Retry(name = "kafkaProducer", fallbackMethod = "sendToDeadLetter")
fun publishEvent(event: DomainEvent) {
    kafkaTemplate.send(event.topic, event.key, event.payload)
}
```

**配置**:
```yaml
resilience4j:
  retry:
    instances:
      kafkaProducer:
        max-attempts: 3
        wait-duration: 1s
        exponential-backoff-multiplier: 2  # 指数退避: 1s, 2s, 4s
        retry-exceptions:
          - org.apache.kafka.common.errors.TimeoutException
        ignore-exceptions:
          - java.lang.IllegalArgumentException
```

### 1.5 Timeout (超时控制)

防止无限等待拖垮调用链。

```kotlin
@TimeLimiter(name = "databaseQuery")
fun getAnalyticsReport(params: ReportParams): CompletableFuture<ReportResult> {
    return CompletableFuture.supplyAsync { analyticsService.generate(params) }
}
```

**配置**:
```yaml
resilience4j:
  timelimiter:
    instances:
      databaseQuery:
        timeout-duration: 10s      # OLTP 查询最多 10 秒
      analyticsQuery:
        timeout-duration: 30s      # OLAP 查询最多 30 秒
      externalApi:
        timeout-duration: 5s       # 外部 API 最多 5 秒
```

### 1.6 Fallback (降级策略)

每个弹性模式都有对应的降级方法:

| 场景 | 降级策略 |
|------|----------|
| Redis 不可用 | → 查数据库 (PG) |
| OpenSearch 不可用 | → PG LIKE 查询 (降级模式) |
| ClickHouse 不可用 | → 返回缓存的上次报表 |
| Kafka 不可用 | → 写入本地 outbox 表, 恢复后重放 |
| 外部 API 不可用 | → 返回默认值或排队重试 |

---

## 2. 组合使用策略

建议的注解组合顺序 (**从外到内**):

```
Retry → CircuitBreaker → RateLimiter → TimeLimiter → Bulkhead → 实际调用
```

```kotlin
@Retry(name = "inventoryService")
@CircuitBreaker(name = "inventoryService", fallbackMethod = "fallback")
@RateLimiter(name = "apiDefault")
@TimeLimiter(name = "databaseQuery")
@Bulkhead(name = "inventoryService")
fun getInventoryLevels(skuList: List<String>): List<InventoryLevel> {
    return inventoryRepository.findBySkuIn(skuList)
}
```

---

## 3. 监控与可观测

Resilience4j 的指标自动暴露到 Prometheus:

```yaml
# application.yml
management:
  metrics:
    distribution:
      percentiles-histogram:
        resilience4j: true
  endpoints:
    web:
      exposure:
        include: health,prometheus,circuitbreakers,ratelimiters
```

Grafana Dashboard 需要监控:
- 熔断器状态 (CLOSED/OPEN/HALF_OPEN)
- 限流拒绝率
- 重试成功/失败次数
- 舱壁队列长度

---

## 4. 与 V2 的关系

V2 没有任何弹性模式 — Redis 宕机会直接导致 500 错误。V3 必须做到:
- Redis 宕机 → 降级到 PG 查询 (性能降低但不报错)
- Kafka 宕机 → 本地 outbox 缓冲
- 外部 API 超时 → 熔断 + 缓存数据

---

*Version: 1.0.0 — 2026-02-11*
