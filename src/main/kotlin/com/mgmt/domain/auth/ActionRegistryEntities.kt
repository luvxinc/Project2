package com.mgmt.domain.auth

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "action_registry")
class ActionRegistryEntry(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(name = "action_key", length = 128, unique = true, nullable = false)
    var actionKey: String = "",

    @Column(columnDefinition = "TEXT", nullable = false)
    var tokens: String = "[]",

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)

interface ActionRegistryRepository : org.springframework.data.jpa.repository.JpaRepository<ActionRegistryEntry, String> {
    fun findByActionKey(actionKey: String): ActionRegistryEntry?
    fun deleteByActionKey(actionKey: String): Int
}
