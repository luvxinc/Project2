package com.mgmt.config

import com.mgmt.common.response.ApiResponse
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import javax.sql.DataSource

/**
 * Health check endpoint — lightweight, no auth required.
 * Reports service, database, and Redis connectivity.
 */
@RestController
class HealthController(
    private val dataSource: DataSource,
    private val redisConnectionFactory: RedisConnectionFactory,
) {

    @GetMapping("/health")
    fun health(): ApiResponse<Map<String, Any>> {
        val dbStatus = try {
            dataSource.connection.use { it.isValid(2) }
            "connected"
        } catch (_: Exception) {
            "disconnected"
        }

        val redisStatus = try {
            redisConnectionFactory.connection.use { it.ping() }
            "connected"
        } catch (_: Exception) {
            "disconnected"
        }

        val overallStatus = if (dbStatus == "connected" && redisStatus == "connected") "UP" else "DEGRADED"

        return ApiResponse(
            data = mapOf(
                "status" to overallStatus,
                "version" to "3.0.0",
                "timestamp" to Instant.now().toString(),
                "service" to "esplus-erp",
                "components" to mapOf(
                    "database" to dbStatus,
                    "redis" to redisStatus,
                )
            )
        )
    }
}
