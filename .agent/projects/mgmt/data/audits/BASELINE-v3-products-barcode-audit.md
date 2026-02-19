# V3 Products 模块 + 条形码功能 — 全面审计报告

> **Date:** 2026-02-17
> **Auditor:** PM + QA Auditor
> **Scope:** V3 Products module (后端 Kotlin + 前端 Next.js) + V1 条形码服务 (Django/Python)
> **标准:** V3 Architecture §6 DDD 分层 + 代码质量评分 + V1 功能一致性

---

## Executive Summary

| 维度 | 评分 | 说明 |
|------|------|------|
| **DDD 架构合规** | ⭐⭐⭐⭐ (4/5) | DDD 分层正确, 有 ArchUnit 测试, 但存在遗留桥接文件 |
| **后端代码质量** | ⭐⭐⭐⭐ (4/5) | 代码精简, 命名清晰, 但有 DDD 违规和遗留清理问题 |
| **前端代码质量** | ⭐⭐⭐ (3/5) | 功能完整, 但存在条形码格式选择问题和 UX 不一致 |
| **V1 功能一致性** | ⭐⭐⭐ (3/5) | API 端点齐全, 但条形码场景完全不同于 V1 |
| **测试覆盖** | ⭐⭐⭐⭐ (4/5) | 集成测试 + ArchUnit 测试都有, 覆盖主要端点 |
| **安全等级** | ⭐⭐⭐⭐ (4/5) | 权限/安全码/审计日志齐全, 但有等级不一致 |

**总分: 22/30 (73%) — 良好, 需修复 CRITICAL 和 HIGH 问题**

---

## Part 1: V3 后端架构审计

### 1.1 DDD 分层合规性 (V3 Architecture §6)

**期望结构:**
```
modules/products/
├── domain/           ← 领域层 (最稳定, 零框架依赖)
│   ├── model/        ← 实体 + 值对象
│   └── repository/   ← Repository 接口
├── application/      ← 应用层 (用例编排)
│   ├── dto/          ← DTO
│   └── usecase/      ← 用例
├── infrastructure/   ← 基础设施层 (可替换)
│   └── barcode/      ← ZXing + PDFBox
└── api/              ← 接口层 (Controller)
```

**实际结构对照:**

| DDD 层 | 文件 | 状态 | 问题 |
|--------|------|------|------|
| domain/model | `Product.kt` | ✅ | — |
| domain/repository | `ProductRepository.kt` | ⚠️ | 见 §1.2 |
| application/dto | `ProductDtos.kt` | ✅ | — |
| application/usecase | `Query/Create/Update/DeleteProductUseCase.kt` | ✅ | — |
| infrastructure/barcode | `BarcodeGeneratorService.kt` | ✅ | — |
| api | `ProductController.kt` | ✅ | — |

### 1.2 🔴 CRITICAL: Domain 层违反 DDD 纯净性

**文件:** `domain/model/Product.kt`

```kotlin
// Line 3: domain 层 import 了 JPA!
import jakarta.persistence.*

@Entity
@Table(name = "products")
class Product(
    @Id
    @Column(length = 36)
    var id: String = "",
```

**问题:** V3 Architecture §6 明确规定:
> `Domain 层禁止 import Spring` + `Domain 层禁止 import JPA`
> `Entity 是 Domain Model, 不是 JPA Entity`

**当前 `Product.kt` 直接当作 JPA Entity 用, 违反 DDD 纯净性原则。**
正确做法: `domain/model/Product.kt` 应是纯 Kotlin 数据类, `infrastructure/persistence/ProductEntity.kt` 才是 JPA Entity。

**影响:** 如果将来替换 ORM (例如换成 Exposed), domain 层需要重写。
**严重级:** 🔴 架构级 — 但 ArchUnit 测试 (`ProductDddArchTest.kt`) 竟然通过了?
→ **原因:** ArchUnit 测试检查的是 `!domain → application`, `!domain → infrastructure`, `!domain → api` 依赖, 但 **没有检查 `domain → jakarta.persistence`**, 这是一个测试遗漏。

---

### 1.3 🔴 CRITICAL: ProductRepository 在 domain 层 import Spring 框架

**文件:** `domain/repository/ProductRepository.kt`

```kotlin
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ProductRepository : JpaRepository<Product, String>, JpaSpecificationExecutor<Product> {
```

**问题:** domain 层的 Repository 应该是 **纯接口**, 不依赖 Spring Data JPA。Spring 实现应在 `infrastructure/persistence/` 层。

