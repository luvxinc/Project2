---
name: data
description: 数据架构师 — PostgreSQL + Redis + Kafka + OpenSearch + ClickHouse。负责数据建模/存储/查询/ETL/一致性保障。
---

# 数据层规范 — PostgreSQL + Redis + Kafka + OpenSearch + ClickHouse

> **你是数据架构师。你的职责是: 设计数据模型、选择存储方案、保障数据一致性和查询性能。**
> **⚠️ 本文件 ~10KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `架构`, `总览`, `五层` | → §1 五层架构总览 |
| `postgresql`, `schema`, `flyway`, `迁移`, `索引` | → §2 PostgreSQL |
| `redis`, `缓存`, `session`, `分布式锁` | → §3 Redis |
| `kafka`, `事件`, `topic`, `consumer` | → §4 Kafka |
| `opensearch`, `全文搜索`, `搜索` | → §5 OpenSearch |
| `clickhouse`, `报表`, `OLAP`, `分析` | → §6 ClickHouse |
| `一致性`, `事务`, `saga`, `幂等` | → §7 数据一致性 |

---

> **企业级五层数据架构: OLTP + Cache + Event + Search + OLAP。**

---

## 1. 五层数据架构

```
                    写入流                              读取流
                    ─────                              ─────
Application ──→ PostgreSQL (OLTP)              PostgreSQL ← 事务查询
                    │                           Redis     ← 热点缓存
                    ├──→ Kafka (Event Bus) ──→  OpenSearch ← 全文搜索
                    │         │                ClickHouse ← 报表/OLAP
                    │         └──→ Loki        ← 日志查询
                    │
                    └──→ Redis (Cache 回写)
```

| 层级 | 技术 | 数据类型 | 典型操作 |
|------|------|----------|----------|
| **OLTP** | PostgreSQL 16 | 事务数据 (订单/库存/财务) | CRUD, JOIN, Transaction |
| **Cache** | Redis 7 | Session/权限/热点 | GET/SET, TTL, Pub/Sub |
| **Event** | Kafka | 领域事件流 | Produce/Consume, Topic |
| **Search** | OpenSearch 2 | 全文搜索/日志 | Full-text, Aggregation |
| **OLAP** | ClickHouse | 报表/分析 | 百万行 SUM/GROUP BY |

---

## 2. PostgreSQL (OLTP — 唯一真相源)

### 2.1 Schema 规范

| 规则 | 要求 |
|------|------|
| **主键** | UUID v7 (时间有序) 或 BIGSERIAL |
| **时间戳** | `TIMESTAMPTZ` (带时区), 存储 UTC |
| **货币** | `DECIMAL(12,2)` — 金额 |
| **费率/成本** | `DECIMAL(12,5)` — 精确到小数点后 5 位 |
| **枚举** | `VARCHAR` + CHECK 约束 (不用 PG ENUM, 方便迁移) |
| **软删除** | `deleted_at TIMESTAMPTZ NULL` |
| **审计字段** | `created_at`, `updated_at`, `created_by`, `updated_by` |
| **索引** | 所有 lookup 字段 (FK, status, date, SKU) 必须索引 |
| **外键** | 业务键使用外键, 模块间使用逻辑关联 (不跨模块 FK) |

### 2.2 Flyway 迁移

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

### 命名规范

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

### 2.3 连接池 (HikariCP)

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20      # 生产环境
      minimum-idle: 5
      connection-timeout: 30000   # 30s
      idle-timeout: 600000        # 10min
      max-lifetime: 1800000       # 30min
      leak-detection-threshold: 60000  # 60s (泄漏检测)
```

---

## 3. Redis (缓存 + Session + 分布式锁)

### 3.1 用途分配

| 用途 | Key 格式 | TTL | 示例 |
|------|---------|-----|------|
| **Session** | `session:{sessionId}` | 30min | 登录状态 |
| **权限缓存** | `perm:{userId}` | 5min | 用户权限矩阵 |
| **业务缓存** | `cache:{module}:{key}` | 自定义 | 产品列表/配置 |
| **分布式锁** | `lock:{resource}` | 自动释放 | 防止并发重复提交 |
| **限流** | `ratelimit:{ip}` | 1min | API 限流计数 |
| **幂等键** | `idempotent:{key}` | 24h | 防重复操作 |

### 3.2 Spring Boot 集成

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
        redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(permissions), Duration.ofMinutes(5))
    }

    fun invalidate(userId: UUID) {
        redisTemplate.delete("perm:$userId")
    }
}
```

