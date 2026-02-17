# V1 Products Module → V3 Architecture Migration Plan

> **Created**: 2026-02-16 | **Updated**: 2026-02-17 | **Status**: ✅ Planning Complete (Triple-Audited)  
> **Iron Rule**: 零功能丢失 — 不得修改、删减 V1 任何已有功能  
> **Iron Rule 2**: V1 是唯一真相源 — V2 前端逻辑不作为参考，所有功能以 V1 为准  
> **Iron Rule 3**: V3 架构合规 — 必须满足 v3-architecture.md §6 DDD 分层 + §7.2 统一响应 + §8.1 审计字段  
> **V1 Tech Stack**: Django + HTMX + MySQL + reportlab + python-barcode  
> **V3 Tech Stack**: Spring Boot 3.5 + Kotlin + PostgreSQL + JPA + Flyway + ZXing + PDFBox  
> **Phase Model**: AUDIT → DESIGN → BUILD → VERIFY → GATE

---

## 审计确认记录

### 第一轮确认 (2026-02-17 Round 1)

| # | 问题 | 用户决策 | 影响范围 |
|---|------|----------|----------|
| U1 | 安全码传递方式 | ✅ V3 架构: `X-Security-Code` header | 前端 API client + 后端 SecurityLevelAspect |
| U2 | 安全等级映射 | ✅ 动态配置: 来自 `actionRegistry` (users/password/page.tsx) | 后端需实现 `SecurityLevelAspect` AOP |
| U3 | `Initial_Qty` 字段 | ✅ 必须保留 — 涉及 Inventory 模块联动 | DTO + Service + 前端表单 |
| U4 | 条形码 QTY/BOX + BOX/CTN 参数 | ✅ 必须和 V1 一样 | BarcodeDtos + BarcodeService + 前端向导 |
| U5 | DataMatrix 二维码格式 | ✅ 必须和 V1 一样: `SKU|QTY|BOX` | iText `BarcodeDataMatrix` |
| U6 | 前端 `existingSkusSet` 校验 | ✅ 必须保持前端 SKU 缓存校验 | 前端 Create 页面 |

### 第二轮确认 (2026-02-17 Round 2)

| # | 问题 | 用户决策 | 影响范围 |
|---|------|----------|----------|
| Q1 | COGS 批量更新应保存 6 字段 (V2 前端只发 cogs 是 bug) | ✅ 以 V1 为准: 6 字段全部保存 | 后端 DTO+Service 重构 + 前端 handleSave 重写 |
| Q2 | 条形码安全码: actionRegistry=无需, 前端弹 L1 | ✅ 动态策略: 若 Password Policy 未勾选则不需要安全码 | 前端根据动态策略判断是否弹窗 |
| Q3 | SKU 正则是否支持 `/` 字符 | ✅ 以 V1 为准: 支持 `/` | SKU 校验正则 + 条形码目录分层 |

### 第三轮确认 (2026-02-17 Round 3 — V3 架构合规审计)

| # | 问题 | 用户决策 | 影响范围 |
|---|------|----------|----------|
| A1 | DDD 4层分层 (§6) vs 当前扁平结构 | ✅ 必须按 V3 DDD 分层重构 | 后端全部文件重组: domain/application/infrastructure/api |
| A2 | 统一 API 响应格式 `{success, data}` (§7.2) | ✅ 必须按 V3 统一格式 | Controller 返回值包装 |
| A3 | 条码技术: iText vs ZXing+PDFBox (§3.10) | ✅ 尝试 ZXing+PDFBox, PDF 输出必须和 V1 一致 | BarcodeService 完全重写 |
| A4 | Product Entity 缺 `created_by`/`updated_by` (§8.1) | ✅ 必须补上审计字段 | Entity + Flyway + 全部写操作 |
| A5 | i18n 完整覆盖 | ✅ Products 模块只需 EN/ZH (仅 VMA 需要 VI) | products.json 两语言 |
| A6 | 条形码 PDF 不持久化 | ✅ 生成→下载→删除, 下次重新生成 | 无文件管理, 无服务端存储 |

### 动态安全策略架构 (核心设计)

**机制**: 安全码需求完全由 `actionRegistry` (users/password/page.tsx) 动态控制:

```
// 当前默认配置:
products.catalog:
  btn_batch_update_cogs → tokens: ['modify']  → 需要 L2 安全码
  btn_create_skus       → tokens: ['modify']  → 需要 L2 安全码
products.barcode:
  btn_generate_barcode  → tokens: []           → 不需要安全码

// 管理员可动态修改! 例如:
//   - 把 barcode 加上 ['query'] → 变成需要 L1
//   - 把 create 改成 ['db'] → 变成需要 L3
//   - 取消所有 tokens → 任何操作都不需要安全码
```

**前端责任**: 检查 actionRegistry 配置 → 决定是否弹出 SecurityCodeDialog → 若弹出则收集安全码 → 放入 `X-Security-Code` header
**后端责任**: `@SecurityLevel` 注解标记最低要求等级 → `SecurityLevelAspect` 从 header 验证 → 若 header 为空且策略允许跳过则放行

