# FIFO 金额表设计文档

> 最后更新: 2026-01-10  
> 适用模块: 采购板块、财务板块、库存FIFO

---

## 1. 概述

### 1.1 背景

FIFO（先进先出）库存管理需要追踪每批货物的入库成本。入库成本（landed_price）由以下组件构成：

```
landed_price = actual_price + fee_apportioned

其中:
  actual_price = base_price × payment_ratio
  fee_apportioned = (物流费 + 额外费用) 按重量摊销 / 数量
```

### 1.2 问题

landed_price 受付款状态影响，是**动态计算**的值：
- 付款比例变动 → `payment_ratio` 变化
- 物流付款变动 → `fee_apportioned` 变化
- 入库数量修改 → 摊销基数变化

### 1.3 解决方案

创建独立的价格表 `in_dynamic_landed_price`：
- 与 FIFO 表分离，专门管理价格
- FIFO 表通过 JOIN 获取价格，只负责数量流转
- 付款/数量变动时只需更新价格表

---

## 2. 表结构

### 2.1 表定义

```sql
CREATE TABLE in_dynamic_landed_price (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    -- ========== 关联标识 ==========
    in_record_id    BIGINT UNIQUE,        -- 关联 in_dynamic_fifo_layers.in_record_id
    logistic_num    VARCHAR(50) NOT NULL, -- 物流单号（含父子单）
    po_num          VARCHAR(50) NOT NULL, -- 订单号
    sku             VARCHAR(100) NOT NULL, -- SKU
    qty             INT NOT NULL,          -- 入库数量
    
    -- ========== 最终价格 ==========
    landed_price_usd DECIMAL(10,4),       -- 入库单价 (USD)
    
    -- ========== 时间戳 ==========
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- ========== 索引 ==========
    INDEX idx_logistic (logistic_num),
    INDEX idx_po (po_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT | 自增主键 |
| `in_record_id` | BIGINT | 关联 FIFO 层的 `in_record_id`，唯一 |
| `logistic_num` | VARCHAR(50) | 物流单号，含子单（如 `TEST01_delay_V01`）|
| `po_num` | VARCHAR(50) | 订单号 |
| `sku` | VARCHAR(100) | SKU 编码 |
| `qty` | INT | 入库数量（用于费用摊销计算）|
| `landed_price_usd` | DECIMAL(10,4) | 入库单价（USD），最终计算结果 |

### 2.3 与 FIFO 表的关联

```sql
-- 查询 FIFO 层的实时成本
SELECT 
    l.layer_id,
    l.sku,
    l.qty_in,
    l.qty_remaining,
    COALESCE(p.landed_price_usd, l.unit_cost) AS current_unit_cost
FROM in_dynamic_fifo_layers l
LEFT JOIN in_dynamic_landed_price p ON l.in_record_id = p.in_record_id
```

---

## 3. 触发规则

### 3.1 创建记录 (INSERT)

| 触发事件 | 模块 | 函数位置 | 说明 |
|---------|------|---------|------|
| 首次入库 | 货物入库 | `receive/submit.py` | 物流单确认入库时创建 |
| 延迟入库的货物入库 | 货物入库 | `receive/submit.py` | 子物流单 (`XXX_delay_V##`) 入库时创建 |

**创建规则**：
- 每个 `(logistic_num, po_num, sku)` 组合对应一条价格记录
- 创建时立即计算 `landed_price_usd`
- 子物流单遵循"子随父"原则：物流费从父单获取

### 3.2 更新记录 (UPDATE)

