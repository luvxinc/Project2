# V3 Inventory Module — 完整迁移任务书

> **模块**: `modules/inventory/`
> **迁移阶段**: Phase 3 (辅助模块迁移)
> **复杂度**: ★★★★ (含 FIFO 引擎 + Spring Batch ETL)
> **前置依赖**: Phase 1 完成 (Auth, Users, Products, VMA, Logs 已迁移)
> **关联参考**:
>   - `reference/v3-architecture.md` (DDD 分层、技术栈)
>   - `reference/v1-deep-dive.md` (V1 MySQL 表结构)
>   - `reference/migration.md` (迁移五阶段)
>   - `reference/business-rules.md` (FIFO 铁律)
>   - KI: `mgmt_erp_inventory` (V1 FIFO/动态库存深度审计)

---

## 0. 执行摘要

Inventory 模块是 MGMT ERP 最高价值/最高风险的模块之一:

| 维度 | 现状 (V1+V2) | V3 目标 |
|------|-------------|---------|
| **FIFO 引擎** | V1 Python Pandas + raw SQL, 逐行处理 | Kotlin Domain Service, 事务原子性 |
| **动态库存** | V1 `dynamic_inv.py` 拼 DataFrame, 400 行 | V3 CQRS 读模型, 缓存热数据 |
| **盘点上传** | V1 Django Wizard (HTMX), CSV 逐行 | Spring Batch + 进度推送 |
| **编辑向导** | V1 Django Wizard (HTMX), 多步表单 | Next.js 向导组件 (V2 保留) |
| **性能** | 全量重算, 秒级等待 | 增量更新 + 物化视图 + Redis 缓存 |
| **审计** | 几乎无 | 完整事件溯源, append-only 审计日志 |

### 核心原则

1. **FIFO 原子性不可妥协** — 参见 `business-rules.md` FIFO-001 ~ FIFO-004
2. **动态库存是派生数据** — 不存储, 实时计算 (或 materialized view 缓存)
3. **前端零 break** — V3 后端通过 OpenAPI 契约保证 V2 前端无感迁移
4. **逐步迁移** — 先 Core Domain → 再 FIFO → 再 Dynamic → 最后 Upload/Edit

---

## 1. V1/V2 现状分析

### 1.1 数据源 (V1 MySQL 表)

来源: `reference/v1-deep-dive.md` §2.1

| 表名 | 用途 | V3 映射 |
|------|------|---------|
| `in_dynamic_fifo_layers` | FIFO 入库层 (每批入库一行) | `inventory.fifo_layers` |
| `in_dynamic_fifo_alloc` | FIFO 出库分配 (消耗记录) | `inventory.fifo_allocations` |
| `in_dynamic_fifo_transactions` | FIFO 流水 (每笔出入库事件) | `inventory.fifo_transactions` |
| `Data_COGS` | 产品主数据 + 成本 | → `products` 模块 (跨模块查询) |
| `Data_inventory` | 盘点历史 | `inventory.stocktakes` |
| `Data_Transaction` | 销售流水 | → `sales` 模块 (跨模块事件) |
| `in_po_final` / `in_receive_final` | 采购/入库终态 | → `purchase` 模块 |

### 1.2 V1 核心文件 (Backend)

| 文件 | 行数 | 职责 |
|------|------|------|
| `views/dynamic_inv.py` | 346 | 动态库存 API — 拼接 9 列计算结果 |
| `views/stocktake_upload.py` | ~500 | 盘点 CSV 上传/解析/保存 |
| `views/inventory_edit.py` | ~400 | 库存编辑向导 (多步修改) |
| `services/fifo_engine.py` | ~600 | FIFO 分配引擎 (核心成本逻辑) |
| `services/fifo_sync.py` | ~300 | FIFO 同步 (与 Sales ETL 联动) |

### 1.3 V1 核心模板 (Frontend)

| 模板 | 行数 | 功能 |
|------|------|------|
| `pages/overview.html` | 1168 | 动态库存一览 (表格 + 筛选) |
| `pages/upload.html` | 1168 | 盘点上传向导 (3步: 上传→预览→确认) |
| `pages/edit.html` | 846 | 库存编辑向导 (SKU 选择→修改→提交) |

### 1.4 V1 动态库存计算逻辑 (9 列)

来源: KI `dynamic_inventory_specs.md`

