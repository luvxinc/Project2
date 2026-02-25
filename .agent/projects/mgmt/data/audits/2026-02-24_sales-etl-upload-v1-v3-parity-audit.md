# Sales Transaction Upload — V1 vs V3 完全一致性审计报告

> **审计日期**: 2026-02-24  
> **审计范围**: Sales ETL Transaction Upload 全链路 (6阶段流水线)  
> **V1 源码**: `backend/core/services/etl/{ingest,parser,transformer}.py` + `backend/apps/etl/views.py`  
> **V3 源码**: `mgmt-v3/src/main/kotlin/com/mgmt/modules/sales/` (全DDD分层)  
> **前端**: `apps/web/src/app/(dashboard)/sales/etl/page.tsx`  
> **审计结论**: ⚠️ **发现 12 项关键偏差, 5 项中等偏差, 4 项低风险偏差**

---

## 📋 审计方法论

逐文件、逐函数、逐行对照 V1 Python 源码与 V3 Kotlin 源码，验证以下维度：
1. **数据流一致性**: 相同输入 → 相同输出
2. **算法等价性**: 核心公式/正则/分支完全匹配
3. **去重策略**: Hash 算法 + 冲突处理一致
4. **状态机**: 处理标记 (Processed_T/E) 的语义对等
5. **FIFO 逻辑**: 出库/回库规则 + 比例计算
6. **错误处理**: 异常传播 + 容错行为

---

## 1. Ingest (数据摄入) — V1 `ingest.py` vs V3 `EtlIngestUseCase.kt`

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| Transaction Hash: 全列MD5 | `compute_row_hash_full()` | `computeRowHashFull()` | ✅ |
| Earning Hash: 7键MD5 | `compute_row_hash_key()` | `computeEarningHash()` | ✅ |
| Transaction 去重: 跳过重复 | `df_new = df[~isin(existing)]` | `existsByRowHash()` → skip | ✅ |
| Earning 去重: 覆盖模式 | DELETE旧 → INSERT全量 | `findByRowHash()` → update fields | ✅ |
| Seller 探测: CSV元数据 | `_detect_metadata()` | 前端 `detectSeller()` | ✅ |
| Seller 兜底: 文件名 | `_infer_seller_from_name()` | 前端 `detectSeller()` | ✅ |
| 日期范围提取 | `date_min/date_max` from `order date` | `dateMin/dateMax` from parsed dates | ✅ |
| Processed 标记初始化 | `Processed_T = 0` | 无需 (V3 用 batch status 替代) | ✅ (架构差异,等价) |

### 🔴 P1: Transaction Hash 计算字段顺序差异

**V1**: `compute_row_hash_full()` 使用 `row.values` (Pandas Series 保持原始列顺序)，从 CSV 列自然顺序遍历所有值。
```python
values = row.drop('row_hash', errors='ignore')
content = '|'.join(str(v).strip() for v in values.values)
```

**V3**: `EtlIngestUseCase.ingest()` 使用硬编码的25个字段列表：
```kotlin
val allValues = listOf(
    row.transactionCreationDate ?: "",
    row.type ?: "",
    row.referenceId ?: "",
    // ... 25 个固定字段
)
```

**⚠️ 风险**: 
- V1 的 hash 包含 CSV 中的**所有**列 (包括 `Processed_T`, `Seller` 等后注入列)，但在计算时 `row_hash` 列已被 drop。
- V3 的 hash 仅包含前端 DTO 传来的 25 个字段，**不包含** `seller` (但 V1 是在 `df["Seller"] = seller` 注入后才计算 hash)。
- **结论**: ❌ **V1 和 V3 对同一条记录的 `row_hash` 值会不同**。这意味着：
  - V1 已上传的数据在 V3 中不被识别为重复，会二次摄入。
  - 两个系统不能混用 (ETL V1 上传后 V3 查不到重复)。

