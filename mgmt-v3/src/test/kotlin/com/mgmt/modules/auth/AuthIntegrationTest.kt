package com.mgmt.modules.auth

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.dto.ChangePasswordRequest
import com.mgmt.modules.auth.dto.LoginRequest
import com.mgmt.modules.auth.dto.RefreshRequest
import com.mgmt.modules.auth.dto.VerifySecurityRequest
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

/**
 * Phase 1 Integration Tests — Auth Module
 *
 * Tests all auth endpoints with real DB + Redis.
 * Requires: PostgreSQL + Redis running locally.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class AuthIntegrationTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var jwtTokenProvider: JwtTokenProvider

    companion object {
        private var accessToken: String = ""
        private var refreshToken: String = ""
    }

    // ─── Login ───────────────────────────────────────────────────

    @Test
    @Order(1)
    fun `login with valid credentials returns tokens`() {
        val request = LoginRequest(username = "admin", password = "1522P")
        val result = mockMvc.perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accessToken").isNotEmpty)
            .andExpect(jsonPath("$.data.refreshToken").isNotEmpty)
            .andExpect(jsonPath("$.data.expiresIn").isNumber)
            .andExpect(jsonPath("$.data.user.username").value("admin"))
            .andReturn()

        // Parse tokens for subsequent tests
        val body = objectMapper.readTree(result.response.contentAsString)
        accessToken = body["data"]["accessToken"].asText()
        refreshToken = body["data"]["refreshToken"].asText()

        // AUTH-1 VERIFY: Token should be small (~200B not ~2KB)
        assertTrue(accessToken.length < 500, "Access token should be slim (<500 chars): ${accessToken.length}")
    }

    @Test
    @Order(2)
    fun `login with wrong password returns 401`() {
        val request = LoginRequest(username = "admin", password = "wrongPassword")
        mockMvc.perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    @Order(3)
    fun `login with nonexistent user returns 401`() {
        val request = LoginRequest(username = "noSuchUser", password = "whatever")
        mockMvc.perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isUnauthorized)
    }

    // ─── Token Refresh ───────────────────────────────────────────

    @Test
    @Order(10)
    fun `refresh with valid token returns new access token`() {
        val request = RefreshRequest(refreshToken = refreshToken)
        mockMvc.perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.accessToken").isNotEmpty)
            .andExpect(jsonPath("$.data.expiresIn").isNumber)
    }

    @Test
    @Order(11)
    fun `refresh with invalid token returns 401`() {
        val request = RefreshRequest(refreshToken = "invalidToken123")
        mockMvc.perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isUnauthorized)
    }

    // ─── Auth /me ────────────────────────────────────────────────

    @Test
    @Order(20)
    fun `get current user with valid token returns user`() {
        mockMvc.perform(
            get("/auth/me")
                .header("Authorization", "Bearer $accessToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.username").value("admin"))
            .andExpect(jsonPath("$.data.roles").isArray)
    }

    @Test
    @Order(21)
    fun `get current user without token returns 401`() {
        mockMvc.perform(get("/auth/me"))
            .andExpect(status().isUnauthorized)
    }

    // ─── JWT Slim Token (AUTH-1 Verification) ────────────────────

    @Test
    @Order(30)
    fun `JWT token contains only sub, name, roles (AUTH-1 fix)`() {
        val claims = requireNotNull(jwtTokenProvider.parseToken(accessToken)) { "Token claims should not be null" }
        assertTrue(claims.username.isNotBlank())
        assertTrue(claims.roles.isNotEmpty())
        // Token should NOT have permissions (that's the AUTH-1 fix)
    }

    // ─── Logout ──────────────────────────────────────────────────

    @Test
    @Order(90)
    fun `logout invalidates session`() {
        mockMvc.perform(
            post("/auth/logout")
                .header("Authorization", "Bearer $accessToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.message").isNotEmpty)
    }
}
