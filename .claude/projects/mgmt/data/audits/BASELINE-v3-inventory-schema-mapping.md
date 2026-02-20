# V3 Inventory Schema — V1→V3 对照表 & 设计决策记录

> **用途**: Flyway V3__inventory_module.sql 的配套文档
> **范围**: V1 MySQL 30+ 表 → V3 PostgreSQL 17 表的完整映射
> **创建日期**: 2026-02-17

---

## 1. 表数量汇总

| 域 | V1 表数 | V3 表数 | 减少 | 策略 |
|----|---------|---------|------|------|
| Supplier | 2 | 2 | 0 | 1:1 迁移 + 加审计字段 |
| Purchase (PO) | 3 | 3 | 0 | History+Final 合并, seq→@Version |
| Shipment (Send) | 3 | 2 | -1 | in_send + in_send_list + in_send_final → 2 表 |
| Receiving | 4 | 2 | -2 | receive + receive_final + diff + diff_final → 2 表 |
| Payment | 8 | 1 | -7 | 4类型 × 2(hist+final) → 1 统一付款表 |
| Inventory/FIFO | 5 | 4 | -1 | Data_Inventory→行表, landed_price 合并 |
| Sales/ETL | 3 | 3 | 0 | Transaction 正规化 + Clean_Log 保留 |
| Audit | 0 | 1 | +1 | 新增 change_history (替代 V1 双表审计) |
| Materialized View | 0 | 1 | +1 | 预计算动态库存 |
| **Total** | **28** | **17+1MV** | **-10** | **33% 减少** |

---

## 2. 逐表对照

### 2.1 Supplier Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `in_supplier` | `suppliers` | + version, + audit fields, + soft delete |
| `in_supplier_strategy` | `supplier_strategies` | + FK(supplier_id), + effective_date 索引, ENUM currency |

### 2.2 Purchase Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `in_po` (history) | ⛔ 消除 | → `change_history` 审计替代 |
| `in_po_final` (snapshot) | `purchase_orders` + `purchase_order_items` | 拆分: 订单头+明细 |
| `in_po_strategy` | `purchase_order_strategies` | + FK(po_id), ENUM currency/rate_mode |

**关键变更**:
- V1 `in_po` 每行包含 po_num + po_sku (订单+商品混在一起)
- V3 拆分为 `purchase_orders` (订单头) + `purchase_order_items` (明细), 标准父子表

### 2.3 Shipment Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `in_send` (header) | `shipments` | + ENUM status, + soft delete |
| `in_send_list` (history) | ⛔ 消除 | → `change_history` 审计替代 |
| `in_send_final` (snapshot) | `shipment_items` | + FK(shipment_id, po_id), BOOLEAN po_change |

### 2.4 Receiving Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `in_receive` (history) | ⛔ 消除 | → `change_history` 审计替代 |
| `in_receive_final` (snapshot) | `receives` | + FK(shipment_id, po_id), UNIQUE 约束 |
| `in_diff` (history) | ⛔ 消除 | → `change_history` 审计替代 |
| `in_diff_final` (snapshot) | `receive_diffs` | + FK(receive_id), partial index on status |

### 2.5 Payment Domain (最大合并)

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `in_pmt_po` + `in_pmt_po_final` | → `payments` (type='po') | 合并 |
| `in_pmt_deposit` + `in_pmt_deposit_final` | → `payments` (type='deposit') | 合并 |
| `in_pmt_logistic` + `in_pmt_logistic_final` | → `payments` (type='logistics') | 合并 |
| `in_pmt_prepay` + `in_pmt_prepay_final` | → `payments` (type='prepay') | 合并 |

**设计决策**: 4 类付款在 V1 的字段高度重叠 (金额/汇率/日期/备注), 用 `payment_type` 区分。
少数类型特有字段 (`prepay_tran_type`, `deposit_override`) 用 nullable 列。

### 2.6 Inventory / FIFO Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `Data_Inventory` (宽表!!) | `stocktakes` + `stocktake_items` | 🔴 重大重构: 列→行 |
| `in_dynamic_tran` | `fifo_transactions` | + ENUM action/tran_type, + ref_key |
| `in_dynamic_fifo_layers` | `fifo_layers` | + `landed_cost` (合并自 landed_price 表) |
| `in_dynamic_fifo_alloc` | `fifo_allocations` | + FK 约束 |
| `in_dynamic_landed_price` | ⛔ 消除 | → 合并进 `fifo_layers.landed_cost` |

### 2.7 Sales / ETL Domain

| V1 表 | V3 表 | 变更 |
|-------|-------|------|
| `Data_Transaction` | `raw_transactions` + `raw_transaction_items` | P_SKU1~10 → 子表 |
| `Data_Order_Earning` | → 合并进 `raw_transactions` | 同一张表, source 区分 |
| `Data_Clean_Log` | `cleaned_transactions` | ENUM action, DECIMAL 金额 |

---

## 3. 字段类型升级明细