---

## 第一部分：V1 产品板块深度审计 (100% Feature Inventory)

### 1.1 V1 路由与页面结构

| # | V1 路由 | 功能 | 页面类型 | 模板文件 |
|---|---------|------|----------|----------|
| 1 | `/dashboard/products/` | Products Hub 入口 | Hub 导航页 | `products/hub.html` |
| 2 | `/dashboard/products/data/` | 产品数据维护 (COGS) | 3步向导 (编辑→验证→完成) | `products/pages/data.html` |
| 3 | `/dashboard/products/add/` | 新增产品 (批量) | 3步向导 (填写→验证→完成) | `products/pages/add.html` |
| 4 | `/dashboard/products/barcode/` | 外包装条形码生成 | 4步向导 (输入→验证→生成→完成) | `products/pages/barcode.html` |
| 5 | `/dashboard/products/barcode/view/<filename>` | PDF 预览查看 | 查看器页面 | `products/pages/barcode_viewer.html` |

### 1.2 V1 API 端点清单

| # | Method | V1 端点 | 功能 | 安全级别 | 依赖服务 |
|---|--------|---------|------|----------|----------|
| A1 | GET | `/products/api/sku-list/` | 获取 SKU 下拉列表 | L0 (login) | `DBClient.read_df` |
| A2 | POST | `/products/barcode/generate/` | 生成条形码 PDF | L1 + SecurityPolicy | `BarcodeGeneratorService` |
| A3 | GET | `/products/barcode/download/<filename>` | 下载单个条形码 PDF | L1 | 文件系统 |
| A4 | GET | `/products/barcode/download-all/` | 打包下载所有 (ZIP) | L1 | 文件系统 + zipfile |
| A5 | POST | `/products/barcode/clear/` | 清空用户条形码文件 | L1 | 文件系统 |
| A6 | GET | `/products/barcode/view/<filename>` | PDF 内联预览 | L1 | 文件系统 |
| B1 | GET | `(db_admin) cogs_load_table_only/` | 加载 COGS 表格数据 | L0 | `DataManager.get_cogs_data()` |
| B2 | POST | `(db_admin) cogs_batch_update/` | 批量更新 COGS | L3 + SecurityPolicy + Lock | `DataManager.update_cogs_smart()` |
| B3 | POST | `(db_admin) cogs_create_skus/` | 批量创建 SKU | L3 + SecurityPolicy + Lock | `DataManager.batch_create_skus()` |
| B4 | GET | `(db_admin) cogs_get_form_only/` | 加载创建表单元数据 | L0 | `DataManager` |

### 1.3 V1 数据模型 (Data_COGS)

| 字段 | 类型 (MySQL) | 说明 | V3 对应 |
|------|-------------|------|---------|
| SKU | TEXT | 主键 (实际无 PK) | `sku: String` (UNIQUE) |
| Category | TEXT | 分类 | `category: String?` |
| SubCategory | TEXT | 子分类 | `subcategory: String?` |
| Type | TEXT | 产品类型 | `type: String?` |
| Cost | TEXT → float | 成本 (两位小数) | `cost: BigDecimal(10,2)` |
| Freight | TEXT → float | 运费 (两位小数) | `freight: BigDecimal(10,2)` |
| Cog | TEXT → float | COGS = Cost + Freight | `cogs: BigDecimal(10,2)` |
| Weight | TEXT → int | 重量 (克) | `weight: Int` |
| Status | TEXT | ACTIVE / INACTIVE | `status: ProductStatus` |

### 1.4 V1 业务逻辑清单

#### 1.4.1 产品数据维护 (data.html) — 3步向导

| Step | 功能 | 关键逻辑 |
|------|------|----------|
| Step 1: 编辑 | HTMX 加载 COGS 表格, 支持行内编辑 | `baselineMap` 基线快照 + `dirtyMap` 修改追踪 |
| | 可编辑字段: Category, SubCategory, Type, Cost, Freight, Weight | |
| | Cog 实时自动计算 (Cost + Freight) | |
| | 修改行数实时计数 | |
| Step 2: 验证 | 客户端校验: Cost/Freight ≥ 0 且 ≤ 2位小数, Weight > 0 正整数 | |
| | 差异表格 (Diff Table): 显示 SKU / 字段 / 原值 / 新值 | |
| | 错误高亮 (row-invalid + cell-invalid) | |
| Step 3: 提交 | 安全码验证 (SecurityPolicy: `btn_batch_update_cogs`) | |
| | 并发锁 (LockManager: `Data_COGS`) | |
| | 成功: 显示更新统计 (行数/字段数/时间) + 变更明细 | |
| | 失败: 错误信息展示 | |

#### 1.4.2 新增产品 (add.html) — 3步向导

