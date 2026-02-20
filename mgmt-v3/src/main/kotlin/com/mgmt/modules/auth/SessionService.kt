package com.mgmt.modules.auth

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.domain.auth.ActionRegistryEntry
import com.mgmt.domain.auth.ActionRegistryRepository
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
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
    private val actionRegistryRepo: ActionRegistryRepository,
) {
    private val log = LoggerFactory.getLogger(SessionService::class.java)

    companion object {
        private const val PERM_PREFIX = "perm:"
        private const val SESS_PREFIX = "sess:"
        private const val LOCK_PREFIX = "sec:lock:"
        private const val FAIL_PREFIX = "sec:fail:"
        private const val WHITELIST_KEY = "perm:whitelist"
        private val PERM_TTL = Duration.ofMinutes(30)
        private val LOCK_TTL = Duration.ofMinutes(30)
        private const val MAX_SECURITY_FAILURES = 3
        /** Sliding session idle timeout — session expires after this duration of no interaction */
        private val IDLE_TIMEOUT = Duration.ofHours(1)
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
        // Use the idle timeout for session TTL (sliding window)
        redis.opsForValue().set("$SESS_PREFIX$userId", "1", IDLE_TIMEOUT)
    }

    /**
     * Sliding session: extend TTL on every successful API interaction.
     * Enterprise standard (Salesforce, SAP, Workday pattern):
     * - Every 200/2xx response = user is active → reset idle timer
     * - Session expires only after IDLE_TIMEOUT of zero interaction
     */
    fun touchSession(userId: String) {
        val key = "$SESS_PREFIX$userId"
        if (redis.hasKey(key)) {
            redis.expire(key, IDLE_TIMEOUT)
        }
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

    // ─── Dynamic Security Policy ────────────────────────────────

    /**
     * Get required tokens for an action from the action registry.
     * V1 parity: SecurityPolicyManager.get_required_tokens(actionKey)
     *
     * Returns list of required token types (e.g., ["password", "securityCode"]).
     * Returns empty list if no tokens required (action is unprotected).
     */
    fun getRequiredTokensForAction(actionKey: String): List<String> {
        // Try Redis first
        val key = "action_registry:$actionKey"
        val json = redis.opsForValue().get(key)
        if (json != null) {
            return try {
                objectMapper.readValue(json, objectMapper.typeFactory.constructCollectionType(List::class.java, String::class.java))
            } catch (e: Exception) {
                log.warn("Failed to parse action registry from Redis for '{}': {}", actionKey, e.message)
                emptyList()
            }
        }

        // Redis miss -> try DB
        val dbEntry = actionRegistryRepo.findByActionKey(actionKey)
        if (dbEntry != null) {
            // Backfill Redis
            redis.opsForValue().set(key, dbEntry.tokens)
            return try {
                objectMapper.readValue(dbEntry.tokens, objectMapper.typeFactory.constructCollectionType(List::class.java, String::class.java))
            } catch (e: Exception) {
                log.warn("Failed to parse action registry from DB for '{}': {}", actionKey, e.message)
                emptyList()
            }
        }

        return emptyList()
    }

    /**
     * Get all action policies from Redis.
     * Scans action_registry:* keys and returns a map of actionKey → tokenTypes.
     */
    fun getAllActionPolicies(): Map<String, List<String>> {
        val result = mutableMapOf<String, List<String>>()
        val keys = redis.keys("action_registry:*")
        if (keys.isNullOrEmpty()) return result

        val values = redis.opsForValue().multiGet(keys.toList()) ?: return result
        keys.toList().zip(values).forEach { (key, json) ->
            if (json != null) {
                val actionKey = key.removePrefix("action_registry:")
                try {
                    val tokens: List<String> = objectMapper.readValue(
                        json, objectMapper.typeFactory.constructCollectionType(List::class.java, String::class.java)
                    )
                    result[actionKey] = tokens
                } catch (e: Exception) {
                    log.warn("Failed to parse action registry for '{}': {}", key, e.message)
                }
            }
        }
        return result
    }

    /**
     * Batch-save all action policies to Redis.
     * V1 parity: UserAdminService.update_all_policies()
     * Returns the count of policies saved.
     */
    @Transactional
    fun saveAllActionPolicies(policies: Map<String, List<String>>): Int {
        // 1. Persist to DB (write-through)
        actionRegistryRepo.deleteAll()
        policies.forEach { (actionKey, tokens) ->
            actionRegistryRepo.save(ActionRegistryEntry(
                id = java.util.UUID.randomUUID().toString(),
                actionKey = actionKey,
                tokens = objectMapper.writeValueAsString(tokens),
            ))
        }

        // 2. Update Redis cache
        val existingKeys = redis.keys("action_registry:*")
        if (!existingKeys.isNullOrEmpty()) {
            redis.delete(existingKeys)
        }
        policies.forEach { (actionKey, tokens) ->
            redis.opsForValue().set("action_registry:$actionKey", objectMapper.writeValueAsString(tokens))
        }

        log.info("Security policies saved: {} action keys (DB + Redis)", policies.size)
        return policies.size
    }

    // Note: Security code verification for @SecurityLevel is handled by
    // SecurityLevelAspect.validateSingleToken() which validates L0 (user password)
    // and L1-L4 (security_codes table, bcrypt) directly.

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

    // ─── Action Registry DB→Redis Loader ────────────────────────

    @PostConstruct
    fun loadActionRegistryFromDb() {
        val entries = actionRegistryRepo.findAll()
        if (entries.isEmpty()) {
            log.info("No action registry entries in DB — Redis will use runtime-configured policies")
            return
        }
        entries.forEach { entry ->
            redis.opsForValue().set("action_registry:${entry.actionKey}", entry.tokens)
        }
        log.info("Loaded {} action registry entries from DB to Redis", entries.size)
    }

    // ─── Permission Whitelist Cache ──────────────────────────────

    /**
     * Get the permission whitelist from Redis.
     * Returns null if not initialized (caller should use default).
     */
    fun getPermissionWhitelist(): Set<String>? {
        val json = redis.opsForValue().get(WHITELIST_KEY) ?: return null
        return try {
            @Suppress("UNCHECKED_CAST")
            objectMapper.readValue(json, List::class.java).map { it.toString() }.toSet()
        } catch (e: Exception) {
            log.warn("Failed to parse permission whitelist from Redis: {}", e.message)
            null
        }
    }

    /**
     * Save the permission whitelist to Redis (no TTL — permanent).
     */
    fun savePermissionWhitelist(keys: Set<String>) {
        val json = objectMapper.writeValueAsString(keys.sorted())
        redis.opsForValue().set(WHITELIST_KEY, json)
        log.info("Permission whitelist saved to Redis: {} keys", keys.size)
    }
}
