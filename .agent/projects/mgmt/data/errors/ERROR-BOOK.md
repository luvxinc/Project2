# 📕 错题本

> **每次开始新任务前, 扫描此文件的触发关键词。**
> **如果当前任务的关键词命中, 必须读对应条目并遵守。**

## 关键词索引 (快速查找)

| 关键词 | 条目 | 严重度 |
|--------|------|--------|
| `SecurityCodeDialog`, `密码策略`, `动态策略`, `action_registry` | ERR-001 | 🔴 |
| `generateBarcodePdf`, `fetch`, `API Client` | ERR-002 | 🟡 |

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

*Version: 1.0 — Created: 2026-02-17*