| Step | 功能 | 关键逻辑 |
|------|------|----------|
| Step 1: 填写 | 动态添加/删除行, 批量添加5行 | |
| | 字段: SKU (必填, 自动大写), Category, SubCategory, Type, Cost, Freight, Weight, Initial_Qty | |
| | 从后端加载下拉选项 (categories, subcategories, types) | |
| | SKU 唯一性前端校验 (existingSkusSet) — **必须保留** | |
| | Cog 实时计算 | |
| Step 2: 验证 | SKU 非空 + 不重复 | |
| | Cost/Freight > 0 (必须正数, 不允许为0) | |
| | Weight ≥ 0 整数 | |
| | Initial_Qty ≥ 0 整数 — **必须保留** | |
| | 初始库存为0时需要用户确认勾选 (zeroQtyConfirmed) | |
| | 预览表格展示 | |
| Step 3: 提交 | 安全码验证 (SecurityPolicy: `btn_create_skus`) | |
| | 并发锁 (LockManager: `Data_COGS`) | |
| | 成功: 创建统计 + 创建明细 | |

#### 1.4.3 外包装条形码 (barcode.html) — 4步向导

| Step | 功能 | 关键逻辑 |
|------|------|----------|
| Step 1: 输入 | SKU 模糊搜索 (autocomplete dropdown) | `skuList` 前端缓存 |
| | 每行: SKU + QTY/BOX + BOX/CTN — **必须保留** | |
| | 动态添加/删除行, 批量添加5行 | |
| | SKU 精确匹配验证 (is-valid / is-invalid) | |
| | 键盘导航 (↑↓ Enter Escape) | |
| Step 2: 验证 | SKU 非空 | |
| | QTY/BOX > 0 正整数 | |
| | BOX/CTN > 0 正整数 | |
| | 预览表格 (含预计文件名) | |
| Step 3: 生成 | 安全码验证 (SecurityPolicy: `btn_generate_barcode`) — **当前为无需安全码** | |
| | 进度条动画 | |
| | 后端批量生成 PDF | |
| Step 4: 完成 | 生成统计 (成功/失败/总数) | |
| | 文件列表 (含大小、时间) | |
| | 单个下载 / 全部打包下载 (ZIP) | |
| | 内联预览 (PDF.js) | |
| | 清空所有文件 | |
| | 失败项列表 | |

#### 1.4.4 条形码 PDF 引擎 (BarcodeGeneratorService)

| 特性 | 规范 |
|------|------|
| 标签尺寸 | 4" x 6" (288pt x 432pt) |
| 条码制式 | Code 128 |
| X-dimension | 0.33 mm |
| 条码高度 | 18 mm |
| 静区 | 3 mm (左右) |
| 布局 | Row 1: SKU 条码 (全宽), Row 2: QTY/BOX + BOX/CTN (并排), 底部: L 定位符 + DataMatrix 二维码 |
| DataMatrix 数据 | `SKU|QTY|BOX` — **必须保持一致** |
| 输出隔离 | 用户级别目录: `data/barcodes/{username}/` |
| SKU 目录结构 | SKU 中的 `/` 转为目录层级 |
| 文件命名 | `{SKU_DIR}/{qty}->{ctn}.pdf` |
| 展示名 | `{SKU}.{qty}->{ctn}.pdf` |

#### 1.4.5 权限矩阵 (V3 动态安全策略)

| 操作 | RBAC 权限 Key | 安全动作 Key | 默认 Token | 安全等级 |
|------|--------------|-------------|-----------|---------|
| 查看 COGS 表格 | `products.catalog.view` | — | — | L0 (JWT) |
| 批量更新 COGS | `products.catalog.update` | `btn_batch_update_cogs` | `['modify']` | L2 |
| 创建产品 | `products.catalog.create` | `btn_create_skus` | `['modify']` | L2 |
| 生成条形码 | `products.barcode.generate` | `btn_generate_barcode` | `[]` | L0 (仅 JWT) |
| 下载/预览条形码 | `products.barcode.generate` | — | — | L0 (JWT) |
| 删除产品 | `products.catalog.delete` | — | — | L3 |
| Superuser | 跳过所有权限检查 | — | — | — |

### 1.5 V1 依赖关系图

```
Products Hub (views.py)
├── Product Data (data.html)
│   ├── HTMX → db_admin/cogs_load_table_only  → DataManager.get_cogs_data()
│   └── POST → db_admin/cogs_batch_update     → DataManager.update_cogs_smart()
│       ├── SecurityPolicyManager.verify_action_request()
│       └── LockManager.acquire_lock()
├── Add Product (add.html)
│   ├── HTMX → db_admin/cogs_get_form_only    → DataManager.get_distinct_options()
│   └── POST → db_admin/cogs_create_skus      → DataManager.batch_create_skus()
│       ├── SecurityPolicyManager.verify_action_request()
│       └── LockManager.acquire_lock()
├── Barcode (barcode.html)
│   ├── POST → generate_barcode               → BarcodeGeneratorService.generate_batch()
│   ├── GET  → download_barcode               → FileResponse (单个 PDF)
│   ├── GET  → download_all_barcodes           → ZIP 打包
│   ├── POST → clear_barcodes                  → BarcodeGeneratorService.clear_user_barcodes()
│   └── GET  → view_barcode                    → PDF.js 预览
└── SKU API
    └── GET  → sku_list_api                    → DBClient.read_df()
```

---

## 第二部分：V3 现有代码审计 & 差距分析

