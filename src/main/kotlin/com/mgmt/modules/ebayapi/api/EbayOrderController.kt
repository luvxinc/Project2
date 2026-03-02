package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.service.EbayDataSyncService
import com.mgmt.modules.ebayapi.application.service.ListingSaleEventBroadcaster
import com.mgmt.modules.ebayapi.domain.repository.EbayAfterSalesEventRepository
import com.mgmt.modules.ebayapi.domain.repository.EbayFulOrderRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.hibernate.Hibernate
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

@RestController
@RequestMapping("/ebay/sync/orders")
class EbayOrderController(
    private val orderRepo: EbayFulOrderRepository,
    private val afterSalesRepo: EbayAfterSalesEventRepository,
    private val syncService: EbayDataSyncService,
    private val sellerAccountRepo: EbaySellerAccountRepository,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
) {
    private val log = LoggerFactory.getLogger(EbayOrderController::class.java)

    @GetMapping("")
    @Transactional(readOnly = true)
    fun getOrders(
        @RequestParam(defaultValue = "all") seller: String,
        @RequestParam(defaultValue = "all") status: String,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
        @RequestParam(required = false) dateFrom: String?,
        @RequestParam(required = false) dateTo: String?,
        @RequestParam(required = false) search: String?,
    ): ResponseEntity<Any> {
        return try {
            val pageable = PageRequest.of(page, size)
            val pst = ZoneId.of("America/Los_Angeles")
            val dateFromInstant = dateFrom?.let { LocalDate.parse(it).atStartOfDay(pst).toInstant() }
                ?: Instant.EPOCH
            val dateToInstant = dateTo?.let { LocalDate.parse(it).plusDays(1).atStartOfDay(pst).toInstant() }
                ?: Instant.now().plusSeconds(86400L * 365)
            val searchLower = search?.trim()?.lowercase()?.ifBlank { "" } ?: ""

            val result = orderRepo.findFilteredAdvanced(
                seller, status, dateFromInstant, dateToInstant, searchLower, pageable,
            )

            // Batch-fetch after-sales events for this page of orders
            val orderIds = result.content.mapNotNull { it.orderId }
            val afterSalesMap = if (orderIds.isNotEmpty()) {
                afterSalesRepo.findByOrderIdIn(orderIds)
                    .groupBy { it.orderId ?: "" }
                    .mapValues { (_, events) -> events.map { it.eventType }.distinct() }
            } else emptyMap()

            val items = result.content.map { o ->
                Hibernate.initialize(o.items)
                mapOf<String, Any?>(
                    "id" to o.id,
                    "orderId" to o.orderId,
                    "legacyOrderId" to o.legacyOrderId,
                    "creationDate" to o.creationDate.toString(),
                    "lastModifiedDate" to o.lastModifiedDate?.toString(),
                    "orderFulfillmentStatus" to o.orderFulfillmentStatus,
                    "orderPaymentStatus" to o.orderPaymentStatus,
                    "cancelStatus" to o.cancelStatus,
                    "buyerUsername" to o.buyerUsername,
                    "buyerFullName" to o.buyerFullName,
                    "shipToName" to o.shipToName,
                    "shipToCity" to o.shipToCity,
                    "shipToState" to o.shipToState,
                    "shipToPostalCode" to o.shipToPostalCode,
                    "shipToCountryCode" to o.shipToCountryCode,
                    "priceSubtotal" to o.priceSubtotal,
                    "deliveryCost" to o.deliveryCost,
                    "tax" to o.tax,
                    "total" to o.total,
                    "priceCurrency" to o.priceCurrency,
                    "totalDueSeller" to o.totalDueSeller,
                    "totalMarketplaceFee" to o.totalMarketplaceFee,
                    "salesRecordRef" to o.salesRecordRef,
                    "sellerUsername" to o.sellerUsername,
                    "afterSalesTypes" to (afterSalesMap[o.orderId] ?: emptyList<String>()),
                    "items" to o.items.map { item ->
                        mapOf<String, Any?>(
                            "lineItemId" to item.lineItemId,
                            "legacyItemId" to item.legacyItemId,
                            "title" to item.title,
                            "sku" to item.sku,
                            "quantity" to item.quantity,
                            "lineItemCost" to item.lineItemCost,
                            "lineItemCurrency" to item.lineItemCurrency,
                            "conditionDescription" to item.conditionDescription,
                            "soldFormat" to item.soldFormat,
                        )
                    },
                )
            }

            ResponseEntity.ok(mapOf<String, Any>(
                "content" to items,
                "totalElements" to result.totalElements,
                "number" to result.number,
                "size" to result.size,
                "totalPages" to result.totalPages,
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch orders: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    @PostMapping("/refresh")
    fun refreshOrders(@RequestParam(defaultValue = "all") seller: String): ResponseEntity<Any> {
        return try {
            val pst = ZoneId.of("America/Los_Angeles")
            val today = LocalDate.now(pst)
            val from = today.minusDays(90)

            val sellers = if (seller != "all") listOf(seller)
            else sellerAccountRepo.findAll().map { it.sellerUsername }

            var totalOrders = 0
            for (s in sellers) {
                val batch = syncService.syncDateRange(s, from, today)
                totalOrders += batch.ordersFetched
            }

            ResponseEntity.ok(mapOf("status" to "ok", "ordersSynced" to totalOrders))
        } catch (e: Exception) {
            log.error("Orders refresh failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to (e.message ?: "Unknown error")))
        }
    }

    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun orderEvents(@RequestParam(defaultValue = "all") seller: String): SseEmitter {
        log.info("SSE client connected for Order events, seller={}", seller)
        return saleBroadcaster.subscribe(seller)
    }
}