| 触发事件 | 模块 | 影响范围 | 说明 |
|---------|------|---------|------|
| 入库数量修改 | 入库管理 | `WHERE logistic_num = ?` | qty 变化影响 fee_apportioned |
| 定金支付 | 财务-定金 | `WHERE po_num = ?` | 影响 payment_ratio |
| 定金删除 | 财务-定金 | `WHERE po_num = ?` | 影响 payment_ratio |
| 货款支付 | 财务-货款 | `WHERE po_num = ?` | 影响 payment_ratio |
| 货款删除 | 财务-货款 | `WHERE po_num = ?` | 影响 payment_ratio |
| 物流付款 | 财务-物流 | `WHERE logistic_num = ? OR 父物流 = ?` | 影响 fee_apportioned |
| 物流付款删除 | 财务-物流 | `WHERE logistic_num = ? OR 父物流 = ?` | 影响 fee_apportioned |

**更新规则**：
- 钱不可改，只能删后重付
- 更新时重新计算 `landed_price_usd`
- 物流付款变动需更新父单及所有子单

### 3.3 删除记录 (DELETE)

| 触发事件 | 说明 |
|---------|------|
| 入库单删除 | 如果入库单被删除（软删除），对应价格记录也应处理 |

**注意**：当前系统入库单删除为软删除，价格记录可保留但标记失效。

---

## 4. 计算逻辑

### 4.1 landed_price 计算公式

```
landed_price_usd = actual_price_usd + fee_apportioned_usd

其中:
  actual_price_usd = base_price_usd × payment_ratio
  
  payment_ratio:
    - 未付清: 1.0（使用订单总价值计算）
    - 已付清: actual_paid_usd / total_order_usd（可能 < 1.0 有折让）
    - 调整Override: 1.0（开关打开即视为付清，无视实际支付金额）
  
  fee_apportioned_usd = (fee_pool_usd × weight_ratio) / qty
  
  fee_pool_usd = 订单extra摊销 + 物流extra摊销 + 物流费摊销
```

### 4.2 付款规则说明

| 场景 | payment_ratio | 说明 |
|------|---------------|------|
| 未支付 | 1.0 | 使用订单原价 |
| 部分支付（Partial）| 1.0 | 使用订单原价，不按已付比例调整 |
| 全额付清 | `actual_paid / total_order` | 可能 < 1.0（供应商折让）|
| 定金Override开关 | 视为付清 | `in_pmt_deposit_final.dep_override = 1` |
| 货款Override开关 | 视为付清 | `in_pmt_po_final.pmt_override = 1` |

**Override 逻辑**：
- 若 `pmt_override = 1`，则 `balance_remaining = 0`，视为已付清
- 此时 `payment_ratio = actual_paid / total_order`（可能 < 1.0）

**多次支付**：
- 定金/货款可以分多次支付
- 每次支付后触发价格重算
- 只有**全部付清或 Override**时 `payment_ratio` 才可能 ≠ 1.0

### 4.3 数据来源

| 组件 | 来源表 | 变动触发点 |
|------|-------|-----------|
| `base_price` | `in_po_final.po_price` | 不变（订单价格不可改）|
| `payment_ratio` | `in_pmt_deposit_final` + `in_pmt_po_final` | 定金/货款变动 |
| 物流费 | `in_send.total_price` | 不变（物流成本固定）|
| 物流费汇率 | `in_pmt_logistic_final.usd_rmb` | 物流付款变动 |
| 物流extra费 | `in_pmt_logistic_final.extra_paid` | 物流付款变动 |
| 订单extra费 | `in_pmt_deposit/po_final.extra_amount` | 定金/货款变动 |
| SKU重量 | `Data_COGS.Weight` | 不变 |
| 入库数量 | `in_receive_final.receive_quantity` | 入库修改 |

### 4.4 子随父原则

对于子物流单（`XXX_delay_V##` 或 `XXX_V##`）：
- 物流费从父单获取（子单 `in_send.total_price = 0`）
- 物流付款汇率从父单获取
- 物流extra费从父单获取
- 重量占比按父单总重量计算

### 4.5 费用摊销详细计算步骤

以下是 `flow_detail_api` 中的完整计算逻辑，价格表计算应保持一致：