| V1 类型 | V3 类型 | 影响的表 |
|---------|---------|---------|
| `VARCHAR(20) action` | `ENUM purchase_action` | purchase_orders |
| `VARCHAR(20) status` | `ENUM receive_diff_status` | receive_diffs |
| `CHAR(1) cur_mode` | `ENUM exchange_rate_mode` | purchase_order_strategies, payments |
| `VARCHAR(3) currency` | `ENUM currency_code` | 所有含货币的表 |
| `TEXT note` | `TEXT` (不变) | 全部 |
| `DATETIME` | `TIMESTAMPTZ` | 全部时间字段 |
| `VARCHAR(10) seq` | `INT version` (乐观锁) | 全部需要版本控制的表 |
| `INT AUTO_INCREMENT` | `BIGSERIAL` | 全部 PK |

---

## 4. 索引策略

### 4.1 Partial Indexes (V1 无此能力)

| 表 | 索引 | 条件 | 用途 |
|----|------|------|------|
| `fifo_layers` | `idx_fl_sku_active` | `WHERE qty_remaining > 0` | FIFO 分配只查未耗尽层 |
| `receive_diffs` | `idx_diffs_status` | `WHERE status = 'pending'` | 只查未解决差异 |
| `payments` | `idx_payments_po` | `WHERE po_id IS NOT NULL` | PO 付款查询 |
| `fifo_transactions` | `idx_ft_ref` | `WHERE ref_key IS NOT NULL` | 幂等性检查 |

### 4.2 Composite Indexes

| 表 | 索引 | 用途 |
|----|------|------|
| `supplier_strategies` | `(supplier_code, effective_date DESC)` | 获取最新策略 |
| `fifo_layers` | `(sku, in_date ASC)` + partial | FIFO 出库: 最早层优先 |
| `stocktake_items` | `(stocktake_id, sku)` UNIQUE | 保证一次盘点每 SKU 唯一 |

---

## 5. 数据迁移关键转换规则

### 5.1 Data_Inventory 宽表 → 行表

```sql
-- V1 (每个日期是一列):
-- | SKU     | 2025-01-15 | 2025-02-15 | 2025-03-15 |
-- | AB-101  | 100        | 85         | 92         |

-- V3 迁移脚本伪码:
FOR EACH date_column IN (SELECT columns WHERE name LIKE '____-__-__'):
    INSERT INTO stocktakes (stocktake_date) VALUES (date_column);
    INSERT INTO stocktake_items (stocktake_id, sku, counted_qty)
        SELECT currval('stocktakes_id_seq'), SKU, `{date_column}`
        FROM Data_Inventory;
```

### 5.2 History+Final → 单表

```sql
-- 只迁移 Final 表的数据 (当前有效态)
-- History 表的历史版本 → 批量写入 change_history (可选)
INSERT INTO purchase_orders (po_num, supplier_code, po_date, ...)
    SELECT po_num, LEFT(po_num, 2), po_date, ...
    FROM in_po_final;
```

### 5.3 8 Payment Tables → 1 Unified

```sql
-- 按类型合并
INSERT INTO payments (payment_type, payment_no, po_num, ...)
    SELECT 'po', pmt_no, po_num, ... FROM in_pmt_po_final;

INSERT INTO payments (payment_type, payment_no, logistic_num, ...)
    SELECT 'logistics', pmt_no, logistic_num, ... FROM in_pmt_logistic_final;

-- ... deposit, prepay 类似
```

### 5.4 landed_price → fifo_layers

```sql
-- 合并 in_dynamic_landed_price 到 fifo_layers
UPDATE fifo_layers fl SET landed_cost = lp.landed_price_usd
    FROM in_dynamic_landed_price lp
    WHERE fl.sku = lp.sku AND fl.po_num = lp.po_num;
```

---

## 6. V3 FIFO 约束检查 (Triple-Audit)

迁移完成后必须验证:

```sql
-- FIFO-001: 层完整性 (每层 qty_remaining ≥ 0)
SELECT COUNT(*) FROM fifo_layers WHERE qty_remaining < 0;  -- MUST = 0

-- FIFO-002: 总量守恒 (入库总量 = 消耗总量 + 剩余总量)
SELECT
    SUM(qty_in) AS total_in,
    (SELECT SUM(qty_alloc) FROM fifo_allocations) AS total_alloc,
    SUM(qty_remaining) AS total_remaining
FROM fifo_layers;
-- MUST: total_in = total_alloc + total_remaining

-- FIFO-003: 生产基线 (V1 验证值)
SELECT COUNT(*) FROM fifo_layers;                          -- MUST = 351
SELECT COUNT(*) FROM fifo_layers WHERE po_num LIKE 'INIT%'; -- MUST = 244

-- FIFO-004: 动态库存一致性 (V1 vs V3 前 50 SKU)
-- 逐 SKU 对比 theory_qty, avg_cost
```

---

## 7. Materialized View 刷新策略

```sql
-- 手动刷新 (入库/出库/盘点操作后)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dynamic_inventory;

-- 定时刷新 (建议: pg_cron 每 15 分钟)
-- SELECT cron.schedule('refresh_mv_di', '*/15 * * * *',
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dynamic_inventory');
```
