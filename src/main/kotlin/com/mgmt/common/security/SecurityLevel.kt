package com.mgmt.common.security

/**
 * Security Level annotation — dynamic security policy enforcement.
 *
 * V3 enhanced: adds actionKey for dynamic policy lookup.
 *
 * Usage:
 *   @SecurityLevel(level = "L3", actionKey = "btn_batch_update_cogs")
 *   fun batchUpdateCogs(...)
 *
 * Validated by SecurityLevelAspect via AOP.
 * Security code from X-Security-Code header (not body).
 * Dynamic: if actionRegistry has tokens=[] for this actionKey, validation is skipped.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@MustBeDocumented
annotation class SecurityLevel(
    val level: String,       // "L1", "L2", "L3", "L4"
    val actionKey: String,   // "btn_batch_update_cogs", "btn_create_skus", etc.
)
