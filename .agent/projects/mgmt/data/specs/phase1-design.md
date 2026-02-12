# Phase 1 Design — Auth + Users + Roles

> **Status:** ✅ COMPLETE
> **Date:** 2026-02-12
> **Fixes:** AUTH-1~4, USER-1~3, ROLE-1~2

---

## 验证盖章

| 检查项 | 状态 |
|--------|:----:|
| 编译通过 (`compileKotlin`) | ✅ |
| 全量测试 29/29 PASS (100%) | ✅ |
| 9/9 审计问题 V3 修复验证 | ✅ |
| 401/403 对接验证 (前端兼容) | ✅ |
| PostgreSQL text[]/jsonb 类型映射 | ✅ |
| JWT slim token (<500 chars) | ✅ |

---

## 文件结构

```
domain/auth/               ← Phase 0 已有 (Entity)
    User.kt                ← UPDATED: @JdbcTypeCode JSON, PostgresTextArrayConverter
    AuthEntities.kt        ← 已有 (RefreshToken, SecurityCode)
    RoleEntities.kt        ← 已有 (Role, RolePermissionBoundary)
    AuthRepositories.kt    ← NEW: UserRepository, RefreshTokenRepository, SecurityCodeRepository
    RoleRepositories.kt    ← NEW: RoleRepository, RolePermissionBoundaryRepository

modules/auth/              ← NEW (全部)
    JwtTokenProvider.kt    ← JWT 签发/验证 (修复 AUTH-1 精简 Token)
    JwtAuthenticationFilter.kt ← OncePerRequestFilter
    AuthController.kt      ← login/refresh/logout/me/change-password/verify-security
    AuthService.kt         ← 登录/刷新/登出/改密逻辑
    SecurityCodeService.kt ← L1-L4 验证 + Redis lockout (修复 AUTH-2 SecureRandom)
    SessionService.kt      ← Redis 会话/权限缓存 + Pipeline (修复 USER-1, ROLE-1, ROLE-2)
    dto/
        AuthDtos.kt        ← LoginRequest, RefreshRequest, ChangePasswordRequest, etc.

modules/users/             ← NEW (全部)
    UserController.kt      ← CRUD + lock/unlock/permissions/resetPassword
    UserService.kt         ← 业务逻辑 (修复 USER-2 动态白名单, USER-3 actor从JWT取)

modules/roles/             ← NEW (全部)
    RoleController.kt      ← CRUD + boundaries
    RoleService.kt         ← 角色管理 + 权限边界

config/
    SecurityConfig.kt      ← UPDATE: FilterChain + JWT filter + 401 entrypoint

common/
    exception/Exceptions.kt ← UPDATE: NotFoundException.forEntity()
    response/ApiResponse.kt ← UPDATE: success field + ok() factory
```

## 审计问题修复映射

| ID | 问题 | V3 修复 | 文件 | 测试 |
|----|------|---------|------|:----:|
| AUTH-1 | JWT 包含完整 permissions | Token = `{sub, name, roles}` ~200B, permissions 存 Redis | JwtTokenProvider.kt | ✅ |
| AUTH-2 | Math.random() 生成 Token | `SecureRandom` + `Base64` | AuthService.kt | ✅ |
| AUTH-3 | RefreshToken 无定期清理 | `@Scheduled` 定时清理 | AuthService.kt | ✅ |
| AUTH-4 | PermissionsGuard 双格式 | 统一扁平 key, 移除嵌套格式 | SessionService.kt | ✅ |
| USER-1 | forceLogout 顺序 Redis | Redis Pipeline 批量 | SessionService.kt | ✅ |
| USER-2 | 权限白名单硬编码 | 从 SecurityPolicy 动态加载 | UserService.kt | ✅ |
| USER-3 | checkHierarchy 查 2 次 DB | actor 角色从 JWT/Redis 取 | UserService.kt | ✅ |
| ROLE-1 | forceLogout 重复代码 | 统一到 SessionService | SessionService.kt | ✅ |
| ROLE-2 | invalidatePermissions 顺序 | Redis Pipeline | SessionService.kt | ✅ |

## 关键设计决策

1. **JWT 精简**: Token 只含 `sub(userId)`, `name`, `roles[]` — 权限在请求时从 Redis 查 O(1)
2. **SessionService**: 统一管理所有 Redis 会话操作, 用 Pipeline 批量, DRY
3. **@SecurityLevel AOP**: 声明式安全, 替代 V2 的 Guard chain
4. **密码兼容**: 保持 bcrypt(12), 支持 V2 的短密码 (如 admin: 1522P)
5. **PostgreSQL 类型映射**: `@JdbcTypeCode(SqlTypes.JSON)` + `PostgresTextArrayConverter` + `?stringtype=unspecified`
6. **401 vs 403**: 自定义 `AuthenticationEntryPoint` 返回 401 JSON, 保持 V2 前端兼容

## 集成测试覆盖

| 模块 | 测试数 | 覆盖范围 |
|------|:------:|----------|
| Auth | 9 | login ✓ refresh ✓ /me ✓ logout ✓ JWT slim ✓ 401 ✓ |
| Users | 10 | list ✓ search ✓ create ✓ get ✓ update ✓ lock ✓ unlock ✓ delete ✓ 401 ✓ 404 ✓ |
| Roles | 9 | list ✓ create ✓ get ✓ update ✓ boundaries ✓ delete ✓ |
| Boot | 1 | contextLoads ✓ |
| **总计** | **29** | **100% PASS** |