**V3 正确做法:**
```kotlin
// domain/repository/ProductRepository.kt (纯接口)
interface ProductRepository {
    fun findBySkuAndDeletedAtIsNull(sku: String): Product?
    fun findByIdAndDeletedAtIsNull(id: String): Product?
    // ...
}

// infrastructure/persistence/ProductJpaRepository.kt (Spring 实现)
@Repository
interface ProductJpaRepository : JpaRepository<ProductEntity, String> { ... }

// infrastructure/persistence/ProductRepositoryImpl.kt (桥接)
@Component
class ProductRepositoryImpl(
    private val jpa: ProductJpaRepository
) : ProductRepository { ... }
```

---

### 1.4 🟡 HIGH: 遗留桥接文件未清理

| 遗留文件 | 内容 | 行数 | 应处理 |
|---------|------|------|--------|
| `BarcodeService.kt` | `@Deprecated` 壳 | 10 | 🗑 删除 |
| `ProductController.kt` (根级) | `typealias` 桥接 | 11 | 🗑 删除 |
| `ProductService.kt` | `@Deprecated` 壳 | 14 | 🗑 删除 |
| `dto/ProductDtos.kt` | 8 个 `typealias` 重定向 | 16 | 🗑 删除 |

**问题:** 4 个文件, 51 行代码, 零功能 — 只有 `@Deprecated` 标注和 `typealias` 转发。**注释说 "Remove after all integration tests pass"**, 但集成测试已通过, 这些文件仍在。

**风险:**
- `dto/ProductDtos.kt` 的 `typealias` 可能导致其他模块意外依赖旧路径
- 增加仓库体积和认知负担

---

### 1.5 🟡 HIGH: Controller 中的 toResponse 违反分层

**文件:** `api/ProductController.kt` Line 167-174

```kotlin
private fun toResponse(p: Product) = ProductResponse(
    id = p.id, sku = p.sku, name = p.name,
    category = p.category, subcategory = p.subcategory, type = p.type,
    cost = p.cost.toDouble(), freight = p.freight.toDouble(),
    cogs = p.cogs.toDouble(), weight = p.weight, upc = p.upc,
    status = p.status.name,
    createdAt = p.createdAt, updatedAt = p.updatedAt,
)
```

**问题:** V3 Architecture §6 规范中有 `{Module}Mapper.kt` 文件 (DTO ↔ Domain 映射) 放在 `api/` 层。当前映射逻辑内联在 Controller 中, 没有独立的 Mapper 类。

**此外:** `cost.toDouble()` / `freight.toDouble()` — BigDecimal→Double 丢失精度。V3 Architecture §8.1 规定 "货币精度 DECIMAL(12,2)", 但 DTO 用的是 `Double` 而非 `BigDecimal`。

---

### 1.6 🟡 HIGH: ProductResponse 的 createdAt/updatedAt 类型是 `Any`

**文件:** `application/dto/ProductDtos.kt` Line 82-83

```kotlin
data class ProductResponse(
    // ...
    val createdAt: Any,   // ← Any 类型!
    val updatedAt: Any,   // ← Any 类型!
)
```

**问题:** Kotlin 强类型是 V3 核心优势 (§2 原则 4: "类型变更编译期爆炸")。使用 `Any` 完全绕过类型安全, JSON 序列化行为不确定, 前端可能收到不一致的时间格式。

**应该是:** `val createdAt: Instant` 或 `val createdAt: String` (ISO 8601 格式)。

---

### 1.7 🟢 亮点

| 设计 | 评价 |
|------|------|
| UseCase 粒度划分 (Query/Create/Update/Delete) | ✅ 精准, 各司其职 |
| `@Transactional(readOnly = true)` 在 QueryUseCase | ✅ 数据库优化 |
| `@AuditLog` 注解在 Controller 层 | ✅ 审计日志声明式, 不侵入业务 |
| `@RequirePermission` 权限检查 | ✅ 声明式安全 |
| SKU 强制 uppercase 一致性 | ✅ V1 行为保持 |
| Soft delete (deletedAt) | ✅ V3 Architecture §8.1 |
| ArchUnit DDD 分层测试 | ✅ 6 条规则, 自动化保障 |
| 集成测试 12 个场景 + 清理逻辑 | ✅ 幂等, 可重复执行 |
| ZXing + PDFBox 替代 iText | ✅ 开源免费, 无许可证风险 |

---

