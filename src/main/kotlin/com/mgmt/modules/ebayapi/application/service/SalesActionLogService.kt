package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service

/**
 * SalesActionLogService — 统一操作日志写入服务。
 *
 * 所有 eBay API 操作（Listing/Offer/Sync/Transform/FIFO/System）
 * 均通过此服务记录到 ebay_api.sales_action_log 表。
 *
 * 写入采用 @Async 异步模式，不阻塞业务主线程。
 */
@Service
class SalesActionLogService(
    private val jdbcTemplate: JdbcTemplate,
) {
    private val log = LoggerFactory.getLogger(SalesActionLogService::class.java)
    private val mapper = ObjectMapper()

    /**
     * 通用日志写入方法。
     *
     * @param module      模块: LISTING / OFFER / DATA_SYNC / TRANSFORM / FIFO / SYSTEM
     * @param actionType  操作类型: RESTOCK / OFFER_REPLY / DAILY_SYNC 等
     * @param triggerType 触发方式: AUTO / MANUAL / SCHEDULED / WEBHOOK
     * @param seller      卖家 (可空)
     * @param summary     人类可读摘要
     * @param totalCount  总操作数 (批量操作)
     * @param successCount 成功数
     * @param failedCount  失败数
     * @param detail      JSONB 详情 (Map 或 List)
     * @param success     是否成功
     * @param errorMessage 错误信息 (失败时)
     * @param durationMs  耗时 (毫秒)
     */
    @Async
    fun log(
        module: String,
        actionType: String,
        triggerType: String,
        seller: String? = null,
        summary: String,
        totalCount: Int? = null,
        successCount: Int? = null,
        failedCount: Int? = null,
        detail: Any? = null,
        success: Boolean = true,
        errorMessage: String? = null,
        durationMs: Long? = null,
    ) {
        try {
            val detailJson = if (detail != null) {
                try { mapper.writeValueAsString(detail) } catch (_: Exception) { null }
            } else null

            jdbcTemplate.update("""
                INSERT INTO ebay_api.sales_action_log
                    (module, action_type, trigger_type, seller, summary,
                     total_count, success_count, failed_count,
                     detail, success, error_message, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
            """.trimIndent(),
                module, actionType, triggerType, seller, summary,
                totalCount, successCount, failedCount,
                detailJson, success, errorMessage, durationMs,
            )
        } catch (e: Exception) {
            // Logging failures must never crash the application
            log.error("Failed to write action log: {} — {}", summary, e.message)
        }
    }

    // ═══════════════════════════════════════════════
    // Convenience methods for common operations
    // ═══════════════════════════════════════════════

    /** Log a single RESTOCK item */
    fun logRestock(
        triggerType: String,
        seller: String,
        itemId: String,
        itemTitle: String?,
        sku: String?,
        oldQty: Int,
        newQty: Int,
        soldQty: Int,
        success: Boolean = true,
        errorMessage: String? = null,
    ) {
        log(
            module = "LISTING",
            actionType = "RESTOCK",
            triggerType = triggerType,
            seller = seller,
            summary = "Restock $itemId: $oldQty → $newQty",
            detail = mapOf(
                "itemId" to itemId,
                "itemTitle" to (itemTitle ?: ""),
                "sku" to (sku ?: ""),
                "oldQuantity" to oldQty,
                "newQuantity" to newQty,
                "soldQuantity" to soldQty,
            ),
            success = success,
            errorMessage = errorMessage,
        )
    }

    /** Log a bulk RESTOCK summary */
    fun logBulkRestock(
        triggerType: String,
        seller: String,
        total: Int,
        successCount: Int,
        failedCount: Int,
        durationMs: Long,
        items: List<Map<String, Any>>? = null,
    ) {
        log(
            module = "LISTING",
            actionType = "RESTOCK",
            triggerType = triggerType,
            seller = seller,
            summary = "Bulk restock: $successCount/$total succeeded",
            totalCount = total,
            successCount = successCount,
            failedCount = failedCount,
            detail = if (items != null) mapOf("items" to items) else null,
            success = failedCount == 0,
            durationMs = durationMs,
        )
    }

    /** Log an OFFER_REPLY */
    fun logOfferReply(
        triggerType: String,
        seller: String,
        bestOfferId: String,
        itemId: String,
        itemTitle: String?,
        buyerUserId: String?,
        originalPrice: Double?,
        offerPrice: Double?,
        buyerQty: Int,
        action: String,
        counterPrice: Double? = null,
        ruleUsed: String? = null,
        success: Boolean = true,
        errorMessage: String? = null,
    ) {
        val actionDesc = when (action) {
            "Accept" -> "Accept $$offerPrice"
            "Counter" -> "Counter $$counterPrice (buyer offered $$offerPrice)"
            "Decline" -> "Decline $$offerPrice"
            else -> "$action $$offerPrice"
        }
        log(
            module = "OFFER",
            actionType = "OFFER_REPLY",
            triggerType = triggerType,
            seller = seller,
            summary = "Offer $bestOfferId on $itemId: $actionDesc",
            detail = mapOf(
                "bestOfferId" to bestOfferId,
                "itemId" to itemId,
                "itemTitle" to (itemTitle ?: ""),
                "buyerUserId" to (buyerUserId ?: ""),
                "originalPrice" to originalPrice,
                "offerPrice" to offerPrice,
                "buyerQuantity" to buyerQty,
                "action" to action,
                "counterPrice" to counterPrice,
                "ruleUsed" to ruleUsed,
            ),
            success = success,
            errorMessage = errorMessage,
        )
    }

    /** Log a DAILY_SYNC or MANUAL_SYNC */
    fun logDataSync(
        triggerType: String,
        seller: String,
        fromDate: String,
        toDate: String,
        txnFetched: Int,
        ordersFetched: Int,
        cleanedProduced: Int,
        durationMs: Long,
        success: Boolean = true,
        errorMessage: String? = null,
    ) {
        log(
            module = "DATA_SYNC",
            actionType = if (triggerType == "SCHEDULED") "DAILY_SYNC" else "MANUAL_SYNC",
            triggerType = triggerType,
            seller = seller,
            summary = "Sync $seller $fromDate→$toDate: $txnFetched txn, $ordersFetched orders, $cleanedProduced cleaned",
            detail = mapOf(
                "fromDate" to fromDate,
                "toDate" to toDate,
                "transactionsFetched" to txnFetched,
                "ordersFetched" to ordersFetched,
                "cleanedProduced" to cleanedProduced,
            ),
            success = success,
            errorMessage = errorMessage,
            durationMs = durationMs,
        )
    }

    /** Log a WEBHOOK_ORDER */
    fun logWebhookOrder(
        seller: String,
        orderId: String,
        soldItems: List<Map<String, Any>>,
        durationMs: Long,
        success: Boolean = true,
        errorMessage: String? = null,
    ) {
        log(
            module = "DATA_SYNC",
            actionType = "WEBHOOK_ORDER",
            triggerType = "WEBHOOK",
            seller = seller,
            summary = "Webhook order $orderId: ${soldItems.size} item(s) synced",
            detail = mapOf(
                "orderId" to orderId,
                "soldItems" to soldItems,
            ),
            success = success,
            errorMessage = errorMessage,
            durationMs = durationMs,
        )
    }

    /** Log a PROMOTE operation */
    fun logPromote(
        triggerType: String,
        seller: String,
        strategy: String,
        total: Int,
        successCount: Int,
        failedCount: Int,
        campaignId: String? = null,
        durationMs: Long,
    ) {
        log(
            module = "LISTING",
            actionType = "PROMOTE",
            triggerType = triggerType,
            seller = seller,
            summary = "Promote $successCount/$total listings ($strategy strategy)",
            totalCount = total,
            successCount = successCount,
            failedCount = failedCount,
            detail = mapOf(
                "strategy" to strategy,
                "campaignId" to (campaignId ?: ""),
            ),
            success = failedCount == 0,
            durationMs = durationMs,
        )
    }

    /** Check if auto-ops is enabled */
    fun isAutoOpsEnabled(): Boolean {
        return try {
            val value = jdbcTemplate.queryForObject(
                "SELECT rule_value FROM automation_rules WHERE module = 'SYSTEM' AND rule_key = 'auto_ops_enabled'",
                String::class.java,
            )
            value?.lowercase() == "true"
        } catch (_: Exception) {
            false
        }
    }
}
