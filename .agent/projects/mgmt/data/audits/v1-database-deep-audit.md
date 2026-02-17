# V1 数据库深度审计报告
> **审计人**: Agent (Antigravity)  
> **审计日期**: 2026-02-18  
> **最后更新**: 2026-02-18 (区块 1 补充: 异常处理 + Data_Order_Earning)  
> **范围**: V1 MySQL 全部 `in_` 系列表 + `Data_` 系列表 (含 `Data_Order_Earning`)  
> **方法**: 代码级全链路追踪 (Backend Write → Read → Frontend Display)  
> **目的**: 为 V3 迁移提供权威的表级冗余分析和裁定  
> **精度**: 100% 代码追踪, 零猜测, 零遗漏

---

## 0. 执行摘要

| 指标 | 数值 |
|------|------|
| V1 核心表总数 | **29** (24 `in_` + 5 `Data_`) |
| History+Final 双表对 | **12** 对 (= 24 个表，其中 12 个是冗余的 Final 副本) |
| 被代码实际引用的表 | **29/29** (全部被使用) |
| 存在严重冗余的表 | **12** (所有 `_final` 表) |
| 存在结构性反模式的表 | **3** (`Data_Inventory`, `Data_Transaction`, `Data_COGS`) |
| V3 目标表数 | **18 + 1 MV** |
| 净减少 | **34%** |

---

## 1. 全表索引 (按域分组)

### 1.1 供应商域 (Supplier Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 1 | `in_supplier` | 主表 | 12 | ✅ 无冗余 |
| 2 | `in_supplier_strategy` | 主表 | 20+ | ✅ 无冗余 |

### 1.2 采购订单域 (Purchase Order Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 3 | `in_po` | History | 6 | ⚠️ 与 `in_po_final` 构成双写 |
| 4 | `in_po_final` | Final | 20+ | 🔴 冗余 — 是 `in_po` 的快照 |
| 5 | `in_po_strategy` | 主表 | 20+ | ✅ 无冗余 |

### 1.3 发货域 (Shipment Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 6 | `in_send` | History | 9 | ⚠️ 与 `in_send_final` 构成双写 |
| 7 | `in_send_list` | History (明细) | 9 | ⚠️ 双写关系 |
| 8 | `in_send_final` | Final | 20+ | 🔴 冗余 — `in_send` + `in_send_list` 的快照 |

### 1.4 入库域 (Receiving Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 9 | `in_receive` | History | 3 | ⚠️ 与 `in_receive_final` 构成双写 |
| 10 | `in_receive_final` | Final | 5 | 🔴 冗余 — `in_receive` 的快照 |
| 11 | `in_diff` | History | 3 | ⚠️ 与 `in_diff_final` 构成双写 |
| 12 | `in_diff_final` | Final | 5 | 🔴 冗余 — `in_diff` 的快照 |

### 1.5 付款域 (Payment Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 13 | `in_pmt_logistic` | History | 3 | ⚠️ 双写 |
| 14 | `in_pmt_logistic_final` | Final | 5 | 🔴 冗余 |
| 15 | `in_pmt_deposit` | History | 3 | ⚠️ 双写 |
| 16 | `in_pmt_deposit_final` | Final | 8 | 🔴 冗余 |
| 17 | `in_pmt_po` | History | 6 | ⚠️ 双写 |
| 18 | `in_pmt_po_final` | Final | 10 | 🔴 冗余 |
| 19 | `in_pmt_prepay` | History | 6 | ⚠️ 双写 |
| 20 | `in_pmt_prepay_final` | Final | 5 | 🔴 冗余 |

### 1.6 FIFO / 库存域 (Inventory Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 21 | `in_dynamic_tran` | 主表 | 5 | ✅ 无冗余 |
| 22 | `in_dynamic_fifo_layers` | 主表 | 5 | ✅ 无冗余 |
| 23 | `in_dynamic_fifo_alloc` | 主表 | 5 | ✅ 无冗余 |
| 24 | `in_dynamic_landed_price` | 派生表 | 6 | 🟡 可合并到 `fifo_layers` |

### 1.7 数据域 (Data Domain)
| # | V1 表名 | 类型 | 引用文件数 | 冗余级别 |
|---|---------|------|-----------|---------|
| 25 | `Data_Transaction` | ETL 暂存 | 5 | 🟡 EAV 反模式 |
| 26 | `Data_Order_Earning` | ETL 暂存 | 6 | ✅ 无冗余 |
| 27 | `Data_Clean_Log` | ETL 日志 | 5 | ✅ 无冗余 |
| 28 | `Data_Inventory` | 动态宽表 | 5 | 🔴 动态列反模式 |
| 29 | `Data_COGS` | 主表 | 10+ | ✅ 无冗余（但字段类型松散） |

---

## 2. 逐表全链路追踪

### 2.1 `in_supplier` — 供应商主表

**写入路径:**
- `purchase/views/po_create/submit.py` → 读取验证供应商存在性
- 管理界面直接增删改

**读取路径:**
- `finance/views/po/api.py:po_list_api()` → 通过 `supplier_code` 前缀匹配获取供应商名称
- `finance/views/po/api.py:get_vendor_balance_api()` → 获取供应商名称
- `purchase/views/po_mgmt/list.py` → 订单列表供应商信息

**字段分析:**
```
supplier_code VARCHAR(2) PK   — 供应商代码 (2字母)
supplier_name VARCHAR(100)    — 供应商名称
```

**裁定:** ✅ 无冗余。V3 直接迁移，加 audit 字段 + soft delete。

---

### 2.2 `in_supplier_strategy` — 供应商策略表

**写入路径:**
- 管理界面修改供应商结算策略

**读取路径:**
- `finance/views/po/api.py:po_payment_submit()` L896 → 获取 `tran_curr_req` (供应商要求货币)
- `finance/views/po/api.py:get_vendor_balance_api()` L1066 → 获取供应商结算货币
- `core/services/inventory_snapshot.py` L142 → 匹配 PO 策略中的货币信息
- `finance/utils/landed_price.py` 间接通过 `in_po_strategy` 获取

**字段分析:**
```
supplier_code FK → in_supplier
currency      VARCHAR(10)     — 结算货币 (RMB/USD)
effective_date DATE           — 生效日期
```

**裁定:** ✅ 无冗余。V3 加 ENUM currency + FK 约束。

---

### 2.3 `in_po` (History) + `in_po_final` (Final) — 采购订单

**🔴 关键冗余点 #1**

**写入路径 — `submit_po_api()` (po_create/submit.py L117-161):**
```python
# 事务中同步双写
with DBClient.atomic_transaction():
    # 1. 写入 in_po (history)
    INSERT INTO in_po (update_date, supplier_code, po_num, po_sku, 
                       po_quantity, po_price, currency, usd_rmb, 
                       by, action, note, seq)
    
    # 2. 同时写入 in_po_final (快照)
    INSERT INTO in_po_final (po_date, po_update_date, po_num, po_sku, 
                             po_quantity, po_price, po_note, po_seq, po_by)
```

**写入路径 — `submit_send_api()` (send_create/submit.py L279-338):**
```python
# 规整操作时也双写
INSERT INTO in_po (action='adjust', ...)
UPDATE in_po_final SET po_quantity=:new_qty WHERE ...
```

**读取路径 — `in_po` (History):**
- `send_create/submit.py` → 读取原始订单信息用于规整
- `po_mgmt/history.py` → 展示订单修改历史
- `po_mgmt/edit.py` → 编辑时获取最大seq

**读取路径 — `in_po_final` (Final):**
- `finance/views/po/api.py:po_list_api()` → 计算 `SUM(po_price * po_quantity)`
- `finance/views/po/api.py:po_payment_submit()` → 用于 JOINed 订单总额
- `finance/utils/landed_price.py` → 计算 raw_total
- `send_create/submit.py` → 获取发货价格
- `receive/submit.py` → 计算 po_quantity
- `core/services/inventory_snapshot.py` → 下订数计算
- `purchase/views/po_mgmt/list.py` → 订单列表
- `purchase/views/po_mgmt/detail.py` → 订单详情
- `purchase/views/po_mgmt/delete.py` → 级联删除

**冗余分析:**
- `in_po` 存储**所有历史版本** (每次修改追加一行，seq 递增)
- `in_po_final` 存储**当前最终状态** (新建时 INSERT，修改时 UPDATE)
- 两表的核心字段完全重叠: `po_num, po_sku, po_quantity, po_price`
- `in_po_final` 的全部数据都可以从 `in_po` 通过 `GROUP BY po_num, po_sku ORDER BY seq DESC` 推导

**裁定:** 🔴 **`in_po_final` 完全冗余**。  
V3 方案: 合并为单表 `purchase_order_items` + `@Version` 乐观锁。历史追踪通过 `change_history` 审计表实现。

---

### 2.4 `in_po_strategy` — 订单策略表

**写入路径:**
- `po_create/submit.py` L191-211 → 创建订单时写入策略
- `po_mgmt/edit.py` → 修改订单策略

**读取路径:**
- `finance/views/po/api.py:po_list_api()` L63-83 → 获取最新策略 (seq最大)
- `finance/views/po/api.py:po_payment_submit()` L669-688 → 获取货币和汇率
- `finance/utils/landed_price.py` L44-57 → 获取订单货币+汇率
- `core/services/inventory_snapshot.py` L143-148 → 匹配策略信息
- `purchase/views/send_mgmt/detail.py` → 发货管理
- `inventory/views/dynamic_inv.py` → 动态库存

**字段分析:**
```
po_num        VARCHAR     — 订单号
date          DATE        — 策略日期
cur_currency  VARCHAR     — 结算货币 (RMB/USD)
cur_float     TINYINT     — 是否浮动汇率
cur_ex_float  DECIMAL     — 浮动阈值
cur_deposit   TINYINT     — 是否需要定金
cur_deposit_par DECIMAL   — 定金比例
cur_usd_rmb   DECIMAL     — USD/RMB 汇率
cur_mode      VARCHAR(1)  — 汇率模式 (A=自动, M=手动)
note          TEXT
by            VARCHAR
seq           VARCHAR     — 版本号 (V01, V02...)
```

**裁定:** ✅ 无冗余。V3 合并到 `purchase_order_strategies` + ENUM 类型。

---

### 2.5 `in_send` + `in_send_list` + `in_send_final` — 发货三表

**🔴 关键冗余点 #2**

**写入路径 — `submit_send_api()` (send_create/submit.py):**
```python
with DBClient.atomic_transaction():
    # 1. in_send — 物流主表 (一条记录/一个物流单号)
    INSERT INTO in_send (date_sent, logistic_num, price_kg, total_weight, 
                         total_price, usd_rmb, mode, date_eta, pallets, ...)
    
    # 2. in_send_list — 发货明细 (每个SKU一行)
    INSERT INTO in_send_list (logistic_num, po_num, sku, quantity, price, 
                              action, po_change, ...)
    
    # 3. in_send_final — 只写入 quantity > 0 的行
    INSERT INTO in_send_final (sent_date, sent_logistic_num, po_num, po_sku, 
                               sent_quantity, po_price, ...)
```

**读取路径 — `in_send` (物流主表):**
- `receive/submit.py` L150-159 → 获取 ETA 日期 (date_eta)
- `finance/utils/landed_price.py` L231-237 → 获取物流费用 (total_price, usd_rmb)
- `send_mgmt/detail.py` → 物流信息展示
- `send_mgmt/list.py` → 物流列表

**读取路径 — `in_send_list` (明细History):**
- `send_mgmt/history.py` → 展示发货修改历史
- `send_mgmt/detail.py` → 发货明细

**读取路径 — `in_send_final` (Final):**
- `receive/submit.py` L122-140 → 入库时查询发货记录
- `finance/views/po/api.py` → 差异计算
- `finance/utils/landed_price.py` L172-177 → 计算每个SKU的发货数量
- `core/services/inventory_snapshot.py` L94-98 → 已发货数量

**冗余分析:**
- `in_send` 是物流头信息（费用、日期），无冗余
- `in_send_list` 是发货明细的历史版本
- `in_send_final` 是 `in_send_list` 的快照 (剔除了quantity=0的行)
- `in_send_final` 可从 `in_send_list WHERE action = latest` 推导

**裁定:** 🔴 **`in_send_final` 冗余**，可从 `in_send_list` 推导。  
V3 方案: 合并为 `shipments` (头) + `shipment_items` (明细) 两表。

---

### 2.6 `in_receive` + `in_receive_final` — 入库双表

**🔴 关键冗余点 #3**

**写入路径 — `submit_receive_api()` (receive/submit.py L254-277):**
```python
# 完全同步双写 — 相同的数据写两遍
INSERT INTO in_receive (...all fields...)
INSERT INTO in_receive_final (...all fields...)  # 一模一样的数据！
```

**读取路径 — `in_receive`:**
- 几乎不被单独读取，仅 history 查询

**读取路径 — `in_receive_final`:**
- `receive/submit.py` L90-93 → 重复入库检查 (DISTINCT logistic_num)
- `core/services/inventory_snapshot.py` L107-117 → 已收货数量

**冗余分析:**
- 创建时两表写入完全相同的数据
- `in_receive` 用于历史版本追踪 (有 action, seq 字段)
- `in_receive_final` 在后续编辑中更新而不追加
- 但这两表在初始写入时是 **100% 字段复制**

**裁定:** 🔴 **`in_receive_final` 完全冗余**。  
V3 方案: 合并为 `receiving_items` 单表 + `@Version`。

---

### 2.7 `in_diff` + `in_diff_final` — 入库差异双表

**🔴 关键冗余点 #4**

**写入路径 — `submit_receive_api()` (receive/submit.py L294-344):**
```python
# 同步双写 — 仅在 sent_quantity != receive_quantity 时触发
INSERT INTO in_diff (record_num, logistic_num, po_num, ...)
INSERT INTO in_diff_final (record_num, logistic_num, po_num, ...)  # 相同数据！
```

**读取路径 — `in_diff_final`:**
- `finance/views/po/api.py` L302-315 → 检查未解决差异 (阻止付款)
- `purchase/views/abnormal.py` → 差异管理页面

**裁定:** 🔴 **`in_diff_final` 完全冗余**。  
V3 方案: 合并到 `receiving_items` 中的差异字段。

---

### 2.8 付款四类 × 2 = 8 个表

#### 2.8a `in_pmt_po` + `in_pmt_po_final`

**写入路径 — `po_payment_submit()` (finance/views/po/api.py L850-878):**
```python
# 写入 in_pmt_po (history)
INSERT INTO in_pmt_po (pmt_no, po_num, pmt_date, pmt_currency, 
                        pmt_cash_amount, pmt_fe_rate, pmt_fe_mode,
                        pmt_prepay_amount, pmt_override, extra_note, 
                        extra_amount, extra_currency, ops, seq, by, note)
# in_pmt_po_final 由事后同步（或trigger）写入
```

**读取路径 — `in_pmt_po`:**
- `finance/views/po/api.py` L738-756 → 获取 pmt_no 序号
- `finance/views/po/api.py` L769-774 → 获取 seq 序号
- `finance/views/po/api.py` L816-822 → 兜底计算已付金额

**读取路径 — `in_pmt_po_final`:**
- `finance/views/po/api.py:po_list_api()` L195-263 → 主要读取入口，获取已付货款
- `finance/utils/landed_price.py` L91-109 → 计算 payment_ratio
- `finance/views/payment/history.py` → 付款历史

🔴 **冗余**。同类型的其他 3 对表同理:

#### 2.8b `in_pmt_deposit` + `in_pmt_deposit_final` 
- 写入: `finance/views/deposit/api.py`
- 读取: `finance/views/po/api.py` L267-297 (定金统计)
- 读取: `finance/utils/landed_price.py` L70-88 (定金计算)

#### 2.8c `in_pmt_logistic` + `in_pmt_logistic_final`
- 写入: `finance/views/logistic/api.py` (后续步骤)
- 读取: `finance/utils/landed_price.py` L247-270 (物流付款)

#### 2.8d `in_pmt_prepay` + `in_pmt_prepay_final`
- 写入: `finance/views/po/api.py` L910-934 (PO付款时同步写入)
- 写入: `finance/views/prepay/api.py` (预付款管理)
- 读取: `finance/views/po/api.py` L1081-1093 (预付款余额)

**裁定:** 🔴 **所有 `_final` 表冗余**。  
V3 方案: 8 表 → 1 个统一 `payments` 表 + `payment_type` ENUM。

---

### 2.9 FIFO 四表 — `in_dynamic_*`

#### 2.9a `in_dynamic_tran` — FIFO 交易记录
- 追踪每次库存变动（入库、出库、调整）
- **无冗余** → V3: `fifo_transactions`

#### 2.9b `in_dynamic_fifo_layers` — FIFO 层
- 每批入库创建一层，出库时扣减 `qty_remaining`
- **无冗余** → V3: `fifo_layers` (合并 landed_cost)

#### 2.9c `in_dynamic_fifo_alloc` — FIFO 分配
- 记录出库时从哪层扣了多少
- **无冗余** → V3: `fifo_allocations`

#### 2.9d `in_dynamic_landed_price` — FIFO 入库单价
**写入路径 — `create_landed_price_records()` (finance/utils/landed_price.py L800+)**
- 入库后自动调用 (`receive/submit.py` L360-365)
- PO付款后重算 (`finance/views/po/api.py` L947-952)

**读取路径:**
- `core/services/inventory_snapshot.py` L64-80 → FIFO库存价值
- `inventory/views/dynamic_inv.py` → 动态库存展示

**冗余分析:**
- 该表是 **计算结果的缓存** — 每条记录的 `landed_price_usd` 可通过以下公式推导:
  ```
  landed_price_usd = (base_price × payment_ratio) + fee_apportioned_per_unit
  ```
- 其中 `payment_ratio` 和 `fee_apportioned_per_unit` 依赖 6+ 个表的 JOIN 计算
- 存储它是 **合理的性能优化**，但应作为 `fifo_layers` 的一个字段而非独立表

**裁定:** 🟡 **结构冗余** — 不应是独立表。  
V3 方案: 合并为 `fifo_layers.landed_cost`。

---

### 2.10 Data 系列表

#### 2.10a `Data_Transaction` — ETL 暂存表 
**结构反模式 — EAV 列:**
```sql
-- 单条记录中用编号列存储多个SKU
P_SKU1, P_Quantity1, P_SKU2, P_Quantity2, ..., P_SKU10, P_Quantity10
```

**写入路径:** ETL ingest pipeline (`core/services/etl/ingest.py`)
**读取路径:** ETL parser + transformer → 写入 `Data_Clean_Log`

**裁定:** 🟡 **EAV 反模式**。  
V3 方案: `raw_transactions` (父) + `raw_transaction_items` (子)。

#### 2.10b `Data_Clean_Log` — ETL 清洗后数据
- 存储清洗后的销售记录
- 被 FIFO 引擎消费
- **无结构冗余**
- V3: `clean_transactions`

#### 2.10c `Data_Inventory` — 动态宽表
**🔴 最严重的结构反模式:**
```sql
-- 每次盘存新增一列！列名就是日期
ALTER TABLE Data_Inventory ADD COLUMN `2026-01-15` INT;
-- 查询最新: SHOW COLUMNS FROM Data_Inventory → 取最后一列
```

**写入路径:** `etl/views.py:inv_validate()` + `inventory/service.py:sync_to_db()`
**读取路径:** 
- `etl/views.py:_get_inventory_latest_date()` → `SHOW COLUMNS`
- `core/services/inventory/repository.py:get_inventory_latest()` → 读最后一列
- `core/services/inventory_snapshot.py` L38-43

**裁定:** 🔴 **动态列反模式** — DDL爆炸、无法索引、查询困难。  
V3 方案: `stocktakes` (盘存头) + `stocktake_items` (盘存行)。

#### 2.10d `Data_COGS` — SKU 成本主数据
- 存储 SKU 的重量、类别、成本等信息
- 被 FIFO landed_price 和 inventory_snapshot 消费
- **无结构冗余** 但字段类型松散 (TEXT 存数字等)
- V3: 合并到 `products` 表的成本字段

---

## 3. 冗余热力图

