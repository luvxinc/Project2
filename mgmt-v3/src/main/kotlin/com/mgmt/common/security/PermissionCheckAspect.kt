package com.mgmt.common.security

import com.mgmt.domain.auth.UserRepository
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.SessionService
import com.fasterxml.jackson.databind.ObjectMapper
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
 *   4. On cache miss: load from DB → cache → proceed
 *   5. Check if required permission exists (flat key list)
 *   6. Superuser bypass: roles containing "superuser" skip permission checks
 *   7. Deny with 403 if missing
 */
@Aspect
@Component
class PermissionCheckAspect(
    private val sessionService: SessionService,
    private val userRepo: UserRepository,
    private val objectMapper: ObjectMapper,
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
        var permissions = sessionService.getCachedPermissions(claims.userId)

        // Cache miss — load from DB and cache
        if (permissions == null) {
            permissions = loadAndCachePermissions(claims.userId)
        }

        // Check flat key list — support both "vma.x" and "module.vma.x" formats
        val hasPermission = permissions.contains(requiredPermission) ||
            permissions.contains("module.$requiredPermission")
        if (!hasPermission) {
            log.warn("User {} lacks permission '{}' — has: {}", claims.username, requiredPermission, permissions)
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Permission denied: $requiredPermission")
        }

        return joinPoint.proceed()
    }

    /**
     * Load permissions from DB, cache in Redis, return flat key list.
     */
    private fun loadAndCachePermissions(userId: String): List<String> {
        val user = userRepo.findById(userId).orElse(null) ?: return emptyList()
        val json = user.permissions ?: return emptyList()
        return try {
            @Suppress("UNCHECKED_CAST")
            val map = objectMapper.readValue(json, Map::class.java) as Map<String, Any?>
            val keys = map.entries.filter { it.value == true }.map { it.key }
            if (keys.isNotEmpty()) {
                sessionService.cachePermissions(userId, keys)
                log.info("Loaded & cached {} permissions from DB for user {}", keys.size, userId)
            }
            keys
        } catch (e: Exception) {
            log.warn("Failed to load permissions from DB for user {}: {}", userId, e.message)
            emptyList()
        }
    }
}
