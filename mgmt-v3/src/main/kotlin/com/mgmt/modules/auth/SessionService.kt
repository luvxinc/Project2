package com.mgmt.modules.auth

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration

/**
 * SessionService — unified session & permission cache for Redis.
 *
 * Fixes:
 *   USER-1, ROLE-2: Uses Redis Pipeline for batch operations.
 *   ROLE-1: Single service replaces duplicated forceLogout across User/Role services.
 *   AUTH-4: Flat permission key format only, no legacy nested format.
 */
@Service
class SessionService(
    private val redis: StringRedisTemplate,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(SessionService::class.java)

    companion object {
        private const val PERM_PREFIX = "perm:"
        private const val SESS_PREFIX = "sess:"
        private const val LOCK_PREFIX = "sec:lock:"
        private const val FAIL_PREFIX = "sec:fail:"
        private val PERM_TTL = Duration.ofMinutes(30)
        private val LOCK_TTL = Duration.ofMinutes(30)
        private const val MAX_SECURITY_FAILURES = 3
    }

    // ─── Permission Cache ────────────────────────────────────────

    /** Cache user permissions as flat key list in Redis */
    fun cachePermissions(userId: String, permissions: List<String>) {
        val json = objectMapper.writeValueAsString(permissions)
        redis.opsForValue().set("$PERM_PREFIX$userId", json, PERM_TTL)
    }

    /** Get cached permissions, null if missing (caller should load from DB) */
    fun getCachedPermissions(userId: String): List<String>? {
        val json = redis.opsForValue().get("$PERM_PREFIX$userId") ?: return null
        return objectMapper.readValue(json, objectMapper.typeFactory.constructCollectionType(List::class.java, String::class.java))
    }

    /** Clear single user's permission cache */
    fun clearPermissions(userId: String) {
        redis.delete("$PERM_PREFIX$userId")
    }

    // ─── Session Management ──────────────────────────────────────

    /** Mark user session as active */
    fun createSession(userId: String, accessTokenExpirySec: Long) {
        redis.opsForValue().set("$SESS_PREFIX$userId", "1", Duration.ofSeconds(accessTokenExpirySec))
    }

    /** Clear session */
    fun clearSession(userId: String) {
        redis.delete("$SESS_PREFIX$userId")
    }

    /**
     * Force logout single user: clear session + permission cache.
     */
    fun forceLogout(userId: String) {
        redis.delete(listOf("$SESS_PREFIX$userId", "$PERM_PREFIX$userId"))
    }

    /**
     * Force logout multiple users via Pipeline (fixes USER-1, ROLE-2).
     * Returns count of users affected.
     */
    fun forceLogoutBatch(userIds: List<String>): Int {
        if (userIds.isEmpty()) return 0
        val keys = userIds.flatMap { listOf("$SESS_PREFIX$it", "$PERM_PREFIX$it") }
        redis.delete(keys)
        log.info("Batch force-logout: {} users, {} Redis keys deleted", userIds.size, keys.size)
        return userIds.size
    }

    /**
     * Invalidate permissions for a batch of users (Pipeline).
     */
    fun invalidatePermissionsBatch(userIds: List<String>): Int {
        if (userIds.isEmpty()) return 0
        val keys = userIds.map { "$PERM_PREFIX$it" }
        redis.delete(keys)
        return userIds.size
    }

    // ─── Security Lockout ────────────────────────────────────────

    /** Check if user is locked for a security level */
    fun isSecurityLocked(userId: String, level: String): Boolean {
        return redis.hasKey("$LOCK_PREFIX$userId:$level")
    }

    /**
     * Record security verification failure.
     * Returns remaining attempts and whether the user is now blocked.
     */
    fun recordSecurityFailure(userId: String, level: String): SecurityFailureResult {
        val key = "$FAIL_PREFIX$userId:$level"
        val count = redis.opsForValue().increment(key) ?: 1
        if (count == 1L) {
            redis.expire(key, LOCK_TTL)
        }
        return if (count >= MAX_SECURITY_FAILURES) {
            // Lock the user
            redis.opsForValue().set("$LOCK_PREFIX$userId:$level", "1", LOCK_TTL)
            redis.delete(key)
            SecurityFailureResult(remainingAttempts = 0, blocked = true)
        } else {
            SecurityFailureResult(
                remainingAttempts = (MAX_SECURITY_FAILURES - count).toInt(),
                blocked = false,
            )
        }
    }

    /** Clear security failure count after successful verification */
    fun clearSecurityFailures(userId: String, level: String) {
        redis.delete(listOf("$FAIL_PREFIX$userId:$level", "$LOCK_PREFIX$userId:$level"))
    }

    // ─── Login Lockout ───────────────────────────────────────────

    fun isLoginLocked(userId: String): Boolean {
        return redis.hasKey("login:lock:$userId")
    }

    fun recordLoginFailure(userId: String): LoginFailureResult {
        val key = "login:fail:$userId"
        val count = redis.opsForValue().increment(key) ?: 1
        if (count == 1L) {
            redis.expire(key, Duration.ofMinutes(15))
        }
        return if (count >= 5) {
            redis.opsForValue().set("login:lock:$userId", "1", Duration.ofMinutes(15))
            redis.delete(key)
            LoginFailureResult(remainingAttempts = 0, locked = true)
        } else {
            LoginFailureResult(remainingAttempts = (5 - count).toInt(), locked = false)
        }
    }

    fun clearLoginFailures(userId: String) {
        redis.delete(listOf("login:fail:$userId", "login:lock:$userId"))
    }

    data class SecurityFailureResult(val remainingAttempts: Int, val blocked: Boolean)
    data class LoginFailureResult(val remainingAttempts: Int, val locked: Boolean)
}