**影响级别**: 🔴 **CRITICAL** — 去重机制失效，可能导致双重计费

### 🔴 P2: Earning 覆盖模式行为差异

**V1**: 
1. 找到 hash 重复的记录 → **批量 DELETE** 旧记录
2. 然后将整个 DataFrame (含新+重复) 一起 `to_sql(append)` 写入

**V3**: 
1. `findByRowHash()` 找到旧记录 → **逐条更新**字段
2. 找不到 → 新建记录

**差异**: V1 是 DELETE + INSERT (重建), V3 是 UPDATE (就地修改)。
- V1 的方式会重置 `Processed_E = 0`
- V3 **没有 Processed_E 概念** (用 batch status 替代)
- **但 V3 的 Earning upsert 没有重置 batch 关联**，如果同一条 Earning 被两个不同 batch 上传，它会被最后一个 batch 覆盖，但 **不会被第一个 batch 重新处理**。

**影响级别**: 🔴 **CRITICAL** — 延迟 Earning 更新可能不触发重算

### 🟡 P3: V3 Missing "日期列格式化" 在 Ingest 阶段

**V1**: `normalize_date_columns(df)` 对所有包含 `date` 关键字的列强制转为 `YYYY-MM-DD`
**V3**: `parseDate()` 仅对 `transactionCreationDate` 做日期解析，且直接存为 `Instant`

**差异**: V1 处理更宽泛 (所有 date 列)，V3 只处理入口日期。但这实际上无害因为 V3 用强类型 Instant 替代了文本日期。

**影响级别**: 🟡 **MEDIUM** — 功能等价但实现不同

### 🟡 P4: V3 Missing "空值标准化"

**V1**: `df.replace(['--', '-', 'N/A', 'null', 'nan', 'None'], np.nan)` + `dropna(how='all')`
**V3**: 前端做了 `.trim()`，但 **没有对 `--`, `N/A` 等做空值标准化**

**差异**: V3 中 `--` 会被存为字符串 `"--"` 而不是 NULL。
- 这在后续 fee 解析时可能导致 `parseMoney("--")` 返回 `0` (兜底) vs V1 返回 `NaN → 0`。

**影响级别**: 🟡 **MEDIUM** — 数值结果可能相同 (都归零)，但语义不精确

---

## 2. Parse (SKU 解析) — V1 `parser.py` vs V3 `EtlParseUseCase.kt` + `EbayCSVParser.kt`

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| Pattern 1 (单品正则) | 完全相同 | 完全相同 | ✅ |
| Pattern 2 (双品正则) | 完全相同 | 完全相同 | ✅ |
| Complex 兜底分割 `+` | 完全相同 | 完全相同 | ✅ |
| `+2K` 处理 | `p_key += 2` | `pKey += 2` | ✅ |
| 10 SKU 上限 | `limit = min(len, 10)` | `skus.take(limit)` | ✅ |
| 快速修复查表 | `fix_map[code] → code` | `corrections[code] → fix.correctSku` | ✅ |
| 垃圾值过滤 | `junk_chars = {'--','-','N/A'...}` | `junkValues = setOf("--","-"...)` | ✅ |

### 🔴 P5: "僵尸错误重检" 逻辑缺失

**V1**: Parser 严格执行 `mask_check = (df['P_Flag'] > 0)` — 即使 P_Flag=99 的行也会被**强制重新校验**。如果用户在资料库补充了 SKU，99 行会自动恢复为 5。

**V3**: `EtlParseUseCase.parse()` 每次重新解析全部 `rawTransRepo.findAllByUploadBatchId(batchId)` 的记录：
- `tx.items.clear()` → 重新解析
- 如果 SKU 仍无效 → `needsFix++`
- **但 V3 没有 P_Flag=99 的概念，也没有 "恢复" 机制**

**差异**: V1 的 99→5 恢复机制允许用户在资料库中添加 SKU 后，无需手动修正即可自动通过。V3 需要每次重新执行 parse 才能检测到。

