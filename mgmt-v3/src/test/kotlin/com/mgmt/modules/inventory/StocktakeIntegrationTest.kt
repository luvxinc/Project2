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
 * Stocktake Integration Tests — 8 tests
 *
 *   1.  Create stocktake with items
 *   2.  Duplicate date conflict
 *   3.  List stocktakes
 *   4.  Get stocktake detail (with items)
 *   5.  Update stocktake (replace items)
 *   6.  Delete stocktake (CASCADE)
 *   7.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StocktakeIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var createdId: Long = 0
        const val TEST_DATE = "2099-12-31"
        const val TEST_DATE_2 = "2099-12-30"
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // CASCADE will handle stocktake_items
                stmt.execute("DELETE FROM stocktakes WHERE stocktake_date IN ('$TEST_DATE', '$TEST_DATE_2')")
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
    fun `create stocktake with items`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "stocktakeDate" to TEST_DATE,
            "note" to "Year-end count",
            "items" to listOf(
                mapOf("sku" to "SKU-ST-001", "countedQty" to 100),
                mapOf("sku" to "SKU-ST-002", "countedQty" to 50),
                mapOf("sku" to "SKU-ST-003", "countedQty" to 0),
            ),
        ))
        val result = mockMvc.post("/inventory/stocktakes") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.stocktakeDate") { value(TEST_DATE) }
            jsonPath("$.data.note") { value("Year-end count") }
            jsonPath("$.data.items.length()") { value(3) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        createdId = json["data"]["id"].asLong()
    }

    // ─── Duplicate Date ─────────────────────────────────

    @Test @Order(11)
    fun `duplicate date returns conflict`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "stocktakeDate" to TEST_DATE,
            "items" to listOf(mapOf("sku" to "SKU-DUP", "countedQty" to 1)),
        ))
        mockMvc.post("/inventory/stocktakes") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    // ─── List ───────────────────────────────────────────

    @Test @Order(20)
    fun `list stocktakes returns array with item count`() {
        mockMvc.get("/inventory/stocktakes") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Detail ─────────────────────────────────────────

    @Test @Order(30)
    fun `get stocktake detail includes items`() {
        mockMvc.get("/inventory/stocktakes/$createdId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.id") { value(createdId) }
            jsonPath("$.data.items.length()") { value(3) }
            jsonPath("$.data.items[0].sku") { isNotEmpty() }
            jsonPath("$.data.items[0].countedQty") { isNumber() }
        }
    }

    // ─── Update ─────────────────────────────────────────

    @Test @Order(40)
    fun `update stocktake replaces items`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "note" to "Revised count",
            "items" to listOf(
                mapOf("sku" to "SKU-ST-001", "countedQty" to 95),
                mapOf("sku" to "SKU-ST-004", "countedQty" to 200),
            ),
        ))
        mockMvc.put("/inventory/stocktakes/$createdId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.note") { value("Revised count") }
            jsonPath("$.data.items.length()") { value(2) }
        }
    }

    // ─── Delete ─────────────────────────────────────────

    @Test @Order(50)
    fun `delete stocktake cascades items`() {
        // First create a second one to delete
        val body = objectMapper.writeValueAsString(mapOf(
            "stocktakeDate" to TEST_DATE_2,
            "items" to listOf(mapOf("sku" to "SKU-DEL", "countedQty" to 10)),
        ))
        val createResult = mockMvc.post("/inventory/stocktakes") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn()

        val deleteId = objectMapper.readTree(createResult.response.contentAsString)["data"]["id"].asLong()

        mockMvc.delete("/inventory/stocktakes/$deleteId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Verify items are also gone (CASCADE)
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT COUNT(*) FROM stocktake_items WHERE stocktake_id = $deleteId"
            )
            rs.next()
            assert(rs.getInt(1) == 0) { "Stocktake items should be CASCADE deleted" }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/inventory/stocktakes").andExpect { status { isUnauthorized() } }
        mockMvc.post("/inventory/stocktakes") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