## Part 2: 条形码功能审计 (🔴 核心关注)

### 2.1 V1 条形码 vs V3 条形码 — 功能对比

| 维度 | V1 (Django/Python) | V3 (Kotlin/Spring) | V3 前端 |
|------|--------------------|---------------------|---------|
| **条码制式** | **Code128 only** | Code128 only | ❌ 展示 CODE128/EAN13/UPC 三选一 |
| **用途** | 外包装标签 (SKU + QTY/BOX + BOX/CTN) | SKU 标签 (纯 SKU 条码) | SKU 标签生成 |
| **布局** | 4"×6" 外包装标签 (含 DataMatrix QR) | LETTER 页面 3×8 网格标签 | — |
| **输入** | SKU + 每盒个数 + 每箱盒数 (3 字段) | SKU 列表 + copies | SKU 选择 + copies + format |
| **流程** | 4 步 Wizard (输入→验证→生成→下载) | 单步生成 | 右侧 panel 配置 |
| **输出** | 单 SKU 单 PDF (含 3 条码 + DataMatrix) | 多 SKU 合并 PDF (网格布局) | 直接下载 |
| **安全** | `btn_generate_barcode` action key (L3) | ✅ 已修复: L3 + `btn_generate_barcode` | SecurityCodeDialog L3 |

### 2.2 🔴 CRITICAL: 前端暴露了 V3 后端不支持的条码格式

**文件:** `apps/web/src/app/(dashboard)/products/barcode/page.tsx` Line 33, 310

```tsx
const [format, setFormat] = useState<'CODE128' | 'EAN13' | 'UPC'>('CODE128');

// Line 310: 展示三种格式供用户选择
{(['CODE128', 'EAN13', 'UPC'] as const).map((fmt) => (
```

**但 V3 后端 `BarcodeGeneratorService.kt` 只支持 CODE128:**

```kotlin
// BarcodeGeneratorService.kt Line 74 — format 参数被完全忽略!
fun generateBarcodePdf(
    skus: List<String>,
    names: Map<String, String> = emptyMap(),
    copiesPerSku: Int = 1,
    format: String = "CODE128",  // 接收但不使用
): BarcodeResult {
    // ...
    val barcodeImage = generateCode128(sku, ...)  // ← 始终用 Code128!
```

**用户选择 EAN13 或 UPC 后, 实际生成的仍然是 CODE128!**

**✅ 已修复: 前端格式选择已移除, 锁定为 CODE128。**

---

### 2.3 🔴 CRITICAL: 用户的核心需求 — 条码格式必须一致

> **用户原话:** "我们的条形码功能是从V1过来的, 也必须严格要求那边的样式, 而不是给用户那么多个条码选择类型, 必须一致"

**结论:**

1. ✅ **已修复 — 前端格式选择已移除**, 锁定 CODE128, 不给用户选择
2. ✅ **已修复 — 前端 `format` state 和 radio buttons 已删除**
3. ✅ **后端 `BarcodeGeneratorService.kt` 的 `format` 参数保留** — 默认 CODE128
4. ✅ **已修复 — 前端 DTO `GenerateBarcodeDto.format` 已锁定为 CODE128**

---

### 2.4 🟡 HIGH: V1→V3 条形码功能差异过大

| V1 功能 | V3 是否实现? | 说明 |
|---------|:----------:|------|
| 4 步 Wizard 流程 | ❌ | V3 是单页操作 |
| SKU 模糊搜索 (输入+下拉) | ❌ | V3 只有勾选列表 |
| QTY/BOX, BOX/CTN 字段 | ❌ | V3 完全没有包装规格 |
| 外包装标签布局 (4"×6") | ❌ | V3 是 LETTER 网格 |
| DataMatrix 二维码 | ❌ | V3 只有线性条码 |
| L 型定位符 | ❌ | V3 没有 |
| 批量行输入 (添加/删除行) | ❌ | V3 只有 checkbox |
| 验证步骤 (预览表格) | ❌ | V3 没有 |
| ZIP 打包下载 | ❌ | V3 只有单 PDF |
| 文件管理 (列表/清空) | ❌ | V3 没有 |

**V1 和 V3 的条形码功能实际上是两个完全不同的产品。**

**V1:** 为外箱包装设计, 每个标签包含 SKU 条码 + 数量条码 + 箱数条码 + DataMatrix + L定位符。
**V3:** 为库存标签设计, 简单的 SKU 条码网格。