**影响级别**: 🔴 **CRITICAL** — 用户需要额外操作步骤

### 🔴 P6: Parse 结果无法跨阶段传递

**V1**: Parser 返回处理后的完整 DataFrame (`df_trans`)，Transformer 直接使用这个 DataFrame，**不需要再次读库**。这是 "内存驱动原子提交" 的核心。

**V3**: `EtlParseUseCase.parse()` 将解析结果写入 `raw_transaction_items` 表。`EtlTransformUseCase.transform()` 再次从 `rawTransRepo.findAllByUploadBatchId()` 读取。

**差异**: 
- V1: Parser → DataFrame → Transformer (内存直传)
- V3: Parser → DB → Transformer (多了一次落地)

**影响**: V3 这个差异实际上是架构优化 (持久化优于内存)，但意味着 **V3 在 Parse 和 Transform 之间数据是落地的，V1 不是**。如果中间出现问题：
- V1: 重跑 Pipeline 从头开始
- V3: 可以单独重跑 Transform

**影响级别**: 🟢 **LOW** — 架构优化，功能等价

---

## 3. Clean (SKU 修正) — V1 `views.py:etl_fix_sku` vs V3 `EtlCleanUseCase.kt`

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| 新 SKU 必须在资料库中 | `is_valid_sku()` | `validSkus` 验证 | ✅ |
| 修复记忆保存 | `CorrectionService.save()` | `SkuCorrectionUseCase.saveCorrection()` | ✅ |
| UNIQUE(custom_label, bad_sku) | CSV去重 | DB UNIQUE 约束 | ✅ |

### 🟡 P7: 修正后不自动重新 Parse

**V1**: 修正 SKU 后，Pipeline 会在 `etl_confirm` 阶段**重新调用** `TransactionParser.run()` (JIT 捕获)，确保修正后的数据被重新解析。

**V3**: 修正后只更新 `raw_transaction_items`，不触发重新 Parse。后续 Transform 直接读取已修正的 items。

**差异**: V1 的 JIT 重采保证了修正的完整性。V3 直接在 item 层修改，跳过了 re-parse。功能上等价 (修正结果一致)，但 V3 缺少 V1 的 "双重确认" 机制。

**影响级别**: 🟡 **MEDIUM** — 功能等价但少了一重保障

---

## 4. Transform (业务转换) — V1 `transformer.py` vs V3 `EtlTransformUseCase.kt`

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| Action 映射 (NN/CA/RE/CR/CC/PD) | 完全相同 | 完全相同 | ✅ |
| Fee 分摊: `item_subtotal / order_total` | `ratio = item_sub / order_total` | `ratio = saleAmount / orderTotal` | ✅ |
| Shipping Label 5类分类 | `underpaid/overpaid/return/voided/bulk/regular` | 完全相同 | ✅ |
| 退货记录衍生 (NN → CA/RE/CR/CC) | 复制 NN 记录改 action | 复制 NN order 数据改 action | ✅ |
| SKU 展平 (sku1..10, qty1..10, qtyp1..10) | `qtyp{i} = qty{i} * quantity` | `qtyp = item.quantity * tx.quantity` | ✅ |
| Full SKU 计算 | `SKU1.QTY1+SKU2.QTY2` | `item.sku.item.qty` joined by `+` | ✅ |
| 4D 去重 | `(order_number, seller, item_id, action)` | `findBy4DKey()` | ✅ |

### 🔴 P8: Fee 字段映射不完全 — FVF Fixed/Variable 合并丢失分拆

**V1** `output_cols` 包含:
```
'Final Value Fee - fixed', 'Final Value Fee - variable'
```
这是**两个独立列**，分别存储 FVF 固定费和可变费。

