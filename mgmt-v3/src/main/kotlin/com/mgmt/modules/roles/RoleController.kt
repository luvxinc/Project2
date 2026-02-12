package com.mgmt.modules.roles

import com.mgmt.common.response.ApiResponse
import com.mgmt.modules.auth.dto.*
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/roles")
class RoleController(
    private val roleService: RoleService,
) {
    @GetMapping
    fun findAll(): ApiResponse<List<RoleResponse>> {
        return ApiResponse.ok(roleService.findAll())
    }

    @GetMapping("/{id}")
    fun findOne(@PathVariable id: String): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.findOne(id))
    }

    @PostMapping
    fun create(@Valid @RequestBody request: CreateRoleRequest): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.create(request))
    }

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateRoleRequest,
    ): ApiResponse<RoleResponse> {
        return ApiResponse.ok(roleService.update(id, request))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String): ApiResponse<Map<String, String>> {
        roleService.delete(id)
        return ApiResponse.ok(mapOf("message" to "角色已删除"))
    }

    @PostMapping("/seed")
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
    fun setBoundaries(
        @PathVariable id: String,
        @Valid @RequestBody request: SetBoundariesRequest,
    ): ApiResponse<Map<String, String>> {
        roleService.setBoundaries(id, request.boundaries)
        return ApiResponse.ok(mapOf("message" to "权限边界已更新"))
    }

    @PostMapping("/{id}/boundaries")
    fun addBoundary(
        @PathVariable id: String,
        @Valid @RequestBody request: BoundaryRequest,
    ): ApiResponse<BoundaryResponse> {
        return ApiResponse.ok(roleService.addBoundary(id, request))
    }

    @DeleteMapping("/{id}/boundaries/{permissionKey}")
    fun removeBoundary(
        @PathVariable id: String,
        @PathVariable permissionKey: String,
    ): ApiResponse<Map<String, String>> {
        roleService.removeBoundary(id, permissionKey)
        return ApiResponse.ok(mapOf("message" to "权限边界已删除"))
    }
}