#### Step 1: 获取基础信息
```python
# 订单货币和汇率
order_currency = in_po_strategy.cur_currency  # USD/RMB
order_usd_rmb = in_po_strategy.cur_usd_rmb

# 订单总金额
raw_total = SUM(in_po_final.po_price × po_quantity) WHERE po_num = ?
```

#### Step 2: 计算 payment_ratio
```python
# 定金已付（转 USD）
dep_paid_usd = SUM(in_pmt_deposit_final.dep_cash_amount + dep_prepay_amount) / 汇率

# 货款已付（转 USD）
pmt_paid_usd = SUM(in_pmt_po_final.pmt_cash_amount + pmt_prepay_amount) / 汇率

actual_paid_usd = dep_paid_usd + pmt_paid_usd
total_usd = raw_total / order_usd_rmb  # (若订单为USD则直接用)

# 判断是否付清
is_fully_paid = (total_usd - actual_paid_usd) <= 0.01

if is_fully_paid:
    payment_ratio = actual_paid_usd / total_usd  # 可能 < 1.0
else:
    payment_ratio = 1.0
```

#### Step 3: 计算额外费用（extra）
```python
# 订单 extra（定金+货款）
order_extra_usd = (
    SUM(in_pmt_deposit_final.extra_amount) / 汇率 +
    SUM(in_pmt_po_final.extra_amount) / 汇率
)

# 物流 extra（从 in_pmt_logistic_final）
log_extra_usd = in_pmt_logistic_final.extra_paid / 汇率
```

#### Step 4: 计算费用池（fee_pool）
```python
# 统计该订单下有多少母物流单
logistics_count = COUNT(DISTINCT 母物流单)

# 订单 extra 摊销到每个物流单
apportioned_order_extra_usd = order_extra_usd / logistics_count

# 物流 extra 摊销到该物流单下的每个订单
po_count = COUNT(DISTINCT po_num) WHERE logistic_num IN 母物流单及子单
apportioned_log_extra_usd = log_extra_usd / po_count

# 物流费（RMB）- 只从母单获取
log_total_price_rmb = in_send.total_price WHERE logistic_num = 母单

# 当前订单在该物流单的重量
order_weight_in_log = SUM(Data_COGS.Weight × qty) 当前订单所有SKU

# 物流单总重量（含所有订单）
log_total_weight = SUM(Data_COGS.Weight × qty) 物流单下所有订单所有SKU

# 按重量占比分摊物流费
order_weight_ratio = order_weight_in_log / log_total_weight
order_log_cost_rmb = log_total_price_rmb × order_weight_ratio
order_log_cost_usd = order_log_cost_rmb / usd_rmb

# 费用池
fee_pool_usd = apportioned_order_extra_usd + apportioned_log_extra_usd + order_log_cost_usd
```

#### Step 5: 计算每个 SKU 的 landed_price
```python
for each (sku, price, qty) in 订单内该物流单的SKU:
    # 转 USD
    if order_currency == 'USD':
        price_usd = price
    else:
        price_usd = price / order_usd_rmb
    
    # 实际单价
    actual_price_usd = price_usd × payment_ratio
    
    # SKU 费用摊销
    sku_weight = Data_COGS.Weight(sku) × qty
    weight_ratio = sku_weight / order_weight_in_log
    fee_apportioned_usd = (fee_pool_usd × weight_ratio) / qty
    
    # 入库单价
    landed_price_usd = actual_price_usd + fee_apportioned_usd
```

### 4.6 特殊场景

#### 尚未发货的 SKU

如果订单有 SKU 尚未发货（`in_send_final` 无记录）：
- 按订单数量 - 已发货数量 = 未发货数量
- 未发货部分无物流费摊销，`fee_apportioned = 0`
- `landed_price = actual_price`（仅含货物成本）

#### 汇率选择规则

```python
if 物流已付款:
    usd_rmb = in_pmt_logistic_final.usd_rmb  # 付款时的汇率
else:
    usd_rmb = in_send.usd_rmb  # 发货时的汇率
```