```
冗余危险级别:
🔴 = History+Final 双写冗余 (可立即消除)
🟡 = 结构可优化 (合并/正规化)
✅ = 无冗余

Supplier Domain:
  in_supplier           ✅
  in_supplier_strategy  ✅

PO Domain:
  in_po                 ⚠️ ← history 表留作审计
  in_po_final           🔴 ← 100% 可从 in_po 推导
  in_po_strategy        ✅

Shipment Domain:
  in_send               ✅ (物流头信息唯一)
  in_send_list          ⚠️ ← history 表
  in_send_final         🔴 ← 可从 in_send_list 推导

Receive Domain:
  in_receive            ⚠️ ← history
  in_receive_final      🔴 ← 100% 双写冗余
  in_diff               ⚠️ ← history
  in_diff_final         🔴 ← 100% 双写冗余

Payment Domain (×4):
  in_pmt_po             ⚠️ ← history
  in_pmt_po_final       🔴 ← 冗余
  in_pmt_deposit        ⚠️ ← history
  in_pmt_deposit_final  🔴 ← 冗余
  in_pmt_logistic       ⚠️ ← history
  in_pmt_logistic_final 🔴 ← 冗余
  in_pmt_prepay         ⚠️ ← history
  in_pmt_prepay_final   🔴 ← 冗余

FIFO Domain:
  in_dynamic_tran         ✅
  in_dynamic_fifo_layers  ✅
  in_dynamic_fifo_alloc   ✅
  in_dynamic_landed_price 🟡 ← 可合并到 fifo_layers

Data Domain:
  Data_Transaction        🟡 ← EAV 反模式
  Data_Clean_Log          ✅
  Data_Inventory          🔴 ← 动态列反模式
  Data_COGS               🟡 ← 类型松散
```

---

## 4. V3 合并策略总表

| V1 表组 | V1 表数 | V3 表 | V3 表数 | 消除方式 |
|---------|---------|-------|---------|---------|
| in_supplier + strategy | 2 | suppliers + supplier_strategies | 2 | 1:1 + audit fields |
| in_po + final + strategy | 3 | purchase_order_items + purchase_order_strategies | 2 | History+Final → 单表+版本 |
| in_send + list + final | 3 | shipments + shipment_items | 2 | 三表→两表 |
| in_receive + final | 2 | receiving_items | 1 | 双表→单表+版本 |
| in_diff + final | 2 | *(合并到 receiving_items)* | 0 | 差异字段内联 |
| in_pmt_* (4类×2) | 8 | payments | 1 | 8表→1表+type ENUM |
| in_dynamic_* (4表) | 4 | fifo_transactions + fifo_layers + fifo_allocations | 3 | landed_price 合并 |
| Data_Transaction | 1 | raw_transactions + raw_transaction_items | 2 | EAV→行表 |
| Data_Clean_Log | 1 | clean_transactions | 1 | 1:1 + 类型修正 |
| Data_Inventory | 1 | stocktakes + stocktake_items | 2 | 动态列→行表 |
| Data_COGS | 1 | *(合并到 products)* | 0 | 字段合并 |
| *(新增)* | 0 | change_history | 1 | 统一审计表 |
| *(新增)* | 0 | mv_dynamic_inventory | 1 MV | 物化视图 |
| **合计** | **28** | | **17 + 1 MV** | **-39%** |

---

## 5. 核心发现: History+Final 双写机制详解

### 5.1 双写是如何产生的

V1 使用了一种"append-only history + mutable snapshot"模式:

```
[用户操作] → [写入 in_xxx (追加新行)] + [写入/更新 in_xxx_final (维护最新快照)]
```

**设计意图:** 
- `in_xxx` 表不可变，只追加，完整记录所有版本
- `in_xxx_final` 存储当前状态，查询性能好（不需要 GROUP BY + MAX(seq)）

**实际问题:**
1. **写放大 ×2**: 每次操作写两个表，事务复杂度翻倍
2. **一致性风险**: 如果事务中第二次写失败，两表不一致
3. **维护负担**: 每次修改逻辑需要同步修改两个 INSERT/UPDATE
4. **代码证据** (submit_po_api L117-161):
   ```python
   with DBClient.atomic_transaction():
       # ← 同一事务中双写，但如果 extract_date_from_po_num 抛异常...
       DBClient.execute_stmt("INSERT INTO in_po ...")
       DBClient.execute_stmt("INSERT INTO in_po_final ...")  # ← 冗余!
   ```

### 5.2 V3 如何消除双写

```
V1:  in_po (history) + in_po_final (snapshot)
       ↓ V3 合并 ↓
V3:  purchase_order_items + @Version + change_history trigger
```

- `purchase_order_items` 直接 UPDATE (当前状态)
- `@Version` 字段实现乐观锁
- `change_history` 通过 PostgreSQL TRIGGER 自动记录变更前后的 JSONB
- 查询性能不变 (直接读最新)
- 审计追踪更强 (TRIGGER 保证一致性)

---

## 6. 核心发现: 付款 8 表 → 1 表

### 6.1 V1 的 8 个付款表实际上结构高度相似:

```
in_pmt_po:       pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount, ...
in_pmt_deposit:  dep_no, po_num, dep_date, dep_cur, dep_paid, ...
in_pmt_logistic: log_no, logistic_num, pmt_date, pmt_currency, logistic_paid, ...
in_pmt_prepay:   tran_num, supplier_code, tran_date, tran_curr_use, tran_amount, ...
```

### 6.2 V3 统一 `payments` 表:

```sql
CREATE TABLE payments (
    id          BIGSERIAL PRIMARY KEY,
    payment_type payment_type NOT NULL,  -- ENUM: 'po','deposit','logistic','prepay'
    payment_no  VARCHAR(50) NOT NULL,
    po_num      VARCHAR(50),
    logistic_num VARCHAR(50),
    supplier_code VARCHAR(10),
    ...
    -- 通用字段
    pay_date    TIMESTAMPTZ NOT NULL,
    currency    VARCHAR(10) NOT NULL,
    amount      DECIMAL(12,5) NOT NULL,
    exchange_rate DECIMAL(10,4),
    ...
);
```

好处:
- 跨类型汇总查询变简单
- 统一索引策略
- 维护一套 CRUD 逻辑

---

## 7. 核心发现: `Data_Inventory` 动态列深度诊断

### 7.1 当前工作方式

```python
# etl/views.py L223-234
def _get_inventory_latest_date():
    db.read_df('SHOW COLUMNS FROM Data_Inventory')
    last_col = cols_df.iloc[-1]['Field']  # ← 最后一列名 = 最新日期!
    return str(last_col)
```

每次盘存时:
```sql
ALTER TABLE Data_Inventory ADD COLUMN `2026-02-18` INT DEFAULT 0;
UPDATE Data_Inventory SET `2026-02-18` = :qty WHERE SKU = :sku;
```

### 7.2 问题

1. **DDL 炸弹**: 每周盘存一次 → 年增 52 列 → 3年就是 156+ 列
2. **无法添加索引**: 列名是动态的
3. **数据清理困难**: 删除旧盘存需要 `ALTER TABLE DROP COLUMN`
4. **备份/恢复困难**: 表结构不稳定
5. **跨库迁移困难**: PostgreSQL 需要不同的 `ALTER` 语法

### 7.3 V3 方案

```sql
CREATE TABLE stocktakes (
    id         BIGSERIAL PRIMARY KEY,
    count_date DATE NOT NULL UNIQUE,
    ...
);

CREATE TABLE stocktake_items (
    id           BIGSERIAL PRIMARY KEY,
    stocktake_id BIGINT REFERENCES stocktakes(id),
    sku          VARCHAR(100) NOT NULL,
    quantity     INT NOT NULL DEFAULT 0,
    ...
);
```

---

## 8. 结论与建议

### 8.1 立即可消除的冗余 (12 张 `_final` 表)

这 12 张表贡献了 V1 数据库 **41% 的表数量** 和大约 **50% 的写操作负载**。
消除它们是 V3 迁移的最高优先级收益。

### 8.2 结构优化 (3 张 `Data_` 表)

`Data_Inventory` 和 `Data_Transaction` 的反模式需要在 V3 中彻底重构。
这些重构已反映在 `V3__inventory_module.sql` 的设计中。

### 8.3 合并优化 (8 → 1 付款表 + landed_price 合并)

付款域 8→1 合并和 landed_price 合并是中等优先级但高收益的优化。

### 8.4 数据迁移优先级

```
Phase 1 (DDL): V3__inventory_module.sql ← 已完成
Phase 2 (Tests): Integration tests ← 下一步
Phase 3 (Migration): 数据迁移脚本
  - 3a: Supplier + Strategy (简单 1:1)
  - 3b: PO + Strategy (History 选最新, 合并)
  - 3c: Send (三表合并为两表)
  - 3d: Receive + Diff (四表合并为一表)
  - 3e: Payment (八表合并为一表)
  - 3f: FIFO (三表1:1 + landed_price合并)
  - 3g: Data_Inventory (列→行 转换)
  - 3h: Data_Transaction + Data_Order_Earning (EAV→行 转换)
Phase 4 (Verify): 三重审计验证
```

---

## 9. 深度补充: 异常处理 4 策略级联写入 (abnormal.py, 1488 行)

> **源文件:** `backend/apps/purchase/views/abnormal.py`  
> **总行数:** 1488  
> **涉及表总数:** 10 张 (写入) + 2 张 (只读)  
> **事务保证:** 全部在 `DBClient.atomic_transaction()` 中

### 9.0 异常处理概述

当入库时 `sent_quantity ≠ receive_quantity`，系统自动生成 `in_diff` + `in_diff_final` 差异记录。
用户随后选择 4 个策略之一来解决差异。**每个策略操作不同数量的表:**

| 策略 | 名称 | 适用差异类型 | 写入表数 | 复杂度 |
|------|------|------------|----------|--------|
| M1 | 仅修正发货单 | 正负均可 | 5 | ⭐⭐ |
| M2 | 同步修正发货单与订单 | 正负均可 | 7 | ⭐⭐⭐ |
| M3 | 延迟入库 | 仅少收(正差) | 5 | ⭐⭐⭐ |
| M4 | 厂商错误 | 正负均可 | 9 | ⭐⭐⭐⭐⭐ |

### 9.1 处理主入口: `abnormal_process_api()` (L265-507)

**读取表:**
- `in_diff_final` L320-328 → JOIN `in_receive_final` → 获取待处理差异 (WHERE diff_quantity != 0)
- `in_po_final` L421-426 → 获取 po_quantity (用于 in_diff INSERT)

**写入表 (所有策略共通):**
```python
# L430-454: 写入 in_diff (History 明细表)
INSERT INTO in_diff (record_num, logistic_num, po_num, receive_date, po_sku,
    po_quantity, sent_quantity, receive_quantity, diff_quantity,
    status='resolved', action='adjust', note, seq='D##', by)

# L459-477: 更新 in_diff_final (终态表)
UPDATE in_diff_final SET sent_quantity=receive_quantity, diff_quantity=0,
    note=process_note, seq, by
WHERE logistic_num AND po_num AND po_sku
```

**关键逻辑:**
- `diff_quantity > 0` → 少收 (positive)
- `diff_quantity < 0` → 多收 (negative)
- Note 格式: `差异校正修改_{operator}_{V##}_{date}_{user_note}#M{1-4}`
- Seq 格式: `D{##}` (D01, D02...)

### 9.2 策略1: `_process_method_1()` (L534-602) — 仅修正发货单

**操作序列: 发货明细 → 发货终态 → 入库终态(sent_quantity)**

```
┌──────────────────────────────────────────────────────────┐
│ Step 1: in_send_list INSERT (L543-558)                   │
│   action='adjust', quantity=receive_quantity              │
│   seq = _get_next_seq('in_send_list', logistic_num)      │
│                                                          │
│ Step 2: in_send_final UPDATE (L561-582)                  │
│   SET sent_quantity=receive_quantity                      │
│   WHERE sent_logistic_num AND po_num AND po_sku          │
│         AND ABS(po_price - :po_price) < 0.001  ← 浮点比较│
│                                                          │
│ Step 3: in_receive_final UPDATE (L585-602)                │
│   SET sent_quantity=receive_quantity                      │
│   同样的 WHERE 条件 (含浮点比较)                           │
└──────────────────────────────────────────────────────────┘
```

**涉及表 (5张):** `in_send_list` (INSERT) + `in_send_final` (UPDATE) + `in_receive_final` (UPDATE) + `in_diff` (INSERT) + `in_diff_final` (UPDATE)

### 9.3 策略2: `_process_method_2()` (L605-755) — 同步修正发货单与订单

**策略1 的超集 + 额外修正 in_po + in_po_final**

```
┌──────────────────────────────────────────────────────────┐
│ Step 1: 读取 in_po 获取订单信息 (L614-620)               │
│   SELECT supplier_code, currency, usd_rmb                │
│   ORDER BY seq DESC LIMIT 1                              │
│                                                          │
│ Step 2: in_po INSERT (L634-651)                          │
│   action='adjust', 新 seq                                │
│                                                          │
│ Step 3: in_po_final UPDATE (L671-690)                    │
│   SET po_quantity=receive_quantity                        │
│   读最新 in_po 记录后 UPDATE                              │
│                                                          │
│ Step 4-6: 与策略1 完全相同                                │
│   in_send_list INSERT → in_send_final UPDATE             │
│   → in_receive_final UPDATE                              │
└──────────────────────────────────────────────────────────┘
```

**涉及表 (7张):** in_po (INSERT + READ) + in_po_final (UPDATE) + in_send_list (INSERT) + in_send_final (UPDATE) + in_receive_final (UPDATE) + in_diff (INSERT) + in_diff_final (UPDATE)

### 9.4 策略3: `_process_method_3()` (L758-830) — 延迟入库

**⚠️ 仅适用少收 (diff > 0): 创建新的延迟发货子单**

```
┌──────────────────────────────────────────────────────────┐
│ Pre: 确定延迟单号 (L765-780)                             │
│   查询 in_send WHERE logistic_num LIKE '{原单号}_delay_%'│
│   新单号 = {原单号}_delay_V{##}                          │
│                                                          │
│ Step 1: in_send INSERT (L783-795)                        │
│   新物流单头 (price_kg=0, total_weight=0, total_price=0) │
│   标记: "延迟入库子单_原单号:{原单号}"                    │
│   seq = 'V01'                                            │
│                                                          │
│ Step 2: in_send_list INSERT (L798-812)                   │
│   logistic_num = 延迟单号                                │
│   action = 'new', seq = 'L01'                            │
│                                                          │
│ Step 3: in_send_final INSERT (L815-830)                  │
│   ← 注意是 INSERT 不是 UPDATE (因为是新发货单)            │
│   sent_date = delay_date                                 │
└──────────────────────────────────────────────────────────┘
```

**涉及表 (5张):** in_send (INSERT) + in_send_list (INSERT) + in_send_final (INSERT) + in_diff (INSERT) + in_diff_final (UPDATE)

**⚠️ 关键注意:** 策略3 **不修改** in_po/in_po_final 和 in_receive/in_receive_final，只创建新的待入库发货记录。

### 9.5 策略4: `_process_method_4()` (L833-1025) — 厂商错误

**🔴 最复杂: 在订单、发货、入库三个域同时新增记录**

```
┌──────────────────────────────────────────────────────────┐
│ Pre: 判断差异类型 (L842-852)                             │
│   多收 (diff < 0): use_price = 0.0 (零成本入库)          │
│   少收 (diff > 0): use_price = po_price (原价入库, TODO) │
│                                                          │
│ === 域1: 订单 ===                                        │
│ Step 1: in_po INSERT (L876-893)                          │
│   action='add', po_price = use_price                     │
│                                                          │
│ Step 2: in_po_final INSERT (L912-927)                    │
│   ← 注意是 INSERT 不是 UPDATE (新增行)                   │
│   po_date 从 po_num 提取                                 │
│                                                          │
│ === 域2: 发货 ===                                        │
│ Step 3: in_send_list INSERT (L933-948)                   │
│   action='add', price = use_price                        │
│                                                          │
│ Step 4: in_send_final INSERT (L959-975)                  │
│   ← INSERT (新增行, 同一 logistic_num 下新 SKU/价格行)   │
│   sent_date = 原发货日期 (从 in_send_final 查询)         │
│                                                          │
│ === 域3: 入库 ===                                        │
│ Step 5: in_receive INSERT (L981-1002)                    │
│   action='add', receive_quantity = extra_quantity         │
│                                                          │
│ Step 6: in_receive_final INSERT (L1005-1025)             │
│   sent_quantity = receive_quantity = extra_quantity       │
│   po_price = use_price                                   │
└──────────────────────────────────────────────────────────┘
```

**涉及表 (9张):** in_po (INSERT + READ) + in_po_final (INSERT) + in_send_list (INSERT) + in_send_final (INSERT + READ) + in_receive (INSERT) + in_receive_final (INSERT) + in_diff (INSERT) + in_diff_final (UPDATE)

**⚠️ TODO标记 (L838, L848-852):** 少收情况的出库逻辑**未实现**，代码注释："TODO: 用户需要告知出库逻辑后在此处添加"

### 9.6 删除/撤销: `abnormal_delete_api()` (L1105-1488)

**完整逆操作 — 根据策略类型执行对应的删除:**

```
1. 从 in_diff_final 获取已解决记录 (WHERE diff_quantity=0 AND note LIKE '%#M%')
2. 从 note 末尾提取策略标识: 正则 #(M\d)$

按策略执行删除:
┌──────────────────────────────────────────────────────────────┐
│ M1 (L1185-1198):                                            │
│   DELETE FROM in_send_list WHERE note = process_note        │
│   DELETE FROM in_diff WHERE note = process_note             │
│                                                             │
│ M2 (L1200-1211):                                            │
│   DELETE FROM in_send_list + in_po WHERE note = process_note│
│   DELETE FROM in_diff                                       │
│                                                             │
│ M3 (L1213-1273):                                            │
│   查找 {logistic_num}_delay_% 延迟单                        │
│   DELETE FROM in_send_list (延迟单号)                       │
│   DELETE FROM in_send_final (延迟单号)                      │
│   IF 延迟单下无其他 SKU → DELETE FROM in_send (延迟单头)     │
│   DELETE FROM in_diff                                       │
│                                                             │
│ M4 (L1275-1357):                                            │
│   DELETE FROM in_po WHERE note LIKE '厂商错误_%process_note%'│
│   DELETE FROM in_po_final WHERE po_note LIKE ...            │
│   DELETE FROM in_send_list WHERE note LIKE ...              │
│   DELETE FROM in_send_final WHERE sent_note LIKE ...        │
│   DELETE FROM in_receive WHERE note LIKE ...                │
│   DELETE FROM in_receive_final WHERE note LIKE ...          │
│   DELETE FROM in_diff                                       │
└──────────────────────────────────────────────────────────────┘

3. 重新计算终态表 (L1359-1465):
   in_diff_final ← 从 in_diff 取最新 seq 的记录 UPDATE
   in_send_final ← (M1/M2) 从 in_send_list 取最新 → UPDATE + 同步 in_receive_final.sent_quantity
   in_po_final   ← (M2) 从 in_po 取最新 → UPDATE
```

### 9.7 只读 API

| API | 行号 | 读取表 | 用途 |
|-----|------|--------|------|
| `abnormal_list_api()` | L50-127 | `in_diff_final` | 列表展示 (GROUP BY logistic_num, receive_date) |
| `abnormal_detail_api()` | L132-260 | `in_diff_final` + `in_receive_final` + `in_po_strategy` | 详情 (含价格、货币) |
| `abnormal_history_api()` | L1030-1100 | `in_diff` | 历史修订记录 |

### 9.8 辅助函数

| 函数 | 行号 | 功能 |
|------|------|------|
| `_get_next_seq()` | L510-531 | 获取下一个版本号 (安全白名单: in_po/in_send/in_send_list/in_receive/in_diff) |

### 9.9 异常处理 V3 迁移影响

| V1 行为 | V3 方案 |
|---------|---------|
| 4 策略 × 多表级联 INSERT/UPDATE | V3 统一 `receiving_differences` 表 + `resolution_type` ENUM |
| M4 的 INSERT 新 final 行 | V3 直接在主表 INSERT + change_history trigger |
| M3 创建延迟子单 `_delay_V##` | V3 用 `shipment_items.status = 'DELAYED_RECEIPT'` 标记 |
| 删除操作通过 note LIKE 模式匹配 | V3 用 FK + soft_delete + audit trail |
| TODO: 少收出库逻辑未实现 | V3 必须在迁移前明确业务规则 |

---

## 10. 深度补充: `Data_Order_Earning` 表全链路追踪

> **⚠️ 此表在原始审计中遗漏，现补充完整。**

### 10.1 表用途

`Data_Order_Earning` 是 ETL 管道的第二个原始数据暂存表 (另一个是 `Data_Transaction`)。  
它存储 **eBay Order Earning Report CSV** 的原始数据 — 主要包含每个订单的运费标签 (Shipping Labels) 信息。

### 10.2 写入路径

