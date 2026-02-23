# Finance Prepay — 安全组件连接审计报告

> **Auditor**: PM
> **Date**: 2026-02-22
> **Scope**: 权限注解 · 安全码传输 · Action Key 注册 · 完整安全链路验证

---

## 1. 完整安全链路图

```
Frontend                        Network                 Backend
─────────                    ─────────                ─────────
user clicks "Delete"
  → useSecurityAction.trigger()
    → GET /auth/security-policies/action/{actionKey}
      → SessionService.getRequiredTokensForAction()
        → Redis/DB ActionRegistry lookup
          → Returns: { requiredTokens: ["modify"], requiresSecurityCode: true }
    → Shows SecurityCodeDialog (L3 badge)
      → User inputs security code
        → onConfirm(code) → mutation.mutate(code)
          → financeApi.deletePrepayment(id, code)        ←── 🔴 BUG HERE
            → api.delete('/finance/prepayments/{id}',
                { securityCode: code })                   ←── 🔴 KEY NAME WRONG
              ──HTTP DELETE──→
                                                          PrepaymentController.softDelete()
                                                            ↓
                                                          @SecurityLevel(L3, "btn_prepay_delete")
                                                            ↓
                                                          SecurityLevelAspect.enforceSecurityLevel()
                                                            ↓
                                                          readJsonBody(request) → reads JSON body
                                                            ↓
                                                          jsonBody["sec_code_l3"] ← 🔴 EXPECTS THIS KEY
                                                            ↓
                                                          BUT RECEIVES: {"securityCode":"xxxx"}
                                                            ↓
                                                          🔴 sec_code_l3 = null → DENY → 403
```

---

## 2. 🔴 关键漏洞: 安全码 JSON Key 名称不匹配

### 问题根因

V3 的 `SecurityLevelAspect` 从请求 JSON body 中读取安全码，**使用的是 V1 协议的键名**：

```kotlin
// SecurityLevelAspect.kt L68-74
val TOKEN_MAP = mapOf(
    "user"   to TokenMeta("L0", "sec_code_l0"),
    "query"  to TokenMeta("L1", "sec_code_l1"),
    "modify" to TokenMeta("L2", "sec_code_l2"),
    "db"     to TokenMeta("L3", "sec_code_l3"),
    "system" to TokenMeta("L4", "sec_code_l4"),
)
```

**这意味着后端期望的 JSON 键名是 `sec_code_l2` / `sec_code_l3`**

### Purchase 模块 (✅ 正确)

```typescript
// purchase.ts L373-374
deleteOrder: (id: number, sec_code_l3: string) =>
    api.delete('/purchase/orders/' + id, { sec_code_l3 }),
//                                        ^^^^^^^^^^^^^ ← 正确! 匹配后端期望
```

### Finance 模块 (🔴 错误)

```typescript
// finance.ts L171-173
deletePrepayment: (id: number, securityCode?: string) =>
    api.delete('/finance/prepayments/' + id,
        securityCode ? { securityCode } : undefined),
//                      ^^^^^^^^^^^^^ ← 错误! 后端期望 sec_code_l3
```

### 影响范围

| 操作 | 后端 Action Key | 后端 Level | 后端期望 JSON Key | 前端发送的 Key | 状态 |
|------|----------------|-----------|-------------------|---------------|------|
| 新建预付款 | `btn_prepay_submit` | L2 | `sec_code_l2` | `securityCode` | 🔴 **BROKEN** |
| 删除预付款 | `btn_prepay_delete` | L3 | `sec_code_l3` | `securityCode` | 🔴 **BROKEN** |
| 恢复预付款 | `btn_prepay_undelete` | L2 | `sec_code_l2` | `securityCode` | 🔴 **BROKEN** |
| 上传文件 | `btn_prepay_upload_file` | L2 | `sec_code_l2` | (无前端调用) | ⚠️ 待接入 |
| 删除文件 | `btn_prepay_delete_file` | L2 | `sec_code_l2` | `securityCode` | 🔴 **BROKEN** |

### 对比: Purchase 模块的正确用法

| Purchase 操作 | 前端发送 | 后端期望 | 状态 |
|--------------|---------|---------|------|
| deleteOrder | `{ sec_code_l3 }` | `sec_code_l3` | ✅ |
| restoreOrder | `{ sec_code_l2 }` | `sec_code_l2` | ✅ |
| createOrder | `{ sec_code_l3 }` | `sec_code_l3` | ✅ |
| createSupplier | `{ sec_code_l3 }` | `sec_code_l3` | ✅ |

---

## 3. 🔴 Action Key 未注册到数据库

Finance 的 5 个 Action Key 没有在任何 Flyway migration 或 seed 脚本中注册到 `action_registry` 表：

| Action Key | 是否在 action_registry | 影响 |
|------------|----------------------|------|
| `btn_prepay_submit` | 🔴 **未注册** | SecurityLevelAspect 返回 emptyList → **静默跳过安全码验证** |
| `btn_prepay_delete` | 🔴 **未注册** | 同上 |
| `btn_prepay_undelete` | 🔴 **未注册** | 同上 |
| `btn_prepay_upload_file` | 🔴 **未注册** | 同上 |
| `btn_prepay_delete_file` | 🔴 **未注册** | 同上 |

**双重漏洞**: 
1. Action Key 未注册 → `getRequiredTokensForAction()` 返回空列表 → **所有操作绕过安全码** ← 更严重!
2. 即使注册了, 前端发送的 key 名称也不匹配

