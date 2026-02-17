package com.mgmt.modules.purchase

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
 * Shipment Integration Tests — V1 Functional Parity
 *
 * Tests:
 *   1.  List shipments (paginated)
 *   2.  Create shipment with items
 *   3.  Duplicate logistic_num fails
 *   4.  Get shipment detail (with items)
 *   5.  Filter by status
 *   6.  Soft delete shipment
 *   7.  Restore shipment
 *   8.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ShipmentIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var shipmentId: Long = 0
        var testPoNum: String = ""
        const val TEST_LOGISTIC_NUM = "TEST-LOG-9999"
        const val TEST_SUPPLIER_CODE = "XX"
        const val TEST_SKU = "SHIP-TEST-SKU-001"
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM shipment_items WHERE logistic_num = '$TEST_LOGISTIC_NUM'")
                stmt.execute("DELETE FROM shipments WHERE logistic_num = '$TEST_LOGISTIC_NUM'")
                // Clean PO test data
                stmt.execute("DELETE FROM purchase_order_strategies WHERE po_num LIKE 'XX%SHIP%'")
                stmt.execute("DELETE FROM purchase_order_items WHERE po_num LIKE 'XX%SHIP%'")
                stmt.execute("DELETE FROM purchase_orders WHERE po_num LIKE 'XX%SHIP%'")
            }
        }
    }

    /** Seed a PO so the shipment can cross-reference it */
    private fun ensureTestPo() {
        dataSource.connection.use { conn ->
            // Find an existing active supplier to use
            val supplierRs = conn.prepareStatement(
                "SELECT id, supplier_code FROM suppliers WHERE deleted_at IS NULL LIMIT 1"
            ).executeQuery()

            if (!supplierRs.next()) {
                throw RuntimeException("No active suppliers in DB — cannot seed test PO")
            }
            val supplierId = supplierRs.getLong(1)
            val supplierCode = supplierRs.getString(2)

            // Create a test PO
            testPoNum = "${supplierCode}20260217-SHIP01"

            // Check if already exists
            val existsRs = conn.prepareStatement(
                "SELECT id FROM purchase_orders WHERE po_num = ? AND deleted_at IS NULL"
            ).apply { setString(1, testPoNum) }.executeQuery()

            if (!existsRs.next()) {
                conn.prepareStatement(
                    """INSERT INTO purchase_orders (po_num, supplier_id, supplier_code, po_date, status, created_by, updated_by)
                       VALUES (?, ?, ?, '2026-02-17', 'active', 'test', 'test')"""
                ).apply {
                    setString(1, testPoNum)
                    setLong(2, supplierId)
                    setString(3, supplierCode)
                }.execute()
            }
        }
    }

    @BeforeAll
    fun beforeAll() {
        cleanTestData()
        ensureTestPo()
    }

    @AfterAll fun afterAll() = cleanTestData()

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    // ─── List ───────────────────────────────────────────

    @Test @Order(1)
    fun `list shipments returns paginated response`() {
        mockMvc.get("/purchase/shipments") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.page") { exists() }
            jsonPath("$.meta.total") { exists() }
        }
    }

    // ─── Create ─────────────────────────────────────────

    @Test @Order(10)
    fun `create shipment with items`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to TEST_LOGISTIC_NUM,
            "sentDate" to "2026-02-17",
            "etaDate" to "2026-03-01",
            "pallets" to 5,
            "logisticsCost" to 1200.00,
            "exchangeRate" to 7.1,
            "note" to "Test shipment",
            "items" to listOf(
                mapOf(
                    "poNum" to testPoNum,
                    "sku" to TEST_SKU,
                    "quantity" to 100,
                    "unitPrice" to 5.50,
                    "poChange" to false,
                ),
            ),
        ))
        val result = mockMvc.post("/purchase/shipments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.logisticNum") { value(TEST_LOGISTIC_NUM) }
            jsonPath("$.data.pallets") { value(5) }
            jsonPath("$.data.status") { value("pending") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        shipmentId = json["data"]["id"].asLong()
    }

    @Test @Order(11)
    fun `create shipment with duplicate logistic num fails`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to TEST_LOGISTIC_NUM,
            "sentDate" to "2026-02-18",
            "items" to listOf(
                mapOf("poNum" to testPoNum, "sku" to TEST_SKU, "quantity" to 50, "unitPrice" to 5.50),
            ),
        ))
        mockMvc.post("/purchase/shipments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { is4xxClientError() }
        }
    }

    @Test @Order(12)
    fun `create shipment with invalid PO num fails`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to "TEMP-LOG-INVALID",
            "sentDate" to "2026-02-17",
            "items" to listOf(
                mapOf("poNum" to "NONEXISTENT-PO", "sku" to TEST_SKU, "quantity" to 10, "unitPrice" to 1.0),
            ),
        ))
        mockMvc.post("/purchase/shipments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Read Detail ────────────────────────────────────

    @Test @Order(20)
    fun `get shipment detail includes items`() {
        mockMvc.get("/purchase/shipments/$shipmentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.logisticNum") { value(TEST_LOGISTIC_NUM) }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.items.length()") { value(1) }
            jsonPath("$.data.items[0].sku") { value(TEST_SKU) }
            jsonPath("$.data.items[0].quantity") { value(100) }
        }
    }

    // ─── Delete / Restore ───────────────────────────────

    @Test @Order(80)
    fun `soft delete shipment`() {
        mockMvc.delete("/purchase/shipments/$shipmentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Confirm not found
        mockMvc.get("/purchase/shipments/$shipmentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(81)
    fun `restore soft-deleted shipment`() {
        mockMvc.post("/purchase/shipments/$shipmentId/restore") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.status") { value("pending") }
        }

        // Confirm accessible again
        mockMvc.get("/purchase/shipments/$shipmentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(TEST_LOGISTIC_NUM) }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/purchase/shipments").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/shipments") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
