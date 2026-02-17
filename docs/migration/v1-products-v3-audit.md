# V1 → V3 Products Module — Deep Audit Report

> **Date:** 2026-02-16
> **Method:** Line-by-line comparison of V1 (commit `1e39ba2`) vs V3 (current HEAD)
> **Verdict:** ❌ **存在多处不兼容偏离，前端无法正确调用 V3 后端**

---

## 审计结论摘要

| 分类 | 偏离数 | 严重级 |
|------|--------|--------|
| 🔴 API 契约断裂 (前端完全无法工作) | 2 | P0 |
| 🟡 后端逻辑偏离 (功能不一致) | 4 | P1 |
| 🟢 V3 额外功能 (不影响 V1 功能) | 3 | Info |
| 🔵 i18n 缺失 (已修复) | 6 | Fixed |

---

## 🔴 P0 — API 契约断裂 (前端完全不工作)

### P0-1: Barcode 请求格式完全不匹配

**V1 前端发送:**
```json
{
  "skus": ["SKU1", "SKU2"],
  "copiesPerSku": 3,
  "format": "CODE128",
  "sec_code_l1": "1234"
}
```

**V1 后端 DTO (GenerateBarcodeRequest):**
```kotlin
data class GenerateBarcodeRequest(
    val skus: List<String>,
    val copiesPerSku: Int = 1,
    val format: String = "CODE128",
)
```

**V3 后端 DTO (GenerateBarcodeRequest):**
```kotlin
data class GenerateBarcodeRequest(
    val items: List<BarcodeItem>,
)

data class BarcodeItem(
    val sku: String,
    val qtyPerBox: Int,
    val boxPerCtn: Int,
)
```

**问题:** 
- V1 前端发 `{ skus, copiesPerSku, format }` → V3 后端期望 `{ items: [{ sku, qtyPerBox, boxPerCtn }] }`
- 字段名、结构、语义完全不同
- V3 BarcodeGeneratorService 的 `generate()` 方法接受 `List<BarcodeItem>`，不接受 `List<String>` skus
- **结果：前端点击 Generate PDF → 400 Bad Request / 反序列化失败**

**V1 Controller 逻辑:**
```kotlin
// V1: 从 skuList 获取 names, 然后调用 barcodeService.generateBarcodePdf(skus, names, copies, format)
val products = productService.getSkuList()
val names = products.associate { (it["sku"] as String) to (it["name"] as? String ?: "") }
val result = barcodeService.generateBarcodePdf(skus = dto.skus, names = names, copiesPerSku = dto.copiesPerSku, format = dto.format)
```

**V3 Controller 逻辑:**
```kotlin
// V3: 直接传 items 列表给 BarcodeGeneratorService.generate(items, skuNames)
val result = barcodeService.generate(dto.items, skuNames)
```

**修复方案:** V3 barcode DTO 必须恢复为 V1 格式 `{skus, copiesPerSku, format}`，或同时支持两种格式。

---

### P0-2: COGS 批量更新请求格式不匹配

**V1 前端发送 (cogs/page.tsx:134-146):**
```typescript
const items = Object.entries(editedProducts).map(([id, changes]) => {
  const cost = changes.cost !== undefined ? changes.cost : product.cost;
  const freight = changes.freight !== undefined ? changes.freight : product.freight;
  return { id, cogs: Number((cost + freight).toFixed(2)) };
});
batchUpdateMutation.mutate({ items, sec_code_l2: secCode });
```

**V1 前端 API DTO (products.ts:51-53):**
```typescript
export interface BatchUpdateCogsDto {
  items: { id: string; cogs: number }[];
}
```

**V1 后端 DTO (CogsItem):**
```kotlin
data class CogsItem(
    val id: String,
    val cogs: BigDecimal,
)
```

**V3 后端 DTO (CogsUpdateItem):**
```kotlin
data class CogsUpdateItem(
    val id: String,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    val cost: BigDecimal,       // ← NonNull! 前端不发这个字段
    val freight: BigDecimal,    // ← NonNull! 前端不发这个字段
    val weight: Int? = null,
)
```

**问题:**
- V1 前端发 `{ id, cogs }` — V3 后端期望 `{ id, cost, freight, ... }`
- `cost` 和 `freight` 在 V3 DTO 中是 **非空** 字段
- 前端根本不发 `cost`, `freight`, `category`, `subcategory`, `type`, `weight`
- **结果：400 Bad Request / Jackson 反序列化失败（cost/freight 为 null 但 DTO 要求非空）**

