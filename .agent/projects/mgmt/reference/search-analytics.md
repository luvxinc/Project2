---
description: OpenSearch + ClickHouse — 搜索 + OLAP 分析
---

# 搜索与分析

> **引入时机**: V3 Phase 2+。OpenSearch 用于全文搜索, ClickHouse 用于百万行报表聚合。
> **权威规范**: `core/skills/data.md`

---

## OpenSearch (全文搜索)

### 场景

| 索引 | 数据来源 | 搜索场景 |
|------|----------|----------|
| `products` | PG products 表 | SKU/名称模糊搜索, 分面过滤 |
| `purchase_orders` | PG + V1 迁移数据 | PO号/供应商/日期范围搜索 |
| `audit_logs` | PG audit_logs | traceId/用户/模块/操作搜索 |
| `vma_inventory` | PG vma_inventory_transactions | 序列号/规格型号/批次搜索 |

### 同步方式

```
PostgreSQL → Kafka (CDC 或应用层事件) → OpenSearch Sink Connector
```

### 索引映射示例

```json
{
  "mappings": {
    "properties": {
      "sku": { "type": "keyword" },
      "name": { "type": "text", "analyzer": "icu_analyzer" },
      "category": { "type": "keyword" },
      "cost": { "type": "scaled_float", "scaling_factor": 100 },
      "status": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}
```

### Kotlin 搜索

```kotlin
@Service
class ProductSearchService(private val client: OpenSearchClient) {
    fun search(query: String, filters: Map<String, String>): SearchResult<Product> {
        val boolQuery = BoolQuery.of { b ->
            b.must(MultiMatchQuery.of { m ->
                m.query(query).fields("sku^3", "name^2", "category")
            }._toQuery())
            filters.forEach { (k, v) -> b.filter(TermQuery.of { t -> t.field(k).value(v) }._toQuery()) }
        }
        // ...
    }
}
```

---

## ClickHouse (OLAP 分析)

### 场景

| 报表 | 数据规模 | 计算 |
|------|----------|------|
| 月度销售汇总 | 百万行 Transaction | SUM(amount) GROUP BY month, category |
| SKU 成本分析 | 全部 SKU × 时间 | FIFO 成本分层, 平均成本 |
| 库存周转率 | 库存 × 销售 | 周转天数, 呆滞库存识别 |
| 采购分析 | 全部 PO | 供应商绩效, 交货准时率 |

### 同步

```
PostgreSQL → Kafka → ClickHouse Kafka Engine → Materialized View → 聚合表
```

### 表设计

```sql
-- ClickHouse (ReplacingMergeTree)
CREATE TABLE erp.sales_facts (
    date Date,
    sku LowCardinality(String),
    category LowCardinality(String),
    quantity UInt32,
    revenue Decimal64(2),
    cost Decimal64(2),
    profit Decimal64(2)
) ENGINE = ReplacingMergeTree()
ORDER BY (date, sku);
```

### 与 V2 的关系

V2 没有 ClickHouse。V2 的报表通过 Prisma 直接查 PG (小数据量可以)。
V3 引入 ClickHouse 是为了:
- V1 ETL 模块 (49KB views.py) 中的复杂聚合逻辑
- 百万行 eBay 销售数据分析
- FIFO 成本重算 (目前 V2 在 Node.js 内存中算, 大数据量会 OOM)
