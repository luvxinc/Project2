package com.mgmt.modules.auth

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RateLimit
import com.mgmt.common.web.IpUtils
import com.mgmt.modules.auth.dto.*
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*

/**
 * AuthController — login, refresh, logout, me, change-password, verify-security.
 *
 * Ported from V2 AuthController (277 lines).
 */
@RestController
@RequestMapping("/auth")
class AuthController(
    private val authService: AuthService,
    private val securityCodeService: SecurityCodeService,
    private val jwtTokenProvider: JwtTokenProvider,
) {

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.OK)
    @RateLimit(key = "auth:login", maxAttempts = 10, windowSeconds = 300)
    @AuditLog(module = "AUTH", action = "LOGIN")
    fun login(
        @Valid @RequestBody request: LoginRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<LoginResponse> {
        val result = authService.login(request)
        return ApiResponse.ok(result)
    }

    @PostMapping("/refresh")
    @ResponseStatus(HttpStatus.OK)
    fun refresh(@Valid @RequestBody request: RefreshRequest): ApiResponse<RefreshResponse> {
        val result = authService.refreshToken(request)
        return ApiResponse.ok(result)
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.OK)
    @AuditLog(module = "AUTH", action = "LOGOUT")
    fun logout(httpRequest: HttpServletRequest): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        authService.logout(claims.userId)
        return ApiResponse.ok(mapOf("message" to "已成功登出"))
    }

    @GetMapping("/me")
    fun me(httpRequest: HttpServletRequest): ApiResponse<UserSummary> {
        val claims = extractClaims(httpRequest)
        val user = authService.getCurrentUser(claims.userId)
        return ApiResponse.ok(user)
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.OK)
    @AuditLog(module = "AUTH", action = "CHANGE_PASSWORD", riskLevel = "HIGH")
    fun changePassword(
        @Valid @RequestBody request: ChangePasswordRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        authService.changePassword(claims.userId, request)
        return ApiResponse.ok(mapOf("message" to "密码修改成功，请重新登录"))
    }

    @PostMapping("/verify-security")
    @ResponseStatus(HttpStatus.OK)
    @RateLimit(key = "auth:verify", maxAttempts = 5, windowSeconds = 300)
    fun verifySecurity(
        @Valid @RequestBody request: VerifySecurityRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<VerifySecurityResponse> {
        val claims = extractClaims(httpRequest)
        val result = securityCodeService.verifySecurityCode(request, claims.userId)
        return ApiResponse.ok(result)
    }

    /**
     * GET /auth/role-check
     * Lightweight endpoint for frontend polling to detect role changes.
     * Returns current roles so frontend can compare with cached state.
     */
    @GetMapping("/role-check")
    fun roleCheck(httpRequest: HttpServletRequest): ApiResponse<Map<String, Any>> {
        val claims = extractClaims(httpRequest)
        val user = authService.getCurrentUser(claims.userId)
        return ApiResponse.ok(mapOf(
            "userId" to user.id,
            "roles" to user.roles,
            "status" to user.status,
        ))
    }

    private fun extractClaims(request: HttpServletRequest): JwtTokenProvider.TokenClaims {
        val auth = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication
        return auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw com.mgmt.common.exception.UnauthorizedException("Not authenticated")
    }
}
