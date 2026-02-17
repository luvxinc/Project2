package com.mgmt.modules.auth

import com.mgmt.common.response.ApiResponse
import com.mgmt.common.exception.ForbiddenException
import com.mgmt.modules.auth.dto.SecurityPolicyRequest
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.*

/**
 * SecurityPolicyController — CRUD for the dynamic security policy matrix.
 *
 * V1 parity: policy_update() in user_admin/views/actions.py
 * V1 stored policies in data/security_overrides.json.
 * V3 stores policies in Redis (action_registry:{actionKey} → List<tokenType>).
 */
@RestController
@RequestMapping("/auth/security-policies")
class SecurityPolicyController(
    private val sessionService: SessionService,
    private val jwtTokenProvider: JwtTokenProvider,
) {

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
     * V1 parity: update_all_policies() in UserAdminService.
     */
    @PutMapping
    fun savePolicies(
        @Valid @RequestBody request: SecurityPolicyRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        requireSuperuser(httpRequest)
        val count = sessionService.saveAllActionPolicies(request.policies)
        return ApiResponse.ok(mapOf(
            "message" to "已更新 ${count} 项策略",
            "count" to count.toString(),
        ))
    }

    private fun requireSuperuser(request: HttpServletRequest) {
        val claims = extractClaims(request)
        if ("superuser" !in claims.roles) {
            throw ForbiddenException("仅超级管理员可操作安全策略矩阵")
        }
    }

    private fun extractClaims(request: HttpServletRequest): JwtTokenProvider.TokenClaims {
        val auth = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication
        return auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw com.mgmt.common.exception.UnauthorizedException("Not authenticated")
    }
}