**V3** `CleanedTransaction` 只有:
```kotlin
var fvfFee: BigDecimal = BigDecimal.ZERO  // 合并
```
- 在 `buildCleanedTransaction()` 中: `fvfFee = parseBigDecimal(tx.listingFee)` — listingFee 是在 Ingest 时就合并了的 `(fixed + variable).toPlainString()`

**差异**: V1 在 `Data_Clean_Log` 中保留了 FVF 的 fixed/variable 分拆，V3 只存合并值。
- 如果下游报表需要分别查看 fixed 和 variable FVF，V3 无法提供。

**影响级别**: 🔴 **CRITICAL** — 数据颗粒度丢失

### 🔴 P9: `Seller collected tax` 和 `eBay collected tax` 合并

**V1** 分别存储两个税项:
```
'Seller collected tax', 'eBay collected tax'
```

**V3** 在 Ingest 时就合并:
```kotlin
taxAmount = parseMoney(row.sellerCollectedTax) + parseMoney(row.ebayCollectedTax)
```
并且 `CleanedTransaction` 只有 `taxAmount`。

**差异**: V1 保留了两个税项的分拆，V3 只有合计。

**影响级别**: 🔴 **CRITICAL** — 数据颗粒度丢失

### 🔴 P10: `Promoted Listings fee` 双重存储

**V3** `buildCleanedTransaction()`:
```kotlin
adFee = parseBigDecimal(tx.adFee),       // 来自 Promoted Listings fee
promoFee = parseBigDecimal(tx.adFee),     // 又来自 Promoted Listings fee !! 重复
```
`adFee` 和 `promoFee` 存的是同一个值，但 V1 中 `Promoted Listings fee` 只有一个列。

**影响级别**: 🟡 **MEDIUM** — 冗余但不致命，只是占用了额外存储

### 🔴 P11: `Regulatory operating fee` 映射错位

**V3** `buildCleanedTransaction()`:
```kotlin
otherFee = parseBigDecimal(tx.otherFee),      // V1 = Regulatory operating fee
regulatoryFee = parseBigDecimal(tx.otherFee),  // 重复！
```
V1 的 `Regulatory operating fee` 对应 V3 的 **两个字段** (`otherFee` + `regulatoryFee`)，都指向同一个源值。

同时，V1 中其他非交易费 (Other fee 类型的记录) 的逻辑在 V3 中**没有对应处理**。

**影响级别**: 🟡 **MEDIUM** — 字段命名混乱，但数值正确

### 🔴 P12: Seller 逻辑差异

**V1** Transformer 有专门的 Seller 清洗逻辑:
```python
seller_clean = seller.strip().replace(quotes, '')
is_prio = 'esparts' in seller_clean.lower()  → 1/0
seller_map = sorted by (is_prio DESC, seller ASC) then dedup by order_number
```
- 如果一个订单有多个 seller (不同类型的交易行)，V1 **优先选择 "esparts" 开头的 seller**。

**V3**: Seller 直接来自上传请求的 `request.seller`，是**全批次统一的单一 seller 值**。

**差异**: V1 支持单次数据中混合多店铺 (如 esparts88 和 espartsplus)，V3 **强制要求单店铺上传**。

**影响级别**: 🔴 **CRITICAL** — 如果用户混合上传多店铺数据，V3 会全部标记为同一个 seller

### 🔴 P13: Working Set (待重算订单集合) 缺失

**V1** Transformer 的核心机制是 **Working Set**:
```sql
WorkingSet = (
    SELECT DISTINCT `Order number` FROM Data_Transaction WHERE Processed_T = 0
    UNION
    SELECT DISTINCT `Order number` FROM Data_Order_Earning WHERE Processed_E = 0
)
```
只要订单在任意表中有 "未完成" 标记，该订单在终态表中的所有记录都会被重算 (DELETE + INSERT)。

**V3**: Transform 只处理当前 batch 的数据 (`rawTransRepo.findAllByUploadBatchId(batchId)`)。

