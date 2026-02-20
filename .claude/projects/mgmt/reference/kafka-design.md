---
description: Kafka 事件驱动 — Topic 设计, Producer/Consumer 模板, DLT, 幂等
---

# Kafka 事件驱动

> **引入时机**: V3 Phase 2 (数据基础设施建设后)。初期可用 Spring ApplicationEvent 做模块间通信。
> **权威规范**: `core/skills/data.md`

---

## Topic 设计

### 命名规范

```
erp.{module}.{event-category}
```

| Topic | 生产者 | 消费者 | 用途 |
|-------|--------|--------|------|
| `erp.inventory.movements` | Inventory Service | Search Sync, Analytics | 入库/出库/移库事件 |
| `erp.purchase.lifecycle` | Purchase Service | Finance, Inventory | PO创建/发货/收货 |
| `erp.sales.transactions` | ETL Service | Analytics, FIFO | 销售成交事件 |
| `erp.vma.clinical` | VMA Clinical Service | Audit, Analytics | 临床案例生命周期 |
| `erp.audit.events` | All Modules | Audit Service, Compliance | 审计事件 (追加只写) |

### 事件信封 (标准格式)

```json
{
  "eventId": "uuid-v7",
  "eventType": "INVENTORY_RECEIVED",
  "source": "inventory-service",
  "timestamp": "2026-02-11T13:00:00Z",
  "traceId": "otel-trace-id",
  "userId": "user-uuid",
  "version": 1,
  "payload": { ... }
}
```

---

## Kotlin 模板

### Producer

```kotlin
@Service
class InventoryEventProducer(
    private val kafkaTemplate: KafkaTemplate<String, String>,
    private val objectMapper: ObjectMapper,
) {
    private val topic = "erp.inventory.movements"

    fun publishMovement(event: InventoryMovementEvent) {
        val envelope = EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            eventType = event.action.name,
            source = "inventory-service",
            timestamp = Instant.now(),
            traceId = MDC.get("traceId"),
            userId = SecurityContextHolder.getContext().userId(),
            payload = event,
        )
        kafkaTemplate.send(topic, event.productId, objectMapper.writeValueAsString(envelope))
    }
}
```

### Consumer

```kotlin
@Component
class InventorySearchSyncConsumer(
    private val searchService: InventorySearchService,
) {
    @KafkaListener(
        topics = ["erp.inventory.movements"],
        groupId = "search-sync",
        containerFactory = "kafkaListenerContainerFactory",
    )
    @Retry(maxAttempts = 3, backoff = @Backoff(delay = 1000, multiplier = 2))
    fun onMovement(record: ConsumerRecord<String, String>) {
        val envelope = objectMapper.readValue<EventEnvelope<InventoryMovementEvent>>(record.value())
        searchService.syncToOpenSearch(envelope.payload)
    }
}
```

### Dead Letter Topic (DLT)

```kotlin
@Bean
fun kafkaListenerContainerFactory(): ConcurrentKafkaListenerContainerFactory<String, String> {
    val factory = ConcurrentKafkaListenerContainerFactory<String, String>()
    factory.consumerFactory = consumerFactory()
    factory.setCommonErrorHandler(
        DefaultErrorHandler(
            DeadLetterPublishingRecoverer(kafkaTemplate),
            FixedBackOff(1000L, 3)    // 3次重试后进 DLT
        )
    )
    return factory
}
// DLT topic: erp.inventory.movements.DLT (自动创建)
```

---

## 幂等消费

```kotlin
@Component
class IdempotentConsumer(private val redis: RedisTemplate<String, String>) {
    fun processOnce(eventId: String, block: () -> Unit): Boolean {
        val key = "consumed:$eventId"
        val isNew = redis.opsForValue().setIfAbsent(key, "1", Duration.ofHours(24))
        if (isNew == true) {
            block()
            return true
        }
        return false  // 已处理, 跳过
    }
}
```

---

## 与 V2 的关系

V2 没有 Kafka。V2 模块间通过直接调用 Service 通信。V3 引入 Kafka 后:
- **模块内**: 仍然直接调用 UseCase (不需要 Kafka)
- **跨模块**: Kafka 事件 (松耦合)
- **迁移期**: V2 模块不发 Kafka, V3 模块开始发, 新旧并存无冲突
