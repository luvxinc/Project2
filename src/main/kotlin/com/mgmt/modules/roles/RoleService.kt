package com.mgmt.modules.roles

import com.mgmt.common.exception.*
import com.mgmt.domain.auth.*
import com.mgmt.modules.auth.SessionService
import com.mgmt.modules.auth.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*

/**
 * RoleService — CRUD for roles and permission boundaries.
 *
 * Ported from V2 RolesService (485 lines).
 * Fixes:
 *   ROLE-1: forceLogout delegated to SessionService (DRY)
 *   ROLE-2: Permission invalidation via SessionService Pipeline batch
 */
@Service
class RoleService(
    private val roleRepo: RoleRepository,
    private val boundaryRepo: RolePermissionBoundaryRepository,
    private val userRepo: UserRepository,
    private val sessionService: SessionService,
) {
    private val log = LoggerFactory.getLogger(RoleService::class.java)

    companion object {
        val SYSTEM_ROLES = setOf("superuser")
    }

    // ─── Queries ─────────────────────────────────────────────────

    fun findAll(): List<RoleResponse> {
        return roleRepo.findByIsActiveTrue().map { mapToResponse(it, includeBoundaries = false) }
    }

    fun findOne(id: String): RoleResponse {
        val role = roleRepo.findById(id).orElseThrow { NotFoundException.forEntity("Role", id) }
        return mapToResponse(role, includeBoundaries = true)
    }

    // ─── Create ──────────────────────────────────────────────────

    @Transactional
    fun create(request: CreateRoleRequest): RoleResponse {
        if (roleRepo.existsByName(request.name)) {
            throw BusinessException("Role '${request.name}' already exists")
        }
        val role = Role(
            id = UUID.randomUUID().toString(),
            name = request.name,
            displayName = request.displayName,
            level = request.level,
            description = request.description,
            color = request.color,
        )
        roleRepo.save(role)
        log.info("Role created: {}", role.name)
        return mapToResponse(role)
    }

    // ─── Update ──────────────────────────────────────────────────

    @Transactional
    fun update(id: String, request: UpdateRoleRequest): RoleResponse {
        val role = findEntity(id)
        request.name?.let {
            if (it != role.name && roleRepo.existsByName(it)) {
                throw BusinessException("Role name '$it' already taken")
            }
            role.name = it
        }
        request.displayName?.let { role.displayName = it }
        request.level?.let { role.level = it }
        request.description?.let { role.description = it }
        request.color?.let { role.color = it }
        role.updatedAt = Instant.now()
        roleRepo.save(role)
        return mapToResponse(role)
    }

    // ─── Delete ──────────────────────────────────────────────────

    @Transactional
    fun delete(id: String) {
        val role = findEntity(id)
        if (role.name in SYSTEM_ROLES) {
            throw ForbiddenException("Cannot delete system role: ${role.name}")
        }
        val usersWithRole = userRepo.findByRole(role.name)
        if (usersWithRole.isNotEmpty()) {
            throw BusinessException("角色 '${role.displayName}' 正在被 ${usersWithRole.size} 个用户使用，无法删除")
        }
        role.isActive = false
        role.updatedAt = Instant.now()
        roleRepo.save(role)
        log.info("Role deactivated: {}", role.name)
    }

    // ─── Seed ────────────────────────────────────────────────────

    /**
     * Initialize default system roles if they don't already exist.
     * Called by POST /roles/seed (requires L4).
     */
    @Transactional
    fun seed(): Int {
        val defaults = listOf(
            Triple("superuser", "超级管理员", 100),
            Triple("admin", "管理员", 90),
            Triple("manager", "经理", 70),
            Triple("staff", "员工", 50),
            Triple("operator", "操作员", 30),
            Triple("viewer", "只读", 10),
        )
        var seeded = 0
        for ((name, displayName, level) in defaults) {
            if (!roleRepo.existsByName(name)) {
                roleRepo.save(Role(
                    id = UUID.randomUUID().toString(),
                    name = name,
                    displayName = displayName,
                    level = level,
                    isSystem = name == "superuser",
                ))
                seeded++
                log.info("Seeded role: {}", name)
            }
        }
        log.info("Role seed complete: {} roles created", seeded)
        return seeded
    }

    // ─── Boundaries ──────────────────────────────────────────────

    fun getBoundaries(roleId: String): List<BoundaryResponse> {
        return boundaryRepo.findByRoleId(roleId).map { mapBoundary(it) }
    }

    /**
     * Set all boundaries for a role (replace).
     * After change, invalidate permissions for all users with this role.
     */
    @Transactional
    fun setBoundaries(roleId: String, boundaries: List<BoundaryRequest>) {
        val role = findEntity(roleId)

        // Delete existing — must flush before inserting new ones
        // to avoid unique constraint violations in JPA's write-behind cache
        boundaryRepo.deleteAllByRoleId(roleId)
        boundaryRepo.flush()

        // Create new
        val newBoundaries = boundaries.map { req ->
            RolePermissionBoundary(
                id = UUID.randomUUID().toString(),
                roleId = roleId,
                permissionKey = req.permissionKey,
                boundaryType = BoundaryType.valueOf(req.boundaryType),
                description = req.description,
            )
        }
        boundaryRepo.saveAll(newBoundaries)

        // ROLE-1/ROLE-2 Fix: Revoke all users with this role → force re-login with modal
        val affectedUsers = userRepo.findByRole(role.name)
        sessionService.revokePermissionsBatch(affectedUsers.map { it.id }, "ROLE_BOUNDARY_CHANGED")

        log.info("Boundaries updated for role {} — {} users affected (forced re-login)", role.name, affectedUsers.size)
    }

    @Transactional
    fun addBoundary(roleId: String, request: BoundaryRequest): BoundaryResponse {
        findEntity(roleId) // validate exists
        val boundary = RolePermissionBoundary(
            id = UUID.randomUUID().toString(),
            roleId = roleId,
            permissionKey = request.permissionKey,
            boundaryType = BoundaryType.valueOf(request.boundaryType),
            description = request.description,
        )
        boundaryRepo.save(boundary)
        return mapBoundary(boundary)
    }

    @Transactional
    fun removeBoundary(roleId: String, permissionKey: String) {
        boundaryRepo.deleteByRoleIdAndPermissionKey(roleId, permissionKey)
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun findEntity(id: String): Role {
        return roleRepo.findById(id).orElseThrow { NotFoundException.forEntity("Role", id) }
    }

    private fun mapToResponse(role: Role, includeBoundaries: Boolean = false): RoleResponse {
        val boundaries = if (includeBoundaries) {
            boundaryRepo.findByRoleId(role.id).map { mapBoundary(it) }
        } else null
        return RoleResponse(
            id = role.id,
            name = role.name,
            displayName = role.displayName,
            level = role.level,
            description = role.description,
            isSystem = role.isSystem,
            isActive = role.isActive,
            color = role.color,
            boundaries = boundaries,
            createdAt = role.createdAt,
            updatedAt = role.updatedAt,
        )
    }

    private fun mapBoundary(b: RolePermissionBoundary) = BoundaryResponse(
        id = b.id,
        permissionKey = b.permissionKey,
        boundaryType = b.boundaryType.name,
        description = b.description,
    )
}
