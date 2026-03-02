package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.application.config.EbayWebhookProperties
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

/**
 * EbayWebhookService — eBay Webhook 签名验证 + 事件分发。
 *
 * 职责:
 *   1. Challenge-Response 验证 (eBay 注册 Webhook 时 GET 请求)
 *   2. ECDSA P-256 数字签名验证 (POST 事件推送防伪造)
 *   3. 按事件主题 (topic) 分发到对应的处理逻辑
 *
 * 事件驱动同步链路:
 *   ORDER_CONFIRMATION  → syncSingleOrder → transformDateRange → cleaned_transaction 实时生成
 *   ITEM_MARKED_SHIPPED → refreshOrderStatus → ful_orders 状态即时更新
 *
 * 安全:
 *   - 所有 POST 必须通过签名验证, 否则直接丢弃
 *   - 公钥从 eBay 公钥端点动态获取并缓存
 *   - 幂等处理: 同一事件可能收到多次 (eBay 重试机制)
 */
@Service
class EbayWebhookService(
    private val webhookProps: EbayWebhookProperties,
    private val objectMapper: ObjectMapper,
    private val syncService: EbayDataSyncService,
    private val transformService: EbayTransformService,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
    private val autoOpsService: AutoOpsService,
    private val actionLog: SalesActionLogService,
    private val listingCacheRepo: com.mgmt.modules.ebayapi.domain.repository.EbayListingCacheRepository,
    private val sellerRepo: com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository,
    private val bestOfferRepo: com.mgmt.modules.ebayapi.domain.repository.EbayBestOfferRepository,
    private val redis: StringRedisTemplate,
    private val messageRepo: com.mgmt.modules.ebayapi.domain.repository.EbayMessageRepository,
) {
    private val log = LoggerFactory.getLogger(EbayWebhookService::class.java)
    private val httpClient = HttpClient.newHttpClient()

    // 公钥缓存: KID → Base64 公钥
    private val publicKeyCache = ConcurrentHashMap<String, String>()

    // 最后一次销售事件时间戳 (备用)
    @Volatile
    private var lastSaleEventAt: Instant = Instant.EPOCH

    private val PST = ZoneId.of("America/Los_Angeles")

    companion object {
        /** eBay 公钥端点 — 通过 KID 获取对应的 ECDSA P-256 公钥 */
        private const val EBAY_PUBLIC_KEY_URL = "https://api.ebay.com/commerce/notification/v1/public_key/"

        /** 签名时间戳容忍窗口 (秒) — 超过此范围的签名视为过期 */
        private const val TIMESTAMP_TOLERANCE_SECONDS = 300L  // 5 minutes
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. Challenge-Response (GET /ebay/webhook?challenge_code=xxx)
    // ═══════════════════════════════════════════════════════════════

    /**
     * 计算 eBay Challenge-Response。
     *
     * eBay 注册 Webhook 时发送 GET 请求, 我方需要返回:
     *   challengeResponse = SHA-256 Hex ( challengeCode + verificationToken + endpointUrl )
     *
     * @param challengeCode eBay 发送的随机挑战码
     * @return SHA-256 Hex 摘要
     */
    fun computeChallengeResponse(challengeCode: String): String {
        val input = challengeCode + webhookProps.verificationToken + webhookProps.endpointUrl
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val hex = digest.joinToString("") { "%02x".format(it) }
        log.info("Webhook challenge-response computed (code={}...)", challengeCode.take(8))
        return hex
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. 签名验证 (POST /ebay/webhook)
    // ═══════════════════════════════════════════════════════════════

    /**
     * 验证 eBay Webhook POST 请求的数字签名。
     */
    fun verifySignature(signatureHeader: String, payload: String): Boolean {
        return try {
            val sigJson = objectMapper.readTree(Base64.getDecoder().decode(signatureHeader))
            val kid = sigJson.path("kid").asText()
            val signatureBase64 = sigJson.path("signature").asText()

            if (kid.isBlank() || signatureBase64.isBlank()) {
                log.warn("Webhook signature missing kid or signature field")
                return false
            }

            val publicKeyBase64 = getEbayPublicKey(kid) ?: run {
                log.warn("Failed to fetch eBay public key for KID: {}", kid)
                return false
            }

            val payloadBytes = payload.toByteArray(Charsets.UTF_8)
            val keyBytes = Base64.getDecoder().decode(publicKeyBase64)
            val keySpec = X509EncodedKeySpec(keyBytes)
            val keyFactory = KeyFactory.getInstance("EC")
            val publicKey = keyFactory.generatePublic(keySpec)

            val sig = Signature.getInstance("SHA256withECDSA")
            sig.initVerify(publicKey)
            sig.update(payloadBytes)

            val signatureBytes = Base64.getDecoder().decode(signatureBase64)
            val valid = sig.verify(signatureBytes)

            if (!valid) {
                log.warn("Webhook signature verification FAILED for KID: {}", kid)
            } else {
                log.debug("Webhook signature verified successfully (KID: {})", kid)
            }
            valid
        } catch (e: Exception) {
            log.error("Webhook signature verification error: {}", e.message, e)
            false
        }
    }

    /**
     * 从 eBay 公钥端点获取公钥, 带内存缓存。
     */
    private fun getEbayPublicKey(kid: String): String? {
        publicKeyCache[kid]?.let { return it }

        return try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("$EBAY_PUBLIC_KEY_URL$kid"))
                .GET()
                .build()

            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

            if (response.statusCode() == 200) {
                val body = objectMapper.readTree(response.body())
                val key = body.path("key").asText()
                if (key.isNotBlank()) {
                    publicKeyCache[kid] = key
                    log.info("Fetched and cached eBay public key for KID: {}", kid)
                    key
                } else null
            } else {
                log.warn("eBay public key fetch returned {}: {}", response.statusCode(), response.body())
                null
            }
        } catch (e: Exception) {
            log.error("Failed to fetch eBay public key for KID {}: {}", kid, e.message)
            null
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. 事件处理 (签名验证通过后)
    // ═══════════════════════════════════════════════════════════════

    /**
     * 处理 eBay 推送的 Webhook 事件。
     *
     * @param signatureHeader X-EBAY-SIGNATURE header
     * @param payload 请求体原文
     * @return true = 处理成功 (返回 200), false = 签名无效 (返回 412)
     */
    fun processNotification(signatureHeader: String, payload: String): Boolean {
        // 1. 签名验证
        if (!verifySignature(signatureHeader, payload)) {
            log.warn("Rejecting webhook: invalid signature")
            return false
        }

        // 2. 检查是否启用事件处理
        if (!webhookProps.enabled) {
            log.info("Webhook received but processing is DISABLED (ebay.webhook.enabled=false). Acknowledging only.")
            return true
        }

        // 3. 解析事件
        return try {
            val event = objectMapper.readTree(payload)
            val topic = event.path("metadata").path("topic").asText()
            val notificationId = event.path("notification").path("notificationId").asText()

            // 幂等检查 (Redis): SETNX — 首次写入返回 true, 重复返回 false
            if (notificationId.isNotBlank() && isAlreadyProcessed(notificationId)) {
                log.info("Duplicate notification ignored — id: {}", notificationId)
                return true
            }

            log.info("══════ Webhook Event ══════")
            log.info("  Topic: {}", topic)
            log.info("  NotificationId: {}", notificationId)

            // 4. 按事件主题分发
            when (topic) {
                "MARKETPLACE.ACCOUNT.DELETION" -> handleAccountDeletion(event)
                "ORDER.PURCHASE.CONFIRMED",
                "ORDER.ORDER_CONFIRMED" -> handleNewOrder(event)
                "ITEM.MARKED_SHIPPED",
                "ORDER.ITEM_MARKED_SHIPPED" -> handleItemShipped(event)
                "AUTHORIZATION.AUTHORIZATION_REVOKED" -> handleAuthRevocation(event)
                "MARKETPLACE.BEST_OFFER",
                "OFFER.BEST_OFFER_PLACED" -> handleBestOffer(event)
                else -> log.info("Unhandled webhook topic: {} — acknowledging without action", topic)
            }

            true
        } catch (e: Exception) {
            log.error("Webhook event processing error: {}", e.message, e)
            true  // 返回 200, 避免 eBay 无限重试有毒消息
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. Trading API Platform Notification 处理 (XML SOAP)
    // ═══════════════════════════════════════════════════════════════

    /**
     * 处理 Trading API Platform Notification (SOAP XML 格式)。
     *
     * eBay Trading API 的 Platform Notifications 使用 SOAP/XML 格式推送,
     * 与 REST Notification API (JSON) 完全不同。
     * Best Offer 事件仅通过 Platform Notification 推送。
     */
    fun processPlatformNotification(payload: String): Boolean {
        // Verify Platform Notification shared secret (if configured).
        // eBay includes the token in <RequesterCredentials><eBayAuthToken> within SOAP body.
        val expectedToken = webhookProps.platformNotificationToken
        if (expectedToken.isNotBlank()) {
            val tokenInPayload = extractCredentialsToken(payload)
            if (tokenInPayload == null || tokenInPayload != expectedToken) {
                log.warn("[Webhook] Platform Notification token mismatch, rejecting")
                return false
            }
        }

        return try {
            // 提取事件类型: <soapenv:Body><GetBestOffersResponse> or <BestOfferPlacedNotification>
            val eventType = extractPlatformEventType(payload)
            log.info("══════ Platform Notification ══════")
            log.info("  EventType: {}", eventType)

            when {
                eventType.contains("BestOffer", ignoreCase = true) -> {
                    parseBestOfferFromXml(payload)
                }
                eventType.contains("AskSellerQuestion", ignoreCase = true) ||
                eventType.contains("MyMessages", ignoreCase = true) -> {
                    parseMessageNotificationFromXml(payload)
                }
                else -> {
                    log.info("Unhandled Platform Notification type: {} — acknowledging", eventType)
                }
            }

            true
        } catch (e: Exception) {
            log.error("Platform notification processing error: {}", e.message, e)
            true  // Always return 200 to prevent eBay retries
        }
    }

    /**
     * 从 SOAP XML 中提取事件类型。
     */
    private fun extractPlatformEventType(xml: String): String {
        // Look for notification type in Body
        val bodyPattern = Regex("<soapenv:Body>\\s*<(\\w+)", RegexOption.DOT_MATCHES_ALL)
        val bodyMatch = bodyPattern.find(xml)
        if (bodyMatch != null) return bodyMatch.groupValues[1]

        // Fallback: look for any *Notification tag
        val notifPattern = Regex("<(\\w*(?:Notification|Response)\\w*)[\\s>]", RegexOption.DOT_MATCHES_ALL)
        val notifMatch = notifPattern.find(xml)
        if (notifMatch != null) return notifMatch.groupValues[1]

        return "Unknown"
    }

    /**
     * 从 Trading API Best Offer SOAP XML 通知中解析 offer 数据。
     *
     * 官方格式 (https://developer.ebay.com/api-docs/static/pn_best-offer.html):
     * <soapenv:Body>
     *   <GetBestOffersResponse>
     *     <NotificationEventName>BestOffer</NotificationEventName>
     *     <BestOfferArray>
     *       <BestOffer>
     *         <BestOfferID>...</BestOfferID>
     *         <Buyer><UserID>...</UserID><Email>...</Email></Buyer>
     *         <Currency>USD</Currency>
     *         <Price>0.5</Price>
     *         <Status>Pending</Status>
     *         <Quantity>1</Quantity>
     *         <ExpirationTime>...</ExpirationTime>
     *       </BestOffer>
     *     </BestOfferArray>
     *     <Item>
     *       <BuyItNowPrice>1.0</BuyItNowPrice>
     *       <Title>...</Title>
     *     </Item>
     *   </GetBestOffersResponse>
     * </soapenv:Body>
     */
    private fun parseBestOfferFromXml(xml: String) {
        // Extract from <BestOffer> block
        val bestOfferBlock = Regex(
            "<BestOffer>(.*?)</BestOffer>", RegexOption.DOT_MATCHES_ALL
        ).find(xml)?.groupValues?.get(1) ?: xml

        val bestOfferId = extractXml(bestOfferBlock, "BestOfferID") ?: ""
        val buyerUserId = extractXml(bestOfferBlock, "UserID") ?: "Unknown"
        val offerPrice = extractXml(bestOfferBlock, "Price")?.toDoubleOrNull() ?: 0.0
        val currency = extractXml(bestOfferBlock, "Currency") ?: "USD"
        val quantity = extractXml(bestOfferBlock, "Quantity")?.toIntOrNull() ?: 1
        val status = extractXml(bestOfferBlock, "Status") ?: "Pending"
        val expirationTime = extractXml(bestOfferBlock, "ExpirationTime")
        val buyerMessage = extractXml(bestOfferBlock, "BuyerMessage")
        val buyerEmail = extractXml(bestOfferBlock, "Email")

        // Extract from <Item> block
        val itemBlock = Regex(
            "<Item>(.*?)</Item>", RegexOption.DOT_MATCHES_ALL
        ).find(xml)?.groupValues?.get(1) ?: xml

        val itemTitle = extractXml(itemBlock, "Title") ?: ""
        val buyItNowPrice = extractXml(itemBlock, "BuyItNowPrice")?.toDoubleOrNull()
        val itemId = extractXml(xml, "ItemID") ?: ""

        // Resolve seller from listing cache (do NOT hardcode defaultSeller)
        val seller = resolveSellerForItem(itemId)

        // Event name for logging
        val eventName = extractXml(xml, "NotificationEventName") ?: "BestOffer"

        log.info("[Offer] Platform Notification [{}]: Best Offer -- item: {} '{}', buyer: {}, offer: {} {}, original: {} {}, qty: {}, seller: {}",
            eventName, itemId, itemTitle.take(40), buyerUserId, offerPrice, currency,
            buyItNowPrice ?: "?", currency, quantity, seller ?: "UNKNOWN")

        val offerInfo = OfferEventInfo(
            itemId = itemId,
            itemTitle = itemTitle,
            buyerUserId = buyerUserId,
            offerPrice = offerPrice,
            offerCurrency = currency,
            quantity = quantity,
            status = status,
            bestOfferId = bestOfferId,
            message = buyerMessage,
            seller = seller,
            buyItNowPrice = buyItNowPrice,
        )

        // ── Persist offer to database ──
        if (bestOfferId.isNotBlank()) {
            try {
                val existing = bestOfferRepo.findByBestOfferId(bestOfferId)
                if (existing != null) {
                    // Update status if changed (e.g. Pending → Accepted/Declined)
                    existing.status = status
                    existing.updatedAt = Instant.now()
                    bestOfferRepo.save(existing)
                    log.info("[Offer] Updated existing offer {} status → {}", bestOfferId, status)
                } else {
                    val entity = com.mgmt.modules.ebayapi.domain.model.EbayBestOffer(
                        bestOfferId = bestOfferId,
                        itemId = itemId,
                        seller = seller,
                        buyerUserId = buyerUserId,
                        buyerEmail = buyerEmail,
                        offerPrice = offerPrice.toBigDecimal(),
                        offerCurrency = currency,
                        buyItNowPrice = buyItNowPrice?.toBigDecimal(),
                        quantity = quantity,
                        status = status,
                        buyerMessage = buyerMessage,
                        itemTitle = itemTitle,
                        expirationTime = expirationTime?.let {
                            try { Instant.parse(it) } catch (_: Exception) { null }
                        },
                        eventName = eventName,
                    )
                    bestOfferRepo.save(entity)
                    log.info("[Offer] Saved new offer {} to database", bestOfferId)
                }
            } catch (e: Exception) {
                log.error("[Offer] Failed to persist offer {}: {}", bestOfferId, e.message)
            }
        }

        // Always broadcast to frontend (for UI display)
        saleBroadcaster.broadcastOffer(offerInfo)

        // Trigger auto-reply ONLY for new Pending offers
        // eBay also sends BestOfferDeclined/BestOfferAccepted notifications — skip those
        if (seller == null) {
            log.warn("[Offer] Skipping auto-reply for offer {} — seller unknown for item {}", bestOfferId, itemId)
        } else if (!status.equals("Pending", ignoreCase = true)) {
            log.info("[Offer] Skipping auto-reply for offer {} — status is '{}' (not Pending, likely eBay auto-decline)", bestOfferId, status)
        } else {
            autoOpsService.scheduleAutoReply(offerInfo)
        }
    }

    /**
     * 解析 AskSellerQuestion / MyMessages Platform Notification。
     *
     * eBay 买家发消息时通过 Trading API Platform Notification 推送:
     *   <soapenv:Body>
     *     <GetMyMessagesResponse> or <AskSellerQuestionNotification>
     *       <Message>
     *         <MessageID>...</MessageID>
     *         <Sender>buyer_id</Sender>
     *         <Subject>...</Subject>
     *         <Text>...</Text>
     *         <ItemID>...</ItemID>
     *         <ReceiveDate>...</ReceiveDate>
     *       </Message>
     *     </GetMyMessagesResponse>
     *   </soapenv:Body>
     */
    private fun parseMessageNotificationFromXml(xml: String) {
        val messageId = extractXml(xml, "MessageID")
        val senderUsername = extractXml(xml, "Sender") ?: extractXml(xml, "SenderID") ?: "Unknown"
        val recipientId = extractXml(xml, "RecipientUserID") ?: ""
        val subject = extractXml(xml, "Subject")
        val body = extractXml(xml, "Text")
        val itemId = extractXml(xml, "ItemID")
        val itemTitle = extractXml(xml, "ItemTitle")
        val receiveDateStr = extractXml(xml, "ReceiveDate")

        // Resolve seller: recipient is the seller for buyer-sent messages
        val seller = if (recipientId.isNotBlank()) {
            // Verify it's a known seller
            val known = sellerRepo.findAll().map { it.sellerUsername }
            if (recipientId in known) recipientId
            else if (itemId != null) resolveSellerForItem(itemId)
            else null
        } else if (itemId != null) {
            resolveSellerForItem(itemId)
        } else null

        log.info("[Message] Platform Notification: buyer={}, item={}, subject={}, seller={}",
            senderUsername, itemId, subject?.take(40), seller ?: "UNKNOWN")

        // Persist to database
        if (messageId != null) {
            try {
                val existing = messageRepo.findByMessageId(messageId)
                if (existing == null) {
                    val receivedAt = receiveDateStr?.let {
                        try { Instant.parse(it) } catch (_: Exception) { Instant.now() }
                    } ?: Instant.now()

                    messageRepo.save(com.mgmt.modules.ebayapi.domain.model.EbayMessage(
                        messageId = messageId,
                        sender = "BUYER",
                        senderUsername = senderUsername,
                        recipientUsername = seller ?: recipientId,
                        sellerUsername = seller ?: recipientId,
                        itemId = itemId,
                        itemTitle = itemTitle,
                        subject = subject,
                        body = body,
                        folderId = "0",
                        isRead = false,
                        flagged = false,
                        replied = false,
                        receivedAt = receivedAt,
                    ))
                    log.info("[Message] Saved new message {} from buyer {}", messageId, senderUsername)
                } else {
                    log.info("[Message] Message {} already exists, skipping", messageId)
                }
            } catch (e: Exception) {
                log.error("[Message] Failed to persist message {}: {}", messageId, e.message)
            }
        }

        // SSE broadcast to frontend
        saleBroadcaster.broadcastMessage(MessageEventInfo(
            messageId = messageId ?: "",
            sender = "BUYER",
            senderUsername = senderUsername,
            itemId = itemId,
            subject = subject,
            seller = seller,
        ))
    }

    /**
     * XML 值提取辅助 (Platform Notification 用)。
     */
    private fun extractXml(xml: String, tag: String): String? {
        val regex = Regex("<$tag[^>]*>(.*?)</$tag>", RegexOption.DOT_MATCHES_ALL)
        return regex.find(xml)?.groupValues?.get(1)?.trim()
    }

    /**
     * P0 — GDPR 账户删除请求 (法规强制)。
     */
    private fun handleAccountDeletion(event: JsonNode) {
        val userId = event.path("notification").path("data").path("userId").asText()
        log.warn("⚠️ GDPR Account Deletion requested for userId: {}. Manual review required.", userId)
    }

    /**
     * P1 — 新订单确认: 同步该订单的完整数据并生成 cleaned_transaction。
     *
     * 链路: Webhook → syncSingleOrder (拉 Order + Transactions) → transformDateRange (ETL)
     */
    private fun handleNewOrder(event: JsonNode) {
        val data = event.path("notification").path("data")
        val orderId = data.path("orderId").asText()

        if (orderId.isBlank()) {
            log.warn("ORDER event missing orderId, skipping")
            return
        }

        // Resolve seller from first line item in the order
        val firstItemId = data.path("lineItems").firstOrNull()
            ?.path("legacyItemId")?.asText(null)
            ?: data.path("lineItems").firstOrNull()?.path("itemId")?.asText(null)
        val seller = if (firstItemId != null) resolveSellerForItem(firstItemId) else null

        // Seller must be resolved — no fallback, no guessing (multi-account isolation)
        if (seller == null) {
            log.error("[Sale] Order {} — cannot resolve seller from lineItems. Skipping sync to prevent cross-account contamination.", orderId)
            return
        }
        val syncSeller = seller

        log.info("[Sale] Webhook: New order confirmed — orderId: {}, seller: {}", orderId, syncSeller)

        try {
            // 1. 同步该订单的 Fulfillment + Finances 数据
            val result = syncService.syncSingleOrder(syncSeller, orderId)
            log.info("[Sale] Sync result: {}", result)

            // 2. 触发 Transform 生成 cleaned_transaction
            val today = LocalDate.now(PST).toString()
            val cleaned = transformService.transformDateRange(today, today)
            log.info("[Sale] Webhook transform complete: {} cleaned rows for {}", cleaned, today)

            // 3. 更新时间戳
            lastSaleEventAt = Instant.now()

            // 4. 提取售出的具体 item 并通过 SSE 推送给前端
            broadcastSoldItems(orderId, data)

        } catch (e: Exception) {
            log.error("[Sale] Webhook order sync failed for {}: {}", orderId, e.message, e)
        }
    }

    /**
     * 从订单数据中提取售出的 lineItems 并通过 SSE 推送给前端 Listing 页面。
     *
     * 前端收到后只更新对应 itemId 的行 (soldQuantity +N, availableQuantity -N)。
     */
    private fun broadcastSoldItems(orderId: String, data: JsonNode) {
        try {
            // 从 Webhook 事件的 data 中获取 lineItems,
            // 如果事件不包含则从已同步的数据库查询
            val soldItems = mutableListOf<SoldItemInfo>()

            val lineItems = data.path("lineItems")
            if (lineItems.isArray && lineItems.size() > 0) {
                for (li in lineItems) {
                    val itemId = li.path("legacyItemId").asText(
                        li.path("itemId").asText("")
                    )
                    if (itemId.isBlank()) continue
                    soldItems.add(SoldItemInfo(
                        itemId = itemId,
                        sku = li.path("sku").asText(null),
                        title = li.path("title").asText(null),
                        quantitySold = li.path("quantity").asInt(1),
                        orderId = orderId,
                    ))
                }
            }

            // 如果事件中没有 lineItems, 从已存储的订单增补
            if (soldItems.isEmpty()) {
                val orderItems = syncService.getOrderLineItems(orderId)
                for (oi in orderItems) {
                    soldItems.add(SoldItemInfo(
                        itemId = oi["legacyItemId"]?.toString() ?: continue,
                        sku = oi["sku"]?.toString(),
                        title = oi["title"]?.toString(),
                        quantitySold = (oi["quantity"] as? Int) ?: 1,
                        orderId = orderId,
                    ))
                }
            }

            if (soldItems.isNotEmpty()) {
                // Resolve seller from first sold item
                val logSeller = resolveSellerForItem(soldItems.first().itemId) ?: "unknown"

                saleBroadcaster.broadcastSale(logSeller, soldItems)
                log.info("[Sale] Broadcast {} sold items to Listing page: {}",
                    soldItems.size, soldItems.map { it.itemId })

                // Log webhook order event
                actionLog.logWebhookOrder(
                    seller = logSeller,
                    orderId = orderId,
                    soldItems = soldItems.map { mapOf(
                        "itemId" to it.itemId,
                        "sku" to (it.sku ?: ""),
                        "quantitySold" to it.quantitySold,
                    ) },
                    durationMs = 0,
                )

                // Trigger auto-restock (delayed 15s)
                autoOpsService.scheduleAutoRestock(soldItems)
            }
        } catch (e: Exception) {
            log.warn("[Sale] Failed to broadcast sold items: {}", e.message)
        }
    }

    /**
     * P1 — 物品已发货: 更新订单物流状态。
     *
     * 链路: Webhook → refreshOrderStatus (拉最新 Order 数据, 更新 fulfillment_status)
     */
    private fun handleItemShipped(event: JsonNode) {
        val data = event.path("notification").path("data")
        val orderId = data.path("orderId").asText()

        if (orderId.isBlank()) {
            log.warn("ITEM_MARKED_SHIPPED event missing orderId, skipping")
            return
        }

        // Seller must be resolved — no fallback, no guessing (multi-account isolation)
        val firstItemId = data.path("lineItems").firstOrNull()
            ?.path("legacyItemId")?.asText(null)
            ?: data.path("lineItems").firstOrNull()?.path("itemId")?.asText(null)
        val seller = if (firstItemId != null) resolveSellerForItem(firstItemId) else null
        if (seller == null) {
            log.error("[Restock] Shipped order {} — cannot resolve seller. Skipping to prevent cross-account contamination.", orderId)
            return
        }
        val syncSeller = seller

        log.info("[Restock] Webhook: Item shipped — orderId: {}, seller: {}", orderId, syncSeller)

        try {
            val updated = syncService.refreshOrderStatus(syncSeller, orderId)
            if (updated) {
                log.info("[Restock] Order {} fulfillment status updated successfully", orderId)
            } else {
                log.warn("[Restock] Failed to update order {} status, will be caught by daily sync", orderId)
            }
        } catch (e: Exception) {
            log.error("[Restock] Webhook shipment update failed for {}: {}", orderId, e.message, e)
        }
    }

    /**
     * P1 — OAuth 授权被撤销: 记录告警。
     */
    private fun handleAuthRevocation(event: JsonNode) {
        val data = event.path("notification").path("data")
        val userId = data.path("userId").asText()
        val revokedBy = data.path("revokedBy").asText("UNKNOWN")
        log.error("🔴 Webhook: Authorization REVOKED — userId: {}, revokedBy: {}", userId, revokedBy)
    }

    // ─── 辅助方法 ───────────────────────────────────────────────

    /**
     * P1 — Best Offer 事件: 买家对 listing 发起了 Best Offer。
     *
     * 链路: Webhook → 解析 offer 数据 → SSE 推送到前端 Offer 页面
     */
    private fun handleBestOffer(event: JsonNode) {
        try {
        val data = event.path("notification").path("data")
        val itemId = data.path("itemId").asText(
            data.path("legacyItemId").asText("")
        )
        val buyerUserId = data.path("buyerUserId").asText(
            data.path("buyer").path("username").asText("Unknown")
        )
        val offerPrice = data.path("price").path("value").asDouble(
            data.path("offerPrice").path("value").asDouble(0.0)
        )
        val offerCurrency = data.path("price").path("currency").asText(
            data.path("offerPrice").path("currency").asText("USD")
        )
        val quantity = data.path("quantity").asInt(1)
        val bestOfferId = data.path("bestOfferId").asText(
            data.path("offerId").asText("")
        )
        val status = data.path("status").asText(
            data.path("bestOfferStatus").asText("Pending")
        )
        val message = data.path("buyerMessage").asText(null)
        val itemTitle = data.path("title").asText(
            data.path("itemTitle").asText("")
        )

        // Resolve seller from listing cache (don't hardcode defaultSeller)
        val seller = resolveSellerForItem(itemId)

        // Try to get buyItNowPrice from listing cache if not in webhook
        val buyItNowPrice = if (seller != null) {
            try {
                val cached = listingCacheRepo.findByItemIdAndSeller(itemId, seller)
                if (cached != null) {
                    val cachedJson = objectMapper.readTree(cached.data)
                    cachedJson.path("currentPrice").asDouble(0.0).takeIf { it > 0 }
                } else null
            } catch (_: Exception) { null }
        } else null

        log.info("[Offer] Webhook: Best Offer received -- itemId: {}, buyer: {}, price: {} {}, qty: {}, seller: {}, buyItNow: {}",
            itemId, buyerUserId, offerPrice, offerCurrency, quantity, seller ?: "UNKNOWN", buyItNowPrice ?: "?")

        // Broadcast to frontend via SSE
        val offerInfo = OfferEventInfo(
            itemId = itemId,
            itemTitle = itemTitle,
            buyerUserId = buyerUserId,
            offerPrice = offerPrice,
            offerCurrency = offerCurrency,
            quantity = quantity,
            status = status,
            bestOfferId = bestOfferId,
            message = message,
            seller = seller,
            buyItNowPrice = buyItNowPrice,
        )

        // ── Persist offer to database (same as parseBestOfferFromXml) ──
        if (bestOfferId.isNotBlank()) {
            try {
                val existing = bestOfferRepo.findByBestOfferId(bestOfferId)
                if (existing != null) {
                    existing.status = status
                    existing.updatedAt = Instant.now()
                    bestOfferRepo.save(existing)
                    log.info("[Offer] Updated existing offer {} status → {}", bestOfferId, status)
                } else {
                    val entity = com.mgmt.modules.ebayapi.domain.model.EbayBestOffer(
                        bestOfferId = bestOfferId,
                        itemId = itemId,
                        seller = seller,
                        buyerUserId = buyerUserId,
                        offerPrice = offerPrice.toBigDecimal(),
                        offerCurrency = offerCurrency,
                        buyItNowPrice = buyItNowPrice?.toBigDecimal(),
                        quantity = quantity,
                        status = status,
                        buyerMessage = message,
                        itemTitle = itemTitle,
                        eventName = "BestOffer",
                    )
                    bestOfferRepo.save(entity)
                    log.info("[Offer] Saved new offer {} to database", bestOfferId)
                }
            } catch (e: Exception) {
                log.error("[Offer] Failed to persist offer {}: {}", bestOfferId, e.message)
            }
        }

        saleBroadcaster.broadcastOffer(offerInfo)

        // Trigger auto-reply ONLY for new Pending offers
        if (seller == null) {
            log.warn("[Offer] Skipping auto-reply for offer {} — seller unknown for item {}", bestOfferId, itemId)
        } else if (!status.equals("Pending", ignoreCase = true)) {
            log.info("[Offer] Skipping auto-reply for offer {} — status is '{}' (not Pending, likely eBay auto-decline)", bestOfferId, status)
        } else {
            autoOpsService.scheduleAutoReply(offerInfo)
        }
        } catch (e: Exception) {
            log.error("[Offer] handleBestOffer failed: {}", e.message, e)
        }
    }

    /**
     * Redis-based idempotency check: returns true if this notification was already processed.
     * Uses SETNX + 24h TTL — key exists = already processed, first write = new notification.
     */
    private fun isAlreadyProcessed(notificationId: String): Boolean {
        return redis.opsForValue().setIfAbsent(
            "webhook:processed:$notificationId", "1", Duration.ofHours(24)
        ) == false // false = key already existed = already processed
    }

    /**
     * Extract the auth token from SOAP RequesterCredentials block.
     * eBay Platform Notifications include the token in:
     *   <RequesterCredentials><eBayAuthToken>TOKEN</eBayAuthToken></RequesterCredentials>
     */
    private fun extractCredentialsToken(xml: String): String? {
        return extractXml(xml, "eBayAuthToken")
    }

    /**
     * Resolve the actual seller username for a given itemId by looking up the listing cache.
     * Returns null if not found — callers must handle unknown seller explicitly.
     */
    private fun resolveSellerForItem(itemId: String): String? {
        if (itemId.isBlank()) return null
        return try {
            val cached = listingCacheRepo.findByItemId(itemId).firstOrNull()
            if (cached != null) {
                cached.seller
            } else {
                log.warn("[Offer] Could not resolve seller for itemId {} — item not in listing cache", itemId)
                null
            }
        } catch (e: Exception) {
            log.warn("[Offer] Error looking up seller for itemId {}: {}", itemId, e.message)
            null
        }
    }
}