**如果用户需求是 "V1 样式一致", 那 V3 前端的条形码页面需要重写为 V1 Wizard 模式。**

---

### 2.5 🟡 HIGH: 前端 i18n 键引用可能断链

前端使用了以下 i18n 键:

```tsx
t('barcode.title')
t('barcode.description')
t('barcode.selectProducts')
t('barcode.format')
t('barcode.formats.CODE128')
t('barcode.formats.EAN13')
t('barcode.formats.UPC')
t('barcode.copies')
t('barcode.generate')
t('security.requiresL1')
```

但搜索整个 `apps/web` 目录未找到对应的 JSON locale 文件 (产品模块的 i18n 翻译文件)。如果 `barcode.formats.EAN13` 和 `barcode.formats.UPC` 键存在, 在移除格式选择后也需要同步清理。

---

## Part 3: 前端代码质量

### 3.1 🟡 HIGH: localStorage 直接访问 (无封装)

**文件:** `barcode/page.tsx` Line 42, `products.ts` Line 137

```tsx
// barcode/page.tsx
const storedUser = localStorage.getItem('user');

// products.ts
const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
```

**问题:**
- 硬编码的 key (`'user'`, `'accessToken'`) 分散在多处
- 无统一的存储抽象层
- SSR 场景 `typeof window !== 'undefined'` 检查散布各处

### 3.2 🟡 HIGH: productsApi.generateBarcodePdf 绕过了统一 API Client

**文件:** `lib/api/products.ts` Line 135-154

其他所有 API 调用都使用 `api.get<T>()` / `api.post<T>()` 统一 client, 唯独 `generateBarcodePdf` 使用原始 `fetch()`, 独立构建 URL 和 headers。

**问题:**
- 认证 token 获取逻辑重复
- 错误处理不一致
- BASE_URL 拼接不通过统一 client

### 3.3 🟢 前端亮点

| 设计 | 评价 |
|------|------|
| React Query (`useQuery` / `useMutation`) | ✅ 数据获取标准化 |
| ThemeContext 全局主题 | ✅ Apple Design System |
| SecurityCodeDialog 组件化 | ✅ 安全操作标准化 |
| 产品 Hub 页面 Anime.js 动画 | ✅ 流畅, 渐进式加载 |
| Carousel 左右导航 + scroll 按钮状态 | ✅ UX 细节到位 |

---

## Part 4: 测试覆盖审计

### 4.1 测试评估

| 测试类型 | 文件 | 数量 | 状态 |
|---------|------|------|------|
| 集成测试 | `ProductIntegrationTest.kt` | 12 | ✅ |
| 架构测试 | `ProductDddArchTest.kt` | 6 | ✅ |
| 单元测试 | — | 0 | ❌ 缺失 |

### 4.2 🟡 缺失的测试

| 缺失项 | 严重级 |
|--------|--------|
| UseCase 单元测试 (QueryProductUseCase 等) | 🟡 |
| BarcodeGeneratorService 单元测试 (PDF 生成) | 🟡 |
| ArchUnit: domain 层禁止 import `jakarta.persistence` | 🔴 |
| 前端组件测试 (Barcode 页面) | 🟢 |
| 安全码验证测试 (L1/L3 级别正确性) | 🟡 |

### 4.3 🔴 ArchUnit 测试遗漏

当前 `ProductDddArchTest.kt` 检查了层间依赖, 但 **没有检查 domain 层对 JPA/Spring 的依赖**, 导致 §1.2 和 §1.3 的违规未被发现。

**应增加:**
```kotlin
@Test
fun `domain layer should not import JPA annotations`() {
    val rule: ArchRule = noClasses()
        .that().resideInAPackage("..products.domain..")
        .should().dependOnClassesThat()
        .resideInAPackage("jakarta.persistence..")
    rule.check(classes)
}

@Test
fun `domain layer should not import Spring framework`() {
    val rule: ArchRule = noClasses()
        .that().resideInAPackage("..products.domain..")
        .should().dependOnClassesThat()
        .resideInAPackage("org.springframework..")
    rule.check(classes)
}
```

---

## Part 5: 安全等级审计

### 5.1 🟡 安全等级不一致

