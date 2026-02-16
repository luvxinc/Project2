---
name: security
description: 安全架构师 — Spring Security 6 + OAuth2/OIDC + Vault。负责认证/授权/密钥管理/加密/审计合规/API安全。
---

# 安全与合规规范 — Spring Security + OIDC + Vault

> **你是安全架构师。你的职责是: 设计+实现认证授权体系、密钥管理、数据加密、审计合规。**
> **⚠️ 本文件 ~12KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

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

```
                    ┌──────────────────┐
                    │   WAF + CDN      │ ← DDoS 防护
                    │   (Cloudflare)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   API Gateway    │ ← 限流, IP 黑名单, JWT 验证
                    │   (Kong/APISIX)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Spring Security  │ ← RBAC + ABAC + 4级安全
                    │     6.x          │
                    │                  │
                    │ ┌──────────────┐ │
                    │ │ OAuth2/OIDC  │ │ ← 企业 SSO (Azure AD/Google)
                    │ │ JWT Validator│ │
                    │ └──────────────┘ │
                    │ ┌──────────────┐ │
                    │ │ RBAC Guard   │ │ ← 动态角色权限
                    │ │ L1-L4 Check  │ │
                    │ └──────────────┘ │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Vault          │ ← 密钥/证书/API Key
                    │  (HashiCorp)     │
                    └──────────────────┘
```

---

## 2. 认证 (Authentication)

### 2.1 OAuth2 + OIDC (企业 SSO)

| 场景 | 协议 | 提供者 |
|------|------|--------|
| 企业 SSO | OIDC (OpenID Connect) | Azure AD / Google Workspace / Okta |
| 内部 API | OAuth2 Bearer Token | Spring Authorization Server (自建) |
| 移动端 | PKCE Flow | OIDC + Refresh Token |
| 第三方集成 | Client Credentials | API Key + OAuth2 |

### 2.2 JWT 结构

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.my-app.com",
  "aud": "my-app-api",
  "exp": 1700000000,
  "iat": 1699996400,
  "roles": ["ADMIN", "MODULE_MANAGER"],
  "permissions": ["products:read", "products:write", "module:admin"],
  "tenant": "my-tenant",
  "name": "Aaron",
  "email": "user@example.com"
}
```

### 2.3 Spring Security 配置

```kotlin
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
class SecurityConfig(
    private val jwtDecoder: JwtDecoder,
    private val customAuthConverter: CustomJwtAuthConverter,
) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            csrf { disable() }
            cors { configurationSource = corsConfig() }
            
            authorizeHttpRequests {
                authorize("/api/v1/auth/**", permitAll)
                authorize("/actuator/health", permitAll)
                authorize("/api-docs/**", permitAll)
                authorize("/api/v1/admin/**", hasRole("SUPERUSER"))
                authorize("/api/v1/**", authenticated)
            }
            
            oauth2ResourceServer {
                jwt {
                    decoder = jwtDecoder
                    jwtAuthenticationConverter = customAuthConverter
                }
            }
        }
        return http.build()
    }
}

// 自定义 JWT → Spring Authority 转换
@Component
class CustomJwtAuthConverter : Converter<Jwt, AbstractAuthenticationToken> {
    override fun convert(jwt: Jwt): AbstractAuthenticationToken {
        val roles = jwt.getClaimAsStringList("roles") ?: emptyList()
        val permissions = jwt.getClaimAsStringList("permissions") ?: emptyList()
        
        val authorities = roles.map { SimpleGrantedAuthority("ROLE_$it") } +
                          permissions.map { SimpleGrantedAuthority(it) }
        
        return JwtAuthenticationToken(jwt, authorities, jwt.subject)
    }
}
```

---

## 3. 授权 (Authorization) — 4 级安全模型

### 3.1 安全等级定义

| 等级 | 验证要求 | 操作类型 | 实现方式 |
|------|----------|----------|----------|
| **L1** | Bearer Token | 查询 (GET) | `@PreAuthorize("isAuthenticated()")` |
| **L2** | Token + 密码确认 | 修改 (POST/PUT/DELETE) | 自定义 `@SecurityLevel(2)` 注解 |
| **L3** | Token + 安全码 | 运维级 (备份/批量/迁移) | `@SecurityLevel(3)` + Redis 锁定 |
| **L4** | Token + 系统码 | 核弹级 (清库/权限重配) | `@SecurityLevel(4)` + 双人确认 |

### 3.2 实现

```kotlin
// 自定义安全等级注解
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class SecurityLevel(val level: Int)

