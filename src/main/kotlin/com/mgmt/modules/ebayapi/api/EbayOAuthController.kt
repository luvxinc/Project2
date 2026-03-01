package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.dto.*
import com.mgmt.modules.ebayapi.application.service.EbayOAuthService
import com.mgmt.modules.ebayapi.domain.model.EbaySellerAccount
import com.mgmt.modules.ebayapi.domain.repository.EbaySellerAccountRepository
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * EbayOAuthController — eBay OAuth 管理。
 *
 * 简化流程 (凭证在环境变量中):
 *   1. GET  /api/v1/ebay/auth-url       → 获取 eBay 授权跳转 URL
 *   2. 前端 redirect 到 eBay → 用户登录授权
 *   3. eBay redirect 回 callback URL → 前端抓取 code
 *   4. POST /api/v1/ebay/callback        → 提交 code, 自动创建/更新 seller
 *   5. GET  /api/v1/ebay/sellers         → 查看所有已连接账户
 */
@RestController
@RequestMapping("/ebay")
class EbayOAuthController(
    private val sellerRepo: EbaySellerAccountRepository,
    private val oauthService: EbayOAuthService,
) {
    private val log = LoggerFactory.getLogger(EbayOAuthController::class.java)

    /**
     * 获取 eBay OAuth 授权 URL — 前端直接 redirect。
     */
    @GetMapping("/auth-url")
    fun getAuthUrl(): ResponseEntity<AuthUrlResponse> {
        val authUrl = oauthService.generateAuthUrl()
        return ResponseEntity.ok(AuthUrlResponse(authUrl = authUrl))
    }

    /**
     * 处理 eBay OAuth 回调 — 接收 authorization_code, 换取 token。
     * 自动根据 eBay identity API 创建 seller 记录。
     */
    @PostMapping("/callback")
    fun handleCallback(@RequestBody request: OAuthCallbackRequest): ResponseEntity<SellerAccountResponse> {
        val account = oauthService.handleCallback(request.code)
        return ResponseEntity.ok(account.toResponse())
    }

    /**
     * 获取所有已连接的卖家账户
     */
    @GetMapping("/sellers")
    fun listSellers(): ResponseEntity<List<SellerAccountResponse>> {
        val sellers = sellerRepo.findAll().map { it.toResponse() }
        return ResponseEntity.ok(sellers)
    }

    /**
     * 获取单个卖家账户详情
     */
    @GetMapping("/sellers/{sellerUsername}")
    fun getSeller(@PathVariable sellerUsername: String): ResponseEntity<SellerAccountResponse> {
        val account = sellerRepo.findBySellerUsername(sellerUsername)
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(account.toResponse())
    }

    /**
     * 断开（删除）卖家账户
     */
    @DeleteMapping("/sellers/{sellerUsername}")
    fun deleteSeller(@PathVariable sellerUsername: String): ResponseEntity<Void> {
        val account = sellerRepo.findBySellerUsername(sellerUsername)
            ?: return ResponseEntity.notFound().build()
        sellerRepo.delete(account)
        log.info("Seller account disconnected: {}", sellerUsername)
        return ResponseEntity.noContent().build()
    }

    /**
     * 手动刷新 token
     */
    @PostMapping("/sellers/{sellerUsername}/refresh-token")
    fun refreshToken(@PathVariable sellerUsername: String): ResponseEntity<SellerAccountResponse> {
        val account = oauthService.manualRefreshToken(sellerUsername)
        return ResponseEntity.ok(account.toResponse())
    }

    private fun EbaySellerAccount.toResponse() = SellerAccountResponse(
        id = id,
        sellerUsername = sellerUsername,
        displayName = displayName,
        status = status,
        environment = environment,
        lastSyncAt = lastSyncAt,
        tokenExpiry = tokenExpiry,
        hasRefreshToken = !refreshToken.isNullOrBlank(),
        createdAt = createdAt,
    )
}