**修复方案:** V3 DTO 必须恢复为 V1 格式 `{ id, cogs }`, 或前端必须改为发送全部 6 个字段。

---

## 🟡 P1 — 后端逻辑偏离

### P1-1: V1 Create 只接受 5 个字段，V3 接受 9 个

**V1 CreateProductRequest:**
```kotlin
data class CreateProductRequest(
    val sku: String,
    val name: String? = null,
    val category: String? = null,
    val cogs: BigDecimal? = null,   // ← 直接设置 cogs
    val upc: String? = null,
)
```

**V3 CreateProductRequest:**
```kotlin
data class CreateProductRequest(
    val sku: String,
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,  // ← V3 新增
    val type: String? = null,         // ← V3 新增
    val cost: BigDecimal? = null,     // ← 替代 cogs
    val freight: BigDecimal? = null,  // ← V3 新增
    val weight: Int? = null,          // ← V3 新增
    val upc: String? = null,
    val initialQty: Int? = null,      // ← V3 新增
)
```

**问题:**
- V1 前端发 `{ sku, name, category, cogs, upc }` — 其中 `cogs` 是直接设置的值
- V3 后端不接受 `cogs`，改为 `cost` + `freight` 然后 auto-calculate
- 前端 `createMutation` (create/page.tsx:70) 明确发送 `cogs` 字段
- V3 后端 `CreateProductUseCase.create()` 会忽略 `cogs`, 把 `cost=0, freight=0` → `cogs=0`
- **结果：用户输入的 COGS 值被丢弃，产品创建时 COGS 始终为 0**

---

### P1-2: V1 Update 接受 `cogs`，V3 接受 `cost/freight` 

**V1 UpdateProductRequest:**
```kotlin
data class UpdateProductRequest(
    val name: String? = null,
    val category: String? = null,
    val cogs: BigDecimal? = null,     // ← 直接更新 cogs
    val upc: String? = null,
    val status: String? = null,
)
```

**V3 UpdateProductRequest:**
```kotlin
data class UpdateProductRequest(
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    val cost: BigDecimal? = null,     // ← 替代 cogs
    val freight: BigDecimal? = null,
    val weight: Int? = null,
    val upc: String? = null,
    val status: String? = null,
)
```

**问题:** 同上 — 前端 API DTO `UpdateProductDto` 发送 `cogs`，V3 后端忽略。

---

### P1-3: V1 ProductResponse 没有 `createdBy/updatedBy`

**V1 ProductResponse:**
```kotlin
data class ProductResponse(
    ...,
    val createdAt: Any,
    val updatedAt: Any,
    // 没有 createdBy, updatedBy
)
```

**V3 ProductResponse:**
```kotlin
data class ProductResponse(
    ...,
    val createdAt: Instant,
    val updatedAt: Instant,
    val createdBy: String?,  // ← V3 新增
    val updatedBy: String?,  // ← V3 新增
)
```

**影响:** 不会导致功能故障，但 V3 响应包含额外字段。前端 TypeScript `Product` interface 没有定义这两个字段，所以不会显示。这是**向后兼容**的添加 — **低风险**。

---

### P1-4: V1 Barcode 是 iText grid 布局，V3 是 ZXing/PDFBox 单标签

**V1 BarcodeService (iText):**
- **布局:** 3 列 × 8 行 = 24 labels/page，LETTER 纸张
- **格式:** 只有 Code128 (虽然 DTO 包含 format 字段)
- **数据:** 每个标签只有 SKU + Product Name
- **复制:** 通过 `copiesPerSku` 控制每个 SKU 的重复次数

**V3 BarcodeGeneratorService (ZXing+PDFBox):**
- **布局:** 每个标签独占一个 4"×6" 页面
- **格式:** Code128 + DataMatrix
- **数据:** SKU barcode + QTY/BOX barcode + BOX/CTN barcode + DataMatrix
- **复制:** 没有 copies 概念 — 每个 item 一个页面

**问题:**
- V1 是标签纸打印 (24/page，LETTER)，V3 是单标签打印 (1/page，4"×6")
- 打印结果完全不同 — 这根本不是迁移，是**重写**
- V1 用户习惯的标签纸格式在 V3 中不存在

---

## 🟢 V3 新增功能 (V1 不存在)

| # | 功能 | 说明 |
|---|------|------|
| 1 | `GET /products/metadata` | V3 新增 — 返回 categories, subcategories, types, existingSkus |
| 2 | `@RequirePermission` + `@SecurityLevel` + `@AuditLog` | V3 AOP 安全三级注解 |
| 3 | `createdBy/updatedBy` 审计字段 | V3 新增 |

