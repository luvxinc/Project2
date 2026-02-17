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
 * Receive + ReceiveDiff Integration Tests — V1 Functional Parity
 *
 * Tests:
 *   1.  List receives
 *   2.  Submit receive (exact match — no diff)
 *   3.  Submit receive (shortage — auto diff created)
 *   4.  Get receives by shipment
 *   5.  Get pending diffs
 *   6.  Get diffs by receive
 *   7.  Resolve diff
 *   8.  Soft delete receive
 *   9.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReceiveIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var receiveIdExact: Long = 0
        var receiveIdShort: Long = 0
        var diffId: Long = 0
        var testShipmentId: Long = 0
        const val LOGISTIC_EXACT = "RCV-TEST-EXACT-001"
        const val LOGISTIC_SHORT = "RCV-TEST-SHORT-001"
        const val TEST_SKU_1 = "RCV-SKU-001"
        const val TEST_SKU_2 = "RCV-SKU-002"
    }

    /**
     * Seed full chain: supplier → PO → shipment (2 shipments) → shipment_items
     */
    private fun seedTestData() {
        dataSource.connection.use { conn ->
            conn.autoCommit = false
            try {
                val stmt = conn.createStatement()

                // 1. Supplier
                stmt.execute("""
                    INSERT INTO suppliers (supplier_code, supplier_name, status, created_by, updated_by)
                    VALUES ('RR', 'Receive Test Supplier', true, 'test', 'test')
                    ON CONFLICT (supplier_code) WHERE deleted_at IS NULL DO NOTHING
                """)
                val supRs = stmt.executeQuery("SELECT id FROM suppliers WHERE supplier_code = 'RR' AND deleted_at IS NULL")
                supRs.next()
                val supplierId = supRs.getLong(1)

                // 2. PO
                stmt.execute("""
                    INSERT INTO purchase_orders (po_num, supplier_id, supplier_code, po_date, status, created_by, updated_by)
                    VALUES ('RR20260217-RCV01', $supplierId, 'RR', '2026-02-17', 'active', 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val poRs = stmt.executeQuery("SELECT id FROM purchase_orders WHERE po_num = 'RR20260217-RCV01'")
                poRs.next()
                val poId = poRs.getLong(1)

                // 3. Shipment — exact match
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_EXACT', '2026-02-17', 'pending', 1, 100.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val shipExactRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_EXACT'")
                shipExactRs.next()
                val shipExactId = shipExactRs.getLong(1)

                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipExactId, '$LOGISTIC_EXACT', $poId, 'RR20260217-RCV01', '$TEST_SKU_1', 50, 5.00, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // 4. Shipment — shortage
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_SHORT', '2026-02-17', 'pending', 1, 100.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val shipShortRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_SHORT'")
                shipShortRs.next()
                testShipmentId = shipShortRs.getLong(1)

                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($testShipmentId, '$LOGISTIC_SHORT', $poId, 'RR20260217-RCV01', '$TEST_SKU_2', 100, 3.25, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                conn.commit()
            } catch (e: Exception) {
                conn.rollback()
                throw e
            }
        }
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM receive_diffs WHERE logistic_num IN ('$LOGISTIC_EXACT', '$LOGISTIC_SHORT')")
                stmt.execute("DELETE FROM receives WHERE logistic_num IN ('$LOGISTIC_EXACT', '$LOGISTIC_SHORT')")
                stmt.execute("DELETE FROM shipment_items WHERE logistic_num IN ('$LOGISTIC_EXACT', '$LOGISTIC_SHORT')")
                stmt.execute("DELETE FROM shipments WHERE logistic_num IN ('$LOGISTIC_EXACT', '$LOGISTIC_SHORT')")
                stmt.execute("DELETE FROM purchase_order_items WHERE po_num = 'RR20260217-RCV01'")
                stmt.execute("DELETE FROM purchase_order_strategies WHERE po_num = 'RR20260217-RCV01'")
                stmt.execute("DELETE FROM purchase_orders WHERE po_num = 'RR20260217-RCV01'")
                stmt.execute("DELETE FROM supplier_strategies WHERE supplier_code = 'RR'")
                stmt.execute("DELETE FROM suppliers WHERE supplier_code = 'RR'")
            }
        }
    }

    @BeforeAll
    fun beforeAll() {
        cleanTestData()
        seedTestData()
    }

    @AfterAll fun afterAll() = cleanTestData()

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    // ─── List ───────────────────────────────────────────

    @Test @Order(1)
    fun `list all receives`() {
        mockMvc.get("/purchase/receives") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Submit: Exact Match (no diff) ──────────────────

    @Test @Order(10)
    fun `submit receive - exact match creates no diff`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_EXACT,
            "items" to listOf(
                mapOf(
                    "sku" to TEST_SKU_1,
                    "unitPrice" to 5.00,
                    "receiveQuantity" to 50,   // == sent qty
                    "receiveDate" to "2026-02-20",
                ),
            ),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(1) }
            jsonPath("$.data[0].sentQuantity") { value(50) }
            jsonPath("$.data[0].receiveQuantity") { value(50) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        receiveIdExact = json["data"][0]["id"].asLong()

        // Verify no diffs created for this receive
        mockMvc.get("/purchase/receives/$receiveIdExact/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(0) }
        }
    }

    // ─── Submit: Shortage (auto diff) ───────────────────

    @Test @Order(20)
    fun `submit receive - shortage creates auto diff`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_SHORT,
            "items" to listOf(
                mapOf(
                    "sku" to TEST_SKU_2,
                    "unitPrice" to 3.25,
                    "receiveQuantity" to 85,   // sent=100, short 15
                    "receiveDate" to "2026-02-20",
                ),
            ),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data[0].sentQuantity") { value(100) }
            jsonPath("$.data[0].receiveQuantity") { value(85) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        receiveIdShort = json["data"][0]["id"].asLong()
    }

    // ─── Query by Shipment ──────────────────────────────

    @Test @Order(30)
    fun `get receives by shipment`() {
        mockMvc.get("/purchase/receives/shipment/$testShipmentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(1) }
        }
    }

    // ─── Diffs ──────────────────────────────────────────

    @Test @Order(40)
    fun `get pending diffs includes the shortage`() {
        val result = mockMvc.get("/purchase/receives/diffs/pending") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val diffs = json["data"]
        // Find our specific diff
        for (d in diffs) {
            if (d["sku"].asText() == TEST_SKU_2 && d["logisticNum"].asText() == LOGISTIC_SHORT) {
                diffId = d["id"].asLong()
                Assertions.assertEquals(15, d["diffQuantity"].asInt())
                Assertions.assertEquals("pending", d["status"].asText())
                break
            }
        }
        Assertions.assertTrue(diffId > 0, "Diff record for shortage should exist")
    }

    @Test @Order(41)
    fun `get diffs by receive id`() {
        mockMvc.get("/purchase/receives/$receiveIdShort/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(1) }
            jsonPath("$.data[0].diffQuantity") { value(15) }
            jsonPath("$.data[0].status") { value("pending") }
        }
    }

    // ─── Resolve Diff ───────────────────────────────────

    @Test @Order(50)
    fun `resolve diff`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "resolutionNote" to "Supplier confirmed shortage, will resend 15 units next batch",
        ))
        mockMvc.post("/purchase/receives/diffs/$diffId/resolve") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.status") { value("resolved") }
            jsonPath("$.data.resolutionNote") { value("Supplier confirmed shortage, will resend 15 units next batch") }
        }
    }

    // ─── Delete ─────────────────────────────────────────

    @Test @Order(80)
    fun `soft delete receive`() {
        mockMvc.delete("/purchase/receives/$receiveIdExact") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        mockMvc.get("/purchase/receives/$receiveIdExact") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/purchase/receives").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/receives") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
