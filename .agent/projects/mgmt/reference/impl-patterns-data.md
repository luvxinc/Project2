---
name: impl-patterns-data
description: MGMT 项目数据层实现模式库（PostgreSQL/HikariCP/Redis/Kafka/OpenSearch/ClickHouse）。L1 data.md 指向 CONTEXT.md §3 后，Agent 加载此文件获取具体实现。
---

# MGMT 数据层实现模式 — PostgreSQL + Redis + Kafka + OpenSearch + ClickHouse

> **加载时机**: 当 L1 data.md 说"见 CONTEXT.md §3 数据存储层"时，加载此文件获取 MGMT 具体实现。
> **前置**: 先确认 `CONTEXT.md §3.1` 运行栈，再加载本文件。

---

## §1 Flyway 迁移结构（MGMT 实际）

```
src/main/resources/db/migration/
├── V1__create_users_tables.sql
├── V2__create_products_tables.sql
├── V3__create_{module}_tables.sql
├── V4__create_purchase_tables.sql
├── V5__create_sales_tables.sql
├── V6__create_inventory_tables.sql
├── V7__create_finance_tables.sql
├── V8__create_logs_tables.sql
└── V9__create_audit_tables.sql
```

### SQL 命名示例

```sql
-- 表名: 小写 + 下划线 + 复数
CREATE TABLE products (...);
CREATE TABLE purchase_orders (...);
CREATE TABLE inventory_transactions (...);

-- 索引名: idx_{table}_{columns}
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_purchase_orders_status_date ON purchase_orders(status, created_at);

-- 外键名: fk_{table}_{ref_table}
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_products
  FOREIGN KEY (product_id) REFERENCES products(id);
```

---

## §2 HikariCP 连接池配置

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000   # 30s
      idle-timeout: 600000        # 10min
      max-lifetime: 1800000       # 30min
      leak-detection-threshold: 60000  # 60s
```

---

## §3 Redis / Spring Data Redis 集成

```kotlin
@Service
class PermissionCacheService(
    private val redisTemplate: StringRedisTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun getPermissions(userId: UUID): Set<String>? {
        val key = "perm:$userId"
        val cached = redisTemplate.opsForValue().get(key) ?: return null
        return objectMapper.readValue(cached)
    }

    fun cachePermissions(userId: UUID, permissions: Set<String>) {
        val key = "perm:$userId"
        redisTemplate.opsForValue().set(
            key,
            objectMapper.writeValueAsString(permissions),
            Duration.ofMinutes(5)
        )
    }

    fun invalidate(userId: UUID) {
        redisTemplate.delete("perm:$userId")
    }
}
```

---

## §4 Kafka 事件结构（Spring Kafka）

### Topic 设计（MGMT 实际）

| Topic | 生产者 | 消费者 | 事件 |
|-------|--------|--------|------|
| `erp.inventory.events` | Inventory | Finance, Audit | 入库/出库/移库 |
| `erp.purchase.events` | Purchase | Inventory, Finance | PO 创建/收货/异常 |
| `erp.sales.events` | Sales | Inventory, Finance, Analytics | 销售成交 |
| `erp.finance.events` | Finance | Audit, Notification | 付款完成/对账 |
| `erp.audit.events` | All modules | Logs, OpenSearch | 所有审计事件 |
| `erp.notification.events` | All modules | Email/SMS/Push | 通知触发 |

### 标准事件信封

```kotlin
data class DomainEvent<T>(
    val eventId: UUID = UUID.randomUUID(),
    val eventType: String,          // "inventory.received"
    val source: String,             // "inventory-service"
    val timestamp: Instant = Instant.now(),
    val traceId: String?,
    val userId: UUID?,
    val payload: T,
)

// 示例 Payload
data class InventoryReceivedPayload(
    val transactionId: UUID,
    val productType: String,
    val specNo: String,
    val quantity: Int,
    val batchNo: String?,
    val location: String,
)
```

### Kafka Producer / Consumer

```kotlin
// Producer
@Service
class InventoryEventProducer(
    private val kafkaTemplate: KafkaTemplate<String, String>,
    private val objectMapper: ObjectMapper,
) {
    fun publishReceived(event: DomainEvent<InventoryReceivedPayload>) {
        kafkaTemplate.send(
            "erp.inventory.events",
            event.eventId.toString(),
            objectMapper.writeValueAsString(event),
        )
    }
}

// Consumer
@Component
class FinanceInventoryConsumer(private val financeService: FinanceService) {
    @KafkaListener(topics = ["erp.inventory.events"], groupId = "finance-group")
    fun onInventoryEvent(record: ConsumerRecord<String, String>) {
        val event = objectMapper.readValue<DomainEvent<InventoryReceivedPayload>>(record.value())
        when (event.eventType) {
            "inventory.received" -> financeService.createInventoryVoucher(event.payload)
            "inventory.returned" -> financeService.createReturnVoucher(event.payload)
        }
    }
}
```

---

## §5 OpenSearch 集成（Java Client）

### 索引设计（MGMT 实际）

| 索引 | 数据源 | 用途 | 刷新频率 |
|------|--------|------|----------|
| `products` | PostgreSQL→Kafka | SKU/名称/分类搜索 | 实时 (<1s) |
| `purchase_orders` | PostgreSQL→Kafka | PO 编号/供应商/状态搜索 | 实时 |
| `sales_transactions` | PostgreSQL→Kafka | 订单号/SKU/ASIN 搜索 | 近实时 (<5s) |
| `audit_logs` | Kafka | 审计日志查询/告警 | 实时 |

```kotlin
@Service
class ProductSearchService(private val openSearchClient: OpenSearchClient) {
    fun search(query: String, page: Int, size: Int): SearchResult<ProductSearchDoc> {
        val searchRequest = SearchRequest.Builder()
            .index("products")
            .query { q ->
                q.multiMatch { mm ->
                    mm.query(query)
                        .fields("sku^3", "name^2", "category")
                        .fuzziness("AUTO")
                }
            }
            .from(page * size)
            .size(size)
            .build()
        return openSearchClient.search(searchRequest, ProductSearchDoc::class.java)
    }
}
```

---

## §6 ClickHouse 表设计（MGMT 实际）

```sql
-- 销售交易宽表（ClickHouse）
CREATE TABLE sales_transactions_analytics
(
    transaction_id UUID,
    transaction_date Date,
    sku String,
    asin String,
    marketplace String,
    quantity UInt32,
    revenue Decimal64(2),
    cost Decimal64(5),
    profit Decimal64(2),
    created_at DateTime64(3),
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(transaction_date)
ORDER BY (transaction_date, sku)
TTL transaction_date + INTERVAL 5 YEAR;
```

同步策略: `PostgreSQL → Kafka → ClickHouse Kafka Engine → Materialized View → 报表表`

---

*Version: 1.0.0 — L4 项目实现模式（从 L1 迁移）*
*Created: 2026-02-19*
*Tech Stack: PostgreSQL 16.x / Redis / Kafka / OpenSearch 2.x / ClickHouse 24.x*