这些不影响 V1 功能，但**不在 V1 范围内**。

---

## 🔵 i18n 偏离 (已修复)

以下键已在本次会话中修复:

| 键 | 状态 |
|----|------|
| `barcode.format` | ✅ 已恢复 |
| `barcode.copies` | ✅ 已恢复 |
| `barcode.formats.CODE128/EAN13/UPC` | ✅ 已恢复 |
| `list.loginRequired` | ✅ 已新增 |
| `cogs.instructions.editCostFreight` | ✅ 已恢复 |

---

## 修复优先级

### 必须修复 (前端完全无法工作)

| 编号 | 修复内容 | 方向 |
|------|---------|------|
| P0-1 | Barcode DTO 恢复 V1 格式 `{skus, copiesPerSku, format}` | 后端回退 |
| P0-2 | COGS DTO 恢复 V1 格式 `{id, cogs}` | 后端回退 |

### 建议修复 (功能不一致)

| 编号 | 修复内容 | 方向 |
|------|---------|------|
| P1-1 | Create DTO 恢复 `cogs` 字段支持（或前端发 cost+freight） | 后端回退 |
| P1-2 | Update DTO 恢复 `cogs` 字段支持 | 后端回退 |
| P1-4 | Barcode 输出格式需确认：保留 V1 grid 还是 V3 单标签 | 需用户确认 |

### 可保留不改

| 编号 | 内容 |
|------|------|
| P1-3 | `createdBy/updatedBy` 响应字段 — 向后兼容 |
| 新增1 | `/metadata` 端点 — 不影响现有功能 |
| 新增2 | 安全注解 — 架构层面增强 |

---

## 端点对照表

| HTTP | 路径 | V1 | V3 | 状态 |
|------|------|----|----|------|
| GET | /products | ✅ `findAll(page,limit,search,category,status)` | ✅ 完全一致 | ✅ |
| GET | /products/categories | ✅ `getCategories()` | ✅ | ✅ |
| GET | /products/sku-list | ✅ `getSkuList()` → `{id,sku,name}[]` | ✅ 一致 | ✅ |
| GET | /products/{id} | ✅ `findOne(id)` | ✅ | ✅ |
| GET | /products/sku/{sku} | ✅ `findBySku(sku)` | ✅ | ✅ |
| GET | /products/metadata | ❌ 不存在 | ✅ V3 新增 | 新增 |
| POST | /products | ✅ `create({sku,name,category,cogs,upc})` | ❌ 不接受 cogs | 🟡 P1-1 |
| POST | /products/batch | ✅ `batchCreate({products})` | ✅ (但 DTO 不同) | 🟡 P1-1 |
| PATCH | /products/{id} | ✅ `update({name,category,cogs,upc,status})` | ❌ 不接受 cogs | 🟡 P1-2 |
| POST | /products/cogs/batch | ✅ `batchUpdateCogs({items:[{id,cogs}]})` | ❌ 期望 `{id,cost,freight}` | 🔴 P0-2 |
| DELETE | /products/{id} | ✅ `delete(id)` | ✅ | ✅ |
| POST | /products/barcode/generate | ✅ `{skus,copiesPerSku,format}` | ❌ 期望 `{items:[{sku,qtyPerBox,boxPerCtn}]}` | 🔴 P0-1 |

---

## 响应格式对照

| | V1 | V3 |
|--|----|----|
| findAll | `{data: [], meta: {total, page, limit, totalPages}}` | `{data: [], meta: {page, size, total, totalPages}}` |
| 差异 | meta 中字段名 `limit` | meta 中字段名 `size` — ⚠️ 前端用 `meta.totalPages` 和 `meta.total` 没问题，但 `limit` 变成了 `size` |
| 单个查询 | `ProductResponse` (无 wrapper) | `{success: true, data: ProductResponse}` — client.ts 自动 unwrap |
| sku-list | `[{id,sku,name}]` (无 wrapper) | `{success: true, data: [...]}` — client.ts 自动 unwrap |

---

> **总结: V3 后端在 DDD 重构过程中修改了 3 个关键 DTO 的字段结构，导致前端完全无法调用 barcode 和 COGS 批量更新接口。Create/Update 端点也因为 `cogs` → `cost+freight` 的改动而功能不一致。建议优先回退后端 DTO 到 V1 格式，保持前端零改动。**