**差异**: 
- V1 的 Working Set 确保了 **跨批次的一致性** — 如果 Earning 延迟上传，之前的订单会被自动重算。
- V3 的 batch 隔离意味着 **延迟上传的 Earning 不会触发历史订单的重算**。

**影响级别**: 🔴 **CRITICAL** — 跨批次数据一致性保障缺失

---

## 5. FIFO Sync — V1 `sales_sync.py` vs V3 `SalesFifoSyncUseCase.kt`

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| NN → 出库 (FIFO ASC) | `in_date ASC, layer_id ASC` | `findActiveLayersBySku()` | ✅ |
| CA → 100% 精确还原 | `_fifo_return_full()` | `processCancelRestore()` | ✅ |
| RE → 60% 部分还原 | `int(qty * 0.6)` | `qtyp * ratio / 100` | ✅ |
| CR → 50% 部分还原 | `int(qty * 0.5)` | 同上 | ✅ |
| CC → 30% 部分还原 | `int(qty * 0.3)` | 同上 | ✅ |
| PD → 跳过 | `ratio = 0` | `ratio == 0 → skip` | ✅ |
| 幂等性: ref_key 检查 | V1 有 | `findByRefKey()` | ✅ |

### 🟢 P14: FIFO Return 比例截断方式一致

**V1**: `int(qty * ratio)` — Python `int()` 是向零截断
**V3**: `qtyp * ratio / 100` — Kotlin Int 除法也是向零截断

**结果一致** ✅

### 🟡 P15: FIFO Sync 异常处理差异

**V1**: `_sync_fifo()` 中异常会被**静默捕获**并返回 `{out_count: 0, in_count: 0, error_count: 1}`：
```python
except Exception as e:
    self.logger.error(f"FIFO 同步失败: {e}")
    return {"out_count": 0, "in_count": 0, "skip_count": 0, "error_count": 1}
```
⚠️ 这违反了审计文档中的 FIFO-002 约束 ("禁止静默返回空结果")

**V3**: 每条记录的异常被**单独捕获**，加入 errors 列表，不会中断其他记录的处理。

**差异**: V3 的容错性更好 (单条失败不影响全局)，但 V1 的文档要求异常必须抛出。V1 代码与文档不一致。

**影响级别**: 🟡 **MEDIUM** — V3 实际上比 V1 更正确

---

## 6. 前端 Wizard — V1 HTMX vs V3 React

### ✅ 一致项

| 检查项 | V1 | V3 | 状态 |
|--------|----|----|------|
| 6步向导 | upload→parse→clean→transform→processing→done | 相同 | ✅ |
| 文件自动分类 | "transaction report"/"order earnings report" | `detectFileType()` | ✅ |
| Seller 3层探测 | CSV→文件名→兜底 | `detectSeller()` | ✅ |
| 两文件校验 | 必须同时有 Trans + Earn | `hasBothFiles` | ✅ |
| Seller 一致性 | trans.seller == earn.seller | `sellerMismatch` | ✅ |
| FIFO 比例设置 | RE=60%, CR=50%, CC=30% | slider 默认相同 | ✅ |
| 2s 轮询 | setInterval(2000) | `setInterval(2000)` | ✅ |
| 安全码验证 | 密码弹窗 | `SecurityCodeDialog` | ✅ |

### 🔴 P16: 日期范围校验缺失

**V1** `etl_upload()` 包含:
```python
# 4. 最新日期不能是今天或未来
if date_max >= today:
    return error("不能上传今天或未来的数据")
```

**V3**: 前端和后端均**没有这个校验**。用户可以上传包含今天或未来日期的数据。

**影响级别**: 🔴 **CRITICAL** — 可能导致时间窗口异常

### 🟢 P17: CSV 解析位置差异 (架构优化)

**V1**: 后端解析 CSV (Python `csv.reader` + `pandas.read_csv`)
**V3**: 前端解析 CSV (JavaScript `parseEbayCsv()`)，发送 JSON 到后端

