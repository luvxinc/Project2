# Spec: Sales ETL V1→V3 一致性修复

> **日期**: 2026-02-24  
> **任务**: 修复 P1/P8/P9/P12/P13/P16 审计发现  
> **影响范围**: 后端 6 个文件 + DB Schema 1表 + 前端 1 文件  
> **路径**: Standard Path (Schema 变更 + 多文件 + 核心逻辑)

---

## 需求领悟

用户需要:
1. **P1**: 分析 V1 hash 策略的长期影响 → **仅出规划建议, 不编码**
2. **P8+P9**: 拆分 FVF (fixed/variable) 和 Tax (seller/ebay) → **编码修复**
3. **P12**: Seller 逻辑匹配 V1 的多店铺自动识别 → **编码修复**
4. **P13**: Working Set 跨批次重算机制 → **编码修复**
5. **P16**: 日期范围校验 → **编码修复**

---

## P1 深度分析: Hash 策略

### V1 如何做

```python
# V1 ingest.py: compute_row_hash_full()
values = row.drop('row_hash', errors='ignore')  # 去掉 row_hash 本身
content = '|'.join(str(v).strip() for v in values.values)  # 所有其他列
return hashlib.md5(content.encode('utf-8')).hexdigest()
```

处理流程:
1. 读取 CSV → DataFrame (所有列都是原始 CSV 列)
2. `df["Seller"] = seller` — 注入 Seller 列
3. `df.replace(['--', '-', 'N/A'], np.nan)` — 清洗空值
4. `normalize_date_columns(df)` — 日期格式化
5. **然后** 计算 hash → 此时 hash 包含: 原始CSV列 + Seller + 清洗后的值

所以 V1 的 hash **参与计算的列是动态的** — 取决于 CSV 中有多少列。如果 eBay 的 CSV 增、减、改列，hash 就会变化。

### V3 当前如何做

```kotlin
// V3 EtlIngestUseCase.ingest()
val allValues = listOf(
    row.transactionCreationDate ?: "",
    row.type ?: "",
    // ... 25 个固定字段 (不含 seller)
)
val rowHash = csvParser.computeRowHashFull(allValues)
```

V3 的 hash 是**固定 25 字段**，不含 seller，顺序硬编码。

### 如果 V3 采用 V1 的方法 (全列 hash)，日后会有什么问题？

**不推荐照搬 V1 的 "全列动态 hash"，原因如下:**

| 问题 | 说明 |
|------|------|
| **列顺序依赖** | V1 用 Pandas Series 的 `.values` 返回值按列顺序排列。如果 CSV 列顺序变了 (eBay 改版) — 相同数据会产生不同 hash → 去重失效 |
| **隐含列污染** | V1 注入了 `Seller` + `Processed_T` 后才算 hash。Processed_T 初始值总是 0，不影响结果。但如果将来增加更多元数据列，每加一列所有历史 hash 都失效 |
| **跨系统不兼容** | 如果将来从另一个系统 (如 Amazon) 导入，CSV 列完全不同，hash 逻辑无法复用 |
| **CSV 格式变动** | eBay 每年 2-3 次更新 CSV 格式 (加列、改列名)。V1 的全列 hash 意味着每次格式变化，所有旧数据的 hash 都不同 — 导致系统认为这些是 "新数据" |

### 推荐方案

V3 当前的 **固定字段 hash** 更稳定，但需要两个修正:

1. **加入 seller 字段** — 防止跨店铺碰撞 (两个不同店铺、相同数据的行应该产生不同 hash)
2. **字段列表显式声明且有序** — 确保长期稳定

```kotlin
val allValues = listOf(
    request.seller,  // ← 新增
    row.transactionCreationDate ?: "",
    row.type ?: "",
    // ... 其余 25 个字段
)
```

这样既保留了 V3 的稳定性优势，又覆盖了 V1 的 seller 区分能力。

### 关于历史数据兼容

V1 和 V3 的 hash 值**无论如何都不可能相同** (字段集、顺序、清洗方式都不同)。这是可以接受的，因为:
- V1 → V3 迁移时会做一次性数据迁移 (ETL 脚本)
- 迁移后 V1 停用，不会有新数据进入 V1
- V3 内部的 hash 自洽即可

**结论: P1 不需要编码修复，只需在 hash 计算中加入 seller 字段 (在 P12 修复中一并完成)。**

---

