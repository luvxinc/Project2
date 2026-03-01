package com.mgmt.modules.ebayapi.api

import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*

/**
 * SalesActionLogController — Action log query API.
 *
 * GET /api/v1/ebay/sync/action-log?module=LISTING&limit=100&offset=0
 */
@RestController
@RequestMapping("/ebay/sync/action-log")
class SalesActionLogController(
    private val jdbcTemplate: JdbcTemplate,
) {
    /**
     * GET /api/v1/ebay/sync/action-log
     *
     * Query parameters:
     *   module       — LISTING / OFFER / DATA_SYNC / TRANSFORM / FIFO / SYSTEM / all (default: all)
     *   actionType   — Optional filter by action_type
     *   triggerType   — Optional filter by trigger_type (AUTO/MANUAL/SCHEDULED/WEBHOOK)
     *   limit        — Max rows (default: 100, max: 500)
     *   offset       — Pagination offset (default: 0)
     */
    @GetMapping
    fun getLogs(
        @RequestParam(defaultValue = "all") module: String,
        @RequestParam(required = false) actionType: String?,
        @RequestParam(required = false) triggerType: String?,
        @RequestParam(defaultValue = "100") limit: Int,
        @RequestParam(defaultValue = "0") offset: Int,
    ): ResponseEntity<Any> {
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)

        val conditions = mutableListOf<String>()
        val params = mutableListOf<Any>()

        if (module != "all") {
            conditions.add("module = ?")
            params.add(module)
        }
        if (!actionType.isNullOrBlank()) {
            conditions.add("action_type = ?")
            params.add(actionType)
        }
        if (!triggerType.isNullOrBlank()) {
            conditions.add("trigger_type = ?")
            params.add(triggerType)
        }

        val where = if (conditions.isEmpty()) "" else "WHERE " + conditions.joinToString(" AND ")

        // Count total
        val countSql = "SELECT COUNT(*) FROM ebay_api.sales_action_log $where"
        val total = jdbcTemplate.queryForObject(countSql, Long::class.java, *params.toTypedArray()) ?: 0L

        // Fetch rows
        val sql = """
            SELECT id, module, action_type, trigger_type, seller, summary,
                   total_count, success_count, failed_count,
                   detail::text as detail, success, error_message, duration_ms, created_at
            FROM ebay_api.sales_action_log
            $where
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """.trimIndent()
        params.add(safeLimit)
        params.add(safeOffset)

        val rows = jdbcTemplate.queryForList(sql, *params.toTypedArray())

        return ResponseEntity.ok(mapOf(
            "logs" to rows,
            "total" to total,
            "limit" to safeLimit,
            "offset" to safeOffset,
        ))
    }
}
