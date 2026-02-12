# ETL-FIFO 联动设计方案

> 文档版本: V3.0 (Final)  
> 最后更新: 2026-01-12  
> 状态: ✅ **已实现**  
> 类型: 工程文档

---

## 一、背景与目标

### 1.1 当前现状

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           当前数据流 (独立)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐                  ┌─────────────────────┐          │
│  │   交易数据上传 (ETL) │                  │   FIFO 库存系统     │          │
│  │                     │      ❌ 独立     │                     │          │
│  │  eBay CSV           │      无联动      │  采购入库           │          │
│  │     ↓               │                  │     ↓               │          │
│  │  Data_Clean_Log     │                  │  in_dynamic_*       │          │
│  └─────────────────────┘                  └─────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 目标状态

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           目标数据流 (联动)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐                  ┌─────────────────────┐          │
│  │   交易数据上传 (ETL) │      ✅ 联动     │   FIFO 库存系统     │          │
│  │                     │ ─────────────→  │                     │          │
│  │  eBay CSV           │    销售出库      │  in_dynamic_tran    │          │
│  │     ↓               │ ←─────────────  │  in_dynamic_fifo_*  │          │
│  │  Data_Clean_Log     │    退货回库      │                     │          │
│  └─────────────────────┘                  └─────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、业务规则 (已确认)

### 2.1 Action 与 FIFO 操作映射

| Action | 中文 | FIFO 操作 | 比例 | 回库策略 |
|--------|------|----------|------|---------|
| **NN** | 正常销售 | 出库 (out) | 100% | - |
| **CA** | 订单取消 | 回库 (in) | 100% | 精确还原原层 |
| **RE** | 主动退货 | 回库 (in) | 用户输入 | 优先还最贵层 |
| **CR** | 平台介入退货 | 回库 (in) | 用户输入 | 优先还最贵层 |
| **CC** | 平台强制退款 | 回库 (in) | 用户输入 | 优先还最贵层 |
| **PD** | 银行投诉 | 无操作 | 0% | - |

### 2.2 关键业务规则

| 规则 | 说明 |
|------|------|
| **先有 NN 才有其他** | 每个 CA/RE/CR/CC/PD 都对应一个 NN 记录 |
| **找不到 NN 则报错** | 如果回库时找不到对应的 NN 出库记录，阻止流程 |
| **回库成本精确还原** | 不能用平均成本，必须按原始 allocation 还原 |
| **部分回库优先还最贵** | RE/CR/CC 按 unit_cost 从高到低恢复 |
| **退货记录只包含退货SKU** | 如果订单有多个SKU，退货记录只包含被退的SKU |
| **比例用户输入** | RE/CR/CC 的回库比例在上传时由用户设置 |

### 2.3 回库成本还原示例

**场景: CA 100% 精确还原**
```
NN 出库 10 件：
├── Layer-A: 扣 6 件 @$5
└── Layer-B: 扣 4 件 @$6

CA 回库 10 件 (100%):
├── Layer-A: 恢复 6 件 @$5 ← 精确还原
└── Layer-B: 恢复 4 件 @$6 ← 精确还原
```

**场景: RE 60% 优先还最贵**
```
NN 出库 10 件：
├── Layer-A: 扣 6 件 @$5
└── Layer-B: 扣 4 件 @$6

RE 回库 60% = 6 件 (优先最贵):
├── Layer-B: 恢复 4 件 @$6 ← 最贵，先还完
└── Layer-A: 恢复 2 件 @$5 ← 补足 6 件
```

---

## 三、数据存储策略变更

### 3.1 原始表保留 (新增)

**之前**: 每次上传清空 Data_Transaction / Data_Order_Earning
**现在**: 保留所有历史数据，使用 Hash 去重

```python
import hashlib

def row_hash(row):
    """计算整行 MD5 hash"""
    return hashlib.md5(str(row.values).encode()).hexdigest()

# 追加时只插入 hash 不存在的行
df['row_hash'] = df.apply(row_hash, axis=1)
existing = db.read_df("SELECT row_hash FROM Data_Transaction")
df_new = df[~df['row_hash'].isin(existing['row_hash'])]
df_new.to_sql('Data_Transaction', engine, if_exists='append')
```

### 3.2 表结构变更

```sql
-- 原始表添加 hash 列
ALTER TABLE Data_Transaction ADD COLUMN row_hash VARCHAR(32);
ALTER TABLE Data_Order_Earning ADD COLUMN row_hash VARCHAR(32);

CREATE INDEX idx_row_hash ON Data_Transaction(row_hash);
CREATE INDEX idx_row_hash ON Data_Order_Earning(row_hash);
```

