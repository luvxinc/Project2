package com.mgmt.modules.inventory

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.auth.AuthService
import com.mgmt.modules.auth.dto.LoginRequest
import org.junit.jupiter.api.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.*
import javax.sql.DataSource

/**
 * WarehouseLocation Integration Tests — 8 tests
 *
 *   1.  Create warehouse location
 *   2.  Duplicate composite key conflict
 *   3.  List with pagination
 *   4.  Filter by warehouse
 *   5.  Get by ID
 *   6.  Barcode auto-generated and searchable
 *   7.  Delete
 *   8.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WarehouseLocationIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var createdId: Long = 0
        var deleteId: Long = 0
        const val TEST_WAREHOUSE = "TEST-WH"
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM warehouse_locations WHERE warehouse = '$TEST_WAREHOUSE'")
            }
        }
    }

    @BeforeAll fun beforeAll() = cleanTestData()
    @AfterAll fun afterAll() = cleanTestData()

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    // ─── Create ─────────────────────────────────────────

    @Test @Order(10)
    fun `create warehouse location`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "warehouse" to TEST_WAREHOUSE,
            "aisle" to "A",
            "bay" to 1,
            "level" to "H",
            "bin" to "01",
            "slot" to "",
        ))
        val result = mockMvc.post("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.warehouse") { value(TEST_WAREHOUSE) }
            jsonPath("$.data.aisle") { value("A") }
            jsonPath("$.data.bay") { value(1) }
            jsonPath("$.data.level") { value("H") }
            jsonPath("$.data.barcode") { isNotEmpty() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        createdId = json["data"]["id"].asLong()
    }

    // ─── Create another for testing ─────────────────────

    @Test @Order(11)
    fun `create second location for delete test`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "warehouse" to TEST_WAREHOUSE,
            "aisle" to "B",
            "bay" to 2,
            "level" to "L",
            "bin" to "",
            "slot" to "",
        ))
        val result = mockMvc.post("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        deleteId = json["data"]["id"].asLong()
    }

    // ─── Duplicate Conflict ─────────────────────────────

    @Test @Order(12)
    fun `duplicate composite key returns conflict`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "warehouse" to TEST_WAREHOUSE,
            "aisle" to "A",
            "bay" to 1,
            "level" to "H",
            "bin" to "01",
            "slot" to "",
        ))
        mockMvc.post("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    // ─── List ───────────────────────────────────────────

    @Test @Order(20)
    fun `list with pagination`() {
        mockMvc.get("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            param("limit", "10")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.total") { isNumber() }
        }
    }

    // ─── Filter by warehouse ────────────────────────────

    @Test @Order(21)
    fun `filter by warehouse`() {
        mockMvc.get("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            param("warehouse", TEST_WAREHOUSE)
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.length()") { value(2) }
        }
    }

    // ─── Get by ID ──────────────────────────────────────

    @Test @Order(30)
    fun `get by id`() {
        mockMvc.get("/inventory/warehouse-locations/$createdId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.id") { value(createdId) }
            jsonPath("$.data.barcode") { isNotEmpty() }
        }
    }

    // ─── Barcode search ─────────────────────────────────

    @Test @Order(31)
    fun `search by barcode substring`() {
        mockMvc.get("/inventory/warehouse-locations") {
            header("Authorization", "Bearer $token")
            param("search", TEST_WAREHOUSE)
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Delete ─────────────────────────────────────────

    @Test @Order(80)
    fun `delete warehouse location`() {
        mockMvc.delete("/inventory/warehouse-locations/$deleteId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Confirm 404
        mockMvc.get("/inventory/warehouse-locations/$deleteId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/inventory/warehouse-locations").andExpect { status { isUnauthorized() } }
        mockMvc.post("/inventory/warehouse-locations") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
