package com.mgmt.common.security

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.common.exception.BusinessException
import com.mgmt.domain.auth.SecurityCodeRepository
import com.mgmt.domain.auth.UserRepository
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.SessionService
import jakarta.servlet.http.HttpServletRequest
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.bcrypt.BCrypt
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.server.ResponseStatusException
import com.mgmt.common.web.CachedBodyRequestWrapper

/**
 * SecurityLevelAspect — AOP interceptor for @SecurityLevel annotation.
 *
 * V1 parity: SecurityPolicyManager.verify_action_request(request, actionKey)
 *
 * V1 token model (5 levels):
 *   user   → L0 → 用户当前密码         → sec_code_l0
 *   query  → L1 → 查询安保码            → sec_code_l1
 *   modify → L2 → 修改安保码            → sec_code_l2
 *   db     → L3 → 数据库管理码          → sec_code_l3
 *   system → L4 → 系统核弹码            → sec_code_l4
 *
 * V3 architecture (conventions.md §4):
 *   L1-L4 codes stored in `security_codes` table (bcrypt hash).
 *   L0 (user password) validated via BCrypt against user.passwordHash.
 *
 * Multi-token support:
 *   An action can require multiple tokens simultaneously (e.g., L0 + L4).
 *   Frontend sends all required codes in the request JSON body.
 *
 * Dynamic flow:
 *   1. Read @SecurityLevel annotation (level + actionKey)
 *   2. Load action registry from Redis to check required tokens
 *   3. If tokens=[] → skip security code validation
 *   4. Read security codes from JSON body (sec_code_l0..l4)
 *   5. Verify each token independently
 *   6. Deny with 403 if any verification fails
 */
@Aspect
@Component
class SecurityLevelAspect(
    private val sessionService: SessionService,
    private val securityCodeRepo: SecurityCodeRepository,
    private val userRepo: UserRepository,
    private val passwordEncoder: BCryptPasswordEncoder,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * V1 parity: TOKEN_MAP — maps tokenType to (level, code_key)
     */
    companion object {
        val TOKEN_MAP = mapOf(
            "user"   to TokenMeta("L0", "sec_code_l0"),
            "query"  to TokenMeta("L1", "sec_code_l1"),
            "modify" to TokenMeta("L2", "sec_code_l2"),
            "db"     to TokenMeta("L3", "sec_code_l3"),
            "system" to TokenMeta("L4", "sec_code_l4"),
        )

        data class TokenMeta(val level: String, val codeKey: String)
    }

    @Around("@annotation(com.mgmt.common.security.SecurityLevel)")
    fun enforceSecurityLevel(joinPoint: ProceedingJoinPoint): Any? {
        val method = (joinPoint.signature as MethodSignature).method
        val annotation = method.getAnnotation(SecurityLevel::class.java)
        val level = annotation.level
        val actionKey = annotation.actionKey

        // Get current user from SecurityContext
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")

        // Superuser bypass (V1 parity: superusers bypass all security levels)
        if (claims.roles.contains("superuser")) {
            return joinPoint.proceed()
        }

        // Dynamic policy check: does this actionKey require security codes?
        val requiredTokens = sessionService.getRequiredTokensForAction(actionKey)

        // If no tokens required for this action → proceed without security code
        if (requiredTokens.isEmpty()) {
            log.debug("Action '{}' requires no security tokens — proceeding", actionKey)
            return joinPoint.proceed()
        }

        // Read security codes from JSON body
        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request
            ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No request context")

        val jsonBody = readJsonBody(request)

        // Verify each required token independently (V1 parity: multi-token support)
        for (tokenType in requiredTokens) {
            val meta = TOKEN_MAP[tokenType]
            if (meta == null) {
                log.warn("Unknown token type '{}' for action '{}' — skipping", tokenType, actionKey)
                continue
            }

            val inputValue = (jsonBody[meta.codeKey] as? String)?.trim()
            if (inputValue.isNullOrBlank()) {
                log.warn("Missing security code '{}' for action '{}' by user {}",
                    meta.codeKey, actionKey, claims.username)
                throw ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "缺少验证码: ${meta.level}"
                )
            }

            val valid = validateSingleToken(tokenType, inputValue, claims)
            if (!valid) {
                log.warn("Invalid security code '{}' ({}) for action '{}' by user {}",
                    meta.codeKey, meta.level, actionKey, claims.username)
                throw ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "验证失败: ${meta.level} 安全码错误"
                )
            }
        }

        log.info("Security level {} verified for action '{}' by user {} (tokens: {})",
            level, actionKey, claims.username, requiredTokens)
        return joinPoint.proceed()
    }

    /**
     * Validate a single security token.
     * V1 parity: SecurityPolicyManager.validate_single_token()
     *
     * L0 (user): verify against user's bcrypt password hash in DB
     * L1-L4:     verify against security_codes table (bcrypt hash)
     */
    private fun validateSingleToken(
        tokenType: String,
        inputValue: String,
        claims: JwtTokenProvider.TokenClaims,
    ): Boolean {
        if (tokenType == "user") {
            // L0: verify user's current password
            val user = userRepo.findById(claims.userId).orElse(null) ?: return false
            return passwordEncoder.matches(inputValue, user.passwordHash)
        }

        // L1-L4: verify against security_codes table
        val meta = TOKEN_MAP[tokenType] ?: return false
        val securityCode = securityCodeRepo.findByLevelAndIsActive(meta.level, true)
        if (securityCode != null) {
            return BCrypt.checkpw(inputValue, securityCode.codeHash)
        }

        // No active code found in DB for this level → reject
        log.warn("No active security code found in DB for level: {}", meta.level)
        return false
    }

    /**
     * Read JSON body from the request.
     * Uses CachedBodyRequestWrapper (from RequestBodyCachingFilter) for repeatable reads.
     */
    private fun readJsonBody(request: HttpServletRequest): Map<String, Any?> {
        return try {
            val body = when (request) {
                is CachedBodyRequestWrapper -> request.getContentAsByteArray()
                else -> request.inputStream.readBytes()
            }
            if (body.isEmpty()) return emptyMap()

            @Suppress("UNCHECKED_CAST")
            objectMapper.readValue(body, Map::class.java) as Map<String, Any?>
        } catch (e: Exception) {
            log.debug("Could not parse JSON body for security code extraction: {}", e.message)
            emptyMap()
        }
    }
}