**这意味着当前所有 finance prepay 的安全敏感操作实际上没有任何安全码保护!**

---

## 4. `useSecurityAction` 连接审计

### 前端连接 (结构正确, 键名错误)

| 检查项 | 状态 | 问题 |
|--------|------|------|
| `useSecurityAction` 导入使用 | ✅ 正确 | — |
| `SecurityCodeDialog` 渲染 | ✅ 正确 | isOpen/onConfirm/onCancel/error 全部连接 |
| `trigger()` 触发时机 | ✅ 正确 | 在 handleDelete/handleRestore 中调用 |
| `onExecute → mutation.mutate(code)` | ✅ 正确 | code 传入 mutation |
| `mutation → financeApi.xxx(id, code)` | 🔴 **key 名错误** | 发送 `securityCode` 而非 `sec_code_lX` |
| policy check → `/auth/security-policies/action/{key}` | ⚠️ 依赖注册 | actionKey 未在 DB 注册 |

### 与 purchase 页面对比

```typescript
// Purchase (正确):
const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
        purchaseApi.deleteOrder(deleteTarget!.id, secCode),
});
// → purchaseApi.deleteOrder(id, sec_code_l3) → { sec_code_l3: "xxx" }  ✅

// Finance (错误):
const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
        financeApi.deletePrepayment(deleteTarget!.id, secCode || undefined),
});
// → financeApi.deletePrepayment(id, securityCode) → { securityCode: "xxx" }  ❌
```

---

## 5. `@RequirePermission` 注解审计

| 端点 | 注解 | 权限键 | 状态 |
|------|------|--------|------|
| GET /balances | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |
| GET /transactions | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |
| POST /prepayments | `@RequirePermission("module.finance.prepay.manage")` | `module.finance.prepay.manage` | ⚠️ 未验证 |
| GET /history | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |
| DELETE /{id} | `@RequirePermission("module.finance.prepay.manage")` | `module.finance.prepay.manage` | ⚠️ 未验证 |
| POST /{id}/restore | `@RequirePermission("module.finance.prepay.manage")` | `module.finance.prepay.manage` | ⚠️ 未验证 |
| GET /files | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |
| GET /files/{fn} | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |
| POST /files | `@RequirePermission("module.finance.prepay.manage")` | `module.finance.prepay.manage` | ⚠️ 未验证 |
| DELETE /files/{fn} | `@RequirePermission("module.finance.prepay.manage")` | `module.finance.prepay.manage` | ⚠️ 未验证 |
| GET /exchange-rate | `@RequirePermission("module.finance.prepay")` | `module.finance.prepay` | ⚠️ 未验证 |

**⚠️ "未验证"** = 权限 key 已写入注解，但用户权限 JSON 中是否包含这些 key 未经确认。需要用户确认是否已将 `module.finance.prepay` 和 `module.finance.prepay.manage` 添加到角色权限。

`PermissionCheckAspect` 本身的实现是正确的（L64-66）:
```kotlin
val hasPermission = permissions.contains(requiredPermission) ||
    permissions.contains("module.$requiredPermission")
```
双格式兼容: 接受 `module.finance.prepay` 或 `finance.prepay`。

---

## 6. 🔴 修复方案

### Fix 1: finance.ts — 安全码键名修正 (P0)

```typescript
// BEFORE:
deletePrepayment: (id: number, securityCode?: string) =>
    api.delete('/finance/prepayments/' + id,
        securityCode ? { securityCode } : undefined),

// AFTER:
deletePrepayment: (id: number, sec_code_l3?: string) =>
    api.delete('/finance/prepayments/' + id,
        sec_code_l3 ? { sec_code_l3 } : undefined),
```

Apply same pattern to all 4 security-protected endpoints.

### Fix 2: Action Key 注册 (P0)

创建 Flyway migration: `V20__seed_prepay_action_keys.sql`

```sql
INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_prepay_submit',      '["modify"]'),
  ('btn_prepay_delete',      '["db"]'),
  ('btn_prepay_undelete',    '["modify"]'),
  ('btn_prepay_upload_file', '["modify"]'),
  ('btn_prepay_delete_file', '["modify"]')
ON CONFLICT (action_key) DO NOTHING;
```

### Fix 3: 权限 Key 注册到角色 (P1)

确认对应角色的 permissions JSON 包含:
- `module.finance.prepay` (只读)
- `module.finance.prepay.manage` (读写)

---

## 📋 闸门清单

| 检查项 | 修复前 | 修复后 |
|--------|--------|--------|
| 安全码 JSON key 匹配 | 🔴 5/5 BROKEN | → 修复中 |
| Action Key 注册 | 🔴 0/5 注册 | → 修复中 |
| @RequirePermission 注解 | ✅ 语法正确 | — |
| @SecurityLevel 注解 | ✅ 语法正确 | — |
| PermissionCheckAspect | ✅ 链路完整 | — |
| SecurityLevelAspect | ✅ 链路完整 | — |
| useSecurityAction hook | ✅ 流程正确 | — |
| SecurityCodeDialog | ✅ 渲染正确 | — |
| JWT 认证链 | ✅ 完整 | — |
| Superuser bypass | ✅ 正确实现 | — |
| 权限 key 注册到角色 | ⚠️ 未确认 | → 需用户确认 |

**总体判定**: 🔴 **FAIL** — 安全码验证完全失效，所有受保护操作可被绕过。
