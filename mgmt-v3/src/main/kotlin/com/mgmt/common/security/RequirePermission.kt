package com.mgmt.common.security

/**
 * RequirePermission — method-level permission check.
 *
 * V2 parity: @Permissions('vma.employees.manage') decorator in NestJS.
 * Applied to controller methods. Checked by [PermissionCheckAspect].
 *
 * @param value The permission string to check, e.g. "vma.employees.manage"
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequirePermission(val value: String)