---

## 5. 核心函数

### 5.1 设计原则：复用现有逻辑

**重要**：价格计算逻辑已在 `flow_detail_api` 中实现，应复用而非重复。

建议架构：

```
flow/api.py (flow_detail_api)
    └── 调用 calculate_landed_prices(po_num, logistic_num)  ← 共享函数

finance/utils/landed_price.py (新建)
    ├── calculate_landed_prices(po_num)  ← 核心计算逻辑
    │       返回: { (logistic_num, po_num, sku): landed_price_usd, ... }
    │
    ├── create_landed_price_records(logistic_num)    ← 入库时创建
    └── recalculate_landed_prices(po_num/logistic)   ← 付款变动时更新

receive/submit.py
    └── 调用 create_landed_price_records(logistic_num)

deposit/po/logistic APIs
    └── 调用 recalculate_landed_prices(...)
```

### 5.2 共享计算函数

```python
# finance/utils/landed_price.py

def calculate_landed_prices(po_num):
    """
    计算订单下所有 SKU 的 landed_price
    
    复用 flow_detail_api 的计算逻辑
    
    返回:
        dict: { (logistic_num, po_num, sku, price): landed_price_usd, ... }
    """
    # === 从 flow_detail_api 提取的核心计算逻辑 ===
    # Step 1: 获取订单基础信息
    # Step 2: 计算 payment_ratio
    # Step 3: 计算额外费用
    # Step 4: 分组物流单，计算费用池
    # Step 5: 计算每个 SKU 的 landed_price
    pass

def create_landed_price_records(logistic_num):
    """
    入库时创建价格记录
    
    1. 从 in_receive_final 获取入库的 SKU 列表
    2. 对每个 po_num 调用 calculate_landed_prices
    3. INSERT in_dynamic_landed_price
    """
    pass

def recalculate_landed_prices(po_num=None, logistic_num=None):
    """
    付款变动时重新计算并更新价格表
    
    1. 确定受影响的 po_num 列表
    2. 调用 calculate_landed_prices 重新计算
    3. UPDATE in_dynamic_landed_price
    """
    pass
```

### 5.3 重构 flow_detail_api

```python
# 修改 flow_detail_api 使用共享函数
from finance.utils.landed_price import calculate_landed_prices

def flow_detail_api(request):
    po_num = request.GET.get('po_num')
    
    # 使用共享函数计算
    prices = calculate_landed_prices(po_num)
    
    # 组装返回数据...
```

**好处**：
- 单一数据源，逻辑一致
- `flow_detail_api` 和价格表使用同一套计算
- 修改计算逻辑只需改一处

### 5.4 函数调用位置

| 模块 | 文件 | 函数 | 调用时机 |
|------|------|------|---------|
| 货物入库 | `receive/submit.py` | `submit_receive_api` | 入库成功后 CREATE |
| 入库管理 | `receive_mgmt/edit.py` | `receive_edit_submit_api` | 修改成功后 UPDATE |
| 定金支付 | `finance/views/deposit/` | 支付/删除 API | 操作成功后 UPDATE |
| 货款支付 | `finance/views/po/` | 支付/删除 API | 操作成功后 UPDATE |
| 物流付款 | `finance/views/logistic.py` | 支付/删除 API | 操作成功后 UPDATE |

---

## 6. 与现有模块的集成

### 6.1 采购板块

#### 货物入库 (`purchase/views/receive/submit.py`)

**修改点**：入库成功后，创建价格记录

```python
# 在 submit_receive_api 函数末尾添加
# 创建 in_dynamic_landed_price 记录
for rec in rows_to_write:
    create_landed_price_record(
        in_record_id=...,  # 对应 FIFO 层的 in_record_id
        logistic_num=rec['logistic_num'],
        po_num=rec['po_num'],
        sku=rec['po_sku'],
        qty=rec['receive_quantity']
    )
```

