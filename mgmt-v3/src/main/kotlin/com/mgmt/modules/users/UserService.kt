package com.mgmt.modules.users

import com.mgmt.common.exception.*
import com.mgmt.domain.auth.*
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.SessionService
import com.mgmt.modules.auth.dto.*
import org.slf4j.LoggerFactory
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
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
    }

    // ─── Queries ─────────────────────────────────────────────────

    fun findAll(page: Int = 1, limit: Int = 20, search: String? = null): Page<UserSummary> {
        val pageable = PageRequest.of(
            (page - 1).coerceAtLeast(0),
            limit.coerceIn(1, 100),
            Sort.by(Sort.Direction.ASC, "username"),
        )
        val users = if (!search.isNullOrBlank()) {
            userRepo.searchActive(search, pageable)
        } else {
            userRepo.findAllActive(pageable)
        }
        return users.map { mapToSummary(it) }
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
        checkHierarchy(actorRoles, id, "update")
        val user = findEntity(id)

        request.email?.let { user.email = it }
        request.displayName?.let { user.displayName = it }
        request.status?.let { user.status = UserStatus.valueOf(it) }
        request.roles?.let { user.roles = it.toTypedArray() }
        user.updatedAt = Instant.now()

        userRepo.save(user)
        return mapToSummary(user)
    }

    // ─── Delete (soft) ───────────────────────────────────────────

    @Transactional
    fun delete(id: String, actorId: String, actorRoles: List<String>, reason: String?) {
        if (id == actorId) throw ForbiddenException("Cannot delete yourself")
        checkProtectedUser(id)
        checkHierarchy(actorRoles, id, "delete")

        val user = findEntity(id)
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
        checkProtectedUser(id)
        checkHierarchy(actorRoles, id, "lock")

        val user = findEntity(id)
        user.status = UserStatus.LOCKED
        user.updatedAt = Instant.now()
        userRepo.save(user)
        sessionService.forceLogout(id)
    }

    @Transactional
    fun unlock(id: String, actorId: String, actorRoles: List<String>) {
        checkHierarchy(actorRoles, id, "unlock")
        val user = findEntity(id)
        user.status = UserStatus.ACTIVE
        user.updatedAt = Instant.now()
        userRepo.save(user)
    }

    // ─── Permissions ─────────────────────────────────────────────

    @Transactional
    fun updatePermissions(id: String, permissions: Map<String, Any>, actorId: String, actorRoles: List<String>) {
        checkHierarchy(actorRoles, id, "updatePermissions")
        val user = findEntity(id)

        val objectMapper = com.fasterxml.jackson.databind.ObjectMapper()
        user.permissions = objectMapper.writeValueAsString(permissions)
        user.updatedAt = Instant.now()
        userRepo.save(user)

        // Clear cached permissions so next request re-fetches
        sessionService.clearPermissions(id)
    }

    // ─── Reset Password (admin action) ───────────────────────────

    @Transactional
    fun resetPassword(id: String, newPassword: String, actorId: String, actorRoles: List<String>) {
        if (id == actorId) throw ForbiddenException("Use change-password for your own password")
        checkProtectedUser(id)
        checkHierarchy(actorRoles, id, "resetPassword")

        val user = findEntity(id)
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
     * USER-3 Fix: Actor roles come from JWT (parameter), not extra DB query.
     */
    private fun checkHierarchy(actorRoles: List<String>, targetId: String, action: String) {
        val actorLevel = getHighestRoleLevel(actorRoles)
        val target = findEntity(targetId)
        val targetLevel = getHighestRoleLevel(target.roles.toList())
        if (actorLevel >= targetLevel) {
            throw ForbiddenException("Cannot $action: insufficient role hierarchy")
        }
    }

    private fun getHighestRoleLevel(roles: List<String>): Int {
        return roles.mapNotNull { ROLE_HIERARCHY[it] }.minOrNull() ?: 999
    }

    private fun checkProtectedUser(targetId: String) {
        val target = userRepo.findById(targetId).orElseThrow { NotFoundException.forEntity("User", targetId) }
        if (target.roles.contains("superuser")) {
            throw ForbiddenException("Cannot perform this action on SuperAdmin")
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
