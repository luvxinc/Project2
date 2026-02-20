---
name: data
description: 数据架构师 SOP（OLTP + 缓存 + 事件 + 搜索 + OLAP）。Use when 需要数据建模、迁移、查询优化、ETL 或一致性治理。
---

# 数据层规范 — OLTP + 缓存 + 事件 + 搜索 + OLAP

> **你是数据架构师。你的职责是: 设计数据模型、选择存储方案、保障数据一致性和查询性能。**
> **技术栈**: 见 `CONTEXT.md §3 数据存储层`（数据库 / 缓存 / 消息队列 / 搜索引擎 / OLAP 引擎）

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `架构`, `总览`, `五层` | → §1 五层架构总览 |
| `数据库`, `schema`, `迁移`, `索引` | → §2 OLTP 数据库 |
| `缓存`, `session`, `分布式锁` | → §3 缓存层 |
| `事件`, `消息队列`, `topic`, `consumer` | → §4 事件流 |
| `全文搜索`, `搜索` | → §5 搜索引擎 |
| `报表`, `OLAP`, `分析` | → §6 OLAP |
| `一致性`, `事务`, `saga`, `幂等` | → §7 数据一致性 |

---

> **企业级五层数据架构: OLTP + Cache + Event + Search + OLAP。**

---

## 1. 五层数据架构

```
                    写入流                              读取流
                    ─────                              ─────
Application ──→ OLTP DB (事务)               OLTP DB  ← 事务查询
                    │                           Cache   ← 热点缓存
                    ├──→ Event Stream ──→     Search   ← 全文搜索
                    │         │               OLAP     ← 报表/分析
                    │         └──→ Log Store  ← 日志查询
                    │
                    └──→ Cache (回写)
```

| 层级 | 技术类型 | 数据类型 | 典型操作 |
|------|---------|----------|----------|
| **OLTP** | 关系型数据库 | 事务数据（订单/库存/财务） | CRUD, JOIN, Transaction |
| **Cache** | 内存缓存 | Session/权限/热点数据 | GET/SET, TTL, Pub/Sub |
| **Event** | 消息队列 | 领域事件流 | Produce/Consume, Topic |
| **Search** | 搜索引擎 | 全文搜索/日志 | Full-text, Aggregation |
| **OLAP** | 列式数据库 | 报表/分析数据 | SUM/GROUP BY 百万行 |

> **具体技术选型**: 见 `CONTEXT.md §3 数据存储层`

---

## 2. OLTP 数据库（唯一真相源）

### 2.1 Schema 规范

| 规则 | 要求 |
|------|------|
| **主键** | UUID v7 (时间有序) 或 自增 ID |
| **时间戳** | 带时区的时间戳, 存储 UTC |
| **货币** | DECIMAL(12,2) — 金额 |
| **费率/成本** | DECIMAL(12,5) — 精确到小数点后 5 位 |
| **枚举** | VARCHAR + CHECK 约束 (方便迁移，避免数据库 ENUM 类型) |
| **软删除** | `deleted_at TIMESTAMPTZ NULL` |
| **审计字段** | `created_at`, `updated_at`, `created_by`, `updated_by` |
| **索引** | 所有 lookup 字段 (FK, status, date, 业务键) 必须索引 |
| **外键** | 模块内使用外键, 模块间使用逻辑关联 (不跨模块 FK) |

### 2.2 数据库迁移

> **迁移工具**: 见 `CONTEXT.md §3 数据库`（Flyway / Liquibase / 其他）

```
db/migration/ 目录规范:
├── V1__create_{module}_tables.sql        # 按模块组织
├── V2__add_{feature}_to_{table}.sql      # 功能性修改
├── V3__create_{module}_indexes.sql       # 索引单独管理
└── VN__{description}.sql

命名规范:
  版本号 = VN（严格递增，禁止修改已执行的脚本）
  描述 = 小写 + 下划线，清晰说明变更内容

SQL 命名约定:
  表名: 小写 + 下划线 + 复数 (products, purchase_orders)
  索引名: idx_{table}_{columns}
  外键名: fk_{table}_{ref_table}
```

### 2.3 连接池配置

> **连接池框架**: 见 `CONTEXT.md §3`（HikariCP / pgbouncer / 其他）

```
连接池关键参数:
  最大连接数: 20（生产环境）
  最小空闲: 5
  连接超时: 30s
  连接最大存活: 30min
  泄漏检测阈值: 60s

连接数公式参考: (CPU核数 × 2) + 有效磁盘数
```

---

## 3. 缓存层（Session + 热数据 + 分布式锁）

### 3.1 用途分配

| 用途 | Key 格式 | TTL | 示例 |
|------|---------|-----|------|
| **Session** | `session:{sessionId}` | 30min | 登录状态 |
| **权限缓存** | `perm:{userId}` | 5min | 用户权限矩阵 |
| **业务缓存** | `cache:{module}:{key}` | 自定义 | 列表/配置数据 |
| **分布式锁** | `lock:{resource}` | 自动释放 | 防止并发重复提交 |
| **限流** | `ratelimit:{ip}` | 1min | API 限流计数 |
| **幂等键** | `idempotent:{key}` | 24h | 防重复操作 |

### 3.2 缓存操作模式

> **缓存框架**: 见 `CONTEXT.md §3 缓存层`（Redis / Memcached / 其他）

