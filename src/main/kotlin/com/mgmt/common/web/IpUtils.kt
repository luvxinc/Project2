package com.mgmt.common.web

import jakarta.servlet.http.HttpServletRequest

/**
 * IP extraction utility — eliminates V2's INFRA-1 (duplicated getClientIP across 5 files).
 *
 * Supports proxy headers:
 * - X-Forwarded-For (first entry)
 * - X-Real-IP
 * - Falls back to remoteAddr
 */
object IpUtils {

    fun extractClientIp(request: HttpServletRequest): String {
        val forwarded = request.getHeader("X-Forwarded-For")
        if (!forwarded.isNullOrBlank()) {
            return forwarded.split(",").first().trim()
        }

        val realIp = request.getHeader("X-Real-IP")
        if (!realIp.isNullOrBlank()) {
            return realIp.trim()
        }

        return request.remoteAddr ?: "unknown"
    }
}
