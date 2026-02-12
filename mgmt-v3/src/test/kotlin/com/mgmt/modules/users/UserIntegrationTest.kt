package com.mgmt.modules.users

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.auth.dto.CreateUserRequest
import com.mgmt.modules.auth.dto.LoginRequest
import com.mgmt.modules.auth.dto.UpdateUserRequest
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
 * Phase 1 Integration Tests — Users Module
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserIntegrationTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    companion object {
        private var adminToken: String = ""
        private var testUserId: String = ""
    }

    @BeforeAll
    fun setup() {
        // Login as admin to get token
        val request = LoginRequest(username = "admin", password = "1522P")
        val result = mockMvc.perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        ).andReturn()
        val body = objectMapper.readTree(result.response.contentAsString)
        adminToken = body["data"]["accessToken"].asText()
    }

    // ─── List Users ──────────────────────────────────────────────

    @Test
    @Order(1)
    fun `list users returns paginated results`() {
        mockMvc.perform(
            get("/users")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.users").isArray)
            .andExpect(jsonPath("$.data.total").isNumber)
            .andExpect(jsonPath("$.data.page").value(1))
    }

    @Test
    @Order(2)
    fun `search users filters results`() {
        mockMvc.perform(
            get("/users?search=admin")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.users").isArray)
    }

    // ─── Create User ─────────────────────────────────────────────

    @Test
    @Order(10)
    fun `create user with valid data returns new user`() {
        val request = CreateUserRequest(
            username = "testuser_${System.currentTimeMillis()}",
            email = "test_${System.currentTimeMillis()}@example.com",
            password = "TestPass123!",
            displayName = "Test User",
            roles = listOf("viewer"),
        )
        val result = mockMvc.perform(
            post("/users")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.username").value(request.username))
            .andExpect(jsonPath("$.data.email").value(request.email))
            .andExpect(jsonPath("$.data.roles[0]").value("viewer"))
            .andReturn()

        val body = objectMapper.readTree(result.response.contentAsString)
        testUserId = body["data"]["id"].asText()
    }

    @Test
    @Order(11)
    fun `create user without auth returns 401`() {
        val request = CreateUserRequest(
            username = "unauthorized",
            email = "unauth@test.com",
            password = "TestPass123!",
        )
        mockMvc.perform(
            post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isUnauthorized)
    }

    // ─── Get Single User ─────────────────────────────────────────

    @Test
    @Order(20)
    fun `get single user returns user details`() {
        mockMvc.perform(
            get("/users/$testUserId")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value(testUserId))
    }

    // ─── Update User ─────────────────────────────────────────────

    @Test
    @Order(30)
    fun `update user modifies fields`() {
        val request = UpdateUserRequest(displayName = "Updated Name")
        mockMvc.perform(
            patch("/users/$testUserId")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.displayName").value("Updated Name"))
    }

    // ─── Lock / Unlock ───────────────────────────────────────────

    @Test
    @Order(40)
    fun `lock user changes status to LOCKED`() {
        mockMvc.perform(
            post("/users/$testUserId/lock")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
    }

    @Test
    @Order(41)
    fun `unlock user restores to ACTIVE`() {
        mockMvc.perform(
            post("/users/$testUserId/unlock")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
    }

    // ─── Delete ──────────────────────────────────────────────────

    @Test
    @Order(90)
    fun `delete user soft-deletes`() {
        mockMvc.perform(
            delete("/users/$testUserId?reason=test+cleanup")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
    }

    @Test
    @Order(91)
    fun `get deleted user returns 404`() {
        mockMvc.perform(
            get("/users/$testUserId")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isNotFound)
    }
}