// AOP 拦截器
@Aspect
@Component
class SecurityLevelAspect(
    private val securityCodeService: SecurityCodeService,
) {
    @Around("@annotation(securityLevel)")
    fun checkSecurityLevel(pjp: ProceedingJoinPoint, securityLevel: SecurityLevel): Any? {
        val level = securityLevel.level
        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)
            ?.request ?: throw SecurityException("No request context")
        
        // 注意: 必须先检查高等级, 否则低等级分支会先命中
        when {
            level >= 3 -> {
                // L3/L4: 需要密码 + 安全码双重验证
                val password = request.getHeader("X-Security-Password")
                    ?: throw SecurityException("Password required for L$level operation")
                securityCodeService.verifyPassword(password)
                
                val code = request.getHeader("X-Security-Code")
                    ?: throw SecurityException("Security code required for L$level operation")
                securityCodeService.verifyCode(level, code)
            }
            level >= 2 -> {
                // L2: 只需要密码确认
                val password = request.getHeader("X-Security-Password")
                    ?: throw SecurityException("Password required for L$level operation")
                securityCodeService.verifyPassword(password)
            }
        }
        
        return pjp.proceed()
    }
}

// 使用
@RestController
@RequestMapping("/api/v1/admin")
class AdminController {

    @DeleteMapping("/users/{id}")
    @SecurityLevel(3)
    @PreAuthorize("hasRole('SUPERUSER')")
    fun deleteUser(@PathVariable id: UUID) { ... }
    
    @PostMapping("/database/purge")
    @SecurityLevel(4)
    @PreAuthorize("hasRole('SUPERUSER')")
    fun purgeDatabase() { ... }
}
```

---

## 4. 密钥管理 — HashiCorp Vault

### 4.1 存储内容

| Secret | Path | 用途 |
|--------|------|------|
| DB 密码 | `secret/app/database` | PostgreSQL 连接 |
| Redis 密码 | `secret/app/redis` | Redis 连接 |
| Kafka 密钥 | `secret/app/kafka` | Kafka SASL 认证 |
| OIDC Secret | `secret/app/oidc` | SSO 客户端密钥 |
| AES Key | `secret/app/encryption` | 敏感字段加密密钥 |
| SMTP | `secret/app/smtp` | 邮件发送凭证 |
| API Keys | `secret/app/api-keys` | 第三方 API 密钥 |

### 4.2 Spring Vault 集成

```yaml
# bootstrap.yml
spring:
  cloud:
    vault:
      host: vault.my-app.com
      port: 8200
      scheme: https
      authentication: KUBERNETES  # K8s Service Account
      kv:
        enabled: true
        backend: secret
        default-context: app
```

### 4.3 铁律

| 规则 | 说明 |
|------|------|
| **禁止 .env 存储生产密钥** | 所有生产环境密钥必须在 Vault |
| **禁止代码中硬编码密钥** | 零硬编码, 编译期和 CI 检查 |
| **密钥轮换** | 每 90 天自动轮换 DB/Redis 密码 |
| **最小权限** | 每个服务只能访问自己需要的 Secret Path |

---

## 5. 数据加密

### 5.1 传输加密

| 通道 | 协议 | 要求 |
|------|------|------|
| 前端 ↔ API Gateway | TLS 1.3 | 强制 HTTPS, HSTS |
| API Gateway ↔ Spring Boot | mTLS (可选) | 内网也加密 |
| Spring Boot ↔ PostgreSQL | TLS | SSL 连接 |
| Spring Boot ↔ Redis | TLS | SSL 连接 |
| Spring Boot ↔ Kafka | SASL_SSL | 认证 + 加密 |

### 5.2 静态加密

```kotlin
// 敏感字段 AES-256 加密 (Hibernate AttributeConverter)
@Converter
class AesEncryptConverter : AttributeConverter<String, String> {
    
    // 密钥从 Vault 注入
    @Value("\${encryption.aes-key}")
    private lateinit var aesKey: String
    
    override fun convertToDatabaseColumn(attribute: String?): String? {
        return attribute?.let { AesUtil.encrypt(it, aesKey) }
    }
    
