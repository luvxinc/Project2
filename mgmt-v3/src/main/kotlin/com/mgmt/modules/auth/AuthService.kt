package com.mgmt.modules.auth

import com.mgmt.common.exception.BusinessException
import com.mgmt.common.exception.ForbiddenException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.common.exception.UnauthorizedException
import com.mgmt.domain.auth.*
import com.mgmt.modules.auth.dto.*
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*

/**
 * AuthService — login, refresh, logout, change password.
 *
 * Ported from V2 AuthService (393 lines).
 * Fixes: AUTH-1 (slim token), AUTH-2 (SecureRandom), AUTH-3 (scheduled cleanup).
 */
@Service
class AuthService(
    private val userRepo: UserRepository,
    private val refreshTokenRepo: RefreshTokenRepository,
    private val jwtTokenProvider: JwtTokenProvider,
    private val sessionService: SessionService,
    private val passwordEncoder: BCryptPasswordEncoder,
) {
    private val log = LoggerFactory.getLogger(AuthService::class.java)

    /**
     * Login — validate credentials, generate tokens, enforce single-device.
     * 🔒 5 failed attempts → 15-minute lockout (Redis).
     */
    @Transactional
    fun login(request: LoginRequest): LoginResponse {
        val user = userRepo.findByUsername(request.username)
            ?: throw UnauthorizedException("用户名或密码错误")

        // Check login lockout
        if (sessionService.isLoginLocked(user.id)) {
            throw ForbiddenException("登录已被暂时锁定，请15分钟后重试")
        }

        // Check account status
        if (user.status != UserStatus.ACTIVE) {
            throw ForbiddenException("账号已被 ${user.status.name.lowercase()}")
        }

        // Check deleted
        if (user.deletedAt != null) {
            throw UnauthorizedException("用户名或密码错误")
        }

        // Verify password
        if (!passwordEncoder.matches(request.password, user.passwordHash)) {
            val result = sessionService.recordLoginFailure(user.id)
            if (result.locked) {
                throw ForbiddenException("登录失败次数过多，已锁定15分钟")
            }
            throw UnauthorizedException("用户名或密码错误 (剩余 ${result.remainingAttempts} 次)")
        }

        // Clear login failures on success
        sessionService.clearLoginFailures(user.id)

        // Single-device: revoke all existing refresh tokens
        refreshTokenRepo.revokeAllByUserId(user.id)
        sessionService.forceLogout(user.id)

        // Generate new tokens (AUTH-1: slim token)
        val roles = user.roles.toList()
        val accessToken = jwtTokenProvider.generateAccessToken(user.id, user.username, roles)
        val refreshTokenValue = jwtTokenProvider.generateRefreshTokenValue()

        // Store refresh token
        val refreshToken = RefreshToken(
            id = UUID.randomUUID().toString(),
            token = refreshTokenValue,
            userId = user.id,
            expiresAt = Instant.now().plusSeconds(jwtTokenProvider.getRefreshTokenExpirationSec()),
        )
        refreshTokenRepo.save(refreshToken)

        // Create session in Redis
        sessionService.createSession(user.id, jwtTokenProvider.getAccessTokenExpirationSec())

        // Update last login
        user.lastLoginAt = Instant.now()
        userRepo.save(user)

        log.info("Login success: user={}", user.username)

        return LoginResponse(
            accessToken = accessToken,
            refreshToken = refreshTokenValue,
            expiresIn = jwtTokenProvider.getAccessTokenExpirationSec(),
            user = mapToSummary(user),
        )
    }

    /**
     * Refresh access token using a valid refresh token.
     */
    @Transactional
    fun refreshToken(request: RefreshRequest): RefreshResponse {
        val stored = refreshTokenRepo.findByToken(request.refreshToken)
            ?: throw UnauthorizedException("Invalid refresh token")

        if (stored.revokedAt != null) {
            throw UnauthorizedException("Refresh token has been revoked")
        }
        if (stored.expiresAt.isBefore(Instant.now())) {
            throw UnauthorizedException("Refresh token has expired")
        }

        val user = userRepo.findById(stored.userId).orElseThrow {
            UnauthorizedException("User not found")
        }

        val roles = user.roles.toList()
        val accessToken = jwtTokenProvider.generateAccessToken(user.id, user.username, roles)

        return RefreshResponse(
            accessToken = accessToken,
            expiresIn = jwtTokenProvider.getAccessTokenExpirationSec(),
        )
    }

    /**
     * Logout — revoke all refresh tokens and clear Redis session.
     */
    @Transactional
    fun logout(userId: String) {
        refreshTokenRepo.revokeAllByUserId(userId)
        sessionService.forceLogout(userId)
        log.info("Logout: user={}", userId)
    }

    /**
     * Change password (self-service).
     */
    @Transactional
    fun changePassword(userId: String, request: ChangePasswordRequest) {
        if (request.newPassword != request.confirmPassword) {
            throw BusinessException("新密码和确认密码不一致")
        }

        val user = userRepo.findById(userId).orElseThrow {
            NotFoundException.forEntity("User", userId)
        }

        if (!passwordEncoder.matches(request.currentPassword, user.passwordHash)) {
            throw BusinessException("当前密码错误")
        }

        if (passwordEncoder.matches(request.newPassword, user.passwordHash)) {
            throw BusinessException("新密码不能与当前密码相同")
        }

        user.passwordHash = passwordEncoder.encode(request.newPassword)
        user.updatedAt = Instant.now()
        userRepo.save(user)

        // Force re-login
        refreshTokenRepo.revokeAllByUserId(userId)
        sessionService.forceLogout(userId)

        log.info("Password changed: user={}", userId)
    }

    /**
     * Get current user profile.
     */
    fun getCurrentUser(userId: String): UserSummary {
        val user = userRepo.findById(userId).orElseThrow {
            NotFoundException.forEntity("User", userId)
        }
        return mapToSummary(user)
    }

    /**
     * Scheduled cleanup of expired/revoked refresh tokens (fixes AUTH-3).
     * Runs every 6 hours, removes tokens expired/revoked > 30 days ago.
     */
    @Scheduled(fixedRate = 21_600_000)  // 6 hours
    @Transactional
    fun cleanupExpiredTokens() {
        val cutoff = Instant.now().minusSeconds(30 * 24 * 3600L)
        val count = refreshTokenRepo.deleteExpiredOrRevoked(cutoff)
        if (count > 0) {
            log.info("Cleaned up {} expired/revoked refresh tokens", count)
        }
    }

    private fun mapToSummary(user: User): UserSummary = UserSummary(
        id = user.id,
        username = user.username,
        email = user.email,
        displayName = user.displayName,
        status = user.status.name,
        roles = user.roles.toList(),
        permissions = user.permissions,
        settings = user.settings,
        lastLoginAt = user.lastLoginAt,
        createdAt = user.createdAt,
    )
}
