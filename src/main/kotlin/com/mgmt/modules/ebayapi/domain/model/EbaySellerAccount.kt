package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * EbaySellerAccount — eBay OAuth 卖家账户。
 *
 * 每个 eBay 卖家账户独立认证, 支持多店铺。
 * OAuth 流程: 用户在系统中添加账户 → 跳转 eBay 授权 → 回调写入 refresh_token。
 */
@Entity
@Table(name = "seller_accounts", schema = "ebay_api")
class EbaySellerAccount(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "seller_username", nullable = false, unique = true, length = 100)
    var sellerUsername: String = "",

    @Column(name = "display_name", length = 200)
    var displayName: String? = null,

    // OAuth Application Credentials
    @Column(name = "client_id", nullable = false, length = 200)
    var clientId: String = "",

    @Column(name = "client_secret", nullable = false, length = 200)
    var clientSecret: String = "",

    @Column(name = "redirect_uri", length = 500)
    var redirectUri: String? = null,

    // OAuth User Token
    @Column(name = "refresh_token", columnDefinition = "text")
    var refreshToken: String? = null,

    @Column(name = "access_token", columnDefinition = "text")
    var accessToken: String? = null,

    @Column(name = "token_expiry")
    var tokenExpiry: Instant? = null,

    @Column(name = "token_scopes", columnDefinition = "text")
    var tokenScopes: String? = null,

    // Status
    @Column(name = "status", nullable = false, length = 30)
    var status: String = "pending",  // pending/authorized/expired/revoked

    @Column(name = "last_sync_at")
    var lastSyncAt: Instant? = null,

    @Column(name = "environment", nullable = false, length = 20)
    var environment: String = "PRODUCTION",

    // Audit
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 100)
    var createdBy: String? = null,
) {
    /**
     * Access Token 是否已过期 (或即将在 5 分钟内过期)
     */
    fun isTokenExpired(): Boolean {
        val expiry = tokenExpiry ?: return true
        return Instant.now().plusSeconds(300).isAfter(expiry)
    }

    /**
     * 是否已完成 OAuth 授权
     */
    fun isAuthorized(): Boolean = status == "authorized" && !refreshToken.isNullOrBlank()
}