| # | UI 列名 | API 字段 | 计算逻辑 | 数据源 |
|---|---------|---------|----------|--------|
| 1 | SKU | `sku` | 基础 SKU 编码 | `Data_COGS` |
| 2 | 实际库存 | `actual_qty` | target_date 之前最近一次盘点 | `Data_inventory` |
| 3 | 入库 | `received_qty` | 盘点日~目标日的 PO 入库合计 | `in_receive_final` |
| 4 | 出库 | `sold_qty` | 同期销售出库合计 | `Data_Transaction` |
| 5 | 理论库存 | `theoretical_qty` | `actual_qty + received_qty - sold_qty` | 计算派生 |
| 6 | FIFO 成本 | `fifo_unit_cost` | 加权 FIFO 层成本 (remaining > 0) | `fifo_layers` |
| 7 | 总成本 | `total_cost` | `theoretical_qty × fifo_unit_cost` | 计算派生 |
| 8 | 最近入库日 | `last_receive_date` | 该 SKU 最近一次入库日期 | `in_receive_final` |
| 9 | 最近盘点日 | `last_stocktake_date` | 该 SKU 最近一次盘点日期 | `Data_inventory` |

### 1.5 V1 FIFO 引擎逻辑

来源: KI `fifo_logic.md`

```
入库 → 创建 Layer:
  layer_id = auto_increment
  sku, qty_in, qty_remaining = qty_in, unit_cost, po_num

出库 (FIFO 消费) → 创建 Allocation:
  1. 按 layer_id ASC 排序 (先进先出)
  2. 逐层消耗直至满足出库数量
  3. 每消耗一层: qty_remaining -= consumed
  4. 生成 allocation 记录 (layer_id, qty_consumed, unit_cost)

⚠️ 原子性要求:
  - Transaction + Allocation 必须同一事务
  - Layer.qty_remaining 不得 < 0
  - INIT-* / INT-* 层禁止删除
```

---

## 2. V3 目标架构

### 2.1 DDD 模块结构

遵循 `v3-architecture.md` §6 的强制分层:

```
modules/inventory/
├── domain/                         # 领域层 (零框架依赖)
│   ├── model/
│   │   ├── FifoLayer.kt            # 聚合根 — FIFO 入库层
│   │   ├── FifoAllocation.kt       # 实体 — 出库分配记录
│   │   ├── FifoTransaction.kt      # 实体 — 流水记录
│   │   ├── Stocktake.kt            # 聚合根 — 盘点记录
│   │   ├── StocktakeItem.kt        # 实体 — 盘点明细行
│   │   ├── SkuInventory.kt         # 值对象 — SKU 实时库存快照
│   │   └── Money.kt                # 值对象 — 金额 (DECIMAL(12,5))
│   ├── event/
│   │   ├── InventoryEvents.kt      # 领域事件定义
│   │   │   ├── StocktakeCompleted
│   │   │   ├── FifoLayerCreated
│   │   │   ├── FifoConsumed
│   │   │   └── InventoryAdjusted
│   ├── service/
│   │   ├── FifoEngine.kt           # 🔥 核心 — FIFO 分配算法 (纯函数)
│   │   └── InventoryCalculator.kt  # 动态库存 9 列计算 (纯函数)
│   └── repository/
│       ├── FifoLayerRepository.kt   # 接口
│       ├── FifoAllocationRepository.kt
│       ├── FifoTransactionRepository.kt
│       └── StocktakeRepository.kt
│
├── application/                     # 应用层 (用例编排)
│   ├── usecase/
│   │   ├── CreateStocktakeUseCase.kt     # 盘点上传 (Spring Batch)
│   │   ├── EditInventoryUseCase.kt       # 库存编辑向导
│   │   ├── GetDynamicInventoryUseCase.kt # 动态库存一览 (CQRS 读)
│   │   ├── CreateFifoLayerUseCase.kt     # 入库创建层
│   │   ├── ConsumeFifoUseCase.kt         # 出库 FIFO 分配
│   │   └── SyncFifoUseCase.kt            # FIFO 同步 (与 Sales ETL)
│   ├── command/
│   │   ├── CreateStocktakeCommand.kt
│   │   ├── EditInventoryCommand.kt
│   │   └── ConsumeFifoCommand.kt
│   ├── query/
│   │   ├── DynamicInventoryQuery.kt      # 筛选参数 VO
│   │   └── FifoLayerQuery.kt
│   └── dto/
│       ├── DynamicInventoryResponse.kt   # 9 列输出
│       ├── StocktakeRequest.kt
│       ├── StocktakeResponse.kt
│       ├── FifoLayerResponse.kt
│       └── InventoryEditRequest.kt
│
├── infrastructure/                  # 基础设施层
│   ├── persistence/
│   │   ├── FifoLayerJpaEntity.kt
│   │   ├── FifoLayerJpaRepository.kt
│   │   ├── FifoAllocationJpaEntity.kt
│   │   ├── FifoAllocationJpaRepository.kt
│   │   ├── FifoTransactionJpaEntity.kt
│   │   ├── FifoTransactionJpaRepository.kt
│   │   ├── StocktakeJpaEntity.kt
│   │   └── StocktakeJpaRepository.kt
│   ├── batch/                       # Spring Batch
│   │   ├── StocktakeUploadJobConfig.kt   # CSV 上传批处理
│   │   └── FifoRecalcJobConfig.kt        # FIFO 全量重算 Job
│   ├── messaging/
│   │   ├── InventoryEventPublisher.kt    # Kafka Producer
│   │   ├── PurchaseEventConsumer.kt      # 监听: 入库完成 → 创建 Layer
│   │   └── SalesEventConsumer.kt         # 监听: 销售完成 → 消耗 FIFO
│   ├── cache/
│   │   ├── DynamicInventoryCache.kt      # Redis 缓存动态库存
│   │   └── FifoLayerCache.kt             # Caffeine L1 缓存热层
│   └── search/
│       └── InventorySearchAdapter.kt     # OpenSearch 全文搜SKU
│
├── api/
│   ├── InventoryController.kt            # REST API
│   ├── FifoController.kt                 # FIFO 管理 API (admin)
│   └── InventoryMapper.kt                # DTO ↔ Domain 映射
│
└── InventoryModule.kt                    # Spring Modulith 声明
```

