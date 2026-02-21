# 实施方案: 安全策略矩阵 + 板块权限配置

> **🔴 这是全项目安全验证的核心文档。所有模块开发、迁移、重构必须先读此文件。**
> **审计日期: 2026-02-16 | 审计范围: V1 Django + V3 Spring Boot (V2 已弃用)**

---

## 0. 文档权重

| 场景 | 必须阅读 |
|------|----------|
| 新增任何需要安全码验证的操作 | **本文 §1 + §3** |
| 修改任何用户权限配置逻辑 | **本文 §2 + §4** |
| 迁移 V1 模块到 V3 | **本文 §5** |
| 新增前端安全码弹窗 | **本文 §6** |

---

## 1. 安全策略矩阵 (Security Policy Matrix)

### 1.1 概念

**每个"危险操作"按钮，在执行前需要通过 0~N 个安全验证码。**
安全策略矩阵就是 `actionKey → [tokenType, ...]` 的映射表。

```
例: "btn_clean_data" → ["system"]    # 需要 L4 核弹码
例: "btn_po_modify"  → ["user"]      # 只需要 L0 用户密码  
例: "btn_generate_barcode" → []      # 无需验证
```

### 1.2 五级令牌体系 (Token Model)

| Token Type | Level | 验证对象 | 用途 | JSON Body Key |
|------------|-------|----------|------|---------------|
| `user`     | L0    | 当前用户登录密码 (bcrypt) | 确认身份 | `sec_code_l0` |
| `query`    | L1    | 查询安保码 (`security_codes` 表) | 敏感数据查看 | `sec_code_l1` |
| `modify`   | L2    | 修改安保码 (`security_codes` 表) | 数据修改 | `sec_code_l2` |
| `db`       | L3    | 数据库管理码 (`security_codes` 表) | 高危/批量操作 | `sec_code_l3` |
| `system`   | L4    | 系统核弹码 (`security_codes` 表) | 清库/权限重配 | `sec_code_l4` |

### 1.3 V1 实现 (Django — 真相源)

```
数据流:
1. action_registry.json        → 所有 action 的默认安全等级 (default_security)
2. security_overrides.json     → 管理员自定义覆盖 (动态调整后的实际值)
3. SecurityPolicyManager       → 合并 1+2, 提供 verify_action_request()
4. 每个 View 在执行前调用        → verify_action_request(request, "btn_xxx")
```

**关键文件:**

| 文件 | 路径 | 作用 |
|------|------|------|
| Action 注册表 | `backend/common/action_registry.json` | 795 行, 定义全站所有操作的元数据 |
| 安全覆盖 | `backend/data/security_overrides.json` | 运行时自定义策略 (JSON file) |
| 策略管理器 | `backend/core/services/security/policy_manager.py` | 合并注册表+覆盖, 验证令牌 |
| Tab 视图 | `backend/apps/user_admin/views/tabs.py` | 渲染策略矩阵 UI (HTMX) |
| 服务层 | `backend/apps/user_admin/core/services.py` | get_policy_matrix() + update_all_policies() |

**V1 验证流程 (SecurityPolicyManager.verify_action_request):**
```python
# 1. 获取当前 action 需要的 tokens
required_tokens = cls.get_required_tokens(action_key)
# 优先读 security_overrides.json, fallback 到 action_registry.json 的 default_security

# 2. 逐个验证
for token in required_tokens:
    if token == "user":
        # L0: 验证用户密码
        AuthService.verify_password_only(username, input_value)
    else:
        # L1-L4: 验证环境变量中的安全码
        correct_code = getattr(settings, env_key)
        input_value == correct_code
```

### 1.4 V3 实现 (Spring Boot — 已迁移)

```
数据流:
1. Redis (action_registry:{actionKey}) → 每个 action 的当前 token 配置
2. @SecurityLevel(level, actionKey)    → 注解标记在 Controller 方法上
3. SecurityLevelAspect (AOP)           → 拦截注解, 读 Redis 策略, 验证令牌
4. SecurityPolicyController            → CRUD API for 策略管理 (/auth/security-policies)
5. SessionService                      → Redis 读写层
```

