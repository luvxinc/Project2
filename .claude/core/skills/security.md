---
name: security
description: 安全架构师 SOP（认证授权 + 密钥管理 + 数据加密）。Use when 需要认证授权、密钥管理、加密、审计合规与 API 安全。
---

# 安全与合规规范 — 认证授权 + 密钥管理 + 加密合规

> **你是安全架构师。你的职责是: 设计+实现认证授权体系、密钥管理、数据加密、审计合规。**
> **技术栈**: 见 `CONTEXT.md §3 后端技术栈`，不同项目选用对应框架实现。

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `架构`, `总览`, `安全层` | → §1 安全架构总览 |
| `认证`, `SSO`, `OIDC`, `JWT`, `登录` | → §2 认证 |
| `授权`, `RBAC`, `安全等级`, `L1-L4` | → §3 授权 |
| `vault`, `密钥`, `secret`, `证书` | → §4 密钥管理 |
| `加密`, `AES`, `TLS`, `mTLS` | → §5 数据加密 |
| `审计`, `SOX`, `SOC2`, `合规`, `HMAC` | → §6 审计合规 |
| `API安全`, `限流`, `WAF`, `CORS` | → §7 API 安全 |

---

> **企业级安全最佳实践: SOX/SOC2 审计就绪, SSO, 不可篡改审计追踪。**

---

## 1. 安全架构总览

流量路径：**WAF/CDN**（DDoS 防护）→ **API Gateway**（限流/IP 黑名单/JWT 预验证）→ **后端认证层**（OAuth2/OIDC + RBAC + L1-L4 安全等级）→ **密钥管理**（Secret Manager/Vault）。

> **具体技术选型**: 见 `CONTEXT.md §3 后端技术栈`（API Gateway / Auth 框架 / Secret Manager）。

---

## 2. 认证 (Authentication)

### 2.1 OAuth2 + OIDC (企业 SSO)

| 场景 | 协议 | 提供者 |
|------|------|--------|
| 企业 SSO | OIDC (OpenID Connect) | Azure AD / Google Workspace / Okta |
| 内部 API | OAuth2 Bearer Token | 自建 Authorization Server |
| 移动端 | PKCE Flow | OIDC + Refresh Token |
| 第三方集成 | Client Credentials | API Key + OAuth2 |

### 2.2 JWT 结构

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.{domain}.com",
  "aud": "{app}-api",
  "exp": 1700000000,
  "iat": 1699996400,
  "roles": ["ADMIN", "MODULE_MANAGER"],
  "permissions": ["products:read", "products:write"],
  "tenant": "{tenant-id}",
  "name": "User Name",
  "email": "user@example.com"
}
```

### 2.3 JWT Resource Server 配置模式

> **认证框架实现**: 见 `CONTEXT.md §3 后端技术栈`，按当前框架实现以下模式。

```
路由规则:
  公开路径: /api/v*/auth/**, /{health_path} → 无需认证
  管理员路径: /api/v*/admin/** → 需要 SUPERUSER 角色
  其余路径: /api/v*/** → 需要有效 Bearer Token

JWT 验证流程:
  1. 从 Authorization Header 提取 Bearer Token
  2. 验证签名（JWK 端点 或 本地密钥）
  3. 提取 claims: roles → 角色列表, permissions → 细粒度权限
  4. 构建 Security Context 供后续鉴权使用

CORS 配置:
  - 允许域名从配置文件读取（不硬编码）
  - 允许 Header: Authorization, Content-Type, X-Security-Password, X-Security-Code
```

---

## 3. 授权 (Authorization) — 4 级安全模型

### 3.1 安全等级定义

| 等级 | 验证要求 | 操作类型 | 实现方式 |
|------|----------|----------|----------|
| **L1** | Bearer Token | 查询 (GET) | 标准认证中间件 |
| **L2** | Token + 密码确认 | 修改 (POST/PUT/DELETE) | `X-Security-Password` Header |
| **L3** | Token + 安全码 | 运维级 (备份/批量/迁移) | `X-Security-Code` Header + 分布式锁 |
| **L4** | Token + 系统码 | 核弹级 (清库/权限重配) | 双人确认 |

### 3.2 安全等级拦截模式

> **框架实现**: 见 `CONTEXT.md §3`，使用当前框架的 Middleware/Filter/Aspect/Interceptor 实现。

```
拦截器注册到所有 API 处理器:

当处理器标注 SecurityLevel >= 2 时:
  从请求 Header 提取 X-Security-Password
  调用 SecurityCodeService.verifyPassword()
  验证失败 → 返回 403

当处理器标注 SecurityLevel >= 3 时:
  额外提取 X-Security-Code
  调用 SecurityCodeService.verifyCode(level, code)
  验证失败 → 返回 403
  验证通过 → 获取分布式锁（防并发重复操作）

用法: @SecurityLevel(3) + 管理员角色检查 → 运维级操作
```

---

## 4. 密钥管理 — HashiCorp Vault / Secret Manager

### 4.1 存储内容

| Secret | Path | 用途 |
|--------|------|------|
| DB 密码 | `secret/{app}/database` | 数据库连接 |
| 缓存密码 | `secret/{app}/cache` | Redis/缓存连接 |
| MQ 密钥 | `secret/{app}/messaging` | 消息队列 SASL 认证 |
| OIDC Secret | `secret/{app}/oidc` | SSO 客户端密钥 |
| 加密密钥 | `secret/{app}/encryption` | 敏感字段加密密钥 |
| API Keys | `secret/{app}/api-keys` | 第三方 API 密钥 |

### 4.2 Vault 集成模式

> **集成框架**: 见 `CONTEXT.md §3 后端技术栈`，按当前框架配置 Vault 客户端。

```yaml
# Vault 集成核心配置（伪配置，具体格式见框架文档）
vault:
  host: vault.{domain}.com
  port: 8200
  scheme: https
  authentication: KUBERNETES   # K8s Service Account 认证（推荐）
  kv:
    enabled: true
    backend: secret
    default-context: {app-name}
