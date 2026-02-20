package com.mgmt.modules.auth.dto

import jakarta.validation.constraints.*
import java.time.Instant

// ─── Auth DTOs ───────────────────────────────────────────────

data class LoginRequest(
    @field:NotBlank(message = "Username is required")
    val username: String,
    @field:NotBlank(message = "Password is required")
    val password: String,
    val rememberMe: Boolean = false,
)

data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
    val user: UserSummary,
)

data class RefreshRequest(
    @field:NotBlank(message = "Refresh token is required")
    val refreshToken: String,
)

data class RefreshResponse(
    val accessToken: String,
    val expiresIn: Long,
)

data class ChangePasswordRequest(
    @field:NotBlank
    val currentPassword: String,
    @field:NotBlank
    @field:Size(min = 8, message = "New password must be at least 8 characters")
    val newPassword: String,
    @field:NotBlank
    val confirmPassword: String,
)

data class VerifySecurityRequest(
    @field:NotBlank
    val securityLevel: String,    // L1, L2, L3, L4
    @field:NotBlank
    val securityCode: String,
    @field:NotBlank
    val actionKey: String,
)

data class VerifySecurityResponse(
    val verified: Boolean,
    val securityToken: String,
    val validUntil: Instant,
)

// ─── User DTOs ───────────────────────────────────────────────

data class UserSummary(
    val id: String,
    val username: String,
    val email: String,
    val displayName: String?,
    val status: String,
    val roles: List<String>,
    val permissions: Any?,         // flat key list for frontend
    val settings: Any?,
    val lastLoginAt: Instant?,
    val createdAt: Instant,
)

data class CreateUserRequest(
    @field:NotBlank
    @field:Size(min = 3, max = 50)
    @field:Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "Username can only contain letters, numbers, and underscores")
    val username: String,
    @field:NotBlank @field:Email
    val email: String,
    @field:NotBlank
    @field:Size(min = 8, message = "Password must be at least 8 characters")
    val password: String,
    val displayName: String? = null,
    val roles: List<String> = listOf("viewer"),
)

data class UpdateUserRequest(
    val email: String? = null,
    val displayName: String? = null,
    val status: String? = null,
    val roles: List<String>? = null,
)

data class UpdatePermissionsRequest(
    val permissions: Map<String, Any>,    // flat or structured
)

data class ResetPasswordRequest(
    @field:NotBlank
    @field:Size(min = 6)
    val newPassword: String,
)

// ─── Role DTOs ───────────────────────────────────────────────

data class CreateRoleRequest(
    @field:NotBlank val name: String,
    @field:NotBlank val displayName: String,
    val level: Int,
    val description: String? = null,
    val color: String? = null,
)

data class UpdateRoleRequest(
    val name: String? = null,
    val displayName: String? = null,
    val level: Int? = null,
    val description: String? = null,
    val color: String? = null,
)

data class BoundaryRequest(
    @field:NotBlank val permissionKey: String,
    @field:NotBlank val boundaryType: String,   // ALLOWED, DENIED, INHERITED
    val description: String? = null,
)

data class SetBoundariesRequest(
    val boundaries: List<BoundaryRequest>,
)

data class RoleResponse(
    val id: String,
    val name: String,
    val displayName: String,
    val level: Int,
    val description: String?,
    val isSystem: Boolean,
    val isActive: Boolean,
    val color: String?,
    val boundaries: List<BoundaryResponse>? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class BoundaryResponse(
    val id: String,
    val permissionKey: String,
    val boundaryType: String,
    val description: String?,
)

// ─── Security Policy DTOs ───────────────────────────────────

data class SecurityPolicyRequest(
    val policies: Map<String, List<String>>,
    @com.fasterxml.jackson.annotation.JsonProperty("sec_code_l0")
    val secCodeL0: String? = null,
    @com.fasterxml.jackson.annotation.JsonProperty("sec_code_l4")
    val secCodeL4: String? = null,
)

