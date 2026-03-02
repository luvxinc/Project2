package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.domain.repository.EbayBestOfferRepository
import com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import com.mgmt.modules.inventory.domain.repository.WarehouseLocationInventoryRepository
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.client.RestTemplate
import com.mgmt.modules.ebayapi.infrastructure.EbayApiUtils
import com.mgmt.modules.ebayapi.infrastructure.RedisSchedulerLock
import jakarta.annotation.PreDestroy
import java.time.Duration
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
    private val schedulerLock: RedisSchedulerLock,
    private val redis: StringRedisTemplate,
    private val warehouseRepo: WarehouseLocationInventoryRepository,
) {
    private val log = LoggerFactory.getLogger(AutoOpsService::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()
    private val scheduler = Executors.newScheduledThreadPool(2)

    @PreDestroy
    fun shutdown() {
        log.info("[AutoOps] Shutting down scheduler executor")
        scheduler.shutdown()
        if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
            scheduler.shutdownNow()
        }
    }

    companion object {
        private const val TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
        private const val MARKETING_BASE = "https://api.ebay.com/sell/marketing/v1"
        private const val RECOMMENDATION_BASE = "https://api.ebay.com/sell/recommendation/v1"

        /**
         * Pure decision function: given a strategy's discount and the offer/listing prices,
         * compute the auto-reply action and normalized counter price.
         *
         * Shared between production engine (computeAutoAction) and dry-run (AutomationRulesController).
         *
         * @return map with keys: action, counterPrice, rawCounterPrice, normalizedCounter
         */
        fun computeOfferDecision(
            buyNowPrice: Double,
            offerPrice: Double,
            discountType: String,
            discountValue: Double,
        ): Map<String, Any?> {
            val rawCounterPrice = if (discountType == "PERCENT") {
                buyNowPrice * (1 - discountValue / 100)
            } else {
                buyNowPrice - discountValue
            }.coerceAtLeast(0.0).let { Math.round(it * 100) / 100.0 }

            // Normalize counter to .99 pricing (e.g. $31.48 -> $30.99)
            val normalizedCounter = Math.max(0.99, Math.floor(rawCounterPrice) - 0.01)

            // Decide action: if buyer's offer >= our normalized counter, Accept;
            // otherwise Counter with the normalized price.
            val action = if (offerPrice >= normalizedCounter) "Accept" else "Counter"

            return mapOf(
                "action" to action,
                "counterPrice" to if (action == "Counter") normalizedCounter else null,
                "rawCounterPrice" to rawCounterPrice,
                "normalizedCounter" to normalizedCounter,
            )
        }
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
        val restockDetails = mutableListOf<Map<String, Any>>()

        for ((seller, items) in sellerItemMap) {
            try {
                val accessToken = oauthService.getValidAccessToken(seller)

                // For each sold item, look up current soldQuantity from cache and calculate new qty
                for (item in items) {
                    // Per-item distributed lock to prevent race condition on rapid sales
                    val itemLockKey = "restock:item:${seller}:${item.itemId}"
                    if (redis.opsForValue().setIfAbsent(itemLockKey, "1", Duration.ofMinutes(1)) != true) {
                        log.info("[AutoOps] Restock for item {} already in progress, skipping", item.itemId)
                        continue
                    }
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

                        val detail = mapOf<String, Any>(
                            "itemId" to item.itemId,
                            "sku" to (sku ?: ""),
                            "oldQuantity" to currentAvailQty,
                            "newQuantity" to newQty,
                            "soldQuantity" to totalSold,
                            "success" to ok,
                        )

                        if (ok) {
                            totalSuccess++
                            restockDetails.add(detail)
                            // Update listing cache with new quantity (lightweight: only availableQuantity)
                            try {
                                if (cached != null) {
                                    val jsonNode = mapper.readTree(cached.data)
                                    if (jsonNode is com.fasterxml.jackson.databind.node.ObjectNode) {
                                        jsonNode.put("availableQuantity", newQty)
                                        cached.data = mapper.writeValueAsString(jsonNode)
                                        listingCacheRepo.save(cached)
                                    }
                                }
                            } catch (e: Exception) {
                                log.warn("[AutoOps] Failed to update cache after restock for {}: {}", item.itemId, e.message)
                            }
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
                            restockDetails.add(detail)
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
                    } finally {
                        redis.delete(itemLockKey)
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
            items = restockDetails,
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
        if (offer.seller == null) {
            log.error("[AutoOps] Auto-reply rejected for offer {} — seller is null (item {} not in listing cache)",
                offer.bestOfferId, offer.itemId)
            return
        }
        val seller = offer.seller

        // Load offer reply rules (tree + strategies)
        // IRON RULE: computeAutoAction NEVER returns null — always Accept or Counter
        val autoAction = computeAutoAction(offer, seller)
        if (autoAction == null) {
            // Should never happen, but guard just in case (e.g. buyNowPrice=0)
            log.error("[AutoOps] computeAutoAction returned null for offer {} — this should not happen! (buyNow={}, offerPrice={})",
                offer.bestOfferId, offer.buyItNowPrice, offer.offerPrice)
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

        // Track attempt AFTER API call (not before) to ensure accurate count
        val bestOfferId = offer.bestOfferId ?: ""
        try {
            if (bestOfferId.isNotBlank()) {
                val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                if (dbOffer != null) {
                    dbOffer.autoReplyAttempts += 1
                    dbOffer.lastAutoReplyAttemptAt = Instant.now()
                    bestOfferRepo.save(dbOffer)
                }
            }
        } catch (_: Exception) {}

        actionLog.logOfferReply(
            triggerType = "AUTO",
            seller = seller,
            bestOfferId = bestOfferId,
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
            log.info("[AutoOps] Auto-reply succeeded: {} for offer {}", action, bestOfferId)

            // Update offer status in DB so it no longer shows as "Pending"
            try {
                if (bestOfferId.isNotBlank()) {
                    val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                    if (dbOffer != null) {
                        dbOffer.status = when (action.lowercase()) {
                            "accept" -> "Accepted"
                            "decline" -> "Declined"
                            "counter" -> "CounterOffered"
                            else -> action
                        }
                        dbOffer.autoReplyAttempts = 0 // Reset on success
                        dbOffer.updatedAt = Instant.now()
                        bestOfferRepo.save(dbOffer)
                        log.info("[AutoOps] Updated offer {} status → {}", bestOfferId, dbOffer.status)
                    }
                }
            } catch (e: Exception) {
                log.warn("[AutoOps] Failed to update offer {} status in DB: {}", bestOfferId, e.message)
            }
        } else {
            log.warn("[AutoOps] Auto-reply failed for offer {}: {}", bestOfferId, errorMsg)

            // If eBay says offer is no longer available, update DB to remove from Pending list
            val isOfferGone = errorMsg?.contains("no longer available", ignoreCase = true) == true
                    || errorMsg?.contains("is not active", ignoreCase = true) == true
                    || errorMsg?.contains("expired", ignoreCase = true) == true

            try {
                if (bestOfferId.isNotBlank()) {
                    val dbOffer = bestOfferRepo.findByBestOfferId(bestOfferId)
                    if (dbOffer != null) {
                        if (isOfferGone) {
                            dbOffer.status = "Expired"
                            dbOffer.updatedAt = Instant.now()
                            bestOfferRepo.save(dbOffer)
                            log.info("[AutoOps] Offer {} marked Expired (eBay: no longer available)", bestOfferId)
                        } else if (dbOffer.autoReplyAttempts >= 3) {
                            // Max retries exhausted — mark as AutoReplyFailed to stop retry scan
                            dbOffer.status = "AutoReplyFailed"
                            dbOffer.updatedAt = Instant.now()
                            bestOfferRepo.save(dbOffer)
                            log.warn("[AutoOps] Offer {} marked AutoReplyFailed after {} attempts", bestOfferId, dbOffer.autoReplyAttempts)
                        }
                    }
                }
            } catch (e: Exception) {
                log.warn("[AutoOps] Failed to update offer {} failure status: {}", bestOfferId, e.message)
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
        if (!schedulerLock.tryLock("scheduler:auto_promote", Duration.ofHours(1))) return

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

                // Read suggested rates from cache (populated by 23:30 dailyAdRateRefresh).
                // Only call API as fallback if cache has no suggestedAdRate data.
                val cachedSuggestedRates = mutableMapOf<String, Double>()
                val missingItems = mutableListOf<String>()
                for (cached in cachedListings) {
                    val json = try { mapper.readTree(cached.data) } catch (_: Exception) { continue }
                    val rate = json.path("suggestedAdRate").asDouble(0.0)
                    if (rate > 0) {
                        cachedSuggestedRates[cached.itemId] = rate
                    } else {
                        missingItems.add(cached.itemId)
                    }
                }
                // Fallback: fetch from API only for items missing cached suggestedAdRate
                if (missingItems.isNotEmpty()) {
                    log.info("[AutoOps] Auto-promote: {} items missing cached suggestedAdRate, fetching from API", missingItems.size)
                    val apiFallback = fetchSuggestedAdRatesInternal(accessToken, missingItems)
                    cachedSuggestedRates.putAll(apiFallback)
                }
                val suggestedRates = cachedSuggestedRates

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
                    // Only use COST_PER_SALE campaigns — do not fallback to other types
                    for (c in campaigns) {
                        if (c.path("fundingStrategy").path("fundingModel").asText() == "COST_PER_SALE") {
                            campaignId = c.path("campaignId").asText()
                            isDynamicCampaign = c.path("fundingStrategy").path("adRateStrategy").asText() == "DYNAMIC"
                            break
                        }
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
    // 4. Retry Pending Offers (every 10 minutes)
    // ═══════════════════════════════════════════════

    /**
     * Every 10 minutes, scan for Pending/Active offers that failed auto-reply
     * and retry them. Prevents offers from sitting unanswered until eBay expiration.
     *
     * Conditions for retry eligibility:
     * - status IN ('Pending', 'Active')
     * - created within 48 hours (not expired on eBay side)
     * - last attempt was > 15 minutes ago (cooldown)
     * - attempts < 3 (max retries)
     */
    @Scheduled(fixedDelay = 600_000) // 10 minutes
    fun retryPendingOffers() {
        if (!schedulerLock.tryLock("scheduler:retry_pending_offers", Duration.ofMinutes(9))) return

        if (!actionLog.isAutoOpsEnabled()) return

        val now = Instant.now()
        val cutoff48h = now.minus(Duration.ofHours(48))
        val cooldownCutoff = now.minus(Duration.ofMinutes(15))
        val maxAttempts = 3

        val eligible = try {
            bestOfferRepo.findRetryEligibleOffers(cutoff48h, cooldownCutoff, maxAttempts)
        } catch (e: Exception) {
            log.warn("[AutoOps] Retry scan: failed to query eligible offers: {}", e.message)
            return
        }

        if (eligible.isEmpty()) return

        log.info("[AutoOps] Retry scan: found {} eligible offers for retry", eligible.size)

        for ((index, dbOffer) in eligible.withIndex()) {
            try {
                val offer = OfferEventInfo(
                    itemId = dbOffer.itemId,
                    itemTitle = dbOffer.itemTitle,
                    buyerUserId = dbOffer.buyerUserId,
                    offerPrice = dbOffer.offerPrice?.toDouble(),
                    offerCurrency = dbOffer.offerCurrency,
                    quantity = dbOffer.quantity,
                    status = dbOffer.status,
                    bestOfferId = dbOffer.bestOfferId,
                    message = dbOffer.buyerMessage,
                    seller = dbOffer.seller,
                    buyItNowPrice = dbOffer.buyItNowPrice?.toDouble(),
                )
                // Stagger retries: base 5s + 3s per item index + exponential by attempt count
                // attempt 0→5s, attempt 1→10s, attempt 2→20s, spread across items
                val baseDelay = 5L + (index * 3L)
                val attemptBackoff = (1L shl dbOffer.autoReplyAttempts.coerceAtMost(3)) * 5L // 5, 10, 20, 40
                val delay = baseDelay + attemptBackoff
                scheduleAutoReply(offer, delaySeconds = delay)
            } catch (e: Exception) {
                log.warn("[AutoOps] Retry scan: failed to schedule retry for offer {}: {}",
                    dbOffer.bestOfferId, e.message)
            }
        }

        log.info("[AutoOps] Retry scan: scheduled {} offers for retry", eligible.size)
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
        val escapedItemId = EbayApiUtils.escapeXml(itemId)
        val skuTag = if (!sku.isNullOrBlank()) "<SKU>${EbayApiUtils.escapeXml(sku)}</SKU>" else ""
        return """
            <InventoryStatus>
                <ItemID>$escapedItemId</ItemID>
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
            val response = EbayApiUtils.callWithRetry(label = "ReviseInventoryStatus") {
                restTemplate.exchange(
                    TRADING_API_URL, HttpMethod.POST,
                    HttpEntity(xml, headers), String::class.java
                )
            }
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
        // Distributed lock: prevent concurrent replies to the same offer (manual + auto race)
        val lockKey = "offer:reply:$bestOfferId"
        if (redis.opsForValue().setIfAbsent(lockKey, "1", Duration.ofMinutes(2)) != true) {
            log.warn("[AutoOps] Offer {} is being processed by another operation, skipping", bestOfferId)
            return Pair(false, "Offer $bestOfferId is being processed by another operation")
        }
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)

            val escapedItemId = EbayApiUtils.escapeXml(itemId)
            val escapedOfferId = EbayApiUtils.escapeXml(bestOfferId)
            val escapedAction = EbayApiUtils.escapeXml(action)
            val counterBlock = if (action.equals("Counter", ignoreCase = true) && counterPrice != null) {
                "<CounterOfferPrice>$counterPrice</CounterOfferPrice>\n                    <CounterOfferQuantity>$quantity</CounterOfferQuantity>"
            } else ""
            val messageBlock = if (!sellerMessage.isNullOrBlank()) {
                "<SellerResponse>${EbayApiUtils.escapeXml(sellerMessage)}</SellerResponse>"
            } else ""

            val xmlRequest = """<?xml version="1.0" encoding="utf-8"?>
                <RespondToBestOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                    <RequesterCredentials>
                        <eBayAuthToken>$accessToken</eBayAuthToken>
                    </RequesterCredentials>
                    <ItemID>$escapedItemId</ItemID>
                    <BestOfferID>$escapedOfferId</BestOfferID>
                    <Action>$escapedAction</Action>
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

            val response = EbayApiUtils.callWithRetry(label = "RespondToBestOffer") {
                restTemplate.exchange(
                    TRADING_API_URL, HttpMethod.POST,
                    HttpEntity(xmlRequest, headers), String::class.java,
                )
            }

            val body = response.body ?: ""
            val isSuccess = body.contains("<Ack>Success</Ack>") || body.contains("<Ack>Warning</Ack>")
            val errMsg = if (!isSuccess) {
                Regex("<ShortMessage>(.*?)</ShortMessage>").find(body)?.groupValues?.get(1) ?: "RespondToBestOffer returned Failure"
            } else null

            Pair(isSuccess, errMsg)
        } catch (e: Exception) {
            log.error("RespondToBestOffer failed for {}: {}", bestOfferId, e.message)
            Pair(false, e.message ?: "HTTP error")
        } finally {
            redis.delete(lockKey)
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
                        when (parts.size) {
                            2 -> buyNowPrice >= parts[0] && buyNowPrice <= parts[1]
                            1 -> buyNowPrice >= parts[0] // open-ended: "30.01-" means 30.01+
                            else -> false
                        }
                    }
                    if (matched != null) pathParts.add("price_range:$matched")
                }
            }
        }
        val pathKey = if (pathParts.isNotEmpty()) pathParts.joinToString("|") else "*"
        val qty = offer.quantity ?: 1

        // Find matching strategy (3-level fallback chain + hardcoded last resort)
        val strategy = try {
            jdbcTemplate.queryForMap(
                """SELECT discount_type, discount_value FROM offer_reply_strategy
                   WHERE category_group = ? AND path_key = ? AND qty_min <= ? AND (qty_max IS NULL OR qty_max >= ?)
                   AND enabled = true ORDER BY id LIMIT 1""",
                categoryGroup, pathKey, qty, qty
            )
        } catch (_: Exception) {
            // Fallback 1: wildcard path for same category
            try {
                jdbcTemplate.queryForMap(
                    """SELECT discount_type, discount_value FROM offer_reply_strategy
                       WHERE category_group = ? AND path_key = '*' AND qty_min <= ? AND (qty_max IS NULL OR qty_max >= ?)
                       AND enabled = true ORDER BY id LIMIT 1""",
                    categoryGroup, qty, qty
                )
            } catch (_: Exception) {
                // Fallback 2: global default (category_group = '*')
                try {
                    jdbcTemplate.queryForMap(
                        """SELECT discount_type, discount_value FROM offer_reply_strategy
                           WHERE category_group = '*' AND qty_min <= ? AND (qty_max IS NULL OR qty_max >= ?)
                           AND enabled = true ORDER BY id LIMIT 1""",
                        qty, qty
                    )
                } catch (_: Exception) { null }
            }
        }

        // IRON RULE: every offer MUST get a response (Accept or Counter, NEVER skip/decline).
        // If all 3 fallback levels fail, use hardcoded last-resort: 5% PERCENT.
        val discountType: String
        val discountValue: Double
        if (strategy != null) {
            discountType = strategy["discount_type"].toString()
            discountValue = (strategy["discount_value"] as? Number)?.toDouble() ?: 5.0
        } else {
            log.warn("[AutoOps] No strategy matched for offer (category={}, path={}, qty={}). Using hardcoded last-resort: PERCENT 5%",
                categoryGroup, pathKey, qty)
            discountType = "PERCENT"
            discountValue = 5.0
        }

        val decision = computeOfferDecision(buyNowPrice, offerPrice, discountType, discountValue)

        return mapOf(
            "action" to decision["action"],
            "counterPrice" to decision["counterPrice"],
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
                val response = EbayApiUtils.callWithRetry(label = "Recommendation/find") {
                    restTemplate.exchange(
                        java.net.URI.create(url), HttpMethod.POST,
                        HttpEntity(body, headers), String::class.java
                    )
                }
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
