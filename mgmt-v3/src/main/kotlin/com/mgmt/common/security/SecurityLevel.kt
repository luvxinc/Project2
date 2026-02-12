package com.mgmt.common.security

/**
 * Security Level annotation — replaces V2's @RequireSecurityLevel decorator.
 *
 * Usage:
 *   @SecurityLevel("L2")
 *   fun createProduct(...)
 *
 * Validated by SecurityLevelInterceptor via AOP.
 * Security code is read from X-Security-Code header (not body).
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@MustBeDocumented
annotation class SecurityLevel(
    val level: String  // "L1", "L2", "L3", "L4"
)
