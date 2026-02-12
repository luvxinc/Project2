# 🔨 任务分配: V3 功能一致性修复

来源: PM 需求文档 `projects/mgmt/data/specs/V3_PARITY_FIX_SPEC.md`
复杂度: L (15+ 文件, 跨模块, 安全变更)
分配时间: 2026-02-12 03:40

---

## 执行顺序 (依赖排序)

```
T1 (F3 权限基础设施) → T2 (F2 审计日志基础设施) → T3 (F4 限流) → T4 (F5 PDF 修复) → T5 (F8 Logs 行为修复)
```

T1-T2 是基础设施, 其他任务依赖它们。T3/T4/T5 可平行。

---

## 子任务

| # | 任务 | Finding | 文件 | 依赖 | 状态 |
|---|------|---------|------|------|------|
| T1 | 权限注解 + AOP 拦截器 | F3 | 新建 2 文件 + 修改 8 控制器 | — | ✅ 完成 |
| T2 | 审计日志 AOP 拦截器 | F2 | 新建 2 文件 + 修改 8 控制器 | — | ✅ 完成 |
| T3 | Redis 限流拦截器 | F4 | 新建 2 文件 + 修改 AuthController | T1 | ✅ 完成 |
| T4 | Receiving PDF 单产品修复 | F5 | 修改 VmaInventoryController.kt | — | ✅ 完成 (上一轮) |
| T5 | Logs 模块行为一致性 | F8 | 修改 LogController.kt | T1, T2 | ⬜ |

---

## T1: 权限注解 + AOP 拦截器 (F3)

### 需要创建的文件:

**1. `common/security/RequirePermission.kt`** — 自定义注解
```kotlin
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequirePermission(val value: String)
```

**2. `common/security/PermissionCheckAspect.kt`** — AOP 拦截器
- 从 SecurityContext 获取 Authentication
- 从 JWT claims 中读取 `permissions` 字段
- 检查是否有目标权限
- 无权限 → 抛出 `ForbiddenException`

### 需要修改的控制器 (添加 `@RequirePermission`):

| 控制器 | 权限 key | 应用于 |
|--------|---------|--------|
| VmaController | `vma.employees.manage` | 全部端点 |
| VmaTrainingController | `vma.training_sop.manage` (SOP 端点) / `vma.training.manage` (Record 端点) | 按端点分 |
| VmaClinicalCaseController | `vma.employees.manage` | 全部 |
| VmaInventoryController | `vma.employees.manage` | 全部 |
| VmaPValveProductController | `vma.employees.manage` | 全部 |
| VmaSiteController | `vma.employees.manage` | 全部 |
| ProductController | `products.catalog.*` | 按端点分 |
| RoleController | (keep existing @PreAuthorize) | — |

---

## T2: 审计日志 AOP 拦截器 (F2)

### 需要创建的文件:

**1. `common/logging/AuditLog.kt`** — 注解
```kotlin
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class AuditLog(
    val module: String,
    val action: String,
    val riskLevel: String = "MEDIUM",
)
```

**2. `common/logging/AuditLogAspect.kt`** — AOP 拦截器
- 在方法成功执行后 (`@AfterReturning`) 写 business log
- DELETE 操作同时写 audit log
- 从 SecurityContext 获取 userId + username
- 从 HttpServletRequest 获取 IP + path
- 调用现有 log repository 写入

### 需要修改的控制器 (添加 `@AuditLog`):

所有 CUD (POST, PATCH, DELETE) 端点都需要标注。

---

## T3: Redis 限流拦截器 (F4)

### 需要创建的文件:

**1. `common/security/RateLimit.kt`** — 注解
```kotlin
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RateLimit(
    val limit: Int,
    val windowSeconds: Int,
    val keyPrefix: String = "",
)
```

**2. `common/security/RateLimitAspect.kt`** — AOP 拦截器
- 使用 Redis `INCR + EXPIRE` 实现滑动窗口
- key = `rate:{prefix}:{ip}` 或 `rate:{prefix}:{userId}`
- 超过限制 → 抛出 `TooManyRequestsException` (HTTP 429)

