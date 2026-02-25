package com.mgmt.common.security

import com.mgmt.modules.auth.JwtTokenProvider
import org.springframework.security.core.context.SecurityContextHolder

/**
 * Extract the current authenticated username from SecurityContext.
 * Falls back to "system" if no JWT claims are present.
 *
 * Usage: call `SecurityUtils.currentUsername()` from any controller or service.
 */
object SecurityUtils {
    fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
