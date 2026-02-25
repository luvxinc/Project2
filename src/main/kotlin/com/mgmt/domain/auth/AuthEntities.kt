package com.mgmt.domain.auth

import jakarta.persistence.*
import java.time.Instant

/**
 * RefreshToken entity — maps to 'refresh_tokens' table.
 */
@Entity
@Table(name = "refresh_tokens", indexes = [
    Index(name = "idx_refresh_token_user", columnList = "user_id"),
    Index(name = "idx_refresh_token_expires", columnList = "expires_at")
])
class RefreshToken(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(unique = true, nullable = false)
    var token: String = "",

    @Column(name = "user_id", nullable = false)
    var userId: String = "",

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "revoked_at")
    var revokedAt: Instant? = null,
)

/**
 * SecurityCode entity — maps to 'security_codes' table.
 * L1-L4 security verification codes (bcrypt hashed).
 */
@Entity
@Table(name = "security_codes", uniqueConstraints = [
    UniqueConstraint(columnNames = ["level", "is_active"])
])
class SecurityCode(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(nullable = false)
    var level: String = "",  // L1, L2, L3, L4

    @Column(name = "code_hash", nullable = false)
    var codeHash: String = "",

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
