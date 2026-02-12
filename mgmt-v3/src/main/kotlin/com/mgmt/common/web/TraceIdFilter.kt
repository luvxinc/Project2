package com.mgmt.common.web

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/**
 * Trace ID Filter — assigns a unique ID to each request.
 *
 * Equivalent to V2's TraceIdMiddleware.
 * - Prioritizes incoming X-Trace-Id header (for cross-service tracing)
 * - Generates UUID if none provided
 * - Sets on request attribute + response header
 * - Also records request start time
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class TraceIdFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val traceId = request.getHeader("X-Trace-Id")
            ?: UUID.randomUUID().toString().replace("-", "").take(16)

        request.setAttribute("traceId", traceId)
        request.setAttribute("requestStartTime", System.currentTimeMillis())

        response.setHeader("X-Trace-Id", traceId)

        filterChain.doFilter(request, response)
    }
}