### 2.1 V3 已有代码

| 文件 | 状态 | 覆盖度 |
|------|------|--------|
| `domain/product/Product.kt` | ✅ Entity 完整 | 100% |
| `domain/product/ProductRepository.kt` | ⚠️ 缺 subcategory/type 查询 | 90% |
| `modules/products/ProductController.kt` | ⚠️ **无安全注解** | 60% |
| `modules/products/ProductService.kt` | ⚠️ batchUpdateCogs 仅 1 字段 | 55% |
| `modules/products/BarcodeService.kt` | ⚠️ LETTER 3×8 布局 ≠ V1 4"×6" | 30% |
| `modules/products/dto/ProductDtos.kt` | ⚠️ 缺大量字段 | 50% |
| `common/security/RequirePermission.kt` | ✅ 注解 + AOP 完整 | 100% |
| `common/security/SecurityLevel.kt` | ⚠️ **注解存在, AOP 未实现** | 50% |
| `common/logging/AuditLog.kt` | ✅ 注解 + AOP 完整 | 100% |
| `common/security/RateLimitAspect.kt` | ✅ 完整 | 100% |
| **分布式锁** | ❌ **完全缺失** | 0% |

### 2.2 🔴 严重差距

| # | V1 功能 | V3 状态 | 差距说明 |
|---|---------|---------|----------|
| G1 | COGS 批量更新 6 字段 | ❌ 仅 cogs | 需重构 batchUpdateCogs |
| G2 | 产品创建 9 字段含 Initial_Qty | ❌ 仅 5 字段 | 需增强 DTO + Service |
| G3 | 条形码 4"×6" + DataMatrix | ❌ 完全不同布局 | 需重写 BarcodeService |
| G4 | 用户级条形码文件管理 | ❌ 缺失 | 需新建 BarcodeFileService |
| G5 | SKU 模糊搜索 + 键盘导航 | ❌ 缺失 | 前端功能 |
| G6 | `@SecurityLevel` AOP 拦截器 | ❌ **注解有, 拦截器没有** | 需新建 SecurityLevelAspect |
| G7 | 分布式锁 | ❌ 缺失 | 需新建 DistributedLock |
| G8 | 前端 existingSkusSet 校验 | ❌ 缺失 | 需前端实现 |

### 2.3 🟡 中等差距

| # | V1 功能 | V3 状态 |
|---|---------|---------|
| G9 | Products Controller 无 `@RequirePermission` / `@AuditLog` | 需追加注解 |
| G10 | subcategory/type distinct 查询 | 需追加 Repository 方法 |
| G11 | 3 步 / 4 步向导 UI | 当前为单页，需重建 |
| G12 | Diff Table (变更对比) | 前端缺失 |
| G13 | ZIP 打包下载 + PDF.js 预览 | 后端+前端缺失 |

---

## 第三部分：V3 迁移实施方案

### 3.1 架构设计 (DDD 4 层 — 严格遵循 v3-architecture.md §6)

```
modules/products/
├── domain/                           # 领域层 (零框架依赖)
│   ├── model/
│   │   ├── Product.kt                # 聚合根 (增强: +createdBy/updatedBy)
│   │   └── ProductStatus.kt          # 值对象
│   ├── event/
│   │   └── ProductEvents.kt          # 领域事件 (产品创建/更新/删除)
│   └── repository/
│       └── ProductRepository.kt      # Repository 接口 (增强)
│
├── application/                      # 应用层 (用例编排)
│   ├── usecase/
│   │   ├── QueryProductUseCase.kt    # 查询: 列表/详情/SKU/分类
│   │   ├── CreateProductUseCase.kt   # 创建: 单个+批量, cogs自动计算
│   │   ├── UpdateProductUseCase.kt   # 更新: COGS 6字段批量
│   │   └── DeleteProductUseCase.kt   # 软删除
│   ├── usecase/barcode/
│   │   └── GenerateBarcodeUseCase.kt # 生成条形码 PDF (内存生成→流式下载→不持久化)
│   ├── command/
│   │   ├── CreateProductCommand.kt
│   │   └── BatchUpdateCogsCommand.kt
│   ├── query/
│   │   └── ProductQueryParams.kt
│   └── dto/
│       ├── ProductDtos.kt            # 产品 Request/Response DTOs
│       └── BarcodeDtos.kt            # 条形码 DTOs
│
├── infrastructure/                   # 基础设施层 (可替换)
│   ├── persistence/
│   │   └── ProductJpaRepository.kt   # JPA 实现
│   ├── barcode/
│   │   └── BarcodeGeneratorService.kt # ZXing+PDFBox (内存生成, 不落盘)
│   └── lock/
│       └── RedisDistributedLock.kt   # Redis 分布式锁
│
├── api/                              # 接口层 (Controller)
│   ├── ProductController.kt          # 产品 REST API (安全注解)
│   ├── BarcodeController.kt          # 条形码 REST API
│   └── ProductMapper.kt             # DTO ↔ Domain 映射
│
└── ProductModule.kt                  # Spring Modulith 模块声明

common/security/
├── SecurityLevel.kt              # ⚠️ 增强: +actionKey 参数
├── SecurityLevelAspect.kt        # 🔴 新建: AOP 拦截器 (动态策略感知)
└── DistributedLock.kt            # 🔴 新建: Redis 分布式锁接口

common/response/
└── ApiResponse.kt                # 统一响应格式: {success, data, pagination, error}
```