**关键文件:**

| 文件 | 路径 | 作用 |
|------|------|------|
| 注解定义 | `mgmt-v3/.../common/security/SecurityLevel.kt` | `@SecurityLevel(level, actionKey)` |
| AOP 拦截器 | `mgmt-v3/.../common/security/SecurityLevelAspect.kt` | 195 行, V1 parity 完整验证 |
| 策略 API | `mgmt-v3/.../modules/auth/SecurityPolicyController.kt` | GET/PUT /auth/security-policies |
| Redis 层 | `mgmt-v3/.../modules/auth/SessionService.kt` | getAllActionPolicies / saveAllActionPolicies |
| 安全码实体 | `mgmt-v3/.../domain/auth/AuthEntities.kt` | SecurityCode entity (security_codes 表) |

**V3 验证流程 (SecurityLevelAspect.enforceSecurityLevel):**
```kotlin
// 1. 超级管理员绕过 (V1 parity)
if (claims.roles.contains("superuser")) return proceed()

// 2. 从 Redis 加载策略
val requiredTokens = sessionService.getRequiredTokensForAction(actionKey)
if (requiredTokens.isEmpty()) return proceed()  // 无安全码要求 → 直接通过

// 3. 从 JSON body 读取安全码
val jsonBody = readJsonBody(request)  // 使用 CachedBodyRequestWrapper

// 4. 逐个验证
for (tokenType in requiredTokens) {
    if (tokenType == "user") {
        // L0: BCrypt 验证用户密码
        passwordEncoder.matches(inputValue, user.passwordHash)
    } else {
        // L1-L4: 从 security_codes 表加载 BCrypt hash, 验证
        val securityCode = securityCodeRepo.findByLevelAndIsActive(meta.level, true)
        BCrypt.checkpw(inputValue, securityCode.codeHash)
    }
}
```

### 1.5 V1→V3 安全策略矩阵对照表

| 维度 | V1 Django | V3 Spring Boot | 对齐状态 |
|------|-----------|----------------|----------|
| 策略存储 | JSON 文件 (security_overrides.json) | Redis (action_registry:*) | ✅ 升级 |
| 默认策略 | action_registry.json → default_security | 前端硬编码 + Redis 动态化 | ✅ 对齐 |
| 验证入口 | `SecurityPolicyManager.verify_action_request()` | `@SecurityLevel` AOP | ✅ 对齐 |
| L0 验证 | Django `check_password` | Spring `BCryptPasswordEncoder.matches()` | ✅ 对齐 |
| L1-L4 验证 | 环境变量对比 (明文) | `security_codes` 表 bcrypt hash | ✅ 升级 |
| 超级管理员绕过 | 无 (V1 无此逻辑) | `claims.roles.contains("superuser")` | ✅ V3 增强 |
| 热更新 | 文件 mtime 检测 | Redis 实时读取 | ✅ 升级 |
| 策略管理 UI | HTMX 渲染 (tabs.py) | Next.js `/users/password` 页 | ✅ 对齐 |
| 策略保存安全 | L4 验证 | L0 + L4 双重验证 | ✅ 加强 |

---

## 2. 板块权限配置 (Permission Whitelist)

### 2.1 概念

**每个用户可以访问哪些模块、子模块、功能 Tab。**
权限树由 `modules.json` 导航配置和 `action_registry.json` 合并构建，通过白名单过滤后呈现给管理员配置。

```
权限键格式:  module.{模块}.{子模块}.{功能}
例: "module.purchase.supplier.add"    → 采购 > 供应商 > 新增
例: "module.vma.employees.manage"     → VMA > 员工管理
```

### 2.2 V1 实现 (Django — 真相源)

```
数据流:
1. modules.json (导航配置)     → Module → Submodule → Tab 层级
2. action_registry.json        → 每个 Tab 下的 Actions
3. SecurityInventory 类         → 合并 1+2, 构建四级权限树
4. WHITELIST_PERMISSIONS (硬编码) → 白名单过滤 (只展示可配置的权限节点)
5. AuthService.get_permissions() → 读取用户当前权限 (JSONB)
6. permissions_panel.html       → 渲染权限勾选面板 (HTMX)
```