### 3.3 写入模式变更

| 表 | 之前 | 现在 |
|---|------|------|
| Data_Transaction | REPLACE (清空) | APPEND + Hash 去重 |
| Data_Order_Earning | REPLACE (清空) | APPEND + Hash 去重 |
| Data_Clean_Log | DELETE + INSERT (四维去重) | 纯 APPEND |
| in_dynamic_* | - | APPEND + note 去重 |

---

## 四、UI 变更

### 4.1 上传界面增加回库比例设置

```
┌─────────────────────────────────────────────────────────────────────┐
│  交易数据上传                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Transaction CSV:   [选择文件...]                                   │
│  Earning CSV:       [选择文件...]                                   │
│                                                                     │
│  ── FIFO 回库比例设置 ──────────────────────────────────────────── │
│                                                                     │
│  主动退货 (RE):     [ 60 ] %                                        │
│  平台介入退货 (CR): [ 50 ] %                                        │
│  平台强制退款 (CC): [ 30 ] %                                        │
│                                                                     │
│  ℹ️ CA 固定 100%，PD 固定 0%                                        │
│                                                                     │
│  [上传并处理]                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 参数传递

```python
# 前端提交
{
    "transaction_file": <file>,
    "earning_file": <file>,
    "return_ratios": {
        "RE": 0.6,
        "CR": 0.5,
        "CC": 0.3
    }
}

# 传递给 FIFO 服务
fifo_service = SalesFifoSyncService(return_ratios=return_ratios)
```

---

## 五、FIFO 服务设计

### 5.1 服务接口

```python
class SalesFifoSyncService:
    """销售数据 → FIFO 库存同步服务"""
    
    def __init__(self, return_ratios: dict):
        """
        Args:
            return_ratios: {'RE': 0.6, 'CR': 0.5, 'CC': 0.3}
        """
        self.return_ratios = {
            'CA': 1.0,  # 固定
            'RE': return_ratios.get('RE', 0.6),
            'CR': return_ratios.get('CR', 0.5),
            'CC': return_ratios.get('CC', 0.3),
            'PD': 0.0,  # 固定
        }
    
    def sync_from_sales(self, df: pd.DataFrame) -> dict:
        """同步销售数据到 FIFO"""
        pass
```

### 5.2 处理流程

```python
def sync_from_sales(self, df: pd.DataFrame) -> dict:
    stats = {"out": 0, "in": 0, "skip": 0, "error": 0}
    
    for _, row in df.iterrows():
        action = row.get('action', '').strip().upper()
        ref_key = self._build_ref_key(row)
        
        # 1. 幂等性检查
        if self._is_processed(ref_key):
            stats["skip"] += 1
            continue
        
        # 2. 按 Action 处理
        if action == 'NN':
            self._fifo_out(row, ref_key)
            stats["out"] += 1
            
        elif action == 'CA':
            self._fifo_return_full(row, ref_key)  # 100% 精确还原
            stats["in"] += 1
            
        elif action in ['RE', 'CR', 'CC']:
            ratio = self.return_ratios[action]
            self._fifo_return_partial(row, ref_key, ratio)
            stats["in"] += 1
            
        elif action == 'PD':
            stats["skip"] += 1  # 不操作
            
        else:
            stats["skip"] += 1
    
    return stats
```

### 5.3 唯一标识 (ref_key)

```python
def _build_ref_key(self, row) -> str:
    """构建唯一标识"""
    order_number = row.get('order number', '').strip()
    item_id = row.get('item id', '').strip()
    seller = row.get('seller', '').strip()
    action = row.get('action', '').strip().upper()
    
    return f"SALES:{seller}:{order_number}:{item_id}:{action}"
```

### 5.4 NN 出库

```python
def _fifo_out(self, row, ref_key):
    """FIFO 出库"""
    sku_list = self._parse_skus(row)  # [(sku, qtyp), ...]
    order_date = row.get('order date')
    
    with self.db.atomic_transaction() as conn:
        for sku, qty in sku_list:
            # 1. 创建出库流水
            out_record_id = self._insert_tran(
                conn, sku, qty, 'out', 'sale', order_date, ref_key
            )
            
            # 2. FIFO 分配 (从最早层开始)
            layers = self._get_available_layers(conn, sku)
            remaining = qty
            
            for layer in layers:
                if remaining <= 0:
                    break
                
                alloc_qty = min(remaining, layer['qty_remaining'])
                
                # 记录分配
                self._insert_alloc(
                    conn, out_record_id, layer['layer_id'], 
                    sku, order_date, alloc_qty, layer['unit_cost']
                )
                
                # 更新层
                self._update_layer_remaining(
                    conn, layer['layer_id'], 
                    layer['qty_remaining'] - alloc_qty
                )
                
                remaining -= alloc_qty
            
            if remaining > 0:
                self.logger.warning(f"库存不足: SKU={sku}, 缺口={remaining}")