## P8+P9 实施方案: 拆分 FVF 和 Tax

### 变更清单

#### 1. DB Migration (Flyway)
```sql
-- 新增 4 个字段
ALTER TABLE cleaned_transactions ADD COLUMN fvf_fee_fixed numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cleaned_transactions ADD COLUMN fvf_fee_variable numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cleaned_transactions ADD COLUMN seller_tax numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cleaned_transactions ADD COLUMN ebay_tax numeric(12,2) NOT NULL DEFAULT 0;
```

#### 2. `RawTransaction.kt` — 拆分暂存字段
- `listingFee` (合并的 FVF TEXT) → `fvfFeeFixed` + `fvfFeeVariable` (各自 TEXT)
- `taxAmount` (合并的税) → `sellerTax` + `ebayTax` (各自 BigDecimal)

#### 3. `CleanedTransaction.kt` — 新增 4 列
- `fvfFeeFixed`, `fvfFeeVariable` (替代原来的 `fvfFee`)
- `sellerTax`, `ebayTax` (替代原来的 `taxAmount`)
- `fvfFee` 保留为计算属性 = `fvfFeeFixed + fvfFeeVariable`
- `taxAmount` 保留为计算属性 = `sellerTax + ebayTax`

#### 4. `EtlIngestUseCase.kt` — 分别存储
```kotlin
fvfFeeFixed = row.finalValueFeeFixed?.trim(),      // TEXT
fvfFeeVariable = row.finalValueFeeVariable?.trim(), // TEXT
sellerTax = parseMoney(row.sellerCollectedTax),     // BigDecimal
ebayTax = parseMoney(row.ebayCollectedTax),         // BigDecimal
```

#### 5. `EtlTransformUseCase.kt` — 分别写入终态表
```kotlin
fvfFeeFixed = parseBigDecimal(tx.fvfFeeFixed),
fvfFeeVariable = parseBigDecimal(tx.fvfFeeVariable),
sellerTax = tx.sellerTax,
ebayTax = tx.ebayTax,
```

---

## P12 实施方案: V1 Seller 多店铺逻辑

### V1 逻辑完整还原

```python
# V1 transformer.py 第 199-205 行
df_trans['seller_clean'] = df_trans['seller'].str.strip().str.replace(r'[\'\\"]', '', regex=True)
df_trans['is_prio'] = df_trans['seller_clean'].str.lower().str.contains('esparts').astype(int)
seller_map = df_trans.sort_values(['is_prio', 'seller_clean'], ascending=[False, True])
                     .drop_duplicates('order number')[['order number', 'seller_clean']]
```

**核心语义**: 
1. 每个 CSV 行有自己的 seller (来自该文件的元数据探测)
2. 在 Transform 阶段，对每个 order_number 选择优先级最高的 seller
3. 优先级: esparts* 最高 (is_prio=1)，其他按字母排序

### V3 变更

#### 1. `EtlIngestUseCase.kt` — per-row seller
- 当前: `request.seller` 全批次统一
- 改为: 前端按文件传 seller，后端每条记录存各自的 seller

#### 2. 前端 `page.tsx` — per-file seller
- 当前: `detectedSeller` 取第一个文件的 seller
- 改为: 每条 CSV 行附带来源文件的 seller

#### 3. `EtlTransformUseCase.kt` — seller_map 逻辑
新增 V1 的 seller 优先级选择:
```kotlin
// 对每个 orderNumber，选择 esparts 优先的 seller
fun selectSeller(txs: List<RawTransaction>, orderNumber: String): String {
    val candidates = txs.filter { it.orderNumber == orderNumber && !it.seller.isNullOrBlank() }
        .map { it.seller!!.trim().replace(Regex("['\"]"), "") }
        .distinct()
    
    val esparts = candidates.filter { it.lowercase().contains("esparts") }
    return if (esparts.isNotEmpty()) esparts.sorted().first()
           else candidates.sorted().firstOrNull() ?: ""
}
```

---

## P13 实施方案: Working Set 跨批次重算

### V1 逻辑完整还原

V1 的核心是 **"dirty order" 概念**:
1. 新 Transaction 上传 → `Processed_T = 0`
2. 新 Earning 上传 → `Processed_E = 0` (覆盖模式)
3. Transform 时:
   ```sql
   pending_orders = 
       SELECT DISTINCT order_number FROM Data_Transaction WHERE Processed_T = 0
       UNION
       SELECT DISTINCT order_number FROM Data_Order_Earning WHERE Processed_E = 0
   ```