**关键文件:**

| 文件 | 路径 | 作用 |
|------|------|------|
| 权限资产盘点 | `backend/core/services/security/inventory.py` | SecurityInventory 类, 291 行 |
| 白名单 (V1) | 同上 `WHITELIST_PERMISSIONS` 常量 | 35 个 Tab 级权限键 |
| 用户权限 Tab | `backend/apps/user_admin/views/tabs.py` | user_permission_form() |
| 权限保存 | `backend/apps/user_admin/views/actions.py` | update_permission() |
| Auth 服务 | `backend/core/services/auth/service.py` | get_permissions() / set_permissions() |

### 2.3 V3 实现 (Spring Boot — 已迁移)

```
数据流:
1. UserService.DEFAULT_WHITELIST_PERMISSIONS  → 硬编码默认白名单 (86 个键, 含推导父节点)
2. SessionService.getPermissionWhitelist()    → Redis 动态白名单 (优先)
3. SecurityPolicyController /whitelist        → CRUD API for 白名单管理
4. userPermissions (JSONB in users 表)        → 用户当前权限
5. 前端 /users/[id]/permissions              → 权限树 UI (React + React Query)
```

**关键文件:**

| 文件 | 路径 | 作用 |
|------|------|------|
| 默认白名单 | `mgmt-v3/.../modules/users/UserService.kt` L50-86 | DEFAULT_WHITELIST_PERMISSIONS |
| Redis 缓存 | `mgmt-v3/.../modules/auth/SessionService.kt` | getPermissionWhitelist / savePermissionWhitelist |
| 白名单 API | `mgmt-v3/.../modules/auth/SecurityPolicyController.kt` | GET/PUT /auth/security-policies/whitelist |
| 前端权限树 | `apps/web/src/app/(dashboard)/users/[id]/permissions/page.tsx` | 630 行, permissionTree 硬编码 |
| 职能权限 | `apps/web/src/app/(dashboard)/users/capabilities/page.tsx` | 886 行, Role CRUD + Capability 开关 |

### 2.4 V1 白名单 vs V3 白名单对照

**V1 白名单 (35 个 Tab 级节点, 纯叶子):**
```
module.sales.transactions.upload
module.sales.reports.generate
module.sales.reports.center
module.sales.visuals.dashboard
module.purchase.supplier.add
module.purchase.supplier.strategy
module.purchase.po.add
module.purchase.po.mgmt
module.purchase.send.add
module.purchase.send.mgmt
module.purchase.receive
module.purchase.receive.mgmt
module.purchase.abnormal.manage
module.finance.flow.view
module.finance.logistic.manage
module.finance.prepay.manage
module.finance.deposit.manage
module.finance.po.manage
module.inventory.stocktake.upload
module.inventory.stocktake.modify
module.inventory.dynamic.view
module.inventory.shelf.manage
module.products.catalog.cogs
module.products.catalog.create
module.products.barcode.generate
module.db_admin.backup.create
module.db_admin.backup.restore
module.db_admin.backup.manage
module.db_admin.cleanup.delete
module.user_admin.users
module.user_admin.register
module.audit.logs.business
module.audit.logs.infra
module.audit.logs.system
```

**V3 白名单 (86 个键, 含推导的父节点 + VMA):**
- 包含上述全部 V1 节点 ✅
- 额外推导父节点 (如 `module.sales`, `module.sales.transactions`) ✅
- 新增 VMA 模块键 (5 个): `module.vma`, `module.vma.employees.manage`, `module.vma.departments.manage`, `module.vma.training_sop.manage`, `module.vma.training.manage` ✅
- 新增 User Admin 额外键: `module.user_admin.password_policy`, `module.user_admin.role_switches` ✅

### 2.5 VMA 权限键设计 (V3 新增)