#### 入库管理 (`purchase/views/receive_mgmt/edit.py`)

**修改点**：修改成功后，更新价格记录

```python
# 在 receive_edit_submit_api 函数末尾添加
recalculate_landed_prices(logistic_num=logistic_num)
```

#### 入库异常处理 (`purchase/views/abnormal.py`)

**延迟入库（策略3）说明**：
- 创建子物流单 `{logistic_num}_delay_V##` 时，不创建价格记录
- 子物流单**入库时**才创建价格记录
- 价格计算遵循"子随父"原则

### 6.2 财务板块

#### 定金支付/删除

**位置**：`finance/views/deposit/` 相关 API

**修改点**：
```python
# 在支付/删除成功后添加
recalculate_landed_prices(po_num=po_num)
```

#### 货款支付/删除

**位置**：`finance/views/po/` 相关 API

**修改点**：
```python
# 在支付/删除成功后添加
recalculate_landed_prices(po_num=po_num)
```

#### 物流付款/删除

**位置**：`finance/views/logistic.py` 相关 API

**修改点**：
```python
# 在支付/删除成功后添加
# 注意：需处理父单及所有子单
recalculate_landed_prices(logistic_num=logistic_num)
```

---

## 7. 异常场景处理

### 7.1 入库数量修改

| 场景 | 处理方式 |
|------|---------|
| 数量增加 | 更新 `qty`，重新计算 `landed_price_usd` |
| 数量减少 | 更新 `qty`，重新计算 `landed_price_usd` |
| 数量归零 | 保留记录，`landed_price_usd` 可能计算异常（需处理除零）|

### 7.2 付款变动

| 场景 | 处理方式 |
|------|---------|
| 首次支付 | 重新计算所有关联记录 |
| 删除支付 | 重新计算所有关联记录 |
| 多次支付 | 每次支付后重新计算 |

### 7.3 入库异常处理（4种策略）

入库异常处理模块（`abnormal.py`）提供4种差异处理策略，每种对价格表的影响不同：

#### 策略1：仅修正发货单 (M1)

**操作**：
- 将 `in_send_final.sent_quantity` 改为与 `receive_quantity` 一致
- 将 `in_receive_final.sent_quantity` 同步修正
- `in_diff_final.diff_quantity` 设为 0

**对价格表影响**：
- ❌ **不影响**（入库数量 `receive_quantity` 未变）
- 不需要触发价格重算

---

#### 策略2：同步修正发货单与订单 (M2)

**操作**：
- 修正 `in_po_final.po_quantity`
- 修正 `in_send_final.sent_quantity`
- 修正 `in_receive_final.sent_quantity`
- `in_diff_final.diff_quantity` 设为 0

**对价格表影响**：
- ❌ **不影响**（入库数量 `receive_quantity` 未变）
- 订单总金额变化可能影响 `payment_ratio`，但因为还未付清，ratio = 1.0 不变
- 不需要触发价格重算

---

#### 策略3：延迟入库 (M3) - 仅适用于少收

**操作**：
- 创建子物流单 `{logistic_num}_delay_V##`
- 子物流单 `in_send.total_price = 0`（无物流费用）
- 子物流单在 `in_send_list` 和 `in_send_final` 中记录待发货物
- 原差异记录 `in_diff_final.diff_quantity` 设为 0

**对价格表影响**：
- ⚠️ **延迟影响**
- 子物流单创建时：**不创建价格记录**（尚未入库）
- 子物流单**入库时**：创建价格记录
- 价格计算遵循**子随父原则**：
  - 子单 `landed_price` 使用父单的物流费摊销
  - 父单已付物流费 × (子单货物重量 / 父单总重量)

**触发点**：
- 子物流单确认入库时 → INSERT 价格记录

---

#### 策略4：厂商错误 (M4)

**操作**：
- 新增 `in_po_final` 记录（多收以 `po_price=0`，少收以原价）
- 新增 `in_send_final` 记录
- 新增 `in_receive_final` 记录
- 原差异记录 `in_diff_final.diff_quantity` 设为 0

