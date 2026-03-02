package com.mgmt.modules.ebayapi.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.ebayapi.application.service.EbayOAuthService
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestTemplate

/**
 * EbayPostOrderService — Shared client for eBay Post-Order API v2.
 *
 * Covers: Cancellation, Return, Inquiry, Case management actions.
 * Auth: TOKEN {accessToken} (NOT Bearer).
 *
 * This is a public/reusable service. All post-order API interactions should go through here.
 */
@Service
class EbayPostOrderService(
    private val oauthService: EbayOAuthService,
) {
    private val log = LoggerFactory.getLogger(EbayPostOrderService::class.java)
    private val restTemplate = RestTemplate()
    private val mapper = ObjectMapper()

    companion object {
        private const val POST_ORDER_BASE = "https://api.ebay.com/post-order/v2"
    }

    data class PostOrderResult(
        val success: Boolean,
        val statusCode: Int? = null,
        val responseBody: String? = null,
        val errorMessage: String? = null,
    )

    // ═══════════════════════════════════════════════
    // Cancellation Actions
    // ═══════════════════════════════════════════════

    /**
     * Approve (confirm) a buyer cancellation request.
     *
     * POST /post-order/v2/cancellation/{cancelId}/approve
     */
    fun approveCancellation(seller: String, cancelId: String): PostOrderResult {
        val accessToken = oauthService.getValidAccessToken(seller)
        val url = "$POST_ORDER_BASE/cancellation/$cancelId/approve"

        return executePostOrder(
            label = "approveCancellation",
            url = url,
            accessToken = accessToken,
            seller = seller,
            cancelId = cancelId,
        )
    }

    /**
     * Reject a buyer cancellation request.
     *
     * POST /post-order/v2/cancellation/{cancelId}/reject
     */
    fun rejectCancellation(seller: String, cancelId: String): PostOrderResult {
        val accessToken = oauthService.getValidAccessToken(seller)
        val url = "$POST_ORDER_BASE/cancellation/$cancelId/reject"

        return executePostOrder(
            label = "rejectCancellation",
            url = url,
            accessToken = accessToken,
            seller = seller,
            cancelId = cancelId,
        )
    }

    // ═══════════════════════════════════════════════
    // Generic Post-Order Execution
    // ═══════════════════════════════════════════════

    private fun executePostOrder(
        label: String,
        url: String,
        accessToken: String,
        seller: String,
        cancelId: String,
        body: Any? = null,
    ): PostOrderResult {
        val headers = HttpHeaders().apply {
            set("Authorization", "TOKEN $accessToken")
            contentType = MediaType.APPLICATION_JSON
            accept = listOf(MediaType.APPLICATION_JSON)
            set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US")
        }

        val entity = if (body != null) {
            HttpEntity(mapper.writeValueAsString(body), headers)
        } else {
            HttpEntity<String>(null, headers)
        }

        return try {
            val response = EbayApiUtils.callWithRetry(label = label) {
                restTemplate.exchange(
                    java.net.URI.create(url),
                    HttpMethod.POST,
                    entity,
                    String::class.java,
                )
            }

            val ok = response.statusCode.is2xxSuccessful
            log.info("[PostOrder] {} seller={} cancelId={} status={} ok={}",
                label, seller, cancelId, response.statusCode.value(), ok)

            PostOrderResult(
                success = ok,
                statusCode = response.statusCode.value(),
                responseBody = response.body,
            )
        } catch (e: HttpClientErrorException) {
            log.error("[PostOrder] {} seller={} cancelId={} HTTP {} — {}",
                label, seller, cancelId, e.statusCode.value(), e.responseBodyAsString)
            PostOrderResult(
                success = false,
                statusCode = e.statusCode.value(),
                responseBody = e.responseBodyAsString,
                errorMessage = e.message,
            )
        } catch (e: Exception) {
            log.error("[PostOrder] {} seller={} cancelId={} error: {}",
                label, seller, cancelId, e.message, e)
            PostOrderResult(
                success = false,
                errorMessage = e.message,
            )
        }
    }
}
