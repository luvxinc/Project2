package com.mgmt.modules.ebayapi.application.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

/**
 * eBay Webhook 配置 — 从 application.yml 读取。
 *
 * - verificationToken: eBay Developer Portal 中生成的 verification token
 * - endpointUrl: 我方 Webhook 接收端点的完整公网 URL
 * - enabled: 是否启用 Webhook 事件处理 (关闭时仅响应 challenge 但不处理事件)
 */
@ConfigurationProperties(prefix = "ebay.webhook")
data class EbayWebhookProperties(
    val verificationToken: String = "",
    val endpointUrl: String = "",
    val enabled: Boolean = false,
)

@Configuration
@EnableConfigurationProperties(EbayWebhookProperties::class)
class EbayWebhookConfig
