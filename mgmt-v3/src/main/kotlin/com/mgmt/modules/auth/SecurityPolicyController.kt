package com.mgmt.modules.auth

import com.mgmt.common.response.ApiResponse
import com.mgmt.common.exception.ForbiddenException
import com.mgmt.domain.auth.SecurityCodeRepository
import com.mgmt.domain.auth.UserRepository
import com.mgmt.modules.auth.dto.SecurityPolicyRequest
import com.mgmt.modules.users.UserService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.slf4j.LoggerFactory
import org.springframework.security.crypto.bcrypt.BCrypt
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.web.bind.annotation.*

/**
 * SecurityPolicyController — CRUD for the dynamic security policy matrix.
 *
 * V1 parity: policy_update() in user_admin/views/actions.py
 * V1 stored policies in data/security_overrides.json.
 * V3 stores policies in Redis (action_registry:{actionKey} → List<tokenType>).
 *
 * Security: PUT requires L0 (user password) + L4 (nuclear code) verification.
 */
@RestController
@RequestMapping("/auth/security-policies")
class SecurityPolicyController(
    private val sessionService: SessionService,
    private val jwtTokenProvider: JwtTokenProvider,
    private val securityCodeRepo: SecurityCodeRepository,
    private val userRepo: UserRepository,
    private val passwordEncoder: BCryptPasswordEncoder,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * GET /auth/security-policies
     * Returns all action registry entries from Redis.
     */
    @GetMapping
    fun getPolicies(
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, List<String>>> {
        requireSuperuser(httpRequest)
        val policies = sessionService.getAllActionPolicies()
        return ApiResponse.ok(policies)
    }

    /**
     * PUT /auth/security-policies
     * Batch-save all action registry entries to Redis.
     *
     * V1 parity: update_all_policies() in UserAdminService.
     * Security: Requires superuser + L0 (user password) + L4 (nuclear code).
     */
    @PutMapping
    fun savePolicies(
        @Valid @RequestBody request: SecurityPolicyRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        val claims = requireSuperuser(httpRequest)

        // ─── Security Verification: L0 + L4 ─────────────────────────
        verifyL0Password(claims, request.secCodeL0)
        verifyL4SystemCode(request.secCodeL4)

        val count = sessionService.saveAllActionPolicies(request.policies)
        log.info("Security policies saved by {}: {} action keys", claims.username, count)
        return ApiResponse.ok(mapOf(
            "message" to "已更新 ${count} 项策略",
            "count" to count.toString(),
        ))
    }

    /**
     * Verify L0 — user's current login password.
     * V1 parity: SecurityPolicyManager.validate_single_token("user", ...)
     */
    private fun verifyL0Password(claims: JwtTokenProvider.TokenClaims, password: String?) {
        if (password.isNullOrBlank()) {
            throw ForbiddenException("缺少验证码: 当前用户密码 (L0)")
        }
        val user = userRepo.findById(claims.userId).orElseThrow {
            ForbiddenException("用户不存在")
        }
        if (!passwordEncoder.matches(password, user.passwordHash)) {
            throw ForbiddenException("验证失败: 用户密码错误")
        }
    }

    /**
     * Verify L4 — system nuclear code.
     * V1 parity: SecurityPolicyManager.validate_single_token("system", ...)
     */
    private fun verifyL4SystemCode(code: String?) {
        if (code.isNullOrBlank()) {
            throw ForbiddenException("缺少验证码: 系统核弹码 (L4)")
        }
        val securityCode = securityCodeRepo.findByLevelAndIsActive("L4", true)
            ?: throw ForbiddenException("系统未配置 L4 安全码")
        if (!BCrypt.checkpw(code, securityCode.codeHash)) {
            throw ForbiddenException("验证失败: L4 系统核弹码错误")
        }
    }

    // ─── Public Single-Action Policy Query ─────────────────────────

    /**
     * GET /auth/security-policies/action/{actionKey}
     * Returns required tokens for a single action.
     *
     * Unlike GET /auth/security-policies (superuser-only, returns ALL policies),
     * this endpoint is available to any authenticated user and returns only
     * the tokens required for the specified action.
     *
     * Used by frontend to dynamically show/skip SecurityCodeDialog
     * based on the current policy configuration.
     *
     * V1 parity: SecurityPolicyManager.get_required_tokens(actionKey) was
     * used by {% security_inputs %} template tag to conditionally render inputs.
     */
    @GetMapping("/action/{actionKey}")
    fun getActionTokens(
        @PathVariable actionKey: String,
    ): ApiResponse<Map<String, Any>> {
        val tokens = sessionService.getRequiredTokensForAction(actionKey)
        return ApiResponse.ok(mapOf(
            "actionKey" to actionKey,
            "requiredTokens" to tokens,
            "requiresSecurityCode" to tokens.isNotEmpty(),
        ))
    }

    private fun requireSuperuser(request: HttpServletRequest): JwtTokenProvider.TokenClaims {
        val claims = extractClaims(request)
        if ("superuser" !in claims.roles) {
            throw ForbiddenException("仅超级管理员可操作安全策略矩阵")
        }
        return claims
    }

    private fun extractClaims(request: HttpServletRequest): JwtTokenProvider.TokenClaims {
        val auth = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication
        return auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw com.mgmt.common.exception.UnauthorizedException("Not authenticated")
    }

    // ─── Permission Whitelist Management ─────────────────────────

    /**
     * GET /auth/security-policies/whitelist
     * Returns the active permission whitelist (Redis → default fallback).
     */
    @GetMapping("/whitelist")
    fun getWhitelist(
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, Any>> {
        requireSuperuser(httpRequest)
        val fromRedis = sessionService.getPermissionWhitelist()
        val whitelist = fromRedis ?: UserService.DEFAULT_WHITELIST_PERMISSIONS
        return ApiResponse.ok(mapOf(
            "keys" to whitelist.sorted(),
            "count" to whitelist.size,
            "source" to if (fromRedis != null) "redis" else "default",
        ))
    }

    /**
     * PUT /auth/security-policies/whitelist
     * Update the permission whitelist in Redis. Requires L0+L4.
     * Body: { "keys": ["module.sales", ...], "sec_code_l0": "...", "sec_code_l4": "..." }
     */
    @PutMapping("/whitelist")
    fun saveWhitelist(
        @RequestBody body: Map<String, Any>,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, Any>> {
        val claims = requireSuperuser(httpRequest)

        // Verify L0 + L4
        verifyL0Password(claims, body["sec_code_l0"]?.toString())
        verifyL4SystemCode(body["sec_code_l4"]?.toString())

        @Suppress("UNCHECKED_CAST")
        val keys = (body["keys"] as? List<*>)?.map { it.toString() }?.toSet()
            ?: throw com.mgmt.common.exception.BadRequestException("缺少 keys 数组")

        if (keys.isEmpty()) {
            throw com.mgmt.common.exception.BadRequestException("白名单不能为空")
        }

        sessionService.savePermissionWhitelist(keys)
        log.info("Permission whitelist updated by {}: {} keys", claims.username, keys.size)

        return ApiResponse.ok(mapOf(
            "message" to "白名单已更新: ${keys.size} 个权限键",
            "count" to keys.size,
        ))
    }

    /**
     * POST /auth/security-policies/whitelist/initialize
     * Initialize Redis whitelist from hardcoded DEFAULT_WHITELIST_PERMISSIONS.
     * Safe to call multiple times (idempotent).
     */
    @PostMapping("/whitelist/initialize")
    fun initializeWhitelist(
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, Any>> {
        requireSuperuser(httpRequest)
        val defaults = UserService.DEFAULT_WHITELIST_PERMISSIONS
        sessionService.savePermissionWhitelist(defaults)
        log.info("Permission whitelist initialized from defaults: {} keys", defaults.size)
        return ApiResponse.ok(mapOf(
            "message" to "白名单已从默认值初始化: ${defaults.size} 个权限键",
            "count" to defaults.size,
        ))
    }
}
