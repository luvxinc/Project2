package com.mgmt.config

import com.mgmt.common.response.ApiResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

/**
 * Health check endpoint — lightweight, no auth required.
 */
@RestController
class HealthController {

    @GetMapping("/health")
    fun health(): ApiResponse<Map<String, Any>> {
        return ApiResponse(
            data = mapOf(
                "status" to "UP",
                "version" to "3.0.0",
                "timestamp" to Instant.now().toString(),
                "service" to "mgmt-v3"
            )
        )
    }
}
