package com.mgmt.modules.ebayapi.application.service

import com.mgmt.modules.ebayapi.application.config.EbayOAuthProperties
import com.mgmt.modules.ebayapi.domain.model.EbaySellerAccount
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.RestTemplate
import java.time.Instant
import java.util.Base64

/**
 * EbayOAuthService — eBay OAuth 2.0 Token 管理。
 *
 * 凭证 (client_id, client_secret, ru_name) 来自 application.yml / 环境变量，
 * 不从数据库或用户输入获取。
 *
 * 流程:
 *   1. 前端点击「连接 eBay」→ 后端生成 OAuth URL → 前端 redirect 到 eBay
 *   2. 用户在 eBay 授权 → eBay redirect 到 callback URL
 *   3. 前端 callback 页面把 code 提交到后端 → 后端换取 token
 *   4. 后端自动刷新 access_token (2 小时过期)
 */
@Service
class EbayOAuthService(
    private val sellerRepo: EbaySellerAccountRepository,
    private val ebayProps: EbayOAuthProperties,
) {
    private val log = LoggerFactory.getLogger(EbayOAuthService::class.java)
    private val restTemplate = RestTemplate()

    companion object {
        private const val EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize"
        private const val EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"

        // All scopes — must match eBay RuName configuration exactly
        private val REQUIRED_SCOPES = listOf(
            "https://api.ebay.com/oauth/api_scope",
            "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.marketing",
            "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.inventory",
            "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.account",
            "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
            "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.finances",
            "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
            "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.reputation",
            "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
            "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
            "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.stores",
            "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
            "https://api.ebay.com/oauth/scope/sell.edelivery",
            "https://api.ebay.com/oauth/api_scope/commerce.vero",
            "https://api.ebay.com/oauth/api_scope/sell.inventory.mapping",
            "https://api.ebay.com/oauth/api_scope/commerce.message",
            "https://api.ebay.com/oauth/api_scope/commerce.feedback",
            "https://api.ebay.com/oauth/api_scope/commerce.shipping",
        )
    }

    /**
     * 生成 eBay OAuth 授权 URL。
     * 前端拿到后直接 window.location.href 跳转。
     */
    fun generateAuthUrl(): String {
        val scopes = REQUIRED_SCOPES.joinToString(" ")
        return "$EBAY_AUTH_URL?" +
            "client_id=${ebayProps.clientId}&" +
            "redirect_uri=${ebayProps.ruName}&" +
            "response_type=code&" +
            "scope=$scopes"
    }

    /**
     * 处理 eBay OAuth 回调 — 交换 authorization_code → tokens。
     *
     * 首次连接时自动创建 seller account 记录。
     *
     * @param authorizationCode eBay 回调中的 code 参数
     */
    @Transactional
    fun handleCallback(authorizationCode: String): EbaySellerAccount {
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            set("Authorization", "Basic ${encodeCredentials()}")
        }

        val body = LinkedMultiValueMap<String, String>().apply {
            add("grant_type", "authorization_code")
            add("code", authorizationCode)
            add("redirect_uri", ebayProps.ruName)
        }

        val response = restTemplate.exchange(
            EBAY_TOKEN_URL,
            HttpMethod.POST,
            HttpEntity(body, headers),
            Map::class.java,
        )

        if (!response.statusCode.is2xxSuccessful || response.body == null) {
            log.error("OAuth token exchange failed: {}", response.statusCode)
            throw RuntimeException("OAuth token exchange failed: ${response.statusCode}")
        }

        val tokenData = response.body!!
        val accessToken = tokenData["access_token"] as? String
            ?: throw RuntimeException("No access_token in response")
        val refreshToken = tokenData["refresh_token"] as? String
        val expiresIn = (tokenData["expires_in"] as? Number)?.toLong() ?: 7200

        // Fetch eBay user identity using the new token
        val sellerUsername = fetchEbayUsername(accessToken) ?: "ebay_seller_${System.currentTimeMillis()}"

        // Find existing or create new
        val account = sellerRepo.findBySellerUsername(sellerUsername) ?: EbaySellerAccount(
            sellerUsername = sellerUsername,
            clientId = ebayProps.clientId,
            clientSecret = "",  // Don't store secret in DB — it's in env vars
            redirectUri = ebayProps.redirectUri,
        )

        account.accessToken = accessToken
        account.refreshToken = refreshToken
        account.tokenScopes = REQUIRED_SCOPES.joinToString(" ")
        account.tokenExpiry = Instant.now().plusSeconds(expiresIn)
        account.status = "authorized"
        account.updatedAt = Instant.now()
        sellerRepo.save(account)

        log.info("OAuth callback successful for seller: {}", sellerUsername)
        return account
    }

    /**
     * 获取有效的 access_token。如果过期则自动用 refresh_token 刷新。
     */
    @Transactional
    fun getValidAccessToken(sellerUsername: String): String {
        val account = sellerRepo.findBySellerUsername(sellerUsername)
            ?: throw IllegalArgumentException("Seller account not found: $sellerUsername")

        if (!account.isAuthorized()) {
            throw IllegalStateException("Seller $sellerUsername is not authorized. Please complete OAuth flow first.")
        }

        if (!account.isTokenExpired()) {
            return account.accessToken!!
        }

        log.info("Access token expired for {}, refreshing...", sellerUsername)
        return refreshAccessToken(account)
    }

    /**
     * 手动刷新 token (供 controller 调用)
     */
    @Transactional
    fun manualRefreshToken(sellerUsername: String): EbaySellerAccount {
        val account = sellerRepo.findBySellerUsername(sellerUsername)
            ?: throw IllegalArgumentException("Seller account not found: $sellerUsername")
        refreshAccessToken(account)
        return sellerRepo.findBySellerUsername(sellerUsername)!!
    }

    /**
     * 用 access_token 获取当前 eBay 用户名。
     */
    private fun fetchEbayUsername(accessToken: String): String? {
        return try {
            val headers = HttpHeaders().apply {
                setBearerAuth(accessToken)
            }
            val response = restTemplate.exchange(
                "https://apiz.ebay.com/commerce/identity/v1/user",
                HttpMethod.GET,
                HttpEntity<Void>(headers),
                Map::class.java,
            )
            if (response.statusCode.is2xxSuccessful && response.body != null) {
                response.body!!["username"] as? String
            } else null
        } catch (e: Exception) {
            log.warn("Failed to fetch eBay username: {}", e.message)
            null
        }
    }

    /**
     * 用 refresh_token 刷新 access_token。
     */
    private fun refreshAccessToken(account: EbaySellerAccount): String {
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            set("Authorization", "Basic ${encodeCredentials()}")
        }

        val body = LinkedMultiValueMap<String, String>().apply {
            add("grant_type", "refresh_token")
            add("refresh_token", account.refreshToken)
            add("scope", REQUIRED_SCOPES.joinToString(" "))
        }

        val response = restTemplate.exchange(
            EBAY_TOKEN_URL,
            HttpMethod.POST,
            HttpEntity(body, headers),
            Map::class.java,
        )

        if (response.statusCode.is2xxSuccessful && response.body != null) {
            val tokenData = response.body!!
            val newAccessToken = tokenData["access_token"] as? String
                ?: throw RuntimeException("No access_token in refresh response")

            val expiresIn = (tokenData["expires_in"] as? Number)?.toLong() ?: 7200

            account.accessToken = newAccessToken
            account.tokenExpiry = Instant.now().plusSeconds(expiresIn)
            account.updatedAt = Instant.now()
            sellerRepo.save(account)

            log.info("Token refreshed for seller: {}, expires in {}s", account.sellerUsername, expiresIn)
            return newAccessToken
        } else {
            account.status = "expired"
            account.updatedAt = Instant.now()
            sellerRepo.save(account)

            log.error("Token refresh failed for {}: {}. Marking as expired.", account.sellerUsername, response.statusCode)
            throw RuntimeException("Token refresh failed for ${account.sellerUsername}. Re-authorization required.")
        }
    }

    /**
     * Base64 encode client_id:client_secret for Basic auth header.
     * Uses app-level credentials from config, not per-account.
     */
    private fun encodeCredentials(): String {
        val credentials = "${ebayProps.clientId}:${ebayProps.clientSecret}"
        return Base64.getEncoder().encodeToString(credentials.toByteArray(Charsets.UTF_8))
    }
}
