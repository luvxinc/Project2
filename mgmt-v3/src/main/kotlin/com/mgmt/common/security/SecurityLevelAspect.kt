package com.mgmt.common.security

import com.mgmt.common.exception.BusinessException
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
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.server.ResponseStatusException

/**
 * SecurityLevelAspect — AOP interceptor for @SecurityLevel annotation.
 *
 * V1 parity: SecurityPolicyManager.verify_action_request(request, actionKey)
 *
 * Dynamic flow:
 *   1. Read @SecurityLevel annotation (level + actionKey)
 *   2. Load action registry from Redis/SessionService to check if tokens are required
 *   3. If tokens=[] → skip security code validation (dynamic policy)
 *   4. If tokens required → read X-Security-Code header
 *   5. Verify security code via SessionService
 *   6. Deny with 403 if invalid
 */
@Aspect
@Component
class SecurityLevelAspect(
    private val sessionService: SessionService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

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

        // Read security code from X-Security-Code header
        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request
            ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No request context")

        val securityCode = request.getHeader("X-Security-Code")

        if (securityCode.isNullOrBlank()) {
            log.warn("Security code required for action '{}' ({}) but not provided by user {}",
                actionKey, level, claims.username)
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Security code required for this action"
            )
        }

        // Verify security code
        val isValid = sessionService.verifySecurityCode(claims.userId, securityCode, requiredTokens)
        if (!isValid) {
            log.warn("Invalid security code for action '{}' ({}) by user {}",
                actionKey, level, claims.username)
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Invalid security code"
            )
        }

        log.info("Security level {} verified for action '{}' by user {}", level, actionKey, claims.username)
        return joinPoint.proceed()
    }
}
