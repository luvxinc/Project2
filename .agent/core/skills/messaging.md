---
name: messaging
description: 消息与异步工程 — Kafka/消息队列/Saga/幂等/事件溯源/异步处理模式。
---

# 消息与异步工程 (Messaging & Async Engineering)

> **你是消息架构师。你的职责是: 设计+实现消息队列、异步处理模式、事件溯源、Saga 长事务。**
> **事件驱动是分布式系统的神经系统。本 Skill 覆盖消息队列、异步模式、事件溯源。**

---

## 1. 消息架构总览

```
同步请求 (HTTP/gRPC)          异步消息 (Kafka/RabbitMQ)
━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━━━━
适用: 查询, 简单写入            适用: 跨模块事件, 长流程
延迟: < 100ms                  延迟: 可接受数秒
耦合: 强耦合                    耦合: 松耦合
失败: 即时反馈                  失败: 重试 + 死信队列
```

---

## 2. Kafka 深入

### 2.1 Topic 设计规范

```
{domain}.{entity}.{event}

示例:
  inventory.product.created
  inventory.product.updated
  order.payment.completed
  vma.training.assigned
```

| 规则 | 说明 |
|------|------|
| **一事件一 Topic** | 不混合不同类型事件 |
| **驼峰命名** | `order.payment.completed` |
| **分区策略** | 按 entity ID 分区 (保序) |
| **保留策略** | 7 天 (默认) / 30 天 (审计) / 永久 (事件溯源) |

### 2.2 Producer 规范

```kotlin
@Component
class OrderEventProducer(
    private val kafkaTemplate: KafkaTemplate<String, OrderEvent>
) {
    fun publish(event: OrderEvent) {
        kafkaTemplate.send(
            "order.${event.type.lowercase()}",
            event.orderId.toString(),  // key = 保序
            event
        ).whenComplete { result, ex ->
            if (ex != null) log.error("Kafka publish failed", ex)
        }
    }
}
```

### 2.3 Consumer 规范

```kotlin
@KafkaListener(
    topics = ["order.payment.completed"],
    groupId = "inventory-service",
    concurrency = "3"
)
fun onPaymentCompleted(event: PaymentCompletedEvent, ack: Acknowledgment) {
    try {
        inventoryService.reserve(event.orderId, event.items)
        ack.acknowledge()  // 手动确认
    } catch (e: Exception) {
        log.error("Processing failed, will retry", e)
        // 不确认 → Kafka 自动重试
    }
}
```

---

## 3. 消息模式

### 3.1 Saga 模式 (长事务)

```
订单创建 Saga:

OrderService          PaymentService        InventoryService
    │                      │                      │
    │──create order────→   │                      │
    │                      │──process payment──→  │
    │                      │                      │──reserve stock──→
    │                      │                      │
    │               成功   │                      │
    │←─────────────────────│←─────────────────────│
    │
    │               失败? → 补偿事务 (Compensating)
    │               ← cancel payment ← release stock
```

| Saga 类型 | 说明 | 适用 |
|-----------|------|------|
| **编排式 (Choreography)** | 事件驱动, 无中心 | 简单流程 (≤ 3 步) |
| **协调式 (Orchestration)** | 中心协调器 | 复杂流程 (> 3 步) |

### 3.2 幂等性 (Idempotency)

```kotlin
// ❌ 非幂等: 重复消费会重复扣款
fun processPayment(event: PaymentEvent) {
    accountService.debit(event.amount)
}

// ✅ 幂等: 用 eventId 去重
fun processPayment(event: PaymentEvent) {
    if (processedEventRepo.existsById(event.eventId)) return  // 已处理
    accountService.debit(event.amount)
    processedEventRepo.save(ProcessedEvent(event.eventId))
}
```

| 幂等策略 | 适用 |
|----------|------|
| **EventId 去重表** | 通用, 最可靠 |
| **数据库唯一约束** | INSERT 操作 |
| **版本号/乐观锁** | UPDATE 操作 |
| **状态机检查** | 状态流转操作 |

### 3.3 死信队列 (DLQ)

```yaml
# application.yml
spring:
  kafka:
    consumer:
      properties:
        max.poll.records: 100
    listener:
      ack-mode: manual
      
# 重试 3 次后进死信队列
@RetryableTopic(
    attempts = "3",
    backoff = @Backoff(delay = 1000, multiplier = 2),
    dltTopicSuffix = ".dlt",
    autoCreateTopics = "true"
)
```

### 3.4 Outbox 模式

```
解决问题: 数据库写入 + Kafka 发布的原子性

┌───────────────┐     ┌──────────┐     ┌─────────┐
│  Business DB  │     │  Outbox  │     │  Kafka  │
│  (写业务数据)  │────→│  Table   │────→│  Topic  │
│  @Transactional│     │ (同事务)  │     │ (CDC)   │
└───────────────┘     └──────────┘     └─────────┘

1. 业务操作 + 写 Outbox 表 → 同一个事务
2. CDC (Debezium) 或定时任务 → 读 Outbox → 发 Kafka
3. 发成功后标记已发送
```

---

## 4. 事件溯源 (Event Sourcing)

```
传统: 只存最终状态
  Account { balance: 500 }

事件溯源: 存每个事件, 状态通过重放计算
  AccountCreated { amount: 0 }
  Deposited { amount: 1000 }
  Withdrawn { amount: 300 }
  Deposited { amount: 200 }
  → 重放: 0 + 1000 - 300 + 200 = balance: 900 (等等 不对? → 可审计!)
```

| 适用 | 不适用 |
|------|--------|
| 金融/交易 | 简单 CRUD |
| 审计要求高 | 数据量极小 |
| 需要时间旅行 | 实时性要求极高 |

---

## 5. 异步处理模式

| 模式 | 场景 | 实现 |
|------|------|------|
| **Fire-and-Forget** | 通知, 日志 | Kafka 无回调 |
| **请求-回复** | 异步 RPC | Kafka + Reply Topic |
| **延迟消息** | 定时任务, 超时取消 | RabbitMQ TTL / Redis Sorted Set |
| **批量处理** | ETL, 报表生成 | Spring Batch + Kafka |
| **CQRS** | 读写分离 | 写→主库 → 事件 → 读→ES/ClickHouse |

---

## 6. 反模式

| 反模式 | 后果 | 替代 |
|--------|------|------|
| 消息体放大对象 | 网络压力 | 只放 ID + 元数据, 消费者自查 |
| 不处理重复消费 | 数据错误 | 幂等设计 |
| 同步等待异步结果 | 阻塞 | 回调/轮询/WebSocket |
| 无死信队列 | 毒消息阻塞 | 配置 DLQ |
| 无监控 | 消费积压不知道 | Consumer Lag 告警 |

---

*Version: 1.0.0 — Generic Core*