### 3.2 Phase Execution Model (AUDIT → DESIGN → BUILD → VERIFY → GATE)

---

#### Phase 0：DDD 重构 + Entity 增强 (1 天) 🔴 新增

**BUILD**:

| 任务 | 文件 | 内容 |
|------|------|------|
| 0.1 | 目录结构 | 将现有扁平结构迁移到 domain/application/infrastructure/api 四层 |
| 0.2 | `Product.kt` | 增加 `createdBy: String?`, `updatedBy: String?` 审计字段 |
| 0.3 | Flyway | `ALTER TABLE products ADD COLUMN created_by VARCHAR(36), ADD COLUMN updated_by VARCHAR(36)` |
| 0.4 | `ApiResponse.kt` | 新建统一响应包装: `ApiResponse<T>(success, data, pagination?, error?)` |
| 0.5 | `ProductController.kt` | 所有端点返回值改为 `ApiResponse<T>` 统一格式 |
| 0.6 | `ProductService.kt` → UseCase | 拆分为 Query/Create/Update/Delete UseCase |
| 0.7 | `ProductModule.kt` | Spring Modulith 模块声明 |

**GATE**: ✅ DDD 4 层结构, 审计字段, 统一响应格式

---

#### Phase 1：数据层补全 (0.5 天)

**BUILD**:

| 任务 | 文件 | 内容 |
|------|------|------|
| 1.1 | `ProductRepository.kt` | 新增 `findDistinctSubcategories()`, `findDistinctTypes()` |
| 1.2 | Flyway | 验证 products 表含所有字段 (含 created_by/updated_by) |
| 1.3 | UseCase 层 | 所有写操作自动填充 `createdBy`/`updatedBy` (从 SecurityContext 获取用户 ID) |

**GATE**: ✅ Repository 支持全部 distinct 查询 + 审计字段自动填充

---

#### Phase 2：Service & DTOs 增强 (1 天)

**BUILD**:

| 任务 | 文件 | 内容 |
|------|------|------|
| 2.1 | `ProductDtos.kt` | `CreateProductRequest` += subcategory, type, cost, freight, weight, initialQty |
| 2.2 | `ProductDtos.kt` | `UpdateProductRequest` += subcategory, type, cost, freight, weight |
| 2.3 | `ProductDtos.kt` | 重构 `BatchUpdateCogsRequest` → 6 字段 (cost, freight, weight, category, subcategory, type) |
| 2.4 | `ProductDtos.kt` | 新增 `ProductMetaResponse` (全部下拉选项) |
| 2.5 | `ProductService.kt` | 增强 create(): cogs = cost + freight 自动计算 |
| 2.6 | `ProductService.kt` | 重构 batchUpdateCogs(): 6 字段事务性更新 |
| 2.7 | `ProductService.kt` | 新增 getMetadata() |

**GATE**: ✅ 创建支持 9 字段, 批量更新支持 6 字段, COGS 自动计算

---

#### Phase 3：Controller 端点补全 (0.5 天)

| V1 端点 | V3 端点 | 状态 |
|---------|---------|------|
| `cogs_load_table_only` | `GET /products` | ✅ 已有 |
| `cogs_batch_update` | `POST /products/cogs/batch` | 增强 (6 字段) |
| `cogs_create_skus` | `POST /products/batch` | 增强 (9 字段) |
| `cogs_get_form_only` | `GET /products/metadata` | **新建** |
| `sku_list_api` | `GET /products/sku-list` | ✅ 已有 |
| — | `GET /products/subcategories` | **新建** |
| — | `GET /products/types` | **新建** |

---

#### Phase 4：条形码系统重写 (2.5 天) 🔴

##### 4.1 BarcodeGeneratorService — V1 精确复刻 (ZXing + PDFBox)

> **技术栈变更**: 从 iText → ZXing + PDFBox (遵循 v3-architecture.md §3.10)
> **铁律**: PDF 输出效果必须和 V1 像素级一致

| 规范 | V1 值 | V3 ZXing+PDFBox 实现 |
|------|-------|----------------------|
| 标签 | 4" × 6" | `PDPage(new PDRectangle(288f, 432f))` |
| Row 1 | SKU 条码 (全宽) | `ZXing Code128 → BufferedImage → PDImageXObject` |
| Row 2 | QTY/BOX (左) + BOX/CTN (右) | ZXing Code128 并排绘制 |
| Row 3 | L 定位符 (左下) + DataMatrix (右下) | `ZXing DataMatrix("SKU\|QTY\|BOX")` |
| 输入 | `[{sku, qtyPerBox, boxPerCtn}]` | **V1 完全一致** |
| X-dimension | 0.33mm | ZXing hints 控制 |
| 条码高度 | 18mm | BufferedImage 缩放 |
| 静区 | 3mm (左右) | PDFBox 坐标偏移 |