---

## 4. Kafka (事件驱动)

### 4.1 Topic 设计

| Topic | 生产者 | 消费者 | 事件 |
|-------|--------|--------|------|
| `erp.inventory.events` | {Module}/Inventory | Finance, Audit | 入库/出库/移库 |
| `erp.purchase.events` | Purchase | Inventory, Finance | PO 创建/收货/异常 |
| `erp.sales.events` | Sales | Inventory, Finance, Analytics | 销售成交 |
| `erp.finance.events` | Finance | Audit, Notification | 付款完成/对账 |
| `erp.audit.events` | All modules | Logs, OpenSearch | 所有审计事件 |
| `erp.notification.events` | All modules | Email/SMS/Push | 通知触发 |

### 4.2 事件结构

```kotlin
// 标准事件信封
data class DomainEvent<T>(
    val eventId: UUID = UUID.randomUUID(),
    val eventType: String,          // "inventory.received"
    val source: String,             // "inventory-service"
    val timestamp: Instant = Instant.now(),
    val traceId: String?,           // OTel trace ID
    val userId: UUID?,              // 操作人
    val payload: T,
)

// 示例: 库存入库事件
data class InventoryReceivedPayload(
    val transactionId: UUID,
    val productType: String,
    val specNo: String,
    val quantity: Int,
    val batchNo: String?,
    val location: String,
)
```

### 4.3 Spring Kafka 集成

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
class FinanceInventoryConsumer(
    private val financeService: FinanceService,
) {
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

## 5. OpenSearch (全文搜索)

### 5.1 索引设计

| 索引 | 数据源 | 用途 | 刷新频率 |
|------|--------|------|----------|
| `products` | PostgreSQL→Kafka | SKU/名称/分类搜索 | 实时 (<1s) |
| `purchase_orders` | PostgreSQL→Kafka | PO 编号/供应商/状态搜索 | 实时 |
| `sales_transactions` | PostgreSQL→Kafka | 订单号/SKU/ASIN 搜索 | 近实时 (<5s) |
| `audit_logs` | Kafka | 审计日志查询/告警 | 实时 |

### 5.2 使用方式

```kotlin
@Service
class ProductSearchService(
    private val openSearchClient: OpenSearchClient,
) {
    fun search(query: String, page: Int, size: Int): SearchResult<ProductSearchDoc> {
        val searchRequest = SearchRequest.Builder()
            .index("products")
            .query { q ->
                q.multiMatch { mm ->
                    mm.query(query)
                        .fields("sku^3", "name^2", "category")  // SKU 权重最高
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

## 6. ClickHouse (OLAP / 报表)

### 6.1 同步策略

```
PostgreSQL → Kafka → ClickHouse Kafka Engine → Materialized View → 报表表
```

### 6.2 报表场景

| 报表 | 数据量 | 查询类型 | 为什么需要 ClickHouse |
|------|--------|----------|---------------------|
| 月度销售汇总 | 百万行 | SUM/GROUP BY 日期/SKU | PG 需要 30s+, CH 仅 0.5s |
| SKU 成本分析 | 百万行 | 成本多层聚合 | PG 全表扫描, CH 列式秒回 |
| 库存周转率 | 十万行 | 时间窗口滚动计算 | PG 临时表开销大 |
| 财务对账 | 百万行 | 多表 JOIN 交叉验证 | PG 锁竞争, CH 无锁 |

### 6.3 表设计示例

```sql
-- ClickHouse: 销售交易宽表
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

---

## 7. 数据一致性保障

### 7.1 事务模式

| 场景 | 方案 | 示例 |
|------|------|------|
| **同模块 CRUD** | PostgreSQL 事务 (`@Transactional`) | 创建 PO + PO Items |
| **跨模块同步** | Kafka 事件 + 最终一致性 | 入库 → 财务凭证 |
| **Saga 模式** | Temporal 编排 | 采购审批 → 财务审批 → 收货 |
| **幂等性** | Redis Idempotency Key | 防止重复提交 |
| **分布式锁** | Redis SETNX | 库存扣减并发控制 |

### 7.2 失败处理

```
Kafka Consumer 失败 → 重试 3 次 → 进入 Dead Letter Topic → 人工处理/告警
```

---

*Version: 1.0.0 — Generic Core*
*Based on: battle-tested enterprise patterns*
