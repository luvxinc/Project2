# 实施方案: 安全等级系统

> **L1 security.md → MGMT L1-L4 安全等级的项目实施指南**

---

## 1. MGMT 安全模型

MGMT 不用标准 RBAC, 而是在 RBAC 之上叠加了 **4 级安全等级**:

```
L1 (查询)  →  L2 (修改)  →  L3 (运维)  →  L4 (核弹)
Bearer Token   Token+密码    Token+安全码    Token+系统码
GET 请求       POST/PUT/DEL  备份/批量/迁移   清库/权限重配
```

### 用 L1 通用 SOP的方式

| L1 security.md 泛化 | MGMT 具体用法 |
|---------------------|-------------|
| `@PreAuthorize` | V3: `@SecurityLevel(3)` 自定义注解 |
| RBAC 角色 | 3 角色: User / Admin / Superuser |
| 密钥管理 | V2: 数据库 `security_codes` 表; V3: Vault |
| Redis 锁定 | 密码错误 5 次 → 锁定 15 分钟 |
| 审计日志 | 所有 L2+ 操作写入 `audit_logs` 表 |

---

## 2. V2 当前实现 (NestJS)

```typescript
// 安全码验证 (后端)
@Post('verify-security-code')
async verifySecurityCode(@Body() dto: { level: number; code: string }) {
  const stored = await this.prisma.securityCode.findFirst({ where: { level: dto.level } });
  if (stored.code !== dto.code) throw new ForbiddenException();
}

// 前端: 安全码弹窗
<SecurityCodeModal
  level={3}
  onVerify={(code) => api.verifySecurityCode(3, code)}
  onSuccess={() => performDangerousAction()}
/>
```

---

## 3. V3 目标实现 (Spring Boot)

```kotlin
// 注解式安全等级
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@PreAuthorize("hasRole('ADMIN')")  // 基础 RBAC
annotation class SecurityLevel(val level: Int)

// 使用
@SecurityLevel(3)
@PostMapping("/backup")
fun createBackup(): ApiResponse<BackupResult> { ... }

// AOP 拦截器: 检查 security code header
@Aspect
@Component
class SecurityLevelAspect {
    @Around("@annotation(securityLevel)")
    fun check(joinPoint: ProceedingJoinPoint, securityLevel: SecurityLevel): Any? {
        val code = request.getHeader("X-Security-Code")
        verifyCode(securityLevel.level, code)
        auditLog(securityLevel.level, joinPoint)
        return joinPoint.proceed()
    }
}
```

---

## 4. 操作矩阵

| 操作 | 等级 | 谁能做 |
|------|------|--------|
| 查看列表 | L1 | 所有登录用户 |
| 创建/编辑记录 | L2 | Admin, Superuser |
| 删除记录 | L2 | Admin, Superuser |
| 数据库备份 | L3 | Superuser |
| 批量导入/导出 | L3 | Superuser |
| 角色权限修改 | L4 | Superuser |
| 清库/重置 | L4 | Superuser |
| 安全码修改 | L4 | Superuser |

---

*Security Recipe v1.0*