##### 4.2 条形码下载流程 (无持久化)

> **铁律**: 服务端不保存条形码 PDF。每次下载重新生成。

```
前端发送 [{sku, qtyPerBox, boxPerCtn}, ...]
    ↓
BarcodeController (POST /products/barcode/generate)
    ↓
GenerateBarcodeUseCase
    ↓
BarcodeGeneratorService.generate(items) → ByteArray (内存中生成 PDF)
    ↓
Controller 返回 StreamingResponse (Content-Disposition: attachment)
    ↓
前端下载完成 → 服务端内存释放 → 无持久化
```

##### 4.3 BarcodeController 端点 (精简版)

| V3 端点 | Method | 功能 | 说明 |
|---------|--------|------|------|
| `POST /products/barcode/generate` | POST | 生成并下载 PDF | 内存生成 → stream → 不落盘 |

> 移除的端点: `download/**`, `download-all`, `clear`, `view/**`  
> 原因: PDF 不持久化, 无需文件管理

**GATE**: ✅ PDF 像素级一致, 内存生成无落盘, 流式下载

---

#### Phase 5：安全层 & 分布式锁 (1.5 天) 🔴

##### 5.0 SecurityLevel 注解增强 (已有, 需改造)

```kotlin
// 当前:
annotation class SecurityLevel(
    val level: String  // "L1", "L2", "L3", "L4"
)

// 改为:
annotation class SecurityLevel(
    val level: String,      // "L1", "L2", "L3", "L4"
    val actionKey: String,  // "btn_batch_update_cogs", "btn_create_skus"
)
```

##### 5.1 SecurityLevelAspect — 新建 (当前缺失!)

```kotlin
/**
 * 处理 @SecurityLevel 注解 — 动态安全策略感知
 *
 * 核心逻辑:
 * 1. 从 X-Security-Code header 读取安全码
 * 2. 如果 header 存在 → 调用 SecurityCodeService 验证
 * 3. 如果 header 不存在 → 检查动态策略 (actionRegistry)
 *    - 若该 actionKey 的 tokens 为空 → 放行 (不需要安全码)
 *    - 若该 actionKey 的 tokens 非空 → 拒绝 (需要安全码)
 *
 * 注意: 动态策略判断由前端完成 (检查 actionRegistry → 决定是否弹窗)
 * 后端只做 "有码验码, 无码放行" 的兜底
 */
@Aspect @Component
class SecurityLevelAspect(
    private val securityCodeService: SecurityCodeService,
) {
    @Around("@annotation(securityLevel)")
    fun checkSecurityLevel(joinPoint: ProceedingJoinPoint, securityLevel: SecurityLevel): Any? {
        val request = currentRequest()
        val code = request.getHeader("X-Security-Code")
        
        if (code != null) {
            // 有安全码 → 验证
            val claims = extractClaims()
            securityCodeService.verifySecurityCode(
                VerifySecurityRequest(securityLevel.level, code, securityLevel.actionKey),
                claims.userId
            )
        }
        // 无安全码 → 放行 (前端已根据动态策略决定不弹窗)
        
        return joinPoint.proceed()
    }
}
```

##### 5.2 DistributedLock — 新建

```kotlin
/**
 * Redis 分布式锁 (替代 V1 LockManager)
 * 用于 COGS 批量更新 + SKU 批量创建
 */
@Component
class DistributedLock(private val redis: StringRedisTemplate) {
    fun <T> withLock(key: String, timeout: Duration = Duration.ofSeconds(30), block: () -> T): T
}
```

##### 5.3 Controller 注解应用

| 端点 | `@RequirePermission` | `@SecurityLevel` | `@AuditLog` |
|------|---------------------|-------------------|-------------|
| `GET /products` | `products.catalog.view` | — | — |
| `POST /products` | `products.catalog.create` | `L2, btn_create_skus` | ✅ CREATE |
| `POST /products/batch` | `products.catalog.create` | `L2, btn_create_skus` | ✅ CREATE |
| `POST /products/cogs/batch` | `products.catalog.update` | `L2, btn_batch_update_cogs` | ✅ UPDATE |
| `DELETE /products/{id}` | `products.catalog.delete` | `L3, btn_delete_product` | ✅ DELETE (HIGH) |
| `POST /barcode/generate` | `products.barcode.generate` | `L1, btn_generate_barcode` | ✅ CREATE |
| `POST /barcode/clear` | `products.barcode.generate` | — | ✅ DELETE |

##### 5.4 权限 Key Seeding (Flyway)

```sql
-- V{N}__products_permission_keys.sql
-- 需要在 role_permission_boundaries 或等效表中 seed 这些 key:
-- products.catalog.view
-- products.catalog.create
-- products.catalog.update
-- products.catalog.delete
-- products.barcode.generate
```

##### 5.5 前端安全码流程 (V3 架构)