| 权限键 | 对应功能 | 状态 |
|--------|----------|------|
| `module.vma` | VMA Hub 页面入口 | ✅ 已实现 |
| `module.vma.employees.manage` | 员工管理 | ✅ 已实现 |
| `module.vma.departments.manage` | 部门+岗位管理 | ✅ 已实现 |
| `module.vma.training_sop.manage` | 培训 SOP 管理 | ✅ 已实现 |
| `module.vma.training.manage` | 培训记录管理 | ✅ 已实现 |
| `module.vma.pvalve.inventory` | P-Valve 库存 | ❌ 待加入白名单 |
| `module.vma.delivery.inventory` | Delivery System 库存 | ❌ 待加入白名单 |
| `module.vma.demo.inventory` | Demo 库存 | ❌ 待加入白名单 |
| `module.vma.clinical.manage` | 临床案例管理 | ❌ 待加入白名单 |

> **⚠️ 注意**: P-Valve/Delivery/Demo/Clinical 子模块已开发完成但尚未加入权限白名单。需在权限体系标准化时统一加入。

---

## 3. 安全策略矩阵 — 完整 Action 清单

### 模块 Action 注册表 (截至 2026-02-16)

| 模块 | Action Key | 默认 Token | 描述 |
|------|------------|------------|------|
| **销售** | btn_commit_sku_fix | modify | SKU 修正 |
| | btn_run_transform | modify | 数据入库 |
| | btn_generate_report | query | 生成报表 |
| | btn_download_report | — | 下载报表 |
| | btn_clear_reports | modify | 清空报表 |
| | btn_unlock_visuals | user | 解锁可视化 |
| **采购** | btn_add_supplier | modify | 新增供应商 |
| | btn_modify_strategy | modify | 修改策略 |
| | btn_po_create | modify | 新建 PO |
| | btn_po_modify | modify | 修改 PO |
| | btn_po_delete | modify | 删除 PO |
| | btn_po_undelete | modify | 撤销删除 |
| | btn_po_upload_invoice | — | 上传账单 |
| | btn_po_delete_invoice | modify | 删除账单 |
| | send_order_create | modify | 新建发货单 |
| | btn_send_modify | modify | 修改发货单 |
| | btn_send_delete | modify | 删除发货单 |
| | btn_send_undelete | modify | 撤销删除 |
| | btn_send_upload_invoice | — | 上传账单 |
| | btn_send_delete_invoice | modify | 删除账单 |
| | btn_receive_confirm | modify | 确认入库 |
| | btn_receive_mgmt_edit | modify | 修改入库单 |
| | btn_receive_delete | db | 删除入库单 |
| | btn_receive_undelete | modify | 撤销删除 |
| | btn_receive_delete_file | modify | 删除文件 |
| | btn_abnormal_process | modify | 处理异常 |
| | btn_abnormal_delete | db | 删除异常 |
| **财务** | logistic_payment_confirm | modify | 物流付款 |
| | logistic_payment_delete | db | 删除付款 |
| | logistic_payment_file_delete | modify | 删除文件 |
| | logistic_payment_file_upload | — | 上传文件 |
| | btn_prepay_submit | modify | 新增预付 |
| | btn_prepay_delete | db | 删除预付 |
| | btn_prepay_undelete | modify | 恢复预付 |
| | btn_prepay_upload_file | — | 上传文件 |
| | btn_prepay_delete_file | modify | 删除文件 |
| | deposit_payment_submit | modify | 定金付款 |
| | deposit_payment_delete | db | 删除定金 |
| | deposit_receipt_upload | — | 上传回执 |
| | deposit_receipt_delete | modify | 删除回执 |
| | po_payment_submit | modify | 订单付款 |
| | po_payment_delete | db | 删除付款 |
| | po_receipt_upload | — | 上传回执 |
| | po_receipt_delete | modify | 删除回执 |
| **库存** | btn_sync_inventory | modify | 同步盘存 |
| | btn_update_single_inv | modify | 修正库存 |
| | btn_drop_inv_col | db | 删除库存列 🔴 |
| **产品** | btn_batch_update_cogs | modify | 批量更新 COGS |
| | btn_create_skus | modify | 批量新建 SKU |
| | btn_generate_barcode | — | 生成条码 |
| **数据库** | btn_create_backup | db | 创建备份 |
| | btn_restore_db | system | 恢复数据库 🔴 |
| | btn_delete_backup | db | 删除备份 |
| | btn_clean_data | system | 数据清洗 🔴🔴 |
| **用户** | btn_create_user | modify | 注册用户 |
| | btn_toggle_user_lock | modify | 锁定/解锁 |
| | btn_change_user_role | modify | 变更职级 |
| | btn_reset_pwd | modify | 重置密码 |
| | btn_update_perms | modify | 修改权限 |
| | btn_delete_user | db | 删除用户 |
| **日志** | btn_unlock_view | query | 解锁脱敏 |
| | btn_toggle_dev_mode | db | 开发模式 |
| | btn_clear_dev_logs | system | 清理日志 🔴 |

