package com.mgmt.common.security

/**
 * RateLimit — method-level rate limiting annotation.
 *
 * Processed by [RateLimitAspect].
 *
 * @param key Key prefix for rate limit counter (e.g., "auth:login", "auth:verify")
 * @param maxAttempts Maximum attempts within the window
 * @param windowSeconds Time window in seconds
 * @param byIp If true, rate limit by IP. If false, rate limit by user.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RateLimit(
    val key: String,
    val maxAttempts: Int = 5,
    val windowSeconds: Int = 300,
    val byIp: Boolean = true,
)
