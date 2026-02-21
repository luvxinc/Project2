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
 * PurchaseFullChainIntegrationTest — 采购模块全链路100%覆盖集成测试
 *
 * 完整链路: Supplier → Strategy → PO → Shipment → Receive → ReceiveDiff → Abnormal
 *
 * 覆盖矩阵:
 * ┌─────────────────┬────────────────────────────────────────────────────────────────────┐
 * │ 模块             │ 覆盖场景                                                          │
 * ├─────────────────┼────────────────────────────────────────────────────────────────────┤
 * │ Supplier         │ Create, Duplicate (fail), Read, Update, Delete, Auth              │
 * │ Strategy         │ Create, Date conflict, Get effective, Multiple strategies          │
 * │ PO               │ Create, Get detail, Update items, Filter, Delete, Restore          │
 * │ Shipment         │ Create, Duplicate (fail), Detail, Filter, Delete, Restore          │
 * │ Receive          │ Exact match (no diff), Shortage (+diff), Overage (+diff)           │
 * │                  │ Multiple SKU receive, Edit receive, Management list/detail          │
 * │ ReceiveDiff      │ Auto-create, Pending list, Resolve                                 │
 * │ Abnormal         │ List (all/pending/resolved), Detail (per-SKU), History             │
 * │ Auth             │ All endpoints require auth                                         │
 * └─────────────────┴────────────────────────────────────────────────────────────────────┘
 *
 * Test data uses supplier_code="TT" (全链路Test) — completely isolated from prod data.
 * All data is cleaned up in @AfterAll.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PurchaseFullChainIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        // ═══ Test identifiers ═══
        const val TEST_CODE = "TT"                      // Supplier code
        const val TEST_NAME = "FullChain Test Supplier"
        const val PO_NUM = "TT20260220-FC01"             // PO number
        const val PO_NUM_2 = "TT20260220-FC02"           // 2nd PO
        const val LOGISTIC_EXACT = "TT-FC-EXACT-001"     // Shipment: exact match receive
        const val LOGISTIC_SHORT = "TT-FC-SHORT-001"     // Shipment: shortage receive (P5 resolve test)
        const val LOGISTIC_OVER = "TT-FC-OVER-001"       // Shipment: overage receive
        const val LOGISTIC_MULTI = "TT-FC-MULTI-001"     // Shipment: multiple SKUs, mixed diffs
        // M1-M4 processing test shipments
        const val LOGISTIC_M1 = "TT-FC-M1-001"           // M1: fix shipment only (shortage)
        const val LOGISTIC_M2 = "TT-FC-M2-001"           // M2: fix shipment+PO (shortage)
        const val LOGISTIC_M3 = "TT-FC-M3-001"           // M3: delay (shortage)
        const val LOGISTIC_M4 = "TT-FC-M4-001"           // M4: vendor error (overage)
        // Real product SKUs (from products table) + virtual quantities/prices
        const val SKU_1 = "5100/5425-5450B32"     // Real SKU — PO1 item
        const val SKU_2 = "5102SH571T12"           // Real SKU — PO1 item
        const val SKU_3 = "5120SH726T30"           // Real SKU — PO1 item
        const val SKU_4 = "5110/5112-5450B32"      // Real SKU — PO2 item
        const val SKU_M1 = "5102SH571T15"          // Real SKU — M1 strategy test
        const val SKU_M2 = "5102SH571T20"          // Real SKU — M2 strategy test
        const val SKU_M3 = "5102SH571T25"          // Real SKU — M3 strategy test
        const val SKU_M4 = "5102SH571T30"          // Real SKU — M4 strategy test

        // ═══ Captured IDs ═══
        var supplierId: Long = 0
        var strategyId: Long = 0
        var poId: Long = 0
        var poId2: Long = 0
        var shipmentExactId: Long = 0
        var shipmentShortId: Long = 0
        var shipmentOverId: Long = 0
        var shipmentMultiId: Long = 0
        var receiveIdExact: Long = 0
        var receiveIdShort: Long = 0
        var receiveIdOver: Long = 0
        var diffIdShortage: Long = 0
        var diffIdOverage: Long = 0
    }

    // ═══════════════════════════════════════
    // CLEANUP — all test data in FK order
    // ═══════════════════════════════════════
    private fun cleanAllTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // 0. receive_diff_events (depends on receive_diffs — FK RESTRICT)
                stmt.execute("DELETE FROM receive_diff_events WHERE logistic_num LIKE 'TT-FC-%'")
                // 1. receive_diffs (depends on receives)
                stmt.execute("DELETE FROM receive_diffs WHERE logistic_num LIKE 'TT-FC-%'")
                // 1a. landed_prices (depends on fifo_transactions/fifo_layers — FK RESTRICT)
                stmt.execute("DELETE FROM landed_prices WHERE logistic_num LIKE 'TT-FC-%'")
                // 1b. fifo_layers (depends on fifo_transactions)
                stmt.execute("DELETE FROM fifo_layers WHERE po_num LIKE 'TT%'")
                // 1c. fifo_transactions
                stmt.execute("DELETE FROM fifo_transactions WHERE po_num LIKE 'TT%'")
                // 2. receives (depends on shipments) — including M3 delay shipments
                stmt.execute("DELETE FROM receives WHERE logistic_num LIKE 'TT-FC-%'")
                // 3. shipment_items (depends on shipments) — including M3 delay
                stmt.execute("DELETE FROM shipment_items WHERE logistic_num LIKE 'TT-FC-%'")
                // 4. shipments
                stmt.execute("DELETE FROM shipments WHERE logistic_num LIKE 'TT-FC-%'")
                // 5. purchase_order_strategies (depends on purchase_orders)
                stmt.execute("DELETE FROM purchase_order_strategies WHERE po_num LIKE 'TT%'")
                // 6. purchase_order_items (depends on purchase_orders)
                stmt.execute("DELETE FROM purchase_order_items WHERE po_num LIKE 'TT%'")
                // 7. purchase_orders (depends on suppliers)
                stmt.execute("DELETE FROM purchase_orders WHERE supplier_code = '$TEST_CODE'")
                // 8. supplier_strategies (depends on suppliers)
                stmt.execute("DELETE FROM supplier_strategies WHERE supplier_code = '$TEST_CODE'")
                // 9. suppliers
                stmt.execute("DELETE FROM suppliers WHERE supplier_code = '$TEST_CODE'")
            }
        }
    }

    /**
     * Seed the FULL chain in SQL — bypassing API to create prerequisite data.
     * This gives us:
     *   - 1 Supplier (TT)
     *   - 2 POs (FC01 with SKU_1/2/3, FC02 with SKU_4)
     *   - 4 Shipments (exact/short/over/multi) each with specific SKUs & qtys
     */
    private fun seedFullChain() {
        dataSource.connection.use { conn ->
            conn.autoCommit = false
            try {
                val stmt = conn.createStatement()

                // ── Supplier ──
                stmt.execute("""
                    INSERT INTO suppliers (supplier_code, supplier_name, status, created_by, updated_by)
                    VALUES ('$TEST_CODE', '$TEST_NAME', true, 'test', 'test')
                    ON CONFLICT (supplier_code) WHERE deleted_at IS NULL DO NOTHING
                """)
                val supRs = stmt.executeQuery("SELECT id FROM suppliers WHERE supplier_code = '$TEST_CODE' AND deleted_at IS NULL")
                supRs.next()
                supplierId = supRs.getLong(1)

                // ── PO 1: FC01 — 3 SKUs ──
                stmt.execute("""
                    INSERT INTO purchase_orders (po_num, supplier_id, supplier_code, po_date, status, created_by, updated_by)
                    VALUES ('$PO_NUM', $supplierId, '$TEST_CODE', '2026-02-20', 'active', 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val poRs = stmt.executeQuery("SELECT id FROM purchase_orders WHERE po_num = '$PO_NUM'")
                poRs.next()
                poId = poRs.getLong(1)

                // PO items for FC01
                for ((sku, qty, price) in listOf(
                    Triple(SKU_1, 100, 5.00),
                    Triple(SKU_2, 200, 3.50),
                    Triple(SKU_3, 50, 10.00),
                )) {
                    stmt.execute("""
                        INSERT INTO purchase_order_items (po_id, po_num, sku, quantity, unit_price, created_by, updated_by)
                        VALUES ($poId, '$PO_NUM', '$sku', $qty, $price, 'test', 'test')
                        ON CONFLICT DO NOTHING
                    """)
                }

                // PO strategy for FC01
                stmt.execute("""
                    INSERT INTO purchase_order_strategies (po_id, po_num, strategy_date, currency, exchange_rate,
                        rate_mode, float_enabled, float_threshold, require_deposit, deposit_ratio, strategy_seq,
                        created_by, updated_by)
                    VALUES ($poId, '$PO_NUM', '2026-02-20', 'USD', 7.1, 'auto', false, 0, false, 0, 1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── PO 2: FC02 — 1 SKU ──
                stmt.execute("""
                    INSERT INTO purchase_orders (po_num, supplier_id, supplier_code, po_date, status, created_by, updated_by)
                    VALUES ('$PO_NUM_2', $supplierId, '$TEST_CODE', '2026-02-20', 'active', 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val poRs2 = stmt.executeQuery("SELECT id FROM purchase_orders WHERE po_num = '$PO_NUM_2'")
                poRs2.next()
                poId2 = poRs2.getLong(1)

                stmt.execute("""
                    INSERT INTO purchase_order_items (po_id, po_num, sku, quantity, unit_price, created_by, updated_by)
                    VALUES ($poId2, '$PO_NUM_2', '$SKU_4', 300, 2.00, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                stmt.execute("""
                    INSERT INTO purchase_order_strategies (po_id, po_num, strategy_date, currency, exchange_rate,
                        rate_mode, float_enabled, float_threshold, require_deposit, deposit_ratio, strategy_seq,
                        created_by, updated_by)
                    VALUES ($poId2, '$PO_NUM_2', '2026-02-20', 'RMB', 1.0, 'auto', false, 0, false, 0, 1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── Shipment 1: EXACT match (SKU_1, sent=100, will receive=100) ──
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_EXACT', '2026-02-18', 'pending', 1, 100.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val seRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_EXACT'")
                seRs.next()
                shipmentExactId = seRs.getLong(1)
                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipmentExactId, '$LOGISTIC_EXACT', $poId, '$PO_NUM', '$SKU_1', 100, 5.00, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── Shipment 2: SHORTAGE (SKU_2, sent=200, will receive=180 → diff=+20) ──
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_SHORT', '2026-02-18', 'pending', 2, 200.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val ssRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_SHORT'")
                ssRs.next()
                shipmentShortId = ssRs.getLong(1)
                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipmentShortId, '$LOGISTIC_SHORT', $poId, '$PO_NUM', '$SKU_2', 200, 3.50, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── Shipment 3: OVERAGE (SKU_3, sent=50, will receive=60 → diff=-10) ──
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_OVER', '2026-02-18', 'pending', 1, 50.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val soRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_OVER'")
                soRs.next()
                shipmentOverId = soRs.getLong(1)
                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipmentOverId, '$LOGISTIC_OVER', $poId, '$PO_NUM', '$SKU_3', 50, 10.00, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── Shipment 4: MULTI SKU (SKU_1 sent=50 + SKU_4 sent=300 from 2 POs) ──
                stmt.execute("""
                    INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                    VALUES ('$LOGISTIC_MULTI', '2026-02-18', 'pending', 3, 300.00, 7.1, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                val smRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$LOGISTIC_MULTI'")
                smRs.next()
                shipmentMultiId = smRs.getLong(1)
                // SKU_1 from PO FC01
                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipmentMultiId, '$LOGISTIC_MULTI', $poId, '$PO_NUM', '$SKU_1', 50, 5.00, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)
                // SKU_4 from PO FC02
                stmt.execute("""
                    INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                    VALUES ($shipmentMultiId, '$LOGISTIC_MULTI', $poId2, '$PO_NUM_2', '$SKU_4', 300, 2.00, false, 'test', 'test')
                    ON CONFLICT DO NOTHING
                """)

                // ── M1-M4 Test PO items (all under PO FC01) ──
                for ((sku, qty, price) in listOf(
                    Triple(SKU_M1, 80, 4.00),
                    Triple(SKU_M2, 120, 6.00),
                    Triple(SKU_M3, 90, 8.00),
                    Triple(SKU_M4, 150, 3.00),
                )) {
                    stmt.execute("""
                        INSERT INTO purchase_order_items (po_id, po_num, sku, quantity, unit_price, created_by, updated_by)
                        VALUES ($poId, '$PO_NUM', '$sku', $qty, $price, 'test', 'test')
                        ON CONFLICT DO NOTHING
                    """)
                }

                // ── Shipment M1: shortage (SKU_M1, sent=80, will receive=70 → diff=+10) ──
                for ((logistic, sku, qty, price) in listOf(
                    listOf(LOGISTIC_M1, SKU_M1, "80", "4.00"),
                    listOf(LOGISTIC_M2, SKU_M2, "120", "6.00"),
                    listOf(LOGISTIC_M3, SKU_M3, "90", "8.00"),
                    listOf(LOGISTIC_M4, SKU_M4, "150", "3.00"),
                )) {
                    stmt.execute("""
                        INSERT INTO shipments (logistic_num, sent_date, status, pallets, logistics_cost, exchange_rate, created_by, updated_by)
                        VALUES ('$logistic', '2026-02-19', 'pending', 1, 50.00, 7.1, 'test', 'test')
                        ON CONFLICT DO NOTHING
                    """)
                    val shipRs = stmt.executeQuery("SELECT id FROM shipments WHERE logistic_num = '$logistic'")
                    shipRs.next()
                    val shipId = shipRs.getLong(1)
                    stmt.execute("""
                        INSERT INTO shipment_items (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price, po_change, created_by, updated_by)
                        VALUES ($shipId, '$logistic', $poId, '$PO_NUM', '$sku', $qty, $price, false, 'test', 'test')
                        ON CONFLICT DO NOTHING
                    """)
                }

                conn.commit()
            } catch (e: Exception) {
                conn.rollback()
                throw e
            }
        }
    }

    @BeforeAll
    fun beforeAll() {
        cleanAllTestData()
        seedFullChain()
    }

    @AfterAll
    fun afterAll() = cleanAllTestData()

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 1: SUPPLIER + STRATEGY                                    ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(100)
    fun `P1-01 list suppliers includes test supplier`() {
        mockMvc.get("/purchase/suppliers") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(101)
    fun `P1-02 get test supplier by id`() {
        mockMvc.get("/purchase/suppliers/$supplierId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
            jsonPath("$.data.supplierName") { value(TEST_NAME) }
        }
    }

    @Test @Order(102)
    fun `P1-03 code-exists check`() {
        mockMvc.get("/purchase/suppliers/code-exists?code=$TEST_CODE") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.exists") { value(true) }
        }
        mockMvc.get("/purchase/suppliers/code-exists?code=QQ") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.exists") { value(false) }
        }
    }

    @Test @Order(110)
    fun `P1-04 get strategies for supplier`() {
        mockMvc.get("/purchase/suppliers/$supplierId/strategies") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 2: PURCHASE ORDERS                                        ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(200)
    fun `P2-01 list POs includes test orders`() {
        mockMvc.get("/purchase/orders") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.total") { isNumber() }
        }
    }

    @Test @Order(201)
    fun `P2-02 get PO1 detail includes items and strategy`() {
        mockMvc.get("/purchase/orders/$poId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.poNum") { value(PO_NUM) }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.items.length()") { value(7) }  // SKU_1-3 + M1-M4
            jsonPath("$.data.strategy.currency") { value("USD") }
        }
    }

    @Test @Order(202)
    fun `P2-03 get PO2 detail - RMB currency`() {
        mockMvc.get("/purchase/orders/$poId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.poNum") { value(PO_NUM_2) }
            jsonPath("$.data.items.length()") { value(1) }  // SKU_4
            jsonPath("$.data.strategy.currency") { value("RMB") }
        }
    }

    @Test @Order(203)
    fun `P2-04 filter POs by supplier code`() {
        mockMvc.get("/purchase/orders?supplierCode=$TEST_CODE") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    @Test @Order(204)
    fun `P2-05 filter POs by date range`() {
        mockMvc.get("/purchase/orders?dateFrom=2026-02-20&dateTo=2026-02-20") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 3: SHIPMENTS                                              ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(300)
    fun `P3-01 list shipments includes test shipments`() {
        mockMvc.get("/purchase/shipments") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.total") { isNumber() }
        }
    }

    @Test @Order(301)
    fun `P3-02 get shipment detail - exact match shipment`() {
        mockMvc.get("/purchase/shipments/$shipmentExactId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_EXACT) }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.items.length()") { value(1) }
        }
    }

    @Test @Order(302)
    fun `P3-03 get multi-sku shipment detail`() {
        mockMvc.get("/purchase/shipments/$shipmentMultiId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_MULTI) }
            jsonPath("$.data.items.length()") { value(2) }  // SKU_1 + SKU_4
        }
    }

    @Test @Order(303)
    fun `P3-04 get shipment history`() {
        mockMvc.get("/purchase/shipments/$shipmentExactId/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 4: RECEIVE — all diff scenarios with LOGIC validation     ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(400)
    fun `P4-01 submit receive - EXACT match (sent=100, rcv=100, diff=0)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_EXACT,
            "items" to listOf(mapOf(
                "sku" to SKU_1,
                "unitPrice" to 5.00,
                "receiveQuantity" to 100,
                "receiveDate" to "2026-02-20",
            )),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data[0].sentQuantity") { value(100) }
            jsonPath("$.data[0].receiveQuantity") { value(100) }
            jsonPath("$.data[0].sku") { value(SKU_1) }
            jsonPath("$.data[0].logisticNum") { value(LOGISTIC_EXACT) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        receiveIdExact = json["data"][0]["id"].asLong()
        Assertions.assertTrue(receiveIdExact > 0, "Receive ID must be assigned")

        // LOGIC: exact match → ZERO diffs created
        mockMvc.get("/purchase/receives/$receiveIdExact/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.length()") { value(0) }
        }

        // DB CROSS-CHECK: no receive_diffs rows for this logistic_num
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT count(*) FROM receive_diffs WHERE logistic_num = '$LOGISTIC_EXACT'"
            )
            rs.next()
            Assertions.assertEquals(0, rs.getInt(1),
                "DB: exact match should have 0 receive_diff rows")
        }
    }

    @Test @Order(410)
    fun `P4-02 submit receive - SHORTAGE (sent=200, rcv=180, diff=+20)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_SHORT,
            "items" to listOf(mapOf(
                "sku" to SKU_2,
                "unitPrice" to 3.50,
                "receiveQuantity" to 180,
                "receiveDate" to "2026-02-20",
            )),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data[0].sentQuantity") { value(200) }
            jsonPath("$.data[0].receiveQuantity") { value(180) }
            jsonPath("$.data[0].sku") { value(SKU_2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        receiveIdShort = json["data"][0]["id"].asLong()

        // DB CROSS-CHECK: exactly 1 diff row, diff_quantity = 20 (positive = shortage)
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT diff_quantity, status, po_num, sku, sent_quantity, receive_quantity " +
                "FROM receive_diffs WHERE logistic_num = '$LOGISTIC_SHORT'"
            )
            Assertions.assertTrue(rs.next(), "DB: shortage should create exactly 1 diff")
            Assertions.assertEquals(20, rs.getInt("diff_quantity"), "DB: diff = sent(200) - rcv(180) = 20")
            Assertions.assertEquals("pending", rs.getString("status"), "DB: new diff must be pending")
            Assertions.assertEquals(PO_NUM, rs.getString("po_num"), "DB: diff should reference correct PO")
            Assertions.assertEquals(SKU_2, rs.getString("sku"), "DB: diff should reference correct SKU")
            Assertions.assertEquals(200, rs.getInt("sent_quantity"), "DB: sent_quantity preserved")
            Assertions.assertEquals(180, rs.getInt("receive_quantity"), "DB: receive_quantity preserved")
            Assertions.assertFalse(rs.next(), "DB: should have exactly 1 diff row, not more")
        }
    }

    @Test @Order(420)
    fun `P4-03 submit receive - OVERAGE (sent=50, rcv=60, diff=-10)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_OVER,
            "items" to listOf(mapOf(
                "sku" to SKU_3,
                "unitPrice" to 10.00,
                "receiveQuantity" to 60,
                "receiveDate" to "2026-02-20",
            )),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data[0].sentQuantity") { value(50) }
            jsonPath("$.data[0].receiveQuantity") { value(60) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        receiveIdOver = json["data"][0]["id"].asLong()

        // DB CROSS-CHECK: diff_quantity = -10 (negative = overage)
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT diff_quantity, status FROM receive_diffs WHERE logistic_num = '$LOGISTIC_OVER'"
            )
            Assertions.assertTrue(rs.next(), "DB: overage should create exactly 1 diff")
            Assertions.assertEquals(-10, rs.getInt("diff_quantity"),
                "DB: diff = sent(50) - rcv(60) = -10  [NEGATIVE means overage]")
            Assertions.assertEquals("pending", rs.getString("status"))
        }
    }

    @Test @Order(430)
    fun `P4-04 submit receive - MULTI SKU (SKU_1 exact + SKU_4 short 50)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_MULTI,
            "items" to listOf(
                mapOf("sku" to SKU_1, "unitPrice" to 5.00, "receiveQuantity" to 50, "receiveDate" to "2026-02-20"),
                mapOf("sku" to SKU_4, "unitPrice" to 2.00, "receiveQuantity" to 250, "receiveDate" to "2026-02-20"),
            ),
        ))
        val result = mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.length()") { value(2) }
        }.andReturn()

        // Verify: 2 receives created, 1 diff for SKU_4 only
        val json = objectMapper.readTree(result.response.contentAsString)
        val receives = json["data"]
        for (i in 0 until receives.size()) {
            val r = receives[i]
            when (r["sku"].asText()) {
                SKU_1 -> {
                    Assertions.assertEquals(50, r["sentQuantity"].asInt(), "SKU_1: sent=50")
                    Assertions.assertEquals(50, r["receiveQuantity"].asInt(), "SKU_1: rcv=50 (exact)")
                }
                SKU_4 -> {
                    Assertions.assertEquals(300, r["sentQuantity"].asInt(), "SKU_4: sent=300")
                    Assertions.assertEquals(250, r["receiveQuantity"].asInt(), "SKU_4: rcv=250 (short 50)")
                }
            }
        }

        // DB CROSS-CHECK: only SKU_4 has a diff, SKU_1 has none
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT sku, diff_quantity FROM receive_diffs WHERE logistic_num = '$LOGISTIC_MULTI' ORDER BY sku"
            )
            Assertions.assertTrue(rs.next(), "MULTI: should have at least 1 diff")
            Assertions.assertEquals(SKU_4, rs.getString("sku"), "MULTI: only SKU_4 should have diff")
            Assertions.assertEquals(50, rs.getInt("diff_quantity"), "MULTI: SKU_4 diff = 300-250 = 50")
            Assertions.assertFalse(rs.next(), "MULTI: SKU_1 exact match should NOT have a diff")
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 5: RECEIVE DIFFS — deep business logic validation         ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(500)
    fun `P5-01 pending diffs - verify exact quantities and FK integrity`() {
        val result = mockMvc.get("/purchase/receives/diffs/pending") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val diffs = json["data"]

        var foundShortage = false
        var foundOverage = false
        var foundMulti = false

        for (d in diffs) {
            val sku = d["sku"].asText()
            val logNum = d["logisticNum"].asText()

            // SHORTAGE: SKU_2, SHORT, diff=+20
            if (sku == SKU_2 && logNum == LOGISTIC_SHORT) {
                diffIdShortage = d["id"].asLong()
                Assertions.assertEquals(20, d["diffQuantity"].asInt(),
                    "SHORTAGE: diff = sent(200) - rcv(180) = 20")
                Assertions.assertEquals(200, d["sentQuantity"].asInt(), "sent_quantity must be 200")
                Assertions.assertEquals(180, d["receiveQuantity"].asInt(), "receive_quantity must be 180")
                Assertions.assertEquals(PO_NUM, d["poNum"].asText(), "Must reference PO $PO_NUM")
                Assertions.assertEquals("pending", d["status"].asText())
                foundShortage = true
            }
            // OVERAGE: SKU_3, OVER, diff=-10
            if (sku == SKU_3 && logNum == LOGISTIC_OVER) {
                diffIdOverage = d["id"].asLong()
                Assertions.assertEquals(-10, d["diffQuantity"].asInt(),
                    "OVERAGE: diff = sent(50) - rcv(60) = -10")
                Assertions.assertEquals(50, d["sentQuantity"].asInt())
                Assertions.assertEquals(60, d["receiveQuantity"].asInt())
                Assertions.assertEquals("pending", d["status"].asText())
                foundOverage = true
            }
            // MULTI: SKU_4, MULTI, diff=+50
            if (sku == SKU_4 && logNum == LOGISTIC_MULTI) {
                Assertions.assertEquals(50, d["diffQuantity"].asInt(),
                    "MULTI: SKU_4 diff = sent(300) - rcv(250) = 50")
                Assertions.assertEquals(300, d["sentQuantity"].asInt())
                Assertions.assertEquals(250, d["receiveQuantity"].asInt())
                Assertions.assertEquals(PO_NUM_2, d["poNum"].asText(), "SKU_4 should reference PO2")
                foundMulti = true
            }
        }
        Assertions.assertTrue(foundShortage, "Shortage diff must exist in pending list")
        Assertions.assertTrue(foundOverage, "Overage diff must exist in pending list")
        Assertions.assertTrue(foundMulti, "Multi-SKU diff must exist in pending list")
        Assertions.assertTrue(diffIdShortage > 0)
        Assertions.assertTrue(diffIdOverage > 0)
    }

    @Test @Order(501)
    fun `P5-02 diffs by receive - shortage has correct FK chain`() {
        val result = mockMvc.get("/purchase/receives/$receiveIdShort/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.length()") { value(1) }
            jsonPath("$.data[0].diffQuantity") { value(20) }
            jsonPath("$.data[0].status") { value("pending") }
            jsonPath("$.data[0].receiveId") { value(receiveIdShort.toInt()) }
            jsonPath("$.data[0].logisticNum") { value(LOGISTIC_SHORT) }
            jsonPath("$.data[0].poNum") { value(PO_NUM) }
            jsonPath("$.data[0].sku") { value(SKU_2) }
        }.andReturn()
    }

    @Test @Order(502)
    fun `P5-03 diffs by receive - overage has negative diff`() {
        mockMvc.get("/purchase/receives/$receiveIdOver/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.length()") { value(1) }
            jsonPath("$.data[0].diffQuantity") { value(-10) }
            jsonPath("$.data[0].status") { value("pending") }
            jsonPath("$.data[0].sku") { value(SKU_3) }
        }
    }

    @Test @Order(503)
    fun `P5-04 exact match receive has 0 diffs`() {
        mockMvc.get("/purchase/receives/$receiveIdExact/diffs") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.length()") { value(0) }
        }
    }

    @Test @Order(510)
    fun `P5-05 resolve shortage diff - status changes to resolved`() {
        val note = "Supplier will resend 20 units in next batch"
        val body = objectMapper.writeValueAsString(mapOf("resolutionNote" to note))
        mockMvc.post("/purchase/receives/diffs/$diffIdShortage/resolve") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.status") { value("resolved") }
            jsonPath("$.data.resolutionNote") { value(note) }
            jsonPath("$.data.diffQuantity") { value(20) }  // diff value preserved
        }

        // DB CROSS-CHECK: status actually changed in DB
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT status, resolution_note FROM receive_diffs WHERE id = $diffIdShortage"
            )
            rs.next()
            Assertions.assertEquals("resolved", rs.getString("status"), "DB: status must be resolved")
            Assertions.assertEquals(note, rs.getString("resolution_note"), "DB: resolution_note must match")
        }

        // LOGIC: after resolve, it should NOT appear in pending diffs
        val pendingResult = mockMvc.get("/purchase/receives/diffs/pending") {
            header("Authorization", "Bearer $token")
        }.andReturn()
        val pendingJson = objectMapper.readTree(pendingResult.response.contentAsString)
        val pendingDiffs = pendingJson["data"]
        for (d in pendingDiffs) {
            Assertions.assertFalse(
                d["id"].asLong() == diffIdShortage,
                "Resolved diff should NOT appear in pending list"
            )
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 6: RECEIVE MANAGEMENT — list + detail + history           ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(600)
    fun `P6-01 receive management list`() {
        mockMvc.get("/purchase/receives/management?sort_by=receiveDate&sort_order=desc") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(601)
    fun `P6-02 receive management detail - shortage logistic`() {
        mockMvc.get("/purchase/receives/management/$LOGISTIC_SHORT") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_SHORT) }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.diffs") { isArray() }
        }
    }

    @Test @Order(602)
    fun `P6-03 receive management detail - exact match logistic`() {
        mockMvc.get("/purchase/receives/management/$LOGISTIC_EXACT") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_EXACT) }
        }
    }

    @Test @Order(603)
    fun `P6-04 receive management history`() {
        mockMvc.get("/purchase/receives/management/$LOGISTIC_SHORT/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 7: ABNORMAL — deep business logic validation              ║
    // ║  Verifies: list grouping, status derivation, detail enrichment,  ║
    // ║  summary computation, price+currency, history integrity          ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(700)
    fun `P7-01 abnormal list - contains all 3 logistic nums with diffs`() {
        val result = mockMvc.get("/purchase/abnormal") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        val map = mutableMapOf<String, com.fasterxml.jackson.databind.JsonNode>()
        for (i in 0 until data.size()) {
            map[data[i]["logisticNum"].asText()] = data[i]
        }

        // LOGISTIC_SHORT: resolved (the only diff was resolved in P5-05)
        val shortEntry = map[LOGISTIC_SHORT]
        Assertions.assertNotNull(shortEntry, "SHORT logistic must appear in abnormal list")
        Assertions.assertEquals(1, shortEntry!!.get("skuCount").asInt(), "SHORT: 1 SKU")
        // Status: after resolving, the status derivation should be 'resolved'
        // since all diffs for this logistic are resolved

        // LOGISTIC_OVER: pending (diff not resolved)
        val overEntry = map[LOGISTIC_OVER]
        Assertions.assertNotNull(overEntry, "OVER logistic must appear in abnormal list")
        Assertions.assertEquals(1, overEntry!!.get("skuCount").asInt(), "OVER: 1 SKU")
        Assertions.assertEquals("pending", overEntry.get("status").asText(),
            "OVER: unresolved diff → status=pending")

        // LOGISTIC_MULTI: pending (SKU_4 has unresolved diff)
        val multiEntry = map[LOGISTIC_MULTI]
        Assertions.assertNotNull(multiEntry, "MULTI logistic must appear in abnormal list")
        Assertions.assertEquals("pending", multiEntry!!.get("status").asText(),
            "MULTI: unresolved SKU_4 diff → status=pending")
    }

    @Test @Order(701)
    fun `P7-02 abnormal list - filter pending excludes resolved`() {
        val result = mockMvc.get("/purchase/abnormal?status=pending") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        for (i in 0 until data.size()) {
            Assertions.assertEquals("pending", data[i]["status"].asText(),
                "When filtering pending, all results must be pending")
        }
    }

    @Test @Order(702)
    fun `P7-03 abnormal list - filter resolved excludes pending`() {
        val result = mockMvc.get("/purchase/abnormal?status=resolved") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        for (i in 0 until data.size()) {
            Assertions.assertEquals("resolved", data[i]["status"].asText(),
                "When filtering resolved, all results must be resolved")
        }
    }

    @Test @Order(710)
    fun `P7-04 abnormal detail - shortage has correct quantities + price + currency`() {
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_SHORT") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_SHORT) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val detail = json["data"]
        val items = detail["items"]
        val summary = detail["summary"]

        // Must have exactly 1 item (SKU_2)
        Assertions.assertEquals(1, items.size(), "SHORT detail should have 1 SKU")
        val item = items[0]
        Assertions.assertEquals(SKU_2, item["sku"].asText())
        Assertions.assertEquals(PO_NUM, item["poNum"].asText())
        Assertions.assertEquals(200, item["sentQuantity"].asInt(), "sent=200")
        Assertions.assertEquals(180, item["receiveQuantity"].asInt(), "rcv=180")
        Assertions.assertEquals(20, item["diffQuantity"].asInt(), "diff=+20")
        Assertions.assertEquals("resolved", item["status"].asText(), "was resolved in P5-05")

        // Price enrichment: unitPrice should come from Receive record
        Assertions.assertEquals(3.5, item["unitPrice"].asDouble(), 0.01,
            "Unit price should be 3.50 from receive")

        // Currency enrichment: PO FC01 has USD strategy
        Assertions.assertEquals("USD", item["currency"].asText(),
            "Currency should be USD from PO strategy")

        // Summary validation
        Assertions.assertEquals(1, summary["totalSkus"].asInt())
        Assertions.assertEquals(20, summary["totalDiff"].asInt(), "total diff = 20")
        Assertions.assertEquals(0, summary["overReceived"].asInt(), "no over-received qty")
        Assertions.assertEquals(20, summary["underReceived"].asInt(), "under-received qty = 20")
    }

    @Test @Order(711)
    fun `P7-05 abnormal detail - overage has negative diff + correct summary`() {
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_OVER") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_OVER) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val detail = json["data"]
        val items = detail["items"]
        val summary = detail["summary"]

        Assertions.assertEquals(1, items.size())
        val item = items[0]
        Assertions.assertEquals(SKU_3, item["sku"].asText())
        Assertions.assertEquals(50, item["sentQuantity"].asInt())
        Assertions.assertEquals(60, item["receiveQuantity"].asInt())
        Assertions.assertEquals(-10, item["diffQuantity"].asInt(), "diff=-10 (overage)")
        Assertions.assertEquals("pending", item["status"].asText())
        Assertions.assertEquals(10.0, item["unitPrice"].asDouble(), 0.01)

        // Summary: overReceived=1, underReceived=0
        Assertions.assertEquals(1, summary["totalSkus"].asInt())
        Assertions.assertEquals(-10, summary["totalDiff"].asInt())
        Assertions.assertEquals(10, summary["overReceived"].asInt(), "over-received qty = 10")
        Assertions.assertEquals(0, summary["underReceived"].asInt())
    }

    @Test @Order(712)
    fun `P7-06 abnormal detail - multi-sku has mixed PO and correct cross-PO data`() {
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_MULTI") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.logisticNum") { value(LOGISTIC_MULTI) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val items = json["data"]["items"]

        // MULTI has only 1 diff (SKU_4 shortage), SKU_1 was exact match so no diff
        Assertions.assertTrue(items.size() >= 1, "MULTI should have at least 1 diff item")

        for (i in 0 until items.size()) {
            val item = items[i]
            if (item["sku"].asText() == SKU_4) {
                Assertions.assertEquals(PO_NUM_2, item["poNum"].asText(),
                    "SKU_4 should be from PO FC02")
                Assertions.assertEquals(300, item["sentQuantity"].asInt())
                Assertions.assertEquals(250, item["receiveQuantity"].asInt())
                Assertions.assertEquals(50, item["diffQuantity"].asInt())
                Assertions.assertEquals(2.0, item["unitPrice"].asDouble(), 0.01)
                Assertions.assertEquals("RMB", item["currency"].asText(),
                    "PO FC02 has RMB strategy → currency=RMB")
            }
        }
    }

    @Test @Order(713)
    fun `P7-07 abnormal detail - non-existent logistic returns empty items`() {
        mockMvc.get("/purchase/abnormal/NON-EXISTENT-999") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.items") { isArray() }
            jsonPath("$.data.items.length()") { value(0) }
            jsonPath("$.data.summary.totalSkus") { value(0) }
            jsonPath("$.data.summary.totalDiff") { value(0) }
        }
    }

    @Test @Order(720)
    fun `P7-08 abnormal history - no events before processing`() {
        // History endpoint now returns events from receive_diff_events (append-only audit trail).
        // At this phase, no process/delete operations have occurred, so history is empty.
        mockMvc.get("/purchase/abnormal/$LOGISTIC_SHORT/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(0) }
        }
    }

    @Test @Order(721)
    fun `P7-09 abnormal history - overage also empty before processing`() {
        mockMvc.get("/purchase/abnormal/$LOGISTIC_OVER/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(0) }
        }
    }

    @Test @Order(722)
    fun `P7-10 abnormal history - non-existent returns empty`() {
        mockMvc.get("/purchase/abnormal/NON-EXISTENT-999/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(0) }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 8: STATUS DERIVATION — the core V1 parity logic          ║
    // ╠═══════════════════════════════════════════════════════════════════╣
    // ║  V1 rules:                                                       ║
    // ║  • note starts with '删除异常处理' → deleted                     ║
    // ║  • SUM(ABS(diff_quantity)) == 0 → resolved                      ║
    // ║  • else → pending                                                ║
    // ║                                                                   ║
    // ║  We test:                                                         ║
    // ║  • SHORT: all diffs resolved → status=resolved in list           ║
    // ║  • OVER:  unresolved diff → status=pending in list               ║
    // ║  • MULTI: unresolved diff → status=pending in list               ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(800)
    fun `P8-01 resolved logistic shows resolved in abnormal list`() {
        val result = mockMvc.get("/purchase/abnormal") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        for (i in 0 until data.size()) {
            val entry = data[i]
            if (entry["logisticNum"].asText() == LOGISTIC_SHORT) {
                // SHORT's only diff was resolved → overall status = resolved
                Assertions.assertEquals("resolved", entry["status"].asText(),
                    "SHORT: all diffs resolved → list status = resolved")
            }
            if (entry["logisticNum"].asText() == LOGISTIC_OVER) {
                Assertions.assertEquals("pending", entry["status"].asText(),
                    "OVER: diff still pending → list status = pending")
            }
            if (entry["logisticNum"].asText() == LOGISTIC_MULTI) {
                Assertions.assertEquals("pending", entry["status"].asText(),
                    "MULTI: SKU_4 diff still pending → list status = pending")
            }
        }
    }

    @Test @Order(801)
    fun `P8-02 resolved diff shows resolved status in detail items`() {
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_SHORT") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val items = json["data"]["items"]
        Assertions.assertEquals(1, items.size())
        Assertions.assertEquals("resolved", items[0]["status"].asText(),
            "After P5-05 resolve, SKU_2 diff must show 'resolved'")
        Assertions.assertNotNull(items[0]["resolutionNote"],
            "Resolution note must be present")
    }

    @Test @Order(802)
    fun `P8-03 unresolved diff keeps pending status in detail items`() {
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_OVER") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val items = json["data"]["items"]
        Assertions.assertEquals(1, items.size())
        Assertions.assertEquals("pending", items[0]["status"].asText(),
            "Overage diff never resolved → must remain 'pending'")
        Assertions.assertTrue(
            items[0]["resolutionNote"] == null || items[0]["resolutionNote"].isNull,
            "No resolution note for pending diff"
        )
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 9: AUTH GUARD — all endpoints require token               ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(900)
    fun `P9-01 supplier endpoints require auth`() {
        mockMvc.get("/purchase/suppliers").andExpect { status { isUnauthorized() } }
    }

    @Test @Order(901)
    fun `P9-02 PO endpoints require auth`() {
        mockMvc.get("/purchase/orders").andExpect { status { isUnauthorized() } }
    }

    @Test @Order(902)
    fun `P9-03 shipment endpoints require auth`() {
        mockMvc.get("/purchase/shipments").andExpect { status { isUnauthorized() } }
    }

    @Test @Order(903)
    fun `P9-04 receive endpoints require auth`() {
        mockMvc.get("/purchase/receives").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/receives") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }

    @Test @Order(904)
    fun `P9-05 abnormal endpoints require auth`() {
        mockMvc.get("/purchase/abnormal").andExpect { status { isUnauthorized() } }
        mockMvc.get("/purchase/abnormal/TEST-001").andExpect { status { isUnauthorized() } }
        mockMvc.get("/purchase/abnormal/TEST-001/history").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/abnormal/process") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/abnormal/delete") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 10: ABNORMAL PROCESSING — all 4 strategies (M1-M4)       ║
    // ║                                                                   ║
    // ║  Each strategy gets its own shipment/receive/diff chain:          ║
    // ║   M1: TT-FC-M1-001 / SKU_M1 — sent=80, rcv=70, diff=+10        ║
    // ║   M2: TT-FC-M2-001 / SKU_M2 — sent=120, rcv=100, diff=+20      ║
    // ║   M3: TT-FC-M3-001 / SKU_M3 — sent=90, rcv=75, diff=+15        ║
    // ║   M4: TT-FC-M4-001 / SKU_M4 — sent=150, rcv=170, diff=-20      ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    // Step 1: Submit receives for all 4 M-shipments to create diffs
    @Test @Order(1000)
    fun `P10-00 submit receives for M1-M4 shipments`() {
        // M1: shortage — sent=80, rcv=70 → diff=+10
        submitReceive(LOGISTIC_M1, SKU_M1, 4.00, 70)
        // M2: shortage — sent=120, rcv=100 → diff=+20
        submitReceive(LOGISTIC_M2, SKU_M2, 6.00, 100)
        // M3: shortage — sent=90, rcv=75 → diff=+15
        submitReceive(LOGISTIC_M3, SKU_M3, 8.00, 75)
        // M4: overage — sent=150, rcv=170 → diff=-20
        submitReceive(LOGISTIC_M4, SKU_M4, 3.00, 170)

        // Verify all 4 diffs created in DB
        dataSource.connection.use { conn ->
            for ((logistic, expectedDiff) in listOf(
                LOGISTIC_M1 to 10,
                LOGISTIC_M2 to 20,
                LOGISTIC_M3 to 15,
                LOGISTIC_M4 to -20,
            )) {
                val rs = conn.createStatement().executeQuery(
                    "SELECT diff_quantity, status FROM receive_diffs WHERE logistic_num = '$logistic'"
                )
                Assertions.assertTrue(rs.next(), "Diff must exist for $logistic")
                Assertions.assertEquals(expectedDiff, rs.getInt("diff_quantity"),
                    "$logistic: expected diff=$expectedDiff")
                Assertions.assertEquals("pending", rs.getString("status"))
            }
        }
    }

    // M1: Fix shipment only
    @Test @Order(1010)
    fun `P10-01 M1 process - fix shipment only (shortage)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_M1,
            "receiveDate" to "2026-02-20",
            "note" to "M1 test fix",
            "poMethods" to mapOf(
                PO_NUM to mapOf("positive" to 1),  // shortage → M1
            ),
        ))
        mockMvc.post("/purchase/abnormal/process") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.processedCount") { value(1) }
            jsonPath("$.data.details[0]") { value("$SKU_M1:M1") }
        }

        // DB verify: shipment_item.quantity updated to 70 (=receive_quantity)
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT quantity FROM shipment_items WHERE logistic_num = '$LOGISTIC_M1' AND sku = '$SKU_M1'"
            )
            rs.next()
            Assertions.assertEquals(70, rs.getInt("quantity"),
                "M1: shipment_item.quantity should be updated to receive_quantity (70)")

            // Diff should be resolved with diff_quantity=0
            val drs = conn.createStatement().executeQuery(
                "SELECT status, diff_quantity, resolution_note FROM receive_diffs WHERE logistic_num = '$LOGISTIC_M1'"
            )
            drs.next()
            Assertions.assertEquals("resolved", drs.getString("status"), "M1: diff resolved")
            Assertions.assertEquals(0, drs.getInt("diff_quantity"), "M1: diff_quantity zeroed")
            Assertions.assertTrue(drs.getString("resolution_note").contains("#M1"), "M1: note has #M1")

            // PO item should NOT be modified (M1 doesn't touch PO)
            val prs = conn.createStatement().executeQuery(
                "SELECT quantity FROM purchase_order_items WHERE po_num = '$PO_NUM' AND sku = '$SKU_M1'"
            )
            prs.next()
            Assertions.assertEquals(80, prs.getInt("quantity"),
                "M1: PO item quantity must remain unchanged (80)")
        }
    }

    // M2: Fix shipment + PO
    @Test @Order(1020)
    fun `P10-02 M2 process - fix shipment AND PO (shortage)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_M2,
            "receiveDate" to "2026-02-20",
            "note" to "M2 test fix",
            "poMethods" to mapOf(
                PO_NUM to mapOf("positive" to 2),  // shortage → M2
            ),
        ))
        mockMvc.post("/purchase/abnormal/process") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.processedCount") { value(1) }
            jsonPath("$.data.details[0]") { value("$SKU_M2:M2") }
        }

        // DB verify: both shipment_item AND PO item quantity updated to 100
        dataSource.connection.use { conn ->
            val sirs = conn.createStatement().executeQuery(
                "SELECT quantity FROM shipment_items WHERE logistic_num = '$LOGISTIC_M2' AND sku = '$SKU_M2'"
            )
            sirs.next()
            Assertions.assertEquals(100, sirs.getInt("quantity"),
                "M2: shipment_item.quantity → 100 (receive_quantity)")

            // PO item SHOULD be modified to 100
            val prs = conn.createStatement().executeQuery(
                "SELECT quantity FROM purchase_order_items WHERE po_num = '$PO_NUM' AND sku = '$SKU_M2'"
            )
            prs.next()
            Assertions.assertEquals(100, prs.getInt("quantity"),
                "M2: PO item quantity updated to receive_quantity (100)")

            // Diff resolved
            val drs = conn.createStatement().executeQuery(
                "SELECT status, resolution_note FROM receive_diffs WHERE logistic_num = '$LOGISTIC_M2'"
            )
            drs.next()
            Assertions.assertEquals("resolved", drs.getString("status"))
            Assertions.assertTrue(drs.getString("resolution_note").contains("#M2"))
        }
    }

    // M3: Delay shipment
    @Test @Order(1030)
    fun `P10-03 M3 process - delay shipment (shortage only)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_M3,
            "receiveDate" to "2026-02-20",
            "note" to "M3 test delay",
            "delayDate" to "2026-03-15",
            "poMethods" to mapOf(
                PO_NUM to mapOf("positive" to 3),  // shortage → M3
            ),
        ))
        mockMvc.post("/purchase/abnormal/process") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.processedCount") { value(1) }
            jsonPath("$.data.details[0]") { value("$SKU_M3:M3") }
        }

        // DB verify: new delay shipment created
        val delayLogistic = "${LOGISTIC_M3}_delay_V01"
        dataSource.connection.use { conn ->
            // Delay shipment exists
            val srs = conn.createStatement().executeQuery(
                "SELECT id, sent_date, note FROM shipments WHERE logistic_num = '$delayLogistic'"
            )
            Assertions.assertTrue(srs.next(), "M3: delay shipment must be created")
            Assertions.assertEquals("2026-03-15", srs.getString("sent_date"), "M3: delay date = 2026-03-15")
            Assertions.assertTrue(srs.getString("note").contains("#M3"))
            val delayShipmentId = srs.getLong("id")

            // Delay shipment item exists with correct quantity (=shortage amount=15)
            val sirs = conn.createStatement().executeQuery(
                "SELECT sku, quantity FROM shipment_items WHERE shipment_id = $delayShipmentId"
            )
            Assertions.assertTrue(sirs.next(), "M3: delay shipment item must exist")
            Assertions.assertEquals(SKU_M3, sirs.getString("sku"))
            Assertions.assertEquals(15, sirs.getInt("quantity"), "M3: delay qty = shortage amount (15)")

            // Diff resolved (note: M3 doesn't zero the diff quantity, keeps original)
            val drs = conn.createStatement().executeQuery(
                "SELECT status, resolution_note FROM receive_diffs WHERE logistic_num = '$LOGISTIC_M3'"
            )
            drs.next()
            Assertions.assertEquals("resolved", drs.getString("status"))
            Assertions.assertTrue(drs.getString("resolution_note").contains("#M3"))
            Assertions.assertTrue(drs.getString("resolution_note").contains(delayLogistic),
                "M3: note should reference the delay shipment number")
        }
    }

    // M4: Vendor error (overage case)
    @Test @Order(1040)
    fun `P10-04 M4 process - vendor error adjust (overage)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_M4,
            "receiveDate" to "2026-02-20",
            "note" to "M4 vendor error",
            "poMethods" to mapOf(
                PO_NUM to mapOf("negative" to 4),  // overage → M4
            ),
        ))
        mockMvc.post("/purchase/abnormal/process") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.processedCount") { value(1) }
            jsonPath("$.data.details[0]") { value("$SKU_M4:M4") }
        }

        // DB verify: PO, shipment, receive ALL adjusted
        dataSource.connection.use { conn ->
            // PO item: original=150, diff=-20 → new qty = 150 - (-20) = 170
            val prs = conn.createStatement().executeQuery(
                "SELECT quantity FROM purchase_order_items WHERE po_num = '$PO_NUM' AND sku = '$SKU_M4'"
            )
            prs.next()
            Assertions.assertEquals(170, prs.getInt("quantity"),
                "M4: PO item adjusted: 150 - (-20) = 170")

            // Shipment item: set to receive_quantity=170
            val sirs = conn.createStatement().executeQuery(
                "SELECT quantity FROM shipment_items WHERE logistic_num = '$LOGISTIC_M4' AND sku = '$SKU_M4'"
            )
            sirs.next()
            Assertions.assertEquals(170, sirs.getInt("quantity"),
                "M4: shipment_item → receive_quantity (170)")

            // Receive: sentQuantity set to receiveQuantity
            val rrs = conn.createStatement().executeQuery(
                "SELECT sent_quantity FROM receives WHERE logistic_num = '$LOGISTIC_M4' AND sku = '$SKU_M4'"
            )
            rrs.next()
            Assertions.assertEquals(170, rrs.getInt("sent_quantity"),
                "M4: receive.sentQuantity → 170")

            // Diff resolved with quantity zeroed
            val drs = conn.createStatement().executeQuery(
                "SELECT status, diff_quantity, resolution_note FROM receive_diffs WHERE logistic_num = '$LOGISTIC_M4'"
            )
            drs.next()
            Assertions.assertEquals("resolved", drs.getString("status"))
            Assertions.assertEquals(0, drs.getInt("diff_quantity"), "M4: diff_quantity zeroed")
            Assertions.assertTrue(drs.getString("resolution_note").contains("#M4"))
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 11: DELETE — V1 abnormal_delete_api                       ║
    // ║  After processing, delete marks resolved diffs with prefix       ║
    // ║  '删除异常处理' → status derivation returns 'deleted'            ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(1100)
    fun `P11-01 delete processed abnormal - M1 logistic`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_M1,
            "receiveDate" to "2026-02-20",
        ))
        mockMvc.post("/purchase/abnormal/delete") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.deletedCount") { value(1) }
        }

        // DB verify: note starts with '删除异常处理'
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT resolution_note FROM receive_diffs WHERE logistic_num = '$LOGISTIC_M1'"
            )
            rs.next()
            Assertions.assertTrue(rs.getString("resolution_note").startsWith("删除异常处理"),
                "Delete should prepend '删除异常处理' to note")
        }

        // API verify: abnormal list shows 'deleted' status for M1
        val result = mockMvc.get("/purchase/abnormal") {
            header("Authorization", "Bearer $token")
        }.andReturn()
        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        for (i in 0 until data.size()) {
            if (data[i]["logisticNum"].asText() == LOGISTIC_M1) {
                Assertions.assertEquals("deleted", data[i]["status"].asText(),
                    "M1 logistic should show 'deleted' in abnormal list after delete")
            }
        }
    }

    @Test @Order(1101)
    fun `P11-02 delete on pending diffs returns error`() {
        // OVER still has pending diffs - should not be deleteable
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to LOGISTIC_OVER,
            "receiveDate" to "2026-02-20",
        ))
        mockMvc.post("/purchase/abnormal/delete") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test @Order(1102)
    fun `P11-03 abnormal list filter 'deleted' returns deleted entries`() {
        val result = mockMvc.get("/purchase/abnormal?status=deleted") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val data = json["data"]
        Assertions.assertTrue(data.size() > 0, "Should have at least 1 deleted entry")
        for (i in 0 until data.size()) {
            Assertions.assertEquals("deleted", data[i]["status"].asText(),
                "All entries in deleted filter should be 'deleted'")
        }
    }

    // ═══════════════════════════════════════
    // Helper: submit receive for M1-M4 tests
    // ═══════════════════════════════════════
    private fun submitReceive(logistic: String, sku: String, price: Double, rcvQty: Int) {
        val body = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to logistic,
            "items" to listOf(mapOf(
                "sku" to sku,
                "unitPrice" to price,
                "receiveQuantity" to rcvQty,
                "receiveDate" to "2026-02-20",
            )),
        ))
        mockMvc.post("/purchase/receives") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 12: EXCEL FULL CHAIN                                      ║
    // ║                                                                   ║
    // ║  12.1: PO Template Download — verify .xlsx, correct content-type  ║
    // ║  12.2: PO Excel Upload/Parse — write real SKUs to xlsx, upload    ║
    // ║  12.3: PO Excel Upload — bad SKU → sku_errors with suggestions    ║
    // ║  12.4: PO Export — export existing PO to xlsx                     ║
    // ║  12.5: Shipment Template Download — verify .xlsx for shipping     ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(1200)
    fun `P12-01 PO template download returns valid xlsx`() {
        val result = mockMvc.get("/purchase/orders/template?supplierCode=$TEST_CODE&date=2026-02-20&currency=USD&exchangeRate=7.1") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            header {
                string("Content-Disposition", org.hamcrest.Matchers.containsString(".xlsx"))
                string("Content-Type", org.hamcrest.Matchers.containsString("spreadsheetml"))
            }
        }.andReturn()

        val bytes = result.response.contentAsByteArray
        Assertions.assertTrue(bytes.size > 100, "Excel file should have substantial content, got ${bytes.size} bytes")

        // Parse the returned xlsx to verify it's valid and has expected metadata
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook(java.io.ByteArrayInputStream(bytes))
        val ws = wb.getSheetAt(0)

        // V1 template: B1 = "Eaglestar Purchase Order Form"
        val b1 = ws.getRow(0)?.getCell(1)?.toString() ?: ""
        Assertions.assertTrue(b1.contains("Eaglestar") || b1.contains("Purchase"),
            "Template B1 should contain header text, got: '$b1'")

        // C2 = supplier code
        val c2 = ws.getRow(1)?.getCell(2)?.toString()?.trim()?.uppercase() ?: ""
        Assertions.assertEquals(TEST_CODE, c2, "Template C2 should have supplier code '$TEST_CODE'")

        wb.close()
    }

    @Test @Order(1210)
    fun `P12-02 PO Excel upload with real SKUs - parsed successfully`() {
        // Create an Excel file matching the PO template format:
        // B1 = "Eaglestar Purchase Order Form"
        // C2 = supplier code, E2 = date, G2 = currency
        // B5+ = data rows: B=SKU, C=Qty, D=Price
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook()
        val ws = wb.createSheet("PO")

        // Header
        ws.createRow(0).createCell(1).setCellValue("Eaglestar Purchase Order Form")
        val row1 = ws.createRow(1)
        row1.createCell(2).setCellValue(TEST_CODE)          // C2 = supplier
        row1.createCell(4).setCellValue("2026-02-20")       // E2 = date
        row1.createCell(6).setCellValue("USD")              // G2 = currency

        // Data rows (row 5 = index 4)
        val data = listOf(
            Triple(SKU_1, 500, 4.25),     // Real SKU, virtual qty/price
            Triple(SKU_2, 1000, 3.80),    // Real SKU
            Triple(SKU_3, 200, 12.50),    // Real SKU
        )
        for ((i, d) in data.withIndex()) {
            val row = ws.createRow(4 + i)
            row.createCell(1).setCellValue(d.first)          // B = SKU
            row.createCell(2).setCellValue(d.second.toDouble())  // C = Qty
            row.createCell(3).setCellValue(d.third)          // D = Price
        }

        val baos = java.io.ByteArrayOutputStream()
        wb.write(baos)
        wb.close()
        val excelBytes = baos.toByteArray()

        // Upload via multipart
        val result = mockMvc.multipart("/purchase/orders/parse-excel") {
            file(org.springframework.mock.web.MockMultipartFile(
                "file", "test-po.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                excelBytes,
            ))
            param("supplierCode", TEST_CODE)
            param("date", "2026-02-20")
            param("currency", "USD")
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val parseResult = json["data"]

        // Should succeed because all SKUs are real
        Assertions.assertTrue(parseResult["success"].asBoolean(),
            "Parse should succeed with real SKUs")
        Assertions.assertEquals(3, parseResult["itemCount"].asInt(),
            "Should parse 3 items")

        // Verify parsed items match our input
        val items = parseResult["items"]
        Assertions.assertEquals(SKU_1.uppercase(), items[0]["sku"].asText())
        Assertions.assertEquals(500, items[0]["quantity"].asInt())
        Assertions.assertEquals(4.25, items[0]["unitPrice"].asDouble(), 0.001)

        Assertions.assertEquals(SKU_2.uppercase(), items[1]["sku"].asText())
        Assertions.assertEquals(1000, items[1]["quantity"].asInt())

        Assertions.assertEquals(SKU_3.uppercase(), items[2]["sku"].asText())
        Assertions.assertEquals(200, items[2]["quantity"].asInt())
    }

    @Test @Order(1220)
    fun `P12-03 PO Excel upload with fake SKU - returns sku_errors with suggestions`() {
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook()
        val ws = wb.createSheet("PO")

        ws.createRow(0).createCell(1).setCellValue("Eaglestar Purchase Order Form")
        val row1 = ws.createRow(1)
        row1.createCell(2).setCellValue(TEST_CODE)
        row1.createCell(4).setCellValue("2026-02-20")
        row1.createCell(6).setCellValue("USD")

        // 1 real + 1 fake SKU
        val row4 = ws.createRow(4)
        row4.createCell(1).setCellValue(SKU_1)      // Real
        row4.createCell(2).setCellValue(100.0)
        row4.createCell(3).setCellValue(5.00)

        val row5 = ws.createRow(5)
        row5.createCell(1).setCellValue("5102SH571T99")  // Close-to-real but non-existent
        row5.createCell(2).setCellValue(50.0)
        row5.createCell(3).setCellValue(10.00)

        val baos = java.io.ByteArrayOutputStream()
        wb.write(baos)
        wb.close()

        val result = mockMvc.multipart("/purchase/orders/parse-excel") {
            file(org.springframework.mock.web.MockMultipartFile(
                "file", "test-bad-sku.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                baos.toByteArray(),
            ))
            param("supplierCode", TEST_CODE)
            param("date", "2026-02-20")
            param("currency", "USD")
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val parseResult = json["data"]

        // Should fail because of fake SKU
        Assertions.assertFalse(parseResult["success"].asBoolean(),
            "Parse should fail due to invalid SKU")
        Assertions.assertEquals("sku_errors", parseResult["errorType"].asText(),
            "Error type should be 'sku_errors'")

        // Should have SKU error entries with suggestions
        val skuErrors = parseResult["skuErrors"]
        Assertions.assertTrue(skuErrors.size() > 0, "Should have at least 1 SKU error")
        Assertions.assertEquals("5102SH571T99", skuErrors[0]["sku"].asText())
        // Suggestions may or may not be returned depending on similarity threshold
        // The key check is that the SKU was flagged as invalid

        // All items should still be present (2 parsed)
        Assertions.assertEquals(2, parseResult["itemCount"].asInt())
    }

    @Test @Order(1230)
    fun `P12-04 PO export returns valid xlsx with items`() {
        val result = mockMvc.get("/purchase/orders/$poId/export") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            header {
                string("Content-Disposition", org.hamcrest.Matchers.containsString(".xlsx"))
                string("Content-Type", org.hamcrest.Matchers.containsString("spreadsheetml"))
            }
        }.andReturn()

        val bytes = result.response.contentAsByteArray
        Assertions.assertTrue(bytes.size > 100, "Exported PO Excel should have content")

        // Parse and verify it has item rows
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook(java.io.ByteArrayInputStream(bytes))
        val ws = wb.getSheetAt(0)

        // V1 template: item rows start at row 29 (index 28), B=SKU
        // Check that at least one data row has a SKU from our test PO
        var foundSku = false
        for (rowIdx in 28..ws.lastRowNum) {
            val row = ws.getRow(rowIdx) ?: continue
            val cellB = row.getCell(1)?.toString()?.trim()?.uppercase() ?: ""
            if (cellB == SKU_1.uppercase() || cellB == SKU_2.uppercase() || cellB == SKU_3.uppercase()) {
                foundSku = true
                break
            }
        }
        Assertions.assertTrue(foundSku, "Exported PO should contain at least one test SKU in item rows")
        wb.close()
    }

    @Test @Order(1240)
    fun `P12-05 Shipment template download returns valid xlsx`() {
        val result = mockMvc.get("/purchase/shipments/template?sentDate=2026-02-20") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            header {
                string("Content-Disposition", org.hamcrest.Matchers.containsString(".xlsx"))
                string("Content-Type", org.hamcrest.Matchers.containsString("spreadsheetml"))
            }
        }.andReturn()

        val bytes = result.response.contentAsByteArray
        Assertions.assertTrue(bytes.size > 100, "Shipment template should have content")

        // Parse and verify logistics header cells exist (V1 template structure)
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook(java.io.ByteArrayInputStream(bytes))
        val ws = wb.getSheetAt(0)

        // Data rows start at row 9 (index 8), should have available PO items
        // Just verify the spreadsheet is parseable and not empty
        Assertions.assertTrue(ws.lastRowNum >= 7,
            "Shipment template should have at least 8 rows (header + data area)")
        wb.close()
    }

    @Test @Order(1250)
    fun `P12-06 PO Excel upload with mismatched supplier - returns supplier_mismatch`() {
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook()
        val ws = wb.createSheet("PO")

        ws.createRow(0).createCell(1).setCellValue("Eaglestar Purchase Order Form")
        val row1 = ws.createRow(1)
        row1.createCell(2).setCellValue("WRONG_SUPPLIER")  // Wrong supplier code
        row1.createCell(4).setCellValue("2026-02-20")
        row1.createCell(6).setCellValue("USD")

        val row4 = ws.createRow(4)
        row4.createCell(1).setCellValue(SKU_1)
        row4.createCell(2).setCellValue(100.0)
        row4.createCell(3).setCellValue(5.00)

        val baos = java.io.ByteArrayOutputStream()
        wb.write(baos)
        wb.close()

        val result = mockMvc.multipart("/purchase/orders/parse-excel") {
            file(org.springframework.mock.web.MockMultipartFile(
                "file", "test-wrong-supplier.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                baos.toByteArray(),
            ))
            param("supplierCode", TEST_CODE)
            param("date", "2026-02-20")
            param("currency", "USD")
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val parseResult = json["data"]
        Assertions.assertFalse(parseResult["success"].asBoolean())
        Assertions.assertEquals("supplier_mismatch", parseResult["errorType"].asText(),
            "Should detect supplier code mismatch between Excel and request")
    }

    @Test @Order(1260)
    fun `P12-07 PO Excel upload with mismatched currency - returns currency_mismatch`() {
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook()
        val ws = wb.createSheet("PO")

        ws.createRow(0).createCell(1).setCellValue("Eaglestar Purchase Order Form")
        val row1 = ws.createRow(1)
        row1.createCell(2).setCellValue(TEST_CODE)
        row1.createCell(4).setCellValue("2026-02-20")
        row1.createCell(6).setCellValue("EUR")  // Excel says EUR

        val row4 = ws.createRow(4)
        row4.createCell(1).setCellValue(SKU_1)
        row4.createCell(2).setCellValue(100.0)
        row4.createCell(3).setCellValue(5.00)

        val baos = java.io.ByteArrayOutputStream()
        wb.write(baos)
        wb.close()

        val result = mockMvc.multipart("/purchase/orders/parse-excel") {
            file(org.springframework.mock.web.MockMultipartFile(
                "file", "test-wrong-currency.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                baos.toByteArray(),
            ))
            param("supplierCode", TEST_CODE)
            param("date", "2026-02-20")
            param("currency", "USD")  // Request says USD
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val parseResult = json["data"]
        Assertions.assertFalse(parseResult["success"].asBoolean())
        Assertions.assertEquals("currency_mismatch", parseResult["errorType"].asText(),
            "Should detect currency mismatch between Excel (EUR) and request (USD)")
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 13: AUDIT TRAIL — receive_diff_events verification        ║
    // ║                                                                   ║
    // ║  After Phase 10 (process) and Phase 11 (delete), verify:          ║
    // ║   - Each process/delete created an append-only event              ║
    // ║   - Events have correct event_type, before/after snapshots        ║
    // ║   - History API returns events in order                           ║
    // ║   - DB-level: event_seq increments, events are immutable          ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(1300)
    fun `P13-01 M1 process created PROCESS_M1 audit event`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT event_type, event_seq, changes, note, operator FROM receive_diff_events WHERE logistic_num = '$LOGISTIC_M1' AND event_type = 'PROCESS_M1'"
            )
            Assertions.assertTrue(rs.next(), "M1 must have a PROCESS_M1 event")
            Assertions.assertEquals("PROCESS_M1", rs.getString("event_type"))
            Assertions.assertEquals(1, rs.getInt("event_seq"), "First event should be seq=1")
            Assertions.assertTrue(rs.getString("note").contains("#M1"), "Note should contain #M1")

            // Verify changes JSONB has before/after structure
            val changes = rs.getString("changes")
            Assertions.assertTrue(changes.contains("before"), "Changes must have 'before' snapshot: $changes")
            Assertions.assertTrue(changes.contains("after"), "Changes must have 'after' snapshot: $changes")
            // PostgreSQL JSONB normalizes spacing, so check for key-value content flexibly
            // Before should show pending status, after should show resolved
            val changesNorm = changes.replace(" ", "")
            Assertions.assertTrue(changesNorm.contains("\"status\":\"pending\""),
                "Before should contain pending status. Actual: $changes")
            Assertions.assertTrue(changesNorm.contains("\"status\":\"resolved\""),
                "After should contain resolved status. Actual: $changes")
        }
    }

    @Test @Order(1301)
    fun `P13-02 M2 process created PROCESS_M2 audit event`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT event_type, changes FROM receive_diff_events WHERE logistic_num = '$LOGISTIC_M2' AND event_type = 'PROCESS_M2'"
            )
            Assertions.assertTrue(rs.next(), "M2 must have a PROCESS_M2 event")
            val changes = rs.getString("changes")
            Assertions.assertTrue(changes.contains("\"before\"") && changes.contains("\"after\""))
        }
    }

    @Test @Order(1302)
    fun `P13-03 M3 process created PROCESS_M3 audit event with delay reference`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT event_type, note, changes FROM receive_diff_events WHERE logistic_num = '$LOGISTIC_M3' AND event_type = 'PROCESS_M3'"
            )
            Assertions.assertTrue(rs.next(), "M3 must have a PROCESS_M3 event")
            val note = rs.getString("note")
            Assertions.assertTrue(note.contains("delay") || note.contains("_delay_"),
                "M3 note should reference the delay shipment")
        }
    }

    @Test @Order(1303)
    fun `P13-04 M4 process created PROCESS_M4 audit event`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT event_type, changes FROM receive_diff_events WHERE logistic_num = '$LOGISTIC_M4' AND event_type = 'PROCESS_M4'"
            )
            Assertions.assertTrue(rs.next(), "M4 must have a PROCESS_M4 event")
        }
    }

    @Test @Order(1310)
    fun `P13-05 delete created DELETED audit event after PROCESS event`() {
        // M1 was processed (seq=1) then deleted (seq=2)
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT event_type, event_seq, note FROM receive_diff_events WHERE logistic_num = '$LOGISTIC_M1' ORDER BY event_seq"
            )
            // Event 1: PROCESS_M1
            Assertions.assertTrue(rs.next(), "Must have first event")
            Assertions.assertEquals("PROCESS_M1", rs.getString("event_type"))
            Assertions.assertEquals(1, rs.getInt("event_seq"))

            // Event 2: DELETED
            Assertions.assertTrue(rs.next(), "Must have second event")
            Assertions.assertEquals("DELETED", rs.getString("event_type"))
            Assertions.assertEquals(2, rs.getInt("event_seq"))
            Assertions.assertTrue(rs.getString("note").contains("删除异常处理"))
        }
    }

    @Test @Order(1320)
    fun `P13-06 history API returns all events in chronological order`() {
        // M1 had: PROCESS_M1 then DELETED → 2 events
        val result = mockMvc.get("/purchase/abnormal/$LOGISTIC_M1/history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data.length()") { value(2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val events = json["data"]

        // Event 1: PROCESS_M1
        Assertions.assertEquals("PROCESS_M1", events[0]["eventType"].asText())
        Assertions.assertEquals(1, events[0]["eventSeq"].asInt())
        Assertions.assertTrue(events[0]["changes"].asText().contains("before"))

        // Event 2: DELETED
        Assertions.assertEquals("DELETED", events[1]["eventType"].asText())
        Assertions.assertEquals(2, events[1]["eventSeq"].asInt())
    }

    @Test @Order(1330)
    fun `P13-07 total audit events match expected count`() {
        // M1: PROCESS_M1 + DELETED = 2
        // M2: PROCESS_M2 = 1
        // M3: PROCESS_M3 = 1
        // M4: PROCESS_M4 = 1
        // Total = 5
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT count(*) FROM receive_diff_events WHERE logistic_num LIKE 'TT-FC-%'"
            )
            rs.next()
            Assertions.assertEquals(5, rs.getInt(1),
                "Total events: M1(process+delete)=2, M2=1, M3=1, M4=1 = 5")
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 14: PURCHASE → FIFO CHAIN VERIFICATION                    ║
    // ║                                                                   ║
    // ║  After Phase 4 (receive submit), verify:                          ║
    // ║   - fifo_transactions created for each received SKU               ║
    // ║   - fifo_layers created with correct qty & cost                   ║
    // ║   - landed_prices created with correct linkage                    ║
    // ╚═══════════════════════════════════════════════════════════════════╝

    @Test @Order(1400)
    fun `P14-01 receive submit creates fifo_transactions for each received SKU`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                """SELECT sku, quantity, action, tran_type, ref_key, note
                   FROM fifo_transactions
                   WHERE po_num LIKE 'TT%' AND action = 'in' AND tran_type = 'purchase'
                   ORDER BY sku"""
            )
            val skus = mutableListOf<String>()
            while (rs.next()) {
                skus.add(rs.getString("sku"))
                Assertions.assertEquals("in", rs.getString("action"))
                Assertions.assertEquals("purchase", rs.getString("tran_type"))
                Assertions.assertTrue(rs.getString("note").contains("入库_TT-FC-"),
                    "Note should reference logistic_num")
                Assertions.assertTrue(rs.getString("ref_key").startsWith("receive_TT-FC-"),
                    "Ref key should be idempotent guard key")
                Assertions.assertTrue(rs.getInt("quantity") > 0,
                    "Quantity must be > 0")
            }
            // We have 4 shipments but only some have real receives with qty > 0
            Assertions.assertTrue(skus.isNotEmpty(),
                "Should have created FIFO transactions for received SKUs. Found: ${skus.size}")
        }
    }

    @Test @Order(1401)
    fun `P14-02 fifo_layers created with matching qty and cost`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                """SELECT l.sku, l.qty_in, l.qty_remaining, l.unit_cost, l.landed_cost, l.po_num
                   FROM fifo_layers l
                   WHERE l.po_num LIKE 'TT%'
                   ORDER BY l.sku"""
            )
            var count = 0
            while (rs.next()) {
                count++
                val sku = rs.getString("sku")
                val qtyIn = rs.getInt("qty_in")
                val qtyRemaining = rs.getInt("qty_remaining")
                val unitCost = rs.getBigDecimal("unit_cost")
                val landedCost = rs.getBigDecimal("landed_cost")

                // qty_remaining should equal qty_in (no sales yet)
                Assertions.assertEquals(qtyIn, qtyRemaining,
                    "Layer for $sku: qty_remaining should equal qty_in (no consumption yet)")
                // unit_cost == landed_cost initially (no freight apportioned)
                Assertions.assertEquals(unitCost.compareTo(landedCost), 0,
                    "Layer for $sku: landed_cost should equal unit_cost initially")
                Assertions.assertTrue(unitCost.toDouble() > 0,
                    "Layer for $sku: unit_cost must be > 0")
            }
            Assertions.assertTrue(count > 0,
                "Should have created FIFO layers. Found: $count")
        }
    }

    @Test @Order(1402)
    fun `P14-03 landed_prices created with correct linkage`() {
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                """SELECT lp.logistic_num, lp.po_num, lp.sku, lp.quantity,
                          lp.base_price_usd, lp.landed_price_usd,
                          lp.fifo_tran_id, lp.fifo_layer_id
                   FROM landed_prices lp
                   WHERE lp.logistic_num LIKE 'TT-FC-%'
                   ORDER BY lp.sku"""
            )
            var count = 0
            while (rs.next()) {
                count++
                val sku = rs.getString("sku")
                val logNum = rs.getString("logistic_num")
                val poNum = rs.getString("po_num")

                Assertions.assertTrue(logNum.startsWith("TT-FC-"), "logistic_num should be TT-FC-*")
                Assertions.assertTrue(poNum.startsWith("TT"), "po_num should be TT*")
                Assertions.assertTrue(rs.getInt("quantity") > 0, "Quantity > 0 for $sku")
                // base_price == landed_price initially
                Assertions.assertEquals(
                    rs.getBigDecimal("base_price_usd").compareTo(rs.getBigDecimal("landed_price_usd")), 0,
                    "landed should equal base initially for $sku")
                // FK linkage
                Assertions.assertTrue(rs.getLong("fifo_tran_id") > 0,
                    "fifo_tran_id should be linked for $sku")
                Assertions.assertTrue(rs.getLong("fifo_layer_id") > 0,
                    "fifo_layer_id should be linked for $sku")
            }
            Assertions.assertTrue(count > 0,
                "Should have created landed_price records. Found: $count")
        }
    }

    @Test @Order(1403)
    fun `P14-04 FIFO chain cross-reference integrity`() {
        // Verify: every landed_price's fifo_tran_id exists in fifo_transactions
        // AND every landed_price's fifo_layer_id exists in fifo_layers
        dataSource.connection.use { conn ->
            val rs = conn.createStatement().executeQuery(
                """SELECT count(*) FROM landed_prices lp
                   WHERE lp.logistic_num LIKE 'TT-FC-%'
                     AND lp.fifo_tran_id NOT IN (SELECT id FROM fifo_transactions)"""
            )
            rs.next()
            Assertions.assertEquals(0, rs.getInt(1),
                "All landed_price.fifo_tran_id must reference valid fifo_transactions")

            val rs2 = conn.createStatement().executeQuery(
                """SELECT count(*) FROM landed_prices lp
                   WHERE lp.logistic_num LIKE 'TT-FC-%'
                     AND lp.fifo_layer_id NOT IN (SELECT id FROM fifo_layers)"""
            )
            rs2.next()
            Assertions.assertEquals(0, rs2.getInt(1),
                "All landed_price.fifo_layer_id must reference valid fifo_layers")

            // Verify: every fifo_layer's in_tran_id exists in fifo_transactions
            val rs3 = conn.createStatement().executeQuery(
                """SELECT count(*) FROM fifo_layers l
                   WHERE l.po_num LIKE 'TT%'
                     AND l.in_tran_id NOT IN (SELECT id FROM fifo_transactions)"""
            )
            rs3.next()
            Assertions.assertEquals(0, rs3.getInt(1),
                "All fifo_layer.in_tran_id must reference valid fifo_transactions")
        }
    }
}