> **🔴 = 高危操作, 只有 superuser 可操作且需要最高等级安全码**

---

## 4. 权限验证链路 (End-to-End)

### 4.1 用户点击"删除备份" (V3 完整链路)

```
用户点击按钮
    ↓
前端弹出安全码弹窗 (requiredCodes: ['l3'])
    ↓
用户输入 L3 安全码
    ↓
前端发送 POST /db-admin/backups/{id}/delete
  body: { sec_code_l3: "xxx" }
    ↓
Spring Security Filter Chain
  → JwtAuthenticationFilter: 验证 Bearer Token
  → CachedBodyRequestWrapper: 缓存 request body (可重复读)
    ↓
Controller 方法:
  @SecurityLevel(level = "L3", actionKey = "btn_delete_backup")
  fun deleteBackup(...)
    ↓
SecurityLevelAspect.enforceSecurityLevel() (AOP 拦截)
  → claims = SecurityContext.authentication.principal
  → if superuser → bypass
  → requiredTokens = sessionService.getRequiredTokensForAction("btn_delete_backup")
     → Redis: action_registry:btn_delete_backup → ["db"]
  → jsonBody = readJsonBody(request)  // from CachedBodyRequestWrapper
  → validate "db" token:
     → inputValue = jsonBody["sec_code_l3"]
     → securityCode = securityCodeRepo.findByLevelAndIsActive("L3", true)
     → BCrypt.checkpw(inputValue, securityCode.codeHash)
  → if FAIL → 403 Forbidden
  → if PASS → proceed()
    ↓
Controller 正常执行删除逻辑
    ↓
审计日志写入
```

### 4.2 管理员配置用户权限 (V3 完整链路)

```
管理员点击用户列表 > 某用户 > "板块管理"
    ↓
前端路由: /users/{userId}/permissions
    ↓
GET /users/{userId} → 获取用户当前 permissions (JSONB)
    ↓
前端渲染权限树 (permissionTree 硬编码在前端)
  → 白名单过滤: 只展示 DEFAULT_WHITELIST_PERMISSIONS 中的键
  → 勾选状态: 从用户 permissions 字段匹配
    ↓
管理员勾选/取消勾选
    ↓
保存 → 弹出安全码弹窗 (requiredCodes: ['l2'])
    ↓
PUT /users/{userId}/permissions
  body: { permissions: { "module.sales": true, ... }, sec_code_l2: "xxx" }
    ↓
@SecurityLevel(level = "L2", actionKey = "btn_update_perms")
    ↓
SecurityLevelAspect → 验证 L2 → 通过
    ↓
UserService.updatePermissions() → 写入 users 表 permissions JSONB
    ↓
审计日志写入
```

---

## 5. 迁移规则 (🔴 铁律)

### 5.1 新增模块时

当新增一个业务模块（如未来的 Purchase V3）时，必须：

1. **注册 Action**: 在前端 `password/page.tsx` 的 `actionRegistry` 中新增模块的 actions
2. **标注 Controller**: 每个写操作方法加 `@SecurityLevel(level, actionKey)` 注解
3. **白名单更新**: 在 `UserService.DEFAULT_WHITELIST_PERMISSIONS` 中加入新的权限键
4. **前端权限树**: 在 `/users/[id]/permissions/page.tsx` 的 `permissionTree` 中加入新节点
5. **Redis 初始化**: 调用 `/auth/security-policies/whitelist/initialize` 同步到 Redis

