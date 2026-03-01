package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.domain.model.EbayListingCache
import com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.client.RestTemplate
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * EbaySyncScheduler — eBay 数据自动同步调度器。
 *
 * 功能:
 *   1. 每日 23:59:59 PST 自动触发全量增量同步
 *   2. 支持手动触发 (通过 Controller 调用 manualSyncAll)
 *   3. 基于水位线 (sync_watermarks) 增量拉取，不重复不遗漏
 *   4. Token 自动续期 (EbayDataSyncService 内部处理)
 *   5. 同步完成后更新水位线
 *
 * 同步链路:
 *   水位线读取 → 计算日期范围 → syncDateRange → Transform → 更新水位线
 */
@Service
class EbaySyncScheduler(
    private val syncService: EbayDataSyncService,
    private val transformService: EbayTransformService,
    private val oauthService: EbayOAuthService,
    private val sellerAccountRepo: EbaySellerAccountRepository,
    private val listingCacheRepo: EbayListingCacheRepository,
    private val jdbcTemplate: JdbcTemplate,
    private val actionLog: SalesActionLogService,
) {
    private val log = LoggerFactory.getLogger(EbaySyncScheduler::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()
    private val PST = ZoneId.of("America/Los_Angeles")

    companion object {
        private const val RECOMMENDATION_BASE = "https://api.ebay.com/sell/recommendation/v1"
    }

    data class SyncReport(
        val seller: String,
        val fromDate: LocalDate,
        val toDate: LocalDate,
        val transactionsFetched: Int,
        val ordersFetched: Int,
        val cleanedProduced: Int,
        val status: String,
        val error: String? = null,
    )

    /**
     * 每日 23:59:59 PST 自动同步。
     *
     * cron: 秒 分 时 日 月 周
     * "59 59 23 * * *" = 每天 23:59:59
     */
    @Scheduled(cron = "59 59 23 * * *", zone = "America/Los_Angeles")
    fun dailyAutoSync() {
        log.info("=======================================")
        log.info("Daily auto-sync triggered at {}", Instant.now())
        log.info("=======================================")

        val startMs = System.currentTimeMillis()
        val reports = syncAllSellers()
        val durationMs = System.currentTimeMillis() - startMs

        for (r in reports) {
            if (r.status == "success") {
                log.info("[OK] {} synced {}-{}: txn={}, orders={}, cleaned={}",
                    r.seller, r.fromDate, r.toDate, r.transactionsFetched, r.ordersFetched, r.cleanedProduced)
                actionLog.logDataSync(
                    triggerType = "SCHEDULED",
                    seller = r.seller,
                    fromDate = r.fromDate.toString(),
                    toDate = r.toDate.toString(),
                    txnFetched = r.transactionsFetched,
                    ordersFetched = r.ordersFetched,
                    cleanedProduced = r.cleanedProduced,
                    durationMs = durationMs,
                )
            } else {
                log.error("[FAIL] {} sync failed: {}", r.seller, r.error)
                actionLog.logDataSync(
                    triggerType = "SCHEDULED",
                    seller = r.seller,
                    fromDate = r.fromDate.toString(),
                    toDate = r.toDate.toString(),
                    txnFetched = 0,
                    ordersFetched = 0,
                    cleanedProduced = 0,
                    durationMs = durationMs,
                    success = false,
                    errorMessage = r.error,
                )
            }
        }
    }

    /**
     * 手动触发全量同步 (Controller 调用)。
     */
    fun manualSyncAll(): List<SyncReport> {
        log.info("Manual sync triggered")
        return syncAllSellers()
    }

    /**
     * 对所有已注册卖家执行增量同步。
     */
    private fun syncAllSellers(): List<SyncReport> {
        val sellers = sellerAccountRepo.findAll()
        if (sellers.isEmpty()) {
            log.warn("No seller accounts configured, skipping sync")
            return emptyList()
        }

        val today = LocalDate.now(PST)
        val reports = mutableListOf<SyncReport>()

        for (account in sellers) {
            val seller = account.sellerUsername
            try {
                // 1. 读取水位线确定起始日期
                val fromDate = getWatermark(seller) ?: today.minusDays(1)

                // 2. 如果水位线已是今天，跳过
                if (!fromDate.isBefore(today)) {
                    log.info("Seller {} already synced up to {}, skipping", seller, fromDate)
                    reports.add(SyncReport(seller, fromDate, today, 0, 0, 0, "skipped"))
                    continue
                }

                log.info("Syncing {} from {} to {}", seller, fromDate, today)

                // 3. 同步 API 数据
                val batch = syncService.syncDateRange(seller, fromDate, today)

                // 4. 转换为 cleaned_transactions
                val cleaned = transformService.transformDateRange(fromDate.toString(), today.toString())

                // 5. 更新水位线
                updateWatermark(seller, "fin_txn", today, batch.transactionsFetched)
                updateWatermark(seller, "ful_orders", today, batch.ordersFetched)
                updateWatermark(seller, "fin_payout", today, 0)

                reports.add(SyncReport(
                    seller = seller,
                    fromDate = fromDate,
                    toDate = today,
                    transactionsFetched = batch.transactionsFetched,
                    ordersFetched = batch.ordersFetched,
                    cleanedProduced = cleaned,
                    status = "success",
                ))
            } catch (e: Exception) {
                log.error("Sync failed for seller {}: {}", seller, e.message, e)
                reports.add(SyncReport(
                    seller = seller,
                    fromDate = getWatermark(seller) ?: today,
                    toDate = today,
                    transactionsFetched = 0,
                    ordersFetched = 0,
                    cleanedProduced = 0,
                    status = "failed",
                    error = e.message,
                ))
            }
        }

        return reports
    }

    /**
     * 读取卖家的最新水位线 (取所有 API 中最早的日期)。
     */
    private fun getWatermark(seller: String): LocalDate? {
        return jdbcTemplate.queryForObject(
            """SELECT MIN(last_sync_date) FROM ebay_api.sync_watermarks
               WHERE seller_username = ?""",
            LocalDate::class.java, seller,
        )
    }

    /**
     * 更新水位线。
     */
    private fun updateWatermark(seller: String, apiEndpoint: String, syncDate: LocalDate, recordCount: Int) {
        jdbcTemplate.update("""
            INSERT INTO ebay_api.sync_watermarks (seller_username, api_endpoint, last_sync_date, last_sync_at, record_count)
            VALUES (?, ?, ?, NOW(), ?)
            ON CONFLICT (seller_username, api_endpoint)
            DO UPDATE SET last_sync_date = EXCLUDED.last_sync_date,
                          last_sync_at = NOW(),
                          record_count = EXCLUDED.record_count
        """.trimIndent(), seller, apiEndpoint, syncDate, recordCount)
    }

    // ═══════════════════════════════════════════════════════════
    // Daily Ad Rate Refresh — 23:30:00 PST (30 min before daily sync)
    // ═══════════════════════════════════════════════════════════

    /**
     * 每日 23:30:00 PST 自动刷新所有 listing 的 suggestedAdRate。
     *
     * 与 dailyAutoSync (23:59:59) 错开 30 分钟, 避免线程池竞争。
     * 使用 eBay Recommendation API 批量获取建议推广费率, 更新 listing cache。
     */
    @Scheduled(cron = "0 30 23 * * *", zone = "America/Los_Angeles")
    @org.springframework.transaction.annotation.Transactional
    fun dailyAdRateRefresh() {
        log.info("=======================================")
        log.info("Daily ad rate refresh triggered at {}", Instant.now())
        log.info("=======================================")

        val sellers = sellerAccountRepo.findAll()
        if (sellers.isEmpty()) {
            log.warn("No seller accounts configured, skipping ad rate refresh")
            return
        }

        for (account in sellers) {
            val seller = account.sellerUsername
            val startMs = System.currentTimeMillis()
            try {
                val accessToken = oauthService.getValidAccessToken(seller)
                val cachedListings = listingCacheRepo.findAllBySeller(seller)

                if (cachedListings.isEmpty()) {
                    log.info("No cached listings for seller {}, skipping", seller)
                    continue
                }

                val itemIds = cachedListings.map { it.itemId }
                log.info("Refreshing ad rates for {} listings (seller: {})", itemIds.size, seller)

                // Fetch suggested ad rates from Recommendation API
                val suggestedRates = fetchSuggestedAdRates(accessToken, itemIds)
                log.info("Got {} suggested ad rates for seller {}", suggestedRates.size, seller)

                // Update cache entries with new suggestedAdRate
                var updated = 0
                for (cached in cachedListings) {
                    val newRate = suggestedRates[cached.itemId] ?: continue
                    try {
                        val json = mapper.readTree(cached.data)
                        val mutableMap = mapper.convertValue(json, Map::class.java).toMutableMap()
                        mutableMap["suggestedAdRate"] = newRate
                        cached.data = mapper.writeValueAsString(mutableMap)
                        cached.fetchedAt = Instant.now()
                        listingCacheRepo.save(cached)
                        updated++
                    } catch (e: Exception) {
                        log.debug("Failed to update ad rate for item {}: {}", cached.itemId, e.message)
                    }
                }

                val durationMs = System.currentTimeMillis() - startMs
                log.info("[OK] Ad rate refresh done for {}: {}/{} listings updated", seller, updated, cachedListings.size)

                actionLog.log(
                    module = "LISTING",
                    actionType = "AD_RATE_REFRESH",
                    triggerType = "SCHEDULED",
                    seller = seller,
                    summary = "Daily ad rate refresh: $updated/${cachedListings.size} listings updated",
                    totalCount = cachedListings.size,
                    successCount = updated,
                    failedCount = cachedListings.size - updated,
                    durationMs = durationMs,
                )
            } catch (e: Exception) {
                val durationMs = System.currentTimeMillis() - startMs
                log.error("[FAIL] Ad rate refresh failed for seller {}: {}", seller, e.message, e)

                actionLog.log(
                    module = "LISTING",
                    actionType = "AD_RATE_REFRESH",
                    triggerType = "SCHEDULED",
                    seller = seller,
                    summary = "Daily ad rate refresh failed: ${e.message}",
                    success = false,
                    errorMessage = e.message,
                    durationMs = durationMs,
                )
            }
        }
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

            // Batch: max 500 per call
            val batches = listingIds.chunked(500)
            for (batch in batches) {
                try {
                    val requestBody = mapper.writeValueAsString(mapOf(
                        "listingIds" to batch
                    ))

                    val url = "$RECOMMENDATION_BASE/find?filter=recommendationTypes:%7BAD%7D"
                    log.info("Recommendation API: fetching for {} listings", batch.size)

                    val response = restTemplate.exchange(
                        java.net.URI.create(url),
                        HttpMethod.POST,
                        HttpEntity(requestBody, headers),
                        String::class.java,
                    )

                    val responseBody = response.body ?: "{}"
                    val json = mapper.readTree(responseBody)
                    val recommendations = json.path("listingRecommendations")
                    if (recommendations.isArray) {
                        for (rec in recommendations) {
                            val listingId = rec.path("listingId").asText()
                            if (listingId.isBlank()) continue

                            val ad = rec.path("marketing").path("ad")
                            if (ad.isMissingNode) continue

                            val bidPcts = ad.path("bidPercentages")
                            if (bidPcts.isArray) {
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
}