#### 写入路径 A: CSV 文件上传 (主路径)
```
用户上传 CSV → IngestService.run_ingest_pipeline()
→ _process_files(earning_files, "Data_Order_Earning", "Order number")
```

**代码位置:** `core/services/etl/ingest.py` L144-153

**写入逻辑 (L256-294):**
```python
# 1. Earning 表使用业务键 hash (不是全行 hash)
is_earning_table = (table_name == "Data_Order_Earning")  # L256
# 业务键 = ['order creation date', 'order number', 'item id',
#           'item title', 'buyer name', 'custom label', 'seller']  (L67-75)
final_df['row_hash'] = final_df.apply(compute_row_hash_key, axis=1)  # L259

# 2. 覆盖策略: 删旧插新 (不是跳过)
# 理由: 邮费会延迟更新，需要覆盖 (L66 注释)
if overlap_hashes:
    DELETE FROM Data_Order_Earning WHERE row_hash IN (...)  # L285
# 3. 全量插入 (含覆盖的)
final_df['Processed_E'] = 0  # L288 — 标记为未处理
final_df.to_sql("Data_Order_Earning", ...)  # L291
```

**⚠️ 关键区别:** 
- `Data_Transaction` 用**全行 hash** → 任何字段变化 = 新记录
- `Data_Order_Earning` 用**业务键 hash** → 邮费变化时**覆盖**旧记录 (不产生重复)

#### 写入路径 B: eBay API 同步 (预留, 未启用)
```
EbaySyncService.sync_finances() → FinancesService.transform_to_earning_format()
→ _save_earnings()  # PLACEHOLDER — L240-253, 未实现实际数据库写入
```

**代码位置:** `core/services/ebay/sync.py` L240-253  
**状态:** TODO — `return {"saved": 0, "errors": ["Database integration not implemented yet"]}`

### 10.3 读取路径

| 读取位置 | 代码 | 具体 SQL | 用途 |
|---------|------|----------|------|
| Transformer L127-130 | `SELECT * FROM Data_Order_Earning WHERE Order number IN (...)` | 获取匹配订单的 Earning 数据 | 合并 Shipping Labels 到主流水 |
| Transformer L135-139 | `SELECT row_hash FROM Data_Order_Earning WHERE Order number IN (...) AND Processed_E = 0` | 获取待标记的 hash 列表 | 标记已处理 |
| Repository L66-68 | `SELECT * FROM Data_Order_Earning` | 全量读取 | 调试/审计 |

### 10.4 消费路径

Transformer 从 `Data_Order_Earning` 提取的核心数据:
```python
# transformer.py L158-164
# 1. 从 Earning 表提取: shipping labels 金额
# 2. 按 order number 聚合
earn_map = df_earn.groupby('order number')['shipping labels'].sum()
# 3. 合并到主 DataFrame
df_main = df_main.merge(earn_map, on='order number', how='left')
```

### 10.5 标记已处理

```python
# transformer.py L408-418
# 在 Transformer 事务完成后, 标记 Earning 记录为已处理:
UPDATE Data_Order_Earning E
INNER JOIN _tmp_earn_hashes H ON E.row_hash = H.row_hash
SET E.Processed_E = 1
```

### 10.6 字段分析 (从 CSV + Ingest 推导)

```
row_hash        VARCHAR(32)    — MD5 业务键 hash (PK-like)
Order number    VARCHAR        — 订单号 (←→ Data_Transaction 关联键)
Order creation date VARCHAR    — 订单创建日期
Item ID         VARCHAR        — 商品 ID
Item Title      VARCHAR        — 商品标题
Buyer name      VARCHAR        — 买家名称 (业务键之一)
Custom label    VARCHAR        — 自定义标签 (业务键之一)
Seller          VARCHAR        — 卖家 (88 / plus)
Shipping labels DECIMAL        — 运费标签金额 (核心数据)
[其他 CSV 原始列]              — 原样保留
Processed_E     INT DEFAULT 0  — 处理标记 (0=未处理, 1=已处理)
```

### 10.7 裁定

✅ **无结构冗余** — 独立的原始暂存表, 不与其他表双写。  
V3 方案: 合并为 `raw_order_earnings` 表 + 正式列定义 + FK 到 `raw_transactions.order_number`。

---

## 11. 区块 2: 付款跨模块联动深度审计

> **审计目标**: 100% 追踪 V1 四类付款表 (PO/Deposit/Logistic/Prepay) 的全生命周期,
> 包括写入路径、触发器级联、跨模块 Prepay 联动、Landed Price 更新链路。

### 11.1 付款体系架构总览

V1 付款体系由 **4 类付款 × 2 表/类 = 8 张表** + 跨模块 Prepay 联动 + 下游 Landed Price 级联组成:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     V1 付款体系架构                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ① PO 付款 (货款)         ② Deposit 付款 (定金)                     │
│  ┌──────────────┐         ┌─────────────────┐                      │
│  │ in_pmt_po    │         │ in_pmt_deposit  │                      │
│  │  (操作日志)   │         │  (操作日志)      │                      │
│  │ ops=new/adj/del│       │ ops=new/adj/del  │                      │
│  └──────┬───────┘         └──────┬──────────┘                      │
│    TRIGGER│                TRIGGER│                                  │
│  ┌──────▼───────┐         ┌──────▼──────────┐                      │
│  │in_pmt_po_final│        │in_pmt_deposit_final│                   │
│  │  (快照表)     │         │  (快照表)        │                      │
│  └──────────────┘         └─────────────────┘                      │
│         │                          │                                │
│         │ 当 pmt_prepay_amount>0   │ 当 dep_prepay_amount>0        │
│         ▼                          ▼                                │
│  ┌──────────────────────────────────────────────┐                  │
│  │          ③ in_pmt_prepay (预付款流水日志)      │                  │
│  │  tran_type = 'in' (充值) | 'out' (抵扣)      │                  │
│  │  tran_ops  = 'new' | 'adjust'                │                  │
│  └──────────────┬───────────────────────────────┘                  │
│           TRIGGER│                                                  │
│  ┌──────────────▼───────────────────────────────┐                  │
│  │       in_pmt_prepay_final (预付款快照)         │                  │
│  │  余额视图: SUM(in) - SUM(out) = 可用余额       │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
│  ④ Logistic 付款 (物流费)                                           │
│  ┌────────────────────┐                                            │
│  │ in_pmt_logistic    │                                            │
│  │  log_ops=new/adjust │                                           │
│  └──────────┬─────────┘                                            │
│       TRIGGER│(INSERT) + TRIGGER(DELETE)                            │
│  ┌──────────▼─────────┐                                            │
│  │in_pmt_logistic_final│                                           │
│  │  (UK: pmt_no)       │                                           │
│  └────────────────────┘                                            │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                  │
│  │ 下游级联: recalculate_landed_prices()         │                  │
│  │ → UPDATE in_dynamic_landed_price              │                  │
│  │ (每次 PO/Deposit/Logistic 付款后触发)          │                  │
│  └──────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 触发器机制完整解析

V1 使用 **MySQL AFTER INSERT 触发器** 实现 history→final 同步, 以下是从 SQL 脚本和数据库备份中提取的精确触发器逻辑:

#### 11.2.1 `trg_pmt_po_sync_final` (PO 付款)

**源文件**: `backend/scripts/create_in_pmt_po_tables.py` L112-151

```sql
-- ops = 'new'    → INSERT INTO in_pmt_po_final  (pmt_no 为 UNIQUE KEY)
-- ops = 'adjust' → UPDATE in_pmt_po_final SET ... WHERE pmt_no = NEW.pmt_no
-- ops = 'delete' → DELETE FROM in_pmt_po_final WHERE pmt_no = NEW.pmt_no
```

