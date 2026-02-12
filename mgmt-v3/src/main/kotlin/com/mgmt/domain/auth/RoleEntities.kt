package com.mgmt.domain.auth

import jakarta.persistence.*
import java.time.Instant

/**
 * Role entity — maps to 'roles' table.
 */
@Entity
@Table(name = "roles")
class Role(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(unique = true, nullable = false)
    var name: String = "",

    @Column(name = "display_name", nullable = false)
    var displayName: String = "",

    @Column(unique = true, nullable = false)
    var level: Int = 0,

    var description: String? = null,

    @Column(name = "is_system", nullable = false)
    var isSystem: Boolean = false,

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    var color: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @OneToMany(mappedBy = "role", cascade = [CascadeType.ALL], orphanRemoval = true)
    var boundaries: MutableList<RolePermissionBoundary> = mutableListOf(),
)

/**
 * RolePermissionBoundary entity — maps to 'role_permission_boundaries' table.
 */
@Entity
@Table(
    name = "role_permission_boundaries",
    uniqueConstraints = [UniqueConstraint(columnNames = ["role_id", "permission_key"])],
    indexes = [
        Index(name = "idx_rpb_role", columnList = "role_id"),
        Index(name = "idx_rpb_perm", columnList = "permission_key")
    ]
)
class RolePermissionBoundary(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(name = "role_id", nullable = false)
    var roleId: String = "",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", insertable = false, updatable = false)
    var role: Role? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "boundary_type", nullable = false)
    var boundaryType: BoundaryType = BoundaryType.ALLOWED,

    @Column(name = "permission_key", nullable = false)
    var permissionKey: String = "",

    var description: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)

enum class BoundaryType {
    ALLOWED, DENIED, INHERITED
}