### 2.2 数据库设计 (Flyway 迁移)

#### 表 1: `inventory.fifo_layers`

```sql
-- V3_INV_001__create_fifo_layers.sql
CREATE TABLE inventory.fifo_layers (
    layer_id        BIGSERIAL PRIMARY KEY,
    sku             VARCHAR(50)    NOT NULL,
    qty_in          INT            NOT NULL CHECK (qty_in > 0),
    qty_remaining   INT            NOT NULL CHECK (qty_remaining >= 0),
    unit_cost       DECIMAL(12,5)  NOT NULL,
    po_num          VARCHAR(30),              -- NULL = INIT/manual
    layer_type      VARCHAR(10)    NOT NULL DEFAULT 'PO',
                                              -- PO | INIT | ADJUST
    receive_date    DATE           NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_by      BIGINT         NOT NULL REFERENCES users.users(id),
    version         INT            NOT NULL DEFAULT 0,  -- Optimistic Lock

    CONSTRAINT chk_remaining_le_in CHECK (qty_remaining <= qty_in)
);

CREATE INDEX idx_fifo_layers_sku ON inventory.fifo_layers(sku);
CREATE INDEX idx_fifo_layers_sku_remaining
    ON inventory.fifo_layers(sku, qty_remaining)
    WHERE qty_remaining > 0;  -- Partial index: 只索引未耗尽层
CREATE INDEX idx_fifo_layers_po ON inventory.fifo_layers(po_num);
```

#### 表 2: `inventory.fifo_allocations`

```sql
-- V3_INV_002__create_fifo_allocations.sql
CREATE TABLE inventory.fifo_allocations (
    allocation_id   BIGSERIAL PRIMARY KEY,
    layer_id        BIGINT         NOT NULL REFERENCES inventory.fifo_layers(layer_id),
    transaction_id  BIGINT         NOT NULL REFERENCES inventory.fifo_transactions(txn_id),
    sku             VARCHAR(50)    NOT NULL,
    qty_consumed    INT            NOT NULL CHECK (qty_consumed > 0),
    unit_cost       DECIMAL(12,5)  NOT NULL,  -- 快照: 消耗时刻的层成本
    allocated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_alloc_layer_txn UNIQUE (layer_id, transaction_id)
);

CREATE INDEX idx_alloc_layer ON inventory.fifo_allocations(layer_id);
CREATE INDEX idx_alloc_txn ON inventory.fifo_allocations(transaction_id);
CREATE INDEX idx_alloc_sku ON inventory.fifo_allocations(sku);
```

#### 表 3: `inventory.fifo_transactions`

