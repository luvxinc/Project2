package com.mgmt.modules.ebayapi.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.application.service.AutoOpsService
import com.mgmt.modules.ebayapi.application.service.EbayOAuthService
import com.mgmt.modules.ebayapi.application.service.ListingSaleEventBroadcaster
import com.mgmt.modules.ebayapi.application.service.SalesActionLogService
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.web.bind.annotation.*
import org.springframework.web.client.RestTemplate
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * EbayOfferController — eBay Offer/Negotiation Management API。
 *
 * Uses:
 *   - Negotiation API (REST): findEligibleItems, sendOfferToInterestedBuyers
 *   - Trading API (XML): GetBestOffers — buyer-initiated best offers
 *
 * Endpoints:
 *   GET  /api/v1/ebay/sync/offers           → Get all offers (Trading API)
 *   GET  /api/v1/ebay/sync/offers/eligible   → Get items eligible for seller offers (Negotiation API)
 *   POST /api/v1/ebay/sync/offers/refresh    → Force refresh from eBay
 */
@RestController
@RequestMapping("/ebay/sync/offers")
class EbayOfferController(
    private val oauthService: EbayOAuthService,
    private val sellerRepo: EbaySellerAccountRepository,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val actionLog: SalesActionLogService,
    private val autoOpsService: AutoOpsService,
) {
    private val log = LoggerFactory.getLogger(EbayOfferController::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()

    companion object {
        private const val TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
        private const val NEGOTIATION_BASE = "https://api.ebay.com/sell/negotiation/v1"
    }

    // ═══════════════════════════════════════════════════════════
    // GET /api/v1/ebay/sync/offers?seller=all
    // Retrieve all sent offers (best offers) for authorized sellers
    // ═══════════════════════════════════════════════════════════

    @GetMapping("")
    fun getOffers(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val sellers = if (seller.equals("all", ignoreCase = true)) {
                sellerRepo.findAllByStatus("authorized").map { it.sellerUsername }
            } else {
                listOf(seller)
            }

            val allOffers = mutableListOf<Map<String, Any?>>()

            for (s in sellers) {
                try {
                    val accessToken = oauthService.getValidAccessToken(s)
                    val offers = fetchBestOffersViaTrading(accessToken)
                    offers.forEach { offer ->
                        allOffers.add(offer.toMutableMap().apply { put("seller", s) })
                    }
                } catch (e: Exception) {
                    log.warn("Failed to fetch offers for seller {}: {}", s, e.message)
                }
            }

            ResponseEntity.ok(mapOf(
                "items" to allOffers,
                "total" to allOffers.size,
                "fetchedAt" to java.time.Instant.now().toString(),
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch offers: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    // ═══════════════════════════════════════════════════════════
    // GET /api/v1/ebay/sync/offers/eligible?seller=espartsplus
    // Find items eligible for seller-initiated discount offers
    // (Negotiation API)
    // ═══════════════════════════════════════════════════════════

    @GetMapping("/eligible")
    fun getEligibleItems(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val sellers = if (seller.equals("all", ignoreCase = true)) {
                sellerRepo.findAllByStatus("authorized").map { it.sellerUsername }
            } else {
                listOf(seller)
            }

            val allEligible = mutableListOf<Map<String, Any?>>()

            for (s in sellers) {
                try {
                    val accessToken = oauthService.getValidAccessToken(s)
                    val eligible = fetchEligibleItems(accessToken)
                    eligible.forEach { item ->
                        allEligible.add(item.toMutableMap().apply { put("seller", s) })
                    }
                } catch (e: Exception) {
                    log.warn("Failed to fetch eligible items for seller {}: {}", s, e.message)
                }
            }

            ResponseEntity.ok(mapOf(
                "items" to allEligible,
                "total" to allEligible.size,
                "fetchedAt" to java.time.Instant.now().toString(),
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch eligible items: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    // ═══════════════════════════════════════════════════════════
    // POST /api/v1/ebay/sync/offers/refresh?seller=all
    // Force fresh fetch from eBay (alias for GET with cache bypass)
    // ═══════════════════════════════════════════════════════════

    @PostMapping("/refresh")
    fun refreshOffers(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        return getOffers(seller)
    }

    // ═══════════════════════════════════════════════════════════
    // SSE endpoint — real-time offer events from Webhook
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v1/ebay/sync/offers/events
     * Server-Sent Events endpoint for real-time Best Offer notifications.
     * Uses the same SSE broadcaster as the Listings page.
     */
    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun offerEvents(): SseEmitter {
        log.info("📡 New SSE client connected for Offer events")
        return saleBroadcaster.subscribe()
    }

    // ═══════════════════════════════════════════════════════════
    // POST /api/v1/ebay/sync/offers/respond
    // Respond to Best Offers (Accept/Decline/Counter)
    // ═══════════════════════════════════════════════════════════

    data class RespondRequest(
        val offers: List<OfferAction>,
        val seller: String = "espartsplus",
    )

    data class OfferAction(
        val bestOfferId: String,
        val itemId: String,
        val action: String,  // Accept, Decline, Counter
        val counterPrice: Double? = null,
        val quantity: Int? = null,
        val sellerMessage: String? = null,
    )

    @PostMapping("/respond")
    fun respondToOffers(
        @RequestBody request: RespondRequest,
    ): ResponseEntity<Any> {
        val results = mutableListOf<Map<String, Any?>>()
        val accessToken = oauthService.getValidAccessToken(request.seller)

        for ((idx, offer) in request.offers.withIndex()) {
            // Safety buffer between eBay API calls
            if (idx > 0) {
                Thread.sleep(200)
            }

            log.info("Responding to offer {}/{}: bestOfferId={} action={}", idx + 1, request.offers.size, offer.bestOfferId, offer.action)

            // Delegate to shared service method
            val (isSuccess, errMsg) = autoOpsService.respondToSingleOffer(
                seller = request.seller,
                itemId = offer.itemId,
                bestOfferId = offer.bestOfferId,
                action = offer.action,
                counterPrice = offer.counterPrice,
                quantity = offer.quantity ?: 1,
                sellerMessage = offer.sellerMessage,
            )

            results.add(mapOf(
                "bestOfferId" to offer.bestOfferId,
                "action" to offer.action,
                "success" to isSuccess,
                "error" to errMsg,
            ))

            if (isSuccess) {
                log.info("[OK] [{}/{}] Responded to Best Offer {} with action: {}", idx + 1, request.offers.size, offer.bestOfferId, offer.action)
            } else {
                log.warn("[FAIL] [{}/{}] Failed to respond to Best Offer {}: {}", idx + 1, request.offers.size, offer.bestOfferId, errMsg)
            }
        }

        val successCount = results.count { it["success"] == true }

        // Log each offer reply
        for ((idx2, offer) in request.offers.withIndex()) {
            val result = results.getOrNull(idx2)
            val isSuccess = result?.get("success") == true
            actionLog.logOfferReply(
                triggerType = "MANUAL",
                seller = request.seller,
                bestOfferId = offer.bestOfferId,
                itemId = offer.itemId,
                itemTitle = null,
                buyerUserId = null,
                originalPrice = null,
                offerPrice = null,
                buyerQty = offer.quantity ?: 1,
                action = offer.action,
                counterPrice = offer.counterPrice,
                success = isSuccess,
                errorMessage = result?.get("error")?.toString(),
            )
        }

        return ResponseEntity.ok(mapOf(
            "results" to results,
            "total" to results.size,
            "successCount" to successCount,
            "failCount" to (results.size - successCount),
        ))
    }

    // ═══════════════════════════════════════════════════════════
    // POST /api/v1/ebay/sync/offers/subscribe-notifications
    // Enable BestOffer Platform Notifications via Trading API
    // ═══════════════════════════════════════════════════════════

    /**
     * 通过 Trading API SetNotificationPreferences 启用 BestOffer 事件推送。
     * 
     * Note: Best Offer 事件属于 Trading API Platform Notifications,
     * 不是 REST Notification API, 需要通过 SetNotificationPreferences 启用。
     */
    @PostMapping("/subscribe-notifications")
    fun subscribeNotifications(
        @RequestParam(defaultValue = "espartsplus") seller: String,
        @RequestParam(defaultValue = "https://api.topmorrowusa.com/api/v1/ebay/webhook") notificationUrl: String,
    ): ResponseEntity<Any> {
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)

            val xmlRequest = """
            <?xml version="1.0" encoding="utf-8"?>
            <SetNotificationPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials>
                    <eBayAuthToken>$accessToken</eBayAuthToken>
                </RequesterCredentials>
                <ApplicationDeliveryPreferences>
                    <ApplicationEnable>Enable</ApplicationEnable>
                    <ApplicationURL>$notificationUrl</ApplicationURL>
                    <DeviceType>Platform</DeviceType>
                </ApplicationDeliveryPreferences>
                <UserDeliveryPreferenceArray>
                    <NotificationEnable>
                        <EventType>BestOffer</EventType>
                        <EventEnable>Enable</EventEnable>
                    </NotificationEnable>
                    <NotificationEnable>
                        <EventType>BestOfferDeclined</EventType>
                        <EventEnable>Enable</EventEnable>
                    </NotificationEnable>
                    <NotificationEnable>
                        <EventType>BestOfferPlaced</EventType>
                        <EventEnable>Enable</EventEnable>
                    </NotificationEnable>
                    <NotificationEnable>
                        <EventType>CounterOfferReceived</EventType>
                        <EventEnable>Enable</EventEnable>
                    </NotificationEnable>
                </UserDeliveryPreferenceArray>
            </SetNotificationPreferencesRequest>
            """.trimIndent()

            val headers = HttpHeaders().apply {
                contentType = MediaType.TEXT_XML
                set("X-EBAY-API-SITEID", "0")
                set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
                set("X-EBAY-API-CALL-NAME", "SetNotificationPreferences")
                set("X-EBAY-API-IAF-TOKEN", accessToken)
            }

            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xmlRequest, headers), String::class.java,
            )

            val body = response.body ?: ""
            val isSuccess = body.contains("<Ack>Success</Ack>") || body.contains("<Ack>Warning</Ack>")

            if (isSuccess) {
                log.info("✅ BestOffer notifications enabled for seller: {}", seller)
                ResponseEntity.ok(mapOf(
                    "success" to true,
                    "seller" to seller,
                    "events" to listOf("BestOffer", "BestOfferDeclined", "BestOfferPlaced", "CounterOfferReceived"),
                    "notificationUrl" to notificationUrl,
                    "message" to "Platform notifications enabled — eBay will push BestOffer events to your webhook",
                ))
            } else {
                val errRegex = Regex("<ShortMessage>(.*?)</ShortMessage>")
                val errMsg = errRegex.find(body)?.groupValues?.get(1) ?: "Unknown error"
                log.warn("SetNotificationPreferences failed for {}: {}", seller, errMsg)
                ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf(
                    "success" to false,
                    "error" to errMsg,
                    "rawResponse" to body.take(500),
                ))
            }
        } catch (e: Exception) {
            log.error("Failed to set notification preferences: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    /**
     * GET /api/v1/ebay/sync/offers/notification-status
     * 查看当前 Platform Notification 设置状态。
     */
    @GetMapping("/notification-status")
    fun getNotificationStatus(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)

            val xmlRequest = """
            <?xml version="1.0" encoding="utf-8"?>
            <GetNotificationPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials>
                    <eBayAuthToken>$accessToken</eBayAuthToken>
                </RequesterCredentials>
                <PreferenceLevel>User</PreferenceLevel>
            </GetNotificationPreferencesRequest>
            """.trimIndent()

            val headers = HttpHeaders().apply {
                contentType = MediaType.TEXT_XML
                set("X-EBAY-API-SITEID", "0")
                set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
                set("X-EBAY-API-CALL-NAME", "GetNotificationPreferences")
                set("X-EBAY-API-IAF-TOKEN", accessToken)
            }

            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xmlRequest, headers), String::class.java,
            )

            val body = response.body ?: ""
            // Extract all EventEnable entries
            val eventPattern = Regex(
                "<NotificationEnable>\\s*<EventType>(.*?)</EventType>\\s*<EventEnable>(.*?)</EventEnable>\\s*</NotificationEnable>",
                RegexOption.DOT_MATCHES_ALL
            )
            val events = eventPattern.findAll(body).map { 
                mapOf("event" to it.groupValues[1], "status" to it.groupValues[2]) 
            }.toList()

            // Extract ApplicationURL
            val appUrl = Regex("<ApplicationURL>(.*?)</ApplicationURL>").find(body)?.groupValues?.get(1) ?: "Not set"

            ResponseEntity.ok(mapOf(
                "seller" to seller,
                "applicationUrl" to appUrl,
                "notifications" to events,
                "bestOfferEvents" to events.filter { 
                    it["event"]?.contains("Offer", ignoreCase = true) == true 
                },
            ))
        } catch (e: Exception) {
            log.error("Failed to get notification preferences: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to (e.message ?: "Unknown error"),
            ))
        }
    }

    // ══════════════════════════════════════════════════════════
    // Trading API: GetBestOffers
    // Fetches all buyer-initiated best offers across all items
    // ══════════════════════════════════════════════════════════

    private fun fetchBestOffersViaTrading(accessToken: String): List<Map<String, Any?>> {
        val allOffers = mutableListOf<Map<String, Any?>>()

        // GetBestOffers with no ItemID returns all best offers
        val xmlRequest = """
        <?xml version="1.0" encoding="utf-8"?>
        <GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
                <eBayAuthToken>$accessToken</eBayAuthToken>
            </RequesterCredentials>
            <BestOfferStatus>Active</BestOfferStatus>
            <Pagination>
                <EntriesPerPage>200</EntriesPerPage>
                <PageNumber>1</PageNumber>
            </Pagination>
            <DetailLevel>ReturnAll</DetailLevel>
        </GetBestOffersRequest>
        """.trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "GetBestOffers")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        try {
            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xmlRequest, headers), String::class.java,
            )

            val body = response.body ?: ""

            if (body.contains("<Ack>Failure</Ack>")) {
                val shortErrRegex = Regex("<ShortMessage>(.*?)</ShortMessage>")
                val shortErr = shortErrRegex.find(body)?.groupValues?.get(1) ?: "Unknown"
                log.warn("GetBestOffers returned Failure: {}", shortErr)
                return emptyList()
            }

            // Parse best offers from XML
            val offerPattern = Regex("<BestOffer>(.*?)</BestOffer>", RegexOption.DOT_MATCHES_ALL)
            val itemIdFromResponse = extractXmlValue(body, "ItemID")

            // Get item-level info
            val itemTitle = extractXmlValue(body, "Title") ?: ""
            val itemListingType = extractXmlValue(body, "ListingType") ?: ""
            val buyItNowPrice = extractXmlValue(body, "BuyItNowPrice")?.toDoubleOrNull()

            for (offerMatch in offerPattern.findAll(body)) {
                val offerXml = offerMatch.groupValues[1]

                // eBay uses different tag names depending on context
                val status = extractXmlValue(offerXml, "BestOfferStatus")
                    ?: extractXmlValue(offerXml, "Status")
                val creationTime = extractXmlValue(offerXml, "CreationTime")
                    ?: extractXmlValue(offerXml, "BestOfferCreationTime")

                val offer = mapOf(
                    "bestOfferId" to extractXmlValue(offerXml, "BestOfferID"),
                    "itemId" to (extractXmlValue(offerXml, "ItemID") ?: itemIdFromResponse),
                    "itemTitle" to itemTitle,
                    "buyerUserId" to extractXmlValue(offerXml, "UserID"),
                    "buyerEmail" to extractXmlValue(offerXml, "Email"),
                    "offerPrice" to extractXmlValue(offerXml, "Price")?.toDoubleOrNull(),
                    "offerCurrency" to extractXmlAttribute(offerXml, "Price", "currencyID"),
                    "quantity" to (extractXmlValue(offerXml, "Quantity")?.toIntOrNull() ?: 1),
                    "status" to status,
                    "expirationTime" to extractXmlValue(offerXml, "ExpirationTime"),
                    "creationTime" to (creationTime ?: run {
                        // Infer from ExpirationTime - 24h (eBay default offer validity)
                        val exp = extractXmlValue(offerXml, "ExpirationTime")
                        if (exp != null) {
                            try {
                                val expInstant = java.time.Instant.parse(exp)
                                expInstant.minusSeconds(24 * 3600).toString()
                            } catch (_: Exception) { null }
                        } else null
                    }),
                    "callStatus" to extractXmlValue(offerXml, "CallStatus"),
                    "buyerMessage" to extractXmlValue(offerXml, "BuyerMessage"),
                    "bestOfferCodeType" to extractXmlValue(offerXml, "BestOfferCodeType"),
                    "buyItNowPrice" to buyItNowPrice,
                )
                allOffers.add(offer)
            }

            // Debug log first offer XML if fields missing
            if (allOffers.isNotEmpty() && allOffers.first()["status"] == null) {
                val firstOffer = offerPattern.find(body)?.groupValues?.get(1) ?: ""
                log.warn("⚠️ Missing status in offer XML. First offer tags: {}", 
                    firstOffer.take(500))
            }

            log.info("Fetched {} best offers via Trading API", allOffers.size)
        } catch (e: Exception) {
            log.error("GetBestOffers failed: {}", e.message, e)
        }

        return allOffers
    }

    // ══════════════════════════════════════════════════════════
    // Negotiation API: findEligibleItems
    // ══════════════════════════════════════════════════════════

    private fun fetchEligibleItems(accessToken: String): List<Map<String, Any?>> {
        val items = mutableListOf<Map<String, Any?>>()

        val headers = HttpHeaders().apply {
            setBearerAuth(accessToken)
            accept = listOf(MediaType.APPLICATION_JSON)
            set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US")
        }

        try {
            var offset = 0
            val limit = 200

            while (true) {
                val url = "$NEGOTIATION_BASE/find_eligible_items?limit=$limit&offset=$offset"
                val response = restTemplate.exchange(
                    java.net.URI.create(url), HttpMethod.GET,
                    HttpEntity<Void>(headers), String::class.java,
                )

                val json = mapper.readTree(response.body ?: "{}")
                val eligibleItems = json.path("eligibleItems")

                if (!eligibleItems.isArray || eligibleItems.size() == 0) break

                for (item in eligibleItems) {
                    items.add(mapOf(
                        "listingId" to item.path("listingId").asText(),
                        "title" to item.path("title").asText(""),
                        "currentPrice" to item.path("currentPrice").path("value").asDouble(),
                        "currency" to item.path("currentPrice").path("currency").asText("USD"),
                        "eligibleCount" to item.path("eligibleCount").asInt(0),
                    ))
                }

                offset += limit
                val total = json.path("total").asInt(0)
                if (offset >= total) break
            }

            log.info("Fetched {} eligible items via Negotiation API", items.size)
        } catch (e: Exception) {
            log.warn("Negotiation API findEligibleItems failed: {}", e.message)
        }

        return items
    }

    // ═══════════════════════════════════════════════════════════
    // XML 解析辅助
    // ═══════════════════════════════════════════════════════════

    private fun extractXmlValue(xml: String, tag: String): String? {
        val regex = Regex("<$tag[^>]*>(.*?)</$tag>", RegexOption.DOT_MATCHES_ALL)
        return regex.find(xml)?.groupValues?.get(1)?.trim()
    }

    private fun extractXmlAttribute(xml: String, tag: String, attribute: String): String? {
        val regex = Regex("<$tag[^>]*$attribute=\"([^\"]*?)\"[^>]*>", RegexOption.DOT_MATCHES_ALL)
        return regex.find(xml)?.groupValues?.get(1)?.trim()
    }
}
