---
description: 配置中心 — Spring Profiles, Vault 动态密钥, 运行时配置, 密钥轮转
---

# 配置中心 (Configuration Management)

> **原则**: 配置与代码分离, 密钥零明文, 支持运行时热更新。
> **技术**: Spring Boot Profiles + HashiCorp Vault + Spring Cloud Config (可选)
> **权威规范**: `core/skills/infrastructure.md`

---

## 1. 配置层次

```
优先级 (高 → 低):
    1. 环境变量 (K8s Secret / ConfigMap)
    2. Vault 动态密钥
    3. application-{profile}.yml
    4. application.yml
```

---

## 2. 环境隔离 (Spring Profiles)

| Profile | 用途 | 数据库 | 日志级别 |
|---------|------|--------|----------|
| `local` | 本地开发 | Docker Compose PG | DEBUG |
| `dev` | 开发服务器 | 开发数据库 | DEBUG |
| `staging` | 预发布 | Staging 数据库 (脱敏) | INFO |
| `prod` | 生产 | 生产数据库 | WARN |

```yaml
# application-prod.yml
spring:
  datasource:
    url: ${DB_URL}           # 来自 K8s Secret
    username: ${DB_USER}     # 来自 Vault
    password: ${DB_PASS}     # 来自 Vault
  jpa:
    show-sql: false
    hibernate:
      ddl-auto: none         # 生产禁止自动 DDL!
logging:
  level:
    root: WARN
    com.mgmt.erp: INFO
```

---

## 3. HashiCorp Vault 集成

### 3.1 密钥存储结构

```
vault kv put secret/mgmt-erp/prod \
    db.url=jdbc:postgresql://prod-db:5432/mgmt_erp \
    db.username=erp_app \
    db.password=<GENERATED> \
    jwt.secret=<GENERATED> \
    redis.password=<GENERATED> \
    kafka.sasl.password=<GENERATED> \
    smtp.password=<GENERATED> \
    minio.access-key=<GENERATED> \
    minio.secret-key=<GENERATED> \
    encryption.key=<GENERATED>
```

### 3.2 Spring Cloud Vault

```kotlin
// build.gradle.kts
implementation("org.springframework.cloud:spring-cloud-starter-vault-config")
```

```yaml
# bootstrap.yml
spring:
  cloud:
    vault:
      host: vault.internal
      port: 8200
      scheme: https
      authentication: KUBERNETES  # K8s ServiceAccount 自动认证
      kv:
        enabled: true
        backend: secret
        default-context: mgmt-erp
        profile-separator: /
```

### 3.3 动态数据库凭证

Vault 可以为每个 Pod 生成独立的短期 DB 凭证:

```hcl
# Vault Database Secret Engine
resource "vault_database_secret_backend_role" "erp_app" {
  backend             = vault_mount.postgres.path
  name                = "erp-app-role"
  db_name             = vault_database_secret_backend_connection.postgres.name
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    "GRANT erp_app_role TO \"{{name}}\";"
  ]
  default_ttl = 3600     # 1 小时自动过期
  max_ttl     = 86400    # 最长 24 小时
}
```

---

## 4. 密钥轮转策略

| 密钥类型 | 轮转频率 | 方式 |
|----------|----------|------|
| DB 密码 | 每小时 (动态) | Vault Dynamic Secrets |
| JWT Secret | 每 90 天 | 双密钥平滑切换 |
| Redis 密码 | 每 90 天 | 手动 + 重新部署 |
| API Key (外部) | 每 180 天 | 手动更新 Vault |
| TLS 证书 | 每 365 天 | cert-manager 自动续期 |
| 加密密钥(AES) | 每 365 天 | Key Versioning (新数据用新 Key) |

### JWT 双密钥切换

```kotlin
// 支持多个有效的 JWT Secret
@ConfigurationProperties("jwt")
class JwtProperties {
    lateinit var currentSecret: String
    var previousSecret: String? = null  // 轮转期间旧 secret 仍有效
    var expirationMs: Long = 86400000
}

// 验证时尝试两个 key
fun validateToken(token: String): Claims? {
    return tryParse(token, jwtProperties.currentSecret)
        ?: jwtProperties.previousSecret?.let { tryParse(token, it) }
}
```

---

## 5. 运行时动态配置

对于需要运行时修改的非密钥配置 (如功能开关阈值):

| 方案 | 适用场景 | 推荐 |
|------|----------|------|
| Unleash (Feature Flags) | 功能开关 | ✅ 已有 (reference/feature-flags.md) |
| DB 配置表 | 业务配置 (阈值、限额) | ✅ 推荐 |
| Spring Cloud Config | 大量配置热更新 | 可选 (增加复杂度) |

```sql
-- 业务配置表
CREATE TABLE system_configs (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 示例
INSERT INTO system_configs VALUES
    ('inventory.low_threshold', '10', '库存低于此值触发告警'),
    ('purchase.auto_approve_limit', '1000', '低于此金额自动审批'),
    ('session.timeout_minutes', '480', '会话超时时间');
```

---

## 6. 配置审计

所有配置变更记录审计日志:

```kotlin
@Service
class ConfigService(
    private val configRepository: SystemConfigRepository,
    private val auditService: AuditService,
) {
    @Transactional
    fun updateConfig(key: String, newValue: String, updatedBy: UUID) {
        val old = configRepository.findByKey(key)
        configRepository.save(old.copy(value = newValue, updatedBy = updatedBy))

        auditService.log(
            action = "CONFIG_UPDATED",
            details = mapOf("key" to key, "old" to old.value, "new" to newValue),
            userId = updatedBy
        )
    }
}
```

---

*Version: 1.0.0 — 2026-02-11*
