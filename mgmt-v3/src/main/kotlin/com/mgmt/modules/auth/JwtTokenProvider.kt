package com.mgmt.modules.auth

import io.jsonwebtoken.*
import io.jsonwebtoken.security.Keys
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.*
import javax.crypto.SecretKey

/**
 * JWT Token Provider — sign & verify.
 *
 * AUTH-1 Fix: Token contains only {sub, name, roles} (~200B).
 *             Permissions are cached in Redis, not in the token.
 * AUTH-2 Fix: Uses SecureRandom for refresh token generation.
 */
@Component
class JwtTokenProvider(
    @Value("\${mgmt.jwt.secret}") private val jwtSecret: String,
    @Value("\${mgmt.jwt.access-token-expiry:3600}") private val accessTokenExpirationSec: Long,
    @Value("\${mgmt.jwt.refresh-token-expiry:604800}") private val refreshTokenExpirationSec: Long,
) {
    private val log = LoggerFactory.getLogger(JwtTokenProvider::class.java)
    private val key: SecretKey by lazy {
        require(jwtSecret.length >= 32) { "JWT secret must be at least 32 characters" }
        Keys.hmacShaKeyFor(jwtSecret.toByteArray())
    }
    private val secureRandom = SecureRandom()

    data class TokenClaims(
        val userId: String,
        val username: String,
        val roles: List<String>,
    )

    /**
     * Generate access token — small payload (~200B vs V2's ~2KB)
     */
    fun generateAccessToken(userId: String, username: String, roles: List<String>): String {
        val now = Date()
        val expiry = Date(now.time + accessTokenExpirationSec * 1000)
        return Jwts.builder()
            .subject(userId)
            .claim("name", username)
            .claim("roles", roles)
            .issuedAt(now)
            .expiration(expiry)
            .signWith(key)
            .compact()
    }

    /**
     * Parse and validate access token.
     */
    fun parseToken(token: String): TokenClaims? {
        return try {
            val claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .payload
            TokenClaims(
                userId = claims.subject,
                username = claims["name"] as? String ?: "",
                roles = (claims["roles"] as? List<*>)?.map { it.toString() } ?: emptyList(),
            )
        } catch (e: ExpiredJwtException) {
            log.debug("JWT expired: {}", e.message)
            null
        } catch (e: JwtException) {
            log.warn("JWT invalid: {}", e.message)
            null
        }
    }

    /**
     * Generate cryptographically secure refresh token value (fixes AUTH-2).
     */
    fun generateRefreshTokenValue(): String {
        val bytes = ByteArray(48)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    /** Access token TTL in seconds */
    fun getAccessTokenExpirationSec(): Long = accessTokenExpirationSec

    /** Refresh token TTL in seconds */
    fun getRefreshTokenExpirationSec(): Long = refreshTokenExpirationSec
}