```

### 5.5 CA 回库 (100% 精确还原)

```python
def _fifo_return_full(self, row, ref_key):
    """CA 回库: 100% 精确还原"""
    order_number = row.get('order number', '').strip()
    item_id = row.get('item id', '').strip()
    seller = row.get('seller', '').strip()
    
    # 1. 查找对应的 NN 出库记录
    nn_ref_key = f"SALES:{seller}:{order_number}:{item_id}:NN"
    nn_record = self._find_tran_by_note(nn_ref_key)
    
    if not nn_record:
        raise Exception(f"找不到对应的 NN 记录: {nn_ref_key}")
    
    # 2. 获取原始 allocation
    allocs = self._get_allocs_by_out_record(nn_record['record_id'])
    
    with self.db.atomic_transaction() as conn:
        # 3. 创建回库流水
        in_record_id = self._insert_tran(
            conn, nn_record['sku'], nn_record['quantity'],
            'in', 'cancel', row.get('order date'), ref_key,
            related_out_id=nn_record['record_id']
        )
        
        # 4. 精确还原每个层
        for alloc in allocs:
            self._update_layer_remaining(
                conn, alloc['layer_id'],
                alloc['qty_remaining'] + alloc['qty_alloc']  # 加回
            )
            
            # 记录回库分配
            self._insert_return_alloc(
                conn, in_record_id, alloc['layer_id'],
                alloc['qty_alloc'], alloc['unit_cost']
            )
```

### 5.6 RE/CR/CC 回库 (比例 + 优先最贵)

```python
def _fifo_return_partial(self, row, ref_key, ratio):
    """部分回库: 按比例 + 优先还最贵层"""
    order_number = row.get('order number', '').strip()
    item_id = row.get('item id', '').strip()
    seller = row.get('seller', '').strip()
    
    # 1. 查找对应的 NN 出库记录
    nn_ref_key = f"SALES:{seller}:{order_number}:{item_id}:NN"
    nn_record = self._find_tran_by_note(nn_ref_key)
    
    if not nn_record:
        raise Exception(f"找不到对应的 NN 记录: {nn_ref_key}")
    
    # 2. 获取 allocation (按 unit_cost 降序)
    allocs = self._get_allocs_by_out_record(
        nn_record['record_id'], 
        order_by='unit_cost DESC'  # 最贵的在前
    )
    
    # 3. 计算回库数量
    total_qty = sum(a['qty_alloc'] for a in allocs)
    return_qty = int(total_qty * ratio)
    
    with self.db.atomic_transaction() as conn:
        # 4. 创建回库流水
        in_record_id = self._insert_tran(
            conn, nn_record['sku'], return_qty,
            'in', 'return', row.get('order date'), ref_key,
            related_out_id=nn_record['record_id']
        )
        
        # 5. 优先还最贵层
        remaining = return_qty
        for alloc in allocs:
            if remaining <= 0:
                break
            
            restore_qty = min(remaining, alloc['qty_alloc'])
            
            # 恢复该层
            self._update_layer_remaining(
                conn, alloc['layer_id'],
                alloc['qty_remaining'] + restore_qty
            )
            
            # 记录回库分配
            self._insert_return_alloc(
                conn, in_record_id, alloc['layer_id'],
                restore_qty, alloc['unit_cost']
            )
            
            remaining -= restore_qty
```

### 5.7 SKU 解析

```python
def _parse_skus(self, row) -> List[Tuple[str, int]]:
    """解析 SKU 列表，返回 [(sku, qtyp), ...]"""
    result = []
    
    for i in range(1, 11):
        sku = str(row.get(f'sku{i}', '')).strip().upper()
        qtyp = int(float(row.get(f'qtyp{i}', 0) or 0))  # qtyp 是实际出库量
        
        if not sku or sku.lower() in ['nan', 'none', '']:
            continue
        
        if qtyp > 0:
            result.append((sku, qtyp))
    
    return result
