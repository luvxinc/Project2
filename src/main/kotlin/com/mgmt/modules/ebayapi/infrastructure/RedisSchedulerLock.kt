package com.mgmt.modules.ebayapi.infrastructure

import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.UUID

/**
 * Simple Redis-based distributed lock for @Scheduled methods.
 * Uses SETNX + TTL to ensure only one instance runs a scheduled task at a time.
 */
@Component
class RedisSchedulerLock(
    private val redis: StringRedisTemplate,
) {
    private val log = LoggerFactory.getLogger(RedisSchedulerLock::class.java)
    private val instanceId = UUID.randomUUID().toString()

    /**
     * Try to acquire a distributed lock.
     *
     * @param lockKey unique key for this scheduled task
     * @param ttl how long the lock is held (should be >= task duration)
     * @return true if lock acquired, false if another instance holds it
     */
    fun tryLock(lockKey: String, ttl: Duration): Boolean {
        val acquired = redis.opsForValue().setIfAbsent(lockKey, instanceId, ttl) ?: false
        if (!acquired) {
            log.info("[SchedulerLock] Lock {} held by another instance, skipping", lockKey)
        }
        return acquired
    }

    /**
     * Release a lock (only if we are the owner).
     */
    fun unlock(lockKey: String) {
        val current = redis.opsForValue().get(lockKey)
        if (current == instanceId) {
            redis.delete(lockKey)
        }
    }
}
