package com.mgmt.common.security

import com.mgmt.common.exception.BusinessException
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.SessionService
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

/**
 * PermissionCheckAspect — AOP implementation for @RequirePermission.
 *
 * V2 parity: NestJS PermissionsGuard + @Permissions decorator.
 *
 * Flow:
 *   1. Read @RequirePermission annotation from method
 *   2. Get userId from SecurityContext (JWT claims)
 *   3. Load permissions from Redis cache (SessionService)
 *   4. Check if required permission exists (flat key list)
 *   5. Superuser bypass: roles containing "superuser" skip permission checks
 *   6. Deny with 403 if missing
 */
@Aspect
@Component
class PermissionCheckAspect(
    private val sessionService: SessionService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Around("@annotation(com.mgmt.common.security.RequirePermission)")
    fun checkPermission(joinPoint: ProceedingJoinPoint): Any? {
        val method = (joinPoint.signature as MethodSignature).method
        val annotation = method.getAnnotation(RequirePermission::class.java)
        val requiredPermission = annotation.value

        // Get claims from SecurityContext
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")

        // V2 parity: superuser bypass (same as NestJS PermissionsGuard)
        if (claims.roles.contains("superuser")) {
            return joinPoint.proceed()
        }

        // Load permissions from Redis cache
        val permissions = sessionService.getCachedPermissions(claims.userId)
        if (permissions == null) {
            log.warn("No permissions cached for user {} — denying access to {}", claims.userId, requiredPermission)
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Permission denied: $requiredPermission (permissions not loaded)"
            )
        }

        // Check flat key list (V2 format: "vma.employees.manage")
        if (!permissions.contains(requiredPermission)) {
            log.warn("User {} lacks permission '{}' — has: {}", claims.username, requiredPermission, permissions)
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Permission denied: $requiredPermission")
        }

        return joinPoint.proceed()
    }
}