4. 对 pending_orders 中的所有订单，先 DELETE 终态表中的旧记录，再重新计算插入

### V3 实现策略

**不需要 Processed_T/E 标记** (因为 V3 用 batch 追踪)，但需要实现等价的 "dirty order" 机制:

#### 1. `RawTransaction.kt` + `RawEarning.kt` — 新增 `synced` 标记
```kotlin
@Column(name = "synced", nullable = false)
var synced: Boolean = false
```

#### 2. `EtlTransformUseCase.kt` — Working Set 逻辑
```kotlin
// Step 0: 构建 Working Set (V1 parity)
val unsyncedTrans = rawTransRepo.findAllBySyncedFalse()
val unsyncedEarnings = rawEarnRepo.findAllBySyncedFalse()

val pendingOrders = (
    unsyncedTrans.mapNotNull { it.orderNumber } +
    unsyncedEarnings.mapNotNull { it.orderNumber }
).distinct()

// 对 pendingOrders 中的所有订单，从 ALL raw data 重新构建
val allTxForOrders = rawTransRepo.findAllByOrderNumberIn(pendingOrders)
val allEarnForOrders = rawEarnRepo.findAllByOrderNumberIn(pendingOrders)

// DELETE 终态表中这些订单的旧记录
cleanedRepo.deleteAllByOrderNumberIn(pendingOrders)

// 重新 Transform + INSERT
// ... (使用所有匹配的 raw 数据，不限 batch)

// 标记为已同步
unsyncedTrans.forEach { it.synced = true; rawTransRepo.save(it) }
unsyncedEarnings.forEach { it.synced = true; rawEarnRepo.save(it) }
```

#### 3. DB Migration
```sql
ALTER TABLE raw_transactions ADD COLUMN synced boolean NOT NULL DEFAULT false;
ALTER TABLE raw_earnings ADD COLUMN synced boolean NOT NULL DEFAULT false;
```

---

## P16 实施方案: 日期范围校验

### V1 逻辑

```python
# V1 views.py 第 396-398 行
today = date.today()
if trans_max is not None and trans_max >= today:
    return _render_validation_error(request, '文件中的最新日期不能是今天或未来')
```

### V3 实现

#### 后端 `EtlIngestUseCase.kt`
在 `ingest()` 开头添加:
```kotlin
// V1 parity: 最新日期不能是今天或未来
val pacificToday = LocalDate.now(pacificZone)
if (dateMax != null && !dateMax.isBefore(pacificToday)) {
    throw IllegalArgumentException("Data contains today's or future dates ($dateMax). Please check the file.")
}
```

注意: 校验必须在所有行处理完毕、dateMax 计算出来之后执行。但因为已经往 DB 写了数据，需要回滚。所以放在 `@Transactional` 方法中抛异常即可自动回滚。

#### 前端 `page.tsx`
在 `handleUpload` 前添加客户端预检:
```typescript
const today = new Date().toISOString().slice(0, 10);
const latestDate = transFile.rows.reduce((max, r) => {
    const d = r.transactionCreationDate;
    return d && d > max ? d : max;
}, '');
if (latestDate >= today) {
    setError(t('etl.upload.futureDate'));
    return;
}
```

---

## 执行顺序

1. **DB Migration** — 新建 Flyway 脚本 (fvf_fixed/variable, seller/ebay tax, synced)
2. **Domain Models** — RawTransaction, RawEarning, CleanedTransaction 字段拆分
3. **Ingest** — P12 (per-row seller) + P8/P9 (分别存储) + P16 (日期校验) + P1 (hash 加 seller)
4. **Transform** — P12 (seller_map) + P13 (Working Set) + P8/P9 (分别写入)
5. **Frontend** — P12 (per-file seller) + P16 (前端预检)
6. **Repository** — 新增查询方法

---

## 闸门清单

- [ ] DB Migration 可执行且可回滚
- [ ] RawTransaction/RawEarning/CleanedTransaction 字段对齐
- [ ] Hash 包含 seller
- [ ] Seller 多店铺优先级选择 (esparts* first)
- [ ] Working Set 跨批次重算
- [ ] 日期校验 (后端抛异常 + 前端预检)
- [ ] FVF fixed/variable 分别存储和输出
- [ ] Seller/eBay tax 分别存储和输出
- [ ] 编译通过
