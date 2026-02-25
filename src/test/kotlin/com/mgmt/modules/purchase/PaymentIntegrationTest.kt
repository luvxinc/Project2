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
 * Payment Integration Tests — V1 Functional Parity
 *
 * Tests unified payments across all 4 types (po/deposit/logistic/prepay):
 *   1.  Create PO payment
 *   2.  Create deposit payment
 *   3.  Create logistic payment
 *   4.  Create prepay payment
 *   5.  List by type
 *   6.  List by PO
 *   7.  Get by id
 *   8.  Soft delete
 *   9.  Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PaymentIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var poPaymentId: Long = 0
        var depositPaymentId: Long = 0
        var logisticPaymentId: Long = 0
        var prepayPaymentId: Long = 0
        var testPoId: Long = 0
        var testSupplierId: Long = 0
        var testShipmentId: Long = 0
        const val TEST_SUPPLIER_CODE = "PP"
        const val PO_NUM = "PP20260217-PAY01"
        const val LOGISTIC_NUM = "PAY-TEST-LOG-001"
    }

    /** Seed supplier → PO → shipment for FK references */
    private fun seedTestData() {
        dataSource.connection.use { conn ->
            conn.autoCommit = false
            try {
                val stmt = conn.createStatement()

                // Supplier
                stmt.execute("""
                    INSERT INTO suppliers (supplier_code, supplier_name, status, created_by, updated_by)
                    VALUES ('$TEST_SUPPLIER_CODE', 'Payment Test Supplier', true, 'test', 'test')
                    ON CONFLICT (supplier_code) WHERE deleted_at IS NULL DO NOTHING
                """)
                val supRs = stmt.executeQuery("SELECT id FROM suppliers WHERE supplier_code = '$TEST_SUPPLIER_CODE' AND deleted_at IS NULL")
                supRs.next()
                testSupplierId = supRs.getLong(1)

                // PO
                stmt.execute("""
                    INSERT INTO purchase_orders (po_num, supplier_id, supplier_code, po_date, status, created_by, updated_by)
                    VALUES ('$PO_NUM', $testSupplierId, '$TEST_SUPPLIER_CODE', '2026-02-17', 'active', 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val poRs = stmt.executeQuery("SELECT id FROM purchase_orders WHERE po_num = '$PO_NUM'")
                poRs.next()
                testPoId = poRs.getLong(1)

                // Shipment
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_NUM', '2026-02-17', 'pending', 1, 500.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val shipRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_NUM'")
                shipRs.next()
                testShipmentId = shipRs.getLong(1)

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
                stmt.execute("DELETE FROM payments WHERE po_num = '$PO_NUM'")
                stmt.execute("DELETE FROM payments WHERE supplier_id = (SELECT id FROM suppliers WHERE supplier_code = '$TEST_SUPPLIER_CODE' AND deleted_at IS NULL LIMIT 1)")
                stmt.execute("DELETE FROM payments WHERE shipment_id = (SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_NUM' LIMIT 1)")
                stmt.execute("DELETE FROM shipment_items WHERE logistic_num = '$LOGISTIC_NUM'")
                stmt.execute("DELETE FROM shipments WHERE logistic_num = '$LOGISTIC_NUM'")
                stmt.execute("DELETE FROM purchase_order_items WHERE po_num = '$PO_NUM'")
                stmt.execute("DELETE FROM purchase_order_strategies WHERE po_num = '$PO_NUM'")
                stmt.execute("DELETE FROM purchase_orders WHERE po_num = '$PO_NUM'")
                stmt.execute("DELETE FROM supplier_strategies WHERE supplier_code = '$TEST_SUPPLIER_CODE'")
                stmt.execute("DELETE FROM suppliers WHERE supplier_code = '$TEST_SUPPLIER_CODE'")
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

    // ─── Create: PO Payment ─────────────────────────────

    @Test @Order(10)
    fun `create PO payment`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "paymentType" to "po",
            "paymentNo" to "PAY-PO-001",
            "paymentDate" to "2026-02-17",
            "cashAmount" to 5000.00,
            "currency" to "USD",
            "exchangeRate" to 7.1,
            "poId" to testPoId,
            "poNum" to PO_NUM,
            "supplierId" to testSupplierId,
        ))
        val result = mockMvc.post("/purchase/payments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.paymentType") { value("po") }
            jsonPath("$.data.paymentNo") { value("PAY-PO-001") }
            jsonPath("$.data.cashAmount") { value(5000.0) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        poPaymentId = json["data"]["id"].asLong()
    }

    // ─── Create: Deposit Payment ────────────────────────

    @Test @Order(11)
    fun `create deposit payment`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "paymentType" to "deposit",
            "paymentNo" to "PAY-DEP-001",
            "paymentDate" to "2026-02-17",
            "cashAmount" to 1500.00,
            "currency" to "USD",
            "exchangeRate" to 7.1,
            "poId" to testPoId,
            "poNum" to PO_NUM,
            "supplierId" to testSupplierId,
            "depositOverride" to true,
        ))
        val result = mockMvc.post("/purchase/payments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.paymentType") { value("deposit") }
            jsonPath("$.data.depositOverride") { value(true) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        depositPaymentId = json["data"]["id"].asLong()
    }

    // ─── Create: Logistic Payment ───────────────────────

    @Test @Order(12)
    fun `create logistic payment`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "paymentType" to "logistics",
            "paymentNo" to "PAY-LOG-001",
            "paymentDate" to "2026-02-17",
            "cashAmount" to 1200.00,
            "currency" to "RMB",
            "exchangeRate" to 1.0,
            "shipmentId" to testShipmentId,
            "logisticNum" to LOGISTIC_NUM,
        ))
        val result = mockMvc.post("/purchase/payments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.paymentType") { value("logistics") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        logisticPaymentId = json["data"]["id"].asLong()
    }

    // ─── Create: Prepay Payment ─────────────────────────

    @Test @Order(13)
    fun `create prepay payment`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "paymentType" to "prepay",
            "paymentNo" to "PAY-PRE-001",
            "paymentDate" to "2026-02-17",
            "cashAmount" to 800.00,
            "currency" to "USD",
            "exchangeRate" to 7.1,
            "supplierId" to testSupplierId,
            "prepayTranType" to "deposit",
        ))
        val result = mockMvc.post("/purchase/payments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.paymentType") { value("prepay") }
            jsonPath("$.data.prepayTranType") { value("deposit") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        prepayPaymentId = json["data"]["id"].asLong()
    }

    // ─── Get by ID ──────────────────────────────────────

    @Test @Order(20)
    fun `get payment by id`() {
        mockMvc.get("/purchase/payments/$poPaymentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.paymentNo") { value("PAY-PO-001") }
            jsonPath("$.data.paymentType") { value("po") }
        }
    }

    // ─── List by Type ───────────────────────────────────

    @Test @Order(30)
    fun `list payments by type - po`() {
        mockMvc.get("/purchase/payments") {
            header("Authorization", "Bearer $token")
            param("paymentType", "po")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(31)
    fun `list payments by type - deposit`() {
        mockMvc.get("/purchase/payments") {
            header("Authorization", "Bearer $token")
            param("paymentType", "deposit")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── List by PO ─────────────────────────────────────

    @Test @Order(40)
    fun `list payments by PO`() {
        mockMvc.get("/purchase/payments") {
            header("Authorization", "Bearer $token")
            param("poId", testPoId.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            // Should include both the PO payment and deposit payment
        }
    }

    // ─── Delete ─────────────────────────────────────────

    @Test @Order(80)
    fun `soft delete payment`() {
        mockMvc.delete("/purchase/payments/$logisticPaymentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Confirm not found
        mockMvc.get("/purchase/payments/$logisticPaymentId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/purchase/payments").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/payments") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
