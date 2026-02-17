package com.mgmt.modules.auth

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.dto.LoginRequest
import com.mgmt.modules.auth.dto.SecurityPolicyRequest
import org.junit.jupiter.api.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

/**
 * Integration Tests — Security Policy Matrix (安全策略矩阵)
 *
 * V1 parity: policy_update() in user_admin/views/actions.py
 * Tests GET & PUT /auth/security-policies endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SecurityPolicyIntegrationTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    companion object {
        private var adminToken: String = ""
    }

    @BeforeAll
    fun setup() {
        val request = LoginRequest(username = "admin", password = "1522P")
        val result = mockMvc.perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        ).andReturn()
        val body = objectMapper.readTree(result.response.contentAsString)
        adminToken = body["data"]["accessToken"].asText()
    }

    // ─── GET Policies ────────────────────────────────────────────

    @Test
    @Order(1)
    fun `get policies returns empty map initially`() {
        mockMvc.perform(
            get("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").isMap)
    }

    // ─── PUT Policies ────────────────────────────────────────────

    @Test
    @Order(10)
    fun `save policies batch-writes to Redis`() {
        val request = SecurityPolicyRequest(
            policies = mapOf(
                "btn_commit_sku_fix" to listOf("modify"),
                "btn_run_transform" to listOf("modify"),
                "btn_generate_report" to listOf("query"),
                "btn_create_backup" to listOf("db"),
                "btn_restore_db" to listOf("system"),
                "btn_clean_data" to listOf("system"),
            )
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.count").value("6"))
    }

    @Test
    @Order(20)
    fun `get policies returns saved policies`() {
        mockMvc.perform(
            get("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.btn_commit_sku_fix[0]").value("modify"))
            .andExpect(jsonPath("$.data.btn_create_backup[0]").value("db"))
            .andExpect(jsonPath("$.data.btn_restore_db[0]").value("system"))
    }

    // ─── Idempotent Save ─────────────────────────────────────────

    @Test
    @Order(30)
    fun `save policies is idempotent — replaces previous state`() {
        // Save with different policies (fewer keys, different tokens)
        val request = SecurityPolicyRequest(
            policies = mapOf(
                "btn_commit_sku_fix" to listOf("modify", "query"),
                "btn_generate_report" to emptyList(),
            )
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.count").value("2"))

        // Verify: old keys removed, new keys present
        mockMvc.perform(
            get("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.btn_commit_sku_fix.length()").value(2))
            .andExpect(jsonPath("$.data.btn_generate_report.length()").value(0))
            // Old keys should be gone (full replace)
            .andExpect(jsonPath("$.data.btn_create_backup").doesNotExist())
            .andExpect(jsonPath("$.data.btn_restore_db").doesNotExist())
    }

    // ─── Unauthorized Access ─────────────────────────────────────

    @Test
    @Order(90)
    fun `unauthenticated request returns 401`() {
        mockMvc.perform(
            get("/auth/security-policies")
        )
            .andExpect(status().isUnauthorized)
    }
}
