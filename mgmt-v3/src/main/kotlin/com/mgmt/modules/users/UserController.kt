package com.mgmt.modules.users

import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.dto.*
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/users")
class UserController(
    private val userService: UserService,
) {
    @GetMapping
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
    ): ApiResponse<Any> {
        val result = userService.findAll(page, limit, search)
        return ApiResponse.ok(mapOf(
            "users" to result.content,
            "total" to result.totalElements,
            "page" to result.number + 1,
            "totalPages" to result.totalPages,
        ))
    }

    @GetMapping("/me")
    fun getCurrentUser(request: HttpServletRequest): ApiResponse<UserSummary> {
        val claims = extractClaims(request)
        return ApiResponse.ok(userService.findOne(claims.userId))
    }

    @GetMapping("/{id}")
    fun findOne(@PathVariable id: String): ApiResponse<UserSummary> {
        return ApiResponse.ok(userService.findOne(id))
    }

    @PostMapping
    @SecurityLevel(level = "L2", actionKey = "btn_create_user")
    fun create(
        @Valid @RequestBody request: CreateUserRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<UserSummary> {
        val claims = extractClaims(httpRequest)
        val user = userService.create(request, claims.roles)
        return ApiResponse.ok(user)
    }

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateUserRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<UserSummary> {
        val claims = extractClaims(httpRequest)
        val user = userService.update(id, request, claims.userId, claims.roles)
        return ApiResponse.ok(user)
    }

    @DeleteMapping("/{id}")
    @SecurityLevel(level = "L4", actionKey = "btn_delete_user")
    fun delete(
        @PathVariable id: String,
        @RequestParam(required = false) reason: String?,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        userService.delete(id, claims.userId, claims.roles, reason)
        return ApiResponse.ok(mapOf("message" to "用户已删除"))
    }

    @PostMapping("/{id}/lock")
    @SecurityLevel(level = "L2", actionKey = "btn_toggle_user_lock")
    fun lock(@PathVariable id: String, httpRequest: HttpServletRequest): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        userService.lock(id, claims.userId, claims.roles)
        return ApiResponse.ok(mapOf("message" to "用户已锁定"))
    }

    @PostMapping("/{id}/unlock")
    @SecurityLevel(level = "L2", actionKey = "btn_toggle_user_lock")
    fun unlock(@PathVariable id: String, httpRequest: HttpServletRequest): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        userService.unlock(id, claims.userId, claims.roles)
        return ApiResponse.ok(mapOf("message" to "用户已解锁"))
    }

    @PutMapping("/{id}/permissions")
    @SecurityLevel(level = "L2", actionKey = "btn_update_perms")
    fun updatePermissions(
        @PathVariable id: String,
        @RequestBody request: UpdatePermissionsRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        userService.updatePermissions(id, request.permissions, claims.userId, claims.roles)
        return ApiResponse.ok(mapOf("message" to "权限已更新"))
    }

    @PostMapping("/{id}/reset-password")
    @SecurityLevel(level = "L3", actionKey = "btn_reset_pwd")
    fun resetPassword(
        @PathVariable id: String,
        @Valid @RequestBody request: ResetPasswordRequest,
        httpRequest: HttpServletRequest,
    ): ApiResponse<Map<String, String>> {
        val claims = extractClaims(httpRequest)
        userService.resetPassword(id, request.newPassword, claims.userId, claims.roles)
        return ApiResponse.ok(mapOf("message" to "密码已重置"))
    }

    private fun extractClaims(request: HttpServletRequest): JwtTokenProvider.TokenClaims {
        val auth = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication
        return auth?.principal as? JwtTokenProvider.TokenClaims
            ?: throw com.mgmt.common.exception.UnauthorizedException("Not authenticated")
    }
}
