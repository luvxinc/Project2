package com.mgmt.modules.ebayapi.application.dto

import java.time.Instant

/**
 * eBay API module DTOs
 */

// ── Response ──

data class SellerAccountResponse(
    val id: Long,
    val sellerUsername: String,
    val displayName: String?,
    val status: String,
    val environment: String,
    val lastSyncAt: Instant?,
    val tokenExpiry: Instant?,
    val hasRefreshToken: Boolean,
    val createdAt: Instant,
)

// ── OAuth Flow ──

data class OAuthCallbackRequest(
    val code: String,
)

data class AuthUrlResponse(
    val authUrl: String,
)
