package com.mgmt.common.web

import jakarta.servlet.FilterChain
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.io.ByteArrayInputStream

/**
 * RequestBodyCachingFilter — caches request body for repeated reads.
 *
 * Purpose:
 *   SecurityLevelAspect (AOP) needs to read sec_code_l0..l4 from the JSON body
 *   BEFORE Spring's @RequestBody processes it. Without caching, the InputStream
 *   is consumed once and the controller would get an empty body.
 *
 *   This filter eagerly reads and caches the full body, then provides a
 *   CachedBodyRequestWrapper that returns a fresh InputStream on each call.
 *
 * Ordering:
 *   Must run BEFORE JwtAuthenticationFilter. Set to HIGHEST_PRECEDENCE + 5.
 *
 * V3 Architecture: §7.3 security requirements — AOP security code extraction
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
class RequestBodyCachingFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (isBodyRequest(request)) {
            val cachedBody = request.inputStream.readBytes()
            val wrappedRequest = CachedBodyRequestWrapper(request, cachedBody)
            filterChain.doFilter(wrappedRequest, response)
        } else {
            filterChain.doFilter(request, response)
        }
    }

    private fun isBodyRequest(request: HttpServletRequest): Boolean {
        return request.method in setOf("POST", "PUT", "PATCH")
    }
}

/**
 * Request wrapper that caches the body bytes and allows repeated reads.
 * Each call to getInputStream() returns a fresh ByteArrayInputStream.
 */
class CachedBodyRequestWrapper(
    request: HttpServletRequest,
    private val cachedBody: ByteArray,
) : HttpServletRequestWrapper(request) {

    override fun getInputStream(): ServletInputStream {
        return CachedServletInputStream(cachedBody)
    }

    override fun getReader(): java.io.BufferedReader {
        return java.io.BufferedReader(java.io.InputStreamReader(getInputStream(), characterEncoding ?: "UTF-8"))
    }

    override fun getContentLength(): Int = cachedBody.size
    override fun getContentLengthLong(): Long = cachedBody.size.toLong()

    /**
     * Expose cached bytes for direct access (used by SecurityLevelAspect).
     */
    fun getContentAsByteArray(): ByteArray = cachedBody
}

/**
 * ServletInputStream backed by a byte array — supports isReady/isFinished for Servlet 3.1+.
 */
private class CachedServletInputStream(body: ByteArray) : ServletInputStream() {
    private val delegate = ByteArrayInputStream(body)

    override fun read(): Int = delegate.read()
    override fun read(b: ByteArray, off: Int, len: Int): Int = delegate.read(b, off, len)
    override fun isFinished(): Boolean = delegate.available() == 0
    override fun isReady(): Boolean = true
    override fun setReadListener(listener: ReadListener?) {
        throw UnsupportedOperationException("Async not supported for cached body")
    }
}
