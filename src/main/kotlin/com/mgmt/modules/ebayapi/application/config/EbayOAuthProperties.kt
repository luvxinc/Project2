package com.mgmt.modules.ebayapi.application.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

/**
 * eBay OAuth 配置 — 从 application.yml 读取。
 *
 * 所有 eBay 应用级凭证集中在此处，不再由用户在前端输入。
 */
@ConfigurationProperties(prefix = "ebay.oauth")
data class EbayOAuthProperties(
    val clientId: String = "",
    val clientSecret: String = "",
    val ruName: String = "",
    val redirectUri: String = "",
)

@Configuration
@EnableConfigurationProperties(EbayOAuthProperties::class)
class EbayOAuthConfig