```sql
-- V3_INV_003__create_fifo_transactions.sql
CREATE TABLE inventory.fifo_transactions (
    txn_id          BIGSERIAL PRIMARY KEY,
    sku             VARCHAR(50)    NOT NULL,
    txn_type        VARCHAR(10)    NOT NULL,   -- IN | OUT | ADJUST
    quantity        INT            NOT NULL,
    reference_type  VARCHAR(20),               -- PO | SALE | STOCKTAKE | MANUAL
    reference_id    VARCHAR(50),               -- PO号 / 销售单号 / 盘点ID
    txn_date        DATE           NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_by      BIGINT         NOT NULL REFERENCES users.users(id),
    idempotency_key VARCHAR(64)    UNIQUE       -- 幂等防重
);

CREATE INDEX idx_fifo_txn_sku ON inventory.fifo_transactions(sku);
CREATE INDEX idx_fifo_txn_date ON inventory.fifo_transactions(txn_date);
CREATE INDEX idx_fifo_txn_ref ON inventory.fifo_transactions(reference_type, reference_id);
```

#### 表 4: `inventory.stocktakes`

```sql
-- V3_INV_004__create_stocktakes.sql
CREATE TABLE inventory.stocktakes (
    stocktake_id    BIGSERIAL PRIMARY KEY,
    stocktake_date  DATE           NOT NULL,
    uploaded_file   VARCHAR(255),              -- MinIO 路径
    status          VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
                                              -- PENDING | APPROVED | REJECTED
    note            TEXT,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_by      BIGINT         NOT NULL REFERENCES users.users(id),
    approved_at     TIMESTAMPTZ,
    approved_by     BIGINT         REFERENCES users.users(id)
);
```

#### 表 5: `inventory.stocktake_items`

```sql
-- V3_INV_005__create_stocktake_items.sql
CREATE TABLE inventory.stocktake_items (
    item_id         BIGSERIAL PRIMARY KEY,
    stocktake_id    BIGINT         NOT NULL REFERENCES inventory.stocktakes(stocktake_id),
    sku             VARCHAR(50)    NOT NULL,
    counted_qty     INT            NOT NULL,
    system_qty      INT,                       -- 盘点时的系统理论值 (快照)
    variance        INT GENERATED ALWAYS AS (counted_qty - COALESCE(system_qty, 0)) STORED,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_stocktake_sku UNIQUE (stocktake_id, sku)
);

CREATE INDEX idx_stocktake_items_sku ON inventory.stocktake_items(sku);
```

#### 物化视图: 动态库存

```sql
-- V3_INV_010__create_mv_dynamic_inventory.sql
CREATE MATERIALIZED VIEW inventory.mv_dynamic_inventory AS
SELECT
    p.sku,
    p.product_name,
    -- Col 2: 实际库存 (最近盘点)
    latest_st.counted_qty AS actual_qty,
    latest_st.stocktake_date AS last_stocktake_date,
    -- Col 3: 入库 (盘点日~今)
    COALESCE(recv.received_qty, 0) AS received_qty,
    -- Col 4: 出库 (盘点日~今)
    COALESCE(sold.sold_qty, 0) AS sold_qty,
    -- Col 5: 理论库存
    latest_st.counted_qty + COALESCE(recv.received_qty, 0) - COALESCE(sold.sold_qty, 0) AS theoretical_qty,
    -- Col 6: FIFO 加权单位成本
    fifo.weighted_unit_cost AS fifo_unit_cost,
    -- Col 7: 总成本
    (latest_st.counted_qty + COALESCE(recv.received_qty, 0) - COALESCE(sold.sold_qty, 0))
        * fifo.weighted_unit_cost AS total_cost,
    -- Col 8: 最近入库日
    recv.last_receive_date,
    -- 刷新时间戳
    NOW() AS refreshed_at
FROM products.products p
LEFT JOIN LATERAL (
    -- 最近盘点
    SELECT si.counted_qty, s.stocktake_date
    FROM inventory.stocktake_items si
    JOIN inventory.stocktakes s ON si.stocktake_id = s.stocktake_id
    WHERE si.sku = p.sku AND s.status = 'APPROVED'
    ORDER BY s.stocktake_date DESC
    LIMIT 1
) latest_st ON TRUE
LEFT JOIN LATERAL (
    -- 入库合计 (盘点日之后)
    SELECT SUM(ft.quantity) AS received_qty,
           MAX(ft.txn_date) AS last_receive_date
    FROM inventory.fifo_transactions ft
    WHERE ft.sku = p.sku
      AND ft.txn_type = 'IN'
      AND ft.txn_date > COALESCE(latest_st.stocktake_date, '1970-01-01')
) recv ON TRUE
LEFT JOIN LATERAL (
    -- 出库合计 (盘点日之后)
    SELECT SUM(ABS(ft.quantity)) AS sold_qty
    FROM inventory.fifo_transactions ft
    WHERE ft.sku = p.sku
      AND ft.txn_type = 'OUT'
      AND ft.txn_date > COALESCE(latest_st.stocktake_date, '1970-01-01')
) sold ON TRUE
LEFT JOIN LATERAL (
    -- FIFO 加权成本 (remaining > 0 的层)
    SELECT CASE WHEN SUM(fl.qty_remaining) > 0
                THEN SUM(fl.qty_remaining * fl.unit_cost) / SUM(fl.qty_remaining)
                ELSE 0
           END AS weighted_unit_cost
    FROM inventory.fifo_layers fl
    WHERE fl.sku = p.sku AND fl.qty_remaining > 0
) fifo ON TRUE;

CREATE UNIQUE INDEX idx_mv_dynamic_inv_sku ON inventory.mv_dynamic_inventory(sku);

-- 刷新策略: 由 Kafka Consumer 触发或定时 Cron 刷新
-- REFRESH MATERIALIZED VIEW CONCURRENTLY inventory.mv_dynamic_inventory;
```

