package com.mgmt.domain.auth

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.time.Instant

interface UserRepository : JpaRepository<User, String> {

    fun findByUsername(username: String): User?

    fun findByEmail(email: String): User?

    fun findByDeletedAtIsNull(): List<User>

    @Query(value = """
        SELECT * FROM users
        WHERE deleted_at IS NULL
        AND (LOWER(username) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(display_name) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(email) LIKE LOWER(CONCAT('%', :search, '%')))
        ORDER BY CASE WHEN 'superuser' = ANY(roles) THEN 0 WHEN 'admin' = ANY(roles) THEN 1 WHEN 'staff' = ANY(roles) THEN 2 WHEN 'editor' = ANY(roles) THEN 3 ELSE 4 END, username
    """, countQuery = "SELECT count(*) FROM users WHERE deleted_at IS NULL AND (LOWER(username) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(display_name) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(email) LIKE LOWER(CONCAT('%', :search, '%')))", nativeQuery = true)
    fun searchActive(search: String, pageable: Pageable): Page<User>

    @Query(value = "SELECT * FROM users WHERE deleted_at IS NULL ORDER BY CASE WHEN 'superuser' = ANY(roles) THEN 0 WHEN 'admin' = ANY(roles) THEN 1 WHEN 'staff' = ANY(roles) THEN 2 WHEN 'editor' = ANY(roles) THEN 3 ELSE 4 END, username", countQuery = "SELECT count(*) FROM users WHERE deleted_at IS NULL", nativeQuery = true)
    fun findAllActive(pageable: Pageable): Page<User>

    /** Find all active users that have a given role in their roles array (PostgreSQL ANY) */
    @Query(value = "SELECT * FROM users WHERE deleted_at IS NULL AND :role = ANY(roles)", nativeQuery = true)
    fun findByRole(role: String): List<User>

    @Query("SELECT u FROM User u WHERE u.deletedAt IS NULL AND u.id IN :ids")
    fun findAllActiveByIds(ids: Collection<String>): List<User>

    /** Update lastLoginAt directly — bypasses @Version to avoid OptimisticLockException on concurrent login */
    @Modifying
    @Query("UPDATE User u SET u.lastLoginAt = :now WHERE u.id = :userId")
    fun updateLastLoginAt(userId: String, now: Instant)
}

interface RefreshTokenRepository : JpaRepository<RefreshToken, String> {

    fun findByToken(token: String): RefreshToken?

    fun findByUserIdAndRevokedAtIsNull(userId: String): List<RefreshToken>

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :now WHERE rt.userId = :userId AND rt.revokedAt IS NULL")
    fun revokeAllByUserId(userId: String, now: Instant = Instant.now()): Int

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.expiresAt < :cutoff OR (rt.revokedAt IS NOT NULL AND rt.revokedAt < :cutoff)")
    fun deleteExpiredOrRevoked(cutoff: Instant): Int
}

interface SecurityCodeRepository : JpaRepository<SecurityCode, String> {

    fun findByLevelAndIsActive(level: String, isActive: Boolean = true): SecurityCode?
}