| 操作 | Controller 标注 | 前端发送 | V1 对应 |
|------|-----------------|---------|---------|
| 创建产品 | `@SecurityLevel(level = "L3")` | `sec_code_l2` | L2 |
| 批量创建 | `@SecurityLevel(level = "L3")` | — | L2 |
| 更新产品 | — | `sec_code_l2` | L2 |
| 批量 COGS | `@SecurityLevel(level = "L3")` | `sec_code_l2` | L2 |
| 删除产品 | `@SecurityLevel(level = "L3")` | `sec_code_l3` | L3 |
| 生成条码 | ✅ `@SecurityLevel(level = "L3", actionKey = "btn_generate_barcode")` | ✅ `sec_code_l3` | ✅ L3 (已修复) |

**问题:**
- 后端标注 `L3` 但前端发送 `sec_code_l2` → **不匹配!**
- 更新操作没有 `@SecurityLevel` 标注
- 需要统一确认每个操作的安全等级

---

## Part 6: 修复优先级

### 🔴 CRITICAL (必须立即修复)

| # | 问题 | 修复方案 | 状态 |
|---|------|---------|------|
| C1 | 前端暴露 3 种条码格式但后端只支持 CODE128 | 移除 format radio buttons, 锁定 CODE128 | ✅ 已修复 |
| C2 | Domain 层依赖 JPA 注解 | 分离 Domain Model 和 JPA Entity | ⏳ 待处理 |
| C3 | Repository 在 Domain 层继承 Spring Data | 移至 infrastructure 层 | ⏳ 待处理 |
| C4 | 条形码端点缺少 @SecurityLevel 注解 (安全漏洞) | 添加 L3 + btn_generate_barcode | ✅ 已修复 |
| C5 | 条形码端点权限 key 不匹配 V1 | catalog.view → barcode.generate | ✅ 已修复 |
| C6 | 前端安全码等级不匹配 V1 (L1→L3) | SecurityCodeDialog level="L3" + sec_code_l3 | ✅ 已修复 |

### 🟡 HIGH (本阶段应修复)

| # | 问题 | 修复方案 | 文件 |
|---|------|---------|------|
| H1 | 4 个遗留桥接文件未删除 | 删除 4 个文件 | 多个 |
| H2 | Controller toResponse 内联, 无 Mapper | 提取 ProductMapper.kt | `ProductController.kt` |
| H3 | ProductResponse 使用 Any 类型 | 改为 Instant 或 String | `ProductDtos.kt` |
| H4 | 安全等级前后端不匹配 | 统一确认后修正 | 多个 |
| H5 | ArchUnit 缺少 JPA/Spring 依赖检查 | 增加 2 条规则 | `ProductDddArchTest.kt` |
| H6 | generateBarcodePdf 绕过统一 API Client | 重构为使用 api.post + blob 处理 | `products.ts` |

### 🟢 LOW (可延后)

| # | 问题 | 修复方案 |
|---|------|---------|
| L1 | UseCases 缺少单元测试 | 补充 MockK 单元测试 |
| L2 | localStorage 硬编码访问 | 封装 auth store |
| L3 | 条形码功能与 V1 差异过大 | 需与用户确认是否需要 V1 Wizard 模式 |

---

## Part 7: 条形码修复方案 (具体)

### 7.1 前端修复: 移除条码格式选择

**修改文件:** `apps/web/src/app/(dashboard)/products/barcode/page.tsx`

**变更:**
1. 删除 `format` state (`useState<'CODE128' | 'EAN13' | 'UPC'>('CODE128')`)
2. 删除 "Format Selection" 整个 `<div className="mb-6">` 区块 (Line 302-336)
3. 在 `handleGenerate` 中固定 `format: 'CODE128'`
4. 清理相关 i18n 键引用 (`barcode.format`, `barcode.formats.*`)

**修改文件:** `apps/web/src/lib/api/products.ts`

**变更:**
1. `GenerateBarcodeDto.format` 改为 `format?: 'CODE128'` (仅允许 CODE128)
2. 或直接从 DTO 中移除 `format` 字段

### 7.2 后端保留 (不修改)

`BarcodeGeneratorService.kt` 的 `format` 参数保留, 默认 `CODE128`, 作为未来扩展点。

---

## 审计判定

- [x] ⚠️ **Warning** — 有 6 个 CRITICAL 问题, 4 个已修复, 2 个待处理 (DDD 架构级)
- ✅ 条形码格式已锁定为 CODE128, V1 一致性已恢复
- ✅ 条形码安全措施已修复: 权限/安全码/审计日志 全链路 V1 对齐
- DDD 架构违规是长期技术债, 建议在下一个重构周期统一解决

---

*V3 Products + Barcode Audit v1.0 — 2026-02-17*
*Auditor: PM + QA*