### 2.3 API 设计 (OpenAPI 契约)

#### 动态库存一览

```yaml
GET /api/v1/inventory/dynamic
parameters:
  - name: target_date
    in: query
    schema: { type: string, format: date }
    description: 截止日期 (默认=今天, PST)
  - name: sku
    in: query
    schema: { type: string }
    description: SKU 筛选 (模糊匹配)
  - name: page
    in: query
    schema: { type: integer, default: 0 }
  - name: size
    in: query
    schema: { type: integer, default: 50 }
  - name: sort
    in: query
    schema: { type: string, default: "sku,asc" }
responses:
  200:
    content:
      application/json:
        schema:
          type: object
          properties:
            items:
              type: array
              items:
                $ref: '#/components/schemas/DynamicInventoryRow'
            totalItems: { type: integer }
            page: { type: integer }
            size: { type: integer }
```

#### FIFO 层查询

```yaml
GET /api/v1/inventory/fifo/layers
parameters:
  - name: sku
    in: query
    required: true
    schema: { type: string }
  - name: include_exhausted
    in: query
    schema: { type: boolean, default: false }
responses:
  200:
    content:
      application/json:
        schema:
          type: array
          items:
            $ref: '#/components/schemas/FifoLayerResponse'
```

#### 盘点上传

```yaml
POST /api/v1/inventory/stocktakes/upload
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          file: { type: string, format: binary }
          stocktake_date: { type: string, format: date }
          note: { type: string }
responses:
  202:
    description: Accepted — 异步处理, 返回 Job ID
    content:
      application/json:
        schema:
          type: object
          properties:
            jobId: { type: string }
            status: { type: string, enum: [QUEUED] }
```

#### 盘点确认/拒绝

```yaml
POST /api/v1/inventory/stocktakes/{id}/approve
POST /api/v1/inventory/stocktakes/{id}/reject
```

#### 库存编辑

```yaml
PUT /api/v1/inventory/adjustments
requestBody:
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/InventoryEditRequest'
security:
  - bearerAuth: []
  - securityLevel: L2  # 需要密码确认
```

---

## 3. 核心算法 V3 实现

### 3.1 FIFO 引擎 (Domain Service — 纯函数)

```kotlin
// domain/service/FifoEngine.kt
// ⚠️ 这是核心域逻辑, 零框架依赖

class FifoEngine {

    /**
     * FIFO 消耗算法
     * @param layers 可用层 (按 layer_id ASC 排序, qty_remaining > 0)
     * @param quantityToConsume 需要消耗的数量
     * @return 分配结果列表
     * @throws InsufficientInventoryException 库存不足
     */
    fun allocate(
        layers: List<FifoLayer>,
        quantityToConsume: Int
    ): List<FifoAllocation> {
        require(quantityToConsume > 0) { "消耗数量必须 > 0" }

        val allocations = mutableListOf<FifoAllocation>()
        var remaining = quantityToConsume

        for (layer in layers) {
            if (remaining <= 0) break

            val consumed = minOf(remaining, layer.qtyRemaining)
            layer.consume(consumed)  // 领域方法: 减少 qtyRemaining

            allocations.add(
                FifoAllocation(
                    layerId = layer.layerId,
                    qtyConsumed = consumed,
                    unitCost = layer.unitCost  // 快照成本
                )
            )
            remaining -= consumed
        }

        if (remaining > 0) {
            throw InsufficientInventoryException(
                "FIFO 库存不足: 需要 $quantityToConsume, 可用 ${quantityToConsume - remaining}"
            )
        }

        return allocations
    }
}
```

