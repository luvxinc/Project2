# 认证 API 规范 (Auth API Specification)

> **本文档定义 MGMT V2 系统的认证与授权 API 契约。**

---

## 1. 概述

### 1.1 认证策略

| 项目 | 规范 |
|------|------|
| **认证方式** | JWT (JSON Web Token) |
| **Token 类型** | Access Token + Refresh Token |
| **存储位置** | HttpOnly Cookie (推荐) 或 Authorization Header |
| **Access Token 有效期** | 15 分钟 |
| **Refresh Token 有效期** | 7 天 |

### 1.2 API 前缀

```
/api/v1/auth/*
```

---

## 2. 接口清单

| Method | Endpoint | 功能 | 需认证 |
|--------|----------|------|--------|
| POST | `/api/v1/auth/login` | 用户登录 | ❌ |
| POST | `/api/v1/auth/logout` | 用户登出 | ✅ |
| POST | `/api/v1/auth/refresh` | 刷新 Token | ❌ (需 Refresh Token) |
| GET | `/api/v1/auth/me` | 获取当前用户信息 | ✅ |
| POST | `/api/v1/auth/verify-security` | 验证安全码 | ✅ |
| PATCH | `/api/v1/auth/change-password` | 修改密码 | ✅ |

---

## 3. 接口详细规范

### 3.1 用户登录

**POST** `/api/v1/auth/login`

**请求体**:
```json
{
  "username": "string",
  "password": "string",
  "rememberMe": false
}
```

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@example.com",
      "displayName": "Administrator",
      "roles": ["admin"],
      "permissions": {
        "modules": {
          "sales": { "transactions": ["*"], "reports": ["view"] },
          "purchase": { "*": ["*"] }
        }
      },
      "settings": {
        "language": "en",
        "timezone": "America/Los_Angeles"
      }
    },
    "accessToken": "EXAMPLE_JWT_ACCESS_TOKEN",
    "refreshToken": "EXAMPLE_JWT_REFRESH_TOKEN",
    "expiresIn": 900
  }
}
```

**错误响应** (401):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

**错误响应** (423 - 账户锁定):
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is locked due to multiple failed attempts",
    "details": {
      "lockedUntil": "2026-02-04T18:00:00Z",
      "remainingMinutes": 15
    }
  }
}
```

---

### 3.2 刷新 Token

**POST** `/api/v1/auth/refresh`

**请求体**:
```json
{
  "refreshToken": "EXAMPLE_JWT_REFRESH_TOKEN"
}
```

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "accessToken": "EXAMPLE_JWT_ACCESS_TOKEN",
    "expiresIn": 900
  }
}
```

**错误响应** (401):
```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Refresh token has expired. Please login again."
  }
}
```

---

### 3.3 用户登出

**POST** `/api/v1/auth/logout`

**Headers**:
```
Authorization: Bearer <access_token>
```

**成功响应** (200):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 3.4 获取当前用户信息

**GET** `/api/v1/auth/me`

**Headers**:
```
Authorization: Bearer <access_token>
```

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "roles": ["admin"],
    "permissions": {
      "modules": {
        "sales": { "transactions": ["*"], "reports": ["view"] },
        "purchase": { "*": ["*"] }
      }
    },
    "settings": {
      "language": "en",
      "timezone": "America/Los_Angeles"
    },
    "lastLoginAt": "2026-02-04T10:30:00Z",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

### 3.5 验证安全码

**POST** `/api/v1/auth/verify-security`

用于高危操作的二次验证。

**请求体**:
```json
{
  "securityLevel": "L3",
  "securityCode": "123456",
  "actionKey": "btn_delete_inventory"
}
```

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "verified": true,
    "validUntil": "2026-02-04T17:45:00Z",
    "securityToken": "temp_security_token_xxx"
  }
}
```

