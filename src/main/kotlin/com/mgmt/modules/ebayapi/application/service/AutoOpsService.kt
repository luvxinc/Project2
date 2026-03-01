package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.domain.repository.EbayBestOfferRepository
import com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.client.RestTemplate
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * AutoOpsService — 全自动运维引擎。
 *
 * 当 automation_rules.SYSTEM.auto_ops_enabled = true 时:
 *   1. 销售 Webhook → 延迟 15 秒 → 自动 restock 涉及的 listing
 *   2. Offer Webhook → 延迟 10 秒 → 自动回复 offer
 *   3. 每天 2:30 AM PST → 全部 listing promoted rate 自动更新
 *
 * 延迟执行使用 ScheduledExecutorService，不阻塞 Webhook handler 线程。
 */
@Service
class AutoOpsService(
    private val oauthService: EbayOAuthService,
    private val sellerAccountRepo: EbaySellerAccountRepository,
    private val listingCacheRepo: EbayListingCacheRepository,
    private val bestOfferRepo: EbayBestOfferRepository,
    private val actionLog: SalesActionLogService,
    private val jdbcTemplate: JdbcTemplate,
) {
    private val log = LoggerFactory.getLogger(AutoOpsService::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()
    private val scheduler = Executors.newScheduledThreadPool(2)

    companion object {
        private const val TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
        private const val MARKETING_BASE = "https://api.ebay.com/sell/marketing/v1"
        private const val RECOMMENDATION_BASE = "https://api.ebay.com/sell/recommendation/v1"
    }

    // ═══════════════════════════════════════════════
    // 1. Auto-Restock (triggered by sale Webhook, 15s delay)
    // ═══════════════════════════════════════════════

    /**
     * Called from EbayWebhookService when a sale is confirmed.
     * Schedules a delayed restock for the sold items.
     */
    fun scheduleAutoRestock(soldItems: List<SoldItemInfo>) {
        if (!actionLog.isAutoOpsEnabled()) return

        log.info("[AutoOps] Auto-ops: scheduling restock for {} items in 15s", soldItems.size)
        scheduler.schedule({
            try {
                executeAutoRestock(soldItems)
            } catch (e: Exception) {
                log.error("[AutoOps] Auto-restock failed: {}", e.message, e)
            }
        }, 15, TimeUnit.SECONDS)
    }

    private fun executeAutoRestock(soldItems: List<SoldItemInfo>) {
        val startMs = System.currentTimeMillis()
        log.info("[AutoOps] Auto-restock executing for {} sold items", soldItems.size)

        // Load restock rules from automation_rules
        val rules = loadRestockRules()
        val divisor = rules["sold_divisor"]?.toIntOrNull() ?: 30
        val minStock = rules["min_stock"]?.toIntOrNull() ?: 5
        val maxStock = rules["max_stock"]?.toIntOrNull() ?: 50

        // Group by seller (derive from cached listing data)
        val sellerItemMap = mutableMapOf<String, MutableList<SoldItemInfo>>()
        for (item in soldItems) {
            // Find seller from listing cache — no fallback, skip if unknown
            val cached = listingCacheRepo.findByItemId(item.itemId).firstOrNull()
            if (cached == null) {
                log.warn("[AutoOps] Auto-restock: cannot determine seller for item {}, skipping", item.itemId)
                continue
            }
            val seller = cached.seller

            sellerItemMap.getOrPut(seller) { mutableListOf() }.add(item)
        }

        var totalSuccess = 0
        var totalFailed = 0

        for ((seller, items) in sellerItemMap) {
            try {
                val accessToken = oauthService.getValidAccessToken(seller)

                // For each sold item, look up current soldQuantity from cache and calculate new qty
                for (item in items) {
                    try {
                        val cached = listingCacheRepo.findByItemIdAndSeller(item.itemId, seller)
                        val cachedJson = if (cached != null) mapper.readTree(cached.data) else null
                        val currentSoldQty = cachedJson?.path("soldQuantity")?.asInt(0) ?: 0
                        val currentAvailQty = cachedJson?.path("availableQuantity")?.asInt(0) ?: 0
                        val totalSold = currentSoldQty + item.quantitySold
                        val newQty = (totalSold / divisor).coerceIn(minStock, maxStock)

                        // Build XML and call API
                        val sku = item.sku
                        val inventoryXml = buildInventoryStatusXml(item.itemId, sku, newQty)
                        val ok = callReviseInventoryStatus(accessToken, inventoryXml)

                        if (ok) {
                            totalSuccess++
                            actionLog.logRestock(
                                triggerType = "AUTO",
                                seller = seller,
                                itemId = item.itemId,
                                itemTitle = item.title,
                                sku = sku,
                                oldQty = currentAvailQty,
                                newQty = newQty,
                                soldQty = totalSold,
                            )
                        } else {
                            totalFailed++
                            actionLog.logRestock(
                                triggerType = "AUTO",
                                seller = seller,
                                itemId = item.itemId,
                                itemTitle = item.title,
                                sku = sku,
                                oldQty = currentAvailQty,
                                newQty = newQty,
                                soldQty = totalSold,
                                success = false,
                                errorMessage = "ReviseInventoryStatus returned Failure",
                            )
                        }

                        // Rate limit
                        Thread.sleep(100)
                    } catch (e: Exception) {
                        totalFailed++
                        log.warn("[AutoOps] Auto-restock failed for item {}: {}", item.itemId, e.message)
                    }
                }
            } catch (e: Exception) {
                log.error("[AutoOps] Auto-restock failed for seller {}: {}", seller, e.message)
            }
        }

        val durationMs = System.currentTimeMillis() - startMs
        log.info("[AutoOps] Auto-restock done: {}/{} succeeded in {}ms", totalSuccess, soldItems.size, durationMs)

        actionLog.logBulkRestock(
            triggerType = "AUTO",
            seller = sellerItemMap.keys.joinToString(","),
            total = soldItems.size,
            successCount = totalSuccess,
            failedCount = totalFailed,
            durationMs = durationMs,
        )
    }

    // ═══════════════════════════════════════════════
    // 2. Auto-Reply Offer (triggered by offer Webhook, 10s delay)
    // ═══════════════════════════════════════════════

    /**
     * Called from EbayWebhookService when a Best Offer is received.
     * Schedules a delayed auto-reply.
     * @param delaySeconds delay before executing (10s for webhook, 0 for refresh catch-up)
     */
    fun scheduleAutoReply(offer: OfferEventInfo, delaySeconds: Long = 10) {
        if (!actionLog.isAutoOpsEnabled()) return

        log.info("[AutoOps] Auto-ops: scheduling offer reply for {} in {}s", offer.bestOfferId, delaySeconds)
        scheduler.schedule({
            try {
                executeAutoReply(offer)
            } catch (e: Exception) {
                log.error("[AutoOps] Auto-reply failed: {}", e.message, e)
            }
        }, delaySeconds, TimeUnit.SECONDS)
    }

    private fun executeAutoReply(offer: OfferEventInfo) {
        val seller = offer.seller ?: "espartsplus"

        // Load offer reply rules (tree + strategies)
        val autoAction = computeAutoAction(offer, seller)
        if (autoAction == null) {
            log.info("[AutoOps] Auto-reply: no matching rule for offer {}, skipping", offer.bestOfferId)
            // Mark as "NoRule" so refresh won't retry this offer endlessly
            try {
                val bestOfferId = offer.bestOfferId ?: ""
                if (bestOfferId.isNotBlank()) {
                    val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                    if (dbOffer != null && dbOffer.status == "Pending") {
                        dbOffer.status = "NoRule"
                        dbOffer.updatedAt = Instant.now()
                        bestOfferRepo.save(dbOffer)
                    }
                }
            } catch (_: Exception) {}
            return
        }

        val action = autoAction["action"] as String
        val counterPrice = autoAction["counterPrice"] as? Double

        log.info("[AutoOps] Auto-reply: {} for offer {} (counter={})",
            action, offer.bestOfferId, counterPrice ?: "N/A")

        // Delegate to shared respondToSingleOffer method
        val (success, errorMsg) = respondToSingleOffer(
            seller = seller,
            itemId = offer.itemId,
            bestOfferId = offer.bestOfferId ?: "",
            action = action,
            counterPrice = counterPrice,
            quantity = offer.quantity ?: 1,
        )

        actionLog.logOfferReply(
            triggerType = "AUTO",
            seller = seller,
            bestOfferId = offer.bestOfferId ?: "",
            itemId = offer.itemId,
            itemTitle = offer.itemTitle,
            buyerUserId = offer.buyerUserId,
            originalPrice = offer.buyItNowPrice,
            offerPrice = offer.offerPrice,
            buyerQty = offer.quantity ?: 1,
            action = action,
            counterPrice = counterPrice,
            ruleUsed = autoAction["ruleUsed"] as? String,
            success = success,
            errorMessage = errorMsg,
        )

        if (success) {
            log.info("[AutoOps] Auto-reply succeeded: {} for offer {}", action, offer.bestOfferId)

            // Update offer status in DB so it no longer shows as "Pending"
            try {
                val bestOfferId = offer.bestOfferId ?: ""
                if (bestOfferId.isNotBlank()) {
                    val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                    if (dbOffer != null) {
                        dbOffer.status = when (action.lowercase()) {
                            "accept" -> "Accepted"
                            "decline" -> "Declined"
                            "counter" -> "CounterOffered"
                            else -> action
                        }
                        dbOffer.updatedAt = Instant.now()
                        bestOfferRepo.save(dbOffer)
                        log.info("[AutoOps] Updated offer {} status → {}", bestOfferId, dbOffer.status)
                    }
                }
            } catch (e: Exception) {
                log.warn("[AutoOps] Failed to update offer {} status in DB: {}", offer.bestOfferId, e.message)
            }
        } else {
            log.warn("[AutoOps] Auto-reply failed for offer {}: {}", offer.bestOfferId, errorMsg)

            // If eBay says offer is no longer available, update DB to remove from Pending list
            val isOfferGone = errorMsg?.contains("no longer available", ignoreCase = true) == true
                    || errorMsg?.contains("is not active", ignoreCase = true) == true
                    || errorMsg?.contains("expired", ignoreCase = true) == true
            if (isOfferGone) {
                try {
                    val bestOfferId = offer.bestOfferId ?: ""
                    if (bestOfferId.isNotBlank()) {
                        val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                        if (dbOffer != null) {
                            dbOffer.status = "Expired"
                            dbOffer.updatedAt = Instant.now()
                            bestOfferRepo.save(dbOffer)
                            log.info("[AutoOps] Offer {} marked Expired (eBay: no longer available)", bestOfferId)
                        }
                    }
                } catch (e: Exception) {
                    log.warn("[AutoOps] Failed to mark offer {} as Expired: {}", offer.bestOfferId, e.message)
                }
            }
        }
    }

    // ═══════════════════════════════════════════════
    // 3. Daily Auto-Promote (2:30 AM PST)
    // ═══════════════════════════════════════════════

    /**
     * Every day at 2:30 AM PST, auto-update promoted rates for all listings.
     * Only runs if auto_ops_enabled = true.
     */
    @Scheduled(cron = "0 30 2 * * *", zone = "America/Los_Angeles")
    @org.springframework.transaction.annotation.Transactional
    fun dailyAutoPromote() {
        if (!actionLog.isAutoOpsEnabled()) {
            log.info("[AutoOps] Auto-promote: disabled, skipping")
            return
        }

        log.info("═══════════════════════════════════════")
        log.info("[AutoOps] Daily auto-promote triggered at {}", Instant.now())
        log.info("═══════════════════════════════════════")

        val startMs = System.currentTimeMillis()
        val sellers = sellerAccountRepo.findAll()

        // Load ad rules
        val adRules = loadAdRules()
        val conservativeWeight = adRules["conservative_weight"]?.toIntOrNull() ?: 70
        val aggressiveWeight = adRules["aggressive_weight"]?.toIntOrNull() ?: 30
        val adRateMax = adRules["ad_rate_max"]?.toDoubleOrNull() ?: 8.0
        val adRateMin = adRules["ad_rate_min"]?.toDoubleOrNull() ?: 2.0

        for (account in sellers) {
            val seller = account.sellerUsername
            try {
                val accessToken = oauthService.getValidAccessToken(seller)
                val cachedListings = listingCacheRepo.findAllBySeller(seller)
                if (cachedListings.isEmpty()) continue

                // Get current promoted listings and suggested rates
                val itemIds = cachedListings.map { it.itemId }
                val suggestedRates = fetchSuggestedAdRatesInternal(accessToken, itemIds)

                // Calculate new rates for each listing
                val updates = mutableListOf<Map<String, String>>()
                for (cached in cachedListings) {
                    val json = try { mapper.readTree(cached.data) } catch (_: Exception) { continue }
                    val suggested = suggestedRates[cached.itemId] ?: continue
                    val currentRate = if (json.has("adRate") && !json.path("adRate").isNull)
                        json.path("adRate").asDouble() else null

                    // Blend: conservative = suggested, aggressive = suggested * weight factor
                    val blendedRate = (suggested * conservativeWeight / 100.0 +
                            (suggested * 1.2) * aggressiveWeight / 100.0)
                        .coerceIn(adRateMin, adRateMax)
                    val finalRate = "%.1f".format(blendedRate)

                    if (currentRate == null || kotlin.math.abs(currentRate - blendedRate) > 0.05) {
                        updates.add(mapOf(
                            "listingId" to cached.itemId,
                            "bidPercentage" to finalRate,
                        ))
                    }
                }

                if (updates.isEmpty()) {
                    log.info("[AutoOps] Auto-promote: no rate changes needed for seller {}", seller)
                    continue
                }

                // Find running CPS campaign
                val mktHeaders = HttpHeaders().apply {
                    setBearerAuth(accessToken)
                    accept = listOf(MediaType.APPLICATION_JSON)
                    contentType = MediaType.APPLICATION_JSON
                }

                val campaignsUrl = "$MARKETING_BASE/ad_campaign?campaign_status=RUNNING&limit=100"
                val campaignsResponse = restTemplate.exchange(
                    java.net.URI.create(campaignsUrl), HttpMethod.GET,
                    HttpEntity<Void>(mktHeaders), String::class.java,
                )
                val campaignsJson = mapper.readTree(campaignsResponse.body ?: "{}")
                val campaigns = campaignsJson.path("campaigns")

                var campaignId: String? = null
                var isDynamicCampaign = false
                if (campaigns.isArray) {
                    for (c in campaigns) {
                        if (c.path("fundingStrategy").path("fundingModel").asText() == "COST_PER_SALE") {
                            campaignId = c.path("campaignId").asText()
                            isDynamicCampaign = c.path("fundingStrategy").path("adRateStrategy").asText() == "DYNAMIC"
                            break
                        }
                    }
                    if (campaignId == null && campaigns.size() > 0) {
                        campaignId = campaigns[0].path("campaignId").asText()
                        isDynamicCampaign = campaigns[0].path("fundingStrategy").path("adRateStrategy").asText() == "DYNAMIC"
                    }
                }

                if (campaignId.isNullOrBlank()) {
                    log.warn("[AutoOps] Auto-promote: no running campaign found for seller {}", seller)
                    continue
                }

                // Apply via Marketing API bulk_create_ads (eBay limit: 500 per call)
                log.info("[AutoOps] Auto-promote: updating {} listings for seller {} via campaign {} (dynamic={})",
                    updates.size, seller, campaignId, isDynamicCampaign)

                val bulkUrl = "$MARKETING_BASE/ad_campaign/$campaignId/bulk_create_ads_by_listing_id"
                val batches = updates.chunked(500)
                var batchSuccess = 0; var batchFailed = 0

                batches.forEachIndexed { idx, batch ->
                    if (idx > 0) Thread.sleep(200)
                    try {
                        // For DYNAMIC campaigns, eBay manages ad rates — do NOT send bidPercentage
                        val requestItems = if (isDynamicCampaign) {
                            batch.map { mapOf("listingId" to it["listingId"]!!) }
                        } else {
                            batch
                        }
                        val bulkBody = mapOf("requests" to requestItems)
                        val bulkResponse = restTemplate.exchange(
                            java.net.URI.create(bulkUrl), HttpMethod.POST,
                            HttpEntity(mapper.writeValueAsString(bulkBody), mktHeaders),
                            String::class.java,
                        )
                        val resultJson = mapper.readTree(bulkResponse.body ?: "{}")
                        val responses = resultJson.path("responses")
                        if (responses.isArray) {
                            for (r in responses) {
                                val statusCode = r.path("statusCode").asInt()
                                if (statusCode in 200..299) {
                                    batchSuccess++
                                } else {
                                    // errorId 35036 = "ad already exists" → already promoted, treat as success
                                    val errorId = r.path("errors").firstOrNull()?.path("errorId")?.asInt(0) ?: 0
                                    if (errorId == 35036) batchSuccess++ else batchFailed++
                                }
                            }
                        }
                    } catch (e: Exception) {
                        batchFailed += batch.size
                        log.warn("[AutoOps] Auto-promote batch {} failed: {}", idx + 1, e.message)
                    }
                }

                // Update local listing cache with new ad rates
                // Only for non-DYNAMIC campaigns — DYNAMIC rates are managed by eBay
                if (batchSuccess > 0 && !isDynamicCampaign) {
                    val rateMap = updates.associate { it["listingId"]!! to it["bidPercentage"]!! }
                    var cacheUpdated = 0
                    for ((listingId, newRate) in rateMap) {
                        try {
                            val cached = listingCacheRepo.findByItemIdAndSeller(listingId, seller) ?: continue
                            val json = mapper.readTree(cached.data)
                            if (json is com.fasterxml.jackson.databind.node.ObjectNode) {
                                json.put("adRate", newRate.toDouble())
                                cached.data = mapper.writeValueAsString(json)
                                listingCacheRepo.save(cached)
                                cacheUpdated++
                            }
                        } catch (e: Exception) {
                            log.debug("[AutoOps] Failed to update cache adRate for {}: {}", listingId, e.message)
                        }
                    }
                    log.info("[AutoOps] Auto-promote: updated {} listing cache adRate entries for seller {}", cacheUpdated, seller)
                } else if (isDynamicCampaign) {
                    log.info("[AutoOps] Auto-promote: skipping cache adRate update for seller {} (DYNAMIC campaign — rates managed by eBay)", seller)
                }

                val durationMs = System.currentTimeMillis() - startMs
                actionLog.logPromote(
                    triggerType = "SCHEDULED",
                    seller = seller,
                    strategy = "auto (c${conservativeWeight}/a${aggressiveWeight})",
                    total = updates.size,
                    successCount = batchSuccess,
                    failedCount = batchFailed,
                    campaignId = campaignId,
                    durationMs = durationMs,
                )
            } catch (e: Exception) {
                log.error("[AutoOps] Auto-promote failed for seller {}: {}", seller, e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════════════
    // Helper methods
    // ═══════════════════════════════════════════════

    private fun loadRestockRules(): Map<String, String> {
        val rules = mutableMapOf<String, String>()
        try {
            val rows = jdbcTemplate.queryForList(
                "SELECT rule_key, rule_value FROM automation_rules WHERE module = 'RESTOCK'"
            )
            for (row in rows) {
                rules[row["rule_key"].toString()] = row["rule_value"].toString()
            }
        } catch (_: Exception) {}
        return rules
    }

    private fun loadAdRules(): Map<String, String> {
        val rules = mutableMapOf<String, String>()
        try {
            val rows = jdbcTemplate.queryForList(
                "SELECT rule_key, rule_value FROM automation_rules WHERE module = 'ADS'"
            )
            for (row in rows) {
                rules[row["rule_key"].toString()] = row["rule_value"].toString()
            }
        } catch (_: Exception) {}
        return rules
    }

    private fun buildInventoryStatusXml(itemId: String, sku: String?, quantity: Int): String {
        val skuTag = if (!sku.isNullOrBlank()) "<SKU>$sku</SKU>" else ""
        return """
            <InventoryStatus>
                <ItemID>$itemId</ItemID>
                $skuTag
                <Quantity>$quantity</Quantity>
            </InventoryStatus>
        """.trimIndent()
    }

    private fun callReviseInventoryStatus(accessToken: String, inventoryStatusXml: String): Boolean {
        val xml = """<?xml version="1.0" encoding="utf-8"?>
            <ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials>
                    <eBayAuthToken>$accessToken</eBayAuthToken>
                </RequesterCredentials>
                $inventoryStatusXml
            </ReviseInventoryStatusRequest>""".trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "ReviseInventoryStatus")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        return try {
            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xml, headers), String::class.java
            )
            val body = response.body ?: ""
            if (body.contains("<Ack>Failure</Ack>")) {
                log.error("ReviseInventoryStatus failed: {}", body.take(500))
                false
            } else true
        } catch (e: Exception) {
            log.warn("ReviseInventoryStatus failed: {}", e.message)
            false
        }
    }

    // ═══════════════════════════════════════════════
    // Shared: respond to a single Best Offer via eBay Trading API
    // Used by: executeAutoReply (AUTO) + EbayOfferController (MANUAL)
    // ═══════════════════════════════════════════════

    /**
     * Respond to a single Best Offer via eBay Trading API.
     *
     * @return Pair(success, errorMessage?)
     */
    fun respondToSingleOffer(
        seller: String,
        itemId: String,
        bestOfferId: String,
        action: String,
        counterPrice: Double? = null,
        quantity: Int = 1,
        sellerMessage: String? = null,
    ): Pair<Boolean, String?> {
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)

            val counterBlock = if (action.equals("Counter", ignoreCase = true) && counterPrice != null) {
                "<CounterOfferPrice>$counterPrice</CounterOfferPrice>\n                    <CounterOfferQuantity>$quantity</CounterOfferQuantity>"
            } else ""
            val messageBlock = if (!sellerMessage.isNullOrBlank()) {
                "<SellerResponse>$sellerMessage</SellerResponse>"
            } else ""

            val xmlRequest = """<?xml version="1.0" encoding="utf-8"?>
                <RespondToBestOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                    <RequesterCredentials>
                        <eBayAuthToken>$accessToken</eBayAuthToken>
                    </RequesterCredentials>
                    <ItemID>$itemId</ItemID>
                    <BestOfferID>$bestOfferId</BestOfferID>
                    <Action>$action</Action>
                    $counterBlock
                    $messageBlock
                </RespondToBestOfferRequest>
            """.trimIndent()

            val headers = HttpHeaders().apply {
                contentType = MediaType.TEXT_XML
                set("X-EBAY-API-SITEID", "0")
                set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
                set("X-EBAY-API-CALL-NAME", "RespondToBestOffer")
                set("X-EBAY-API-IAF-TOKEN", accessToken)
            }

            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xmlRequest, headers), String::class.java,
            )

            val body = response.body ?: ""
            val isSuccess = body.contains("<Ack>Success</Ack>") || body.contains("<Ack>Warning</Ack>")
            val errMsg = if (!isSuccess) {
                Regex("<ShortMessage>(.*?)</ShortMessage>").find(body)?.groupValues?.get(1) ?: "RespondToBestOffer returned Failure"
            } else null

            Pair(isSuccess, errMsg)
        } catch (e: Exception) {
            log.error("RespondToBestOffer failed for {}: {}", bestOfferId, e.message)
            Pair(false, e.message ?: "HTTP error")
        }
    }

    /**
     * Compute auto-reply action using the offer reply decision tree + strategies.
     * Returns null if no matching rule found.
     */
    private fun computeAutoAction(offer: OfferEventInfo, seller: String): Map<String, Any?>? {
        val buyNowPrice = offer.buyItNowPrice ?: return null
        val offerPrice = offer.offerPrice ?: return null
        if (buyNowPrice <= 0) return null

        // Load SKU from listing cache
        val cached = listingCacheRepo.findByItemIdAndSeller(offer.itemId, seller)
        val customLabel = if (cached != null) {
            try { mapper.readTree(cached.data).path("sku").asText("") } catch (_: Exception) { "" }
        } else ""

        // Determine category group from sku_categories
        val categoryGroup = try {
            jdbcTemplate.queryForObject(
                """SELECT category_group FROM automation_sku_categories 
                   WHERE ? LIKE sku_prefix || '%' ORDER BY LENGTH(sku_prefix) DESC LIMIT 1""",
                String::class.java, customLabel.uppercase()
            ) ?: "OTHER"
        } catch (_: Exception) { "OTHER" }

        // Load enabled tree dimensions
        val treeDims = try {
            jdbcTemplate.queryForList(
                """SELECT decision_key FROM offer_reply_tree 
                   WHERE category_group = ? AND enabled = true ORDER BY level""",
                categoryGroup
            ).map { it["decision_key"].toString() }
        } catch (_: Exception) { emptyList() }

        // Build path_key (simplified — matches frontend logic)
        val rootSku = customLabel.split(Regex("[,;|\\s]"))[0].uppercase().replace(Regex("\\.[0-9]+$"), "")
        val pathParts = mutableListOf<String>()
        for (dim in treeDims) {
            when (dim) {
                "by_lug" -> if (rootSku.isNotEmpty()) pathParts.add("lug:${rootSku[0]}")
                "by_thickness" -> if (rootSku.length >= 2) pathParts.add("thickness:${rootSku.takeLast(2)}")
                "by_piece_count" -> {
                    val packMatch = Regex("\\.(\\d+)$").find(customLabel)
                    val pc = packMatch?.groupValues?.get(1) ?: "4"
                    pathParts.add("piece_count:$pc")
                }
                "by_price_range" -> {
                    val ranges = try {
                        jdbcTemplate.queryForObject(
                            "SELECT rule_value FROM automation_rules WHERE module = 'OFFER' AND rule_key = 'price_ranges'",
                            String::class.java
                        )?.split(",") ?: emptyList()
                    } catch (_: Exception) { emptyList() }
                    val matched = ranges.find { r ->
                        val parts = r.split("-").mapNotNull { it.toDoubleOrNull() }
                        parts.size == 2 && buyNowPrice >= parts[0] && buyNowPrice <= parts[1]
                    }
                    if (matched != null) pathParts.add("price_range:$matched")
                }
            }
        }
        val pathKey = if (pathParts.isNotEmpty()) pathParts.joinToString("|") else "*"
        val qty = offer.quantity ?: 1

        // Find matching strategy
        val strategy = try {
            jdbcTemplate.queryForMap(
                """SELECT discount_type, discount_value FROM offer_reply_strategy 
                   WHERE category_group = ? AND path_key = ? AND qty_min <= ? AND (qty_max IS NULL OR qty_max >= ?)
                   AND enabled = true ORDER BY id LIMIT 1""",
                categoryGroup, pathKey, qty, qty
            )
        } catch (_: Exception) {
            // Fallback to wildcard
            try {
                jdbcTemplate.queryForMap(
                    """SELECT discount_type, discount_value FROM offer_reply_strategy 
                       WHERE category_group = ? AND path_key = '*' AND qty_min <= ? AND (qty_max IS NULL OR qty_max >= ?)
                       AND enabled = true ORDER BY id LIMIT 1""",
                    categoryGroup, qty, qty
                )
            } catch (_: Exception) { null }
        } ?: return null

        val discountType = strategy["discount_type"].toString()
        val discountValue = (strategy["discount_value"] as? Number)?.toDouble() ?: return null

        val counterPrice = if (discountType == "PERCENT") {
            buyNowPrice * (1 - discountValue / 100)
        } else {
            buyNowPrice - discountValue
        }.coerceAtLeast(0.0).let { Math.round(it * 100) / 100.0 }

        // Normalize counter to .99 pricing
        val normalizedCounter = Math.max(0.99, Math.floor(counterPrice) - 0.01)

        // Decide action: if buyer's offer >= our normalized counter, Accept;
        // otherwise Counter with the normalized price.
        // This prevents the absurd case of countering LOWER than the buyer's offer
        // (e.g., buyer offers $18, raw counter = $18.39, normalized = $17.99 → should Accept)
        val action = if (offerPrice >= normalizedCounter) "Accept" else "Counter"

        return mapOf(
            "action" to action,
            "counterPrice" to if (action == "Counter") normalizedCounter else null,
            "ruleUsed" to "$categoryGroup|$pathKey",
        )
    }

    /** Fetch suggested ad rates (same as EbaySyncScheduler but accessible here) */
    private fun fetchSuggestedAdRatesInternal(accessToken: String, listingIds: List<String>): Map<String, Double> {
        val suggestedMap = mutableMapOf<String, Double>()
        val headers = HttpHeaders().apply {
            setBearerAuth(accessToken)
            contentType = MediaType.APPLICATION_JSON
            accept = listOf(MediaType.APPLICATION_JSON)
            set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US")
        }
        for (batch in listingIds.chunked(500)) {
            try {
                val body = mapper.writeValueAsString(mapOf("listingIds" to batch))
                val url = "$RECOMMENDATION_BASE/find?filter=recommendationTypes:%7BAD%7D"
                val response = restTemplate.exchange(
                    java.net.URI.create(url), HttpMethod.POST,
                    HttpEntity(body, headers), String::class.java
                )
                val json = mapper.readTree(response.body ?: "{}")
                val recs = json.path("listingRecommendations")
                if (recs.isArray) {
                    for (rec in recs) {
                        val lid = rec.path("listingId").asText(); if (lid.isBlank()) continue
                        val ad = rec.path("marketing").path("ad"); if (ad.isMissingNode) continue
                        val bps = ad.path("bidPercentages"); if (!bps.isArray) continue
                        var itemRate: Double? = null; var trendingRate: Double? = null
                        for (bp in bps) {
                            val v = bp.path("value").asText("0").toDoubleOrNull() ?: 0.0
                            if (v <= 0) continue
                            when (bp.path("basis").asText()) {
                                "ITEM" -> itemRate = v; "TRENDING" -> trendingRate = v
                            }
                        }
                        (itemRate ?: trendingRate)?.let { suggestedMap[lid] = it }
                    }
                }
            } catch (e: Exception) {
                log.warn("Recommendation API batch failed: {}", e.message)
            }
        }
        return suggestedMap
    }
}