```
用户点击 "保存" 或触发安全操作
    ↓
前端检查 actionRegistry 的 tokens 配置
    ├─ tokens: [] → 直接发请求 (无 X-Security-Code header)
    └─ tokens: ['modify'] → 弹出 SecurityCodeDialog
        ↓ 用户输入安全码
        ↓ 发请求, Header: X-Security-Code: {rawCode}
        ↓ 后端 SecurityLevelAspect 验证
```

**GATE**: ✅ 全部端点有权限+安全码+审计, 分布式锁覆盖写操作

---

#### Phase 6：前端重建 (2.5 天) — ⚠️ V1 为唯一真相源, 不参考 V2 前端

##### 6.1 COGS 页面 — 完全按 V1 3步向导重建

- **Step 1 编辑**: 表格行内编辑 6 字段 + COG 实时计算 + baselineMap/dirtyMap 追踪 + 修改行数实时计数
- **Step 2 验证**: 客户端校验 (Cost/Freight ≥ 0 两位小数, Weight > 0 整数) + **Diff Table** (SKU/字段/原值/新值) + 错误高亮
- **Step 3 提交**: 安全码验证 (动态策略) + 成功/失败统计 + 变更明细
- 🔴 **关键修复**: `handleSave` 必须发送 6 字段 `{id, category, subcategory, type, cost, freight, weight}` (V2 只发 cogs 是 bug)

##### 6.2 Create 页面 — 完全按 V1 3步向导重建

- **Step 1 填写**:
  - **多行批量** (动态添加/删除行, 批量添加5行)
  - **9 字段**: SKU (自动大写), Category, SubCategory, Type, Cost, Freight, Weight, Initial_Qty, UPC
  - **下拉选项** 从 `GET /products/metadata` 加载 (categories, subcategories, types)
  - **existingSkusSet** 前端 SKU 缓存校验 (从 `GET /products/sku-list` 加载)
  - **Cog 实时计算** (Cost + Freight)
  - **SKU 正则**: `/^[A-Z0-9/_-]+$/` (支持 `/` 字符用于条形码目录分层)
- **Step 2 验证**: SKU 非空不重复 + Cost/Freight > 0 + Weight ≥ 0 + Initial_Qty ≥ 0 + **zeroQtyConfirmed** 勾选 + 预览表格
- **Step 3 提交**: 安全码验证 (动态策略) + 创建统计 + 创建明细

##### 6.3 Barcode 页面 — 完全按 V1 4步向导重建

- **Step 1 输入**: SKU 模糊搜索 (autocomplete + ↑↓ Enter Escape 键盘导航) + 行级输入 (SKU + QTY/BOX + BOX/CTN) + 动态添加/删除行 + 批量添加5行 + SKU 精确匹配校验
- **Step 2 验证**: SKU 非空 + QTY/BOX > 0 + BOX/CTN > 0 + 预览表格 (含预计文件名)
- **Step 3 生成**: 安全码验证 (动态策略: 当前默认无需) + 进度条动画 + 后端批量生成
- **Step 4 完成**: 生成统计 + 文件列表 (大小/时间) + 单个下载 + ZIP 打包 + PDF.js 预览 + 清空 + 失败项列表

##### 6.4 API Client 改造

- `productsApi` 重构: 移除 body 中的 `sec_code_l2` → 改为 `X-Security-Code` header
- 新增 `apiRequestWithSecurity(endpoint, options, securityCode?)` 工具函数
- 所有 API 消费方适配 `{success, data}` 统一响应格式

##### 6.5 i18n 完整覆盖 (EN/ZH) 🔴 新增

> **铁律**: 仅 VMA 模块需要 VI (Vietnamese), Products 模块只需要 EN + ZH

| 命名空间 | 新增 key 范围 |
|----------|---------------|
| `products.wizard` | 向导步骤 (Step 1/2/3/4 标题+说明), 上一步/下一步按钮 |
| `products.cogs` | Diff Table 列名, 修改统计, 校验错误, 保存成功/失败 |
| `products.create` | 9 字段标签, 批量添加, SKU 校验错误, 初始库存确认 |
| `products.barcode` | 4 步向导, QTY/BOX+BOX/CTN 标签, 文件管理, 下载/预览/清空 |
| `products.errors` | 所有校验错误 (SKU 已存在/格式错误/必填等) |
| `products.hub` | 卡片标题+描述, 权限锁定提示 |

文件位置:
- `packages/shared/i18n/locales/en/products.json`
- `packages/shared/i18n/locales/zh/products.json`
- ~~`packages/shared/i18n/locales/vi/products.json`~~ (VI 保持现状, 不新增 key)

##### 6.6 ProductModuleNav 权限控制

- Hub 页面 3 张卡片根据用户权限动态显示/锁定:
  - COGS 卡片: 需要 `products.catalog.view`
  - Create 卡片: 需要 `products.catalog.create`
  - Barcode 卡片: 需要 `products.barcode.generate`
- 无权限时卡片显示锁定状态 (与 Dashboard 模块锁定风格一致)

---

#### Phase 7：集成测试 (1 天)