**错误响应** (403):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_SECURITY_CODE",
    "message": "Invalid security code for level L3"
  }
}
```

---

### 3.6 修改密码

**PATCH** `/api/v1/auth/change-password`

**请求体**:
```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456",
  "confirmPassword": "newpass456"
}
```

**成功响应** (200):
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**错误响应** (400):
```json
{
  "success": false,
  "error": {
    "code": "PASSWORD_POLICY_VIOLATION",
    "message": "Password does not meet policy requirements",
    "details": [
      "Password must be at least 8 characters",
      "Password must contain at least one uppercase letter"
    ]
  }
}
```

---

## 4. JWT Token 结构

### 4.1 Access Token Payload

```json
{
  "sub": "user-uuid",
  "username": "admin",
  "roles": ["admin"],
  "permissions": {
    "modules": {
      "sales": { "*": ["*"] },
      "purchase": { "*": ["*"] }
    }
  },
  "iat": 1699999999,
  "exp": 1700000899,
  "iss": "mgmt-v2",
  "aud": "mgmt-v2-api"
}
```

### 4.2 Refresh Token Payload

```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "jti": "unique-token-id",
  "iat": 1699999999,
  "exp": 1700604799
}
```

---

## 5. RBAC 权限模型

### 5.1 权限结构

```
权限层级 (4 级)
├── Module (模块)        例: sales, purchase, inventory
│   ├── Submodule (子模块) 例: transactions, reports
│   │   └── Action (动作)   例: view, create, edit, delete, *
```

### 5.2 权限 JSON 格式

```json
{
  "modules": {
    "sales": {
      "transactions": ["view", "create", "edit"],
      "reports": ["view"]
    },
    "purchase": {
      "*": ["*"]  // 采购模块的所有权限
    },
    "inventory": {
      "fifo": ["view"],
      "snapshot": ["view", "export"]
    }
  }
}
```

### 5.3 权限检查规则

| 规则 | 说明 |
|------|------|
| `*` 通配符 | 匹配所有子模块或动作 |
| 继承规则 | 不继承：拥有 `sales.*` 不代表拥有 `sales.transactions.delete` |
| Admin 角色 | `roles: ["admin"]` 拥有所有权限 |

### 5.4 预定义角色

| 角色 | 权限范围 | 说明 |
|------|----------|------|
| `admin` | `*.*.*` | 超级管理员，所有权限 |
| `manager` | 按配置 | 经理级别 |
| `operator` | 按配置 | 操作员级别 |
| `viewer` | `*.*.view` | 只读权限 |

---

## 6. 安全等级验证

### 6.1 安全等级定义

| 等级 | 代码 | 用途 | 验证方式 |
|------|------|------|----------|
| L1 | `SEC_LEVEL_QUERY` | 查询操作 | Token 即可 |
| L2 | `SEC_LEVEL_MODIFY` | 修改操作 | Token + 密码确认 |
| L3 | `SEC_LEVEL_DB` | 数据库操作 | Token + 安全码 (6位) |
| L4 | `SEC_LEVEL_SYSTEM` | 系统级操作 | Token + 系统码 (8位) |

### 6.2 高危操作 Headers

```http
POST /api/v1/db-admin/restore HTTP/1.1
Authorization: Bearer <access_token>
X-Security-Level: L4
X-Security-Token: <temp_security_token>
X-Action-Key: btn_restore_db
X-Idempotency-Key: <unique-request-id>
```

### 6.3 Action Key 清单 (Auth 模块)

| Action Key | 操作 | 安全等级 |
|------------|------|----------|
| `btn_create_user` | 创建用户 | L2 |
| `btn_delete_user` | 删除用户 | L3 |
| `btn_toggle_user_lock` | 锁定/解锁用户 | L2 |
| `btn_reset_pwd` | 重置密码 | L3 |
| `btn_change_user_role` | 修改角色 | L3 |
| `btn_update_perms` | 更新权限 | L3 |

---

## 7. 错误码清单

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `TOKEN_EXPIRED` | 401 | Token 已过期 |
| `TOKEN_INVALID` | 401 | Token 无效 |
| `ACCOUNT_LOCKED` | 423 | 账户已锁定 |
| `ACCOUNT_DISABLED` | 403 | 账户已禁用 |
| `PERMISSION_DENIED` | 403 | 无权限 |
| `INVALID_SECURITY_CODE` | 403 | 安全码错误 |
| `SECURITY_LEVEL_REQUIRED` | 403 | 需要更高安全等级 |
| `PASSWORD_POLICY_VIOLATION` | 400 | 密码不符合策略 |

---

## 8. 实现注意事项

### 8.1 NestJS 实现要点

```typescript
// 模块结构
apps/api/src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── local.strategy.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── security-level.guard.ts
├── decorators/
│   ├── roles.decorator.ts
│   ├── permissions.decorator.ts
│   └── security-level.decorator.ts
└── dto/
    ├── login.dto.ts
    ├── refresh.dto.ts
    └── change-password.dto.ts
```

### 8.2 关键依赖

```json
{
  "@nestjs/passport": "^10.x",
  "@nestjs/jwt": "^10.x",
  "passport": "^0.7.x",
  "passport-jwt": "^4.x",
  "passport-local": "^1.x",
  "bcrypt": "^5.x"
}
```

### 8.3 从老系统迁移清单

| 老系统功能 | V2 对应 | 状态 |
|------------|---------|------|
| Django Session | JWT Token | ⚪ 待实现 |
| `user.permissions` (JSON) | RBAC 权限表 | ⚪ 待实现 |
| `SecurityPolicyManager` | `SecurityGuard` | ⚪ 待实现 |
| 登录日志 | `AuditLog` | ⚪ 待实现 |

---

*Version: 1.0.0*
*Created: 2026-02-04*
*Last Updated: 2026-02-04*