```

---

## 六、完整数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ETL + FIFO 联动完整流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户上传:                                                                   │
│  ├── Transaction CSV                                                        │
│  ├── Earning CSV                                                            │
│  └── 回库比例设置 (RE: 60%, CR: 50%, CC: 30%)                               │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Step 1: IngestService                                               │   │
│  │  - 读取 CSV                                                          │   │
│  │  - 计算 row_hash                                                     │   │
│  │  - Hash 去重 APPEND 到原始表                                         │   │
│  │  - 注入 Seller 列                                                    │   │
│  └───────────────────────────────────┬─────────────────────────────────┘   │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Step 2: TransactionParser                                          │   │
│  │  - 解析 Custom Label → SKU1~10, Qty1~10                             │   │
│  │  - 计算 Action (NN/CA/RE/CR/CC/PD)                                  │   │
│  │  - 校验 SKU 有效性                                                   │   │
│  └───────────────────────────────────┬─────────────────────────────────┘   │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Step 3: TransactionTransformer                                     │   │
│  │  - 费用分摊                                                          │   │
│  │  - 日期标准化 (YYYY-MM-DD)                                           │   │
│  │  - 纯 APPEND 写入 Data_Clean_Log                                     │   │
│  └───────────────────────────────────┬─────────────────────────────────┘   │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Step 4: SalesFifoSyncService [NEW]                                 │   │
│  │  - 遍历新增记录                                                       │   │
│  │  - 幂等性检查 (note 去重)                                             │   │
│  │  - 按 Action + 用户设置比例执行 FIFO 操作                             │   │
│  └───────────────────────────────────┬─────────────────────────────────┘   │
│                                      │                                      │
│                    ┌─────────────────┼─────────────────┐                   │
│                    ▼                 ▼                 ▼                   │
│            ┌────────────┐    ┌────────────┐    ┌────────────┐             │
│            │ NN → 出库  │    │ CA → 100% │    │ RE/CR/CC   │             │
│            │ FIFO 扣减  │    │ 精确还原   │    │ 比例回库   │             │
│            └────────────┘    └────────────┘    └────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 七、边界情况处理

| 场景 | 处理 |
|------|------|
| 找不到对应的 NN 记录 | **报错阻止流程** |
| 出库时库存不足 | 记录警告，继续执行（允许负库存） |
| 重复上传相同数据 | 幂等性检查，跳过已处理 |
| 退货数量超过原出库 | 以原出库数量 * 比例为准 |

---

## 八、初始数据

- **FIFO 初始库存日期**: 2024-12-31
- 上传 2025-01-01 之后的销售数据，基于此初始库存计算

---

## 九、实现步骤

### Phase 1: 表结构变更 (0.5天)

- [ ] Data_Transaction 添加 row_hash 列
- [ ] Data_Order_Earning 添加 row_hash 列
- [ ] 创建索引

### Phase 2: IngestService 改造 (0.5天)

- [ ] Hash 计算逻辑
- [ ] APPEND + 去重逻辑
- [ ] 移除 TRUNCATE

### Phase 3: Transformer 简化 (0.5天)

- [ ] Data_Clean_Log 改为纯 APPEND
- [ ] 移除四维去重逻辑

### Phase 4: FIFO 服务 (2天)

- [ ] 创建 SalesFifoSyncService
- [ ] 实现 NN 出库
- [ ] 实现 CA 精确回库
- [ ] 实现 RE/CR/CC 比例回库
- [ ] 幂等性检查

### Phase 5: UI 变更 (0.5天)

- [ ] 上传界面添加比例输入框
- [ ] 参数传递到后端

### Phase 6: 测试 (1天)

- [ ] 端到端测试
- [ ] 边界情况测试

---

## 十、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 找不到 NN 记录 | 数据完整性检查 + 报错阻止 |
| 原始表数据量增长 | 定期归档 + 压缩存储 |
| FIFO 层数据不一致 | 事务保护 + 完整性约束 |

---

## 十一、附录

### 11.1 相关表

| 表 | 说明 |
|---|------|
| Data_Transaction | 原始 Transaction CSV |
| Data_Order_Earning | 原始 Earning CSV |
| Data_Clean_Log | 清洗后交易数据 |
| in_dynamic_tran | FIFO 流水表 |
| in_dynamic_fifo_layers | FIFO 库存层 |
| in_dynamic_fifo_alloc | FIFO 分配记录 |

### 11.2 相关文档

- `aid/reportanalysis/交易数据上传.md` - ETL 详解
- `aid/reportanalysis/销售分析.md` - 报表生成器详解
- `scripts/create_in_dynamic_tables.sql` - FIFO 表结构

---

**文档结束**