### 3.2 动态库存计算器 (Domain Service)

```kotlin
// domain/service/InventoryCalculator.kt

class InventoryCalculator {

    /**
     * 计算单个 SKU 的动态库存快照
     * 完全对标 V1 dynamic_inv.py 的 9 列逻辑
     */
    fun calculate(
        sku: String,
        latestStocktake: StocktakeSnapshot?,      // 最近盘点
        receivedSinceStocktake: Int,               // 盘点后入库合计
        soldSinceStocktake: Int,                   // 盘点后出库合计
        activeFifoLayers: List<FifoLayer>,         // remaining > 0
        lastReceiveDate: LocalDate?,
    ): SkuInventory {
        val actualQty = latestStocktake?.countedQty ?: 0
        val theoreticalQty = actualQty + receivedSinceStocktake - soldSinceStocktake

        val fifoUnitCost = if (activeFifoLayers.isNotEmpty()) {
            val totalCost = activeFifoLayers.sumOf {
                it.qtyRemaining.toBigDecimal() * it.unitCost
            }
            val totalQty = activeFifoLayers.sumOf { it.qtyRemaining }
            if (totalQty > 0) totalCost / totalQty.toBigDecimal()
            else BigDecimal.ZERO
        } else BigDecimal.ZERO

        return SkuInventory(
            sku = sku,
            actualQty = actualQty,
            receivedQty = receivedSinceStocktake,
            soldQty = soldSinceStocktake,
            theoreticalQty = theoreticalQty,
            fifoUnitCost = fifoUnitCost,
            totalCost = theoreticalQty.toBigDecimal() * fifoUnitCost,
            lastReceiveDate = lastReceiveDate,
            lastStocktakeDate = latestStocktake?.stocktakeDate
        )
    }
}
```

### 3.3 Spring Batch — 盘点上传 Job

```kotlin
// infrastructure/batch/StocktakeUploadJobConfig.kt

@Configuration
class StocktakeUploadJobConfig(
    private val jobRepository: JobRepository,
    private val transactionManager: PlatformTransactionManager,
) {
    @Bean
    fun stocktakeUploadJob(): Job = JobBuilder("stocktakeUpload", jobRepository)
        .start(parseStep())
        .next(validateStep())
        .next(persistStep())
        .listener(progressListener())  // WebSocket/SSE 进度推送
        .build()

    @Bean
    fun parseStep(): Step = StepBuilder("parse", jobRepository)
        .chunk<CsvStocktakeRow, StocktakeItem>(100, transactionManager)
        .reader(csvReader())         // FlatFileItemReader
        .processor(rowProcessor())   // 校验 SKU 存在性 + 数值合法性
        .writer(itemWriter())        // batch insert
        .faultTolerant()
        .skipLimit(10)
        .skip(FlatFileParseException::class.java)
        .build()
}
```

---

## 4. 事件驱动集成

### 4.1 跨模块事件流

```
Purchase 模块                 Inventory 模块                 Sales 模块
─────────────                ─────────────────              ──────────
PO 入库完成                  ┌─────────────────┐            销售完成
  │                          │                 │              │
  ├─→ ReceiveCompletedEvent  │  Kafka Consumer │ SalesCompletedEvent ←─┤
  │   (sku, qty, cost, po)   │       ↓         │   (sku, qty, sale_id) │
  │                          │ CreateFifoLayer  │       ↓               │
  │                          │ UseCase          │ ConsumeFifo           │
  │                          │       ↓         │ UseCase               │
  │                          │ FifoLayerCreated │       ↓               │
  │                          │ Event            │ FifoConsumed          │
  │                          │       ↓         │ Event                 │
  │                          │ Refresh MV Cache │       ↓               │
  │                          │ (Redis invalidate)│ Refresh MV Cache     │
  │                          └─────────────────┘                        │
```

### 4.2 Kafka Topics

