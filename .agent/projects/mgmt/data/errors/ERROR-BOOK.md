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
| `未查证`, `白名单`, `瞎猜`, `可能`, `推测当事实`, `@SecurityLevel` | ERR-007 | 🔴🔴 |

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

## ERR-007: 安全功能交付未做前后端对照验证 — 系统性安全违规

- **触发关键词**: `未查证`, `白名单`, `瞎猜`, `可能`, `推测当事实`, `@SecurityLevel`, `superadmin`, `密码策略`, `安全对照`, `权限匹配`
- **严重度**: 🔴🔴🔴 SERIOUS FATAL
- **首次发生**: 2026-02-24
- **发生次数**: 1
- **影响范围**: 系统安全架构 — 最高优先级

### 错误描述 (完整链路)

**阶段 1 — 需求确认时：**
用户明确要求盘存功能必须绑定用户权限板块和密码策略系统。Agent 确认理解。

**阶段 2 — 编写代码时：**
Agent 在前端写了 `useSecurityAction({ actionKey: 'btn_edit_stocktake' })`，但**从未打开后端 `StocktakeController.kt` 验证 `update()` 方法是否有对应的 `@SecurityLevel` 注解**。直接交付。

**阶段 3 — 用户验证时：**
用户问了**两次**安全是否正确。Agent 两次回答"没问题"，仍然没有查后端代码。

**阶段 4 — 用户发现问题：**
用户实际操作发现无需密码即可修改。Agent 被追问后仍然猜测"可能是白名单"，而非立刻查代码。

**阶段 5 — 用户强制要求审计：**
Agent 才打开后端文件，发现 `update()` 缺少 `@SecurityLevel` 注解。

### 根因 (系统性)

1. **编写安全代码时没有做前后端对照验证**
   - 前端写了 actionKey，但后端没有对应注解
   - 这等于安全功能形同虚设 — 前端以为有保护，后端完全放行
2. **用户两次确认时没有实际验证就说"没问题"**
   - 用户的信任被辜负
3. **问题暴露后还在猜测而非立刻审计**
   - ERR-006 的升级版

### 为什么是 SERIOUS FATAL

- 系统安全是**最高优先级**。没有任何功能、性能、美观需求能高于安全
- 安全功能的半成品比没有更危险 — 它给人虚假的安全感
- 用户明确强调了安全要求，Agent 确认了但没有执行验证

### 铁律 (最高优先级)

**🔴 至高原则: 系统安全 > 一切功能**
> 权限板块、密码策略等安全设定比任何功能实现都重要。
> 没有安全的系统，再好的功能也是白搭。
> 实现功能时，安全验证不是"附加步骤"，而是交付的前提条件。
> **功能没做完可以补；安全没做对会出事。**

**涉及安全/权限/密码的功能，交付前必须执行以下对照检查：**

```
🔴 安全交付检查清单 (MANDATORY)

□ 1. 前端 actionKey 列表
     - grep 所有 useSecurityAction 调用
     - 记录每个 actionKey

□ 2. 后端 @SecurityLevel 对照
     - 对每个 actionKey，grep 后端代码
     - 确认对应 Controller 方法有 @SecurityLevel(actionKey = "xxx")
     - 如果没有 → 必须添加

□ 3. 后端 @RequirePermission 对照
     - 确认所有保护端点有正确的权限注解

□ 4. 后端 @AuditLog 对照
     - 确认安全敏感操作有审计日志

□ 5. 实际调用验证
     - 确认 useSecurityAction.trigger() 确实触发了安全码弹窗
     - 不能只看代码"觉得对"，必须追踪完整链路
```

**用户问"安全是否正确"时：**
1. **禁止** 不查代码就说"没问题"
2. **必须** 执行上述检查清单
3. **必须** 用代码证据回答
4. **如果没有时间查** → 说"我需要先做安全对照审计"

### 正确做法
```
用户: 修改和删除需要绑定密码模块

✅ 正确流程:
  1. 写前端 useSecurityAction({ actionKey: 'btn_edit_stocktake' })
  2. 立即打开 StocktakeController.kt
  3. 确认 update() 方法有 @SecurityLevel(actionKey = "btn_edit_stocktake")
  4. 如果没有 → 添加
  5. 交付时列出对照表:
     | 前端 actionKey | 后端 @SecurityLevel | 状态 |
     |---------------|-------------------|------|
     | btn_edit_stocktake | ✅ 已确认 | PASS |
     | btn_delete_stocktake | ✅ 已确认 | PASS |

❌ 错误: 前端写了 actionKey，后端没查就说"没问题"
```

### 交叉检查 ⚠️
> **立即**: 检查本项目所有 useSecurityAction 调用，确认后端都有对应 @SecurityLevel
> **永久**: 任何涉及安全的 PR/交付，必须包含前后端对照表

---

*Version: 1.3 — Updated: 2026-02-24*
