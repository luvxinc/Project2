package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.domain.model.*
import com.mgmt.modules.ebayapi.domain.repository.*
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestTemplate
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * EbayDataSyncService — eBay 数据同步引擎。
 *
 * 从 eBay API 拉取:
 *   1. Finances getTransactions → fin_transactions + fin_transaction_fees
 *   2. Fulfillment getOrders   → ful_orders + ful_order_items
 *   3. Finances getPayouts     → fin_payouts
 *
 * 所有数据保存到 ebay_api schema，与 public 完全隔离。
 */
@Service
class EbayDataSyncService(
    private val oauthService: EbayOAuthService,
    private val finTxnRepo: EbayFinTransactionRepository,
    private val finTxnFeeRepo: EbayFinTransactionFeeRepository,
    private val fulOrderRepo: EbayFulOrderRepository,
    private val fulItemRepo: EbayFulOrderItemRepository,
    private val finPayoutRepo: EbayFinPayoutRepository,
    private val syncBatchRepo: EbaySyncBatchRepository,
) {
    private val log = LoggerFactory.getLogger(EbayDataSyncService::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()

    @PersistenceContext
    private lateinit var em: EntityManager

    companion object {
        private const val FINANCES_BASE = "https://apiz.ebay.com/sell/finances/v1"
        private const val FULFILLMENT_BASE = "https://api.ebay.com/sell/fulfillment/v1"
        private const val FIN_TXN_LIMIT = 1000   // max per page for finances
        private const val FUL_ORDER_LIMIT = 200   // max per page for fulfillment
    }

    // ═══════════════════════════════════════════════════════════
    // Webhook 触发: 单订单实时同步
    // ═══════════════════════════════════════════════════════════

    /**
     * 通过 orderId 同步单个订单 (Fulfillment + Finances)。
     *
     * 由 Webhook ORDER_CONFIRMATION / ITEM_MARKED_SHIPPED 触发。
     * - 先拉 Fulfillment Order (订单详情 + 物流地址)
     * - 再拉 Finances Transactions (该订单的金融交易)
     * - 触发转换 (Transform) 生成 cleaned_transaction
     *
     * @param sellerUsername 卖家用户名
     * @param orderId       eBay 订单 ID
     * @return 同步结果摘要
     */
    @Transactional
    fun syncSingleOrder(sellerUsername: String, orderId: String): Map<String, Any> {
        val batchId = "webhook_${orderId.take(20)}_${System.currentTimeMillis()}"
        log.info("[{}] Webhook single-order sync started — orderId: {}", batchId, orderId)

        val result = mutableMapOf<String, Any>(
            "orderId" to orderId,
            "batchId" to batchId,
        )

        try {
            val accessToken = oauthService.getValidAccessToken(sellerUsername)

            // 1. Fulfillment: GET /sell/fulfillment/v1/order/{orderId}
            val orderUrl = "$FULFILLMENT_BASE/order/$orderId?fieldGroups=TAX_BREAKDOWN"
            val orderJson = callEbayApi(accessToken, orderUrl)
            if (orderJson != null) {
                saveFulOrder(orderJson, sellerUsername, batchId)
                result["orderSynced"] = true
                log.info("[{}] Fulfillment order synced", batchId)
            } else {
                result["orderSynced"] = false
                log.warn("[{}] Fulfillment order not found or unavailable", batchId)
            }

            // 2. Finances: GET /sell/finances/v1/transaction?filter=orderId:{orderId}
            val txnCount = syncSingleOrderTransactions(accessToken, sellerUsername, orderId, batchId)
            result["transactionsSynced"] = txnCount
            log.info("[{}] {} finance transactions synced", batchId, txnCount)

            result["status"] = "success"
        } catch (e: Exception) {
            result["status"] = "failed"
            result["error"] = e.message ?: "unknown"
            log.error("[{}] Single-order sync failed: {}", batchId, e.message, e)
        }

        return result
    }

    /**
     * 同步指定 orderId 的所有 Finances Transactions。
     *
     * eBay Finances API 支持 filter=orderId:{id} 按订单过滤。
     */
    fun syncSingleOrderTransactions(
        accessToken: String, sellerUsername: String,
        orderId: String, batchId: String,
    ): Int {
        var offset = 0
        var totalSaved = 0

        while (true) {
            val url = "$FINANCES_BASE/transaction" +
                "?filter=orderId:%7B$orderId%7D" +
                "&limit=$FIN_TXN_LIMIT&offset=$offset"

            val json = callEbayApi(accessToken, url) ?: break
            val transactions = json.path("transactions")
            if (!transactions.isArray || transactions.size() == 0) break

            for (txnNode in transactions) {
                saveFinTransaction(txnNode, sellerUsername, batchId)
                totalSaved++
            }

            val total = json.path("total").asInt(0)
            offset += transactions.size()
            if (offset >= total) break
        }
        return totalSaved
    }

    /**
     * 更新已存在订单的物流状态 (由 ITEM_MARKED_SHIPPED 触发)。
     *
     * 重新拉取订单数据并更新 fulfillment status 字段。
     */
    @Transactional
    fun refreshOrderStatus(sellerUsername: String, orderId: String): Boolean {
        val batchId = "webhook_ship_${orderId.take(20)}_${System.currentTimeMillis()}"
        log.info("[{}] Refreshing order status — orderId: {}", batchId, orderId)

        return try {
            val accessToken = oauthService.getValidAccessToken(sellerUsername)
            val orderUrl = "$FULFILLMENT_BASE/order/$orderId?fieldGroups=TAX_BREAKDOWN"
            val orderJson = callEbayApi(accessToken, orderUrl) ?: return false

            val newStatus = orderJson.path("orderFulfillmentStatus").asText("")
            val lastModified = orderJson.path("lastModifiedDate").asText("")

            // 直接更新状态字段 (比删除重建更高效)
            val updated = fulOrderRepo.findByOrderId(orderId)
            if (updated != null) {
                updated.orderFulfillmentStatus = newStatus
                updated.lastModifiedDate = if (lastModified.isNotBlank()) parseInstant(lastModified) else null
                updated.rawJson = orderJson.toString()
                fulOrderRepo.save(updated)
                log.info("[{}] Order {} status updated to: {}", batchId, orderId, newStatus)
                true
            } else {
                // 订单不存在, 完整同步
                saveFulOrder(orderJson, sellerUsername, batchId)
                log.info("[{}] Order {} not found locally, full sync performed", batchId, orderId)
                true
            }
        } catch (e: Exception) {
            log.error("[{}] Failed to refresh order status: {}", batchId, e.message, e)
            false
        }
    }

    /**
     * 同步指定日期范围内的所有数据 (transactions + orders + payouts)。
     *
     * @param sellerUsername  已授权的 seller (e.g. "espartsplus")
     * @param dateFrom       起始日期 (含)
     * @param dateTo         截止日期 (含)
     * @return 同步批次记录
     */
    fun syncDateRange(sellerUsername: String, dateFrom: LocalDate, dateTo: LocalDate): EbaySyncBatch {
        val batchId = "sync_${sellerUsername}_${dateFrom}_${UUID.randomUUID().toString().take(8)}"
        val batch = EbaySyncBatch(
            batchId = batchId,
            status = "started",
            sellerUsername = sellerUsername,
            dateFrom = dateFrom.atStartOfDay().toInstant(ZoneOffset.UTC),
            dateTo = dateTo.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC),
        )
        syncBatchRepo.save(batch)

        try {
            val accessToken = oauthService.getValidAccessToken(sellerUsername)
            val fromStr = dateFrom.atStartOfDay().atOffset(ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))
            val toStr = dateTo.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))

            // Phase 1: Finances Transactions
            batch.status = "fetching_transactions"
            batch.stageMessage = "Fetching financial transactions..."
            syncBatchRepo.save(batch)

            val txnCount = syncFinancesTransactions(accessToken, sellerUsername, fromStr, toStr, batchId)
            batch.transactionsFetched = txnCount
            batch.progress = 40
            syncBatchRepo.save(batch)
            log.info("[{}] Fetched {} transactions", batchId, txnCount)

            // Phase 2: Fulfillment Orders (non-fatal — eBay limits to 2 years)
            batch.status = "fetching_orders"
            batch.stageMessage = "Fetching fulfillment orders..."
            syncBatchRepo.save(batch)

            var orderCount = 0
            try {
                orderCount = syncFulfillmentOrders(accessToken, sellerUsername, fromStr, toStr, batchId)
            } catch (e: Exception) {
                log.warn("[{}] Fulfillment orders fetch failed (non-fatal, date may be >2yr): {}", batchId, e.message)
            }
            batch.ordersFetched = orderCount
            batch.progress = 80
            syncBatchRepo.save(batch)
            log.info("[{}] Fetched {} orders", batchId, orderCount)

            // Phase 3: Finances Payouts
            batch.status = "fetching_payouts"
            batch.stageMessage = "Fetching payouts..."
            syncBatchRepo.save(batch)

            syncFinancesPayouts(accessToken, sellerUsername, fromStr, toStr, batchId)
            batch.progress = 100
            batch.status = "done"
            batch.stageMessage = "Sync complete"
            batch.completedAt = Instant.now()
            syncBatchRepo.save(batch)

            log.info("[{}] Sync complete! transactions={}, orders={}", batchId, txnCount, orderCount)
            return batch

        } catch (e: Exception) {
            batch.status = "failed"
            batch.errorMessage = e.message?.take(2000)
            batch.completedAt = Instant.now()
            syncBatchRepo.save(batch)
            log.error("[{}] Sync failed: {}", batchId, e.message, e)
            throw e
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 1: Finances getTransactions
    // ═══════════════════════════════════════════════════════════

    private fun syncFinancesTransactions(
        accessToken: String, seller: String,
        dateFrom: String, dateTo: String, batchId: String,
    ): Int {
        var offset = 0
        var totalSaved = 0

        while (true) {
            val url = "$FINANCES_BASE/transaction" +
                "?filter=transactionDate:%5B$dateFrom..$dateTo%5D" +
                "&limit=$FIN_TXN_LIMIT&offset=$offset"

            val json = callEbayApi(accessToken, url) ?: break
            val transactions = json.path("transactions")
            if (!transactions.isArray || transactions.size() == 0) break

            for (txnNode in transactions) {
                saveFinTransaction(txnNode, seller, batchId)
                totalSaved++
            }

            val total = json.path("total").asInt(0)
            offset += transactions.size()
            log.debug("[{}] Transactions progress: {}/{}", batchId, offset, total)

            if (offset >= total) break
        }
        return totalSaved
    }

    private fun saveFinTransaction(node: JsonNode, seller: String, batchId: String) {
        val txnId = node.path("transactionId").asText()
        if (finTxnRepo.existsByTransactionId(txnId)) return  // Skip duplicates

        try {
            val txn = EbayFinTransaction(
                transactionId = txnId,
                transactionType = node.path("transactionType").asText(""),
                transactionStatus = node.path("transactionStatus").textOrNull(),
                transactionDate = parseInstant(node.path("transactionDate").asText()),
                transactionMemo = node.path("transactionMemo").textOrNull(),
                orderId = node.path("orderId").textOrNull(),
                payoutId = node.path("payoutId").textOrNull(),
                buyerUsername = node.path("buyer").path("username").textOrNull(),
                amountValue = node.path("amount").path("value").decimalOrNull(),
                amountCurrency = node.path("amount").path("currency").textOrNull(),
                totalFeeBasisAmount = node.path("totalFeeBasisAmount").path("value").decimalOrNull(),
                totalFeeBasisCurrency = node.path("totalFeeBasisAmount").path("currency").textOrNull(),
                totalFeeAmount = node.path("totalFeeAmount").path("value").decimalOrNull(),
                totalFeeCurrency = node.path("totalFeeAmount").path("currency").textOrNull(),
                ebayCollectedTaxAmount = node.path("ebayCollectedTaxAmount").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                ebayCollectedTaxCurrency = node.path("ebayCollectedTaxAmount").path("currency").textOrNull(),
                bookingEntry = node.path("bookingEntry").textOrNull(),
                transferId = node.path("transferId").textOrNull(),
                referencesJson = node.path("references").toJsonStringOrNull(),
                orderLineItemsJson = node.path("orderLineItems").toJsonStringOrNull(),
                syncBatchId = batchId,
                sellerUsername = seller,
                rawJson = node.toString(),
            )

            // Extract fee details from orderLineItems[].marketplaceFees[]
            val lineItems = node.path("orderLineItems")
            if (lineItems.isArray) {
                for (li in lineItems) {
                    val lineItemId = li.path("lineItemId").textOrNull()
                    val fees = li.path("marketplaceFees")
                    if (fees.isArray) {
                        for (feeNode in fees) {
                            val fee = EbayFinTransactionFee(
                                transactionId = txnId,
                                lineItemId = lineItemId,
                                feeType = feeNode.path("feeType").asText(""),
                                feeAmount = feeNode.path("amount").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                                feeCurrency = feeNode.path("amount").path("currency").textOrNull(),
                                feeBasisAmount = feeNode.path("feeBasisAmount").path("value").decimalOrNull(),
                                feeBasisCurrency = feeNode.path("feeBasisAmount").path("currency").textOrNull(),
                            )
                            fee.transaction = txn
                            txn.fees.add(fee)
                        }
                    }
                }
            }
            finTxnRepo.saveAndFlush(txn)  // immediate flush to DB
        } catch (e: DataIntegrityViolationException) {
            log.debug("Transaction {} already exists, skipping", txnId)
            em.clear()  // reset Hibernate session after constraint violation
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 2: Fulfillment getOrders
    // ═══════════════════════════════════════════════════════════

    private fun syncFulfillmentOrders(
        accessToken: String, seller: String,
        dateFrom: String, dateTo: String, batchId: String,
    ): Int {
        var offset = 0
        var totalSaved = 0

        while (true) {
            val url = "$FULFILLMENT_BASE/order" +
                "?filter=creationdate:%5B$dateFrom..$dateTo%5D" +
                "&limit=$FUL_ORDER_LIMIT&offset=$offset" +
                "&fieldGroups=TAX_BREAKDOWN"

            val json = callEbayApi(accessToken, url) ?: break
            val orders = json.path("orders")
            if (!orders.isArray || orders.size() == 0) break

            for (orderNode in orders) {
                saveFulOrder(orderNode, seller, batchId)
                totalSaved++
            }

            val total = json.path("total").asInt(0)
            offset += orders.size()
            log.debug("[{}] Orders progress: {}/{}", batchId, offset, total)

            if (offset >= total) break
        }
        return totalSaved
    }

    private fun saveFulOrder(node: JsonNode, seller: String, batchId: String) {
        val orderId = node.path("orderId").asText()
        if (fulOrderRepo.existsByOrderId(orderId)) return  // Skip duplicates

        try {
            val shipTo = node.path("fulfillmentStartInstructions")
                .firstOrNull()?.path("shippingStep")?.path("shipTo")
            val shipAddr = shipTo?.path("contactAddress")

            val pricing = node.path("pricingSummary")
            val payment = node.path("paymentSummary")

            val order = EbayFulOrder(
                orderId = orderId,
                legacyOrderId = node.path("legacyOrderId").textOrNull(),
                creationDate = parseInstant(node.path("creationDate").asText()),
                lastModifiedDate = node.path("lastModifiedDate").textOrNull()?.let { parseInstant(it) },
                orderFulfillmentStatus = node.path("orderFulfillmentStatus").textOrNull(),
                orderPaymentStatus = node.path("orderPaymentStatus").textOrNull(),
                cancelStatus = node.path("cancelStatus").path("cancelState").textOrNull(),
                buyerUsername = node.path("buyer").path("username").textOrNull(),
                buyerFullName = node.path("buyer").path("buyerRegistrationAddress").path("fullName").textOrNull(),
                shipToName = shipTo?.path("fullName")?.textOrNull(),
                shipToAddressLine1 = shipAddr?.path("addressLine1")?.textOrNull(),
                shipToAddressLine2 = shipAddr?.path("addressLine2")?.textOrNull(),
                shipToCity = shipAddr?.path("city")?.textOrNull(),
                shipToState = shipAddr?.path("stateOrProvince")?.textOrNull(),
                shipToPostalCode = shipAddr?.path("postalCode")?.textOrNull(),
                shipToCountryCode = shipAddr?.path("countryCode")?.textOrNull(),
                shipToPhone = shipTo?.path("primaryPhone")?.path("phoneNumber")?.textOrNull(),
                priceSubtotal = pricing.path("priceSubtotal").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                priceDiscount = pricing.path("priceDiscount").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                deliveryCost = pricing.path("deliveryCost").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                deliveryDiscount = pricing.path("deliveryDiscount").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                tax = pricing.path("tax").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                total = pricing.path("total").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                priceCurrency = pricing.path("total").path("currency").textOrNull(),
                totalDueSeller = payment.path("totalDueSeller").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                totalMarketplaceFee = node.path("totalMarketplaceFee").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                refundsJson = payment.path("refunds").toJsonStringOrNull(),
                paymentsJson = payment.path("payments").toJsonStringOrNull(),
                fulfillmentHrefsJson = node.path("fulfillmentHrefs").toJsonStringOrNull(),
                salesRecordRef = node.path("salesRecordReference").textOrNull(),
                sellerId = node.path("sellerId").textOrNull(),
                rawJson = node.toString(),
                syncBatchId = batchId,
                sellerUsername = seller,
            )

            // Line items
            val lineItems = node.path("lineItems")
            if (lineItems.isArray) {
                for (liNode in lineItems) {
                    val item = EbayFulOrderItem(
                        orderId = orderId,
                        lineItemId = liNode.path("lineItemId").asText(""),
                        legacyItemId = liNode.path("legacyItemId").textOrNull(),
                        legacyVariationId = liNode.path("legacyVariationId").textOrNull(),
                        title = liNode.path("title").textOrNull(),
                        sku = liNode.path("sku").textOrNull(),
                        quantity = liNode.path("quantity").asInt(0),
                        lineItemCost = liNode.path("lineItemCost").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                        discountedLineItemCost = liNode.path("discountedLineItemCost").path("value").decimalOrNull() ?: BigDecimal.ZERO,
                        lineItemCurrency = liNode.path("lineItemCost").path("currency").textOrNull(),
                        ebayCollectAndRemitTax = liNode.path("ebayCollectAndRemitTaxes")?.sumDecimal("amount") ?: BigDecimal.ZERO,
                        soldViaAdCampaign = liNode.path("properties").path("soldViaAdCampaign").asBoolean(false),
                        conditionId = liNode.path("conditionId").textOrNull(),
                        conditionDescription = liNode.path("conditionDescription").textOrNull(),
                        listingMarketplaceId = liNode.path("listingMarketplaceId").textOrNull(),
                        purchaseMarketplaceId = liNode.path("purchaseMarketplaceId").textOrNull(),
                        soldFormat = liNode.path("soldFormat").textOrNull(),
                        appliedPromotionsJson = liNode.path("appliedPromotions").toJsonStringOrNull(),
                        taxesJson = liNode.path("taxes").toJsonStringOrNull(),
                        deliveryCostJson = liNode.path("deliveryCost").toJsonStringOrNull(),
                    )
                    item.order = order
                    order.items.add(item)
                }
            }
            fulOrderRepo.saveAndFlush(order)  // immediate flush to DB
        } catch (e: DataIntegrityViolationException) {
            log.debug("Order {} already exists, skipping", orderId)
            em.clear()  // reset Hibernate session after constraint violation
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 3: Finances getPayouts
    // ═══════════════════════════════════════════════════════════

    private fun syncFinancesPayouts(
        accessToken: String, seller: String,
        dateFrom: String, dateTo: String, batchId: String,
    ) {
        var offset = 0
        while (true) {
            val url = "$FINANCES_BASE/payout" +
                "?filter=payoutDate:%5B$dateFrom..$dateTo%5D" +
                "&limit=200&offset=$offset"

            val json = callEbayApi(accessToken, url) ?: break
            val payouts = json.path("payouts")
            if (!payouts.isArray || payouts.size() == 0) break

            for (pNode in payouts) {
                val payoutId = pNode.path("payoutId").asText()
                if (finPayoutRepo.existsByPayoutId(payoutId)) continue

                try {
                    val payout = EbayFinPayout(
                        payoutId = payoutId,
                        payoutStatus = pNode.path("payoutStatus").textOrNull(),
                        payoutDate = pNode.path("payoutDate").textOrNull()?.let { parseInstant(it) },
                        amountValue = pNode.path("amount").path("value").decimalOrNull(),
                        amountCurrency = pNode.path("amount").path("currency").textOrNull(),
                        payoutInstrumentType = pNode.path("payoutInstrument").path("instrumentType").textOrNull(),
                        payoutMemo = pNode.path("payoutMemo").textOrNull(),
                        bankName = pNode.path("payoutInstrument").path("bankName").textOrNull(),
                        last4Digits = pNode.path("payoutInstrument").path("last4Digits").textOrNull(),
                        rawJson = pNode.toString(),
                        sellerUsername = seller,
                    )
                    finPayoutRepo.saveAndFlush(payout)
                } catch (e: DataIntegrityViolationException) {
                    log.debug("Payout {} already exists, skipping", payoutId)
                    em.clear()
                }
            }

            val total = json.path("total").asInt(0)
            offset += payouts.size()
            if (offset >= total) break
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HTTP Helper
    // ═══════════════════════════════════════════════════════════

    private fun callEbayApi(accessToken: String, url: String): JsonNode? {
        val headers = HttpHeaders().apply {
            setBearerAuth(accessToken)
            accept = listOf(MediaType.APPLICATION_JSON)
        }
        return try {
            // Use URI directly to prevent RestTemplate from re-encoding brackets
            val uri = java.net.URI.create(url)
            val response = restTemplate.exchange(uri, HttpMethod.GET, HttpEntity<Void>(headers), String::class.java)
            if (response.statusCode.is2xxSuccessful && response.body != null) {
                mapper.readTree(response.body)
            } else {
                log.warn("eBay API returned {}: {}", response.statusCode, url)
                null
            }
        } catch (e: Exception) {
            log.error("eBay API call failed: {} — {}", url, e.message)
            throw RuntimeException("eBay API call failed: ${e.message}", e)
        }
    }

    // ═══════════════════════════════════════════════════════════
    // JSON Parsing Helpers
    // ═══════════════════════════════════════════════════════════

    private fun parseInstant(text: String): Instant {
        return try {
            Instant.parse(text)
        } catch (e: Exception) {
            Instant.now()
        }
    }

    private fun JsonNode.textOrNull(): String? {
        return if (this.isMissingNode || this.isNull || this.asText().isNullOrBlank()) null
        else this.asText()
    }

    private fun JsonNode.decimalOrNull(): BigDecimal? {
        return if (this.isMissingNode || this.isNull) null
        else try { BigDecimal(this.asText()) } catch (e: Exception) { null }
    }

    private fun JsonNode.toJsonStringOrNull(): String? {
        return if (this.isMissingNode || this.isNull || (this.isArray && this.size() == 0)) null
        else this.toString()
    }

    private fun JsonNode.sumDecimal(field: String): BigDecimal {
        if (!this.isArray) return BigDecimal.ZERO
        return this.sumOf { it.path(field).path("value").decimalOrNull() ?: BigDecimal.ZERO }
    }

    private inline fun <T> Iterable<T>.sumOf(selector: (T) -> BigDecimal): BigDecimal {
        var sum = BigDecimal.ZERO
        for (element in this) sum += selector(element)
        return sum
    }

    private fun JsonNode?.firstOrNull(): JsonNode? {
        if (this == null || !this.isArray || this.size() == 0) return null
        return this[0]
    }

    /**
     * 从已存储的订单中获取行项目信息 (用于 SSE 广播)。
     */
    fun getOrderLineItems(orderId: String): List<Map<String, Any?>> {
        val items = fulItemRepo.findAllByOrderId(orderId)
        return items.map { item ->
            mapOf(
                "legacyItemId" to item.legacyItemId,
                "sku" to item.sku,
                "title" to item.title,
                "quantity" to item.quantity,
            )
        }
    }
}
