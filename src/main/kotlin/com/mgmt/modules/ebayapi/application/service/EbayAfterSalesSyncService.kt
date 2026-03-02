package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.domain.model.EbayAfterSalesEvent
import com.mgmt.modules.ebayapi.domain.repository.EbayAfterSalesEventRepository
import com.mgmt.modules.ebayapi.infrastructure.EbayApiUtils
import com.mgmt.modules.ebayapi.infrastructure.EbayPostOrderService
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestTemplate
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * EbayAfterSalesSyncService — 从 eBay Post-Order API v2 拉取售后事件。
 *
 * 4 类事件:
 *   - CANCELLATION: /cancellation/search
 *   - RETURN: /return/search
 *   - INQUIRY: /inquiry/search
 *   - CASE: /casemanagement/search
 *
 * 每类独立 try/catch, 互不影响。
 * Upsert: findByEventTypeAndEventId → 存在更新 status/rawJson, 不存在 insert。
 */
@Service
class EbayAfterSalesSyncService(
    private val oauthService: EbayOAuthService,
    private val afterSalesRepo: EbayAfterSalesEventRepository,
    private val actionLog: SalesActionLogService,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val postOrderService: EbayPostOrderService,
    private val jdbcTemplate: JdbcTemplate,
) {
    private val log = LoggerFactory.getLogger(EbayAfterSalesSyncService::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()
    private val PST = ZoneId.of("America/Los_Angeles")

    companion object {
        private const val POST_ORDER_BASE = "https://api.ebay.com/post-order/v2"
        private const val PAGE_LIMIT = 200
    }

    data class SyncResult(val eventType: String, val fetched: Int, val upserted: Int)

    /**
     * 同步指定卖家在日期范围内的所有售后事件。
     */
    fun syncDateRange(seller: String, fromDate: LocalDate, toDate: LocalDate): List<SyncResult> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val startMs = System.currentTimeMillis()
        val results = mutableListOf<SyncResult>()

        val fromIso = fromDate.atStartOfDay(PST).toInstant().toString()
        val toIso = toDate.plusDays(1).atStartOfDay(PST).toInstant().toString()

        results.add(syncCancellations(seller, accessToken, fromIso, toIso))
        results.add(syncReturns(seller, accessToken, fromIso, toIso))
        results.add(syncInquiries(seller, accessToken, fromIso, toIso))
        results.add(syncCases(seller, accessToken, fromIso, toIso))

        val totalFetched = results.sumOf { it.fetched }
        val totalUpserted = results.sumOf { it.upserted }
        val durationMs = System.currentTimeMillis() - startMs

        log.info("[AfterSalesSync] {} done: fetched={}, upserted={}, duration={}ms",
            seller, totalFetched, totalUpserted, durationMs)

        actionLog.log(
            module = "AFTER_SALES",
            actionType = "SYNC",
            triggerType = "MANUAL",
            seller = seller,
            summary = "After-sales sync: $totalFetched fetched, $totalUpserted upserted",
            totalCount = totalFetched,
            successCount = totalUpserted,
            durationMs = durationMs,
        )

        return results
    }

    // ═══════════════════════════════════════════════
    // Cancellation
    // ═══════════════════════════════════════════════

    private fun syncCancellations(seller: String, token: String, from: String, to: String): SyncResult {
        return syncEventType(
            seller = seller,
            token = token,
            eventType = "CANCELLATION",
            url = "$POST_ORDER_BASE/cancellation/search",
            dateFromParam = "creation_date_range_from",
            dateToParam = "creation_date_range_to",
            from = from,
            to = to,
            listKey = "cancellations",
            idExtractor = { it.path("cancelId").asText("") },
            orderIdExtractor = { it.path("legacyOrderId").asText(null) },
            buyerExtractor = { it.path("buyerLoginName").asText(null) },
            statusExtractor = { it.path("cancelStatus").asText(null) },
            reasonExtractor = { it.path("cancelReason").asText(null) },
            itemExtractor = { node ->
                val items = node.path("orderLineItems")
                if (items.isArray && items.size() > 0) {
                    val first = items[0]
                    Triple(first.path("itemId").asText(null), first.path("title").asText(null), first.path("quantity").asInt(1))
                } else Triple(null, null, null)
            },
            amountExtractor = { null },
        )
    }

    // ═══════════════════════════════════════════════
    // Return
    // ═══════════════════════════════════════════════

    private fun syncReturns(seller: String, token: String, from: String, to: String): SyncResult {
        return syncEventType(
            seller = seller,
            token = token,
            eventType = "RETURN",
            url = "$POST_ORDER_BASE/return/search",
            dateFromParam = "creation_date_range_from",
            dateToParam = "creation_date_range_to",
            from = from,
            to = to,
            listKey = "members",
            idExtractor = { it.path("returnId").asText("") },
            orderIdExtractor = { it.path("orderId").asText(null) },
            buyerExtractor = { it.path("buyerLoginName").asText(null) },
            statusExtractor = { it.path("returnStatus").asText(null) ?: it.path("status").asText(null) },
            reasonExtractor = { it.path("returnReason").asText(null) ?: it.path("reason").asText(null) },
            itemExtractor = { node ->
                val itemId = node.path("itemId").asText(null)
                val title = node.path("itemTitle").asText(null)
                val qty = node.path("returnQuantity").asInt(1)
                Triple(itemId, title, qty)
            },
            amountExtractor = { node ->
                val amt = node.path("returnRefundAmount")?.path("value")?.asText(null)
                amt?.toBigDecimalOrNull()
            },
        )
    }

    // ═══════════════════════════════════════════════
    // Inquiry
    // ═══════════════════════════════════════════════

    private fun syncInquiries(seller: String, token: String, from: String, to: String): SyncResult {
        return syncEventType(
            seller = seller,
            token = token,
            eventType = "INQUIRY",
            url = "$POST_ORDER_BASE/inquiry/search",
            dateFromParam = "inquiry_creation_date_range_from",
            dateToParam = "inquiry_creation_date_range_to",
            from = from,
            to = to,
            listKey = "members",
            idExtractor = { it.path("inquiryId").asText("") },
            orderIdExtractor = { it.path("orderId").asText(null) },
            buyerExtractor = { it.path("buyer").path("username").asText(null) },
            statusExtractor = { it.path("inquiryStatus").asText(null) ?: it.path("status").asText(null) },
            reasonExtractor = { it.path("inquiryType").asText(null) },
            itemExtractor = { node ->
                val itemId = node.path("itemId").asText(null)
                val title = node.path("itemTitle").asText(null)
                val qty = node.path("quantity").asInt(1)
                Triple(itemId, title, qty)
            },
            amountExtractor = { node ->
                val amt = node.path("refundAmount")?.path("value")?.asText(null)
                amt?.toBigDecimalOrNull()
            },
        )
    }

    // ═══════════════════════════════════════════════
    // Case
    // ═══════════════════════════════════════════════

    private fun syncCases(seller: String, token: String, from: String, to: String): SyncResult {
        return syncEventType(
            seller = seller,
            token = token,
            eventType = "CASE",
            url = "$POST_ORDER_BASE/casemanagement/search",
            dateFromParam = "case_creation_date_range_from",
            dateToParam = "case_creation_date_range_to",
            from = from,
            to = to,
            listKey = "members",
            idExtractor = { it.path("caseId").asText("") },
            orderIdExtractor = { it.path("orderId").asText(null) },
            buyerExtractor = { it.path("buyer").path("username").asText(null) },
            statusExtractor = { it.path("caseStatus").asText(null) ?: it.path("status").asText(null) },
            reasonExtractor = { it.path("caseType").asText(null) },
            itemExtractor = { node ->
                val itemId = node.path("itemId").asText(null)
                val title = node.path("itemTitle").asText(null)
                val qty = node.path("quantity").asInt(1)
                Triple(itemId, title, qty)
            },
            amountExtractor = { node ->
                val amt = node.path("claimAmount")?.path("value")?.asText(null)
                amt?.toBigDecimalOrNull()
            },
        )
    }

    // ═══════════════════════════════════════════════
    // Generic paginated search + upsert
    // ═══════════════════════════════════════════════

    private fun syncEventType(
        seller: String,
        token: String,
        eventType: String,
        url: String,
        dateFromParam: String,
        dateToParam: String,
        from: String,
        to: String,
        listKey: String,
        idExtractor: (com.fasterxml.jackson.databind.JsonNode) -> String,
        orderIdExtractor: (com.fasterxml.jackson.databind.JsonNode) -> String?,
        buyerExtractor: (com.fasterxml.jackson.databind.JsonNode) -> String?,
        statusExtractor: (com.fasterxml.jackson.databind.JsonNode) -> String?,
        reasonExtractor: (com.fasterxml.jackson.databind.JsonNode) -> String?,
        itemExtractor: (com.fasterxml.jackson.databind.JsonNode) -> Triple<String?, String?, Int?>,
        amountExtractor: (com.fasterxml.jackson.databind.JsonNode) -> BigDecimal?,
    ): SyncResult {
        var fetched = 0
        var upserted = 0

        try {
            var offset = 0
            var hasMore = true

            while (hasMore) {
                val headers = HttpHeaders().apply {
                    // Post-Order API v2 uses "TOKEN" scheme, NOT "Bearer"
                    set("Authorization", "TOKEN $token")
                    accept = listOf(MediaType.APPLICATION_JSON)
                    set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US")
                }

                val fullUrl = "$url?$dateFromParam=$from&$dateToParam=$to&limit=$PAGE_LIMIT&offset=$offset"

                val response = try {
                    EbayApiUtils.callWithRetry(label = "$eventType/search") {
                        restTemplate.exchange(
                            java.net.URI.create(fullUrl),
                            HttpMethod.GET,
                            HttpEntity<Void>(headers),
                            String::class.java,
                        )
                    }
                } catch (e: HttpClientErrorException) {
                    if (e.statusCode.value() == 404) {
                        log.info("[AfterSalesSync] {} {}: 0 results (404)", seller, eventType)
                        break
                    }
                    throw e
                }

                val json = mapper.readTree(response.body ?: "{}")
                val items = json.path(listKey)

                if (!items.isArray || items.size() == 0) {
                    hasMore = false
                    continue
                }

                for (node in items) {
                    val eventId = idExtractor(node)
                    if (eventId.isBlank()) continue
                    fetched++

                    val existing = afterSalesRepo.findByEventTypeAndEventId(eventType, eventId)
                    val (itemId, title, qty) = itemExtractor(node)

                    if (existing != null) {
                        existing.status = statusExtractor(node)
                        existing.rawJson = node.toString()
                        existing.updatedAt = Instant.now()
                        afterSalesRepo.save(existing)
                    } else {
                        val eventStatus = statusExtractor(node)
                        val newEvent = EbayAfterSalesEvent(
                            eventType = eventType,
                            eventId = eventId,
                            orderId = orderIdExtractor(node),
                            sellerUsername = seller,
                            buyerUsername = buyerExtractor(node),
                            itemId = itemId,
                            title = title,
                            quantity = qty,
                            reason = reasonExtractor(node),
                            status = eventStatus,
                            amount = amountExtractor(node),
                            rawJson = node.toString(),
                            webhookSource = "API",
                        )
                        afterSalesRepo.save(newEvent)

                        // SSE broadcast new event to frontend
                        saleBroadcaster.broadcastAfterSales(AfterSalesEventInfo(
                            eventType = eventType,
                            eventId = eventId,
                            orderId = newEvent.orderId,
                            buyerUsername = newEvent.buyerUsername,
                            status = newEvent.status,
                            seller = seller,
                        ))

                        // Auto-accept cancellation if enabled
                        if (eventType == "CANCELLATION") {
                            autoAcceptCancellationIfEnabled(seller, eventId, eventStatus)
                        }
                    }
                    upserted++
                }

                val total = json.path("total").asInt(0)
                offset += PAGE_LIMIT
                hasMore = offset < total
            }
        } catch (e: Exception) {
            log.error("[AfterSalesSync] {} {} failed: {}", seller, eventType, e.message, e)
        }

        log.info("[AfterSalesSync] {} {}: fetched={}, upserted={}", seller, eventType, fetched, upserted)
        return SyncResult(eventType, fetched, upserted)
    }

    // ═══════════════════════════════════════════════
    // Auto-Accept Cancellation
    // ═══════════════════════════════════════════════

    private fun isAutoAcceptCancellationEnabled(): Boolean {
        return try {
            val autoOps = jdbcTemplate.queryForObject(
                "SELECT rule_value FROM automation_rules WHERE module = 'SYSTEM' AND rule_key = 'auto_ops_enabled'",
                String::class.java,
            )
            if (autoOps?.lowercase() != "true") return false

            val autoCancelVal = jdbcTemplate.queryForObject(
                "SELECT rule_value FROM automation_rules WHERE module = 'SYSTEM' AND rule_key = 'auto_accept_cancellation'",
                String::class.java,
            )
            autoCancelVal?.lowercase() == "true"
        } catch (_: Exception) { false }
    }

    /**
     * Auto-approve a pending cancellation if the toggle is enabled.
     * Called after syncing a new CANCELLATION event.
     */
    fun autoAcceptCancellationIfEnabled(seller: String, cancelId: String, status: String?) {
        val pendingStatuses = setOf("CANCEL_REQUESTED", "CANCEL_PENDING")
        if (status == null || status.uppercase() !in pendingStatuses) return
        if (!isAutoAcceptCancellationEnabled()) return

        log.info("[AutoOps] Auto-accepting cancellation {} for seller {} (status={})", cancelId, seller, status)

        try {
            val result = postOrderService.approveCancellation(seller, cancelId)
            if (result.success) {
                val event = afterSalesRepo.findByEventTypeAndEventId("CANCELLATION", cancelId)
                if (event != null) {
                    event.status = "CANCEL_CLOSED"
                    event.updatedAt = Instant.now()
                    afterSalesRepo.save(event)
                }
                log.info("[AutoOps] Auto-accepted cancellation {} successfully", cancelId)
            } else {
                log.warn("[AutoOps] Auto-accept cancellation {} failed: HTTP {} — {}",
                    cancelId, result.statusCode, result.errorMessage)
            }

            actionLog.log(
                module = "AFTER_SALES",
                actionType = "AUTO_ACCEPT_CANCEL",
                triggerType = "AUTO",
                seller = seller,
                summary = "Auto-accept cancellation $cancelId: ${if (result.success) "OK" else "FAILED"}",
                success = result.success,
                errorMessage = result.errorMessage,
            )
        } catch (e: Exception) {
            log.error("[AutoOps] Auto-accept cancellation {} error: {}", cancelId, e.message, e)
        }
    }
}