```
缓存读取模式 (Cache-Aside):
  1. 先读缓存: get(cache_key)
  2. 命中 → 反序列化返回
  3. 未命中 → 读数据库 → 写缓存（含 TTL）→ 返回

缓存失效策略:
  - 数据变更时主动失效 (invalidate)
  - TTL 到期自动失效
  - 禁止: 缓存与 DB 双写（容易不一致）

分布式锁:
  SETNX key value EX {timeout}
  只有获得锁的进程才能执行关键操作
  操作完成后立即释放锁
```

---

## 4. 事件流（领域事件驱动）

### 4.1 Topic 设计原则

> **消息队列**: 见 `CONTEXT.md §3 消息队列`（Kafka / RabbitMQ / 其他）

```
Topic 命名: {domain}.{module}.events
  示例: {app}.inventory.events, {app}.orders.events

分区策略:
  - 按业务键（如 order_id）分区 → 保证同一业务流的顺序
  - 分区数 ≥ 消费者实例数
  - 生产环境 replication factor ≥ 3

消费者组:
  每个下游服务使用独立的消费者组
  消费者组 ID: {service-name}-group
```

### 4.2 标准事件信封（Domain Event Envelope）

```json
{
  "eventId": "uuid-v4",
  "eventType": "{module}.{action}",
  "source": "{service-name}",
  "timestamp": "ISO-8601-UTC",
  "traceId": "otel-trace-id",
  "userId": "user-uuid",
  "payload": { "...": "业务数据（不含 PII，敏感字段通过 ID 引用）" }
}
```

### 4.3 生产者/消费者模式

> **消息框架**: 见 `CONTEXT.md §3 消息队列`，按当前框架实现。

```
生产者 (Producer):
  1. 业务操作完成后发布事件（同事务 或 Outbox 模式）
  2. 使用 eventId 作为消息 Key（保证顺序）
  3. 序列化为 JSON

消费者 (Consumer):
  1. 幂等检查: 已处理的 eventId 跳过
  2. 按 eventType 路由到对应处理逻辑
  3. 失败处理: 重试 3 次（指数退避）→ Dead Letter Queue → 人工处理
  4. 处理后提交 offset（At-least-once delivery）
```

---

## 5. 搜索引擎（全文搜索）

> **搜索引擎**: 见 `CONTEXT.md §3 搜索`（OpenSearch / Elasticsearch / MeiliSearch 等）

### 5.1 索引设计

| 索引 | 数据源 | 用途 | 刷新频率 |
|------|--------|------|----------|
| `{module}` | 数据库 → 事件流 | 模块实体全文搜索 | 实时 (<1s) |
| `audit_logs` | 事件流 | 审计日志查询 | 实时 |

### 5.2 搜索查询模式

```
多字段搜索 (Multi-Match):
  fields: [{field1}^3, {field2}^2, {field3}]  // 权重递减
  fuzziness: AUTO                              // 容错搜索
  from: page * size
  size: pageSize

聚合查询:
  terms aggregation → 分类统计
  date_histogram → 时间维度分析
```

---

## 6. OLAP / 报表分析

> **OLAP 引擎**: 见 `CONTEXT.md §3 分析层`（ClickHouse / BigQuery / Redshift 等）

### 6.1 同步策略

```
OLTP DB → 事件流 → OLAP Engine → 分析表
```

### 6.2 适用场景

| 场景 | 数据量 | 为什么需要 OLAP |
|------|--------|-----------------|
| 月度汇总报表 | 百万行 | OLTP 全表扫描慢 (30s+) → OLAP 列式秒级 |
| 多维度分析 | 百万行 | OLTP 临时聚合锁竞争 → OLAP 无锁并行 |
| 时间窗口计算 | 十万行 | OLTP 临时表开销大 → OLAP 物化视图 |
| 财务对账 | 百万行 | OLTP 全表锁 → OLAP 无锁 |

### 6.3 OLAP 表设计原则

```sql
-- 通用 OLAP 宽表模式（伪 SQL，具体语法见 CONTEXT.md §3）
CREATE TABLE {module}_analytics (
    id             UUID,
    date_field     DATE,
    dimension_1    STRING,   -- 分组维度（如 SKU、区域、渠道）
    dimension_2    STRING,
    metric_1       DECIMAL,  -- 度量（金额、数量）
    metric_2       DECIMAL,
    created_at     DATETIME
)
-- 分区: 按日期（月或日）
-- 排序: 按最常用的查询维度
-- TTL: 按数据保留策略（如 5 年）
```

---

## 7. 数据一致性保障

### 7.1 事务模式

| 场景 | 方案 | 示例 |
|------|------|------|
| **同模块 CRUD** | 数据库事务 (`@Transactional`) | 创建主记录 + 从记录 |
| **跨模块同步** | 事件流 + 最终一致性 | 操作 → 下游消费 |
| **Saga 模式** | 编排引擎（Temporal 等） | 多步审批流程 |
| **幂等性** | 缓存 Idempotency Key | 防止重复提交 |
| **分布式锁** | 缓存 SETNX | 并发控制 |

### 7.2 失败处理

```
消费者失败 → 重试 N 次（指数退避）→ Dead Letter Queue → 人工处理 + 告警
数据库事务失败 → 回滚 → 返回错误 → 上层重试或报错
```

---

---

*Version: 2.0.0 — L1 泛化*
*Updated: 2026-02-19*
