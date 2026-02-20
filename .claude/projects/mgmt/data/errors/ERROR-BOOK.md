# 📕 错题本

> **每次开始新任务前, 扫描此文件的触发关键词。**
> **如果当前任务的关键词命中, 必须读对应条目并遵守。**

## 关键词索引 (快速查找)

| 关键词 | 条目 | 严重度 |
|--------|------|--------|
| `SecurityCodeDialog`, `密码策略`, `动态策略`, `action_registry` | ERR-001 | 🔴 |
| `generateBarcodePdf`, `fetch`, `API Client` | ERR-002 | 🟡 |
| `PDFBox`, `NoClassDefFoundError`, `后端重启`, `bootRun` | ERR-003 | 🔴 |
| `overflow`, `dropdown`, `absolute`, `z-index`, `裁剪`, `filter` | ERR-004 | 🔴 |
| `tripId`, `caseId=null`, `OUT_TRIP`, `completeCase`, `reverseCompletion` | ERR-005 | 🔴 |
| `猜测`, `creativity`, `UVP规则`, `不懂就问` | ERR-006 | 🔴 |
| `V1迁移`, `复刻`, `sheet_to_json`, `Excel模板`, `cell偏移` | ERR-007 | 🔴 |
| `status`, `shipping_status`, `active/cancelled`, `not_shipped` | ERR-008 | 🔴 |
| `API_BASE_URL`, `hardcode端口`, `3001`, `8080`, `getApiBaseUrlCached` | ERR-009 | 🔴 |

---

## ERR-001: SecurityCodeDialog 硬编码 — 忽略动态策略

- **触发关键词**: `SecurityCodeDialog`, `密码策略`, `动态策略`, `action_registry`, `密码弹窗`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-17
- **发生次数**: 1
- **影响范围**: 所有使用 SecurityCodeDialog 的页面 (products/barcode, products/create, products/cogs)

### 错误描述
前端 `SecurityCodeDialog` 在每个页面**硬编码触发** — 用户点击操作按钮就直接弹出密码框, 完全不查后端 Redis 中的动态策略配置 (`action_registry:{actionKey}`)。

用户在密码策略管理页面将 `btn_generate_barcode` 设为不需要密码 (tokens=[]), 保存成功后, 条形码页面仍然弹出密码框。

### 根因
```
前端代码:
  onClick={() => setShowSecurityDialog(true)}  // ← 硬编码, 无条件弹出

正确做法:
  1. 页面加载时查询 GET /auth/security-policies/action/{actionKey}
  2. 根据 requiresSecurityCode 字段决定弹/不弹
  3. 如果 false → 直接调 API
  4. 如果 true → 弹 SecurityCodeDialog
```

### V1 对照
V1 使用 `{% security_inputs "btn_generate_barcode" %}` 模板标签, 该标签会动态查询策略配置, 如果不需要密码则不渲染输入框。V3 前端必须实现同等的动态行为。

### 修复方案
1. 后端新增 `GET /auth/security-policies/action/{actionKey}` 端点 (已完成)
2. 前端使用 `useQuery` 查询策略, 根据结果决定是否弹出 SecurityCodeDialog (已修复 barcode 页面)

### 交叉检查 ⚠️
> 同类问题是否存在于其他页面?
> - `products/create/page.tsx` — SecurityCodeDialog 硬编码 level="L2" → ⚠️ 待检查
> - `products/cogs/page.tsx` — SecurityCodeDialog 硬编码 level="L2" × 2 → ⚠️ 待检查
> - 其他模块中所有使用 SecurityCodeDialog 的页面 → 待全面检查
> **结论: 需要全面审查所有 SecurityCodeDialog 使用点, 确保都支持动态策略。**

---

## ERR-002: generateBarcodePdf 绕过统一 API Client

- **触发关键词**: `generateBarcodePdf`, `fetch`, `API Client`, `产品API`, `条形码API`
- **严重度**: 🟡 HIGH
- **首次发生**: 2026-02-17
- **发生次数**: 1
- **影响范围**: `apps/web/src/lib/api/products.ts`

