package com.mgmt.domain.log

import com.mgmt.domain.auth.PostgresTextArrayConverter
import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant

// ============================================================
// Log Entities — maps to audit_logs, business_logs, access_logs, error_logs
// ============================================================

/**
 * AuditLog — sensitive operation records.
 */
@Entity
@Table(name = "audit_logs", indexes = [
    Index(columnList = "trace_id"), Index(columnList = "user_id"),
    Index(columnList = "module"), Index(columnList = "action"),
    Index(columnList = "risk_level"), Index(columnList = "created_at")
])
class AuditLog(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "trace_id") var traceId: String? = null,
    @Column(name = "user_id") var userId: String? = null,
    var username: String? = null,
    @Column(name = "session_id") var sessionId: String? = null,
    @Column(name = "ip_address") var ipAddress: String? = null,
    @Column(name = "user_agent") var userAgent: String? = null,
    @Column(nullable = false) var module: String = "",
    @Column(nullable = false) var action: String = "",
    @Column(name = "entity_type") var entityType: String? = null,
    @Column(name = "entity_id") var entityId: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "old_value", columnDefinition = "jsonb") var oldValue: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "new_value", columnDefinition = "jsonb") var newValue: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") var details: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var result: AuditResult = AuditResult.SUCCESS,
    @Enumerated(EnumType.STRING) @Column(name = "\"riskLevel\"", nullable = false) var riskLevel: RiskLevel = RiskLevel.LOW,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

enum class AuditResult { SUCCESS, DENIED, FAILED }
enum class RiskLevel { CRITICAL, HIGH, MEDIUM, LOW }

/**
 * BusinessLog — business operation records.
 */
@Entity
@Table(name = "business_logs", indexes = [
    Index(columnList = "trace_id"), Index(columnList = "user_id"),
    Index(columnList = "module"), Index(columnList = "action"),
    Index(columnList = "created_at"), Index(columnList = "dev_mode")
])
class BusinessLog(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "trace_id") var traceId: String? = null,
    @Column(name = "user_id") var userId: String? = null,
    var username: String? = null,
    @Column(name = "ip_address") var ipAddress: String? = null,
    @Column(nullable = false) var module: String = "",
    @Column(nullable = false) var action: String = "",
    var summary: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") var details: String? = null,
    @Column(name = "entity_type") var entityType: String? = null,
    @Column(name = "entity_id") var entityId: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: LogStatus = LogStatus.SUCCESS,
    @Column(name = "dev_mode", nullable = false) var devMode: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

enum class LogStatus { SUCCESS, FAILED, PENDING }

/**
 * AccessLog — HTTP request records.
 */
@Entity
@Table(name = "access_logs", indexes = [
    Index(columnList = "trace_id"), Index(columnList = "user_id"),
    Index(columnList = "path"), Index(columnList = "status_code"),
    Index(columnList = "created_at"), Index(columnList = "dev_mode")
])
class AccessLog(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "trace_id") var traceId: String? = null,
    @Column(name = "user_id") var userId: String? = null,
    var username: String? = null,
    @Column(name = "ip_address") var ipAddress: String? = null,
    @Column(name = "user_agent") var userAgent: String? = null,
    @Column(nullable = false) var method: String = "",
    @Column(nullable = false) var path: String = "",
    @Column(name = "query_params") var queryParams: String? = null,
    @Column(name = "status_code", nullable = false) var statusCode: Int = 0,
    @Column(name = "response_time") var responseTime: Int? = null,
    @Column(name = "response_size") var responseSize: Int? = null,
    @Column(name = "dev_mode", nullable = false) var devMode: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

/**
 * ErrorLog — system exception records (35 columns in V2).
 */
