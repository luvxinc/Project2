package com.mgmt.common.security

import com.mgmt.common.web.IpUtils
import jakarta.servlet.http.HttpServletRequest
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

/**
 * RateLimitAspect — AOP implementation for @RateLimit.
 *
 *
 * Uses Redis sliding-window counter:
 *   Key: rate:{key}:{identifier}  (identifier = IP or userId)
 *   TTL: windowSeconds
 *
 * Returns 429 Too Many Requests when exceeded.
 */
@Aspect
@Component
class RateLimitAspect(
    private val redis: StringRedisTemplate,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        private const val RATE_PREFIX = "rate:"
    }

    @Around("@annotation(com.mgmt.common.security.RateLimit)")
    fun checkRateLimit(joinPoint: ProceedingJoinPoint): Any? {
        val method = (joinPoint.signature as MethodSignature).method
        val annotation = method.getAnnotation(RateLimit::class.java)

        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request
            ?: return joinPoint.proceed() // No request context, skip rate limiting

        val identifier = if (annotation.byIp) {
            IpUtils.extractClientIp(request)
        } else {
            extractUserIdFromArgs(joinPoint) ?: IpUtils.extractClientIp(request)
        }

        val redisKey = "$RATE_PREFIX${annotation.key}:$identifier"
        val count = redis.opsForValue().increment(redisKey) ?: 1

        if (count == 1L) {
            redis.expire(redisKey, Duration.ofSeconds(annotation.windowSeconds.toLong()))
        }

        if (count > annotation.maxAttempts) {
            val ttl = redis.getExpire(redisKey)
            log.warn(
                "Rate limit exceeded for key={}, identifier={}, count={}/{}, retry after {}s",
                annotation.key, identifier, count, annotation.maxAttempts, ttl
            )
            throw ResponseStatusException(
                HttpStatus.TOO_MANY_REQUESTS,
                "Too many requests. Please try again in ${ttl}s."
            )
        }

        return joinPoint.proceed()
    }

    /**
     * Try to extract userId from method arguments (for user-based rate limiting).
     * Looks for HttpServletRequest and tries to extract from JWT.
     */
    @Suppress("UNUSED_PARAMETER")
    private fun extractUserIdFromArgs(joinPoint: ProceedingJoinPoint): String? {
        // For now, fall back to IP-based. User-based limiting can be
        // implemented when specific endpoints require it.
        return null
    }
}
