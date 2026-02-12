package com.mgmt.modules.auth

import com.mgmt.common.exception.BusinessException
import com.mgmt.common.exception.ForbiddenException
import com.mgmt.domain.auth.SecurityCodeRepository
import com.mgmt.modules.auth.dto.VerifySecurityRequest
import com.mgmt.modules.auth.dto.VerifySecurityResponse
import org.slf4j.LoggerFactory
import org.springframework.security.crypto.bcrypt.BCrypt
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.Instant
import java.util.*

/**
 * SecurityCodeService — L1-L4 verification with Redis lockout.
 *
 * Ported from V2 SecurityService + SecurityPolicyService.
 * AUTH-2 Fix: Uses SecureRandom for security token generation.
 */
@Service
class SecurityCodeService(
    private val securityCodeRepo: SecurityCodeRepository,
    private val sessionService: SessionService,
) {
    private val log = LoggerFactory.getLogger(SecurityCodeService::class.java)
    private val secureRandom = SecureRandom()

    fun verifySecurityCode(request: VerifySecurityRequest, userId: String): VerifySecurityResponse {
        val (level, code, actionKey) = request

        // L1 = token only, no code needed
        if (level == "L1") {
            return VerifySecurityResponse(
                verified = true,
                securityToken = generateSecurityToken(),
                validUntil = Instant.now().plusSeconds(300),
            )
        }

        // Check if locked out
        if (sessionService.isSecurityLocked(userId, level)) {
            log.warn("Security verification blocked: user={}, level={}", userId, level)
            throw ForbiddenException("$level 验证已被暂时阻止，请30分钟后重试")
        }

        // Verify code against DB (bcrypt hash)
        val isValid = verifyCode(level, code)

        if (!isValid) {
            val result = sessionService.recordSecurityFailure(userId, level)
            if (result.blocked) {
                throw ForbiddenException("验证失败次数过多，$level 验证已被阻止30分钟")
            }
            throw BusinessException("安全验证码错误 (剩余 ${result.remainingAttempts} 次尝试)")
        }

        // Success — clear failures
        sessionService.clearSecurityFailures(userId, level)

        log.info("Security code verified: user={}, level={}, action={}", userId, level, actionKey)

        return VerifySecurityResponse(
            verified = true,
            securityToken = generateSecurityToken(),
            validUntil = Instant.now().plusSeconds(300),
        )
    }

    private fun verifyCode(level: String, inputCode: String): Boolean {
        val securityCode = securityCodeRepo.findByLevelAndIsActive(level, true)
        if (securityCode != null) {
            return BCrypt.checkpw(inputCode, securityCode.codeHash)
        }
        // No DB code found — reject
        log.warn("No active security code found in DB for level: {}", level)
        return false
    }

    /**
     * Generate cryptographically secure security token (fixes AUTH-2).
     */
    private fun generateSecurityToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