### 5.2 一致性检查清单

| 检查项 | 验证方法 |
|--------|----------|
| 所有写操作都有 @SecurityLevel | `grep -r "@SecurityLevel" mgmt-v3/` |
| 前端 actionRegistry 与 V1 action_registry.json 一致 | 逐条对比 key |
| DEFAULT_WHITELIST 包含所有需要的权限键 | 白名单长度 ≥ V1 白名单长度 |
| permissionTree 与白名单对齐 | 前端所有 key 必须在白名单中 |

### 5.3 禁止事项

- ❌ **禁止** 在 Controller 中直接验证安全码 (必须用 `@SecurityLevel` 注解)
- ❌ **禁止** 在前端跳过安全码弹窗直接提交 (安全码永远由后端验证)
- ❌ **禁止** 使用环境变量存储 L1-L4 安全码 (必须用 `security_codes` 表 bcrypt)
- ❌ **禁止** 删除或修改 `CachedBodyRequestWrapper` (AOP 需要重复读取 body)
- ❌ **禁止** 修改 TOKEN_MAP 映射关系 (V1↔V3 必须保持一致)
- ❌ **禁止** 在白名单中加入 `public` 或 `admin_only` 类型的权限键

---

## 6. 前端安全码弹窗 (Security Code Dialog)

### 6.1 统一弹窗组件

前端使用 `GlobalModal` 的 `showPassword()` 方法唤起安全码弹窗:

```typescript
showPassword({
  title: '安全验证',
  message: '描述文字',
  requiredCodes: ['l0', 'l4'],  // 需要 L0 + L4
  onPasswordSubmit: async (passwords) => {
    const codeL0 = passwords.l0;
    const codeL4 = passwords.l4;
    await api.put('/some-endpoint', {
      ...data,
      sec_code_l0: codeL0,
      sec_code_l4: codeL4,
    });
  },
});
```

### 6.2 安全码字段命名约定

| 前端发送 | 后端读取 | Level |
|----------|----------|-------|
| `sec_code_l0` | `jsonBody["sec_code_l0"]` | L0 用户密码 |
| `sec_code_l1` | `jsonBody["sec_code_l1"]` | L1 查询码 |
| `sec_code_l2` | `jsonBody["sec_code_l2"]` | L2 修改码 |
| `sec_code_l3` | `jsonBody["sec_code_l3"]` | L3 数据库码 |
| `sec_code_l4` | `jsonBody["sec_code_l4"]` | L4 核弹码 |

> **⚠️ 字段名不可修改! 前后端契约。**

---

## 7. 数据库结构

### 7.1 security_codes 表 (V3)

```sql
CREATE TABLE security_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level       VARCHAR(10) NOT NULL,    -- 'L1', 'L2', 'L3', 'L4'
    code_hash   VARCHAR(255) NOT NULL,   -- bcrypt hash
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_security_codes_level_active UNIQUE (level, is_active)
);
```

### 7.2 users 表 permissions 字段

```sql
-- users.permissions 是 JSONB, 存储用户的权限配置
-- 格式: { "module.sales": true, "module.purchase.supplier.add": true, ... }
-- true = 有权限, false 或缺失 = 无权限
```

### 7.3 Redis 键

| Key Pattern | Value | 用途 |
|-------------|-------|------|
| `action_registry:{actionKey}` | `["user", "system"]` | Action 的安全令牌要求 |
| `mgmt:permission_whitelist` | `["module.sales", ...]` | 权限白名单 |
| `login:fail:{userId}` | count | 登录失败计数 |
| `login:lock:{userId}` | "1" | 锁定标记 (TTL 15min) |

---

## 8. L3 工具索引

| 工具 | 路径 | 用途 |
|------|------|------|
| L1 安全通用规范 | `core/skills/security.md` | Spring Security 架构参考 |
| V3 架构规范 | `reference/v3-architecture.md` | 整体技术栈 |
| V1 全景 | `reference/v1-deep-dive.md` | V1 表结构和安全实现 |
| 迁移约束 | `reference/migration.md` | V1/V2→V3 迁移规则 |
| 铁律 | `reference/iron-laws.md` | R0-R4 全局约束 |

