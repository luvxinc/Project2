package com.mgmt.modules.roles

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.dto.*
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/roles")
class RoleController(
    private val roleService: RoleService,
) {
    @GetMapping
    @RequirePermission("module.user_admin.role_switches")
    fun findAll(): ApiResponse<List<RoleResponse>> {
        return ApiResponse.ok(roleService.findAll())
    }

    @GetMapping("/{id}")
    @RequirePermission("module.user_admin.role_switches")
    fun findOne(@PathVariable id: String): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.findOne(id))
    }

    @PostMapping
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L2", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "CREATE_ROLE", riskLevel = "HIGH")
    fun create(@Valid @RequestBody request: CreateRoleRequest): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.create(request))
    }

    @PatchMapping("/{id}")
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L2", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "UPDATE_ROLE", riskLevel = "HIGH")
    fun update(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateRoleRequest,
    ): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.update(id, request))
    }

    @DeleteMapping("/{id}")
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L4", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "DELETE_ROLE", riskLevel = "CRITICAL")
    fun delete(@PathVariable id: String): ApiResponse<Map<String, String>> {
        roleService.delete(id)
        return ApiResponse.ok(mapOf("message" to "角色已删除"))
    }

    @PostMapping("/seed")
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L4", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "SEED_ROLES")
    fun seed(): ApiResponse<Map<String, Any>> {
        val seeded = roleService.seed()
        return ApiResponse.ok(mapOf("seeded" to seeded, "message" to "角色初始化完成"))
    }

    // ─── Boundaries ──────────────────────────────────────────────

    @GetMapping("/{id}/boundaries")
    fun getBoundaries(@PathVariable id: String): ApiResponse<List<BoundaryResponse>> {
        return ApiResponse.ok(roleService.getBoundaries(id))
    }

    @PutMapping("/{id}/boundaries")
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L2", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "SET_BOUNDARIES", riskLevel = "HIGH")
    fun setBoundaries(
        @PathVariable id: String,
        @Valid @RequestBody request: SetBoundariesRequest,
    ): ApiResponse<Map<String, String>> {
        roleService.setBoundaries(id, request.boundaries)
        return ApiResponse.ok(mapOf("message" to "权限边界已更新"))
    }

    @PostMapping("/{id}/boundaries")
    @RequirePermission("module.user_admin.role_switches")
    @AuditLog(module = "ROLE", action = "ADD_BOUNDARY")
    fun addBoundary(
        @PathVariable id: String,
        @Valid @RequestBody request: BoundaryRequest,
    ): ApiResponse<BoundaryResponse> {
        return ApiResponse.ok(roleService.addBoundary(id, request))
    }

    @DeleteMapping("/{id}/boundaries/{permissionKey}")
    @RequirePermission("module.user_admin.role_switches")
    @SecurityLevel(level = "L2", actionKey = "btn_manage_roles")
    @AuditLog(module = "ROLE", action = "REMOVE_BOUNDARY", riskLevel = "HIGH")
    fun removeBoundary(
        @PathVariable id: String,
        @PathVariable permissionKey: String,
    ): ApiResponse<Map<String, String>> {
        roleService.removeBoundary(id, permissionKey)
        return ApiResponse.ok(mapOf("message" to "权限边界已删除"))
    }
}
