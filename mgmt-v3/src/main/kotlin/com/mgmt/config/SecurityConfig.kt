package com.mgmt.config

import com.mgmt.modules.auth.JwtAuthenticationFilter
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

/**
 * Spring Security Configuration — V3 Phase 1
 *
 * - Stateless JWT (no sessions)
 * - CORS configured via environment variable
 * - Public endpoints: health, login, refresh, OpenAPI docs
 * - All other endpoints require JWT authentication
 * - JWT filter registered before UsernamePasswordAuthenticationFilter
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
class SecurityConfig(
    private val jwtAuthenticationFilter: JwtAuthenticationFilter,
) {
    @Value("\${mgmt.security.cors.allowed-origins:http://localhost:3000}")
    private lateinit var allowedOrigins: String

    @Value("\${spring.profiles.active:prod}")
    private lateinit var activeProfile: String

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .cors { it.configurationSource(corsConfigurationSource()) }
            .csrf { it.disable() }  // JWT-based, no CSRF needed
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { auth ->
                auth
                    // CORS preflight — must be permitted before any auth check
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    // Public endpoints (paths are relative to context-path /api/v1)
                    .requestMatchers("/health", "/actuator/health").permitAll()
                    .requestMatchers("/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                    .requestMatchers(HttpMethod.POST, "/auth/login", "/auth/refresh").permitAll()
                    // All other endpoints require authentication
                    .anyRequest().authenticated()
            }
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter::class.java)
            .exceptionHandling { ex ->
                // Return 401 JSON instead of Spring's default 403 for unauthenticated requests
                ex.authenticationEntryPoint { _, response, _ ->
                    response.status = 401
                    response.contentType = "application/json"
                    response.writer.write("""{"type":"unauthorized","title":"Unauthorized","status":401,"detail":"Authentication required"}""")
                }
            }
            .headers { headers ->
                headers
                    .frameOptions { it.deny() }
                    .contentTypeOptions { }
                    .xssProtection { }
            }

        return http.build()
    }

    @Bean
    fun passwordEncoder(): BCryptPasswordEncoder {
        return BCryptPasswordEncoder(12)  // cost factor 12
    }

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val config = CorsConfiguration()

        // Explicit origins from config (production use)
        val explicitOrigins = allowedOrigins.split(",").map { it.trim() }

        // In dev: also allow all private network IPs (RFC 1918) on any port
        // This enables LAN access without hardcoding IPs
        val lanPatterns = listOf(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "http://192.168.*:*",   // Home/office LAN
            "http://10.*:*",        // Corporate LAN
            "http://172.16.*:*", "http://172.17.*:*", "http://172.18.*:*",
            "http://172.19.*:*", "http://172.20.*:*", "http://172.21.*:*",
            "http://172.22.*:*", "http://172.23.*:*", "http://172.24.*:*",
            "http://172.25.*:*", "http://172.26.*:*", "http://172.27.*:*",
            "http://172.28.*:*", "http://172.29.*:*", "http://172.30.*:*",
            "http://172.31.*:*",    // Docker bridge
        )

        // Use patterns (supports wildcards) instead of exact origins
        val patterns = explicitOrigins.toMutableList()
        if (activeProfile == "dev") {
            patterns.addAll(lanPatterns)
        }
        config.allowedOriginPatterns = patterns.distinct()

        config.allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        config.allowedHeaders = listOf(
            "Authorization", "Content-Type", "X-Trace-Id",
            "X-Security-Code", "X-Security-Level"
        )
        config.exposedHeaders = listOf("X-Trace-Id", "Content-Disposition")
        config.allowCredentials = true
        config.maxAge = 3600

        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration("/**", config)
        return source
    }
}