---

---

## 9. 2026-02-21 Users 模块审计修复记录

> **36 项发现 (2C + 6H + 16M + 12L), 全部修复。以下为关键变更摘要。**

### 9.1 后端关键变更

| 文件 | 变更 | 级别 |
|------|------|------|
| `User.kt` | 添加 `@Version var version: Long = 0` 乐观锁 | CRITICAL |
| `AuthRepositories.kt` | 添加 `updateLastLoginAt()` @Modifying @Query, 用户排序改 native ORDER BY | HIGH |
| `AuthService.kt` | login() 改用 `updateLastLoginAt()` 绕过 @Version | HIGH |
| `RoleController.kt` | 全 8 个端点加 `@RequirePermission("module.user_admin.role_switches")` | HIGH |
| `SecurityConfig.kt` | Actuator 限制为 `/actuator/health`; CORS LAN 仅 dev 环境 | MEDIUM |
| `JwtAuthenticationFilter.kt` | 新增 Redis session 校验 `isSessionActive()` | MEDIUM |
| `AuthDtos.kt` | ResetPasswordRequest min=6 → min=8; UpdateUserRequest 加 @Email | MEDIUM |
| `RoleService.kt` | delete 前检查 `findByRole()` 引用 | MEDIUM |
| `UserController.kt` | check-username 加 @RateLimit | MEDIUM |
| `application.yml` | actuator include 改为仅 health | MEDIUM |
| `V18__users_add_version.sql` | Flyway: `ALTER TABLE users ADD COLUMN version BIGINT NOT NULL DEFAULT 0` | — |

### 9.2 前端关键变更

| 文件 | 变更 | 级别 |
|------|------|------|
| `PermissionGuard.tsx` | Access Denied 页 hardcoded → `useTranslations('auth')` i18n | CRITICAL |
| `security-code-dialog.tsx` | 安全等级标签 → `auth.securityLevels.*` i18n | HIGH |
| `AppleNav.tsx` | roleMap hardcoded → `nav.roleNames.*` i18n; 监听 `mgmt:user-updated` | HIGH |
| `columns.tsx` | `export const columns` → `export function getUserColumns(t)` 全 i18n | HIGH |
| `list/page.tsx` | `document.getElementById` → React state | HIGH |
| `capabilities/page.tsx` | 添加 `module.user_admin.role_switches` 权限守卫 | HIGH |
| `permissions/page.tsx` | `useMemo` → `useState + useEffect` + `mgmt:user-updated` 监听 | MEDIUM |
| `[id]/page.tsx` | Back 按钮 + 日期格式 i18n | MEDIUM |
| `password/page.tsx` | "有未保存的更改" → i18n key | HIGH |

### 9.3 权限同步机制 (AuthSessionGuard)

| 组件 | 机制 |
|------|------|
| AuthSessionGuard | 60s 轮询 `/auth/me`, 对比 localStorage, 差异时 dispatch `CustomEvent('mgmt:user-updated')` |
| AppleNav | 监听 `mgmt:user-updated` → 重读 localStorage → 重渲染导航锁 |
| PermissionGuard | 监听 `mgmt:user-updated` → 重新评估路由权限 |
| Dashboard | 监听 `mgmt:user-updated` → 更新模块卡片锁定状态 |
| SessionService | `PERM_TTL = 5min` (Redis 权限缓存) |

---

*Security Playbook v3.1 — 2026-02-21*
*基于: V1 Django 真实代码审计 + V3 Spring Boot 已迁移代码验证 + Users 模块企业级审计修复*
*审计覆盖: action_registry.json (795行) + SecurityPolicyManager (188行) + SecurityInventory (291行) + SecurityLevelAspect (195行) + SecurityPolicyController (192行) + SessionService (256行) + UserService (365行) + 前端 password/page.tsx (637行) + capabilities/page.tsx (886行) + permissions/page.tsx (630行)*