    override fun convertToEntityAttribute(dbData: String?): String? {
        return dbData?.let { AesUtil.decrypt(it, aesKey) }
    }
}

// 使用
@Entity
class Employee {
    @Convert(converter = AesEncryptConverter::class)
    val ssn: String  // 社会安全号 — 加密存储
    
    @Convert(converter = AesEncryptConverter::class)
    val bankAccount: String  // 银行账号 — 加密存储
}
```

---

## 6. 审计合规 (SOX / SOC2)

### 6.1 不可篡改审计日志

```kotlin
// 审计日志表 — Append-only, 不可 UPDATE/DELETE
@Entity
@Table(name = "audit_trail")
@Immutable  // Hibernate: 禁止修改
class AuditTrailEntry(
    @Id val id: UUID = UUID.randomUUID(),
    val timestamp: Instant = Instant.now(),
    val userId: UUID,
    val userName: String,
    val action: String,          // CREATE / UPDATE / DELETE / LOGIN / EXPORT
    val module: String,          // users / products / orders / finance
    val resourceType: String,    // product / purchase_order / ...
    val resourceId: String,
    @Column(columnDefinition = "JSONB")
    val before: String?,         // 变更前快照 (JSON)
    @Column(columnDefinition = "JSONB")
    val after: String?,          // 变更后快照 (JSON)
    val ipAddress: String,
    val userAgent: String?,
    val traceId: String?,        // OTel trace ID
    val signature: String,       // HMAC-SHA256 签名 (防篡改)
)
```

### 6.2 签名验证

```kotlin
// 每条审计日志都有 HMAC 签名
fun sign(entry: AuditTrailEntry, secretKey: String): String {
    val payload = "${entry.id}|${entry.timestamp}|${entry.userId}|${entry.action}|${entry.resourceId}"
    return HmacUtils.hmacSha256Hex(secretKey, payload)
}

// 验证: 任何时候都可以验证日志是否被篡改
fun verify(entry: AuditTrailEntry, secretKey: String): Boolean {
    return sign(entry, secretKey) == entry.signature
}
```

### 6.3 合规检查清单

| 要求 | 实现 | 状态 |
|------|------|------|
| 所有写操作记录审计日志 | Spring AOP `@Auditable` | 📋 规划 |
| 审计日志不可篡改 | `@Immutable` + HMAC 签名 | 📋 规划 |
| 敏感数据脱敏 | `@SensitiveField` 注解 + 日志过滤 | 📋 规划 |
| 数据访问可追溯 | OTel trace ID 贯穿全链路 | 📋 规划 |
| 密钥集中管理 | Vault + 90 天轮换 | 📋 规划 |
| 登录失败锁定 | Redis 计数器 + 阈值锁定 | 📋 规划 |
| 权限最小化 | RBAC + Column-level ACL | 📋 规划 |
| 数据导出审计 | 所有 Export 操作记录 | 📋 规划 |

---

## 7. API 安全

### 7.1 API Gateway 层

| 防护 | 技术 | 配置 |
|------|------|------|
| **限流** | Kong Rate Limiting | 1000 req/min per user |
| **IP 黑名单** | Kong IP Restriction | 自动 + 手动 |
| **JWT 验证** | Kong JWT Plugin | 提前验证, 减轻后端压力 |
| **CORS** | Kong CORS | 白名单域名 |
| **请求大小** | Kong Request Size | 10MB max |
| **WAF** | Cloudflare WAF Rules | SQL Injection / XSS |

### 7.2 应用层

| 防护 | 实现 |
|------|------|
| **输入验证** | Jakarta Validation (`@Valid`) |
| **SQL 注入** | JPA 参数化查询 (Hibernate 自动处理) |
| **XSS** | Jackson HTML 转义 + CSP Header |
| **CSRF** | API-only, 无状态 Token |
| **Path Traversal** | Spring Security 默认防护 |
| **Sensitive Header** | `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` |

---

## 8. L3 工具库引用 (按需加载)

| 场景 | 工具 | 路径 | 说明 |
|------|------|------|------|
| 安全代码审查 | ECC: Review | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | 安全反模式 (注入/泄漏/权限绕过) |
| 编码规范 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | 输入验证/错误处理强制规则 |

---

*Version: 1.1.0 — 含 L3 工具引用*
*Based on: battle-tested enterprise patterns*