### 错误描述
`productsApi.generateBarcodePdf` 使用原始 `fetch()` 而非统一的 `api.post()` client。导致:
- 认证 token 获取逻辑重复
- 错误处理不一致
- BASE_URL 拼接不通过统一 client

### 根因
条形码 PDF 返回的是 `Blob` (二进制), 而统一 API client 默认期望 JSON 响应。开发时为了快速实现选择了绕过。

### 修复方案
统一 API client 应支持 `responseType: 'blob'` 选项, 或 `generateBarcodePdf` 专用 fetch 需要与 client 共享 token/baseURL 逻辑。

### 交叉检查 ⚠️
> 其他模块是否有类似绕过?
> - 待检查 (grep_search "fetch(" in lib/api/)

---

## ERR-003: PDFBox NoClassDefFoundError — 后端需要重启

- **触发关键词**: `PDFBox`, `NoClassDefFoundError`, `后端重启`, `bootRun`, `ClassNotFoundException`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-17
- **发生次数**: 1
- **影响范围**: 所有使用 PDFBox/ZXing 的功能 (条形码生成)

### 错误描述
```
java.lang.NoClassDefFoundError: org/apache/pdfbox/pdmodel/PDDocument
```
前端报 `HTTP 500`, 后端 `Handler dispatch failed`。PDFBox 在 `build.gradle.kts` 中已正确声明为 `implementation`, 但运行中的 JVM 进程是用**旧 classpath** 启动的 (PDFBox 依赖在之后才添加)。

### 根因
Java/Spring Boot 后端不会**热加载新依赖**。`build.gradle.kts` 添加新依赖后必须:
1. 停止旧进程
2. `./gradlew bootRun` 重新构建并启动

### 正确做法
```bash
# 1. 添加新依赖到 build.gradle.kts 后:
kill $(lsof -i :8080 -t) 2>/dev/null
cd mgmt-v3 && ./gradlew bootRun
# 2. 等待 "Started MgmtV3ApplicationKt" 日志出现
```

### 交叉检查 ⚠️
> 类似问题:
> - Flyway 迁移也需要重启后端 → 同理
> - 修改 Kotlin 源码, Spring DevTools 会自动热重载, 但**新依赖不行**
> - 前端 (Turbopack) 热更新对此无影响, 仅后端需要重启

---

## ERR-004: 绝对定位弹出层被 overflow 容器裁剪

- **触发关键词**: `overflow`, `dropdown`, `absolute`, `z-index`, `裁剪`, `filter`, `弹出层`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-17
- **发生次数**: 1
- **影响范围**: COGS 管理页面表头筛选器

### 错误描述
在 `<thead>` 中用 `position: absolute` 创建下拉筛选菜单, 但外层容器有 `overflow-hidden` 和 `overflow-x-auto`, 导致弹出的下拉菜单被完全裁剪, 用户点击后看不到任何选项。

### 根因
```
外层容器: className="rounded-xl border overflow-hidden"
  └── 内层: className="overflow-x-auto"
    └── <thead>
      └── <th position="relative">
        └── <div position="absolute"> ← 被裁剪, 不可见
```
CSS `overflow: hidden` 会裁剪所有超出边界的子元素, 包括绝对定位的弹出层。

### 正确做法
1. **方案 A (推荐)**: 将弹出式 UI 移到 overflow 容器外部 (如独立的 filter bar)
2. **方案 B**: 使用 React Portal 将弹出层渲染到 `<body>` 上
3. **方案 C**: 使用原生 `<select>` 元素 (不受 overflow 影响)
4. **绝对禁止**: 在 overflow-hidden 容器内部使用 absolute positioned 弹出层

### 更深层问题: 编译通过 ≠ 功能正常
此 bug 的真正教训不是 CSS 技术问题, 而是**交付验证流程缺陷**:
- ✅ TypeScript 编译通过
- ✅ 没有运行时错误
- ❌ 但用户看不到任何筛选选项
- **根因: 只做了编译验证, 没做功能性验证**

### 交叉检查 ⚠️
> 项目中其他使用 absolute 定位弹出层的地方:
> - 所有 overflow-hidden 容器内的 dropdown/popover → 待检查
> - `SecurityCodeDialog` — 用的是 fixed 定位 (安全)
> - Modal 弹窗 — 用的是 fixed 定位 (安全)

