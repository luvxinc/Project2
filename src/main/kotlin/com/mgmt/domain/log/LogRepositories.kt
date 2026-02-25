package com.mgmt.domain.log

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant

// ============================================================
// Log Repositories — JPA + Specifications + Native SQL
// Fixes: LOG-1 (N+1), LOG-2 (10x COUNT), LOG-5 (P99 in-memory)
// ============================================================

@Repository
interface AuditLogRepository : JpaRepository<AuditLog, String>, JpaSpecificationExecutor<AuditLog> {

    fun findAllByCreatedAtBetween(start: Instant, end: Instant, pageable: Pageable): Page<AuditLog>

    fun countByCreatedAtAfter(after: Instant): Long
}

@Repository
interface BusinessLogRepository : JpaRepository<BusinessLog, String>, JpaSpecificationExecutor<BusinessLog> {

    fun findAllByCreatedAtBetween(start: Instant, end: Instant, pageable: Pageable): Page<BusinessLog>

    fun countByCreatedAtAfter(after: Instant): Long
}

@Repository
interface AccessLogRepository : JpaRepository<AccessLog, String>, JpaSpecificationExecutor<AccessLog> {

    fun findAllByCreatedAtBetween(start: Instant, end: Instant, pageable: Pageable): Page<AccessLog>

    fun countByCreatedAtAfter(after: Instant): Long

    /**
     * LOG-5 FIX: P99 latency via PostgreSQL PERCENTILE_CONT
     */
    @Query(
        value = "SELECT COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time), 0) " +
                "FROM access_logs WHERE created_at >= :since AND response_time IS NOT NULL",
        nativeQuery = true
    )
    fun getP99Latency(@Param("since") since: Instant): Double

    /**
     * LOG-5 FIX: Average latency via SQL AVG
     */
    @Query(
        value = "SELECT COALESCE(AVG(response_time), 0) " +
                "FROM access_logs WHERE created_at >= :since AND response_time IS NOT NULL",
        nativeQuery = true
    )
    fun getAvgLatency(@Param("since") since: Instant): Double
}

@Repository
interface ErrorLogRepository : JpaRepository<ErrorLog, String>, JpaSpecificationExecutor<ErrorLog> {

    fun findAllByCreatedAtBetween(start: Instant, end: Instant, pageable: Pageable): Page<ErrorLog>

    /**
     * LOG-2 FIX: Unified error stats in ONE query using FILTER
     */
    @Query(
        value = """
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_resolved = false) AS unresolved,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND is_resolved = false) AS critical,
                COUNT(*) FILTER (WHERE created_at >= :todayStart) AS today
            FROM error_logs
        """,
        nativeQuery = true
    )
    fun getErrorStats(@Param("todayStart") todayStart: Instant): Array<Any>

    /**
     * LOG-1 FIX: Error trend via DATE_TRUNC + GROUP BY
     */
    @Query(
        value = """
            SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*) AS count
            FROM error_logs
            WHERE created_at >= :since
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY date
        """,
        nativeQuery = true
    )
    fun getErrorTrend(@Param("since") since: Instant): List<Array<Any>>

    fun countByCreatedAtAfter(after: Instant): Long
    fun countByIsResolvedFalse(): Long
    fun countBySeverityAndIsResolvedFalse(severity: ErrorSeverity): Long

    @Modifying
    @Query("UPDATE ErrorLog e SET e.isResolved = true, e.resolvedAt = :now, e.resolvedBy = :userId WHERE e.id = :id")
    fun resolveError(@Param("id") id: String, @Param("userId") userId: String, @Param("now") now: Instant): Int
}

@Repository
interface AlertHistoryRepository : JpaRepository<AlertHistory, String> {

    fun findAllByOrderByCreatedAtDesc(pageable: Pageable): Page<AlertHistory>

    fun findByRuleAndAcknowledgedFalse(rule: String): List<AlertHistory>

    fun countByAcknowledgedFalse(): Long
}

@Repository
interface LogArchiveRepository : JpaRepository<LogArchive, String> {

    fun findAllByOrderByCreatedAtDesc(pageable: Pageable): Page<LogArchive>

    fun findByLogTypeAndArchiveDate(logType: String, archiveDate: Instant): LogArchive?
}
