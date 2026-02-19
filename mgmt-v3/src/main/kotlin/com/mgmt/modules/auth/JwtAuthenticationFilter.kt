package com.mgmt.modules.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * JWT Authentication Filter — intercepts every request,
 * extracts Bearer token, validates, and sets SecurityContext.
 *
 * Sliding Session: on every authenticated request, extends the
 * Redis session TTL so active users are never logged out.
 */
@Component
class JwtAuthenticationFilter(
    private val jwtTokenProvider: JwtTokenProvider,
    private val sessionService: SessionService,
) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
    ) {
        val token = extractToken(request)
        if (token != null) {
            val claims = jwtTokenProvider.parseToken(token)
            if (claims != null) {
                val authorities = claims.roles.map { SimpleGrantedAuthority("ROLE_$it") }
                val auth = UsernamePasswordAuthenticationToken(claims, null, authorities)
                SecurityContextHolder.getContext().authentication = auth

                // Sliding session: reset idle timer on every authenticated interaction
                sessionService.touchSession(claims.userId)
            }
        }
        chain.doFilter(request, response)
    }

    private fun extractToken(request: HttpServletRequest): String? {
        val header = request.getHeader("Authorization") ?: return null
        return if (header.startsWith("Bearer ")) header.substring(7) else null
    }
}