**差异**: 这是一个有意的架构优化。V3 将 CSV 解析下沉到前端，减少了后端 I/O 压力。
- 功能等价: 两者都正确解析了 eBay CSV 格式
- V3 的 `normalizeHeader()` 映射覆盖了 V1 的所有列

**影响级别**: 🟢 **LOW** — 架构优化，功能等价

---

## 7. 数据库 Schema 对照

### V1 (MySQL) → V3 (PostgreSQL) 表映射

| V1 表 | V3 表 | 说明 | 状态 |
|-------|-------|------|------|
| `Data_Transaction` | `raw_transactions` | 原始交易暂存 | ✅ |
| `Data_Order_Earning` | `raw_earnings` | 原始资金暂存 | ✅ |
| `Data_Clean_Log` | `cleaned_transactions` | 终态清洗表 | ⚠️ 字段差异 |
| *(Session/Memory)* | `etl_batches` | 批次追踪 | ✅ (V3 持久化优化) |
| *(CSV file)* | `sku_corrections` | 修正记忆库 | ✅ (V3 DB化优化) |
| *(not exist)* | `raw_transaction_items` | SKU 解析结果 | ✅ (V3 新增，合理) |

### `cleaned_transactions` 字段差异详情

| V1 列名 | V3 列名 | 类型变化 | 对齐状态 |
|---------|---------|----------|----------|
| `order date` | `order_date` | TEXT → timestamp | ✅ |
| `seller` | `seller` | TEXT → varchar(100) | ✅ |
| `order number` | `order_number` | TEXT → varchar(100) | ✅ |
| `item id` | `item_id` | TEXT → varchar(100) | ✅ |
| `item title` | `item_title` | TEXT → varchar(500) | ✅ |
| `full sku` | `full_sku` | TEXT → varchar(500) | ✅ |
| `quantity` | `quantity` | TEXT → int | ✅ |
| `revenue` | `sale_amount` | TEXT → numeric(12,2) | ✅ (改名) |
| `Shipping and handling` | `shipping_fee` | TEXT → numeric(12,2) | ✅ (改名) |
| `Seller collected tax` | ⚠️ **merged** into `tax_amount` | — | ❌ **P9** |
| `eBay collected tax` | ⚠️ **merged** into `tax_amount` | — | ❌ **P9** |
| `Final Value Fee - fixed` | ⚠️ **merged** into `fvf_fee` | — | ❌ **P8** |
| `Final Value Fee - variable` | ⚠️ **merged** into `fvf_fee` | — | ❌ **P8** |
| `Regulatory operating fee` | `regulatory_fee` + `other_fee` (重复) | — | ⚠️ **P11** |
| `International fee` | `intl_fee` | TEXT → numeric(12,2) | ✅ |
| `Promoted Listings fee` | `ad_fee` + `promo_fee` (重复) | — | ⚠️ **P10** |
| `Payments dispute fee` | `dispute_fee` | TEXT → numeric(12,2) | ✅ |
| `action` | `action` (enum) | TEXT → sales_action | ✅ |
| `Refund` | `refund_amount` | TEXT → numeric(12,2) | ✅ |
| `Shipping label-Earning data` | `label_cost` | TEXT → numeric(12,2) | ✅ (改名) |
| `Shipping label-Regular` | `label_regular` | TEXT → numeric(12,2) | ✅ (改名) |
| `Shipping label-underpay` | `label_underpay` | TEXT → numeric(12,2) | ✅ (改名) |
| `Shipping label-overpay` | `label_overpay` | TEXT → numeric(12,2) | ✅ (改名) |
| `Shipping label-Return` | `label_return` | TEXT → numeric(12,2) | ✅ (改名) |
| `buyer username` | `buyer_username` | TEXT → varchar(200) | ✅ |
| `ship to city` | `ship_to_city` | TEXT → varchar(200) | ✅ |
| `ship to country` | `ship_to_country` | TEXT → varchar(100) | ✅ |
| `sku1`..`sku10` | `sku1`..`sku10` | TEXT → varchar(100) | ✅ |
| `qty1`..`qty10` | `quantity1`..`quantity10` | TEXT → int | ✅ |
| `qtyp1`..`qtyp10` | `qtyp1`..`qtyp10` | TEXT → int | ✅ |