@Entity
@Table(name = "error_logs", indexes = [
    Index(columnList = "trace_id"), Index(columnList = "error_hash"),
    Index(columnList = "severity"), Index(columnList = "category"),
    Index(columnList = "module"), Index(columnList = "is_resolved"),
    Index(columnList = "created_at"), Index(columnList = "dev_mode")
])
class ErrorLog(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "trace_id") var traceId: String? = null,
    @Column(name = "error_type", nullable = false) var errorType: String = "",
    @Column(name = "error_code") var errorCode: String? = null,
    @Column(name = "error_message", nullable = false) var errorMessage: String = "",
    @Column(name = "stack_trace", columnDefinition = "text") var stackTrace: String? = null,
    @Column(name = "root_cause") var rootCause: String? = null,
    @Column(name = "request_method") var requestMethod: String? = null,
    @Column(name = "request_path") var requestPath: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "request_query", columnDefinition = "jsonb") var requestQuery: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "request_body", columnDefinition = "jsonb") var requestBody: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "request_headers", columnDefinition = "jsonb") var requestHeaders: String? = null,
    @Column(name = "user_id") var userId: String? = null,
    var username: String? = null,
    @Transient
    var userRoles: Array<String> = arrayOf(),
    @Column(name = "session_id") var sessionId: String? = null,
    @Column(name = "ip_address") var ipAddress: String? = null,
    @Column(name = "user_agent") var userAgent: String? = null,
    var hostname: String? = null,
    @Column(name = "app_version") var appVersion: String? = null,
    @Column(name = "node_env") var nodeEnv: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "system_context", columnDefinition = "jsonb") var systemContext: String? = null,
    var module: String? = null,
    var operation: String? = null,
    @Column(name = "entity_type") var entityType: String? = null,
    @Column(name = "entity_id") var entityId: String? = null,
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "business_context", columnDefinition = "jsonb") var businessContext: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var category: ErrorCategory = ErrorCategory.UNKNOWN,
    @Column(name = "error_hash") var errorHash: String? = null,
    @Column(nullable = false) var occurrences: Int = 1,
    @Column(name = "first_seen_at") var firstSeenAt: Instant? = null,
    @Column(name = "last_seen_at") var lastSeenAt: Instant? = null,
    @Column(name = "is_resolved", nullable = false) var isResolved: Boolean = false,
    @Column(name = "resolved_at") var resolvedAt: Instant? = null,
    @Column(name = "resolved_by") var resolvedBy: String? = null,
    @Column(columnDefinition = "text") var resolution: String? = null,
    @Column(name = "dev_mode", nullable = false) var devMode: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

enum class ErrorSeverity { CRITICAL, HIGH, MEDIUM, LOW }
enum class ErrorCategory { DATABASE, NETWORK, VALIDATION, AUTH, BUSINESS, EXTERNAL_API, SYSTEM, UNKNOWN }

/**
 * AlertHistory — alert records.
 */
@Entity
@Table(name = "alert_history", indexes = [
    Index(columnList = "rule"), Index(columnList = "severity"),
    Index(columnList = "acknowledged"), Index(columnList = "created_at")
])
class AlertHistory(
    @Id @Column(length = 36) var id: String = "",
    @Column(nullable = false) var rule: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false) var severity: AlertSeverity = AlertSeverity.INFO,
    @Column(nullable = false) var message: String = "",
    @Column(nullable = false) var value: Double = 0.0,
    @Column(nullable = false) var threshold: Double = 0.0,
    @Column(nullable = false) var acknowledged: Boolean = false,
    @Column(name = "acknowledged_at") var acknowledgedAt: Instant? = null,
    @Column(name = "acknowledged_by") var acknowledgedBy: String? = null,
    @Column(name = "resolved_at") var resolvedAt: Instant? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

enum class AlertSeverity { CRITICAL, WARNING, INFO }

/**
 * LogArchive — archive tracking records.
 */
@Entity
@Table(name = "log_archives", indexes = [
    Index(columnList = "log_type"), Index(columnList = "archive_date"),
    Index(columnList = "status")
])
class LogArchive(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "log_type", nullable = false) var logType: String = "",
    @Column(name = "archive_date", nullable = false) var archiveDate: Instant = Instant.now(),
    @Column(name = "record_count", nullable = false) var recordCount: Int = 0,
    @Column(name = "file_path") var filePath: String? = null,
    @Column(name = "file_size") var fileSize: Int? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: ArchiveStatus = ArchiveStatus.COMPLETED,
    @Column(name = "error_message") var errorMessage: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

enum class ArchiveStatus { PENDING, IN_PROGRESS, COMPLETED, FAILED }