| 测试类 | 覆盖范围 |
|--------|----------|
| `ProductControllerTest.kt` | CRUD + 分页 + 搜索 + 权限 + 统一响应格式 |
| `ProductCogsBatchTest.kt` | 6字段批量更新 + cogs 自动计算 + 分布式锁 |
| `BarcodeControllerTest.kt` | 生成/下载/清空/预览 + 路径安全 |
| `BarcodeServiceTest.kt` | 4"×6" ZXing+PDFBox 布局 + DataMatrix + V1 A/B 对比 |
| `SecurityLevelAspectTest.kt` | X-Security-Code header + 动态策略 |
| `DddArchitectureTest.kt` | ArchUnit: 分层依赖规则验证 |

---

### 3.3 总体时间表

| 阶段 | 预计 | 累计 | 依赖 |
|------|------|------|------|
| Phase 0: DDD 重构 + Entity | 1d | 1d | — |
| Phase 1: 数据层 | 0.5d | 1.5d | P0 |
| Phase 2: UseCase & DTOs | 1d | 2.5d | P1 |
| Phase 3: Controller | 0.5d | 3d | P2 |
| Phase 4: 条形码 (ZXing+PDFBox) | 2.5d | 5.5d | P1 |
| Phase 5: 安全层 & 锁 | 1.5d | 7d | P3+P4 |
| Phase 6: 前端重建 + i18n | 3d | 10d | P5 |
| Phase 7: 集成测试 | 1d | 11d | P6 |
| **总计** | **11 天** | | |

---

### 3.4 风险清单

| 风险 | 等级 | 缓解 |
|------|------|------|
| V1 条形码 PDF 布局无法精确复刻 | 🔴 高 | iText 绝对定位, V1 输出做 A/B 对比 |
| SecurityLevelAspect 全新实现 | 🟡 中 | 参照已有 PermissionCheckAspect 模式 |
| 前端 sec_code body→header 改造影响面 | � 中 | 仅改 Products 模块, 其他模块不动 |
| Initial_Qty 涉及 Inventory 模块联动 | 🟡 中 | 先 Service 层预留, Inventory 模块后续接入 |
| 分布式锁死锁风险 | � 低 | TTL 自动过期 + finally 释放 |

---

### 3.5 功能对等检查表 (Go/No-Go)

- [ ] **Hub 页面**: 3个卡片 + 权限动态锁定
- [ ] **COGS 维护 (3步向导)**: 加载→6字段编辑→Diff Table 验证→安全验证(动态)→分布式锁→6字段批量保存
- [ ] **新增产品 (3步向导)**: 多行动态→9字段→SKU 缓存校验 (existingSkusSet)→下拉选项→零库存确认→安全验证(动态)→分布式锁→批量创建
- [ ] **条形码生成 (4步向导)**: SKU 模糊搜索+键盘导航→QTY/BOX+BOX/CTN 行级输入→验证→安全验证(动态)→进度条→生成→文件列表
- [ ] **条形码下载**: 内存生成 → 流式下载 → 服务端不保存 → 下次重新生成
- [ ] **条形码 PDF**: 4"×6" / Code 128 / DataMatrix / ZXing+PDFBox / 像素级一致
- [ ] **安全架构**: `@SecurityLevel(level, actionKey)` + `SecurityLevelAspect` 动态策略
- [ ] **权限控制**: `@RequirePermission` 全覆盖 + Superuser bypass + 权限 key Flyway seed
- [ ] **分布式锁**: Redis 锁覆盖 COGS 更新 + SKU 创建
- [ ] **审计日志**: `@AuditLog` 全覆盖
- [ ] **审计字段**: `created_by`/`updated_by` 自动填充 (§8.1)
- [ ] **统一响应**: 全部 API 返回 `{success, data, pagination?, error?}` (§7.2)
- [ ] **DDD 分层**: domain/application/infrastructure/api 四层 (§6)
- [ ] **SKU 格式**: 正则支持 `/` 字符: `/^[A-Z0-9/_-]+$/`
- [ ] **前端校验**: existingSkusSet + zeroQtyConfirmed + COG 实时计算
- [ ] **前端安全码**: 动态策略判断 → 无需码时不弹窗 + X-Security-Code header
- [ ] **i18n 双语言**: EN/ZH 完整覆盖所有 Products 新增 key (仅 VMA 需要 VI)
- [ ] **ProductModuleNav**: Hub 卡片权限动态锁定
- [ ] **集成测试**: 全部端点通过 + ArchUnit DDD 验证

---

> **PM 签字**: 基于 V1 产品板块 **三轮深度审计** + 用户 **14 条确认决策**,  
> 覆盖 5 个页面 / 10 个 API 端点 / 1 个 PDF 引擎 (ZXing+PDFBox) /  
> 1 个文件管理系统 / 1 个安全层缺口修复 / 1 个动态安全策略架构 /  
> **1 次 DDD 四层重构** / **1 个统一响应格式** / **审计字段补全** / **三语言 i18n**,  
> 确保零功能丢失从 V1 Django 迁移到 V3 Spring Boot + Kotlin 架构。  
> **V1 是唯一真相源。V2 前端不作参考。V3 架构 100% 合规。**  
> **迁移路由**: `/main_build` (后端 Phase 0-5, 7) + `/main_ui` (前端 Phase 6)
