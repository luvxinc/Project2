package com.mgmt.modules.ebayapi.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.application.service.EbayMessageSyncService
import com.mgmt.modules.ebayapi.application.service.ListingSaleEventBroadcaster
import com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository
import com.mgmt.modules.ebayapi.domain.repository.EbayMessageRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.LocalDate
import java.time.ZoneId

@RestController
@RequestMapping("/ebay/sync/messages")
class EbayMessageController(
    private val messageRepo: EbayMessageRepository,
    private val messageSyncService: EbayMessageSyncService,
    private val sellerAccountRepo: EbaySellerAccountRepository,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val listingCacheRepo: EbayListingCacheRepository,
) {
    private val mapper = ObjectMapper()
    private val log = LoggerFactory.getLogger(EbayMessageController::class.java)

    @GetMapping("")
    fun getMessages(
        @RequestParam(defaultValue = "all") seller: String,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
    ): ResponseEntity<Any> {
        return try {
            val pageable = PageRequest.of(page, size)
            val result = messageRepo.findFiltered(seller, pageable)

            // Batch-lookup SKU from listing cache by itemId
            val itemIds = result.content.mapNotNull { it.itemId }.distinct()
            val skuMap = mutableMapOf<String, String>()
            if (itemIds.isNotEmpty()) {
                val caches = listingCacheRepo.findAllById(itemIds)
                for (cache in caches) {
                    try {
                        val json = mapper.readTree(cache.data)
                        val sku = json.path("sku").asText(null)
                        if (!sku.isNullOrBlank()) {
                            skuMap[cache.itemId] = sku
                        }
                    } catch (_: Exception) {}
                }
            }

            val items = result.content.map { m ->
                mapOf(
                    "id" to m.id,
                    "messageId" to m.messageId,
                    "sender" to m.sender,
                    "senderUsername" to m.senderUsername,
                    "recipientUsername" to m.recipientUsername,
                    "sellerUsername" to m.sellerUsername,
                    "itemId" to m.itemId,
                    "itemTitle" to m.itemTitle,
                    "sku" to (m.itemId?.let { skuMap[it] } ?: ""),
                    "subject" to m.subject,
                    "body" to m.body,
                    "messageType" to m.messageType,
                    "folderId" to m.folderId,
                    "isRead" to m.isRead,
                    "flagged" to m.flagged,
                    "replied" to m.replied,
                    "parentMessageId" to m.parentMessageId,
                    "responseTimeSeconds" to m.responseTimeSeconds,
                    "receivedAt" to m.receivedAt.toString(),
                    "createdAt" to m.createdAt.toString(),
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
            log.error("Failed to fetch messages: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    @GetMapping("/stats")
    fun getResponseTimeStats(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val rawResult = messageRepo.getResponseTimeStats(seller)

            // JPA aggregate query returns Object[] as a single element in Array<Any?>
            // rawResult[0] is the actual Object[] with [avg, max, count]
            val row: Array<*> = when {
                rawResult.isEmpty() -> arrayOfNulls<Any>(3)
                rawResult[0] is Array<*> -> rawResult[0] as Array<*>
                else -> rawResult // already flat (some JPA impls return flat)
            }

            val avgSeconds = (row.getOrNull(0) as? Number)?.toLong()
            val maxSeconds = (row.getOrNull(1) as? Number)?.toLong()
            val totalReplies = (row.getOrNull(2) as? Number)?.toLong() ?: 0L

            ResponseEntity.ok(mapOf(
                "avgResponseSeconds" to avgSeconds,
                "maxResponseSeconds" to maxSeconds,
                "totalMessages" to totalReplies,
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch message stats: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    @PostMapping("/refresh")
    fun refreshMessages(
        @RequestParam(defaultValue = "all") seller: String,
        @RequestParam(defaultValue = "365") days: Int,
    ): ResponseEntity<Any> {
        return try {
            val pst = ZoneId.of("America/Los_Angeles")
            val today = LocalDate.now(pst)
            // eBay messages expire after 1 year — default to 365 days (max retention)
            val effectiveDays = days.coerceIn(1, 365)
            val from = today.minusDays(effectiveDays.toLong())

            val sellers = if (seller != "all") listOf(seller)
            else sellerAccountRepo.findAll().map { it.sellerUsername }

            var totalMessages = 0
            for (s in sellers) {
                val result = messageSyncService.syncDateRange(s, from, today)
                totalMessages += result.upserted
            }

            ResponseEntity.ok(mapOf("status" to "ok", "messagesSynced" to totalMessages))
        } catch (e: Exception) {
            log.error("Messages refresh failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to (e.message ?: "Unknown error")))
        }
    }

    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun messageEvents(@RequestParam(defaultValue = "all") seller: String): SseEmitter {
        log.info("SSE client connected for Message events, seller={}", seller)
        return saleBroadcaster.subscribe(seller)
    }
}
