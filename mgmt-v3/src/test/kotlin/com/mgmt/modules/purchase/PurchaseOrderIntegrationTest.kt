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
 * PurchaseOrder Integration Tests — V1 Functional Parity
 *
 * Tests:
 *   1.  List POs (paginated)
 *   2.  Create PO with items + strategy
 *   3.  Get PO detail (items + strategy)
 *   4.  Update PO status
 *   5.  Update PO items (replace)
 *   6.  Filter POs by supplier
 *   7.  Soft delete PO
 *   8.  Restore PO
 *   9.  Create PO with unknown supplier fails
 *  10.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PurchaseOrderIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var poId: Long = 0
        var poNum: String = ""
        var testSupplierId: Long = 0
        const val TEST_SUPPLIER_CODE = "YY"
        const val TEST_SKU_1 = "PO-TEST-SKU-001"
        const val TEST_SKU_2 = "PO-TEST-SKU-002"
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // Clean in FK order
                stmt.execute("DELETE FROM purchase_order_strategies WHERE po_num LIKE '${TEST_SUPPLIER_CODE}%'")
                stmt.execute("DELETE FROM purchase_order_items WHERE po_num LIKE '${TEST_SUPPLIER_CODE}%'")
                stmt.execute("DELETE FROM purchase_orders WHERE supplier_code = '$TEST_SUPPLIER_CODE'")
                stmt.execute("DELETE FROM supplier_strategies WHERE supplier_code = '$TEST_SUPPLIER_CODE'")
                stmt.execute("DELETE FROM suppliers WHERE supplier_code = '$TEST_SUPPLIER_CODE'")
            }
        }
    }

    private fun ensureTestSupplier() {
        dataSource.connection.use { conn ->
            // Check if supplier exists
            val rs = conn.prepareStatement("SELECT id FROM suppliers WHERE supplier_code = ? AND deleted_at IS NULL").apply {
                setString(1, TEST_SUPPLIER_CODE)
            }.executeQuery()
            if (rs.next()) {
                testSupplierId = rs.getLong(1)
            } else {
                val insertStmt = conn.prepareStatement(
                    "INSERT INTO suppliers (supplier_code, supplier_name, status, created_by, updated_by) VALUES (?, ?, true, 'test', 'test') RETURNING id"
                ).apply {
                    setString(1, TEST_SUPPLIER_CODE)
                    setString(2, "PO Test Supplier YY")
                }
                val insertRs = insertStmt.executeQuery()
                if (insertRs.next()) {
                    testSupplierId = insertRs.getLong(1)
                }
            }
        }
    }

    @BeforeAll
    fun beforeAll() {
        cleanTestData()
        ensureTestSupplier()
    }

    @AfterAll fun afterAll() = cleanTestData()

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    // ─── List ───────────────────────────────────────────

    @Test @Order(1)
    fun `list POs returns paginated response`() {
        mockMvc.get("/purchase/orders") {
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
    fun `create PO with items and strategy`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to TEST_SUPPLIER_CODE,
            "poDate" to "2026-02-17",
            "items" to listOf(
                mapOf("sku" to TEST_SKU_1, "quantity" to 100, "unitPrice" to 5.50, "currency" to "RMB", "exchangeRate" to 7.1),
                mapOf("sku" to TEST_SKU_2, "quantity" to 200, "unitPrice" to 3.25, "currency" to "RMB", "exchangeRate" to 7.1),
            ),
            "strategy" to mapOf(
                "strategyDate" to "2026-02-17",
                "currency" to "USD",
                "exchangeRate" to 7.1,
                "rateMode" to "auto",
                "floatEnabled" to false,
                "floatThreshold" to 0.0,
                "requireDeposit" to true,
                "depositRatio" to 30.0,
            ),
        ))
        val result = mockMvc.post("/purchase/orders") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.supplierCode") { value(TEST_SUPPLIER_CODE) }
            jsonPath("$.data.poNum") { exists() }
            jsonPath("$.data.status") { value("active") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        poId = json["data"]["id"].asLong()
        poNum = json["data"]["poNum"].asText()
    }

    @Test @Order(11)
    fun `create PO with unknown supplier fails`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to "QQ",
            "poDate" to "2026-02-17",
            "items" to listOf(
                mapOf("sku" to "FAKE-SKU", "quantity" to 1, "unitPrice" to 1.0),
            ),
            "strategy" to mapOf(
                "strategyDate" to "2026-02-17",
                "currency" to "USD",
                "exchangeRate" to 7.0,
            ),
        ))
        mockMvc.post("/purchase/orders") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Read Detail ────────────────────────────────────

    @Test @Order(20)
    fun `get PO detail includes items and strategy`() {
        mockMvc.get("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.poNum") { value(poNum) }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.items.length()") { value(2) }
            jsonPath("$.data.items[0].sku") { exists() }
            jsonPath("$.data.strategy") { exists() }
            jsonPath("$.data.strategy.requireDeposit") { value(true) }
            jsonPath("$.data.strategy.depositRatio") { value(30.0) }
        }
    }

    // ─── Update ─────────────────────────────────────────

    @Test @Order(30)
    fun `update PO status`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "status" to "confirmed",
        ))
        mockMvc.patch("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.status") { value("confirmed") }
        }
    }

    @Test @Order(31)
    fun `update PO items (replace)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "items" to listOf(
                mapOf("sku" to TEST_SKU_1, "quantity" to 150, "unitPrice" to 6.00, "currency" to "RMB", "exchangeRate" to 7.1),
            ),
        ))
        mockMvc.patch("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
        }

        // Verify items were replaced (now only 1 item)
        mockMvc.get("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.items.length()") { value(1) }
            jsonPath("$.data.items[0].quantity") { value(150) }
        }
    }

    // ─── Filter ─────────────────────────────────────────

    @Test @Order(40)
    fun `filter POs by supplier code`() {
        mockMvc.get("/purchase/orders") {
            header("Authorization", "Bearer $token")
            param("supplierCode", TEST_SUPPLIER_CODE)
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.total") { value(1) }
        }
    }

    @Test @Order(41)
    fun `filter POs by date range`() {
        mockMvc.get("/purchase/orders") {
            header("Authorization", "Bearer $token")
            param("dateFrom", "2026-02-01")
            param("dateTo", "2026-02-28")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Delete / Restore ───────────────────────────────

    @Test @Order(80)
    fun `soft delete PO`() {
        mockMvc.delete("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Confirm not found
        mockMvc.get("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(81)
    fun `restore soft-deleted PO`() {
        mockMvc.post("/purchase/orders/$poId/restore") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.status") { value("active") }
        }

        // Confirm accessible again
        mockMvc.get("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.poNum") { value(poNum) }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/purchase/orders").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/orders") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