---

## ERR-005: Trip 交易 caseId=null — 所有查 caseId 的方法都会漏掉 trip 数据

- **触发关键词**: `tripId`, `caseId=null`, `OUT_TRIP`, `completeCase`, `reverseCompletion`, `generatePackingListPdf`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-18
- **发生次数**: 3 (PDF生成、completeCase、reverseCompletion)
- **影响范围**: VMA 临床案例模块 — 所有涉及 trip case 的后端逻辑

### 错误描述
`createCase` 中 trip 交易存储时 `caseId = null, tripId = tripId`。但后续多个方法 (generatePackingListPdf, completeCase, reverseCompletion) 都用 `findAllByCaseId(caseId)` 查询交易 → 返回空列表 → 功能失败。

### 铁律
**Trip 场景下, 所有交易操作必须检查 `c.tripId != null`, 然后用 `findAllByTripId()` 查询, 并过滤 `OUT_TRIP` 而非 `OUT_CASE`。**

### 交叉检查 ⚠️
> 任何新增的涉及 case 交易查询的方法, 都必须处理 trip 分支。

---

## ERR-006: 禁止猜测需求 — 不理解就问用户

- **触发关键词**: `猜测`, `creativity`, `UVP规则`, `不懂就问`, `瞎想`, `联想`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-18
- **发生次数**: 1
- **影响范围**: 全局行为准则

### 错误描述
用户提到 "UVP写入规则我们之前定义过了", Agent 花费大量 Token 搜索历史记录并臆测格式, 而不是直接问用户格式是什么。

### 铁律
**需求不明 = 直接问用户。禁止猜测、搜索、联想。不理解 = 不动手。**

---

## ERR-007: V1→V3 迁移 — Excel sheet_to_json 列偏移

- **触发关键词**: `V1迁移`, `复刻`, `sheet_to_json`, `Excel模板`, `cell偏移`, `in_po_upload`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-20
- **发生次数**: 3 (模板生成、上传解析、导出)

### 错误描述
SheetJS `sheet_to_json({header:1})` 在 sheet range 从 B1 开始时，B 列映射到数组 index 0（不是 1）。导致 `rows[0][1]` 读到 C1 而非 B1，所有 cell 位置偏移一列。前端解析器因此检测不到 V1 模板格式，走了 fallback（从零生成空白文件）。

### 铁律
**Excel 操作必须用直接 cell 引用 `ws['B1']?.v`，禁止用 `sheet_to_json` 数组索引。必须写 round-trip 自动化测试验证。**

---

## ERR-008: V1→V3 迁移 — 发明不存在的 status 概念

- **触发关键词**: `status`, `shipping_status`, `active/cancelled`, `not_shipped`, `复刻`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-20
- **发生次数**: 1

### 错误描述
V3 首版实现用了 `active/cancelled/completed` 状态体系，这是 Agent 自己发明的概念。V1 实际用 `shipping_status` (not_shipped/partially_shipped/fully_shipped) + `is_deleted` (boolean)，两者完全不同。

### 铁律
**V1→V3 迁移必须先逐行读完 V1 源码。禁止用"我觉得应该是"替代"V1 实际是"。所有字段、状态、枚举值必须从 V1 代码中抄写，不得创造。**

---

## ERR-009: 前端 API base URL hardcode

- **触发关键词**: `API_BASE_URL`, `hardcode端口`, `3001`, `8080`, `getApiBaseUrlCached`, `fetch`
- **严重度**: 🔴 CRITICAL
- **首次发生**: 2026-02-20
- **发生次数**: 2 (模板下载、导出下载)

### 错误描述
在 `downloadTemplate()` 和 `handleExport()` 中 hardcode `window.location.hostname:3001/api` 作为 base URL。实际后端在 `8080/api/v1`。导致 fetch 失败，走 fallback（前端生成空白 Excel 而非后端模板）。

### 铁律
**所有前端 API 调用统一用 `getApiBaseUrlCached()`（来自 `@/lib/api-url`）。禁止 hardcode 端口号或路径。**

---

*Version: 1.3 — Updated: 2026-02-20*
