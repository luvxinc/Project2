package com.mgmt.common.logging

/**
 * AuditLog — method-level audit logging annotation.
 *
 * V2 parity: `LogWriterService.logBusiness()` + `logAudit()` calls in NestJS controllers.
 * Applied to CUD controller methods. Processed by [AuditLogAspect].
 *
 * After successful execution, writes:
 *   - business_log entry (always)
 *   - audit_log entry (for DELETE/security operations, or when riskLevel >= HIGH)
 *
 * @param module The module name, e.g. "VMA", "PRODUCTS"
 * @param action The action name, e.g. "CREATE_EMPLOYEE", "DELETE_DEPARTMENT"
 * @param riskLevel Risk level: "LOW", "MEDIUM", "HIGH", "CRITICAL" (default: "MEDIUM")
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class AuditLog(
    val module: String,
    val action: String,
    val riskLevel: String = "MEDIUM",
)