**场景A：多收（diff_quantity < 0）**
- 多余货物以 **单价 0** 入库
- 新增一条 `in_receive_final` 记录，`po_price = 0`
- **对价格表影响**：✅ **需创建新价格记录**
  - `base_price = 0`
  - `landed_price = 0 + fee_apportioned`（仅含物流摊销）

**场景B：少收（diff_quantity > 0）**
- TODO：原代码标注需要出库逻辑
- 当前处理：以原价新增记录
- **对价格表影响**：✅ **需创建新价格记录**
  - `base_price = original_price`
  - `landed_price = original_price + fee_apportioned`

**触发点**：
- 策略4执行成功后 → INSERT 价格记录（多收/少收的新增部分）

---

### 7.4 异常处理删除（Undo）

异常处理支持删除（回滚），删除时需同步处理价格表：

| 策略 | 删除操作 | 对价格表影响 |
|-----|---------|-------------|
| M1 | 从 `in_send_list` 删除 | 不影响 |
| M2 | 从 `in_po`、`in_send_list` 删除 | 不影响 |
| M3 | 删除子物流单 `*_delay_V##` | 若子单已入库，需 DELETE 对应价格记录 |
| M4 | 从 `in_po_final`、`in_send_final`、`in_receive_final` 删除 | DELETE 对应价格记录 |

**注意**：
- M3/M4 删除时，若关联的价格记录已存在，必须同步删除
- 若价格记录已被 FIFO 分配（有 alloc 记录），需评估是否允许删除

---

## 8. 数据一致性

### 8.1 事务要求

价格记录的创建/更新应与原操作在同一事务中：

```python
with DBClient.atomic_transaction():
    # 原操作（如入库写入）
    ...
    # 价格记录操作
    create_or_update_landed_price(...)
```

### 8.2 数据对账

定期检查价格表与 FIFO 层的一致性：

```sql
-- 查找 FIFO 层中缺少价格记录的记录
SELECT l.* 
FROM in_dynamic_fifo_layers l
LEFT JOIN in_dynamic_landed_price p ON l.in_record_id = p.in_record_id
WHERE p.id IS NULL AND l.po_num NOT LIKE 'INIT-%'
```

---

## 9. 迁移计划

### 9.1 历史数据处理

对于已入库但无价格记录的历史数据：
1. 扫描 `in_receive_final` 中的所有入库记录
2. 对每条记录计算 `landed_price_usd`
3. 插入 `in_dynamic_landed_price`

### 9.2 初始化脚本

```python
def init_landed_price_table():
    """
    初始化价格表：
    1. 扫描 in_receive_final
    2. 关联 in_dynamic_fifo_layers 获取 in_record_id
    3. 计算 landed_price_usd
    4. 写入 in_dynamic_landed_price
    """
    pass
```

---

## 10. 附录

### 10.1 相关表

| 表名 | 作用 |
|------|------|
| `in_dynamic_tran` | 库存交易记录 |
| `in_dynamic_fifo_layers` | FIFO 层（入库批次）|
| `in_dynamic_fifo_alloc` | FIFO 分配（出库明细）|
| `in_dynamic_landed_price` | 入库单价（本文档定义）|
| `in_receive_final` | 入库终态 |
| `in_pmt_deposit_final` | 定金付款终态 |
| `in_pmt_po_final` | 货款付款终态 |
| `in_pmt_logistic_final` | 物流付款终态 |

### 10.2 相关文档

- `订收发流程.md` - 采购流程说明
- `定金支付.md` - 定金支付逻辑
- `订单支付.md` - 货款支付逻辑
- `定发收总预览.md` - 综合预览逻辑

---

## 11. 版本历史

| 版本 | 日期 | 作者 | 说明 |
|------|------|------|------|
| 1.0 | 2026-01-10 | System | 初始设计 |
