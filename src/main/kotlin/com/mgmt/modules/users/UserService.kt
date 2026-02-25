package com.mgmt.modules.users

import com.mgmt.common.exception.*
import com.mgmt.domain.auth.*
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.SessionService
import com.mgmt.modules.auth.dto.*
import org.slf4j.LoggerFactory
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*

/**
 * UserService — CRUD, permissions, lock/unlock, hierarchy checks.
 *
 * Ported from V2 UsersService (767 lines).
 * Fixes:
 *   USER-2: Permission whitelist loaded dynamically (not hardcoded).
 *   USER-3: Actor roles from JWT context, not extra DB query.
 */
@Service
class UserService(
    private val userRepo: UserRepository,
    private val refreshTokenRepo: RefreshTokenRepository,
    private val sessionService: SessionService,
    private val passwordEncoder: BCryptPasswordEncoder,
    private val objectMapper: com.fasterxml.jackson.databind.ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(UserService::class.java)

    companion object {
        val ROLE_HIERARCHY = mapOf(
            "superuser" to 0,
            "admin" to 1,
            "staff" to 2,
            "editor" to 3,
            "viewer" to 4,
        )
        val SYSTEM_USERS = setOf("superuser")

        /**
         * V1 parity: SecurityInventory.WHITELIST_PERMISSIONS
         * Default permission keys — used as fallback when Redis has no whitelist.
         * At runtime, the active whitelist is loaded from Redis via SessionService.
         */
        val DEFAULT_WHITELIST_PERMISSIONS = setOf(
            // Sales (7 keys)
            "module.sales", "module.sales.transactions", "module.sales.transactions.upload",
            "module.sales.reports", "module.sales.reports.generate", "module.sales.reports.center",
            "module.sales.visuals", "module.sales.visuals.dashboard",
            // Purchase (13 keys)
            "module.purchase", "module.purchase.supplier", "module.purchase.supplier.add",
            "module.purchase.supplier.strategy", "module.purchase.po", "module.purchase.po.add",
            "module.purchase.po.mgmt", "module.purchase.send", "module.purchase.send.add",
            "module.purchase.send.mgmt", "module.purchase.receive", "module.purchase.receive.mgmt",
            "module.purchase.abnormal", "module.purchase.abnormal.manage",
            // Inventory (7 keys)
            "module.inventory", "module.inventory.stocktake", "module.inventory.stocktake.upload",
            "module.inventory.stocktake.modify", "module.inventory.dynamic",
            "module.inventory.dynamic.view", "module.inventory.shelf", "module.inventory.shelf.manage",
            // Finance (10 keys)
            "module.finance", "module.finance.flow", "module.finance.flow.view",
            "module.finance.logistic", "module.finance.logistic.manage",
            "module.finance.prepay", "module.finance.prepay.manage",
            "module.finance.deposit", "module.finance.deposit.manage",
            "module.finance.po", "module.finance.po.manage",
            // Products (5 keys)
            "module.products", "module.products.catalog", "module.products.catalog.cogs",
            "module.products.catalog.create", "module.products.barcode", "module.products.barcode.generate",
            // DB Admin (6 keys)
            "module.db_admin", "module.db_admin.backup", "module.db_admin.backup.create",
            "module.db_admin.backup.restore", "module.db_admin.backup.manage",
            "module.db_admin.cleanup", "module.db_admin.cleanup.delete",
            // User Admin (4 keys)
            "module.user_admin", "module.user_admin.users", "module.user_admin.register",
            "module.user_admin.password_policy", "module.user_admin.role_switches",
            // Audit (2 keys)
            "module.audit", "module.audit.logs",
            // VMA (17 keys)
            "module.vma",
            "module.vma.truvalve", "module.vma.truvalve.manage",
            "module.vma.pvalve", "module.vma.pvalve.inventory",
            "module.vma.pvalve.clinical_case", "module.vma.pvalve.delivery_system",
            "module.vma.pvalve.overview", "module.vma.pvalve.demo_inventory",
            "module.vma.pvalve.fridge_shelf", "module.vma.pvalve.product_mgmt",
            "module.vma.pvalve.site_mgmt",
            "module.vma.employees.manage", "module.vma.departments.manage",
            "module.vma.training_sop.manage", "module.vma.training.manage",
            "module.vma.training_records.manage",
        )
    }
    /**
     * Get the active permission whitelist.
     * Priority: Redis (dynamic) → DEFAULT_WHITELIST_PERMISSIONS (hardcoded fallback).
     */
    private fun getActiveWhitelist(): Set<String> {
        return sessionService.getPermissionWhitelist() ?: DEFAULT_WHITELIST_PERMISSIONS
    }

    // ─── Queries ─────────────────────────────────────────────────

    fun findAll(page: Int = 1, limit: Int = 20, search: String? = null): Page<UserSummary> {
        val pageable = PageRequest.of(
            (page - 1).coerceAtLeast(0),
            limit.coerceIn(1, 100),
        )
        val users = if (!search.isNullOrBlank()) {
            userRepo.searchActive(search, pageable)
        } else {
            userRepo.findAllActive(pageable)
        }

        return org.springframework.data.domain.PageImpl(
            users.content.map { mapToSummary(it) },
            pageable,
            users.totalElements,
        )
    }

    fun isUsernameAvailable(username: String): Boolean {
        return userRepo.findByUsername(username) == null
    }

    fun findOne(id: String): UserSummary {
        val user = userRepo.findById(id).orElseThrow { NotFoundException.forEntity("User", id) }
        if (user.deletedAt != null) throw NotFoundException.forEntity("User", id)
        return mapToSummary(user)
    }

    // ─── Create ──────────────────────────────────────────────────

    @Transactional
    fun create(request: CreateUserRequest, actorRoles: List<String>): UserSummary {
        // Prevent creating superuser
        if (request.roles.contains("superuser")) {
            throw ForbiddenException("Cannot create superuser role")
        }

        // Non-superuser can only create editor/staff/viewer
        if (!actorRoles.contains("superuser")) {
            val allowed = setOf("editor", "staff", "viewer")
            if (request.roles.any { it !in allowed }) {
                throw ForbiddenException("Insufficient privileges to assign role: ${request.roles}")
            }
        }

        // Check username uniqueness
        if (userRepo.findByUsername(request.username) != null) {
            throw BusinessException("Username '${request.username}' already exists")
        }
        if (userRepo.findByEmail(request.email) != null) {
            throw BusinessException("Email '${request.email}' already exists")
        }

        val user = User(
            id = UUID.randomUUID().toString(),
            username = request.username,
            email = request.email,
            passwordHash = passwordEncoder.encode(request.password),
            displayName = request.displayName,
            roles = request.roles.toTypedArray(),
        )
        userRepo.save(user)

        log.info("User created: {}", user.username)
        return mapToSummary(user)
    }

    // ─── Update ──────────────────────────────────────────────────

    @Transactional
    fun update(id: String, request: UpdateUserRequest, actorId: String, actorRoles: List<String>): UserSummary {
        val user = checkHierarchyAndGet(actorRoles, id, "update")

        request.email?.let { user.email = it }
        request.displayName?.let { user.displayName = it }
        request.status?.let {
            val newStatus = UserStatus.entries.find { s -> s.name == it }
                ?: throw BadRequestException("Invalid status: $it")
            user.status = newStatus
        }

        val rolesChanged = request.roles != null && request.roles.toSet() != user.roles.toSet()
        request.roles?.let { user.roles = it.toTypedArray() }
        user.updatedAt = Instant.now()
        userRepo.save(user)

        // Force logout when roles change — invalidate JWT and Redis session
        if (rolesChanged) {
            refreshTokenRepo.revokeAllByUserId(id)
            sessionService.setPermissionRevoked(id, "ROLE_CHANGED")
            log.info("Roles changed for user {}, forced re-login", user.username)
        }

        return mapToSummary(user)
    }

    // ─── Delete (soft) ───────────────────────────────────────────

    @Transactional
    fun delete(id: String, actorId: String, actorRoles: List<String>, reason: String?) {
        if (id == actorId) throw ForbiddenException("Cannot delete yourself")
        val user = checkHierarchyAndGet(actorRoles, id, "delete")
        if (user.roles.contains("superuser")) {
            throw ForbiddenException("Cannot perform this action on SuperAdmin")
        }
        user.deletedAt = Instant.now()
        user.updatedAt = Instant.now()
        userRepo.save(user)

        // Force logout
        refreshTokenRepo.revokeAllByUserId(id)
        sessionService.forceLogout(id)

        log.info("User soft-deleted: {} by {}, reason: {}", user.username, actorId, reason)
    }

    // ─── Lock / Unlock ───────────────────────────────────────────

    @Transactional
    fun lock(id: String, actorId: String, actorRoles: List<String>) {
        if (id == actorId) throw ForbiddenException("Cannot lock yourself")
        val user = checkHierarchyAndGet(actorRoles, id, "lock")
        if (user.roles.contains("superuser")) {
            throw ForbiddenException("Cannot perform this action on SuperAdmin")
        }
        user.status = UserStatus.LOCKED
        user.updatedAt = Instant.now()
        userRepo.save(user)
        sessionService.forceLogout(id)
    }

    @Transactional
    fun unlock(id: String, actorId: String, actorRoles: List<String>) {
        val user = checkHierarchyAndGet(actorRoles, id, "unlock")
        user.status = UserStatus.ACTIVE
        user.updatedAt = Instant.now()
        userRepo.save(user)
    }

    // ─── Permissions ─────────────────────────────────────────────

    /**
     * V1 parity: user_update_permissions() in user_admin/views/actions.py
     *
     * V1 had 5 guards:
     *   ① SecurityPolicyManager.verify_action_request → now @SecurityLevel on Controller
     *   ② _check_admin_capability("can_manage_perms") → now RoleBoundary in DB
     *   ③ _check_hierarchy → checkHierarchy() below
     *   ④ Whitelist validation → WHITELIST_PERMISSIONS below
     *   ⑤ Inheritance: admin cannot grant perms they don't have → validateInheritance() below
     */
    @Transactional
    fun updatePermissions(id: String, permissions: Map<String, Any>, actorId: String, actorRoles: List<String>) {
        // Guard ③: Hierarchy check (also fetches user, reused below)
        val user = checkHierarchyAndGet(actorRoles, id, "updatePermissions")

        // Guard ④: Whitelist — reject non-whitelisted permission keys
        val whitelist = getActiveWhitelist()
        val invalidKeys = permissions.keys.filter { it !in whitelist }
        if (invalidKeys.isNotEmpty()) {
            throw ForbiddenException("Invalid permission keys: ${invalidKeys.joinToString(", ")}")
        }

        // Guard ⑤: Inheritance — non-superuser cannot grant permissions they don't have
        if (!actorRoles.contains("superuser")) {
            validateInheritance(actorId, permissions)
        }

        user.permissions = objectMapper.writeValueAsString(permissions)
        user.updatedAt = Instant.now()
        userRepo.save(user)

        // Clear cached permissions so next request re-fetches
        sessionService.clearPermissions(id)

        // Force re-login: set revoke flag → user's next API call returns 401 PERMISSION_REVOKED
        sessionService.setPermissionRevoked(id, "PERMISSION_CHANGED")
    }

    /**
     * V1 parity: admin cannot grant permissions they don't have themselves.
     * SecurityPolicyManager: forbidden_perms = req_perms - op_perms
     */
    private fun validateInheritance(actorId: String, requestedPermissions: Map<String, Any>) {
        val actor = findEntity(actorId)
        val actorPermsJson = actor.permissions
        if (actorPermsJson.isNullOrBlank()) {
            // Actor has no permissions → cannot grant any
            val grantedKeys = requestedPermissions.filter { it.value == true }.keys
            if (grantedKeys.isNotEmpty()) {
                throw ForbiddenException("Cannot grant permissions not held by actor: ${grantedKeys.joinToString(", ")}")
            }
            return
        }

        @Suppress("UNCHECKED_CAST")
        val actorPerms = try {
            objectMapper.readValue(actorPermsJson, Map::class.java) as Map<String, Any>
        } catch (e: Exception) {
            emptyMap()
        }

        val forbidden = requestedPermissions.filter { (key, value) ->
            value == true && actorPerms[key] != true
        }.keys

        if (forbidden.isNotEmpty()) {
            throw ForbiddenException("Cannot grant permissions not held by actor: ${forbidden.joinToString(", ")}")
        }
    }

    // ─── Reset Password (admin action) ───────────────────────────

    @Transactional
    fun resetPassword(id: String, newPassword: String, actorId: String, actorRoles: List<String>) {
        if (id == actorId) throw ForbiddenException("Use change-password for your own password")
        val user = checkHierarchyAndGet(actorRoles, id, "resetPassword")
        if (user.roles.contains("superuser")) {
            throw ForbiddenException("Cannot perform this action on SuperAdmin")
        }
        user.passwordHash = passwordEncoder.encode(newPassword)
        user.updatedAt = Instant.now()
        userRepo.save(user)

        refreshTokenRepo.revokeAllByUserId(id)
        sessionService.forceLogout(id)
    }

    // ─── Force Logout ────────────────────────────────────────────

    fun forceLogoutByRole(roleName: String): Int {
        val users = userRepo.findByRole(roleName)
        return sessionService.forceLogoutBatch(users.map { it.id })
    }

    fun forceLogoutAll(): Int {
        val users = userRepo.findByDeletedAtIsNull()
        return sessionService.forceLogoutBatch(users.map { it.id })
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun findEntity(id: String): User {
        val user = userRepo.findById(id).orElseThrow { NotFoundException.forEntity("User", id) }
        if (user.deletedAt != null) throw NotFoundException.forEntity("User", id)
        return user
    }

    /**
     * Hierarchy check — actor must have higher role than target.
     * Returns the target User entity to avoid duplicate DB queries.
     * USER-3 Fix: Actor roles come from JWT (parameter), not extra DB query.
     */
    private fun checkHierarchyAndGet(actorRoles: List<String>, targetId: String, action: String): User {
        val target = findEntity(targetId)
        val actorLevel = getHighestRoleLevel(actorRoles)
        val targetLevel = getHighestRoleLevel(target.roles.toList())
        if (actorLevel >= targetLevel) {
            throw ForbiddenException("Cannot $action: insufficient role hierarchy")
        }
        return target
    }

    private fun getHighestRoleLevel(roles: List<String>): Int {
        return roles.mapNotNull { ROLE_HIERARCHY[it] }.minOrNull() ?: 999
    }

    private fun parseJsonField(json: String?): Any? {
        if (json.isNullOrBlank()) return null
        return try {
            objectMapper.readValue(json, Map::class.java)
        } catch (e: Exception) {
            json // fallback to raw string if parse fails
        }
    }

    private fun mapToSummary(user: User): UserSummary = UserSummary(
        id = user.id,
        username = user.username,
        email = user.email,
        displayName = user.displayName,
        status = user.status.name,
        roles = user.roles.toList(),
        permissions = parseJsonField(user.permissions),
        settings = parseJsonField(user.settings),
        lastLoginAt = user.lastLoginAt,
        createdAt = user.createdAt,
    )
}