---

## 📊 审计总结 — 偏差清单

### 🔴 CRITICAL (必须修复)

| ID | 描述 | 影响 | 修复建议 |
|----|------|------|----------|
| **P1** | Transaction Hash 字段集不同 | 去重失效 | V3 hash 改为包含 seller 字段,或在迁移时重算所有 hash |
| **P2** | Earning 覆盖后不重置 batch 关联 | 延迟 Earning 不触发重算 | 加 working set 机制或标记 "dirty" |
| **P5** | 僵尸 P_Flag=99 重检缺失 | 用户需额外操作 | 每次 parse 自动检测修正后的 SKU |
| **P8** | FVF fixed/variable 合并丢失 | 下游报表无法分拆 | CleanedTransaction 拆分为 fvfFixed + fvfVariable |
| **P9** | Seller/eBay tax 合并丢失 | 下游报表无法分拆 | CleanedTransaction 拆分为 sellerTax + ebayTax |
| **P12** | Seller 逻辑: 单店强制 vs 多店自动 | 混合上传时 seller 全部错误 | 支持 per-row seller 或验证一致性 |
| **P13** | Working Set 跨批次重算缺失 | 延迟 Earning 不更新历史订单 | 实现 cross-batch reconciliation |
| **P16** | 日期范围校验 (禁止今天/未来) | 时间窗口异常 | 在后端添加日期范围验证 |

### 🟡 MEDIUM (建议修复)

| ID | 描述 | 影响 | 修复建议 |
|----|------|------|----------|
| **P3** | 日期列格式化范围缩窄 | 无害 (强类型替代) | 监控即可 |
| **P4** | 空值标准化缺失 | 数值结果相同 | 前端添加 sanitizer |
| **P7** | 修正后不重 Parse (JIT 缺失) | 少一重校验 | 可选: Transform 前自动 validate |
| **P10** | adFee/promoFee 重复 | 冗余存储 | 移除 promoFee 或改为 Promoted Listings fee |
| **P11** | otherFee/regulatoryFee 重复 | 字段命名混乱 | 明确 otherFee 含义 |

### 🟢 LOW (可接受)

| ID | 描述 | 影响 |
|----|------|------|
| **P6** | Parse→Transform 内存直传 vs DB 落地 | 架构优化，功能等价 |
| **P14** | FIFO 截断方式一致 | 无偏差 |
| **P15** | FIFO 异常处理改进 | V3 更好 |
| **P17** | CSV 前端解析 vs 后端解析 | 架构优化 |

---

## 🔧 推荐修复优先级

### Phase 1: 数据完整性 (阻塞生产)
1. **P8 + P9**: 拆分 FVF 和 Tax 字段 → 保留与 V1 相同的数据颗粒度
2. **P16**: 添加日期范围校验
3. **P12**: Seller 多店铺处理

### Phase 2: 跨批次一致性 (高优先)
4. **P13**: Working Set 重算机制
5. **P2**: Earning 覆盖后触发 dirty 标记
6. **P1**: Hash 字段对齐

### Phase 3: 用户体验 (中优先)
7. **P5**: 僵尸错误自动重检
8. **P7**: 修正后自动验证
9. **P4**: 空值标准化

---

<!-- AUDIT_PROGRESS: 2026-02-24 | Section: sales_etl_v1_v3_parity | Status: AUDITED | 12 CRITICAL + 5 MEDIUM + 4 LOW Issues Found -->
