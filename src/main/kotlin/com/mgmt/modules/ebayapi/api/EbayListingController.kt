package com.mgmt.modules.ebayapi.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.application.service.EbayOAuthService
import com.mgmt.modules.ebayapi.application.service.ListingSaleEventBroadcaster
import com.mgmt.modules.ebayapi.application.service.SalesActionLogService
import com.mgmt.modules.ebayapi.domain.model.EbayListingCache
import com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import com.mgmt.domain.inventory.FifoLayerRepository
import com.mgmt.modules.ebayapi.infrastructure.EbayApiUtils
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.web.bind.annotation.*
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestTemplate
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * EbayListingController — eBay Active Listings 查询 API。
 *
 * 使用 Sell Inventory API (getOffers) + Trading API (GetMyeBaySelling) 混合策略:
 *   - 主用: Browse/Fulfillment 分析已有 orders 中的 listing 信息
 *   - 辅助: Trading API 获取完整 Active Listings (包括未售出的)
 *
 * 端点:
 *   GET /api/v1/ebay/sync/listings          → 获取所有 Active Listings (分页)
 *   GET /api/v1/ebay/sync/listings/summary  → 获取 listings 汇总统计
 */
@RestController
@RequestMapping("/ebay/sync/listings")
class EbayListingController(
    private val oauthService: EbayOAuthService,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val sellerRepo: EbaySellerAccountRepository,
    private val listingCacheRepo: EbayListingCacheRepository,
    private val fifoLayerRepo: FifoLayerRepository,
    private val actionLog: SalesActionLogService,
) {
    private val log = LoggerFactory.getLogger(EbayListingController::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()

    companion object {
        // eBay Trading API (XML)
        private const val TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
        // eBay REST APIs
        private const val INVENTORY_BASE = "https://api.ebay.com/sell/inventory/v1"
        private const val MARKETING_BASE = "https://api.ebay.com/sell/marketing/v1"
        private const val RECOMMENDATION_BASE = "https://api.ebay.com/sell/recommendation/v1"
    }

    /** Detect rate-limit / quota errors and return user-friendly messages */
    private fun describeError(e: Exception): String {
        if (e is HttpClientErrorException) {
            return when (e.statusCode.value()) {
                429 -> "eBay API rate limit exceeded. Please wait a few minutes and try again."
                403 -> "eBay API access denied. Please check your account permissions."
                401 -> "eBay authentication expired. Please re-authorize your seller account."
                else -> "eBay API error (${e.statusCode.value()}): ${e.statusText}"
            }
        }
        val msg = e.message ?: "Unknown error"
        if (msg.contains("Too Many Requests", ignoreCase = true) || msg.contains("rate limit", ignoreCase = true)) {
            return "eBay API rate limit exceeded. Please wait a few minutes and try again."
        }
        return msg
    }

    /**
     * GET /api/v1/ebay/sync/listings?seller=all
     * Read cached listings from database (instant, no eBay API call).
     */
    @GetMapping
    fun getActiveListings(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val cached = if (seller.equals("all", ignoreCase = true)) {
                listingCacheRepo.findAll()
            } else {
                listingCacheRepo.findAllBySeller(seller)
            }

            val items = cached.map { mapper.readValue(it.data, Map::class.java) }
            val fetchedAt = cached.maxOfOrNull { it.fetchedAt }?.toString()

            // Calculate stats
            var outOfStock = 0; var lowStock = 0; var inStock = 0
            var promotedActive = 0; var promotedOff = 0
            for (item in items) {
                val avail = (item["availableQuantity"] as? Int) ?: 0
                when { avail <= 0 -> outOfStock++; avail <= 5 -> lowStock++; else -> inStock++ }
                if (item["promoted"] == true) promotedActive++ else promotedOff++
            }

            ResponseEntity.ok(mapOf(
                "items" to items,
                "totalEntries" to items.size,
                "seller" to seller,
                "fetchedAt" to fetchedAt,
                "cached" to true,
                "stats" to mapOf(
                    "outOfStock" to outOfStock,
                    "lowStock" to lowStock,
                    "inStock" to inStock,
                    "promotedActive" to promotedActive,
                    "promotedOff" to promotedOff,
                ),
            ))
        } catch (e: Exception) {
            log.error("Failed to read listing cache: {}", e.message, e)
            ResponseEntity.ok(mapOf(
                "items" to emptyList<Any>(),
                "totalEntries" to 0,
                "seller" to seller,
                "cached" to true,
                "stats" to mapOf("outOfStock" to 0, "lowStock" to 0, "inStock" to 0, "promotedActive" to 0, "promotedOff" to 0),
            ))
        }
    }

    /**
     * POST /api/v1/ebay/sync/listings/refresh?seller=all
     * Fetch live data from eBay API, save to cache, return fresh data.
     */
    @PostMapping("/refresh")
    @org.springframework.transaction.annotation.Transactional
    fun refreshListings(
        @RequestParam(defaultValue = "all") seller: String,
    ): ResponseEntity<Any> {
        val startMs = System.currentTimeMillis()
        return try {
            val sellers = if (seller.equals("all", ignoreCase = true)) {
                sellerRepo.findAllByStatus("authorized").map { it.sellerUsername }
            } else {
                listOf(seller)
            }

            val allEnrichedItems = mutableListOf<Map<String, Any?>>()

            for (s in sellers) {
                val accessToken = oauthService.getValidAccessToken(s)

                val sellerItems = mutableListOf<Map<String, Any?>>()
                var currentPage = 1
                var maxPages = 1
                while (currentPage <= maxPages && currentPage <= 15) {
                    val result = fetchActiveListingsViaTrading(accessToken, currentPage, 200)
                    val items = result["items"] as? List<*> ?: emptyList<Any>()
                    @Suppress("UNCHECKED_CAST")
                    sellerItems.addAll(items as List<Map<String, Any?>>)
                    maxPages = (result["totalPages"] as? Int) ?: 1
                    currentPage++
                }

                val promotedMap = fetchPromotedListingMap(accessToken)
                val itemIds = sellerItems.mapNotNull { it["itemId"]?.toString() }
                val suggestedRates = if (itemIds.isNotEmpty()) fetchSuggestedAdRates(accessToken, itemIds) else emptyMap()

                val enriched = sellerItems.map { item ->
                    val itemId = item["itemId"]?.toString() ?: ""
                    val adRate = promotedMap[itemId]
                    item.toMutableMap().apply {
                        put("promoted", adRate != null)
                        put("adRate", adRate)
                        put("suggestedAdRate", suggestedRates[itemId])
                        put("seller", s)
                    }
                }
                allEnrichedItems.addAll(enriched)

                // Upsert cache (no gap where concurrent reads see zero listings)
                val now = java.time.Instant.now()
                val fetchedItemIds = mutableListOf<String>()
                for (item in enriched) {
                    val itemId = item["itemId"]?.toString() ?: continue
                    fetchedItemIds.add(itemId)
                    listingCacheRepo.upsert(itemId, s, mapper.writeValueAsString(item), now)
                }
                // Remove listings no longer active on eBay
                if (fetchedItemIds.isNotEmpty()) {
                    listingCacheRepo.deleteBySellerAndItemIdNotIn(s, fetchedItemIds)
                } else {
                    listingCacheRepo.deleteBySeller(s)
                }
                log.info("Upserted {} listings for seller {}", fetchedItemIds.size, s)
            }

            var outOfStock = 0; var lowStock = 0; var inStock = 0
            var promotedActive = 0; var promotedOff = 0
            for (ei in allEnrichedItems) {
                val avail = (ei["availableQuantity"] as? Int) ?: 0
                when { avail <= 0 -> outOfStock++; avail <= 5 -> lowStock++; else -> inStock++ }
                if (ei["promoted"] == true) promotedActive++ else promotedOff++
            }

            val durationMs = System.currentTimeMillis() - startMs
            actionLog.log(
                module = "LISTING",
                actionType = "FULL_REFRESH",
                triggerType = "MANUAL",
                seller = seller,
                summary = "Full listing refresh: ${allEnrichedItems.size} listings cached",
                totalCount = allEnrichedItems.size,
                successCount = allEnrichedItems.size,
                durationMs = durationMs,
            )

            ResponseEntity.ok(mapOf(
                "items" to allEnrichedItems,
                "totalEntries" to allEnrichedItems.size,
                "seller" to seller,
                "fetchedAt" to java.time.Instant.now().toString(),
                "cached" to false,
                "stats" to mapOf(
                    "outOfStock" to outOfStock,
                    "lowStock" to lowStock,
                    "inStock" to inStock,
                    "promotedActive" to promotedActive,
                    "promotedOff" to promotedOff,
                ),
            ))
        } catch (e: Exception) {
            log.error("Failed to refresh listings for {}: {}", seller, e.message, e)
            val durationMs = System.currentTimeMillis() - startMs
            actionLog.log(
                module = "LISTING",
                actionType = "FULL_REFRESH",
                triggerType = "MANUAL",
                seller = seller,
                summary = "Full listing refresh failed: ${e.message}",
                success = false,
                errorMessage = e.message,
                durationMs = durationMs,
            )
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to describeError(e),
                "seller" to seller,
            ))
        }
    }

    /**
     * 全局统计 — 库存状态 + 推广状态 (跨所有页面)。
     *
     * GET /api/v1/ebay/sync/listings/stats?seller=espartsplus
     * 返回: { outOfStock, lowStock, inStock, promotedActive, promotedOff, total }
     */
    @GetMapping("/stats")
    fun getListingStats(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)

            // 1. 获取所有 listings (最多 15 页 × 200 items = 3000)
            val allItems = mutableListOf<Map<String, Any?>>()
            var currentPage = 1
            var maxPages = 1

            while (currentPage <= maxPages && currentPage <= 15) {
                val result = fetchActiveListingsViaTrading(accessToken, currentPage, 200)
                val items = result["items"] as? List<*> ?: emptyList<Any>()
                @Suppress("UNCHECKED_CAST")
                allItems.addAll(items as List<Map<String, Any?>>)
                maxPages = (result["totalPages"] as? Int) ?: 1
                currentPage++
            }

            // 2. 获取 promoted map
            val promotedMap = fetchPromotedListingMap(accessToken)

            // 3. 统计
            var outOfStock = 0
            var lowStock = 0
            var inStock = 0
            var promotedActive = 0
            var promotedOff = 0

            for (item in allItems) {
                val avail = (item["availableQuantity"] as? Int) ?: 0
                val itemId = item["itemId"]?.toString() ?: ""

                when {
                    avail <= 0 -> outOfStock++
                    avail <= 5 -> lowStock++
                    else -> inStock++
                }

                if (promotedMap.containsKey(itemId)) promotedActive++ else promotedOff++
            }

            ResponseEntity.ok(mapOf(
                "outOfStock" to outOfStock,
                "lowStock" to lowStock,
                "inStock" to inStock,
                "promotedActive" to promotedActive,
                "promotedOff" to promotedOff,
                "total" to allItems.size,
                "seller" to seller,
            ))
        } catch (e: Exception) {
            log.error("Failed to fetch listing stats: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to describeError(e),
            ))
        }
    }

    /**
     * 获取 listings 汇总统计。
     *
     * GET /api/v1/ebay/sync/listings/summary?seller=espartsplus
     */
    @GetMapping("/summary")
    fun getListingSummary(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        return try {
            val accessToken = oauthService.getValidAccessToken(seller)
            val summary = fetchListingSummaryViaTrading(accessToken)
            ResponseEntity.ok(summary)
        } catch (e: Exception) {
            log.error("Failed to fetch listing summary: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf(
                "error" to describeError(e),
            ))
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SSE — 实时销售事件推送
    // ═══════════════════════════════════════════════════════════

    /**
     * SSE 端点 — 前端 EventSource 连接此处接收实时销售事件。
     *
     * GET /api/v1/ebay/sync/listings/events
     *
     * 事件格式:
     *   event: sale
     *   data: {"type":"ITEM_SOLD","items":[{"itemId":"...","quantitySold":1}]}
     *
     * 前端收到后只更新对应 itemId 的行 (soldQty +N, availableQty -N)。
     */
    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamSaleEvents(@RequestParam(defaultValue = "all") seller: String): SseEmitter {
        log.info("SSE client subscribing to listing sale events for seller={}", seller)
        return saleBroadcaster.subscribe(seller)
    }

    // ═══════════════════════════════════════════════════════════
    // Trading API — Active Listings (XML)
    // ═══════════════════════════════════════════════════════════

    /**
     * 通过 Trading API GetMyeBaySelling 获取 Active Listings。
     *
     * 返回 title, sku(customLabel), currentPrice, quantity, quantitySold 等。
     */
    private fun fetchActiveListingsViaTrading(
        accessToken: String, page: Int, perPage: Int,
    ): Map<String, Any> {
        val xmlRequest = """
        <?xml version="1.0" encoding="utf-8"?>
        <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
                <eBayAuthToken>$accessToken</eBayAuthToken>
            </RequesterCredentials>
            <ActiveList>
                <Sort>TimeLeft</Sort>
                <Pagination>
                    <EntriesPerPage>$perPage</EntriesPerPage>
                    <PageNumber>$page</PageNumber>
                </Pagination>
            </ActiveList>
            <DetailLevel>ReturnAll</DetailLevel>
            <OutputSelector>ActiveList.ItemArray.Item.ItemID</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.Title</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.SKU</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.SellingStatus.CurrentPrice</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.Quantity</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.SellingStatus.QuantitySold</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.QuantityAvailable</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.PictureDetails.GalleryURL</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.ListingType</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.WatchCount</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.ViewItemURL</OutputSelector>
            <OutputSelector>ActiveList.PaginationResult</OutputSelector>
            <OutputSelector>ActiveList.ItemArray.Item.Variations</OutputSelector>
        </GetMyeBaySellingRequest>
        """.trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")  // US site
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "GetMyeBaySelling")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        val response = restTemplate.exchange(
            TRADING_API_URL,
            HttpMethod.POST,
            HttpEntity(xmlRequest, headers),
            String::class.java,
        )

        return parseGetMyeBaySellingResponse(response.body ?: "")
    }

    /**
     * 获取 listing 汇总 (总数/活跃数)。
     */
    private fun fetchListingSummaryViaTrading(accessToken: String): Map<String, Any> {
        val xmlRequest = """
        <?xml version="1.0" encoding="utf-8"?>
        <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
                <eBayAuthToken>$accessToken</eBayAuthToken>
            </RequesterCredentials>
            <ActiveList>
                <Pagination>
                    <EntriesPerPage>1</EntriesPerPage>
                    <PageNumber>1</PageNumber>
                </Pagination>
            </ActiveList>
            <OutputSelector>ActiveList.PaginationResult</OutputSelector>
        </GetMyeBaySellingRequest>
        """.trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "GetMyeBaySelling")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        val response = restTemplate.exchange(
            TRADING_API_URL,
            HttpMethod.POST,
            HttpEntity(xmlRequest, headers),
            String::class.java,
        )

        val body = response.body ?: ""
        val totalEntries = extractXmlValue(body, "TotalNumberOfEntries")?.toIntOrNull() ?: 0

        return mapOf(
            "totalActiveListings" to totalEntries,
            "fetchedAt" to java.time.Instant.now().toString(),
        )
    }

    // ═══════════════════════════════════════════════════════════
    // Marketing API — Promoted Listings
    // ═══════════════════════════════════════════════════════════

    /**
     * 获取所有已推广的 listing ID → bidPercentage 映射。
     *
     * 通过 Marketing API getCampaigns → 遍历活跃 campaign → getAds → 收集 { listingId: bidPercentage }
     */
    private fun fetchPromotedListingMap(accessToken: String): Map<String, Double> {
        val promotedMap = mutableMapOf<String, Double>()

        try {
            val headers = HttpHeaders().apply {
                setBearerAuth(accessToken)
                accept = listOf(MediaType.APPLICATION_JSON)
            }

            // 1. 获取所有活跃的 campaigns
            val campaignsUrl = "$MARKETING_BASE/ad_campaign?campaign_status=RUNNING&limit=100"
            val campaignsResponse = restTemplate.exchange(
                java.net.URI.create(campaignsUrl),
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )

            val campaignsJson = mapper.readTree(campaignsResponse.body ?: "{}")
            val campaigns = campaignsJson.path("campaigns")
            if (!campaigns.isArray) return promotedMap

            // 2. 遍历所有 campaigns 获取 ads
            for (campaign in campaigns) {
                val campaignId = campaign.path("campaignId").asText()
                if (campaignId.isBlank()) continue

                try {
                    // Paginate through all ads in this campaign
                    var offset = 0
                    val pageSize = 200
                    var hasMore = true
                    while (hasMore) {
                        val adsUrl = "$MARKETING_BASE/ad_campaign/$campaignId/ad?limit=$pageSize&offset=$offset"
                        val adsResponse = restTemplate.exchange(
                            java.net.URI.create(adsUrl),
                            HttpMethod.GET,
                            HttpEntity<Void>(headers),
                            String::class.java,
                        )

                        val adsJson = mapper.readTree(adsResponse.body ?: "{}")
                        val ads = adsJson.path("ads")
                        if (ads.isArray && ads.size() > 0) {
                            for (ad in ads) {
                                val listingId = ad.path("listingId").asText()
                                if (listingId.isNotBlank()) {
                                    val bidPct = ad.path("bidPercentage").asDouble(0.0)
                                    promotedMap[listingId] = bidPct
                                }
                            }
                            offset += ads.size()
                            // If we got fewer than pageSize, no more pages
                            hasMore = ads.size() >= pageSize
                        } else {
                            hasMore = false
                        }
                    }
                } catch (e: Exception) {
                    log.debug("Failed to fetch ads for campaign {}: {}", campaignId, e.message)
                }
            }

            log.info("Fetched {} promoted listings with ad rates from {} campaigns",
                promotedMap.size, campaigns.size())

        } catch (e: Exception) {
            log.warn("Failed to fetch promoted listings: {}", e.message)
        }

        return promotedMap
    }

    /**
     * 获取 listing 的建议推广百分比 (Recommendation API).
     *
     * POST /sell/recommendation/v1/find (body: {listingIds: [...]})
     * 返回 Map<listingId, suggestedBidPercentage>
     */
    private fun fetchSuggestedAdRates(accessToken: String, listingIds: List<String>): Map<String, Double> {
        val suggestedMap = mutableMapOf<String, Double>()
        try {
            val headers = HttpHeaders().apply {
                setBearerAuth(accessToken)
                contentType = MediaType.APPLICATION_JSON
                accept = listOf(MediaType.APPLICATION_JSON)
                set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US")
            }

            // 批量请求, 每次最多 500 个 (API 限制)
            val batches = listingIds.chunked(500)
            for (batch in batches) {
                try {
                    val requestBody = mapper.writeValueAsString(mapOf(
                        "listingIds" to batch
                    ))

                    // URI with curly braces must be encoded: {AD} → %7BAD%7D
                    val url = "$RECOMMENDATION_BASE/find?filter=recommendationTypes:%7BAD%7D"
                    log.info("Calling Recommendation API for {} listings", batch.size)

                    val response = restTemplate.exchange(
                        java.net.URI.create(url),
                        HttpMethod.POST,
                        HttpEntity(requestBody, headers),
                        String::class.java,
                    )

                    val responseBody = response.body ?: "{}"
                    log.debug("Recommendation API response: {}", responseBody.take(500))

                    val json = mapper.readTree(responseBody)
                    val recommendations = json.path("listingRecommendations")
                    if (recommendations.isArray) {
                        for (rec in recommendations) {
                            val listingId = rec.path("listingId").asText()
                            if (listingId.isBlank()) continue

                            // 正确路径: marketing.ad.bidPercentages[].value
                            val ad = rec.path("marketing").path("ad")
                            if (ad.isMissingNode) continue

                            val bidPcts = ad.path("bidPercentages")
                            if (bidPcts.isArray) {
                                // 优先取 ITEM 级建议, 其次 TRENDING
                                var itemRate: Double? = null
                                var trendingRate: Double? = null
                                for (bp in bidPcts) {
                                    val basis = bp.path("basis").asText()
                                    val value = bp.path("value").asText("0").toDoubleOrNull() ?: 0.0
                                    if (value <= 0) continue
                                    when (basis) {
                                        "ITEM" -> itemRate = value
                                        "TRENDING" -> trendingRate = value
                                    }
                                }
                                val bestRate = itemRate ?: trendingRate
                                if (bestRate != null && bestRate > 0) {
                                    suggestedMap[listingId] = bestRate
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    log.warn("Recommendation API batch failed: {}", e.message)
                }
            }

            log.info("Fetched {} suggested ad rates for {} listings", suggestedMap.size, listingIds.size)
        } catch (e: Exception) {
            log.warn("Failed to fetch suggested ad rates: {}", e.message)
        }
        return suggestedMap
    }

    /**
     * 获取已授权的 seller 列表 (供前端筛选器使用)。
     *
     * GET /api/v1/ebay/sync/listings/sellers
     */
    @GetMapping("/sellers")
    fun getAvailableSellers(): ResponseEntity<Any> {
        val sellers = sellerRepo.findAllByStatus("authorized").map { it.sellerUsername }
        return ResponseEntity.ok(mapOf("sellers" to sellers))
    }

    /**
     * GET /api/v1/ebay/sync/listings/stock-map
     * Returns warehouse stock qty by SKU for stock health calculation.
     */
    @GetMapping("/stock-map")
    fun getStockMap(): ResponseEntity<Any> {
        return try {
            val rows = fifoLayerRepo.findStockBySku()
            val stockMap = rows.associate { row ->
                val sku = row[0] as String
                val qty = (row[1] as Number).toInt()
                sku to qty
            }
            ResponseEntity.ok(mapOf("stockMap" to stockMap))
        } catch (e: Exception) {
            log.error("Failed to fetch stock map: {}", e.message, e)
            ResponseEntity.ok(mapOf("stockMap" to emptyMap<String, Int>()))
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Partial Refresh — re-fetch only specific items by ID
    // ═══════════════════════════════════════════════════════════

    /**
     * POST /api/v1/ebay/sync/listings/partial-refresh
     * Re-fetch specific listings from eBay and update cache.
     * Body: { "seller": "espartsplus", "itemIds": ["123", "456"] }
     *
     * Uses GetItem for each item (batched 20 at a time).
     * Returns only the refreshed items.
     */
    @PostMapping("/partial-refresh")
    @org.springframework.transaction.annotation.Transactional
    fun partialRefresh(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        return try {
            val seller = body["seller"]?.toString() ?: "espartsplus"
            @Suppress("UNCHECKED_CAST")
            val itemIds = (body["itemIds"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()

            if (itemIds.isEmpty()) {
                return ResponseEntity.ok(mapOf("items" to emptyList<Any>(), "total" to 0))
            }

            val accessToken = oauthService.getValidAccessToken(seller)

            // Lightweight: only GetItem per item, preserve existing promoted/adRate from cache
            val refreshedItems = mutableListOf<Map<String, Any?>>()

            for (itemId in itemIds) {
                try {
                    val item = fetchSingleItemViaTrading(accessToken, itemId)
                    if (item != null) {
                        // Read existing promoted/adRate/suggestedAdRate from cache
                        val cached = listingCacheRepo.findByItemIdAndSeller(itemId, seller)
                        var cachedPromoted: Boolean? = null
                        var cachedAdRate: Double? = null
                        var cachedSuggestedAdRate: Double? = null
                        if (cached != null) {
                            try {
                                val cachedJson = mapper.readTree(cached.data)
                                cachedPromoted = cachedJson.path("promoted").asBoolean(false)
                                cachedAdRate = if (cachedJson.has("adRate") && !cachedJson.path("adRate").isNull) cachedJson.path("adRate").asDouble() else null
                                cachedSuggestedAdRate = if (cachedJson.has("suggestedAdRate") && !cachedJson.path("suggestedAdRate").isNull) cachedJson.path("suggestedAdRate").asDouble() else null
                            } catch (_: Exception) { /* parse failure, leave nulls */ }
                        }

                        val enriched = item.toMutableMap().apply {
                            put("promoted", cachedPromoted ?: false)
                            put("adRate", cachedAdRate)
                            put("suggestedAdRate", cachedSuggestedAdRate)
                            put("seller", seller)
                        }
                        refreshedItems.add(enriched)

                        // Update cache
                        listingCacheRepo.deleteByItemIdAndSeller(itemId, seller)
                        listingCacheRepo.save(
                            EbayListingCache(
                                itemId = itemId,
                                seller = seller,
                                data = mapper.writeValueAsString(enriched),
                                fetchedAt = java.time.Instant.now(),
                            )
                        )
                    }
                } catch (e: Exception) {
                    log.warn("Failed to refresh item {}: {}", itemId, e.message)
                }
            }

            log.info("⚡ Partial refresh done: {}/{} items for seller {}", refreshedItems.size, itemIds.size, seller)
            ResponseEntity.ok(mapOf(
                "items" to refreshedItems,
                "total" to refreshedItems.size,
                "fetchedAt" to java.time.Instant.now().toString(),
            ))
        } catch (e: Exception) {
            log.error("Partial refresh failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to describeError(e)))
        }
    }

    /**
     * Fetch a single item via Trading API GetItem.
     * Returns structured map or null on failure.
     */
    private fun fetchSingleItemViaTrading(accessToken: String, itemId: String): Map<String, Any?>? {
        val xmlRequest = """
        <?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
                <eBayAuthToken>$accessToken</eBayAuthToken>
            </RequesterCredentials>
            <ItemID>$itemId</ItemID>
            <DetailLevel>ReturnAll</DetailLevel>
            <OutputSelector>ItemID</OutputSelector>
            <OutputSelector>Title</OutputSelector>
            <OutputSelector>SKU</OutputSelector>
            <OutputSelector>SellingStatus.CurrentPrice</OutputSelector>
            <OutputSelector>Quantity</OutputSelector>
            <OutputSelector>SellingStatus.QuantitySold</OutputSelector>
            <OutputSelector>QuantityAvailable</OutputSelector>
            <OutputSelector>PictureDetails.GalleryURL</OutputSelector>
            <OutputSelector>ListingType</OutputSelector>
            <OutputSelector>WatchCount</OutputSelector>
            <OutputSelector>ViewItemURL</OutputSelector>
            <OutputSelector>Variations</OutputSelector>
        </GetItemRequest>
        """.trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "GetItem")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        val response = restTemplate.exchange(
            TRADING_API_URL, HttpMethod.POST,
            HttpEntity(xmlRequest, headers), String::class.java,
        )

        val body = response.body ?: ""
        if (body.contains("<Ack>Failure</Ack>")) {
            log.warn("GetItem failed for {}: {}", itemId, body.take(300))
            return null
        }

        // Parse the Item from response
        val title = extractXmlValue(body, "Title") ?: ""
        val sku = extractXmlValue(body, "SKU") ?: ""
        val currentPrice = extractXmlValue(body, "CurrentPrice")?.toDoubleOrNull() ?: 0.0
        val quantity = extractXmlValue(body, "Quantity")?.toIntOrNull() ?: 0
        val quantitySold = extractXmlValue(body, "QuantitySold")?.toIntOrNull() ?: 0
        val galleryUrl = extractXmlValue(body, "GalleryURL") ?: ""
        val listingType = extractXmlValue(body, "ListingType") ?: ""
        val watchCount = extractXmlValue(body, "WatchCount")?.toIntOrNull() ?: 0
        val viewItemUrl = extractXmlValue(body, "ViewItemURL") ?: ""
        val hasVariations = body.contains("<Variations>")

        return mapOf(
            "itemId" to itemId,
            "title" to title,
            "sku" to sku,
            "currentPrice" to currentPrice,
            "quantity" to quantity,
            "soldQuantity" to quantitySold,
            "availableQuantity" to (quantity - quantitySold).coerceAtLeast(0),
            "galleryUrl" to galleryUrl,
            "listingType" to listingType,
            "watchCount" to watchCount,
            "viewItemUrl" to viewItemUrl,
            "hasVariations" to hasVariations,
        )
    }

    // ═══════════════════════════════════════════════════════════
    // Bulk Actions
    // ═══════════════════════════════════════════════════════════

    /**
     * Bulk restock — update inventory quantity via ReviseInventoryStatus.
     * Quantity = max(10, min(100, round(soldQuantity / 25))
     *
     * eBay limits: 4 items/call, 6000 calls/15s burst, 5000 calls/day default.
     *
     * POST /api/v1/ebay/sync/listings/bulk-restock
     * Body: { "seller": "espartsplus", "items": [{ "itemId": "...", "sku": "...", "soldQuantity": 50 }] }
     */
    @PostMapping("/bulk-restock")
    fun bulkRestock(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        return try {
            val seller = body["seller"]?.toString() ?: "espartsplus"
            val accessToken = oauthService.getValidAccessToken(seller)
            @Suppress("UNCHECKED_CAST")
            val items = body["items"] as? List<Map<String, Any>> ?: emptyList()

            var success = 0; var failed = 0
            val errors = mutableListOf<String>()
            val batches = items.chunked(4)
            val totalBatches = batches.size
            val restockDetails = mutableListOf<Map<String, Any>>()

            log.info("📦 Bulk restock: {} items in {} batches", items.size, totalBatches)

            // Batch into groups of 4 (Trading API limit per call)
            batches.forEachIndexed { idx, batch ->
                // Rate limit: 50ms between batches to stay safe under 6000/15s burst limit
                if (idx > 0) Thread.sleep(50)

                // Pre-compute new quantities for this batch
                val batchItems = batch.map { item ->
                    val itemId = item["itemId"]?.toString() ?: ""
                    val sku = item["sku"]?.toString()
                    val sold = (item["soldQuantity"] as? Number)?.toInt() ?: 0
                    val newQty = (sold / 25).coerceIn(10, 100)
                    mapOf("itemId" to itemId, "sku" to (sku ?: ""), "soldQuantity" to sold, "newQuantity" to newQty)
                }

                try {
                    val inventoryStatuses = batchItems.map { bi ->
                        val sku = bi["sku"]?.toString()?.ifBlank { null }
                        buildInventoryStatusXml(bi["itemId"].toString(), sku, quantity = bi["newQuantity"] as Int, price = null)
                    }.joinToString("\n")

                    val result = callReviseInventoryStatus(accessToken, inventoryStatuses)
                    if (result) {
                        success += batch.size
                        restockDetails.addAll(batchItems.map { it + ("success" to true) })
                        // Update local listing cache so frontend sees new qty immediately
                        for (bi in batchItems) {
                            try {
                                val cached = listingCacheRepo.findByItemIdAndSeller(bi["itemId"].toString(), seller)
                                if (cached != null) {
                                    val jsonNode = mapper.readTree(cached.data)
                                    if (jsonNode is com.fasterxml.jackson.databind.node.ObjectNode) {
                                        jsonNode.put("availableQuantity", bi["newQuantity"] as Int)
                                        cached.data = mapper.writeValueAsString(jsonNode)
                                        listingCacheRepo.save(cached)
                                    }
                                }
                            } catch (e: Exception) {
                                log.warn("Failed to update cache after restock for {}: {}", bi["itemId"], e.message)
                            }
                        }
                    } else {
                        failed += batch.size
                        errors.add("Batch ${idx+1} failed")
                        restockDetails.addAll(batchItems.map { it + ("success" to false) })
                    }
                } catch (e: Exception) {
                    failed += batch.size
                    errors.add(e.message ?: "Unknown error")
                    restockDetails.addAll(batchItems.map { it + ("success" to false) })
                }
                if ((idx + 1) % 50 == 0 || idx == totalBatches - 1) {
                    log.info("📦 Restock progress: {}/{} batches ({} items ok, {} failed)", idx + 1, totalBatches, success, failed)
                }
            }

            log.info("📦 Bulk restock done: {} success, {} failed out of {}", success, failed, items.size)
            actionLog.logBulkRestock(
                triggerType = "MANUAL",
                seller = seller,
                total = items.size,
                successCount = success,
                failedCount = failed,
                durationMs = 0,
                items = restockDetails,
            )
            ResponseEntity.ok(mapOf(
                "success" to success, "failed" to failed,
                "total" to items.size, "errors" to errors,
            ))
        } catch (e: Exception) {
            log.error("Bulk restock failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to describeError(e)))
        }
    }

    /**
     * Bulk reprice — update price via ReviseInventoryStatus.
     *
     * eBay limits: 4 items/call, 6000 calls/15s burst, 5000 calls/day default.
     *
     * POST /api/v1/ebay/sync/listings/bulk-reprice
     * Body: { "seller": "espartsplus", "price": 29.99, "items": [{ "itemId": "..." }] }
     */
    @PostMapping("/bulk-reprice")
    fun bulkReprice(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        return try {
            val seller = body["seller"]?.toString() ?: "espartsplus"
            val accessToken = oauthService.getValidAccessToken(seller)
            val price = (body["price"] as? Number)?.toDouble() ?: throw IllegalArgumentException("Price required")
            @Suppress("UNCHECKED_CAST")
            val items = body["items"] as? List<Map<String, Any>> ?: emptyList()

            var success = 0; var failed = 0
            val errors = mutableListOf<String>()
            val batches = items.chunked(4)
            val totalBatches = batches.size

            log.info("💲 Bulk reprice: {} items in {} batches → price {}", items.size, totalBatches, "%.2f".format(price))

            batches.forEachIndexed { idx, batch ->
                if (idx > 0) Thread.sleep(50)
                try {
                    val inventoryStatuses = batch.map { item ->
                        val itemId = item["itemId"]?.toString() ?: ""
                        val sku = item["sku"]?.toString()
                        buildInventoryStatusXml(itemId, sku, quantity = null, price = price)
                    }.joinToString("\n")

                    val result = callReviseInventoryStatus(accessToken, inventoryStatuses)
                    if (result) success += batch.size else { failed += batch.size; errors.add("Batch ${idx+1} failed") }
                } catch (e: Exception) {
                    failed += batch.size
                    errors.add(e.message ?: "Unknown error")
                }
                if ((idx + 1) % 50 == 0 || idx == totalBatches - 1) {
                    log.info("💲 Reprice progress: {}/{} batches ({} items ok, {} failed)", idx + 1, totalBatches, success, failed)
                }
            }

            log.info("💲 Bulk reprice done: {} success, {} failed out of {}", success, failed, items.size)
            actionLog.log(
                module = "LISTING", actionType = "REPRICE", triggerType = "MANUAL",
                seller = seller,
                summary = "Reprice ${success}/${items.size} listings to $${"%.2f".format(price)}",
                totalCount = items.size, successCount = success, failedCount = failed,
                detail = mapOf("newPrice" to price),
                success = failed == 0,
            )
            ResponseEntity.ok(mapOf(
                "success" to success, "failed" to failed,
                "total" to items.size, "errors" to errors,
            ))
        } catch (e: Exception) {
            log.error("Bulk reprice failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to describeError(e)))
        }
    }

    /**
     * Bulk promote — add listings to a CPS promotion campaign.
     *
     * eBay limits: max 500 listings per bulk_create_ads_by_listing_id call.
     * Max 50,000 ads per campaign.
     *
     * POST /api/v1/ebay/sync/listings/bulk-promote
     * Body: { "seller": "espartsplus", "items": [{ "listingId": "...", "bidPercentage": "5.0" }] }
     */
    @PostMapping("/bulk-promote")
    fun bulkPromote(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        return try {
            val seller = body["seller"]?.toString() ?: "espartsplus"
            val accessToken = oauthService.getValidAccessToken(seller)
            @Suppress("UNCHECKED_CAST")
            val items = body["items"] as? List<Map<String, Any>> ?: emptyList()

            // Find first RUNNING CPS campaign
            val headers = HttpHeaders().apply {
                setBearerAuth(accessToken)
                accept = listOf(MediaType.APPLICATION_JSON)
                contentType = MediaType.APPLICATION_JSON
            }

            val campaignsUrl = "$MARKETING_BASE/ad_campaign?campaign_status=RUNNING&limit=100"
            val campaignsResponse = restTemplate.exchange(
                java.net.URI.create(campaignsUrl), HttpMethod.GET,
                HttpEntity<Void>(headers), String::class.java,
            )
            val campaignsJson = mapper.readTree(campaignsResponse.body ?: "{}")
            val campaigns = campaignsJson.path("campaigns")

            // Find a CPS campaign (COST_PER_SALE)
            var campaignId: String? = null
            var isDynamicCampaign = false
            if (campaigns.isArray) {
                for (c in campaigns) {
                    val fundingModel = c.path("fundingStrategy").path("fundingModel").asText()
                    if (fundingModel == "COST_PER_SALE") {
                        campaignId = c.path("campaignId").asText()
                        isDynamicCampaign = c.path("fundingStrategy").path("adRateStrategy").asText() == "DYNAMIC"
                        break
                    }
                }
                // Fallback to first running campaign
                if (campaignId == null && campaigns.size() > 0) {
                    campaignId = campaigns[0].path("campaignId").asText()
                    isDynamicCampaign = campaigns[0].path("fundingStrategy").path("adRateStrategy").asText() == "DYNAMIC"
                }
            }

            if (campaignId.isNullOrBlank()) {
                return ResponseEntity.badRequest().body(mapOf("error" to "No running campaign found"))
            }

            // Batch into chunks of 500 (eBay Marketing API limit per call)
            val batches = items.chunked(500)
            val totalBatches = batches.size
            var success = 0; var failed = 0
            val errors = mutableListOf<String>()

            log.info("📢 Bulk promote: {} items in {} batches → campaign {} (dynamic={})", items.size, totalBatches, campaignId, isDynamicCampaign)

            val bulkUrl = "$MARKETING_BASE/ad_campaign/$campaignId/bulk_create_ads_by_listing_id"

            batches.forEachIndexed { idx, batch ->
                if (idx > 0) Thread.sleep(200) // Rate limit between batches

                // For DYNAMIC campaigns, eBay manages ad rates — do NOT send bidPercentage
                val requests = if (isDynamicCampaign) {
                    batch.map { item ->
                        mapOf("listingId" to (item["listingId"]?.toString() ?: ""))
                    }
                } else {
                    batch.map { item ->
                        mapOf(
                            "listingId" to (item["listingId"]?.toString() ?: ""),
                            "bidPercentage" to (item["bidPercentage"]?.toString() ?: "5.0"),
                        )
                    }
                }

                try {
                    val bulkBody = mapOf("requests" to requests)
                    val bulkResponse = restTemplate.exchange(
                        java.net.URI.create(bulkUrl), HttpMethod.POST,
                        HttpEntity(mapper.writeValueAsString(bulkBody), headers),
                        String::class.java,
                    )

                    val resultJson = mapper.readTree(bulkResponse.body ?: "{}")
                    val responses = resultJson.path("responses")
                    if (responses.isArray) {
                        for (r in responses) {
                            val statusCode = r.path("statusCode").asInt()
                            if (statusCode in 200..299) {
                                success++
                            } else {
                                // errorId 35036 = "ad already exists" → listing is already promoted, treat as success
                                val errorId = r.path("errors").firstOrNull()?.path("errorId")?.asInt(0) ?: 0
                                if (errorId == 35036) {
                                    success++
                                } else {
                                    failed++
                                    errors.add(r.path("errors").toString())
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    failed += batch.size
                    errors.add("Batch ${idx+1} error: ${e.message}")
                }

                log.info("📢 Promote progress: {}/{} batches ({} ok, {} failed)", idx + 1, totalBatches, success, failed)
            }

            log.info("📢 Bulk promote done: {} success, {} failed out of {}", success, failed, items.size)

            // Update local listing cache with new ad rates (non-DYNAMIC only)
            if (success > 0 && !isDynamicCampaign) {
                var cacheUpdated = 0
                for (item in items) {
                    try {
                        val listingId = item["listingId"]?.toString() ?: continue
                        val newRate = item["bidPercentage"]?.toString()?.toDoubleOrNull() ?: continue
                        val cached = listingCacheRepo.findByItemIdAndSeller(listingId, seller) ?: continue
                        val json = mapper.readTree(cached.data)
                        if (json is com.fasterxml.jackson.databind.node.ObjectNode) {
                            json.put("adRate", newRate)
                            cached.data = mapper.writeValueAsString(json)
                            listingCacheRepo.save(cached)
                            cacheUpdated++
                        }
                    } catch (_: Exception) { }
                }
                log.info("📢 Updated {} listing cache adRate entries", cacheUpdated)
            }

            actionLog.logPromote(
                triggerType = "MANUAL",
                seller = seller,
                strategy = "manual",
                total = items.size,
                successCount = success,
                failedCount = failed,
                campaignId = campaignId,
                durationMs = 0,
            )
            ResponseEntity.ok(mapOf(
                "success" to success, "failed" to failed,
                "total" to items.size, "campaignId" to campaignId,
                "errors" to errors,
            ))
        } catch (e: Exception) {
            log.error("Bulk promote failed: {}", e.message, e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to describeError(e)))
        }
    }

    // ── Trading API helpers for bulk actions ──

    private fun buildInventoryStatusXml(itemId: String, sku: String?, quantity: Int?, price: Double?): String {
        val sb = StringBuilder("<InventoryStatus>")
        sb.append("<ItemID>${EbayApiUtils.escapeXml(itemId)}</ItemID>")
        if (!sku.isNullOrBlank()) sb.append("<SKU>${EbayApiUtils.escapeXml(sku)}</SKU>")
        if (quantity != null) sb.append("<Quantity>$quantity</Quantity>")
        if (price != null) sb.append("<StartPrice currencyID=\"USD\">${"%.2f".format(price)}</StartPrice>")
        sb.append("</InventoryStatus>")
        return sb.toString()
    }

    private fun callReviseInventoryStatus(accessToken: String, inventoryStatusesXml: String): Boolean {
        val xmlRequest = """
        <?xml version="1.0" encoding="utf-8"?>
        <ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
                <eBayAuthToken>$accessToken</eBayAuthToken>
            </RequesterCredentials>
            $inventoryStatusesXml
        </ReviseInventoryStatusRequest>
        """.trimIndent()

        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "ReviseInventoryStatus")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        val response = restTemplate.exchange(
            TRADING_API_URL, HttpMethod.POST,
            HttpEntity(xmlRequest, headers), String::class.java,
        )

        val body = response.body ?: ""
        if (body.contains("<Ack>Failure</Ack>")) {
            log.error("ReviseInventoryStatus failed: {}", body.take(500))
            return false
        }
        log.info("ReviseInventoryStatus success")
        return true
    }

    /**
     * Update a listing's custom label (SKU) via Trading API ReviseItem.
     *
     * POST /api/v1/ebay/sync/listings/update-sku
     * Body: { "seller": "espartsplus", "itemId": "123456", "newSku": "A2.NEW-SKU.20" }
     */
    @PostMapping("/update-sku")
    fun updateSku(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        return try {
            val seller = body["seller"]?.toString() ?: "espartsplus"
            val itemId = body["itemId"]?.toString()
                ?: return ResponseEntity.badRequest().body(mapOf("error" to "Missing itemId"))
            val newSku = body["newSku"]?.toString()?.trim()
                ?: return ResponseEntity.badRequest().body(mapOf("error" to "Missing newSku"))

            val accessToken = oauthService.getValidAccessToken(seller)

            val xmlRequest = """
            <?xml version="1.0" encoding="utf-8"?>
            <ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials>
                    <eBayAuthToken>$accessToken</eBayAuthToken>
                </RequesterCredentials>
                <Item>
                    <ItemID>${EbayApiUtils.escapeXml(itemId)}</ItemID>
                    <SKU>${EbayApiUtils.escapeXml(newSku)}</SKU>
                </Item>
            </ReviseItemRequest>
            """.trimIndent()

            val headers = HttpHeaders().apply {
                contentType = MediaType.TEXT_XML
                set("X-EBAY-API-SITEID", "0")
                set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
                set("X-EBAY-API-CALL-NAME", "ReviseItem")
                set("X-EBAY-API-IAF-TOKEN", accessToken)
            }

            val response = restTemplate.exchange(
                TRADING_API_URL, HttpMethod.POST,
                HttpEntity(xmlRequest, headers), String::class.java,
            )

            val responseBody = response.body ?: ""
            if (responseBody.contains("<Ack>Failure</Ack>")) {
                val errorMsg = extractXmlValue(responseBody, "LongMessage")
                    ?: extractXmlValue(responseBody, "ShortMessage")
                    ?: "ReviseItem failed"
                log.error("ReviseItem failed for item {}: {}", itemId, responseBody.take(500))
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(mapOf("error" to errorMsg))
            }

            // Update local cache
            try {
                val cached = listingCacheRepo.findByItemIdAndSeller(itemId, seller)
                if (cached != null) {
                    val jsonNode = mapper.readTree(cached.data).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
                    jsonNode.put("sku", newSku)
                    cached.data = mapper.writeValueAsString(jsonNode)
                    listingCacheRepo.save(cached)
                }
            } catch (e: Exception) {
                log.warn("Cache update failed for item {} SKU update: {}", itemId, e.message)
            }

            log.info("ReviseItem success -- item {} SKU updated to '{}'", itemId, newSku)
            actionLog.log(
                module = "LISTING",
                actionType = "SKU_UPDATE",
                triggerType = "MANUAL",
                seller = seller,
                summary = "SKU updated: item $itemId -> '$newSku'",
                totalCount = 1,
                successCount = 1,
                detail = mapOf("itemId" to itemId, "newSku" to newSku),
            )
            ResponseEntity.ok(mapOf("success" to true, "itemId" to itemId, "newSku" to newSku))
        } catch (e: Exception) {
            log.error("Update SKU failed: {}", e.message, e)
            actionLog.log(
                module = "LISTING",
                actionType = "SKU_UPDATE",
                triggerType = "MANUAL",
                summary = "SKU update failed: ${e.message}",
                success = false,
                errorMessage = e.message,
            )
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(mapOf("error" to describeError(e)))
        }
    }

    // ═══════════════════════════════════════════════════════════
    // XML 解析辅助
    // ═══════════════════════════════════════════════════════════

    /**
     * 解析 GetMyeBaySelling XML 响应为结构化数据。
     */
    private fun parseGetMyeBaySellingResponse(xmlBody: String): Map<String, Any> {
        val items = mutableListOf<Map<String, Any?>>()

        // 提取分页信息
        val totalEntries = extractXmlValue(xmlBody, "TotalNumberOfEntries")?.toIntOrNull() ?: 0
        val totalPages = extractXmlValue(xmlBody, "TotalNumberOfPages")?.toIntOrNull() ?: 1

        // 解析每个 Item
        val itemPattern = Regex("<Item>(.*?)</Item>", RegexOption.DOT_MATCHES_ALL)
        val itemMatches = itemPattern.findAll(xmlBody)

        for (itemMatch in itemMatches) {
            val itemXml = itemMatch.groupValues[1]

            val itemId = extractXmlValue(itemXml, "ItemID") ?: continue
            val title = extractXmlValue(itemXml, "Title") ?: ""

            // SKU 可能在顶层或 Variations 中
            var sku = extractXmlValue(itemXml, "SKU") ?: ""

            // 如果有 Variations, 收集所有 variation SKU
            val hasVariations = itemXml.contains("<Variations>")
            val variationSkus = mutableListOf<String>()
            if (hasVariations) {
                val variationPattern = Regex("<Variation>(.*?)</Variation>", RegexOption.DOT_MATCHES_ALL)
                for (varMatch in variationPattern.findAll(itemXml)) {
                    val varSku = extractXmlValue(varMatch.groupValues[1], "SKU")
                    if (!varSku.isNullOrBlank()) variationSkus.add(varSku)
                }
                if (sku.isBlank() && variationSkus.isNotEmpty()) {
                    sku = variationSkus.joinToString(", ")
                }
            }

            // 剥离 Variations 块, 确保 SellingStatus 字段取的是 Item 级而非 Variation 级
            val itemXmlNoVariations = itemXml.replace(
                Regex("<Variations>.*?</Variations>", RegexOption.DOT_MATCHES_ALL), ""
            )

            // CurrentPrice — 从 Item 级 SellingStatus 提取 (已排除 Variation)
            val priceStr = extractXmlValue(itemXmlNoVariations, "CurrentPrice") ?: "0"
            val price = priceStr.toDoubleOrNull() ?: 0.0

            // QuantityAvailable — 优先使用 eBay 直接返回的值, 更可靠
            val quantityAvailable = extractXmlValue(itemXmlNoVariations, "QuantityAvailable")?.toIntOrNull()
            // QuantitySold — 从 Item 级 SellingStatus 提取 (已排除 Variation)
            val quantitySold = extractXmlValue(itemXmlNoVariations, "QuantitySold")?.toIntOrNull() ?: 0
            val quantity = extractXmlValue(itemXmlNoVariations, "Quantity")?.toIntOrNull() ?: 0
            // 优先用 eBay 返回的 QuantityAvailable, 否则 fallback 计算
            val availableQuantity = quantityAvailable ?: (quantity - quantitySold)

            // Gallery image
            val galleryUrl = extractXmlValue(itemXml, "GalleryURL")

            // Listing type
            val listingType = extractXmlValue(itemXml, "ListingType") ?: "FixedPriceItem"

            // Watch count
            val watchCount = extractXmlValue(itemXml, "WatchCount")?.toIntOrNull() ?: 0

            // View item URL
            val viewItemUrl = extractXmlValue(itemXml, "ViewItemURL")

            items.add(mapOf(
                "itemId" to itemId,
                "title" to title,
                "sku" to sku,
                "currentPrice" to price,
                "currency" to "USD",
                "totalQuantity" to quantity,
                "availableQuantity" to availableQuantity,
                "soldQuantity" to quantitySold,
                "listingType" to listingType,
                "galleryUrl" to galleryUrl,
                "watchCount" to watchCount,
                "viewItemUrl" to viewItemUrl,
                "hasVariations" to hasVariations,
                "variationSkus" to if (variationSkus.isNotEmpty()) variationSkus else null,
                "promoted" to false,  // Will be enriched later
            ))
        }

        log.info("Parsed {} active listings (total: {})", items.size, totalEntries)

        return mapOf(
            "items" to items,
            "totalEntries" to totalEntries,
            "totalPages" to totalPages,
        )
    }

    /**
     * 简单的 XML 值提取 (不需要完整 XML 解析器)。
     */
    private fun extractXmlValue(xml: String, tag: String): String? {
        // 处理带属性的标签: <CurrentPrice currencyID="USD">12.99</CurrentPrice>
        val pattern = Regex("<$tag(?:\\s[^>]*)?>([^<]*)</$tag>")
        return pattern.find(xml)?.groupValues?.get(1)?.trim()
    }
}