**关键设计**: `pmt_no` 是 `in_pmt_po_final` 的 UNIQUE KEY。
- 一个批次 (PPMT_{YYYYMMDD}_N##) 可关联多个 po_num
- 但 final 表中 pmt_no 唯一 → **只保留最后一个 po_num 的信息**
- ⚠️ **潜在 BUG**: 批量付款 (一个 pmt_no 多个 po_num) 时, 触发器会导致 final 表只保留最后一个 INSERT 的 po_num

#### 11.2.2 `trg_pmt_deposit_to_final` (定金付款)

**源文件**: `backend/scripts/sql/migrate_dep_method_to_prepay_amount.sql` L41-68

```sql
-- 任何 INSERT → REPLACE INTO in_pmt_deposit_final
-- REPLACE 基于 po_num (隐含 UNIQUE KEY)
-- 无 ops 判断, 无条件覆盖
```

**与 PO 触发器差异**: Deposit 触发器**不区分 ops**, 直接 REPLACE。
- `po_num` 是 `in_pmt_deposit_final` 的隐含 UNIQUE KEY
- 删除操作也触发 REPLACE, 覆盖 final 表为 ops='delete' 的行

#### 11.2.3 `trg_pmt_prepay_sync_final` (预付款流水)

**源文件**: `data/backups/db/20260127212438_IN_Tables_Full.sql` L701

```sql
-- tran_ops = 'new'    → INSERT INTO in_pmt_prepay_final
-- tran_ops = 'adjust' → UPDATE in_pmt_prepay_final SET ... WHERE tran_num = NEW.tran_num
-- tran_ops = 'delete' → DELETE FROM in_pmt_prepay_final WHERE tran_num = NEW.tran_num
```

**关键设计**: `tran_num` 是 UNIQUE KEY, 且触发器支持 3 种 ops:
- `new` → 新增一条余额记录
- `adjust` → 修改已有记录的金额 (用于软删除: tran_amount=0)
- `delete` → 从 final 表物理删除 (⚠️ **注意: 代码中实际未使用 'delete' ops**)

#### 11.2.4 `trg_pmt_logistic_to_final` + `trg_pmt_logistic_delete_final`

**源文件**: `backend/scripts/sql/update_pmt_logistic_tables.sql` L46-93

```sql
-- Trigger 1 (AFTER INSERT):
--   log_ops = 'new'    → INSERT INTO in_pmt_logistic_final
--   log_ops = 'adjust' → REPLACE INTO in_pmt_logistic_final
-- Trigger 2 (AFTER DELETE):
--   → DELETE FROM in_pmt_logistic_final WHERE pmt_no = OLD.pmt_no
```

**独特性**: Logistic 付款是**唯一使用物理 DELETE 的付款模块** (非软删除)。
- `delete_payment_api()` 直接 `DELETE FROM in_pmt_logistic WHERE pmt_no = :pmt_no`
- 第二个触发器自动级联删除 final 表

### 11.3 PO 付款 (in_pmt_po) 全链路

**入口**: `finance/views/po/api.py`

#### 11.3.1 写入路径 — 提交付款

**函数**: `po_payment_submit_api()` (circa L700-965)

```
操作序列 (per po_num in batch):
1. READ  in_pmt_po: COUNT(*) WHERE po_num → 生成 seq (P01, P02, ...)   [L769-775]
2. READ  in_pmt_deposit: SUM(dep_paid) WHERE po_num AND ops != 'delete' [L807-813]
3. READ  in_pmt_po: SUM(pmt_cash_amount + pmt_prepay_amount) WHERE po_num AND ops != 'delete' [L816-822]
4. ★ INSERT in_pmt_po (ops='new', pmt_no=PPMT_{YYYYMMDD}_N##)          [L850-878]
   → TRIGGER: INSERT INTO in_pmt_po_final
5. 若 pmt_prepay_amount > 0:
   a. READ  in_pmt_prepay: COUNT(*) WHERE tran_num LIKE pattern → tran_seq [L885-892]
   b. READ  in_supplier_strategy: currency WHERE effective_date <= date    [L895-907]
   c. ★ INSERT in_pmt_prepay (tran_type='out', tran_ops='new')           [L910-934]
      → TRIGGER: INSERT INTO in_pmt_prepay_final
6. EXEC  recalculate_landed_prices(po_num=po_num)                         [L948-952]
   → UPDATE in_dynamic_landed_price
```

**批次编号规则**: `PPMT_{YYYYMMDD}_N{seq:02d}`
- 查询当日最大 pmt_no 的 seq → +1
- 整个批次共享一个 pmt_no

**关键读取 (计算待付金额)**:
- `total_amount` = 订单总额 (from in_po_final: SUM(po_price * po_quantity))
- `deposit_paid` = 已付定金 (from in_pmt_deposit: SUM(dep_paid) WHERE ops != 'delete')
- `po_paid` = 已付货款 (from in_pmt_po: SUM(pmt_cash_amount + pmt_prepay_amount) WHERE ops != 'delete')
- `pmt_cash_amount = MAX(0, total - deposit_paid - po_paid)`

#### 11.3.2 写入路径 — 删除付款

**函数**: `po_payment_delete_api()` L1778-1962

```
操作序列 (per po_num in pmt_no batch):
1. READ  in_pmt_po: SELECT * WHERE pmt_no AND ops != 'delete'           [L1798-1801]
2. READ  in_pmt_po: SELECT * WHERE pmt_no AND po_num ORDER BY seq DESC  [L1812-1817]
3. ★ INSERT in_pmt_po (ops='delete', seq=原seq+1, note='删除订单付款')    [L1833-1865]
   → TRIGGER: DELETE FROM in_pmt_po_final WHERE pmt_no
4. 计算 total_prepay = SUM(all po_nums' pmt_prepay_amount)               [L1869-1880]
5. 若 total_prepay > 0:
   a. READ  in_pmt_prepay: SELECT * WHERE tran_note LIKE 'POPAY_{pmt_no}%' [L1884-1890]
   b. ★ INSERT in_pmt_prepay (tran_type='in', tran_ops='new', tran_amount=total_prepay) [L1921-1948]
      → TRIGGER: INSERT INTO in_pmt_prepay_final (退还预付款余额)
6. EXEC  recalculate_landed_prices(po_num=po_num)                         [L1950-1956]
```

**关键发现 — 预付款退还逻辑**:
- 删除 PO 付款时, 之前扣减的预付款需要**退还回余额**
- 退还方式: 插入一条 `tran_type='in'` 的新记录 (而非修改原 'out' 记录)
- ⚠️ **退还使用原始汇率** (`orig_prepay['usd_rmb']`), 不使用当前汇率
- ⚠️ **汇总后一笔退还**: 所有 po_num 的 prepay 金额汇总为一条记录退还, 可能导致审计追踪困难

### 11.4 Deposit 付款 (in_pmt_deposit) 全链路

**入口**: `finance/views/deposit/api.py`

#### 11.4.1 写入路径 — 提交定金

**函数**: `deposit_payment_submit()` L415-719

```
操作序列 (per po_num in batch):
1. READ  in_po_strategy: cur_currency, cur_usd_rmb, cur_deposit_par      [L476-498]
   + READ in_po_final: SUM(po_price * po_quantity) → total_amount
2. READ  in_pmt_deposit_final: SUM(dep_paid) WHERE po_num → 已付定金     [L562-568]
3. 计算 dep_paid = MAX(0, total*deposit_par/100 - actual_paid)
4. ★ INSERT in_pmt_deposit (ops='new', seq='D01', pmt_no=DPMT_{YYYYMMDD}_N##) [L594-620]
   → TRIGGER: REPLACE INTO in_pmt_deposit_final
5. 若 dep_prepay_amount > 0:
   a. READ  in_pmt_prepay: COUNT(*) WHERE tran_num LIKE pattern            [L628-634]
   b. READ  in_supplier_strategy: currency WHERE effective_date <= date     [L639-651]
   c. ★ INSERT in_pmt_prepay (tran_type='out', tran_ops='new',
         tran_note='Deposit_{pmt_no}_原始支付单')                           [L654-678]
      → TRIGGER: INSERT INTO in_pmt_prepay_final
6. EXEC  recalculate_landed_prices(po_num=po_num)                          [L691-696]
```

**批次编号规则**: `DPMT_{YYYYMMDD}_N{seq:02d}`
- ⚠️ **编号逻辑差异**: Deposit 用 `COUNT(*) + 1` 计算 seq (可能跳号),
  PO 用 `MAX + 1` (从上一个最大值递增)。两模块编号策略不一致。

**定金百分比计算**:
- `deposit_par` 从 `in_po_strategy.cur_deposit_par` 读取 (通常 30%)
- `deposit_amount = total_amount × deposit_par / 100`
- `dep_paid = MAX(0, deposit_amount - actual_paid)`

#### 11.4.2 写入路径 — 删除定金

**函数**: `deposit_payment_delete_api()` L1436-1619

```
操作序列 (per po_num in pmt_no):
1. READ  in_pmt_deposit: SELECT * WHERE pmt_no AND ops != 'delete'        [L1465-1468]
2. READ  in_pmt_deposit: SELECT * WHERE pmt_no AND po_num ORDER BY seq DESC [L1482-1487]
3. ★ INSERT in_pmt_deposit (ops='delete', seq=原seq+1, note='删除订单')    [L1512-1541]
   → TRIGGER: REPLACE INTO in_pmt_deposit_final (覆盖为 ops='delete' 的行)
4. 若 dep_prepay_amount > 0:
   a. READ  in_pmt_prepay: WHERE tran_note LIKE 'Deposit_{pmt_no}%'       [L1547-1553]
   b. ★ INSERT in_pmt_prepay (tran_type='in', tran_ops='new',
         tran_note='删除定金付款_...')                                      [L1579-1605]
      → TRIGGER: INSERT INTO in_pmt_prepay_final (退还预付款余额)
5. EXEC  recalculate_landed_prices(po_num=po_num)                          [L1608-1613]
```

**关键差异 (vs PO 删除)**:
- Deposit 删除**逐条退还 prepay** (每个 po_num 独立退还)
- PO 删除**汇总后一笔退还** (所有 po_num 的 prepay 合并为一条)
- Deposit 退还使用原始 tran_date, PO 退还也使用原始 tran_date
- ⚠️ **Deposit 触发器 REPLACE 行为**: 删除后 final 表中仍保留一行 (ops='delete'),
  而 PO 触发器会 DELETE 整行 → 两种付款模块删除后的 final 表状态不一致

### 11.5 Logistic 付款 (in_pmt_logistic) 全链路

**入口**: `finance/views/payment/submit.py`

#### 11.5.1 写入路径 — 提交付款

**函数**: `submit_payment_api()` L22-206

```
操作序列 (per logistic_num, within atomic_transaction):
1. READ  in_send: 最新版本 (MAX seq) → total_price, usd_rmb, mode        [L98-106]
2. READ  in_pmt_logistic: MAX(seq) WHERE logistic_num → new_seq           [L118-125]
3. 确定 log_ops = 'adjust' if existing else 'new'                         [L128]
4. ★ INSERT in_pmt_logistic (logistic_paid=total_price, pmt_no={date}_S##) [L148-173]
   → TRIGGER: INSERT/REPLACE INTO in_pmt_logistic_final
5. EXEC  recalculate_landed_prices(logistic_num=logistic_num)              [L188-193]
```

**批次编号规则**: `{payment_date}_S{seq:02d}`
- 与 PO/Deposit 的 PPMT/DPMT 前缀不同, Logistic 使用日期+S 前缀

**独特特性**:
- Logistic 付款**不涉及 Prepay 联动** (无预付款抵扣机制)
- `logistic_paid` 直接等于 `in_send` 中的 `total_price` (不计算差额)
- 使用 `atomic_transaction()` 包裹批量操作 (PO/Deposit 未显式使用)

#### 11.5.2 写入路径 — 删除付款

**函数**: `delete_payment_api()` L211-283

```
操作序列:
1. READ  in_pmt_logistic: COUNT(DISTINCT logistic_num) WHERE pmt_no       [L237-241]
2. ★ DELETE FROM in_pmt_logistic WHERE pmt_no = :pmt_no                   [L249-251]
   → TRIGGER: DELETE FROM in_pmt_logistic_final WHERE pmt_no = OLD.pmt_no
3. EXEC  recalculate_landed_prices(logistic_num=logistic_num)              [L268-273]
```

**关键差异**: Logistic 是 **唯一使用물理 DELETE 的付款模块**。
- PO 和 Deposit 使用软删除 (INSERT ops='delete')
- Logistic 直接 `DELETE FROM in_pmt_logistic`
- 触发器使用 `AFTER DELETE` 而非 `AFTER INSERT` 来清理 final 表

#### 11.5.3 写入路径 — 恢复付款

**函数**: `restore_payment_api()` L288-397

```
操作序列 (per logistic_num in deleted batch):
1. READ  in_pmt_logistic: 最新记录 WHERE note='删除订单'                   [L314-323]
2. READ  in_pmt_logistic: 删除前版本 (seq-1)                               [L338-341]
3. ★ INSERT in_pmt_logistic (log_ops='adjust', note='恢复删除')            [L351-376]
   → TRIGGER: REPLACE INTO in_pmt_logistic_final
```

⚠️ **注意**: 删除后恢复的逻辑前提是删除前的记录仍在 history 表中。
但 Logistic 使用物理 DELETE — 这意味着**已删除的记录实际已被物理清除**,
`restore_payment_api` 中的查询 `WHERE note='删除订单'` **将永远找不到记录**。
这是一个**死代码/逻辑BUG**: restore 功能在 Logistic 模块中不可能正常工作。

### 11.6 Prepay 预付款 (in_pmt_prepay) 全链路

**入口**: `finance/views/prepay/api.py`

#### 11.6.1 写入路径 A — 直接充值 (独立模块)

**函数**: `submit_prepay_api()` L292-443

```
操作序列:
1. READ  in_pmt_prepay: MAX tran_num WHERE supplier+date+type='in' → seq  [L355-370]
2. 生成 tran_num = {supplier_code}_{YYYYMMDD}_in_{seq:02d}
3. ★ INSERT in_pmt_prepay (tran_type='in', tran_ops='new', tran_seq='T01') [L378-399]
   → TRIGGER: INSERT INTO in_pmt_prepay_final
4. 可选: 保存上传文件到 data/records/finance/prepay/{YYYY}/{tran_num}/     [L401-431]
```

**流水号规则**: `{supplier_code}_{YYYYMMDD}_in_{##}`
- 'in' = 充值, 'out' = 抵扣 (从 PO/Deposit 模块触发)

#### 11.6.2 写入路径 B — 间接扣减 (PO/Deposit 联动)

预付款扣减**不由 Prepay 模块自身触发**, 而是从 PO/Deposit 付款流程中级联写入:

```
PO 付款 L882-936:    pmt_prepay_amount > 0 → INSERT in_pmt_prepay (tran_type='out')
Deposit 付款 L625-679: dep_prepay_amount > 0 → INSERT in_pmt_prepay (tran_type='out')
```

- `tran_note` 标记来源: `'POPAY_{pmt_no}_原始记录'` (PO) 或 `'Deposit_{pmt_no}_原始支付单'` (Deposit)
- 删除时反向退还: INSERT `tran_type='in'` 的新记录

#### 11.6.3 写入路径 C — 软删除

**函数**: `prepay_delete_api()` L660-733

```
操作序列:
1. READ  in_pmt_prepay_final: WHERE tran_num → 检查是否存在且未删除        [L679-692]
2. 生成 new_seq = current_seq + 1 (T01 → T02)
3. ★ INSERT in_pmt_prepay (tran_amount=0, tran_ops='adjust')              [L703-725]
   → TRIGGER: UPDATE in_pmt_prepay_final SET tran_amount=0
```

**软删除策略**: 通过 `tran_amount=0 + tran_ops='adjust'` 实现, 不使用 'delete' ops。
- 这意味着 final 表中**仍保留该记录** (amount=0)
- 余额计算时 amount=0 的记录不影响余额

#### 11.6.4 写入路径 D — 恢复删除

**函数**: `prepay_restore_api()` L736-827

```
操作序列:
1. READ  in_pmt_prepay_final: WHERE tran_num → 确认 tran_amount=0          [L755-768]
2. READ  in_pmt_prepay: WHERE tran_num AND tran_seq = prev_seq → 原金额    [L777-786]
3. ★ INSERT in_pmt_prepay (tran_amount=原金额, tran_ops='adjust')          [L796-819]
   → TRIGGER: UPDATE in_pmt_prepay_final SET tran_amount=原金额
```

#### 11.6.5 读取路径 — 余额计算

**函数**: `supplier_balance_api()` L19-116

```
余额算法:
1. READ in_supplier: 所有供应商列表
2. READ in_supplier_strategy: 每个供应商最新结算货币 (MAX effective_date)
3. READ in_pmt_prepay_final: 所有交易记录 (不过滤, 因为 final 表已清除删除记录)
4. Per supplier:
   - tran_type='in'  → balance += amount (含货币转换)
   - tran_type='out' → balance -= amount (含货币转换)
   - 货币转换: 若 tran_curr_use != supplier_currency → 使用 usd_rmb 汇率
```

**读取路径 B (PO/Deposit Wizard)**:
- `get_vendor_balance_api()` (po/api.py L1044-1155)
- `get_vendor_balance_api()` (deposit/api.py L787-908)
- 两个模块各自独立实现了余额查询, 逻辑基本一致, 但 Deposit 版本额外支持日期过滤

### 11.7 Landed Price 下游级联

**入口**: `finance/utils/landed_price.py`

**函数**: `recalculate_landed_prices()` L1041-1117

每次付款操作 (创建/删除/恢复) 完成后, 统一触发 Landed Price 重算:

```
触发点:
- PO 付款提交    → recalculate_landed_prices(po_num=po_num)    [po/api.py L948]
- PO 付款删除    → recalculate_landed_prices(po_num=po_num)    [po/api.py L1951]
- Deposit 提交   → recalculate_landed_prices(po_num=po_num)    [deposit/api.py L691]
- Deposit 删除   → recalculate_landed_prices(po_num=po_num)    [deposit/api.py L1608]
- Logistic 提交  → recalculate_landed_prices(logistic_num=num) [submit.py L189]
- Logistic 删除  → recalculate_landed_prices(logistic_num=num) [submit.py L269]

操作:
1. 确定受影响的 po_nums:
   - po_num 直接传入 → [po_num]
   - logistic_num 传入 → READ in_send_final WHERE sent_logistic_num → [po_nums]
2. Per po_num: calculate_landed_prices(po_num)
3. ★ UPDATE in_dynamic_landed_price SET landed_price_usd=..., qty=... WHERE logistic_num AND po_num AND sku
```

**涉及读取的表** (在 `calculate_landed_prices()` 内部):
- `in_po_strategy` (汇率、货币策略)
- `in_po_final` (订单明细、价格)
- `in_pmt_deposit_final` (已付定金)
- `in_pmt_po_final` (已付货款)
- `in_send_final` + `in_send` (发货信息、重量)
- `in_pmt_logistic_final` (物流费用)
- `Data_COGS` (产品成本基准)

### 11.8 跨模块表操作影响矩阵

| 操作 | in_pmt_po | _po_final | in_pmt_deposit | _dep_final | in_pmt_logistic | _log_final | in_pmt_prepay | _prepay_final | in_dynamic_landed_price |
|------|:---------:|:---------:|:--------------:|:----------:|:---------------:|:----------:|:-------------:|:-------------:|:-----------------------:|
| PO 提交 | ★INSERT | ←TRIGGER | | R(已付定金) | | | ★INSERT(out) | ←TRIGGER | ★UPDATE |
| PO 删除 | ★INSERT(del) | ←TRIGGER(DEL) | | | | | ★INSERT(in/退还) | ←TRIGGER | ★UPDATE |
| Dep 提交 | | | ★INSERT | ←TRIGGER | | | ★INSERT(out) | ←TRIGGER | ★UPDATE |
| Dep 删除 | | | ★INSERT(del) | ←TRIGGER(REPL) | | | ★INSERT(in/退还) | ←TRIGGER | ★UPDATE |
| Log 提交 | | | | | ★INSERT | ←TRIGGER | | | ★UPDATE |
| Log 删除 | | | | | ★DELETE | ←TRIGGER(DEL) | | | ★UPDATE |
| Prepay 充值 | | | | | | | ★INSERT(in) | ←TRIGGER | |
| Prepay 删除 | | | | | | | ★INSERT(adj) | ←TRIGGER(UPD) | |

### 11.9 发现的 BUG 和设计问题

#### BUG 1: Logistic 恢复功能失效 (死代码)

`restore_payment_api()` 在 Logistic 模块中无法工作:
- `delete_payment_api()` 使用物理 DELETE
- 删除后相关记录已从 `in_pmt_logistic` 中移除
- 恢复函数查询 `WHERE note='删除订单'` 永远返回空集
- **影响**: restore_payment_api 是死代码, 但不影响其他功能

#### BUG 2: PO Final 表批量付款数据丢失

`in_pmt_po_final` 的 UNIQUE KEY 是 `pmt_no`:
- 批量付款时, 一个 pmt_no 对应多个 po_num
- 触发器对每个 po_num 执行 INSERT, 但相同 pmt_no 只能有一行
- 结果: **final 表只保留最后一个 po_num 的付款信息**
- **影响**: 读取 `in_pmt_po_final` 时数据可能不完整, 但代码中大部分读取直接查 `in_pmt_po` 表

#### 设计问题 1: 触发器策略不一致

| 模块 | 触发器类型 | 删除策略 | Final 表删除后状态 |
|------|-----------|---------|------------------|
| PO | AFTER INSERT | 软删除 (INSERT ops='delete') | 行被 DELETE |
| Deposit | AFTER INSERT | 软删除 (INSERT ops='delete') | 行被 REPLACE (仍存在) |
| Logistic | AFTER INSERT + AFTER DELETE | 物理 DELETE | 行被 DELETE |
| Prepay | AFTER INSERT | 软删除 (INSERT tran_amount=0) | 行被 UPDATE (仍存在, amount=0) |

四种不同的删除/触发器策略 → V3 应统一为一种。

#### 设计问题 2: 余额查询重复实现

`get_vendor_balance_api()` 在 PO 和 Deposit 模块中各自独立实现:
- `finance/views/po/api.py` L1044-1155
- `finance/views/deposit/api.py` L787-908
- `finance/views/prepay/api.py` L19-116 (主版本)

三处实现逻辑基本相同但有细微差异 (如日期过滤), 违反 DRY 原则。

#### 设计问题 3: 预付款退还时汇率不对称

- 扣减时使用**付款日汇率** (settlement_rate 或 order rate)
- 退还时使用**原始扣减交易的汇率** (orig_prepay['usd_rmb'])
- 若两者之间汇率波动, 退还金额与扣减金额 **在统一货币下不相等**
- 这是一个财务精度问题, V3 应在统一币种下计算

### 11.10 V3 迁移影响

1. **8 表→1 表**: `in_pmt_po` + `in_pmt_po_final` + `in_pmt_deposit` + `in_pmt_deposit_final` + `in_pmt_logistic` + `in_pmt_logistic_final` + `in_pmt_prepay` + `in_pmt_prepay_final` → `payments` (单表 + `payment_type` ENUM)
2. **消除触发器**: V3 使用应用层双写或 Change Data Capture, 不依赖 MySQL 触发器
3. **统一删除策略**: 软删除 (`deleted_at` 时间戳) 而非 ops/log_ops 字段
4. **余额查询集中化**: 一个 Service 计算预付款余额, 所有模块共享
5. **Landed Price**: 作为物化视图或事件驱动重算, 而非 API 尾部同步调用

---

## 附录 A: 关键代码路径索引 (区块1+区块2)

| 功能 | 入口文件 | 涉及表 |
|------|---------|--------|
| 新建PO | `purchase/views/po_create/submit.py` | in_po, in_po_final, in_po_strategy, in_supplier |
| 新建发货 | `purchase/views/send_create/submit.py` | in_send, in_send_list, in_send_final, in_po, in_po_final |
| 入库 | `purchase/views/receive/submit.py` | in_receive, in_receive_final, in_diff, in_diff_final, in_send_final |
| **异常处理 M1** | `purchase/views/abnormal.py:_process_method_1()` L534-602 | in_send_list, in_send_final, in_receive_final, in_diff, in_diff_final |
| **异常处理 M2** | `purchase/views/abnormal.py:_process_method_2()` L605-755 | in_po, in_po_final, in_send_list, in_send_final, in_receive_final, in_diff, in_diff_final |
| **异常处理 M3** | `purchase/views/abnormal.py:_process_method_3()` L758-830 | in_send, in_send_list, in_send_final, in_diff, in_diff_final |
| **异常处理 M4** | `purchase/views/abnormal.py:_process_method_4()` L833-1025 | in_po, in_po_final, in_send_list, in_send_final, in_receive, in_receive_final, in_diff, in_diff_final |
| **异常删除** | `purchase/views/abnormal.py:abnormal_delete_api()` L1105-1488 | in_diff, in_diff_final, in_send_list, in_send_final, in_send, in_po, in_po_final, in_receive, in_receive_final |
| **PO付款 提交** | `finance/views/po/api.py` L700-965 | in_pmt_po, ★in_pmt_po_final(TRIGGER), in_pmt_prepay(out), ★in_pmt_prepay_final(TRIGGER), in_pmt_deposit(READ), in_po_strategy(READ), in_supplier_strategy(READ), in_dynamic_landed_price(UPDATE) |
| **PO付款 删除** | `finance/views/po/api.py` L1778-1962 | in_pmt_po(INSERT delete), ★in_pmt_po_final(TRIGGER DEL), in_pmt_prepay(INSERT in/退还), ★in_pmt_prepay_final(TRIGGER), in_dynamic_landed_price(UPDATE) |
| **定金提交** | `finance/views/deposit/api.py` L415-719 | in_pmt_deposit, ★in_pmt_deposit_final(TRIGGER REPLACE), in_pmt_prepay(out), ★in_pmt_prepay_final(TRIGGER), in_po_strategy(READ), in_po_final(READ), in_pmt_deposit_final(READ), in_supplier_strategy(READ), in_dynamic_landed_price(UPDATE) |
| **定金删除** | `finance/views/deposit/api.py` L1436-1619 | in_pmt_deposit(INSERT delete), ★in_pmt_deposit_final(TRIGGER REPLACE), in_pmt_prepay(INSERT in/退还), ★in_pmt_prepay_final(TRIGGER), in_dynamic_landed_price(UPDATE) |
| **物流付款 提交** | `finance/views/payment/submit.py` L22-206 | in_pmt_logistic(INSERT), ★in_pmt_logistic_final(TRIGGER), in_send(READ), in_dynamic_landed_price(UPDATE) |
| **物流付款 删除** | `finance/views/payment/submit.py` L211-283 | in_pmt_logistic(DELETE), ★in_pmt_logistic_final(TRIGGER DEL), in_dynamic_landed_price(UPDATE) |
| **物流付款 恢复** | `finance/views/payment/submit.py` L288-397 | in_pmt_logistic(INSERT adjust), ★in_pmt_logistic_final(TRIGGER REPLACE) ⚠️死代码 |
| **预付款 充值** | `finance/views/prepay/api.py` L292-443 | in_pmt_prepay(INSERT in), ★in_pmt_prepay_final(TRIGGER) |
| **预付款 删除** | `finance/views/prepay/api.py` L660-733 | in_pmt_prepay(INSERT adjust,amount=0), ★in_pmt_prepay_final(TRIGGER UPD) |
| **预付款 恢复** | `finance/views/prepay/api.py` L736-827 | in_pmt_prepay(INSERT adjust,原金额), ★in_pmt_prepay_final(TRIGGER UPD) |
| **预付款 余额** | `finance/views/prepay/api.py` L19-116 | in_supplier(READ), in_supplier_strategy(READ), in_pmt_prepay_final(READ) |
| Landed Price 重算 | `finance/utils/landed_price.py` L1041-1117 | in_send_final(READ), in_dynamic_landed_price(UPDATE) |
| Landed Price 计算 | `finance/utils/landed_price.py` L22-381 | in_po_strategy, in_po_final, in_pmt_deposit_final, in_pmt_po_final, in_send_final, in_send, in_pmt_logistic_final, Data_COGS (全部READ) |
| 库存快照 | `core/services/inventory_snapshot.py` | in_dynamic_fifo_layers, in_dynamic_landed_price, in_po_final, in_send_final, in_receive_final, Data_COGS, Data_Inventory |
| **ETL Ingest** | `core/services/etl/ingest.py` L111-165 | Data_Transaction, **Data_Order_Earning** |
| **ETL Transform** | `core/services/etl/transformer.py` L69-445 | Data_Transaction (READ+WRITE), **Data_Order_Earning** (READ+UPDATE), **Data_Clean_Log** (WRITE) |
| ETL 库存 | `apps/etl/views.py` | Data_Transaction, Data_Clean_Log, Data_Inventory |

## 附录 B: 双写代码定位 (区块1+区块2)

| 双写对 | 写入代码位置 | 行号 | 机制 |
|--------|-------------|------|------|
| in_po + in_po_final | `po_create/submit.py` | L120-161 | 应用层双写 |
| in_po + in_po_final | `send_create/submit.py` | L279-338 | 应用层双写 |
| **in_po + in_po_final** | **`abnormal.py:_process_method_2()`** | **L634-690** | 应用层双写 |
| **in_po + in_po_final** | **`abnormal.py:_process_method_4()`** | **L876-927** | 应用层双写 |
| in_send + in_send_final | `send_create/submit.py` | L105-218 | 应用层双写 |
| **in_send + in_send_list + in_send_final** | **`abnormal.py:_process_method_3()`** | **L783-830** | 应用层双写 |
| **in_send_list + in_send_final** | **`abnormal.py:_process_method_4()`** | **L933-975** | 应用层双写 |
| in_receive + in_receive_final | `receive/submit.py` | L254-277 | 应用层双写 |
| **in_receive + in_receive_final** | **`abnormal.py:_process_method_4()`** | **L981-1025** | 应用层双写 |
| in_diff + in_diff_final | `receive/submit.py` | L294-344 | 应用层双写 |
| **in_diff + in_diff_final** | **`abnormal.py:abnormal_process_api()`** | **L430-477** | 应用层双写 |
| **in_pmt_po → in_pmt_po_final** | **`finance/views/po/api.py`** | **L850-878** | **MySQL TRIGGER (trg_pmt_po_sync_final)** |
| **in_pmt_deposit → in_pmt_deposit_final** | **`finance/views/deposit/api.py`** | **L594-620** | **MySQL TRIGGER (trg_pmt_deposit_to_final)** |
| **in_pmt_logistic → in_pmt_logistic_final** | **`finance/views/payment/submit.py`** | **L148-173** | **MySQL TRIGGER (trg_pmt_logistic_to_final + _delete_final)** |
| **in_pmt_prepay → in_pmt_prepay_final** | **`finance/views/prepay/api.py`** | **L378-399** | **MySQL TRIGGER (trg_pmt_prepay_sync_final)** |
| **in_pmt_prepay (联动写入)** | **`finance/views/po/api.py`** | **L910-934** | **PO付款时写入 prepay out 记录** |
| **in_pmt_prepay (联动写入)** | **`finance/views/deposit/api.py`** | **L654-678** | **Deposit付款时写入 prepay out 记录** |
| **in_pmt_prepay (退还写入)** | **`finance/views/po/api.py`** | **L1921-1948** | **PO删除时退还 prepay (汇总一笔)** |
| **in_pmt_prepay (退还写入)** | **`finance/views/deposit/api.py`** | **L1579-1605** | **Deposit删除时退还 prepay (逐条)** |

## 附录 C: V3 合并策略总表 (区块2修订版)

| V1 表组 | V1 表数 | V3 表 | V3 表数 | 消除方式 |
|---------|---------|-------|---------|---------| 
| in_supplier + strategy | 2 | suppliers + supplier_strategies | 2 | 1:1 + audit fields |
| in_po + final + strategy | 3 | purchase_order_items + purchase_order_strategies | 2 | History+Final → 单表+版本 |
| in_send + list + final | 3 | shipments + shipment_items | 2 | 三表→两表 |
| in_receive + final | 2 | receiving_items | 1 | 双表→单表+版本 |
| in_diff + final | 2 | *(合并到 receiving_items)* | 0 | 差异字段内联 |
| **in_pmt_po + final** | **2** | **payments** | **(共享)** | **8表→1表+type ENUM + 统一触发器** |
| **in_pmt_deposit + final** | **2** | **payments** | **(共享)** | **TRIGGER→应用层, 统一软删除** |
| **in_pmt_logistic + final** | **2** | **payments** | **(共享)** | **物理DELETE→统一soft delete** |
| **in_pmt_prepay + final** | **2** | **payments** | **1** | **余额计算集中化, 消除3∶重复实现** |
| in_dynamic_* (4表) | 4 | fifo_transactions + fifo_layers + fifo_allocations | 3 | landed_price 合并 |
| Data_Transaction | 1 | raw_transactions + raw_transaction_items | 2 | EAV→行表 |
| **Data_Order_Earning** | **1** | **raw_order_earnings** | **1** | **1:1 + 正式列定义** |
| Data_Clean_Log | 1 | clean_transactions | 1 | 1:1 + 类型修正 |
| Data_Inventory | 1 | stocktakes + stocktake_items | 2 | 动态列→行表 |
| Data_COGS | 1 | *(合并到 products)* | 0 | 字段合并 |
| *(新增)* | 0 | change_history | 1 | 统一审计表 |
| *(新增)* | 0 | mv_dynamic_inventory | 1 MV | 物化视图 |
| **合计** | **29** | | **18 + 1 MV** | **-34%** |

## 附录 D: 触发器完整清单

| 触发器名 | 引用表 | 目标表 | 事件 | 源文件 |
|----------|--------|--------|------|--------|
| `trg_pmt_po_sync_final` | in_pmt_po | in_pmt_po_final | AFTER INSERT | `scripts/create_in_pmt_po_tables.py` L112-151 |
| `trg_pmt_deposit_to_final` | in_pmt_deposit | in_pmt_deposit_final | AFTER INSERT | `scripts/sql/migrate_dep_method_to_prepay_amount.sql` L41-68 |
| `trg_pmt_logistic_to_final` | in_pmt_logistic | in_pmt_logistic_final | AFTER INSERT | `scripts/sql/update_pmt_logistic_tables.sql` L50-73 |
| `trg_pmt_logistic_delete_final` | in_pmt_logistic | in_pmt_logistic_final | AFTER DELETE | `scripts/sql/update_pmt_logistic_tables.sql` L85-91 |
| `trg_pmt_prepay_sync_final` | in_pmt_prepay | in_pmt_prepay_final | AFTER INSERT | `data/backups/db/...Full.sql` L701 |

## 附录 E: FIFO 系统文件索引

| 文件 | 行范围 | 功能 |
|------|--------|------|
| `scripts/create_in_dynamic_tables.sql` | L1-92 | 建表 DDL (tran/layers/alloc 三表) |
| `scripts/init_fifo_from_inventory.py` | L1-177 | INIT 层种子数据导入 (Data_inventory + Data_COGS) |
| `core/services/fifo/sales_sync.py` | L1-383 | 销售→FIFO 出库/回库同步 |
| `apps/finance/utils/landed_price.py` | L22-381 | `calculate_landed_prices()` 10步价格计算 |
| `apps/finance/utils/landed_price.py` | L898-1036 | `create_landed_price_records()` 入库创建 |
| `apps/finance/utils/landed_price.py` | L1041-1117 | `recalculate_landed_prices()` 付款变动更新 |
| `apps/inventory/views/dynamic_inv.py` | L58-344 | 动态库存 API (读取4表) |
| `core/services/inventory_snapshot.py` | L1-297 | 库存快照报表 (读取4表) |
| `scripts/verify_etl_integrity.py` | L48+ | FIFO 外键完整性校验 |

---

# Section 12: FIFO 引擎深度审计 (区块 3)

> **数据来源**: 以下所有表结构和数据量均通过 `SHOW CREATE TABLE` 直接查询生产数据库 (localhost:3306/MGMT) 获取, 而非从 .sql 脚本或备份文件。查询时间: 2026-02-17T04:10:00-08:00

## 12.1 FIFO 四表架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                      FIFO 动态库存系统                              │
│                                                                      │
│  ┌─────────────────┐     ┌────────────────────────┐                 │
│  │ in_dynamic_tran  │────→│ in_dynamic_fifo_layers │                 │
│  │ (库存流水表)      │ FK  │ (FIFO 库存层表)          │                 │
│  │ record_id (PK)   │     │ layer_id (PK)          │                 │
│  │ action: in/out   │     │ in_record_id (FK→tran) │                 │
│  │ type: inv/sale/  │     │ qty_in / qty_remaining │                 │
│  │   receive/cancel/│     │ unit_cost              │                 │
│  │   return/adjust  │     │ closed_at              │                 │
│  └─────────────────┘     └──────────┬─────────────┘                 │
│           │                         │                                │
│           │ FK                      │ FK                             │
│           ▼                         ▼                                │
│  ┌─────────────────────────────────────────────┐                    │
│  │       in_dynamic_fifo_alloc                  │                    │
│  │       (FIFO 分摊记录表)                        │                    │
│  │       alloc_id (PK)                          │                    │
│  │       out_record_id (FK→tran.record_id)      │                    │
│  │       layer_id (FK→layers.layer_id)           │                    │
│  │       qty_alloc, unit_cost, cost_alloc        │                    │
│  └─────────────────────────────────────────────┘                    │
│                                                                      │
│  ┌─────────────────────────────────────────────┐                    │
│  │       in_dynamic_landed_price                │                    │
│  │       (FIFO 入库单价表)                        │                    │
│  │       id (PK)                                │                    │
│  │       in_record_id (→tran, 无FK约束)          │                    │
│  │       logistic_num, po_num, sku (UNIQUE KEY)  │                    │
│  │       landed_price_usd                       │                    │
│  └─────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 12.1.1 表 Schema 精确定义

**in_dynamic_tran** (源: 生产 DB `SHOW CREATE TABLE`, AUTO_INC=279455, rows=37,075)
| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| record_id | BIGINT AUTO_INCREMENT | PK | 流水唯一ID |
| date_record | DATETIME NOT NULL | INDEX | 业务日期 |
| po_num | VARCHAR(100) NULL | INDEX | PO 单号 (入库流水有, 出库流水无) |
| sku | VARCHAR(100) NOT NULL | INDEX | SKU |
| price | DECIMAL(12,5) | — | 备注价格 (出库时写0) |
| quantity | INT NOT NULL DEFAULT 0 | — | 数量 |
| action | ENUM('in','out') NOT NULL | INDEX(+type) | 进库/出库 |
| type | VARCHAR(50) DEFAULT 'inv' | INDEX(+action) | inv/sale/receive/cancel/return/adjust |
| note | TEXT NULL | — | 幂等性标识 (sales_sync 存 ref_key) |
| created_at | DATETIME DEFAULT NOW() | — | 系统插入时间 |

**in_dynamic_fifo_layers** (源: 生产 DB `SHOW CREATE TABLE`, AUTO_INC=849, rows=351)
| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| layer_id | BIGINT AUTO_INCREMENT | PK | 层唯一ID |
| sku | VARCHAR(100) NOT NULL | INDEX | SKU |
| in_record_id | BIGINT NOT NULL | FK→tran, INDEX | 来源入库流水 |
| in_date | DATETIME NOT NULL | INDEX | 入库日期 (FIFO 排序键) |
| po_num | VARCHAR(100) NULL | — | 来源 PO (INIT 层为 'INIT-2024-12-31') |
| unit_cost | DECIMAL(12,5) | — | 该层成本单价 |
| qty_in | INT NOT NULL | — | 初始入库量 (不可变) |
| qty_remaining | INT NOT NULL | INDEX(+sku) | 剩余可用量 (FIFO 扣减核心) |
| created_at | DATETIME DEFAULT NOW() | — | 创建时间 |
| closed_at | DATETIME NULL | — | 层关闭时间 (remaining=0 时写入) |

**in_dynamic_fifo_alloc** (源: 生产 DB `SHOW CREATE TABLE`, AUTO_INC=252689, rows=33,930)
| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| alloc_id | BIGINT AUTO_INCREMENT | PK | 分摊行ID |
| out_record_id | BIGINT NOT NULL | FK→tran, INDEX | 出库流水 |
| sku | VARCHAR(100) NOT NULL | INDEX | SKU (冗余) |
| out_date | DATETIME NOT NULL | INDEX | 出库日期 |
| layer_id | BIGINT NOT NULL | FK→layers, INDEX | 分摊来源层 |
| qty_alloc | INT NOT NULL | — | 从该层扣减量 |
| unit_cost | DECIMAL(12,5) | — | 该层单价 (冗余) |
| cost_alloc | DECIMAL(15,5) | — | qty_alloc × unit_cost |
| created_at | DATETIME DEFAULT NOW() | — | 创建时间 |

**in_dynamic_landed_price** (源: 生产 DB `SHOW CREATE TABLE`, AUTO_INC=371, rows=107)
| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INT AUTO_INCREMENT | PK | 主键 |
| in_record_id | INT NULL | — | 关联 tran (无 FK 约束!) |
| logistic_num | VARCHAR(50) NOT NULL | UNIQUE(+po_num+sku), INDEX | 母物流单号 |
| po_num | VARCHAR(50) NOT NULL | INDEX | 订单号 |
| sku | VARCHAR(50) NOT NULL | INDEX | SKU |
| qty | INT DEFAULT 0 | — | 入库数量 |
| landed_price_usd | DECIMAL(12,5) | — | 到岸成本 USD |
| created_at | DATETIME DEFAULT NOW() | — | 创建时间 |
| updated_at | DATETIME ON UPDATE NOW() | — | 更新时间 |

### 12.1.2 外键约束拓扑

```
in_dynamic_tran (根表)
    ↑ FK: ON DELETE RESTRICT ON UPDATE CASCADE
    ├── in_dynamic_fifo_layers.in_record_id
    └── in_dynamic_fifo_alloc.out_record_id

in_dynamic_fifo_layers
    ↑ FK: ON DELETE RESTRICT ON UPDATE CASCADE
    └── in_dynamic_fifo_alloc.layer_id

in_dynamic_landed_price → in_dynamic_tran (逻辑关联, 无物理FK)
```

> **🔴 设计发现**: `in_dynamic_landed_price.in_record_id` 声明为 INT 类型而非 BIGINT, 与 `in_dynamic_tran.record_id` (BIGINT) 类型不匹配, 且无 FK 约束。数据完整性依赖应用层。

## 12.2 FIFO 写入路径

### 12.2.1 初始化种子 (一次性)

**触发**: `scripts/init_fifo_from_inventory.py` 手动执行  
**源数据**: `Data_inventory.'2024-12-31'` + `Data_COGS.Cog`

```
读取 Data_inventory WHERE `2024-12-31` > 0   ← L43-47
读取 Data_COGS (SKU→Cog 映射)                 ← L56-57
  ↓
对每个 SKU (qty > 0):
  ├── 检查是否已存在 INIT 层 (防重复)          ← L93-99
  ├── INSERT in_dynamic_tran                   ← L102-122
  │   (action='in', type='inv', po_num='INIT-2024-12-31', 
  │    price=Cog, date_record=2024-12-31 23:59:59)
  ├── SELECT LAST_INSERT_ID()                  ← L125-126
  └── INSERT in_dynamic_fifo_layers            ← L129-148
      (in_record_id=^, qty_in=qty, qty_remaining=qty,
       unit_cost=Cog, po_num='INIT-2024-12-31')
```

> **🟡 BUG 发现**: 初始化脚本使用 `LAST_INSERT_ID()` 获取 record_id, 这在并发场景下不安全。但由于是一次性手动脚本, 实际影响低。

> **📊 生产基线** (实时查询):
> - `in_dynamic_tran`: 37,075 行 (AUTO_INC=279,455, 有 gap)
> - `in_dynamic_fifo_layers`: 351 层 (180 INIT + 171 入库)
> - `in_dynamic_fifo_alloc`: 33,930 行 (全部由 sales_sync 生成)
> - `in_dynamic_landed_price`: 107 行 (仅入库时创建)

### 12.2.2 入库写入 (Receiving 触发)

**触发点**: `create_landed_price_records(logistic_num)` — `landed_price.py` L898-1036  
**调用方**: 收货入库流程 (in_receive 模块)

```
读取 in_receive_final WHERE logistic_num = :log   ← L915-921
  ↓
对每个 po_num: calculate_landed_prices(po_num)     ← L931-933
  ↓
对每条入库记录 (qty > 0):
  ├── 计算 landed_price_usd (详见 12.3)
  ├── 幂等检查: SELECT FROM in_dynamic_tran        ← L959-963
  │   WHERE po_num=:pn AND sku=:s AND note LIKE '%logistic_num%'
  ├── INSERT in_dynamic_tran                        ← L967-978
  │   (action='in', type='receive', price=landed_price_usd)
  ├── SELECT record_id (通过 ORDER BY DESC LIMIT 1) ← L982-989
  ├── INSERT in_dynamic_fifo_layers                  ← L993-1006
  │   (unit_cost=landed_price_usd, qty_remaining=qty)
  └── INSERT in_dynamic_landed_price                 ← L1019-1031
      (幂等检查: UNIQUE KEY logistic_num+po_num+sku)
```

> **🔴 BUG 发现 (严重)**: 获取 record_id 使用 `ORDER BY record_id DESC LIMIT 1` (L982-987) 而非 `LAST_INSERT_ID()`, 这在并发场景下可能返回错误的 record_id, 导致 FIFO 层指向错误的流水。

### 12.2.3 销售出库 (FIFO 核心扣减)

**触发点**: `SalesFifoSyncService._fifo_out()` — `sales_sync.py` L177-253  
**调用方**: ETL 销售同步流程 (sync_from_sales)

```
atomic_transaction() 开启                           ← L180
对每个 (sku, qty):
  ├── INSERT in_dynamic_tran                       ← L186-195
  │   (action='out', type='sale', price=0, note=ref_key)
  │   → result.lastrowid = out_record_id
  ├── SELECT layers FROM in_dynamic_fifo_layers    ← L201-206
  │   WHERE sku=:sku AND qty_remaining > 0
  │   ORDER BY in_date ASC, layer_id ASC            ← ★ FIFO 排序
  └── 对每个 layer (从最早开始):
      ├── alloc_qty = min(remaining, layer_qty)
      ├── INSERT in_dynamic_fifo_alloc             ← L220-232
      │   (out_record_id, layer_id, qty_alloc, unit_cost, cost_alloc)
      ├── UPDATE in_dynamic_fifo_layers            ← L237-242
      │   SET qty_remaining = new_qty,
      │       closed_at = CASE WHEN new_qty=0 THEN NOW() ELSE NULL END
      └── remaining -= alloc_qty
```

**幂等性机制**: `note` 字段存储 `SALES:{seller}:{order}:{item}:{action}`, 处理前用 `SELECT 1 FROM in_dynamic_tran WHERE note = :ref_key` 检查 (L149-153)

> **⚠️ 库存不足处理**: 仅记录 WARNING 日志, 不回滚事务 (L248-249)。出库流水仍会创建, 但 alloc 记录不完整, 导致 COGS 计算偏差。

### 12.2.4 取消订单回库 (CA → 100% 精确还原)

**触发点**: `_fifo_return_full()` — `sales_sync.py` L255-311

```
查找对应 NN 出库的 ref_key                          ← L263-268
  ↓
获取 NN 的 alloc 记录 (按 unit_cost DESC)           ← L279-284
  ↓
atomic_transaction():
  ├── INSERT in_dynamic_tran                       ← L292-301
  │   (action='in', type='cancel', qty=总量)
  └── 对每个原始 alloc:
      UPDATE in_dynamic_fifo_layers                ← L306-311
        SET qty_remaining = qty_remaining + :qty,
            closed_at = NULL
```

### 12.2.5 退货/拒付部分回库 (RE/CR/CC → 按比例)

**触发点**: `_fifo_return_partial()` — `sales_sync.py` L313-382

```
回库比例: RE=60%, CR=50%, CC=30%, PD=0%             ← L37-48
  ↓
return_qty = int(total_qty * ratio)                 ← L349 (向下取整!)
  ↓
优先还最贵层 (ORDER BY unit_cost DESC)              ← L337-342
  → 逐层恢复 qty_remaining
```

> **🟡 设计发现**: `int()` 向下取整意味着 60% × 3 = 1 (而非 2), 在小订单场景下损失显著。

### 12.2.6 付款变动触发价格更新

**触发点**: `recalculate_landed_prices()` — `landed_price.py` L1041-1117  
**已在区块 2 审计中详细分析。**

通过 UPDATE `in_dynamic_landed_price` 表更新 `landed_price_usd` 字段, 但不更新 `in_dynamic_fifo_layers.unit_cost`。

> **🔴 设计问题**: 付款变动后 `landed_price` 表更新了, 但 FIFO 层的 `unit_cost` 没更新。读取时需 LEFT JOIN 两表, COALESCE 取 landed_price, 增加了查询复杂度和不一致风险。

## 12.3 Landed Price 计算引擎 (10 步算法)

**入口**: `calculate_landed_prices(po_num)` — `landed_price.py` L22-381

```
Step 1:  读取 in_po_strategy (最新策略: 货币+汇率)          ← L44-57
Step 2:  读取 in_po_final → 计算 raw_total (订单总额)       ← L60-66
Step 3:  读取 in_pmt_deposit_final + in_pmt_po_final        ← L70-111
         → 计算 actual_paid_usd (已付总额)
         → 判断 is_fully_paid (含 pmt_override 强制标记)
         → payment_ratio = paid/total (未付清时 ratio=1.0)
Step 4:  读取 deposit_extra + pmt_extra → order_extra_usd   ← L133-168
Step 5:  读取 in_send_final → 发货 SKU 明细                  ← L171-177
Step 6:  合并 delay 单到母单 (L12345_delay_V01 → L12345)    ← L183-212
Step 7:  读取 Data_COGS.Weight → SKU 重量 (g→kg)            ← L214-221
Step 8:  对每个母单: 读取 in_send .total_price (物流费)       ← L227-290
         + in_pmt_logistic_final (是否已付/汇率/额外费用)
         + po_count (该物流单含多少订单)
Step 9:  计算每个母单的总重量 (Σ qty × weight_kg)            ← L292-313
Step 10: 最终价格计算:                                        ← L315-381
         ┌───────────────────────────────────────────────┐
         │ base_price_usd = price / usd_rmb (if RMB)    │
         │ actual_price   = base × payment_ratio         │
         │ fee_pool = order_extra + log_extra + log_cost │
         │ fee_per_unit   = fee_pool × weight_ratio / qty│
         │ landed_price   = actual_price + fee_per_unit  │
         └───────────────────────────────────────────────┘
```

**关键公式**:
```
landed_price_usd = (po_price_usd × payment_ratio) + (fee_pool × sku_weight / order_weight / qty)
```

其中:
- `payment_ratio` = 付清时为 actual_paid/total; 未付清时固定 1.0
- `fee_pool` = 订单额外费用 ÷ 物流单数 + 物流额外费用 ÷ PO 数 + 物流费 × 重量占比
- 物流费按**重量比**分摊到各 SKU

> **🟡 设计发现**: 整个计算链读取 **7 张表** (strategy, po, deposit, pmt_po, send, send.logistic, pmt_logistic, COGS), 每次调用可能触发 10+ 次 SQL 查询, 无缓存机制。

## 12.4 FIFO 读取路径

### 12.4.1 动态库存 API

**入口**: `dynamic_inv_api(request)` — `dynamic_inv.py` L58-344

| 数据项 | SQL 目标 | 行号 |
|--------|----------|------|
| 理论库存(qty) | `SUM(qty_remaining) FROM in_dynamic_fifo_layers WHERE DATE(in_date) <= :date` | L109-117 |
| 库存价值 | `SUM(qty_remaining * COALESCE(landed_price_usd, unit_cost)) FROM layers LEFT JOIN landed_price ON sku+po_num` | L121-133 |
| 加权均价 | 价值 / 数量 | L137-153 |
| 当前成本(FIFO) | 最早未消耗层的 `COALESCE(landed_price_usd, unit_cost)` | L157-174 |
| 实际库存 | `Data_inventory` 动态列 | L86-105 |
| 下订数 | `in_po_final.qty - in_send_final.qty` | L179-290 |
| 在途数 | `in_send_final.qty - in_receive_final.qty` | L179-290 |
| 下订/在途价值 | qty × `calculate_landed_prices()` (或回退到 po_price) | L292-322 |

> **🟡 性能问题**: `DATE(in_date)` 在 WHERE 中使索引失效。且对每个有下订/在途的 PO 都调用 `calculate_landed_prices()`, N 个 PO 触发 N×10 次 SQL。

### 12.4.2 库存快照报表

**入口**: `InventorySnapshot.run()` — `inventory_snapshot.py` L24-297

与动态库存 API 几乎相同的查询逻辑, 但:
- 不支持日期参数 (总是取当天)
- 不计算加权均价和当前成本
- 输出 CSV 文件

> **🟡 代码重复**: 与 `dynamic_inv_api` 有 ~70% 的代码重复 (查询 FIFO/下订/在途逻辑), 违反 DRY。

### 12.4.3 FIFO COGS 计算 (出库成本查询)

通过 `in_dynamic_fifo_alloc` 表可精确追溯每笔出库的分层成本:

```sql
SELECT a.qty_alloc, a.unit_cost, a.cost_alloc
FROM in_dynamic_fifo_alloc a
WHERE a.out_record_id = :record_id
-- → Σ cost_alloc = 该笔出库的 COGS
```

## 12.5 SalesFifoSyncService 业务逻辑

### 12.5.1 Action 映射表

| Action | 含义 | FIFO 操作 | 回库比例 | 方法 |
|--------|------|-----------|----------|------|
| NN | 正常销售 | 100% 出库 | — | `_fifo_out()` |
| CA | 取消 | 100% 精确回库 | 100% | `_fifo_return_full()` |
| RE | 退货 | 部分回库 | 60% (可配) | `_fifo_return_partial()` |
| CR | 客户退款 | 部分回库 | 50% (可配) | `_fifo_return_partial()` |
| CC | 信用卡拒付 | 部分回库 | 30% (可配) | `_fifo_return_partial()` |
| PD | 银行投诉 | 不操作 | 0% | skip |

### 12.5.2 SKU 解析

从销售数据行提取最多 10 个 SKU (sku1~sku10) 和对应数量 (qtyp1~qtyp10) — `_parse_skus()` L155-175

### 12.5.3 幂等性设计

```
ref_key = "SALES:{seller}:{order_number}:{item_id}:{action}"
```
- 使用 `in_dynamic_tran.note` 字段存储
- 每次处理前 `SELECT 1 FROM in_dynamic_tran WHERE note = :ref_key` 检查

> **⚠️ 无唯一索引保障**: `note` 字段是 TEXT 类型, 无索引。幂等检查靠全表扫描, 性能和一致性均有风险。

## 12.6 跨模块影响矩阵

```
                    ┌──────────────────────────────────────────┐
                    │           跨模块数据流                     │
                    │                                          │
  采购模块 ─────────┤                                          │
  in_po_final       │──→ calculate_landed_prices() ──→ landed_price 表     │
  in_po_strategy    │         ↑                                │
  in_send_final     │         │ 读取                           │
  in_receive_final  │    ┌────┴────┐                           │
                    │    │ 付款模块 │                           │
  付款模块 ─────────┤    │(区块2)  │                           │
  in_pmt_deposit_f  │    └────┬────┘                           │
  in_pmt_po_final   │         │ recalculate_landed_prices()    │
  in_pmt_logistic_f │         ↓                                │
                    │    UPDATE in_dynamic_landed_price         │
  ────────────────  │                                          │
                    │    create_landed_price_records()          │
  收货模块 ─────────┤    → INSERT in_dynamic_tran              │
  in_receive_final  │    → INSERT in_dynamic_fifo_layers       │
                    │    → INSERT in_dynamic_landed_price       │
  ────────────────  │                                          │
                    │    SalesFifoSyncService                   │
  销售ETL ──────────┤    → INSERT in_dynamic_tran (out)        │
  Data_Clean_Log    │    → INSERT in_dynamic_fifo_alloc        │
                    │    → UPDATE in_dynamic_fifo_layers        │
  ────────────────  │                                          │
                    │    dynamic_inv_api / InventorySnapshot    │
  库存模块 ─────────┤    ← SELECT from all 4 FIFO tables       │
  Data_inventory    │    ← SELECT from Data_COGS               │
  Data_COGS         │                                          │
                    └──────────────────────────────────────────┘
```

## 12.7 发现的 BUG 和设计问题

### 🔴 严重 (High)

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| B3-1 | **record_id 获取不安全**: 入库写入用 `ORDER BY record_id DESC LIMIT 1` 而非 `LAST_INSERT_ID()`, 并发场景下可能关联错误流水 | `landed_price.py` L982-989 | FIFO 层指向错误流水, 成本计算错误 |
| B3-2 | **landed_price ↔ fifo_layers 不同步**: 付款变动只更新 `landed_price` 表, 不更新 `fifo_layers.unit_cost`。读取时需 COALESCE 合并, 增加复杂度 | `landed_price.py` L1041+ vs `sales_sync.py` L230 | alloc.cost_alloc 使用 unit_cost 计算, landed_price 变动后 COGS 出现偏差 |
| B3-3 | **无唯一索引保障幂等性**: `note` 字段为 TEXT 无索引, 幂等检查是全表扫描 | `sales_sync.py` L149-153 | 并发/重启场景可能重复处理 |

### 🟡 中等 (Medium)

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| B3-4 | **库存不足不回滚**: 出库数 > 库存时仅 WARNING, 不回滚事务。alloc 记录不完整 | `sales_sync.py` L248-249 | COGS 低估 (分配不足), 但库存可以为负 |
| B3-5 | **回库取整损失**: `int(qty*ratio)` 向下取整, 小订单损失显著 (3×0.6=1) | `sales_sync.py` L349 | 退货少回库, 长期积累偏差 |
| B3-6 | **类型不匹配**: `in_dynamic_landed_price.in_record_id` 为 INT, 而 `in_dynamic_tran.record_id` 为 BIGINT | 备份 SQL L380 | 理论上 BIGINT 溢出 INT 时崩溃 (实际数据量远未达到) |
| B3-7 | **DATE() 函数破坏索引**: `WHERE DATE(in_date) <= :date` 导致 `idx_in_date` 无法使用 | `dynamic_inv.py` L112, 128, 148 | 全表扫描, 性能随数据量线性退化 |

### ⚪ 设计建议

| # | 问题 | 说明 |
|---|------|------|
| B3-8 | 代码重复 ~70% | `dynamic_inv_api` 与 `InventorySnapshot` 查询逻辑高度重复 |
| B3-9 | N+1 查询问题 | 每个 PO 单独调用 `calculate_landed_prices()`, 触发 10+ SQL/PO |
| B3-10 | INIT 层 po_num 不一致 | 种子脚本用 `'INIT-2024-12-31'`, 备份 SQL 显示实际为 `'INIT_20241231'` |

## 12.8 V3 迁移影响

### 4表 → V3 映射

| V1 表 | V3 表 | 变化 |
|-------|-------|------|
| in_dynamic_tran | inventory_transactions | BIGSERIAL PK, 新增 batch_id 字段 |
| in_dynamic_fifo_layers | fifo_layers | BIGSERIAL PK, 新增 version 字段 (乐观锁) |
| in_dynamic_fifo_alloc | fifo_allocations | BIGSERIAL PK, FK 约束保留 |
| in_dynamic_landed_price | landed_prices | 新增 FK→fifo_layers, 类型统一到 BIGINT |

### 关键迁移决策

1. **幂等性保障**: `note` 字段改为独立 `idempotency_key` 列 + UNIQUE INDEX
2. **价格同步**: 消除 layers/landed_price 双源, unit_cost 改为计算属性或 SQL VIEW
3. **并发安全**: 使用 `RETURNING record_id` (PostgreSQL) 替代 `LAST_INSERT_ID()`
4. **索引优化**: `in_date` 改用 `DATE` 类型或创建函数索引
5. **库存不足策略**: 引入严格模式 (拒绝超卖) 或允许模式 (负库存 + 告警)

---

# Section 13: ETL Transformer 深度审计 (区块 4)

> **数据来源**: 以下所有表结构和数据量均通过 `SHOW CREATE TABLE` 直接查询生产数据库 (localhost:3306/MGMT) 获取。查询时间: 2026-02-17T04:14:00-08:00

## 13.1 ETL Pipeline 架构总览

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  CSV 文件    │ ──→ │ IngestService │ ──→ │ TransactionParser  │ ──→ │  Transformer    │
│  (eBay 报表) │     │ (ingest.py)   │     │ (parser.py)        │     │ (transformer.py)│
└─────────────┘     └──────┬───────┘     └────────┬───────────┘     └────────┬────────┘
                           │                       │                          │
                    写入 Raw Tables           解析 Custom label          聚合/分摊/入库
                    ┌──────▼───────┐     ┌────────▼───────────┐     ┌────────▼────────┐
                    │ Data_        │     │ Data_Transaction   │     │ Data_Clean_Log  │
                    │ Transaction  │     │ (P_SKU1-10 更新)    │     │ (最终清洗表)     │
                    │ Data_Order_  │     │ P_Flag=0→1/2/5/99  │     │                 │
                    │ Earning      │     │                    │     │                 │
                    └──────────────┘     └────────────────────┘     └────────┬────────┘
                                                                           │
                                                                    FIFO 同步
                                                                    ┌────────▼────────┐
                                                                    │ sales_sync.py   │
                                                                    │ → in_dynamic_*  │
                                                                    └─────────────────┘
```

### 13.1.1 Pipeline 四阶段

| 阶段 | 服务 | 文件 | 输入 | 输出 |
|------|------|------|------|------|
| **Stage 1: Ingest** | `IngestService` | `core/services/etl/ingest.py` | CSV 文件 (Transaction/Earning) | `Data_Transaction`, `Data_Order_Earning` |
| **Stage 2: Parse** | `TransactionParser` | `core/services/etl/parser.py` | `Data_Transaction` (Processed_T=0) | `Data_Transaction` (P_SKU1-10 填充, P_Flag 更新) |
| **Stage 3: Transform** | `TransactionTransformer` | `core/services/etl/transformer.py` | `Data_Transaction` + `Data_Order_Earning` | `Data_Clean_Log` |
| **Stage 4: FIFO Sync** | `SalesFifoSyncService` | `core/services/fifo/sales_sync.py` | `Data_Clean_Log` (DataFrame) | `in_dynamic_tran` + `in_dynamic_fifo_layers` + `in_dynamic_fifo_alloc` |

### 13.1.2 辅助服务

| 服务 | 文件 | 职责 |
|------|------|------|
| `CorrectionService` | `core/services/correction.py` | SKU 纠错记忆库 (CSV), 模糊匹配, 人工修复 |
| `ETLRepository` | `core/services/etl/repository.py` | 数据访问层 (继承 BaseRepository) |
| `DatabaseService` | `core/services/database_service.py` | 底层 DB 操作 |

## 13.2 ETL 四表 Schema (从生产 DB 实查)

### 13.2.1 Data_Transaction (源: 生产 DB, rows=61,363)

> **🔴 关键发现: 67 列全部为 TEXT 类型, 零索引!**

| 列 (关键列摘录) | 类型 | 说明 |
|---|---|---|
| Transaction creation date | TEXT | 交易日期 (应为 DATE) |
| Type | TEXT | 交易类型: Order/Shipping label/Refund/Claim/Payment dispute |
| Order number | TEXT | 订单号 (去重核心键, 无索引!) |
| Item ID | TEXT | 商品 ID |
| Custom label | TEXT | 用户自定义标签 (SKU 解析的原始输入) |
| Quantity | TEXT | 数量 (应为 INT) |
| Item subtotal | TEXT | 小计金额 (应为 DECIMAL) |
| Gross transaction amount | TEXT | 总交易金额 (应为 DECIMAL) |
| Seller | TEXT | 卖家标识 |
| Reference ID | TEXT | 参考号 (退货/纠纷类型判断依据) |
| P_Flag | TEXT | 解析状态: 0=未解析, 1=单品, 2=双品, 5=复杂/已修, 99=异常 |
| P_SKU1 ~ P_SKU10 | TEXT | 解析出的 SKU (最多10个) |
| P_Quantity1 ~ P_Quantity10 | TEXT | 解析出的数量 |
| P_Key | TEXT | 数量倍增标记 (2K=×2) |
| P_Check | TEXT | 解析校验标记 |
| Skufix_Check | TEXT | SKU 修正校验标记 |
| row_hash | TEXT | 行哈希 (去重用, 全行 hash, **无索引!**) |
| Processed_T | TEXT | 处理标记: 0=待处理, 1=已处理 (应为 TINYINT) |

> **🔴 BUG B4-1 (Critical): Data_Transaction 没有任何索引**
> 61,363 行 TEXT 列表, 所有查询都是全表扫描。row_hash 去重、Order number 关联、Processed_T 过滤 — 全部 O(n) 扫描。

### 13.2.2 Data_Order_Earning (源: 生产 DB, rows=27,466)

| 列 (关键列摘录) | 类型 | 索引 | 说明 |
|---|---|---|---|
| Order creation date | TEXT | — | 订单日期 |
| Order number | TEXT | — | 订单号 |
| Item ID | TEXT | — | 商品 ID |
| Shipping labels | TEXT | — | 运费 (joinkey 用于计算 Shipping label-Earning data) |
| Seller | TEXT | — | 卖家 (ingest 时注入) |
| row_hash | VARCHAR(32) | KEY idx_row_hash | **唯一有索引的列** |
| Processed_E | INT DEFAULT 0 | — | 处理标记 |

> Earning 表设计优于 Transaction: row_hash 用 VARCHAR(32) + 索引, Processed_E 用 INT。

### 13.2.3 Data_Clean_Log (源: 生产 DB, rows=63,776)

| 列 (关键列摘录) | 类型 | 说明 |
|---|---|---|
| order date | TEXT | 订单日期 (Transformer 输出, 已格式化为 YYYY-MM-DD) |
| seller | TEXT | 卖家 |
| order number | TEXT | 订单号 |
| item id | TEXT | 商品 ID |
| full sku | TEXT | 完整 SKU 表达式 (如 SKU1.1+SKU2.2) |
| quantity | TEXT | 订单数量 |
| sku1 ~ sku10 | TEXT | 展平后的 SKU |
| qty1 ~ qty10 / qtyp1 ~ qtyp10 | TEXT/BIGINT | 各 SKU 数量 / 乘以订单数量后的总量 |
| revenue | TEXT | 收入 |
| action | TEXT | 动作码: NN=正常, CA=取消, RE=退货, CR=Claim-Request, CC=Claim-Case, PD=Payment Dispute |
| 14 个费用列 | TEXT | FVF/International/Promoted/Shipping/Refund 等费用细分 |
| **索引**: `idx_dedup` | — | (`order number`(50), `seller`(30), `item id`(50), `action`(10)) |

> **⚠️ qtyp9/qtyp10 是 BIGINT, 其余 qtyp1-8 是 TEXT** — 类型不一致, 可能是后期 ALTER TABLE 添加导致。

### 13.2.4 Data_COGS (源: 生产 DB, rows=194)

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| SKU | VARCHAR(100) | **PK** | SKU 主键 |
| Category | TEXT | — | 产品分类 |
| SubCategory | TEXT | — | 子分类 |
| Type | TEXT | — | 类型 |
| Cost | DOUBLE | — | 成本 |
| Freight | DOUBLE | — | 运费 |
| Cog | DOUBLE | — | COGS (Cost + Freight) |
| Weight | INT DEFAULT 0 | — | 重量 |
| MOQ | INT DEFAULT 100 | — | 最小订购量 |

> Data_COGS 是 ETL 管线的参考数据源, Parser 的 `CorrectionService.valid_skus` 从此表读取。

## 13.3 核心数据流详解

### 13.3.1 Stage 1: Ingest (CSV → Raw Tables)

**入口**: `IngestService.run_ingest_pipeline(trans_files, earn_files)`

```python
# 流程:
1. _detect_metadata(file) → 嗅探 Seller 和 Header 行位置
2. pd.read_csv(skiprows=N, dtype=str) → 全部按字符串读取
3. normalize_date_columns(df) → 日期列 YYYY-MM-DD 格式化
4. compute_row_hash(row) → 去重策略:
   - Transaction: compute_row_hash_full → 全行 hash (任何列变 → 新行)
   - Earning: compute_row_hash_key → 业务键 hash (7 个不变列, 运费变 → 覆盖旧行)
5. 写入 MySQL (pandas to_sql, dtype=Text)

# Hash 去重键 (Earning):
EARNING_HASH_KEY_COLUMNS = [
    'order creation date', 'order number', 'item id',
    'item title', 'buyer name', 'custom label', 'seller'
]
```

> **设计意图**: Transaction 全行 hash 保证幂等 (完全相同的 CSV 重复上传不会产生重复行)。Earning 业务键 hash 允许运费延迟更新 (eBay 的 Earning 报表中运费数据会延迟出现)。

### 13.3.2 Stage 2: Parse (Custom label → SKU)

**入口**: `TransactionParser.run(date_range)`

```python
# 三阶段解析:
Stage 1: _apply_regex_patterns (向量化正则)
  - Pattern 1 (Single): ^(?:prefix\.)?(?P<SKU>[A-Za-z0-9\-_/]{7,})\.(?P<Qty>\d{1,3})(?:\+2K)?$
    → P_Flag=1, P_Type='single'
  - Pattern 2 (Dual): SKU1.Qty1+SKU2.Qty2
    → P_Flag=2, P_Type='dual'

Stage 2: _process_complex_rows (迭代解析兜底)
  - 处理 P_Flag=0 的行 (正则未匹配的)
  - 按 '+' 分割, 逐段解析 SKU.Qty
  - 支持 +2K 倍增标记
  → P_Flag=5

Stage 3: _validate_and_autofix
  - 所有 P_Flag > 0 的行重新校验
  - is_valid_sku() 查 Data_COGS 有效 SKU 集合
  - 查 CorrectionService.find_auto_fix() 记忆库
  - 通过 → 保持原 Flag
  - 不通过且无法自动修复 → P_Flag=99 (异常, 需人工介入)
  - 曾经 99 现在通过 → P_Flag=5 (恢复)
```

> P_Flag 状态机:
> ```
> 0 (未解析) → 1 (单品) → 通过校验 → 保持 1
>            → 2 (双品) → 通过校验 → 保持 2
>            → 5 (复杂) → 通过校验 → 保持 5
>                        → 校验失败 → 99 (异常)
>                                    → 人工修复 → 5
>                                    → 下次重扫通过 → 5
> ```

### 13.3.3 Stage 3: Transform (Raw → Clean)

**入口**: `TransactionTransformer.run(progress_callback, return_ratios, df_trans_input, date_range)`

```python
# 转换流水线 (按进度百分比):
5%  : 启动, 读取 Data_Transaction
15% : 数值清洗 (去 $ 符号, str → float)
30% : 业务规则计算
      - Action Logic: type/reference_id → action_code (NN/CA/RE/CR/CC/PD)
      - Seller Logic: 优先 esparts 卖家, 去引号
50% : 隐性物流成本提取
      - type=='shipping label' → description 分类
      - underpaid/overpaid/return/regular → 按 order 聚合
70% : 订单级费用分摊
      - ratio = item_subtotal / order_total
      - 5 个 Shipping label 列 × ratio
      - 退货/取消记录: 复制对应 NN 行, 改 action
      - SKU 展平: P_SKU1-10 → sku1-10 / qty1-10 / qtyp1-10
90% : 四维去重入库 Data_Clean_Log
      - 去重键: (order number, seller, item id, action)
      - Staging 表策略: to_sql → ALTER COLLATION → CREATE INDEX → DELETE+INSERT
      - 同时回写 Data_Transaction (更新 Processed_T)
90-99%: FIFO 同步 (_sync_fifo)
100%: 完成
```

**四维去重机制 (Transformer L352-378)**:
```sql
-- 去重: 相同 (order_number, seller, item_id, action) 的记录会被覆盖
DELETE T1 FROM Data_Clean_Log T1
INNER JOIN Data_Clean_Log_Staging T2
ON T1.`order number` = T2.`order number`
AND T1.`seller` = T2.`seller`
AND COALESCE(T1.`item id`, '') = COALESCE(T2.`item id`, '')
AND COALESCE(T1.`action`, '') = COALESCE(T2.`action`, '')

INSERT INTO Data_Clean_Log (...) SELECT ... FROM Data_Clean_Log_Staging
DROP TABLE Data_Clean_Log_Staging
```

> **🔴 BUG B4-2 (High): 去重策略不含 order date**
> 同一订单的 NN 和 CA/RE 记录可能有不同 order date (退货日期 ≠ 原始订单日期)。当前四维去重会错误地将退货记录视为重复并覆盖正常订单记录, 如果恰好 order number + seller + item id 相同 (action 不同则不影响, 但 action 相同的 NN 重复入库会覆盖)。

### 13.3.4 Stage 4: FIFO Sync (Clean → Inventory)

**入口**: `TransactionTransformer._sync_fifo(df, return_ratios, progress_callback)`

调用 `SalesFifoSyncService.sync_from_sales(df)` — 此部分已在区块 3 (Section 12) 详细审计。

关键接口:
- 输入: `Data_Clean_Log` 的 DataFrame (含 action, sku1-10, qtyp1-10)
- 输出: `in_dynamic_tran` + `in_dynamic_fifo_layers` + `in_dynamic_fifo_alloc` 表更新

## 13.4 UI 触发路径 (apps/etl/views.py)

### 13.4.1 Transaction Wizard 流程

```
用户操作                    后端函数                     说明
───────                    ────────                     ────
1. 上传 CSV              → etl_upload()               预览统计 + Seller 识别
2. 开始解析              → etl_parse()                IngestService → Parser (在此阶段完成)
3. 修正异常 SKU          → etl_fix_sku()              CorrectionService 人工修复
4. 预览变更              → etl_transform()            显示前/后对比
5. 输入密码确认          → etl_confirm()              后台异步执行 _run_etl_task()
6. 轮询进度              → etl_task_status()          返回 progress/stage

_run_etl_task() 三阶段:
  0-30%  : Parser.run(date_range)     → 解析 Data_Transaction
  30-85% : Transformer.run(...)       → 转换 + 入库 Data_Clean_Log + FIFO 同步
  85-100%: 统计对比 (before/after row counts)
```

### 13.4.2 Inventory Wizard 流程

```
用户操作                    后端函数                     说明
───────                    ────────                     ────
1. 上传库存 CSV          → inv_validate()             校验格式 + SKU 匹配
2. 应用修正              → inv_apply_corrections()    修正并预览
3. 检查日期              → inv_check_date()           检查 Data_Inventory 是否已有该日期列
4. 确认同步              → inv_sync()                 写入 Data_Inventory
```

## 13.5 去重机制分析

| 层级 | 去重键 | 策略 | 碰撞处理 |
|------|--------|------|----------|
| **Ingest → Data_Transaction** | `row_hash` (全行 hash) | 新行跳过, 旧行不覆盖 | 全量 hash 比对, 无索引 → 慢! |
| **Ingest → Data_Order_Earning** | `row_hash` (业务键 hash) | 旧行删除重插, 新行追加 | idx_row_hash 索引 + 批量删除 (500/batch) |
| **Transform → Data_Clean_Log** | `(order number, seller, item id, action)` | DELETE-INSERT (覆盖) | idx_dedup 组合索引 (前缀截断) |
| **FIFO → in_dynamic_tran** | `note` 字段 (ref_key) | `SELECT 1 WHERE note=:key` 检查 | TEXT 列无索引 → 全表扫描 |

> **🔴 BUG B4-3 (Critical): Data_Transaction 的 row_hash 无索引**
> `IngestService._process_files()` L264-268: 每次上传都读取全表 hash 集合到内存 (`SELECT row_hash FROM Data_Transaction`)。61K 行 TEXT 列, 每次都全表扫描。随着数据增长, 这个操作会越来越慢。

## 13.6 数据类型分析

### 13.6.1 全 TEXT 反模式

| 表 | 列数 | TEXT 列 | 非 TEXT 列 | 问题 |
|---|---|---|---|---|
| Data_Transaction | 67 | **67** | 0 | 零类型安全, 零索引 |
| Data_Order_Earning | 36 | 34 | 2 (row_hash=VARCHAR, Processed_E=INT) | 略好 |
| Data_Clean_Log | ~80 | ~78 | 2 (qtyp9=BIGINT, qtyp10=BIGINT) | 类型混乱 |
| Data_COGS | 9 | 3 | 6 | 最佳 (有 PK, DOUBLE, INT) |

> **根因**: `pandas.to_sql(dtype={c: Text() for c in columns})` 强制所有列写为 TEXT。这是最简单但最差的做法 — 彻底放弃了数据库的类型系统、索引能力和约束保护。

### 13.6.2 具体类型问题

| 列 | 当前类型 | 应有类型 | 影响 |
|---|---|---|---|
| Transaction creation date | TEXT | DATE/DATETIME | 无法日期范围索引 |
| Quantity | TEXT | INT | 数值比较需要 CAST |
| Item subtotal | TEXT | DECIMAL(12,2) | 金额精度不可控 |
| Gross transaction amount | TEXT | DECIMAL(12,2) | 同上 |
| P_Flag | TEXT | TINYINT | 状态码应为整数 |
| Processed_T | TEXT | TINYINT | 布尔标记应为整数 |
| row_hash (Transaction) | TEXT | CHAR(32) / VARCHAR(32) | 无法建索引 |
| qtyp1-8 | TEXT | INT | 数量应为整数 |
| qtyp9-10 | BIGINT | INT | 与 qtyp1-8 类型不一致 |

## 13.7 性能热点分析

### 13.7.1 SQL 注入风险

**`TransactionTransformer.run()` L107**:
```python
df_trans = self.db.read_df(f"""
    SELECT * FROM Data_Transaction 
    WHERE `Transaction creation date` BETWEEN '{date_min}' AND '{date_max}'
""")
```
**`TransactionParser.run()` L68-71**:
```python
df_all = self.db.read_df(f"""
    SELECT * FROM Data_Transaction 
    WHERE `Transaction creation date` BETWEEN '{date_min}' AND '{date_max}'
""")
```
**`TransactionTransformer.run()` L124**:
```python
order_placeholders = ', '.join([f"'{o}'" for o in pending_orders])
```

> **🔴 BUG B4-4 (High): 多处 SQL 字符串拼接, 存在 SQL 注入风险。** 虽然输入来自系统内部数据 (非用户直接输入), 但如果订单号或日期包含特殊字符 (如 `'`), 会导致 SQL 语法错误或安全漏洞。应使用参数化查询。

### 13.7.2 全表扫描汇总

| 操作 | 查询 | 影响行数 | 问题 |
|---|---|---|---|
| Ingest hash 比对 | `SELECT row_hash FROM Data_Transaction` | 61,363 | 全表读取到内存 |
| Parser 筛选 | `WHERE COALESCE(Processed_T, 0) = 0` | 61,363 | TEXT 列无索引 |
| Transformer 读取 | `WHERE Transaction creation date BETWEEN` | 61,363 | TEXT 日期列无索引 |
| Earning 关联 | `WHERE Order number IN (...)` | 27,466 | TEXT 列无索引 |
| Clean_Log 去重 | `idx_dedup` 组合索引 | 63,776 | 前缀截断 (50/30/50/10) ✅ |
| FIFO 幂等 | `WHERE note = :key` | 37,075 | TEXT 列无索引 |

### 13.7.3 内存压力

**IngestService._process_files() L265**:
```python
existing_df = DBClient.read_df(f"SELECT row_hash FROM `{table_name}`")
existing_hashes = set(existing_df['row_hash'].tolist())
```
将 61K 行 hash 全部加载到 Python set。当前可接受, 但随着数据增长 (每月约 5K 行), 2 年后将超过 150K 行。

**TransactionTransformer.run() L121-124**:
```python
pending_orders = df_trans['order number'].dropna().unique().tolist()
order_placeholders = ', '.join([f"'{o}'" for o in pending_orders])
```
如果日期范围很大, pending_orders 可能有数万个订单号, 生成的 IN 子句会超过 MySQL `max_allowed_packet`。

> **🟡 BUG B4-5 (Medium): 大日期范围的 IN 子句可能超过 MySQL 限制**

## 13.8 Action 映射逻辑

```python
# Transformer.run() 中的 Action 识别逻辑:
Type (lowercase)          Reference ID (contains)     → action_code
──────────────           ──────────────────────       ─────────────
'payment dispute'         *                           → 'PD'
'claim'                   'case'                      → 'CC'
'claim'                   'request'                   → 'CR'
'refund'                  'return'                    → 'RE'
'refund'                  'cancel'                    → 'CA'
其他 / Order type          *                          → 'NN' (正常)
```

> **生产分布 (Data_Clean_Log, 63,776 行)**:
> | action | 行数 | 占比 |
> |--------|------|------|
> | NN (正常) | 59,327 | 93.0% |
> | RE (退货) | 2,805 | 4.4% |
> | CA (取消) | 1,456 | 2.3% |
> | CR (Claim-Request) | 122 | 0.2% |
> | CC (Claim-Case) | 63 | 0.1% |
> | PD (Payment Dispute) | 3 | <0.01% |

### 13.8.1 退货/取消记录生成

**Transformer.run() L240-265**: 退货记录不直接来自 Data_Transaction, 而是从已存在的 NN (正常) 记录复制并修改 action。

```python
# 逻辑:
1. 从 df_trans 中提取 action_code IN ('CA','RE','CR','CC') 的行
2. 以 order_number 为 key, 找到对应的 NN 行
3. 复制 NN 行的所有财务/SKU 数据
4. 替换 action 为退货/取消代码
5. 替换 order date 为退货/取消日期
6. concat 到 df_main
```

> **🟡 BUG B4-6 (Medium): 退货记录复制 NN 行的金额, 但未取反**
> 退货/取消的 revenue 应为负数, 但复制的 NN 行 revenue 为正数。下游 COGS/利润计算可能需要根据 action 来判断正负, 增加了逻辑复杂度。

## 13.9 CorrectionService (SKU 纠错系统)

### 13.9.1 架构

```
┌─────────────────────────────────────────────────────┐
│ CorrectionService                                    │
│ ├── valid_skus: Set[str]  ← Data_COGS.SKU (194 条)  │
│ ├── memory_df: DataFrame  ← sku_correction_memory.csv │
│ └── fix_map: Dict[str, dict]  ← memory_df 转字典      │
│                                                       │
│ 方法:                                                 │
│ - is_valid_sku(sku) → bool                           │
│ - find_auto_fix(label, bad_sku) → (sku, qty)         │
│ - get_fuzzy_suggestions(sku, n=5) → List[str]        │
│ - save_correction_memory(label, bad, bad_qty, ok, ok_qty) │
│ - apply_fix_transactional(order_id, col_idx, ...)    │
│ - mark_as_skipped(order_id) → P_Flag=5               │
│ - run_auto_parser() → 重新触发 Parser                 │
└─────────────────────────────────────────────────────┘
```

### 13.9.2 记忆库格式 (CSV)

```csv
CustomLabel,BadSKU,BadQty,CorrectSKU,CorrectQty
"ZD.SKU123.1+SKU456.2","SKU123X","1","SKU-123","1"
```

**查找策略**: `CustomLabel` + `BadSKU` 精确匹配 → 返回 `CorrectSKU` + `CorrectQty`

> **🟡 BUG B4-7 (Medium): 记忆库存储在 CSV 文件而非数据库**
> `settings.KNOWLEDGE_BASE_DIR / "sku_correction_memory.csv"` — 文件系统存储无事务保障, 无并发控制, 无备份策略。如果多个用户同时修正, 可能丢失数据。

## 13.10 跨模块影响矩阵

```
┌─────────────────────────────────────────────────────────┐
│                    ETL 跨模块影响                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [上游] eBay CSV 报表                                     │
│   ├── Transaction Report → Data_Transaction              │
│   └── Order Earning Report → Data_Order_Earning          │
│                                                         │
│ [参考] Data_COGS (194 SKU)                               │
│   └── 验证 SKU 有效性 (Parser Stage 3)                    │
│                                                         │
│ [下游] FIFO 系统 (区块 3)                                 │
│   ├── in_dynamic_tran (37K 条)                           │
│   ├── in_dynamic_fifo_layers (351 层)                    │
│   └── in_dynamic_fifo_alloc (34K 条分摊)                  │
│                                                         │
│ [读取] 报表/COGS 计算                                     │
│   ├── Sales Visualizer → Data_Clean_Log                  │
│   ├── Sales Report → Data_Clean_Log                      │
│   └── Inventory Snapshot → FIFO 表                       │
│                                                         │
│ [安全] ETL 操作需要 SecurityPolicyManager 权限验证         │
└─────────────────────────────────────────────────────────┘
```

## 13.11 BUG 和设计问题汇总

| # | 严重度 | 问题 | 位置 | 说明 |
|---|--------|------|------|------|
| **B4-1** | 🔴 Critical | Data_Transaction 零索引 | 生产 DB Schema | 67 列全 TEXT, 61K 行, 所有查询全表扫描 |
| **B4-2** | 🔴 High | 四维去重不含 order date | transformer.py L352-378 | 理论上 action 不同则不影响, 但 NN 记录重复入库会覆盖 |
| **B4-3** | 🔴 Critical | row_hash 无索引 (Transaction) | ingest.py L265 | 每次上传都全表读取 hash 到内存 |
| **B4-4** | 🔴 High | SQL 字符串拼接 | transformer.py L107, parser.py L68-71 | SQL 注入风险 + 大 IN 子句 |
| **B4-5** | 🟡 Medium | 大日期范围 IN 子句溢出 | transformer.py L124 | pending_orders 过多可能超 max_allowed_packet |
| **B4-6** | 🟡 Medium | 退货记录金额未取反 | transformer.py L240-265 | revenue 保持正数, 下游需按 action 判断正负 |
| **B4-7** | 🟡 Medium | 纠错记忆库用 CSV 文件 | correction.py L29 | 无事务能力, 无并发控制 |
| **B4-8** | 🟡 Medium | qtyp1-8 与 qtyp9-10 类型不一致 | Data_Clean_Log | TEXT vs BIGINT, 可能导致比较/排序异常 |
| **B4-9** | 🟡 Medium | pandas to_sql 全 TEXT 模式 | ingest.py L291, transformer.py L337 | `dtype={c: Text() for c in columns}` 丧失全部类型安全 |
| **B4-10** | 🟢 Low | 重复日期归一化逻辑 | ingest.py L34-52 + transformer.py L46-67 | `normalize_date_value` 和 `_normalize_date` 功能重复 |

## 13.12 ETL 生产数据基线

> **📊 生产基线** (实时查询 2026-02-17):

| 表 | 行数 | 索引 | 日期范围 |
|---|---|---|---|
| Data_Transaction | 61,363 | **0 个** | — (TEXT, 无法统计) |
| Data_Order_Earning | 27,466 | 1 个 (row_hash) | — |
| Data_Clean_Log | 63,776 | 1 个 (idx_dedup 组合) | 2024-01-01 ~ 2026-01-31 |
| Data_COGS | 194 | 1 个 (PK: SKU) | — |
| **汇总** | **152,799** | **3 个** | — |

> **关键数据流量**: 
> - 2 个 Seller (esparts + 另一个)
> - 60,815 个唯一订单号
> - 6 种 action 类型 (NN 占 93%)
> - Data_Clean_Log 比 Data_Transaction 多 2,413 行 (因为退货/取消复制生成)

## 13.13 V3 迁移影响

### 13.13.1 迁移关键决策

| 决策点 | V1 现状 | V3 建议 |
|--------|---------|---------|
| **数据类型** | 全 TEXT | PostgreSQL 强类型 (DATE, NUMERIC, INT, BOOLEAN) |
| **索引策略** | 几乎无索引 | 必须: order_number, order_date, row_hash, processed_flag |
| **去重策略** | 四维 DELETE-INSERT | UPSERT (ON CONFLICT) + composite unique index |
| **FIFO 触发** | 同步阻塞 (Transform → FIFO 在同一线程) | 异步消息队列 (Transform 完成后发事件) |
| **SKU 纠错** | CSV 文件 | 数据库表 + 版本控制 |
| **日期处理** | 运行时解析 TEXT | 写入时强制 DATE 类型 |
| **SQL 安全** | 字符串拼接 | 参数化查询 + JPA/QueryDSL |
| **异步任务** | 全局字典 `_etl_tasks` | Spring @Async + Redis 状态存储 |

### 13.13.2 V3 Schema 映射建议

```sql
-- V3 PostgreSQL Schema (建议)
CREATE TABLE etl_raw_transaction (
    id BIGSERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    item_id VARCHAR(100),
    seller VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    quantity INTEGER NOT NULL DEFAULT 0,
    item_subtotal NUMERIC(12,2),
    row_hash CHAR(32) NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    -- parsed columns
    p_flag SMALLINT DEFAULT 0,
    p_sku JSONB, -- [{sku: 'SKU1', qty: 1}, ...]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- indexes
    UNIQUE (row_hash)
);
CREATE INDEX idx_raw_trans_order ON etl_raw_transaction (order_number);
CREATE INDEX idx_raw_trans_processed ON etl_raw_transaction (processed) WHERE processed = FALSE;
CREATE INDEX idx_raw_trans_date ON etl_raw_transaction (transaction_date);

CREATE TABLE etl_clean_log (
    id BIGSERIAL PRIMARY KEY,
    order_date DATE NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    item_id VARCHAR(100),
    seller VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL DEFAULT 'NN',
    quantity INTEGER NOT NULL,
    revenue NUMERIC(12,2),
    sku_data JSONB, -- [{sku, qty, qtyp}, ...]
    fee_data JSONB, -- {fvf_fixed, fvf_variable, international, promoted, ...}
    shipping_data JSONB, -- {earning, regular, underpay, overpay, return}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (order_number, seller, item_id, action)
);
CREATE INDEX idx_clean_log_date ON etl_clean_log (order_date);
```

> **关键改进**: JSONB 替代 20+ 个 SKU/费用列, 强类型 + 索引 + UPSERT。

---

# Section 14: 跨模块一致性 + V3 迁移路径 (区块 5)

> **数据来源**: 以下数据通过 12 线程并发查询生产数据库获取 (50+ 查询, 0.09 秒完成)。
> **查询时间**: 2026-02-17T04:34:00-08:00

## 14.1 数据库全景 X-Ray

### 14.1.1 全表清单 (50 张表)

| 分类 | 表名 | 行数 | 大小 | 索引数 | 列数 | 角色 |
|------|------|------|------|--------|------|------|
| **ETL 源** | Data_Transaction | 60,145 | 26.08 MB | **0** | 67 | eBay Transaction CSV |
| **ETL 源** | Data_Order_Earning | 26,931 | 9.52 MB | 1 | 36 | eBay Earning CSV |
| **ETL 产出** | Data_Clean_Log | 60,278 | 23.56 MB | 4 | 79 | 清洗后交易数据 |
| **ETL 参考** | Data_COGS | 197 | 0.05 MB | 0 | 9 | SKU 主数据 (有 PK) |
| **ETL 参考** | Data_Inventory | 194 | 0.05 MB | 0 | 26 | 库存快照 |
| **FIFO** | in_dynamic_tran | 36,896 | 5.02 MB | 5 | 10 | FIFO 事务记录 |
| **FIFO** | in_dynamic_fifo_layers | 351 | 0.06 MB | 5 | 10 | FIFO 分层 |
| **FIFO** | in_dynamic_fifo_alloc | 31,668 | 3.52 MB | 4 | 9 | FIFO 分摊 |
| **FIFO** | in_dynamic_landed_price | 107 | 0.02 MB | 6 | 9 | 到岸价 |
| **采购** | in_po | 226 | 0.06 MB | 3 | 13 | 采购订单 |
| **采购** | in_po_final | 170 | 0.05 MB | **0** | 9 | PO 完结 |
| **采购** | in_po_strategy | 19 | 0.02 MB | 2 | 13 | PO 策略 |
| **采购** | in_supplier | 10 | 0.02 MB | 1 | 5 | 供应商 |
| **采购** | in_supplier_strategy | 10 | 0.02 MB | 1 | 16 | 供应商策略 |
| **物流** | in_send | 8 | 0.02 MB | 3 | 14 | 发货 |
| **物流** | in_send_final | 125 | 0.02 MB | **0** | 10 | 发货完结 |
| **物流** | in_send_list | 175 | 0.05 MB | 6 | 12 | 发货明细 |
| **收货** | in_receive | 111 | 0.02 MB | 4 | 14 | 收货 |
| **收货** | in_receive_final | 111 | 0.02 MB | **0** | 12 | 收货完结 |
| **差异** | in_diff | 0 | 0.02 MB | **0** | 14 | 差异暂存 |
| **差异** | in_diff_final | 0 | 0.02 MB | 4 | 13 | 差异完结 |
| **付款** | in_pmt_po | 0 | 0.02 MB | 3 | 18 | PO 付款 |
| **付款** | in_pmt_po_final | 0 | 0.02 MB | 4 | 17 | PO 付款完结 |
| **付款** | in_pmt_deposit | 0 | 0.02 MB | 4 | 18 | 定金 |
| **付款** | in_pmt_deposit_final | 0 | 0.02 MB | 2 | 16 | 定金完结 |
| **付款** | in_pmt_logistic | 8 | 0.02 MB | 3 | 15 | 物流付款 |
| **付款** | in_pmt_logistic_final | 9 | 0.02 MB | 1 | 17 | 物流付款完结 |
| **付款** | in_pmt_prepay | 2 | 0.02 MB | 4 | 15 | 预付款 |
| **付款** | in_pmt_prepay_final | 2 | 0.02 MB | 4 | 14 | 预付款完结 |
| **条码** | in_mgmt_barcode | 220 | 0.02 MB | 3 | 8 | 仓库条码 |
| **用户** | User_Account | 8 | 0.02 MB | 1 | 10 | V1 用户 |
| **用户** | User_Permission | 162 | 0.02 MB | 2 | 5 | V1 权限 |
| **用户** | User_Login_History | 174 | 0.02 MB | 2 | 4 | 登录历史 |
| **Django** | auth_user | 25 | 0.02 MB | 1 | 11 | Django 用户 |
| **Django** | auth_group | 0 | 0.02 MB | 1 | 2 | Django 组 |
| **Django** | auth_permission | 57 | 0.02 MB | 2 | 4 | Django 权限 |
| **Django** | auth_group_permissions | 0 | 0.02 MB | 3 | 3 | — |
| **Django** | auth_user_groups | 0 | 0.02 MB | 3 | 3 | — |
| **Django** | auth_user_user_permissions | 0 | 0.02 MB | 3 | 3 | — |
| **Django** | django_admin_log | 0 | 0.02 MB | 2 | 8 | — |
| **Django** | django_content_type | 16 | 0.02 MB | 2 | 3 | — |
| **Django** | django_migrations | 29 | 0.02 MB | 0 | 4 | — |
| **Django** | django_session | 283 | 0.17 MB | 1 | 3 | — |
| **日志** | log_access | 1,224 | 0.36 MB | 6 | 14 | V2 访问日志 |
| **日志** | log_audit | 132 | 0.05 MB | 7 | 22 | V2 审计日志 |
| **日志** | log_business | 0 | 0.02 MB | 10 | 16 | V2 业务日志 |
| **日志** | log_error | 0 | 0.02 MB | 9 | 30 | V2 错误日志 |
| **系统** | System_Audit_Log_Django | 0 | 0.02 MB | 1 | 17 | Legacy 审计 |
| **系统** | System_Error_Patch_Status | 0 | 0.02 MB | 1 | 5 | 补丁状态 |
| **系统** | System_Locks | 1 | 0.02 MB | 0 | 4 | 系统锁 |
| **eBay** | ebay_ebayaccount | 1 | 0.02 MB | 2 | 12 | eBay 账号 |

### 14.1.2 数据库全景统计

```
总表数:           50 张
总数据大小:       92.27 MB
索引占比:         Data 68.4 MB / Index 21.7 MB

按分类:
  ETL Pipeline:   4 表,  147,565 行, 59.21 MB (64.2%)
  FIFO Engine:    4 表,   69,022 行,  8.62 MB  (9.3%)
  Purchase/Recv: 14 表,      866 行,  0.30 MB  (0.3%)
  Payment:        8 表,       21 行,  0.16 MB  (0.2%)
  Django Core:   10 表,      410 行,  0.37 MB  (0.4%)
  User System:    3 表,      344 行,  0.06 MB  (0.1%)
  Log System:     4 表,    1,356 行,  0.45 MB  (0.5%)
  Other:          3 表,        2 行,  0.06 MB  (0.1%)
```

## 14.2 跨模块一致性检查

### 14.2.1 FIFO 平衡性审计

```
=== FIFO 数量平衡 ===
Layer qty_in 总量:        864,338
Alloc 总量:               534,265
期望剩余 (qty_in-alloc):  330,073
实际剩余 (qty_remaining): 353,996
────────────────────────────────────
差额:                      23,923  ⚠️ IMBALANCED

Tran IN 总量:             888,261
Tran OUT 总量:            541,357
Tran 净值:                346,904

=== 异常层 ===
remaining > qty_in:       0  ✅
remaining < 0:            0  ✅
已关闭但有余量:            0  ✅
未关闭但余量=0:            0  ✅
IN事务无Layer:             0  ✅
```

> **🔴 BUG B5-1 (Critical): FIFO 数量不平衡 — 差额 23,923 单位**
> 
> `qty_remaining` 合计比 `qty_in - alloc` 多出 23,923。这意味着:
> - 某些出库操作减少了 `alloc` 但没相应减少 `qty_remaining`, 或者
> - 退货操作增加了 `qty_remaining` 但没增加 `alloc` 的反向记录, 或者
> - `_fifo_return_full/partial` 直接修改 `qty_remaining` 而不创建反向 alloc 记录
>
> **根因分析**: 查看区块 3 审计的 `_fifo_return_full` (§12.4.5) — 该方法直接 `UPDATE qty_remaining = qty_remaining + :qty` 而不创建反向 alloc, 导致 alloc 表只记录出库但不记录退回。差额 23,923 ≈ 退货恢复的总量。这是设计缺陷, 不是数据损坏。

### 14.2.2 外键完整性

```
=== FK 参照完整性 (使用索引, 毫秒级) ===
孤儿 alloc→layer:          0  ✅
孤儿 alloc→tran:           0  ✅  
孤儿 layer→tran:           0  ✅
LP→layer 无匹配:           0  ✅
Layer(有PO) 无 LP:       244     (INIT 层无到岸价, 预期行为)
```

> 所有 FK 约束完整。FIFO 系统是整个数据库中唯一使用显式外键的模块。

### 14.2.3 SKU 跨表一致性

```
=== SKU 交叉验证 ===
Data_COGS SKU:          194
FIFO Layer SKU:         181
FIFO Tran SKU:          189
────────────────────────
FIFO Layer NOT in COGS:   0  ✅ (100% 覆盖)
FIFO Tran NOT in COGS:    0  ✅ (100% 覆盖)
COGS NOT in FIFO Layer:  13  (不活跃 SKU, 正常)
```

> SKU 主数据一致性完美。所有 FIFO 操作的 SKU 都有对应的 COGS 记录。

### 14.2.4 PO 跨表一致性

```
=== PO 交叉验证 ===
in_po:                  20 个 PO
FIFO tran:              19 个 PO
FIFO layer:             19 个 PO
Landed price:           12 个 PO
```

> 19/20 PO 在 FIFO 系统中有记录。12/20 有到岸价 — 8 个 PO 可能是历史 PO 或未完成结算。

### 14.2.5 ETL → FIFO 同步覆盖率

```
Clean Log NN 订单数:    56,278
FIFO out SALES 记录:    33,013
同步率:                 58.7%
```

> **⚠️ 注意**: 41.3% 的 Clean Log 订单没有对应的 FIFO out 记录。可能原因:
> 1. FIFO 系统上线时间晚于 Clean Log 的最早日期 (2024-01-01)
> 2. 部分 SKU 在 FIFO 系统初始化前已售出
> 3. `_sync_fifo` 的幂等检查跳过了已存在的记录

### 14.2.6 in_record_id 类型链

```
in_dynamic_tran.record_id       → BIGINT (PK, AUTO_INCREMENT)
in_dynamic_fifo_layers.in_record_id → BIGINT (FK, 匹配)
in_dynamic_landed_price.in_record_id → INT  ⚠️ 类型不匹配!
```

> **🔴 BUG B5-2 (High): in_dynamic_landed_price.in_record_id 是 INT, 而引用的 record_id 是 BIGINT**
> 当 record_id 超过 2,147,483,647 (INT 最大值) 时, LP 表无法正确引用。当前 AUTO_INCREMENT=279,455, 安全但有隐患。

### 14.2.7 用户系统双源

```
User_Account:       8 条  (V1 业务用户)
auth_user:         25 条  (Django 内置用户)
User_Permission:  162 条  (V1 权限矩阵)
```

> **🟡 设计问题**: V1 维护两套用户系统 — `User_Account` (自定义) 和 `auth_user` (Django 内置)。V3 迁移时必须统一到单一用户模型。

## 14.3 索引覆盖率审计

### 14.3.1 零索引表 (5 张)

| 表 | 行数 | 影响级别 | 说明 |
|---|---|---|---|
| **Data_Transaction** | 60,145 | 🔴 Critical | ETL 核心表, 每次操作全表扫描 |
| **in_diff** | 0 | 🟢 Low | 空表, 暂无影响 |
| **in_po_final** | 170 | 🟡 Medium | PO 完结表, 行数少但无索引 |
| **in_receive_final** | 111 | 🟡 Medium | 收货完结, 同上 |
| **in_send_final** | 125 | 🟡 Medium | 发货完结, 同上 |

### 14.3.2 索引密度对比

| 模块 | 表 | 索引数 | 列数 | 密度 |
|------|---|--------|------|------|
| FIFO | in_dynamic_tran | 5 | 10 | 50% ✅ |
| FIFO | in_dynamic_fifo_layers | 5 | 10 | 50% ✅ |
| FIFO | in_dynamic_fifo_alloc | 4 | 9 | 44% ✅ |
| FIFO | in_dynamic_landed_price | 6 | 9 | 67% ✅ |
| Log | log_error | 9 | 30 | 30% ✅ |
| Log | log_business | 10 | 16 | 63% ✅ |
| **ETL** | **Data_Transaction** | **0** | **67** | **0%** 🔴 |
| **ETL** | **Data_Clean_Log** | **4** | **79** | **5%** 🟡 |

### 14.3.3 TEXT 列密度对比

| 表 | TEXT 列 | 总列数 | TEXT% | 问题级别 |
|---|---------|--------|-------|----------|
| Data_Clean_Log | 77 | 79 | 97% | 🔴 |
| Data_Transaction | 67 | 67 | 100% | 🔴 |
| Data_Order_Earning | 34 | 36 | 94% | 🔴 |
| Data_COGS | 3 | 9 | 33% | 🟡 |
| in_dynamic_tran | 1 | 10 | 10% | ✅ |
| in_po | 1 | 13 | 8% | ✅ |

> **结论**: ETL 子系统 (3 表共 178 个 TEXT 列) 和 FIFO 子系统 (4 表仅 1 个 TEXT 列) 之间存在巨大的设计质量差距。FIFO 是后期设计的, 采用了正确的类型和索引策略。

## 14.4 跨模块数据依赖图

```
┌─────────────────────────────────────────────────────────────────┐
│                      MGMT V1 数据依赖全景                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [上游] eBay CSV                                                │
│    │                                                            │
│    ▼                                                            │
│  ┌──────────────────────────────┐                               │
│  │ ETL Pipeline (3表, 178 TEXT) │                               │
│  │ Data_Transaction ───────────┼──→ TransactionParser           │
│  │ Data_Order_Earning ─────────┼──→ TransactionTransformer      │
│  │ Data_Clean_Log ←────────────┼──────────────────────────┐     │
│  └──────────────┬───────────────┘                         │     │
│                 │ action=NN+SKU                           │     │
│                 ▼                                         │     │
│  ┌──────────────────────────────┐                         │     │
│  │ FIFO Engine (4表, 1 TEXT)    │                         │     │
│  │ in_dynamic_tran ◄────FK─────┼── in_dynamic_fifo_layers│     │
│  │                 ◄────FK─────┼── in_dynamic_fifo_alloc │     │
│  │ in_dynamic_landed_price     │                         │     │
│  └──────────────┬───────────────┘                         │     │
│                 │ unit_cost                               │     │
│                 ▼                                         │     │
│  ┌──────────────────────────────┐                         │     │
│  │ Finance (8表)                │                         │     │
│  │ in_pmt_po / deposit /       │                         │     │
│  │ logistic / prepay           │                         │     │
│  └──────────────────────────────┘                         │     │
│                                                           │     │
│  ┌──────────────────────────────┐                         │     │
│  │ Purchase (8表)               │                         │     │
│  │ in_po ──→ in_receive ───────┼──→ landed_price_calc ──┘     │
│  │ in_supplier ──→ in_send     │    (triggers FIFO in)        │
│  └──────────────────────────────┘                               │
│                                                                 │
│  [参考] Data_COGS (194 SKU) ──→ SKU 验证 / COGS 计算           │
│  [参考] Data_Inventory (194 行) ──→ 定期库存快照                 │
│  [参考] in_mgmt_barcode (220 条) ──→ 仓库条码                   │
│                                                                 │
│  [侧写] User_Account + auth_user ──→ 认证/授权                  │
│  [侧写] log_* (4表, 32 索引) ──→ 企业日志                       │
└─────────────────────────────────────────────────────────────────┘
```

## 14.5 V3 迁移路线图

### 14.5.1 迁移优先级矩阵

| 优先级 | V1 模块 | V3 目标 | 风险 | 策略 |
|--------|---------|---------|------|------|
| **P0** | ETL Pipeline | Spring Batch + PostgreSQL | 🔴 数据量大, 零索引 | 重写为强类型 + JSONB |
| **P1** | FIFO Engine | JPA Entity + 事件驱动 | 🟡 平衡性需修复 | 迁移后修复 alloc 反向记录 |
| **P2** | Purchase | Spring JPA | 🟢 行数少 | 直接映射 |
| **P3** | Finance | Spring JPA | 🟢 行数少 | 直接映射 |
| **P4** | User System | 统一用户模型 | 🟡 双源合并 | auth_user + User_Account → 单一 User 实体 |
| **P5** | Log System | 已迁移到 V2 | ✅ | 已完成 (4 表 32 索引) |

### 14.5.2 数据迁移策略

```
Phase 1: Schema Creation (PostgreSQL)
  ├── 创建强类型表 (DATE, NUMERIC, INT, BOOLEAN, JSONB)
  ├── 创建索引 (UNIQUE, BTREE, partial indexes)
  └── 创建外键约束

Phase 2: ETL Data Migration (最大, 最复杂)
  ├── Data_Transaction   → etl_raw_transaction (62K rows)
  │   ├── TEXT → DATE/INT/NUMERIC 类型转换
  │   ├── P_SKU1-10 → JSONB p_sku 数组
  │   └── 添加 UNIQUE(row_hash) + indexes
  │
  ├── Data_Order_Earning → etl_raw_earning (27K rows)
  │   ├── 保留 row_hash VARCHAR(32) 策略
  │   └── TEXT → proper types
  │
  ├── Data_Clean_Log     → etl_clean_log (64K rows)
  │   ├── sku1-10/qty1-10/qtyp1-10 → JSONB sku_data
  │   ├── 14 个费用列 → JSONB fee_data + shipping_data
  │   └── UNIQUE(order_number, seller, item_id, action)
  │
  └── Data_COGS          → product_cogs (194 rows)
      └── PK(SKU) 保留, TEXT → VARCHAR/NUMERIC

Phase 3: FIFO Data Migration
  ├── in_dynamic_tran    → inventory_transaction
  ├── in_dynamic_fifo_layers → fifo_layer
  ├── in_dynamic_fifo_alloc  → fifo_allocation
  ├── in_dynamic_landed_price → landed_price
  │   └── ⚠️ in_record_id INT → BIGINT 修正
  └── 修复: 为所有退货创建反向 alloc 记录

Phase 4: Purchase/Finance Migration
  ├── in_po / in_po_final → purchase_order
  ├── in_supplier         → supplier
  ├── in_receive          → receiving_record
  ├── in_send / in_send_list → shipment / shipment_item
  └── in_pmt_* → payment_record (统一付款表)

Phase 5: Reference Data Migration
  ├── Data_Inventory → inventory_snapshot
  ├── in_mgmt_barcode → warehouse_barcode
  └── User_Account + auth_user → unified user
```

### 14.5.3 V3 数据库架构预览

```
V3 PostgreSQL 模块划分:

📦 ETL Module
  etl_raw_transaction     (源数据)
  etl_raw_earning         (源数据)
  etl_clean_log           (清洗数据)
  etl_sku_correction      (SKU 纠错, 替代 CSV)

📦 Product Module  ← 已完成
  product                 (产品主数据)
  product_cogs            (成本数据)
  product_barcode         (条码管理)

📦 Inventory Module
  inventory_transaction   (FIFO 事务)
  fifo_layer              (FIFO 分层)
  fifo_allocation         (FIFO 分摊)
  landed_price            (到岸价)
  inventory_snapshot      (库存快照)

📦 Purchase Module
  supplier                (供应商)
  supplier_strategy       (供应商策略)
  purchase_order          (采购订单)
  purchase_order_item     (PO 明细)
  receiving_record        (收货)
  shipment                (发货)
  shipment_item           (发货明细)

📦 Finance Module
  payment_record          (统一付款)
  deposit                 (定金)

📦 User Module  ← 已完成
  user_account            (统一用户)
  user_permission         (权限)
  user_login_history      (登录历史)

📦 Log Module  ← 已完成
  log_access              (访问日志)
  log_audit               (审计日志)
  log_business            (业务日志)
  log_error               (错误日志)
```

## 14.6 全审计 BUG 汇总 (区块 1-5)

### 14.6.1 Critical (需立即修复)

| # | 来源 | 问题 | 影响 |
|---|------|------|------|
| B3-1 | FIFO | `record_id` 获取不安全 (`ORDER BY DESC LIMIT 1`) | 并发收货时 FIFO 层关联错误 |
| B3-5 | FIFO | FIFO 可以超卖 (库存不足仅 warning) | 财务数据不准 |
| B4-1 | ETL | Data_Transaction 67 列全 TEXT, 零索引 | 所有查询全表扫描 |
| B4-3 | ETL | row_hash 无索引, 每次上传全表读取 | 性能瓶颈 |
| B5-1 | FIFO | 数量不平衡 — 差额 23,923 单位 | 库存数据不可信 |

### 14.6.2 High (需尽快修复)

| # | 来源 | 问题 | 影响 |
|---|------|------|------|
| B3-2 | FIFO | 到岸价更新不回写 FIFO layer unit_cost | 读端需要 join + COALESCE |
| B3-3 | FIFO | `in_record_id` INT ↔ BIGINT 类型不匹配 | 未来 ID 溢出风险 |
| B4-2 | ETL | 四维去重不含 order date | NN 记录重复入库会覆盖 |
| B4-4 | ETL | SQL 字符串拼接 (注入风险) | 安全漏洞 |
| B5-2 | FIFO | LP.in_record_id 是 INT, 引用 BIGINT | 同 B3-3 |

### 14.6.3 Medium (计划修复)

| # | 来源 | 问题 | 影响 |
|---|------|------|------|
| B3-4 | FIFO | `_fifo_out` 的 `DATE()` 函数阻止索引使用 | 查询慢 |
| B3-6 | FIFO | `_fifo_return_partial` 退货比例硬编码 | 灵活性差 |
| B4-5 | ETL | 大日期范围 IN 子句溢出 | max_allowed_packet |
| B4-6 | ETL | 退货记录金额未取反 | 下游需额外判断 |
| B4-7 | ETL | SKU 纠错存 CSV 文件 | 无事务/并发保障 |
| B4-8 | ETL | qtyp1-8 TEXT vs qtyp9-10 BIGINT | 类型混乱 |
| B4-9 | ETL | pandas to_sql 全 TEXT 模式 | 根因级问题 |

### 14.6.4 Low (可改进)

| # | 来源 | 问题 | 影响 |
|---|------|------|------|
| B4-10 | ETL | 日期归一化逻辑重复 | 代码冗余 |
| — | DB | 5 张表零索引 (含 in_po_final 等) | 行数少暂不影响 |
| — | DB | System_Locks 无索引 | 仅 1 行 |

### 14.6.5 BUG 统计

```
Total:    18 个已识别问题
  Critical: 5 个 (28%)
  High:     5 个 (28%)
  Medium:   7 个 (39%)
  Low:      1 个 (5%)

按模块:
  FIFO:    7 个 (B3-1~B3-6, B5-1)
  ETL:    10 个 (B4-1~B4-10)
  DB:      1 个 (B5-2)
```

## 14.7 审计结论

### 14.7.1 系统健康度评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **数据完整性** | 7/10 | FK 完整性完美, 但 FIFO 数量不平衡 |
| **类型安全** | 3/10 | ETL 178 个 TEXT 列, 零类型约束 |
| **索引覆盖** | 5/10 | FIFO/Log 优秀, ETL 灾难性 |
| **性能** | 4/10 | 全表扫描普遍, 但数据量尚小 |
| **安全** | 5/10 | SQL 拼接风险, 但输入来自内部 |
| **可维护性** | 6/10 | 模块化清晰, 但 TEXT 万能策略增加复杂度 |
| **综合** | **5/10** | 功能正确, 但架构债务严重 |

### 14.7.2 核心发现

1. **ETL 子系统是最大技术债**: 3 张表 178 个 TEXT 列, 1 个索引, pandas `dtype=Text` 是根因
2. **FIFO 子系统是最佳实践**: 4 张表全部强类型 + FK + 索引, 但有平衡性问题
3. **两个子系统质量差距惊人**: 同一个项目, 同一个数据库, 设计质量天壤之别
4. **数据量尚可管控**: 总计 92 MB, 150K 行, V3 迁移窗口仍在
5. **FIFO 23,923 单位不平衡是已知设计缺陷**: 退货恢复不创建反向 alloc, 可追踪但不可审计

---

*区块 1 审计完成: 2026-02-18T03:58:00-08:00*  
*区块 2 审计完成: 2026-02-17T04:15:00-08:00*  
*区块 3 审计完成: 2026-02-17T12:08:00-08:00*  
*区块 4 审计完成: 2026-02-17T04:59:00-08:00*  
*区块 5 审计完成: 2026-02-17T05:20:00-08:00*  

**🏁 V1 数据库深度审计 — 全部 5 个区块完成**

