package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.service.EbayAfterSalesSyncService
import com.mgmt.modules.ebayapi.application.service.ListingSaleEventBroadcaster
import com.mgmt.modules.ebayapi.application.service.SalesActionLogService
import com.mgmt.modules.ebayapi.domain.repository.EbayAfterSalesEventRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import com.mgmt.modules.ebayapi.infrastructure.EbayPostOrderService
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@RestController
@RequestMapping("/ebay/sync/after-sales")
class EbayAfterSalesController(
    private val afterSalesRepo: EbayAfterSalesEventRepository,
    private val afterSalesSyncService: EbayAfterSalesSyncService,
    private val sellerAccountRepo: EbaySellerAccountRepository,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val postOrderService: EbayPostOrderService,
    private val actionLog: SalesActionLogService,
) {
    private val log = LoggerFactory.getLogger(EbayAfterSalesController::class.java)

    @GetMapping("")
    fun getAfterSalesEvents(
        @RequestParam(defaultValue = "all") seller: String,
        @RequestParam(defaultValue = "all") type: String,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
    ): ResponseEntity<Any> {
        return try {
            val pageable = PageRequest.of(page, size)
            val result = afterSalesRepo.findFiltered(seller, type, pageable)

            val items = result.content.map { e ->
                mapOf(
                    "id" to e.id,
                    "eventType" to e.eventType,
                    "eventId" to e.eventId,
                    "orderId" to e.orderId,
                    "legacyOrderId" to e.legacyOrderId,
                    "sellerUsername" to e.sellerUsername,
                    "buyerUsername" to e.buyerUsername,
                    "itemId" to e.itemId,
                    "sku" to e.sku,
                    "title" to e.title,
                    "quantity" to e.quantity,
                    "reason" to e.reason,
                    "status" to e.status,
                    "amount" to e.amount,
                    "currency" to e.currency,
                    "webhookSource" to e.webhookSource,
                    "createdAt" to e.createdAt.toString(),
                    "updatedAt" to e.updatedAt.toString(),
                )
            }

            ResponseEntity.ok(mapOf(
                "content" to items,
                "totalElements" to result.totalElements,
                "number" to result.number,
                "size" to result.size,
                "totalPages" to result.totalPages,
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch after-sales events: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    @PostMapping("/refresh")
    fun refreshAfterSales(
        @RequestParam(defaultValue = "all") seller: String,
        @RequestParam(defaultValue = "540") days: Int,
    ): ResponseEntity<Any> {
        return try {
            val pst = ZoneId.of("America/Los_Angeles")
            val today = LocalDate.now(pst)
            // eBay Post-Order API retains ~18 months; default 540 days, max 720
            val effectiveDays = days.coerceIn(1, 720)
            val from = today.minusDays(effectiveDays.toLong())

            val sellers = if (seller != "all") listOf(seller)
            else sellerAccountRepo.findAll().map { it.sellerUsername }

            var totalEvents = 0
            for (s in sellers) {
                val results = afterSalesSyncService.syncDateRange(s, from, today)
                totalEvents += results.sumOf { it.upserted }
            }

            ResponseEntity.ok(mapOf("status" to "ok", "eventsSynced" to totalEvents))
        } catch (e: Exception) {
            log.error("After-sales refresh failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to (e.message ?: "Unknown error")))
        }
    }

    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun afterSalesEvents(@RequestParam(defaultValue = "all") seller: String): SseEmitter {
        log.info("SSE client connected for After-Sales events, seller={}", seller)
        return saleBroadcaster.subscribe(seller)
    }

    // ══════════════════════════════════════════════════
    // POST /ebay/sync/after-sales/approve-cancel
    // Manually approve a buyer cancellation request
    // ══════════════════════════════════════════════════
    @PostMapping("/approve-cancel")
    fun approveCancellation(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        val seller = body["seller"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "Missing seller"))
        val cancelId = body["cancelId"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "Missing cancelId"))

        return try {
            val result = postOrderService.approveCancellation(seller, cancelId)

            if (result.success) {
                // Update local DB status
                val event = afterSalesRepo.findByEventTypeAndEventId("CANCELLATION", cancelId)
                if (event != null) {
                    event.status = "CANCEL_CLOSED"
                    event.updatedAt = Instant.now()
                    afterSalesRepo.save(event)
                }

                actionLog.log(
                    module = "AFTER_SALES",
                    actionType = "APPROVE_CANCEL",
                    triggerType = "MANUAL",
                    seller = seller,
                    summary = "Approved cancellation $cancelId",
                )
            }

            ResponseEntity.ok(mapOf(
                "success" to result.success,
                "cancelId" to cancelId,
                "statusCode" to (result.statusCode ?: 0),
                "error" to (result.errorMessage ?: ""),
            ))
        } catch (e: Exception) {
            log.error("Failed to approve cancellation {}: {}", cancelId, e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(mapOf("error" to (e.message ?: "Unknown error")))
        }
    }
}
