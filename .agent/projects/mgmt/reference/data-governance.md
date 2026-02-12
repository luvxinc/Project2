---
description: 数据治理框架 — 数据分类, PII 保护, 留存策略, 脱敏, GDPR/CCPA
---

# 数据治理框架 (Data Governance)

> **核心原则**: 数据是企业最重要的资产, 必须有清晰的分类、保护、和生命周期管理。
> **合规框架**: SOX + SOC2 + GDPR (如服务欧盟用户) + CCPA (加州)
> **权威规范**: `core/skills/security.md`

---

## 1. 数据分类

| 级别 | 分类 | 示例 | 保护要求 |
|------|------|------|----------|
| **L4 — 机密** | 密钥、密码哈希 | JWT Secret, 安全码哈希, Vault Token | 加密存储, 最小权限, 审计全记录 |
| **L3 — 敏感** | PII, 财务数据 | 员工 SSN/手机号, 交易金额, 银行信息 | 加密存储, 访问日志, 脱敏展示 |
| **L2 — 内部** | 业务数据 | 产品 SKU, 库存量, 采购单号 | 需认证访问 |
| **L1 — 公开** | 非敏感信息 | 公司名称, 公告信息 | 无特殊保护 |

---

## 2. PII (个人可识别信息) 保护

### 2.1 PII 字段清单

| 模块 | 字段 | 保护措施 |
|------|------|----------|
| Users | `email` | 数据库加密 (PG TDE) |
| Users | `phone` | 数据库加密, 展示时脱敏 (****1234) |
| Employees (VMA) | `ssn` | AES-256 应用层加密, 只存加密后的值 |
| Employees (VMA) | `date_of_birth` | 访问需 L2 权限 |
| Finance | `bank_account` | AES-256 加密, 展示时脱敏 |
| Audit Logs | `ip_address` | 保留 180 天后匿名化 |

### 2.2 加密策略

```kotlin
// 应用层 PII 加密 (AES-256-GCM)
@Converter
class EncryptedStringConverter(
    @Value("\${encryption.key}") private val key: String,
) : AttributeConverter<String, String> {

    override fun convertToDatabaseColumn(attribute: String?): String? {
        return attribute?.let { AesGcmEncryptor.encrypt(it, key) }
    }

    override fun convertToEntityAttribute(dbData: String?): String? {
        return dbData?.let { AesGcmEncryptor.decrypt(it, key) }
    }
}

// Entity 使用
@Entity
class Employee {
    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "ssn_encrypted")
    var ssn: String? = null
}
```

---

## 3. 数据留存策略

| 数据类型 | 留存周期 | 到期动作 | 依据 |
|----------|----------|----------|------|
| **交易记录** | 7 年 | 归档到冷存储 | SOX 合规 |
| **审计日志** | 永久 (Append-Only) | 不删除 | SOX + SOC2 |
| **访问日志** | 180 天 | 删除或匿名化 | 运维需求 |
| **错误日志** | 90 天 | 删除 | 运维需求 |
| **会话数据 (Redis)** | 24 小时 | 自动过期 | 安全 |
| **临时文件 (MinIO)** | 7 天 | 自动清理 | 存储成本 |
| **备份文件** | 90 天 (全量), 7 天 (WAL) | 自动删除旧备份 | DR 需求 |
| **ClickHouse 分析数据** | 3 年 | 归档分区 | 分析需求 |

### 自动清理 (Spring Scheduler)

```kotlin
@Scheduled(cron = "0 0 3 * * *")  // 每天 3:00 AM PST
fun cleanExpiredData() {
    accessLogRepository.deleteOlderThan(180.days.ago())
    errorLogRepository.deleteOlderThan(90.days.ago())
    minioClient.removeExpiredObjects("erp-temp", 7.days)
    logger.info("Expired data cleanup completed")
}
```

---

## 4. 非生产环境数据脱敏

| 字段 | 原始值 | 脱敏后 |
|------|--------|--------|
| `email` | john@example.com | user_12345@anonymized.local |
| `phone` | 555-123-4567 | 555-XXX-XXXX |
| `ssn` | 123-45-6789 | XXX-XX-XXXX |
| `name` | John Smith | Employee_12345 |
| `bank_account` | 1234567890 | XXXXXXXXXX |
| `ip_address` | 192.168.1.100 | 0.0.0.0 |

```sql
-- 脱敏脚本 (只在非生产环境运行!)
UPDATE users SET
    email = CONCAT('user_', id::text, '@anonymized.local'),
    phone = 'XXX-XXX-XXXX'
WHERE environment() != 'production';
```

---

## 5. GDPR / CCPA 合规

### Right to Be Forgotten (被遗忘权)

```kotlin
@Service
class DataDeletionService {
    @Transactional
    fun deleteUserData(userId: UUID) {
        // 1. 匿名化个人数据 (不能删除交易记录 — SOX)
        userRepository.anonymize(userId)  // email/phone/name → anonymized

        // 2. 删除非必要数据
        notificationRepository.deleteByUserId(userId)
        sessionRepository.deleteByUserId(userId)

        // 3. 记录审计日志
        auditLogService.log("USER_DATA_DELETED", userId, "GDPR request processed")

        // 4. 通知下游系统
        kafkaTemplate.send("erp.gdpr.data-deletion", userId.toString())
    }
}
```

---

## 6. 数据血缘 (Data Lineage)

```
PostgreSQL (源头)
    ├── products 表 ──→ Kafka (erp.cdc.products) ──→ OpenSearch (erp_products 索引)
    ├── sales 表 ─────→ Kafka (erp.cdc.sales) ────→ ClickHouse (sales_facts 表)
    └── audit_logs ───→ Kafka (erp.cdc.audit) ────→ MinIO (audit-archive bucket)
```

每条数据都可追溯: 谁创建 → 谁修改 → 哪些系统消费 → 最终存储在哪里。

---

*Version: 1.0.0 — 2026-02-11*
