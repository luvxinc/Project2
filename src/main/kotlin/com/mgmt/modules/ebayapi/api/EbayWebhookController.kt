package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.service.EbayWebhookService
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * EbayWebhookController — eBay Webhook 接收端点。
 *
 * 端点路径: /api/v1/ebay/webhook
 *
 * 两种请求:
 *   1. GET  — eBay 注册 Webhook 时的 Challenge-Response 验证
 *   2. POST — eBay 推送事件通知 (订单/发货/退款等)
 *
 * 安全:
 *   - 此端点在 SecurityConfig 中标记为 permitAll (免 JWT 认证)
 *   - POST 请求通过 ECDSA P-256 签名验证防伪造
 *   - GET 请求通过 Challenge-Response 机制防伪造
 */
@RestController
@RequestMapping("/ebay/webhook")
class EbayWebhookController(
    private val webhookService: EbayWebhookService,
) {
    private val log = LoggerFactory.getLogger(EbayWebhookController::class.java)

    /**
     * GET /ebay/webhook?challenge_code=xxx
     *
     * eBay 验证端点 — 注册 Webhook 时 eBay 发送 GET 请求。
     * 返回 challengeResponse = SHA256(challengeCode + verificationToken + endpointUrl)
     *
     * 响应必须是 200 OK, Content-Type: application/json
     */
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun handleChallenge(
        @RequestParam("challenge_code") challengeCode: String,
    ): ResponseEntity<Map<String, String>> {
        log.info("eBay Webhook challenge received (code={}...)", challengeCode.take(8))

        val response = webhookService.computeChallengeResponse(challengeCode)
        return ResponseEntity.ok(mapOf("challengeResponse" to response))
    }

    /**
     * POST /ebay/webhook
     *
     * eBay 事件推送 — 接收 Webhook 通知。
     *
     * 处理流程:
     *   1. 提取 X-EBAY-SIGNATURE header
     *   2. 验证 ECDSA P-256 签名
     *   3. 解析事件类型并触发对应的数据同步
     *
     * 响应:
     *   - 200 OK: 签名验证通过, 事件已处理 (或已确认但未处理)
     *   - 412 Precondition Failed: 签名验证失败, 拒绝处理
     */
    @PostMapping
    fun handleNotification(
        @RequestHeader(value = "X-EBAY-SIGNATURE", required = false) signature: String?,
        @RequestBody payload: String,
    ): ResponseEntity<Void> {
        // Check if this is a Trading API Platform Notification (XML SOAP)
        if (payload.trimStart().startsWith("<?xml") || payload.trimStart().startsWith("<soapenv:")) {
            log.info("Received Trading API Platform Notification (XML)")
            val processed = webhookService.processPlatformNotification(payload)
            return if (processed) {
                ResponseEntity.ok().build()
            } else {
                ResponseEntity.status(HttpStatus.BAD_REQUEST).build()
            }
        }

        // REST Notification API (JSON + signature)
        if (signature.isNullOrBlank()) {
            log.warn("Webhook POST rejected: missing X-EBAY-SIGNATURE header")
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).build()
        }

        // 委托给 service 处理 (签名验证 + 事件分发)
        val processed = webhookService.processNotification(signature, payload)

        return if (processed) {
            ResponseEntity.ok().build()
        } else {
            ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).build()
        }
    }
}