| Topic | Producer | Consumer | Schema |
|-------|----------|----------|--------|
| `erp.purchase.receive-completed` | Purchase 模块 | Inventory | `ReceiveCompletedEvent` |
| `erp.sales.completed` | Sales 模块 | Inventory | `SalesCompletedEvent` |
| `erp.inventory.fifo-layer-created` | Inventory | Finance, Analytics | `FifoLayerCreatedEvent` |
| `erp.inventory.fifo-consumed` | Inventory | Finance, Analytics | `FifoConsumedEvent` |
| `erp.inventory.stocktake-completed` | Inventory | Analytics | `StocktakeCompletedEvent` |

---

## 5. 缓存策略

### 5.1 三级缓存

| 级别 | 技术 | 数据 | TTL | 失效策略 |
|------|------|------|-----|----------|
| **L1** | Caffeine (进程内) | 活跃 FIFO 层 (top 100 SKU) | 5 min | 写入时失效 |
| **L2** | Redis | 动态库存结果集 | 15 min | Kafka 事件触发失效 |
| **L3** | PostgreSQL MV | 动态库存物化视图 | 手动 REFRESH | `CONCURRENTLY` 刷新 |

### 5.2 缓存 Key 设计

```
inv:dynamic:{hash(target_date+filters)}   → JSON (分页结果)
inv:fifo:layers:{sku}                      → List<FifoLayer> (active)
inv:fifo:cost:{sku}                        → BigDecimal (加权成本)
inv:stocktake:latest:{sku}                 → StocktakeSnapshot
```

---

## 6. 数据迁移

### 6.1 V1 MySQL → V3 PostgreSQL 迁移脚本

```
Migration Order:
  1. fifo_layers       (244 INIT + 107 PO = 351 total) ← 来源: in_dynamic_fifo_layers
  2. fifo_transactions ← 来源: in_dynamic_fifo_transactions
  3. fifo_allocations  ← 来源: in_dynamic_fifo_alloc
  4. stocktakes        ← 来源: Data_inventory (需要 reshape)
  5. stocktake_items   ← 来源: Data_inventory (需要 pivot)
```

### 6.2 迁移校验 (Triple-Audit)

| 校验 | V1 基准 | V3 验证 SQL |
|------|---------|-------------|
| FIFO 层总数 | 351 | `SELECT COUNT(*) FROM inventory.fifo_layers` |
| INIT 层数 | 244 | `SELECT COUNT(*) FROM inventory.fifo_layers WHERE layer_type = 'INIT'` |
| 总 remaining | ∑ V1 | `SELECT SUM(qty_remaining) FROM inventory.fifo_layers` |
| 每 SKU 成本一致性 | V1 计算 | 对比 V1 和 V3 的动态库存前 50 SKU |

### 6.3 关键约束 (来源: migration.md §8)

| 约束 ID | 描述 | V3 实现方式 |
|---------|------|-------------|
| **FIFO-001** | 流水创建和分配写入必须在同一事务中 | `@Transactional` on `ConsumeFifoUseCase` |
| **FIFO-002** | FIFO 分配异常必须抛出, 禁止静默空结果 | `InsufficientInventoryException` |
| **FIFO-003** | transactions 与 allocations 必须同步审计 | `InventoryEvents.FifoConsumed` 发出到审计 |
| **FIFO-004** | INIT-*/INT-* 层禁止删除 | DB CHECK + Domain Guard |

---

## 7. 测试计划

### 7.1 单元测试 (MockK)

| 测试类 | 覆盖范围 | 断言重点 |
|--------|----------|----------|
| `FifoEngineTest` | FIFO 分配算法 | 消耗顺序/不足异常/边界 |
| `InventoryCalculatorTest` | 9 列计算 | 与 V1 数值对齐 |
| `ConsumeFifoUseCaseTest` | 事务编排 | 幂等性/异常回滚 |
| `CreateStocktakeUseCaseTest` | 盘点创建 | 审批流/重复上传拒绝 |

### 7.2 集成测试 (Testcontainers)

| 测试类 | 环境 | 验证 |
|--------|------|------|
| `FifoLayerRepositoryIT` | PG Testcontainer | CRUD + 乐观锁 |
| `StocktakeUploadIT` | PG + MinIO | CSV → DB 全流程 |
| `DynamicInventoryIT` | PG (含种子数据) | 9 列计算 vs V1 基准 |
| `KafkaIntegrationIT` | Kafka Testcontainer | 事件发布/消费 |

### 7.3 契约测试

```
V2 前端 OpenAPI Spec (现有)
    ↕ 自动比对 (CI)
V3 后端 SpringDoc 生成的 OpenAPI Spec
    → Breaking Change = CI 失败
```