### 需要修改的文件:
- `AuthController.kt`: login → `@RateLimit(limit = 5, windowSeconds = 60)`
- `AuthController.kt`: verify-security → `@RateLimit(limit = 3, windowSeconds = 300)`
- `common/exception/Exceptions.kt`: 添加 `TooManyRequestsException`

---

## T4: Receiving PDF 单产品修复 (F5) ★优先

### 修改文件: `VmaInventoryController.kt`

**当前代码 (V3, 错误):**
```kotlin
@GetMapping("/inventory-transactions/receive-pdf/{id}")
fun getReceivePdf(@PathVariable id: String): ResponseEntity<ByteArray> {
    val txn = invService.findOne(id)
    val batchNo = txn.batchNo ?: return ResponseEntity.notFound().build()
    val batch = invService.findBatchByBatchNo(batchNo) ?: return ResponseEntity.notFound().build()
    val siblings = invService.findAllByBatchNo(batchNo)  // ← 错：加载整批
    val pdfBytes = receivingPdfService.generateReceivingPdf(batch, siblings)  // ← 错：多页
    val filename = "receiving_inspection_${batch.batchNo}.pdf"  // ← 错：batch 文件名
    ...
}
```

**修复后 (V2 行为):**
```kotlin
@GetMapping("/inventory-transactions/receive-pdf/{id}")
fun getReceivePdf(@PathVariable id: String): ResponseEntity<ByteArray> {
    val txn = invService.findOne(id)
    val batchNo = txn.batchNo ?: return ResponseEntity.notFound().build()
    val batch = invService.findBatchByBatchNo(batchNo) ?: return ResponseEntity.notFound().build()
    
    // V2 parity: 只生成该单条事务的 1 页 PDF
    val pdfBytes = receivingPdfService.fillOnePdf(batch, txn)
    val dateReceived = batch.dateReceived?.format(DateTimeFormatter.ISO_LOCAL_DATE) ?: ""
    val filename = "receiving_inspection_${txn.specNo}_${txn.serialNo ?: "N-A"}_${dateReceived}.pdf"
    ...
}
```

### 需要确认:
- `invService.findOne(id)` 返回的实体 (`VmaInventoryTransaction`) 是否有 `specNo` 和 `serialNo` 字段 → 是 (已确认 in entity)

---

## T5: Logs 模块行为一致性 (F8)

### 修改文件: `LogController.kt`

| # | 功能缺失 | V2 行为 | V3 修复方式 |
|---|----------|---------|-------------|
| 5a | God Mode unlock 验证 L3 安全码 | `securityService.verifySecurityCode('L3')` | 注入 SecurityService, 接受 `@RequestBody securityCode` |
| 5b | God Mode 操作写审计日志 | `logWriter.logAudit(...)` 成功+失败 | 使用 `@AuditLog` 注解 (依赖 T2) |
| 5c | Log 查询 God Mode 脱敏 | `godModeService.maskLogRecord()` on errors/audits/business/access | 在每个查询方法中加入 mask 逻辑 |
| 5d | Export 写审计日志 | `logWriter.logAudit(...)` | 使用 `@AuditLog` 注解 |
| 5e | Maintenance/Archive 验证 superadmin + L4 | `requireSuperadmin(req)` + `verifyL4SecurityCode()` | 添加 `@PreAuthorize` + L4 验证 |
| 5f | Error trend 路由 | V2: `GET /logs/error-trend` (前端未用) | V3: `GET /logs/trend` → 检查前端是否调用 |

---

## 协作要求

- T1 + T2 可并行 (无依赖)
- T3 依赖 T1 (需要注解基础设施)
- T4 独立，可先执行 (★用户标记为重点)
- T5 依赖 T1 + T2 (需要权限 + 审计日志基础设施)

---

*CTO 任务分配 v1.0 — 2026-02-12*
