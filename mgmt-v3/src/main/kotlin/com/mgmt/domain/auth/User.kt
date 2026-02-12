package com.mgmt.domain.auth

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant

/**
 * User entity — maps to 'users' table.
 *
 * PostgreSQL text[] is handled via native query for read,
 * and custom SQL for write. The JPA mapping uses a String
 * representation that we convert in getters/setters.
 *
 * JSONB columns use Hibernate 6 @JdbcTypeCode(SqlTypes.JSON).
 */
@Entity
@Table(name = "users")
class User(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(unique = true, nullable = false)
    var username: String = "",

    @Column(unique = true, nullable = false)
    var email: String = "",

    @Column(name = "password_hash", nullable = false)
    var passwordHash: String = "",

    @Column(name = "display_name")
    var displayName: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: UserStatus = UserStatus.ACTIVE,

    /**
     * PostgreSQL text[] column.
     * Hibernate reads this fine but struggles to write it.
     * We use a columnDefinition + @Convert to handle both directions.
     */
    @Column(columnDefinition = "text[]")
    @Convert(converter = PostgresTextArrayConverter::class)
    var roles: Array<String> = arrayOf("viewer"),

    // JSONB column — Hibernate 6 native JSON support
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    var permissions: String = "{}",

    // JSONB column
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    var settings: String = """{"language": "en", "timezone": "UTC"}""",

    @Column(name = "last_login_at")
    var lastLoginAt: Instant? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,
)

enum class UserStatus {
    ACTIVE, DISABLED, LOCKED
}

/**
 * JPA AttributeConverter to handle PostgreSQL text[].
 *
 * READ: PostgreSQL returns java.sql.Array → we extract String[]
 * WRITE: We need to create a PostgreSQL-compatible array literal string
 *        like {"admin","staff"} that PostgreSQL can cast to text[].
 */
@Converter
class PostgresTextArrayConverter : AttributeConverter<Array<String>, String> {

    /**
     * Kotlin Array → DB: produce PostgreSQL array literal {a,b,c}
     */
    override fun convertToDatabaseColumn(attribute: Array<String>?): String? {
        if (attribute == null || attribute.isEmpty()) return "{}"
        return "{${attribute.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }}}"
    }

    /**
     * DB → Kotlin Array: parse PostgreSQL array literal or JDBC Array
     */
    override fun convertToEntityAttribute(dbData: String?): Array<String> {
        if (dbData == null || dbData == "{}") return arrayOf()
        // Strip { } and split by comma, removing quotes
        val content = dbData.trimStart('{').trimEnd('}')
        if (content.isBlank()) return arrayOf()
        return content.split(",")
            .map { it.trim().removeSurrounding("\"") }
            .toTypedArray()
    }
}