### 7.4 性能测试

| 场景 | 目标 | V1 基准 |
|------|------|---------|
| 动态库存一览 (500 SKU) | < 500ms | ~2-5s (全量重算) |
| FIFO 单次消耗 (50 层) | < 100ms | ~300ms |
| 盘点上传 (10,000 行 CSV) | < 30s | ~60s |
| 物化视图刷新 | < 10s | N/A |

---

## 8. 前端迁移 (最小变更)

### 8.1 无变化项 (V2 前端完全保留)

- 动态库存一览页面 UI
- 盘点上传向导 UI
- 库存编辑向导 UI
- Apple Design System 主题

### 8.2 增强项 (渐进式)

| 增强 | 原因 | 方式 |
|------|------|------|
| AG Grid 替换 @tanstack/react-table | 百万行虚拟滚动 | 渐进式, 动态库存先上 |
| WebSocket 进度条 | Spring Batch 上传进度 | 新组件, 替换轮询 |
| nuqs URL 状态 | 筛选/分页 URL 持久化 | 替换 useState |
| ECharts 库存分析图 | 新增: 库存趋势/FIFO 层分布 | Dashboard 新面板 |

### 8.3 API Client 重生成

```bash
# V3 后端启动后, 自动生成 TypeScript Client
npx openapi-typescript http://localhost:8080/api/docs --output packages/api-client/inventory.ts
```

---

## 9. 执行排期

```
Sprint 1 (Week 1-2): 领域层 + 数据库
├── FifoLayer, FifoAllocation, FifoTransaction Domain Model
├── Stocktake, StocktakeItem Domain Model
├── FifoEngine (纯函数) + 100% 单测
├── InventoryCalculator + 100% 单测
├── Flyway 迁移脚本 (5 表 + 索引)
└── 数据迁移脚本 (V1 MySQL → V3 PG)

Sprint 2 (Week 3-4): 应用层 + 基础设施
├── UseCases (CRUD + FIFO 消耗 + 盘点)
├── JPA Entities + Repositories
├── Spring Batch (盘点上传 Job)
├── Redis 缓存 + Caffeine L1
├── Kafka Producer/Consumer
└── 集成测试 (Testcontainers)

Sprint 3 (Week 5-6): API + 迁移验证
├── REST Controllers (OpenAPI Spec)
├── 契约测试 (V2 ↔ V3 diff)
├── 物化视图 + 刷新策略
├── 数据迁移执行 + Triple-Audit
├── 性能测试
└── API Gateway 流量切换准备

Sprint 4 (Week 7): 前端增强 + 灰度
├── AG Grid 替换 (动态库存页)
├── WebSocket 进度组件
├── 灰度发布 (10% → 50% → 100%)
├── 监控 48h
└── 确认切换
```

---

## 10. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| FIFO 迁移数据不一致 | 中 | 🔴 严重 | Triple-Audit + V1/V3 并行对比 7 天 |
| 动态库存计算偏差 | 中 | 🔴 严重 | 逐 SKU 数值对比 (top 50) |
| Spring Batch 内存溢出 | 低 | 🟡 中 | chunk-based + 流式处理 |
| Kafka 事件丢失 | 低 | 🔴 严重 | at-least-once + 幂等消费 |
| 前端契约 break | 中 | 🟡 中 | CI 自动 OpenAPI diff |
| 太平洋时区偏移 | 高 | 🟡 中 | 统一 `T12:00:00.000Z` 填充 |

---

## 11. Definition of Done

- [ ] 351 个 FIFO 层全部迁移, Triple-Audit 通过
- [ ] 动态库存 9 列计算与 V1 数值 100% 一致 (前 50 SKU)
- [ ] 盘点上传 10,000 行 CSV < 30s
- [ ] FIFO 消耗事务原子性验证 (模拟: 中途断电不产生脏数据)
- [ ] OpenAPI 契约与 V2 前端零 break
- [ ] 性能: 动态库存 500 SKU < 500ms
- [ ] 所有 Kafka 事件 at-least-once 验证
- [ ] 审计日志: 每次 FIFO 操作都有追踪记录
- [ ] API Gateway 灰度 10% → 100% 无异常 (48h)
- [ ] 所有测试通过 (单元 95%+ / 集成 / 契约 / 性能)

---

*MGMT ERP V3 Inventory Module Task Plan — Created: 2026-02-17*
*Based on: V1 deep dive, V2 KI artifacts, V3 architecture spec*
