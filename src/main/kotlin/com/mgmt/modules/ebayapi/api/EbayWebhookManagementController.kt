package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.config.EbayWebhookProperties
import com.mgmt.modules.ebayapi.application.service.EbayOAuthService
import com.mgmt.modules.ebayapi.application.service.EbayWebhookService
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.web.bind.annotation.*
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestTemplate
import java.time.Instant

/**
 * EbayWebhookManagementController — Webhook 订阅管理端点。
 *
 * 路径: /api/v1/ebay/sync/webhook/...  (复用 /ebay/sync 前缀，受 JWT 保护)
 *
 * 功能:
 *   - 查看当前 Webhook 配置状态
 *   - 列出 eBay 可用的通知主题
 *   - 创建/管理通知目的地 (destination)
 *   - 创建/管理通知订阅 (subscription)
 *   - 测试 Challenge-Response
 */
@RestController
@RequestMapping("/ebay/sync/webhook")
class EbayWebhookManagementController(
    private val webhookService: EbayWebhookService,
    private val webhookProps: EbayWebhookProperties,
    private val oauthService: EbayOAuthService,
) {
    private val log = LoggerFactory.getLogger(EbayWebhookManagementController::class.java)
    private val restTemplate = RestTemplate()

    companion object {
        private const val EBAY_NOTIFICATION_BASE = "https://api.ebay.com/commerce/notification/v1"
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. 状态查看
    // ═══════════════════════════════════════════════════════════════

    /**
     * GET /api/v1/ebay/sync/webhook/status
     * 查看当前 Webhook 配置状态。
     */
    @GetMapping("/status")
    fun getStatus(): ResponseEntity<Map<String, Any>> {
        return ResponseEntity.ok(mapOf(
            "endpointUrl" to webhookProps.endpointUrl,
            "enabled" to webhookProps.enabled,
            "verificationTokenSet" to webhookProps.verificationToken.isNotBlank(),
            "timestamp" to Instant.now().toString(),
        ))
    }

    /**
     * GET /api/v1/ebay/sync/webhook/test-challenge
     * 本地测试 Challenge-Response 计算 (不需要 eBay 介入)。
     */
    @GetMapping("/test-challenge")
    fun testChallenge(
        @RequestParam(defaultValue = "test_challenge_123") code: String,
    ): ResponseEntity<Map<String, String>> {
        val response = webhookService.computeChallengeResponse(code)
        return ResponseEntity.ok(mapOf(
            "challengeCode" to code,
            "challengeResponse" to response,
            "endpointUrl" to webhookProps.endpointUrl,
        ))
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. eBay Notification API — 主题/目的地/订阅管理
    // ═══════════════════════════════════════════════════════════════

    /**
     * GET /api/v1/ebay/sync/webhook/topics
     * 列出 eBay 所有可订阅的通知主题。
     */
    @GetMapping("/topics")
    fun listTopics(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)

        return try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/topic",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            ResponseEntity.ok(response.body)
        } catch (e: HttpClientErrorException) {
            log.error("Failed to list topics: {} {}", e.statusCode, e.responseBodyAsString)
            ResponseEntity.status(e.statusCode).body(mapOf("error" to e.responseBodyAsString))
        }
    }

    /**
     * GET /api/v1/ebay/sync/webhook/destinations
     * 列出已注册的通知目的地。
     */
    @GetMapping("/destinations")
    fun listDestinations(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)

        return try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/destination?limit=100",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            ResponseEntity.ok(response.body)
        } catch (e: HttpClientErrorException) {
            log.error("Failed to list destinations: {} {}", e.statusCode, e.responseBodyAsString)
            ResponseEntity.status(e.statusCode).body(mapOf("error" to e.responseBodyAsString))
        }
    }

    /**
     * POST /api/v1/ebay/sync/webhook/destinations
     * 创建通知目的地 (Webhook URL)。
     *
     * eBay 会向该 URL 发送 GET challenge 验证,
     * 我们的 EbayWebhookController 会自动响应。
     */
    @PostMapping("/destinations")
    fun createDestination(
        @RequestParam(defaultValue = "espartsplus") seller: String,
        @RequestParam(defaultValue = "ESPLUS ERP Webhook") name: String,
    ): ResponseEntity<Any> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)
        headers.contentType = MediaType.APPLICATION_JSON

        val body = """
        {
            "name": "$name",
            "status": "ENABLED",
            "deliveryConfig": {
                "endpoint": "${webhookProps.endpointUrl}",
                "verificationToken": "${webhookProps.verificationToken}"
            }
        }
        """.trimIndent()

        return try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/destination",
                HttpMethod.POST,
                HttpEntity(body, headers),
                String::class.java,
            )
            log.info("Destination created successfully: {}", response.statusCode)

            // 从 Location header 提取 destination ID
            val location = response.headers.location?.toString()
            ResponseEntity.status(response.statusCode).body(mapOf(
                "message" to "Destination created",
                "location" to (location ?: "N/A"),
                "status" to response.statusCode.value(),
            ))
        } catch (e: HttpClientErrorException) {
            log.error("Failed to create destination: {} {}", e.statusCode, e.responseBodyAsString)
            ResponseEntity.status(e.statusCode).body(mapOf("error" to e.responseBodyAsString))
        }
    }

    /**
     * POST /api/v1/ebay/sync/webhook/subscriptions
     * 为指定的主题创建订阅。
     *
     * @param topicId  eBay 主题 ID (从 /topics 端点获取)
     * @param destinationId  目的地 ID (从 /destinations 端点获取)
     */
    @PostMapping("/subscriptions")
    fun createSubscription(
        @RequestParam(defaultValue = "espartsplus") seller: String,
        @RequestParam topicId: String,
        @RequestParam destinationId: String,
    ): ResponseEntity<Any> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)
        headers.contentType = MediaType.APPLICATION_JSON

        val body = """
        {
            "topicId": "$topicId",
            "status": "ENABLED",
            "destinationId": "$destinationId",
            "payload": {
                "format": "JSON",
                "schemaVersion": "1.0",
                "deliveryProtocol": "HTTPS"
            }
        }
        """.trimIndent()

        return try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/subscription",
                HttpMethod.POST,
                HttpEntity(body, headers),
                String::class.java,
            )
            log.info("Subscription created for topic {}: {}", topicId, response.statusCode)
            ResponseEntity.status(response.statusCode).body(mapOf(
                "message" to "Subscription created",
                "topicId" to topicId,
                "destinationId" to destinationId,
                "status" to response.statusCode.value(),
            ))
        } catch (e: HttpClientErrorException) {
            log.error("Failed to create subscription: {} {}", e.statusCode, e.responseBodyAsString)
            ResponseEntity.status(e.statusCode).body(mapOf("error" to e.responseBodyAsString))
        }
    }

    /**
     * GET /api/v1/ebay/sync/webhook/subscriptions
     * 列出所有已创建的订阅。
     */
    @GetMapping("/subscriptions")
    fun listSubscriptions(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Any> {
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)

        return try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/subscription?limit=100",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            ResponseEntity.ok(response.body)
        } catch (e: HttpClientErrorException) {
            log.error("Failed to list subscriptions: {} {}", e.statusCode, e.responseBodyAsString)
            ResponseEntity.status(e.statusCode).body(mapOf("error" to e.responseBodyAsString))
        }
    }

    /**
     * POST /api/v1/ebay/sync/webhook/quick-setup
     *
     * 一键快速设置 — 自动创建目的地 + 为核心事件创建订阅。
     * 需要后端已在公网运行以通过 eBay challenge 验证。
     *
     * 核心事件: MARKETPLACE.ACCOUNT.DELETION (P0 法规强制)
     */
    @PostMapping("/quick-setup")
    fun quickSetup(
        @RequestParam(defaultValue = "espartsplus") seller: String,
    ): ResponseEntity<Map<String, Any>> {
        val results = mutableMapOf<String, Any>()
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)
        headers.contentType = MediaType.APPLICATION_JSON

        // Step 1: 创建 Destination
        log.info("Quick setup — Step 1: Creating destination...")
        val destBody = """
        {
            "name": "ESPLUS ERP Webhook",
            "status": "ENABLED",
            "deliveryConfig": {
                "endpoint": "${webhookProps.endpointUrl}",
                "verificationToken": "${webhookProps.verificationToken}"
            }
        }
        """.trimIndent()

        val destinationId: String? = try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/destination",
                HttpMethod.POST,
                HttpEntity(destBody, headers),
                String::class.java,
            )
            val location = response.headers.location?.toString() ?: ""
            val id = location.substringAfterLast("/")
            results["destination"] = mapOf("status" to "created", "id" to id)
            log.info("Destination created: {}", id)
            id
        } catch (e: HttpClientErrorException) {
            val errorBody = e.responseBodyAsString
            results["destination"] = mapOf("status" to "error", "detail" to errorBody)
            log.error("Destination creation failed: {}", errorBody)
            // 如果是 409 Conflict，说明已存在，尝试获取
            if (e.statusCode == HttpStatus.CONFLICT) {
                results["destination"] = mapOf("status" to "already_exists")
                tryGetExistingDestinationId(accessToken)
            } else null
        }

        if (destinationId.isNullOrBlank()) {
            results["summary"] = "Failed: could not create or find destination"
            return ResponseEntity.ok(results)
        }

        // Step 2: 列出可用主题, 找到核心事件的 topicId
        log.info("Quick setup — Step 2: Finding topic IDs...")
        val topicsResult = try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/topic",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            // 简单解析 — 从响应中提取我们需要的主题
            val body = response.body ?: ""
            results["topicsRaw"] = body
            "ok"
        } catch (e: Exception) {
            log.error("Failed to list topics: {}", e.message)
            results["topics"] = mapOf("status" to "error", "detail" to (e.message ?: ""))
            "error"
        }
        results["topicsFetchStatus"] = topicsResult

        results["destinationId"] = destinationId
        results["summary"] = "Destination ready. Use POST /subscriptions?topicId=xxx&destinationId=$destinationId to subscribe."
        results["nextSteps"] = listOf(
            "1. Review topics at GET /ebay/sync/webhook/topics",
            "2. Create subscriptions: POST /ebay/sync/webhook/subscriptions?topicId=<id>&destinationId=$destinationId",
            "3. Subscribe to Best Offer: POST /ebay/sync/webhook/subscribe-best-offer?destinationId=$destinationId",
            "4. Once stable, set EBAY_WEBHOOK_ENABLED=true to enable event processing",
        )

        return ResponseEntity.ok(results)
    }

    /**
     * POST /api/v1/ebay/sync/webhook/subscribe-best-offer
     *
     * 一键订阅 Best Offer 事件 — 自动查找 topic ID 并创建订阅。
     */
    @PostMapping("/subscribe-best-offer")
    fun subscribeBestOffer(
        @RequestParam(defaultValue = "espartsplus") seller: String,
        @RequestParam destinationId: String,
    ): ResponseEntity<Map<String, Any>> {
        val results = mutableMapOf<String, Any>()
        val accessToken = oauthService.getValidAccessToken(seller)
        val headers = buildHeaders(accessToken)

        // Step 1: 查找 Best Offer topic
        log.info("Searching for Best Offer topic...")
        val topicId = try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/topic",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            val body = response.body ?: ""
            // Look for BestOffer topic in the response
            val bestOfferPattern = """"topicId"\s*:\s*"([^"]*(?:[Bb]est[_\s]?[Oo]ffer)[^"]*)"""".toRegex()
            val match = bestOfferPattern.find(body)
            if (match != null) {
                match.groupValues[1]
            } else {
                // Fallback: search more broadly
                val allTopics = """"topicId"\s*:\s*"([^"]+)"""".toRegex().findAll(body)
                allTopics.map { it.groupValues[1] }
                    .firstOrNull { it.contains("OFFER", ignoreCase = true) || it.contains("BestOffer", ignoreCase = true) }
            }
        } catch (e: Exception) {
            log.error("Failed to search topics: {}", e.message)
            null
        }

        if (topicId == null) {
            results["error"] = "Could not find Best Offer topic in available topics"
            results["hint"] = "Use GET /ebay/sync/webhook/topics to list all topics manually"
            return ResponseEntity.ok(results)
        }

        results["foundTopicId"] = topicId
        log.info("Found Best Offer topic: {}", topicId)

        // Step 2: 创建订阅
        headers.contentType = MediaType.APPLICATION_JSON
        val subscriptionBody = """
        {
            "topicId": "$topicId",
            "status": "ENABLED",
            "destinationId": "$destinationId",
            "payload": {
                "format": "JSON",
                "schemaVersion": "1.0",
                "deliveryProtocol": "HTTPS"
            }
        }
        """.trimIndent()

        try {
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/subscription",
                HttpMethod.POST,
                HttpEntity(subscriptionBody, headers),
                String::class.java,
            )
            results["subscription"] = mapOf("status" to "created", "topicId" to topicId, "httpStatus" to response.statusCode.value())
            log.info("Best Offer subscription created: topic={}, destination={}", topicId, destinationId)
        } catch (e: HttpClientErrorException) {
            val errorBody = e.responseBodyAsString
            results["subscription"] = mapOf("status" to "error", "detail" to errorBody)
            log.error("Failed to create Best Offer subscription: {}", errorBody)
        }

        return ResponseEntity.ok(results)
    }

    // ─── 辅助方法 ───────────────────────────────────────────────

    private fun buildHeaders(accessToken: String): HttpHeaders {
        return HttpHeaders().apply {
            setBearerAuth(accessToken)
        }
    }

    /**
     * 尝试从已有的 destination 列表中获取第一个 destination ID。
     */
    private fun tryGetExistingDestinationId(accessToken: String): String? {
        return try {
            val headers = buildHeaders(accessToken)
            val response = restTemplate.exchange(
                "$EBAY_NOTIFICATION_BASE/destination?limit=10",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                String::class.java,
            )
            val body = response.body ?: return null
            // 简单提取 destinationId — 在 JSON 中查找
            val regex = """"destinationId"\s*:\s*"([^"]+)"""".toRegex()
            val match = regex.find(body)
            match?.groupValues?.get(1)
        } catch (e: Exception) {
            log.error("Failed to get existing destinations: {}", e.message)
            null
        }
    }
}
