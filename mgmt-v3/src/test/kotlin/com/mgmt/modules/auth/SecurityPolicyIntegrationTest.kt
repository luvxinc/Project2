package com.mgmt.modules.auth

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.dto.LoginRequest
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
 *
 * Security: PUT requires superuser + L0 (password) + L4 (nuclear code).
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
        // Test credentials — matches seeded admin user in test DB
        private const val ADMIN_PASSWORD = "1522P"
        // L4 nuclear code — matches seeded security_codes in test DB
        private const val L4_CODE = "***REDACTED_SYSTEM_CODE***"
    }

    @BeforeAll
    fun setup() {
        val request = LoginRequest(username = "admin", password = ADMIN_PASSWORD)
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

    // ─── PUT Policies (with L0+L4 verification) ─────────────────

    @Test
    @Order(10)
    fun `save policies batch-writes to Redis with L0 and L4 verification`() {
        val payload = mapOf(
            "policies" to mapOf(
                "btn_commit_sku_fix" to listOf("modify"),
                "btn_run_transform" to listOf("modify"),
                "btn_generate_report" to listOf("query"),
                "btn_create_backup" to listOf("db"),
                "btn_restore_db" to listOf("system"),
                "btn_clean_data" to listOf("system"),
            ),
            "sec_code_l0" to ADMIN_PASSWORD,
            "sec_code_l4" to L4_CODE,
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
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
        val payload = mapOf(
            "policies" to mapOf(
                "btn_commit_sku_fix" to listOf("modify", "query"),
                "btn_generate_report" to emptyList<String>(),
            ),
            "sec_code_l0" to ADMIN_PASSWORD,
            "sec_code_l4" to L4_CODE,
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
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

    // ─── Security Verification Tests ─────────────────────────────

    @Test
    @Order(40)
    fun `save policies fails without L0 password`() {
        val payload = mapOf(
            "policies" to mapOf("btn_test" to listOf("query")),
            "sec_code_l4" to L4_CODE,
            // L0 missing
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isForbidden)
    }

    @Test
    @Order(50)
    fun `save policies fails with wrong L4 code`() {
        val payload = mapOf(
            "policies" to mapOf("btn_test" to listOf("query")),
            "sec_code_l0" to ADMIN_PASSWORD,
            "sec_code_l4" to "WrongCode!",
        )
        mockMvc.perform(
            put("/auth/security-policies")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isForbidden)
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
