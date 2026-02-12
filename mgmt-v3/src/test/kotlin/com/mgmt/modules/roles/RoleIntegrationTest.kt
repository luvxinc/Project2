package com.mgmt.modules.roles

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.dto.CreateRoleRequest
import com.mgmt.modules.auth.dto.LoginRequest
import com.mgmt.modules.auth.dto.BoundaryRequest
import com.mgmt.modules.auth.dto.SetBoundariesRequest
import com.mgmt.modules.auth.dto.UpdateRoleRequest
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
 * Phase 1 Integration Tests — Roles Module
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RoleIntegrationTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    companion object {
        private var adminToken: String = ""
        private var testRoleId: String = ""
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

    // ─── List Roles ──────────────────────────────────────────────

    @Test
    @Order(1)
    fun `list roles returns active roles`() {
        mockMvc.perform(
            get("/roles")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").isArray)
    }

    // ─── Create Role ─────────────────────────────────────────────

    @Test
    @Order(10)
    fun `create role returns new role`() {
        val ts = System.currentTimeMillis()
        val uniqueLevel = ((ts % 900) + 100).toInt()  // 100-999
        val request = CreateRoleRequest(
            name = "test_role_$ts",
            displayName = "Test Role",
            level = uniqueLevel,
            description = "Integration test role",
            color = "#FF5733",
        )
        val result = mockMvc.perform(
            post("/roles")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.name").value(request.name))
            .andExpect(jsonPath("$.data.level").value(uniqueLevel))
            .andReturn()

        val body = objectMapper.readTree(result.response.contentAsString)
        testRoleId = body["data"]["id"].asText()
    }

    // ─── Get Single Role ─────────────────────────────────────────

    @Test
    @Order(20)
    fun `get role returns role with boundaries`() {
        mockMvc.perform(
            get("/roles/$testRoleId")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value(testRoleId))
            .andExpect(jsonPath("$.data.boundaries").isArray)
    }

    // ─── Update Role ─────────────────────────────────────────────

    @Test
    @Order(30)
    fun `update role modifies fields`() {
        val request = UpdateRoleRequest(displayName = "Updated Test Role")
        mockMvc.perform(
            patch("/roles/$testRoleId")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.displayName").value("Updated Test Role"))
    }

    // ─── Boundaries ──────────────────────────────────────────────

    @Test
    @Order(40)
    fun `set boundaries replaces all boundaries`() {
        val request = SetBoundariesRequest(
            boundaries = listOf(
                BoundaryRequest("users.read", "ALLOWED", "Can read users"),
                BoundaryRequest("users.write", "DENIED", "Cannot write users"),
            )
        )
        mockMvc.perform(
            put("/roles/$testRoleId/boundaries")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
    }

    @Test
    @Order(41)
    fun `get boundaries returns set boundaries`() {
        mockMvc.perform(
            get("/roles/$testRoleId/boundaries")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").isArray)
            .andExpect(jsonPath("$.data.length()").value(2))
    }

    @Test
    @Order(42)
    fun `add single boundary appends`() {
        val request = BoundaryRequest("products.read", "ALLOWED", "Can read products")
        mockMvc.perform(
            post("/roles/$testRoleId/boundaries")
                .header("Authorization", "Bearer $adminToken")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.permissionKey").value("products.read"))
    }

    @Test
    @Order(43)
    fun `remove boundary deletes specific key`() {
        mockMvc.perform(
            delete("/roles/$testRoleId/boundaries/users.write")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
    }

    // ─── Delete Role ─────────────────────────────────────────────

    @Test
    @Order(90)
    fun `delete role deactivates it`() {
        mockMvc.perform(
            delete("/roles/$testRoleId")
                .header("Authorization", "Bearer $adminToken")
        )
            .andExpect(status().isOk)
    }
}