```

### 4.3 铁律

| 规则 | 说明 |
|------|------|
| **禁止 .env 存储生产密钥** | 所有生产环境密钥必须在 Vault |
| **禁止代码中硬编码密钥** | 零硬编码, 编译期和 CI 检查 |
| **密钥轮换** | 每 90 天自动轮换 DB/缓存密码 |
| **最小权限** | 每个服务只能访问自己需要的 Secret Path |

---

## 5. 数据加密

### 5.1 传输加密

| 通道 | 协议 | 要求 |
|------|------|------|
| 前端 ↔ API Gateway | TLS 1.3 | 强制 HTTPS, HSTS |
| API Gateway ↔ 后端 | mTLS (可选) | 内网也加密 |
| 后端 ↔ 数据库 | TLS | SSL 连接 |
| 后端 ↔ 缓存 | TLS | SSL 连接 |
| 后端 ↔ 消息队列 | SASL_SSL | 认证 + 加密 |

### 5.2 静态加密（字段级）

> **实现**: 见 `CONTEXT.md §3 ORM 框架`，使用 ORM 的 AttributeConverter/Transform 机制。

```
字段加密模式 (Transparent Encryption):
  存储前: plaintext → encrypt(AES-256, key_from_vault) → ciphertext
  读取后: ciphertext → decrypt(AES-256, key_from_vault) → plaintext
  密钥注入: 从 Vault 读取，不在代码中硬编码

标注需加密的字段: @Encrypted / @Convert(EncryptConverter)
适用场景: SSN / 银行账号 / 合同内容 / PII 数据
```

---

## 6. 审计合规 (SOX / SOC2)

### 6.1 审计日志 Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `timestamp` | TIMESTAMPTZ | 发生时间（UTC） |
| `user_id` | UUID | 操作人 ID |
| `user_name` | VARCHAR | 操作人名称 |
| `action` | VARCHAR | CREATE/UPDATE/DELETE/LOGIN/EXPORT |
| `module` | VARCHAR | 业务模块 |
| `resource_type` | VARCHAR | 操作资源类型 |
| `resource_id` | VARCHAR | 操作资源 ID |
| `before` | JSONB/JSON | 变更前快照 |
| `after` | JSONB/JSON | 变更后快照 |
| `ip_address` | VARCHAR | 客户端 IP |
| `trace_id` | VARCHAR | 分布式追踪 ID |
| `signature` | VARCHAR | HMAC-SHA256 防篡改签名 |

> **实现**: Append-only 表（禁止 UPDATE/DELETE），见 `CONTEXT.md §3 数据库`。

### 6.2 HMAC 签名验证

```
签名:
  payload = "{id}|{timestamp}|{user_id}|{action}|{resource_id}"
  signature = HMAC-SHA256(payload, vault_secret_key)

验证:
  recompute_sig = HMAC-SHA256(payload, vault_secret_key)
  tampered = (recompute_sig != stored_signature)
```

### 6.3 合规检查清单

| 要求 | 实现 | 状态 |
|------|------|------|
| 所有写操作记录审计日志 | AOP/Middleware `@Auditable` 注解 | 📋 规划 |
| 审计日志不可篡改 | Append-only + HMAC 签名 | 📋 规划 |
| 敏感数据脱敏 | `@SensitiveField` 注解 + 日志过滤 | 📋 规划 |
| 数据访问可追溯 | 分布式 Trace ID 贯穿全链路 | 📋 规划 |
| 密钥集中管理 | Vault + 90 天轮换 | 📋 规划 |
| 登录失败锁定 | 缓存计数器 + 阈值锁定 | 📋 规划 |
| 权限最小化 | RBAC + Column-level ACL | 📋 规划 |
| 数据导出审计 | 所有 Export 操作记录 | 📋 规划 |

---

## 7. API 安全

### 7.1 API Gateway 层

| 防护 | 技术 | 配置 |
|------|------|------|
| **限流** | API Gateway Rate Limiting | 1000 req/min per user |
| **IP 黑名单** | API Gateway IP Restriction | 自动 + 手动 |
| **JWT 验证** | API Gateway JWT Plugin | 提前验证, 减轻后端压力 |
| **CORS** | API Gateway CORS | 白名单域名 |
| **请求大小** | API Gateway Request Size | 10MB max |
| **WAF** | Cloudflare / WAF Rules | SQL Injection / XSS |

> **API Gateway 选型**: 见 `CONTEXT.md §3 基础设施`

### 7.2 应用层

| 防护 | 实现 |
|------|------|
| **输入验证** | Schema 校验框架（Bean Validation / Zod / Pydantic 等） |
| **SQL 注入** | ORM 参数化查询（禁止字符串拼接 SQL） |
| **XSS** | 输出编码 + CSP Header |
| **CSRF** | API-only, 无状态 Token |
| **Path Traversal** | 框架默认防护 + 路径校验 |
| **安全 Header** | `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` |

---

---

*Version: 3.0.0 — L1 泛化*
*Updated: 2026-02-19*
