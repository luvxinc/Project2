---
description: CDC 变更数据捕获 — Debezium + Outbox Pattern + Schema Registry
---

# CDC — 变更数据捕获 (Change Data Capture)

> **核心用途**: 将 PostgreSQL 的数据变更实时同步到 Kafka → OpenSearch / ClickHouse / 审计归档。
> **技术选型**: **Debezium 2.x** (开源 CDC 标准, Red Hat 维护)
> **权威规范**: `core/skills/data.md`

---

## 1. 架构总览

```
PostgreSQL (WAL)
    │
    ▼
Debezium Connector (Kafka Connect)
    │
    ▼
Apache Kafka
    ├── erp.cdc.products        → OpenSearch Sink Connector → 产品搜索
    ├── erp.cdc.inventory       → ClickHouse Sink → 库存分析
    ├── erp.cdc.audit_logs      → S3/MinIO Archiver → 合规归档
    └── erp.cdc.outbox.events   → Domain Event Router → 各 Consumer
```

---

## 2. Debezium Connector 配置

### 2.1 PostgreSQL Source Connector

```json
{
  "name": "erp-postgres-source",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "${PG_HOST}",
    "database.port": "5432",
    "database.user": "${PG_USER}",
    "database.password": "${PG_PASSWORD}",
    "database.dbname": "mgmt_erp",
    "database.server.name": "erp",
    "schema.include.list": "public",
    "table.include.list": "public.products,public.inventory_transactions,public.audit_logs,public.outbox_events",
    "plugin.name": "pgoutput",
    "slot.name": "debezium_erp",
    "publication.name": "dbz_publication",
    "topic.prefix": "erp.cdc",
    "snapshot.mode": "initial",
    "tombstones.on.delete": true,
    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "key.converter.schema.registry.url": "http://schema-registry:8081",
    "value.converter.schema.registry.url": "http://schema-registry:8081",
    "transforms": "route",
    "transforms.route.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.route.table.field.event.key": "aggregate_id",
    "transforms.route.table.field.event.type": "event_type",
    "transforms.route.table.fields.additional.placement": "aggregate_type:header"
  }
}
```

### 2.2 PostgreSQL 配置 (WAL)

```sql
-- postgresql.conf
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4

-- 创建 publication
CREATE PUBLICATION dbz_publication FOR TABLE
    products, inventory_transactions, audit_logs, outbox_events;
```

---

## 3. Transactional Outbox Pattern

**目的**: 保证数据库事务和领域事件的原子性 — 不会出现"事务提交了但事件没发"的情况。

### 3.1 Outbox 表设计

```sql
-- Flyway: V3__create_outbox_table.sql
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  VARCHAR(255) NOT NULL,     -- 'Product', 'PurchaseOrder', 'Employee'
    aggregate_id    UUID NOT NULL,             -- 聚合根 ID
    event_type      VARCHAR(255) NOT NULL,     -- 'PRODUCT_CREATED', 'PO_APPROVED'
    payload         JSONB NOT NULL,            -- 事件数据
    trace_id        VARCHAR(64),               -- OTel traceId
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ               -- Debezium 消费后标记 (可选)
);

CREATE INDEX idx_outbox_unsent ON outbox_events (created_at) WHERE sent_at IS NULL;
```

### 3.2 UseCase 中写入 Outbox

```kotlin
@Service
class CreateProductUseCase(
    private val productRepository: ProductRepository,
    private val outboxRepository: OutboxRepository,
    private val objectMapper: ObjectMapper,
) {
    @Transactional
    fun execute(cmd: CreateProductCommand): ProductResponse {
        // 1. 业务逻辑
        val product = Product.create(cmd)
        val saved = productRepository.save(product)

        // 2. 写入 Outbox (与业务操作在同一事务)
        outboxRepository.save(
            OutboxEvent(
                aggregateType = "Product",
                aggregateId = saved.id,
                eventType = "PRODUCT_CREATED",
                payload = objectMapper.writeValueAsString(ProductCreatedPayload(saved)),
                traceId = MDC.get("traceId"),
            )
        )

        return saved.toResponse()
    }
}
// Debezium 监听 outbox_events 表 → 发到 Kafka → 记录可后续清理
```

### 3.3 事件流转

```
Application → INSERT INTO outbox_events (同一事务) → COMMIT
                                                       ↓
Debezium CDC → 读取 WAL → 发到 Kafka (erp.cdc.outbox.events)
                                                       ↓
EventRouter Transform → 按 aggregate_type 路由到具体 topic
    ├── erp.domain.product.events
    ├── erp.domain.purchase.events
    └── erp.domain.inventory.events
```

---

## 4. Schema Registry (Avro)

**目的**: 事件 schema 的版本管理和兼容性验证。

| 配置 | 值 |
|------|-----|
| 技术 | Confluent Schema Registry (或 Apicurio) |
| 格式 | Avro (紧凑二进制, 支持 schema evolution) |
| 兼容策略 | `BACKWARD` (新 consumer 可读旧消息) |

```kotlin
// Avro schema 示例 (product_created.avsc)
{
  "type": "record",
  "name": "ProductCreated",
  "namespace": "com.mgmt.erp.events",
  "fields": [
    {"name": "id", "type": "string"},
    {"name": "sku", "type": "string"},
    {"name": "name", "type": "string"},
    {"name": "category", "type": ["null", "string"], "default": null},
    {"name": "cost", "type": {"type": "bytes", "logicalType": "decimal", "precision": 12, "scale": 5}},
    {"name": "timestamp", "type": {"type": "long", "logicalType": "timestamp-millis"}}
  ]
}
```

---

## 5. Sink Connectors

### 5.1 OpenSearch Sink

```json
{
  "name": "opensearch-products-sink",
  "config": {
    "connector.class": "io.aiven.kafka.connect.opensearch.OpensearchSinkConnector",
    "topics": "erp.cdc.public.products",
    "connection.url": "http://opensearch:9200",
    "type.name": "_doc",
    "key.ignore": false,
    "schema.ignore": false,
    "behavior.on.null.values": "delete",
    "transforms": "flatten",
    "transforms.flatten.type": "org.apache.kafka.connect.transforms.Flatten$Value"
  }
}
```

### 5.2 ClickHouse Sink

```json
{
  "name": "clickhouse-sales-sink",
  "config": {
    "connector.class": "com.clickhouse.kafka.connect.ClickHouseSinkConnector",
    "topics": "erp.cdc.public.sales_transactions",
    "hostname": "clickhouse",
    "port": "8123",
    "database": "erp_analytics",
    "table": "sales_facts",
    "exactlyOnce": true
  }
}
```

---

## 6. 初始快照策略

| 模式 | 用途 |
|------|------|
| `initial` | 首次启动: 全表快照 + 后续 WAL 增量 |
| `schema_only` | 只同步 schema, 不含历史数据 |
| `never` | 只读 WAL (适合已完成快照的重启) |
| `when_needed` | 自动判断是否需要快照 |

**建议**: 首次部署用 `initial`, 重启用 `when_needed`。

---

## 7. 与 V2 的关系

V2 没有 CDC — 所有数据同步通过应用层手动调用。V3 引入 Debezium 后:
- 零侵入: 不需要修改业务代码
- 实时性: WAL 级别变更 (ms 级延迟)
- 可靠性: Kafka offset 管理, 不丢数据

---

*Version: 1.0.0 — 2026-02-11*
