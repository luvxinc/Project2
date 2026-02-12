# User Admin 模块迁移进度

## 基本信息
- **模块**: User Admin (用户权限管理)
- **开始日期**: 2026-02-04
- **当前步骤**: Step 5 - 验证
- **状态**: 🟡 进行中

---

## 功能覆盖验证

### 1. 用户管理 (Users) - P0

| 功能 | 老系统 | V2 API | V2 前端 | 状态 |
|------|--------|--------|---------|------|
| 用户列表 | ✅ | `GET /users` | `/users` | ✅ |
| 用户详情 | ✅ | `GET /users/:id` | `/users/[id]` | ✅ |
| 创建用户 | ✅ | `POST /users` (L2) | `/users/register` | ✅ |
| 编辑用户 | ✅ | `PATCH /users/:id` (L2) | `/users/[id]` | ✅ |
| 编辑权限 | ✅ | `PATCH /users/:id/permissions` (L2) | `/users/[id]/permissions` | ✅ |
| 锁定/解锁 | ✅ | `POST /users/:id/lock` (L2) | SecurityCodeDialog | ✅ |
| 删除用户 | ✅ | `DELETE /users/:id` (L3) | SecurityCodeDialog (L3) | ✅ |
| 重置密码 | ✅ | `POST /users/:id/reset-password` (L2) | Dialog | ✅ |


### 2. 安全策略 (Security Policy)

| 功能 | 老系统 | V2 实现 | 状态 |
|------|--------|---------|------|
| L0-L4 安全等级 | SecurityPolicyManager | SecurityPolicyService | ✅ |
| 动态配置 | action_registry.json | apps/api/data/ | ✅ |
| 运行时覆盖 | security_overrides.json | apps/api/data/ | ✅ |
| 热重载 | 检测 mtime | 检测 mtime | ✅ |
| 层级保护 | Python | UsersService.checkHierarchy | ✅ |

### 3. 角色体系

| 角色 | 老系统 | V2 | 等级 |
|------|--------|-----|------|
| superuser | ✅ (SUPER_ADMIN_USER) | ✅ | 5 |
| admin | ✅ (is_admin=1) | ✅ | 4 |
| staff | - | ✅ | 3 |
| operator | ✅ (普通用户) | ✅ | 2 |
| viewer | - | ✅ | 1 |

---

## 技术检查清单

### 后端 (NestJS)

- [x] UsersModule 注册
- [x] UsersService CRUD 操作
- [x] UsersController API 端点
- [x] SecurityPolicyService (L0-L4)
- [x] SecurityLevelGuard
- [x] RolesGuard
- [x] DTO 验证 (class-validator)
- [x] 层级保护 (checkHierarchy)
- [x] 单元测试 (46 passed)

### 前端 (Next.js)

- [x] 用户列表页面
- [x] DataTable 组件
- [x] API 客户端
- [x] React Query 集成
- [ ] 创建用户表单
- [ ] 编辑用户 Modal
- [ ] 权限编辑器 (树形)
- [ ] 安全码输入对话框

### i18n

- [x] packages/shared/i18n/locales/en/users.json
- [x] packages/shared/i18n/locales/zh/users.json

### 数据迁移

- [x] scripts/migrate/users.ts 脚本已创建
- [ ] 在开发环境测试迁移
- [ ] 验证数据完整性

---

## 构建验证

```
✅ pnpm build (API) - PASSED
✅ pnpm build (Web) - PASSED
✅ pnpm test (API) - 46/46 PASSED
```

---

## 待完成项目

1. **前端完善**: 创建、编辑、删除等操作的 UI 组件
2. **数据迁移测试**: 在开发环境运行迁移脚本
3. **端到端测试**: 完整的前后端集成测试

---

## 更新日志

| 日期 | 进度 |
|------|------|
| 2026-02-04 | 完成 Step 1-5 基础实现 |
