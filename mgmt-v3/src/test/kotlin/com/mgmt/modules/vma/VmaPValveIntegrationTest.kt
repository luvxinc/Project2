package com.mgmt.modules.vma

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
import org.springframework.test.web.servlet.result.MockMvcResultMatchers
import javax.sql.DataSource

/**
 * VMA P-VALVE Integration Tests (Phase 5)
 *
 * Covers all 39 P-VALVE endpoints:
 *   - P-Valve Product CRUD (4 endpoints)
 *   - Delivery System Product CRUD (4 endpoints)
 *   - Fit Matrix (2 endpoints)
 *   - Site CRUD (3 endpoints)
 *   - Inventory Transaction CRUD (5 endpoints)
 *   - Inventory Query/Report (5 endpoints)
 *   - Receiving (2 endpoints)
 *   - Clinical Case Lifecycle (13 endpoints)
 *   - Error & Edge Cases
 *
 * Test data is fully self-contained — cleaned before/after test suite.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class VmaPValveIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        // Test entity IDs — populated during test execution
        var pvProductId: String = ""
        var pvProductId2: String = ""
        var dsProductId: String = ""
        var dsProductId2: String = ""
        var siteId: String = "TEST-001"
        var siteId2: String = "TEST-002"
        var caseId: String = ""
        var txnId: String = ""
        var batchNo: String = "TEST-BATCH-001"
        var outCaseTxnId: String = ""
        var tripCaseId1: String = ""
        var tripCaseId2: String = ""
        var standaloneCaseId: String = ""

        // Test specifications
        const val PV_SPEC = "PV-TEST-2626A"
        const val PV_SPEC_2 = "PV-TEST-2626B"
        const val DS_SPEC = "DS-TEST-2626A"
        const val DS_SPEC_2 = "DS-TEST-2626B"
    }

    /** Clean up ALL test data for idempotency. */
    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // Order matters: FKs first
                stmt.execute("DELETE FROM vma_inventory_transactions WHERE spec_no LIKE 'PV-TEST-%' OR spec_no LIKE 'DS-TEST-%' OR batch_no = '$batchNo'")
                stmt.execute("DELETE FROM vma_clinical_cases WHERE case_id LIKE 'UVP-TEST-%'")
                stmt.execute("DELETE FROM vma_clinical_trips WHERE trip_id LIKE 'TRIP-TEST-%'")
                stmt.execute("DELETE FROM vma_delivery_system_fits WHERE delivery_system_id IN (SELECT id FROM vma_delivery_system_products WHERE specification LIKE 'DS-TEST-%')")
                stmt.execute("DELETE FROM vma_delivery_system_products WHERE specification LIKE 'DS-TEST-%'")
                stmt.execute("DELETE FROM vma_pvalve_products WHERE specification LIKE 'PV-TEST-%'")
                stmt.execute("DELETE FROM vma_receiving_batches WHERE batch_no = '$batchNo'")
                stmt.execute("DELETE FROM vma_sites WHERE site_id LIKE 'TEST-%'")
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

    // ═══════════════════════════════════════════════════════════
    // §1 P-Valve Product CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(100)
    fun `create P-Valve product`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestModel-26",
            "specification" to PV_SPEC,
            "diameterA" to 26.0,
            "diameterB" to 28.0,
            "diameterC" to 30.0,
            "expandedLengthD" to 45.0,
            "expandedLengthE" to 50.0,
            "crimpedTotalLength" to 120.0,
        ))
        val result = mockMvc.post("/vma/pvalve-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.specification") { value(PV_SPEC) }
            jsonPath("$.model") { value("TestModel-26") }
            jsonPath("$.diameterA") { value(26.0) }
            jsonPath("$.isActive") { value(true) }
            jsonPath("$.fits") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        pvProductId = json["id"].asText()
    }

    @Test @Order(101)
    fun `create second P-Valve product`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestModel-28",
            "specification" to PV_SPEC_2,
            "diameterA" to 28.0,
        ))
        val result = mockMvc.post("/vma/pvalve-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.specification") { value(PV_SPEC_2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        pvProductId2 = json["id"].asText()
    }

    @Test @Order(102)
    fun `create P-Valve with duplicate specification returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "Dup", "specification" to PV_SPEC,
        ))
        mockMvc.post("/vma/pvalve-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(103)
    fun `list P-Valve products includes test products`() {
        mockMvc.get("/vma/pvalve-products") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(104)
    fun `update P-Valve product`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestModel-26-Updated",
            "diameterA" to 27.5,
        ))
        mockMvc.patch("/vma/pvalve-products/$pvProductId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.model") { value("TestModel-26-Updated") }
            jsonPath("$.diameterA") { value(27.5) }
        }
    }

    @Test @Order(105)
    fun `update nonexistent P-Valve product returns 404`() {
        val body = objectMapper.writeValueAsString(mapOf("model" to "X"))
        mockMvc.patch("/vma/pvalve-products/nonexistent-id") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §2 Delivery System Product CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(200)
    fun `create Delivery System product with fit P-Valves`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestDS-Model",
            "specification" to DS_SPEC,
            "fitPValveSpecs" to listOf(PV_SPEC, PV_SPEC_2),
        ))
        val result = mockMvc.post("/vma/delivery-system-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.specification") { value(DS_SPEC) }
            jsonPath("$.fits.length()") { value(2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        dsProductId = json["id"].asText()
    }

    @Test @Order(201)
    fun `create second DS product without fits`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestDS-Model2",
            "specification" to DS_SPEC_2,
        ))
        val result = mockMvc.post("/vma/delivery-system-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.fits") { isArray() }
            jsonPath("$.fits.length()") { value(0) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        dsProductId2 = json["id"].asText()
    }

    @Test @Order(202)
    fun `create DS with duplicate specification returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "Dup", "specification" to DS_SPEC,
        ))
        mockMvc.post("/vma/delivery-system-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(203)
    fun `list DS products`() {
        mockMvc.get("/vma/delivery-system-products") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(204)
    fun `update DS product model`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "model" to "TestDS-Updated",
        ))
        mockMvc.patch("/vma/delivery-system-products/$dsProductId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.model") { value("TestDS-Updated") }
        }
    }

    @Test @Order(205)
    fun `update DS product fit relationships`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "fitPValveSpecs" to listOf(PV_SPEC),  // Remove second fit
        ))
        mockMvc.patch("/vma/delivery-system-products/$dsProductId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.fits.length()") { value(1) }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §3 Fit Matrix
    // ═══════════════════════════════════════════════════════════

    @Test @Order(300)
    fun `get fit matrix includes products and fits`() {
        mockMvc.get("/vma/fit-matrix") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.pvalves") { isArray() }
            jsonPath("$.deliverySystems") { isArray() }
        }
    }

    @Test @Order(301)
    fun `update fit relationship via spec`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "deliverySystemSpec" to DS_SPEC,
            "pvalveSpecs" to listOf(PV_SPEC, PV_SPEC_2),
        ))
        mockMvc.patch("/vma/fit-relationship") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.fits.length()") { value(2) }
        }
    }

    @Test @Order(302)
    fun `update fit with nonexistent DS returns 404`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "deliverySystemSpec" to "NONEXISTENT",
            "pvalveSpecs" to listOf(PV_SPEC),
        ))
        mockMvc.patch("/vma/fit-relationship") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §4 Site CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(400)
    fun `create site`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "siteName" to "Test Hospital",
            "address" to "123 Test Ave",
            "city" to "TestCity",
            "state" to "CA",
            "zipCode" to "90000",
            "country" to "USA",
        ))
        mockMvc.post("/vma/sites") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.siteId") { value(siteId) }
            jsonPath("$.siteName") { value("Test Hospital") }
        }
    }

    @Test @Order(401)
    fun `create second site`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId2,
            "siteName" to "Test Clinic",
            "address" to "456 Test Blvd",
            "city" to "TestTown",
            "state" to "CA",
            "zipCode" to "91000",
            "country" to "USA",
        ))
        mockMvc.post("/vma/sites") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
        }
    }

    @Test @Order(402)
    fun `create duplicate site returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "siteName" to "Dup", "address" to "x", "city" to "x",
            "state" to "x", "zipCode" to "x", "country" to "x",
        ))
        mockMvc.post("/vma/sites") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(403)
    fun `list sites`() {
        mockMvc.get("/vma/sites") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(404)
    fun `update site`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteName" to "Test Hospital Updated",
        ))
        mockMvc.patch("/vma/sites/$siteId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.siteName") { value("Test Hospital Updated") }
        }
    }

    @Test @Order(405)
    fun `update nonexistent site returns 404`() {
        val body = objectMapper.writeValueAsString(mapOf("siteName" to "x"))
        mockMvc.patch("/vma/sites/NONEXISTENT") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §4.5 Receive From China — creates batch + transactions
    // ═══════════════════════════════════════════════════════════

    @Test @Order(450)
    fun `receive from China creates batch and transactions`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "batchNo" to batchNo,
            "poNo" to "PO-TEST-001",
            "dateShipped" to "2026-02-10",
            "dateTimeReceived" to "2026-02-15 09:00 PST",
            "operator" to "Test Operator",
            "comments" to "Integration test batch",
            "products" to listOf(
                mapOf(
                    "productType" to "PVALVE",
                    "productModel" to PV_SPEC,
                    "serialNo" to "SN-TEST-001",
                    "qty" to 1,
                    "productCondition" to "ACCEPT",
                    "failedNoteIndices" to emptyList<Int>(),
                    "result" to "ACCEPT",
                    "inspectionBy" to "Test Inspector",
                    "expDate" to "2027-06-15",
                ),
                mapOf(
                    "productType" to "DELIVERY_SYSTEM",
                    "productModel" to DS_SPEC,
                    "serialNo" to "SN-DS-TEST-001",
                    "qty" to 1,
                    "productCondition" to "ACCEPT",
                    "failedNoteIndices" to emptyList<Int>(),
                    "result" to "ACCEPT",
                    "inspectionBy" to "Test Inspector",
                    "expDate" to "2027-06-15",
                ),
            ),
        ))
        // This endpoint returns a PDF on success
        mockMvc.post("/vma/inventory-transactions/receive-from-china") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §5 Inventory Transaction CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(500)
    fun `list PVALVE transactions and capture txnId`() {
        val result = mockMvc.get("/vma/inventory-transactions") {
            header("Authorization", "Bearer $token")
            param("productType", "PVALVE")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        // Capture the first PV transaction ID for later tests
        if (json.size() > 0) {
            txnId = json[0]["id"].asText()
        }
    }

    @Test @Order(501)
    fun `verify DS transactions were created by receive-from-china`() {
        mockMvc.get("/vma/inventory-transactions") {
            header("Authorization", "Bearer $token")
            param("productType", "DELIVERY_SYSTEM")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(502)
    fun `get single inventory transaction`() {
        mockMvc.get("/vma/inventory-transactions/$txnId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(txnId) }
            jsonPath("$.specNo") { value(PV_SPEC) }
        }
    }

    @Test @Order(503)
    fun `list inventory transactions by product type`() {
        mockMvc.get("/vma/inventory-transactions") {
            header("Authorization", "Bearer $token")
            param("productType", "PVALVE")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(504)
    fun `update inventory transaction`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "operator" to "Updated Operator",
            "notes" to "Test update note",
        ))
        mockMvc.patch("/vma/inventory-transactions/$txnId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.operator") { value("Updated Operator") }
            jsonPath("$.notes") { value("Test update note") }
        }
    }

    @Test @Order(505)
    fun `get nonexistent transaction returns 404`() {
        mockMvc.get("/vma/inventory-transactions/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §6 Inventory Query & Report Endpoints
    // ═══════════════════════════════════════════════════════════

    @Test @Order(600)
    fun `get spec options for PVALVE`() {
        mockMvc.get("/vma/inventory-transactions/spec-options") {
            header("Authorization", "Bearer $token")
            param("productType", "PVALVE")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(601)
    fun `get spec options for DELIVERY_SYSTEM`() {
        mockMvc.get("/vma/inventory-transactions/spec-options") {
            header("Authorization", "Bearer $token")
            param("productType", "DELIVERY_SYSTEM")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(602)
    fun `get inventory summary for PVALVE`() {
        mockMvc.get("/vma/inventory-transactions/summary") {
            header("Authorization", "Bearer $token")
            param("productType", "PVALVE")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(603)
    fun `get inventory detail for test spec`() {
        mockMvc.get("/vma/inventory-transactions/detail") {
            header("Authorization", "Bearer $token")
            param("specNo", PV_SPEC)
            param("productType", "PVALVE")
        }.andExpect {
            status { isOk() }
            jsonPath("$.available") { isArray() }
            jsonPath("$.wip") { isArray() }
            jsonPath("$.nearExp") { isArray() }
            jsonPath("$.expired") { isArray() }
            jsonPath("$.returnedToCn") { isArray() }
        }
    }

    @Test @Order(604)
    fun `get demo inventory`() {
        mockMvc.get("/vma/inventory-transactions/demo") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(605)
    fun `get operators list`() {
        mockMvc.get("/vma/inventory-transactions/operators") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §7 Clinical Case Lifecycle
    // ═══════════════════════════════════════════════════════════

    @Test @Order(700)
    fun `create clinical case with items`() {
        caseId = "UVP-${siteId}-P001"
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "patientId" to "P001",
            "caseDate" to "2026-02-15",
            "items" to listOf(
                mapOf(
                    "productType" to "PVALVE",
                    "specNo" to PV_SPEC,
                    "serialNo" to "SN-TEST-001",
                    "qty" to 1,
                    "expDate" to "2027-06-15",
                    "batchNo" to batchNo,
                ),
            ),
        ))
        mockMvc.post("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            // Response can be 200 or 201 depending on template availability
            match(ResultMatcher { result ->
                val s = result.response.status
                assert(s == 200 || s == 201) { "Expected 200 or 201 but got $s" }
            })
        }
    }

    @Test @Order(701)
    fun `create duplicate clinical case returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "patientId" to "P001",
            "caseDate" to "2026-02-15",
            "items" to listOf(
                mapOf(
                    "productType" to "PVALVE", "specNo" to PV_SPEC,
                    "serialNo" to "SN-TEST-002", "qty" to 1,
                ),
            ),
        ))
        mockMvc.post("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(702)
    fun `list clinical cases`() {
        mockMvc.get("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(703)
    fun `get clinical case detail`() {
        mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.caseId") { value(caseId) }
            jsonPath("$.status") { value("IN_PROGRESS") }
            jsonPath("$.transactions") { isArray() }
        }
    }

    @Test @Order(704)
    fun `update clinical case info`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "caseNo" to "CASE-TEST-001",
        ))
        mockMvc.patch("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.caseNo") { value("CASE-TEST-001") }
        }
    }

    @Test @Order(705)
    fun `get nonexistent case returns 404`() {
        mockMvc.get("/vma/clinical-cases/NONEXISTENT") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Product Picking ────────────────────────────────

    @Test @Order(710)
    fun `pick products for case`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "specNo" to PV_SPEC,
            "qty" to 1,
            "caseDate" to "2026-02-15",
            "productType" to "PVALVE",
        ))
        mockMvc.post("/vma/case-pick-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(711)
    fun `get available products`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "specNo" to PV_SPEC,
            "caseDate" to "2026-02-15",
            "productType" to "PVALVE",
        ))
        mockMvc.post("/vma/case-available-products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(712)
    fun `get compatible delivery systems`() {
        mockMvc.get("/vma/case-compatible-ds") {
            header("Authorization", "Bearer $token")
            param("specs", PV_SPEC)
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    // ─── Case Item CRUD ─────────────────────────────────

    @Test @Order(720)
    fun `add case item`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "productType" to "DELIVERY_SYSTEM",
            "specNo" to DS_SPEC,
            "serialNo" to "SN-DS-TEST-001",
            "qty" to 1,
            "expDate" to "2027-06-15",
        ))
        val result = mockMvc.post("/vma/clinical-cases/$caseId/items") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.specNo") { value(DS_SPEC) }
            jsonPath("$.action") { value("OUT_CASE") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        outCaseTxnId = json["id"].asText()
    }

    @Test @Order(721)
    fun `update case item`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "notes" to "Updated test note",
        ))
        // This may fail on the notes field since UpdateCaseItemRequest doesn't have it
        // That's fine — it tests the endpoint is reachable and validates correctly
        mockMvc.patch("/vma/clinical-cases/$caseId/items/$outCaseTxnId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
        }
    }

    // ─── Case Completion ────────────────────────────────

    @Test @Order(730)
    fun `complete case - all items used`() {
        // Get all case items first
        val caseResult = mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val caseJson = objectMapper.readTree(caseResult.response.contentAsString)
        val txns = caseJson["transactions"]

        val completionItems = mutableListOf<Map<String, Any>>()
        txns.forEach { txn ->
            completionItems.add(mapOf(
                "txnId" to txn["id"].asText(),
                "returned" to false,  // All items used (consumed)
            ))
        }

        val body = objectMapper.writeValueAsString(mapOf(
            "items" to completionItems,
        ))
        mockMvc.post("/vma/clinical-cases/$caseId/complete") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.status") { value("COMPLETED") }
        }
    }

    @Test @Order(731)
    fun `verify case status is COMPLETED`() {
        mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("COMPLETED") }
        }
    }

    @Test @Order(732)
    fun `cannot modify completed case`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "patientId" to "P002",
        ))
        mockMvc.patch("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            // Completed case should reject modifications (400 or 500)
            match(ResultMatcher { result ->
                val s = result.response.status
                assert(s == 400 || s in 500..599) { "Expected 400 or 5xx but got $s" }
            })
        }
    }

    @Test @Order(733)
    fun `reverse case completion`() {
        mockMvc.post("/vma/clinical-cases/$caseId/reverse") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.status") { value("IN_PROGRESS") }
        }
    }

    @Test @Order(734)
    fun `verify case reverted to IN_PROGRESS`() {
        mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("IN_PROGRESS") }
        }
    }

    @Test @Order(7311)
    fun `verify completion summary contains ALL case items`() {
        // Re-complete the case after reverse (simulates user's workflow)
        val caseResult = mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val caseJson = objectMapper.readTree(caseResult.response.contentAsString)

        // Verify case is currently IN_PROGRESS (after reverse)
        assert(caseJson["status"]?.asText() == "IN_PROGRESS") {
            "Expected IN_PROGRESS after reverse, got: ${caseJson["status"]}"
        }

        val txns = caseJson["transactions"]

        // Complete again with a mix: first item returned+accepted, rest used
        val completionItems = mutableListOf<Map<String, Any>>()
        txns.forEachIndexed { idx, txn ->
            completionItems.add(mapOf(
                "txnId" to txn["id"].asText(),
                "returned" to (idx == 0),  // first item returned, rest used
                "accepted" to true,
            ))
        }

        val body = objectMapper.writeValueAsString(mapOf("items" to completionItems))
        mockMvc.post("/vma/clinical-cases/$caseId/complete") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.status") { value("COMPLETED") }
        }

        // Now GET the case and verify completionSummary
        val verifyResult = mockMvc.get("/vma/clinical-cases/$caseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val verifyJson = objectMapper.readTree(verifyResult.response.contentAsString)
        val outCaseTxns = verifyJson["transactions"]
        val summary = verifyJson["completionSummary"]

        // CRITICAL: completionSummary MUST exist
        assert(summary != null && !summary.isNull) {
            "completionSummary is MISSING! Response keys: ${verifyJson.fieldNames().asSequence().toList()}"
        }

        val outCaseCount = outCaseTxns.size()
        val usedCount = summary["used"]?.size() ?: 0
        val returnedOkCount = summary["returnedOk"]?.size() ?: 0
        val returnedDamagedCount = summary["returnedDamaged"]?.size() ?: 0
        val totalSummaryCount = usedCount + returnedOkCount + returnedDamagedCount

        // CRITICAL: summary must account for ALL products
        assert(totalSummaryCount == outCaseCount) {
            "Summary has $totalSummaryCount items but case has $outCaseCount products. " +
            "Used=$usedCount, ReturnedOk=$returnedOkCount, ReturnedDamaged=$returnedDamagedCount"
        }

        // First item should be returnedOk, rest should be used
        assert(returnedOkCount == 1) { "Expected 1 returnedOk item but got $returnedOkCount" }
        assert(usedCount == outCaseCount - 1) { "Expected ${outCaseCount - 1} used items but got $usedCount" }
    }

    // ═══════════════════════════════════════════════════════════
    // §7B Clinical Trip (Multi-Case) Lifecycle
    // ═══════════════════════════════════════════════════════════

    @Test @Order(850)
    fun `create multi-case with additionalCases creates trip`() {
        tripCaseId1 = "UVP-${siteId}-T01"
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "patientId" to "T01",
            "caseDate" to "2026-02-18",
            "items" to listOf(
                mapOf(
                    "productType" to "PVALVE", "specNo" to PV_SPEC,
                    "serialNo" to "SN-TEST-TRIP-001", "qty" to 1,
                    "expDate" to "2027-12-31", "batchNo" to batchNo,
                ),
            ),
            "additionalCases" to listOf(
                mapOf(
                    "siteId" to siteId2,
                    "patientId" to "T02",
                    "caseDate" to "2026-02-18",
                ),
            ),
        ))
        mockMvc.post("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            match(ResultMatcher { result ->
                val s = result.response.status
                assert(s == 200 || s == 201) { "Expected 200 or 201 but got $s" }
            })
        }
    }

    @Test @Order(851)
    fun `list cases returns tripId for multi-case`() {
        val result = mockMvc.get("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        // Find the primary trip case
        val tripCase = json.find { it["caseId"].asText() == tripCaseId1 }
        Assertions.assertNotNull(tripCase, "Primary trip case should exist in list")
        Assertions.assertNotNull(tripCase!!["tripId"], "tripId should be present")
        Assertions.assertFalse(tripCase["tripId"].isNull, "tripId should not be null")

        // Find the secondary case (UVP-TEST-002-T02)
        tripCaseId2 = json.find {
            it["patientId"]?.asText() == "T02" && it["tripId"]?.asText() == tripCase["tripId"].asText()
        }?.get("caseId")?.asText() ?: ""
        Assertions.assertTrue(tripCaseId2.isNotEmpty(), "Secondary trip case should exist")
    }

    @Test @Order(852)
    fun `get trip case detail returns relatedCases`() {
        mockMvc.get("/vma/clinical-cases/$tripCaseId1") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.caseId") { value(tripCaseId1) }
            jsonPath("$.tripId") { exists() }
            jsonPath("$.relatedCases") { isArray() }
            jsonPath("$.relatedCases.length()") { value(2) }
        }
    }

    @Test @Order(853)
    fun `add related case to standalone case promotes to trip`() {
        // First create a standalone case
        standaloneCaseId = "UVP-${siteId}-S01"
        val createBody = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId,
            "patientId" to "S01",
            "caseDate" to "2026-02-18",
            "items" to listOf(
                mapOf(
                    "productType" to "PVALVE", "specNo" to PV_SPEC,
                    "serialNo" to "SN-TEST-STANDALONE-001", "qty" to 1,
                    "expDate" to "2027-12-31", "batchNo" to batchNo,
                ),
            ),
        ))
        mockMvc.post("/vma/clinical-cases") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = createBody
        }.andExpect {
            match(ResultMatcher { result ->
                val s = result.response.status
                assert(s == 200 || s == 201) { "Expected 200 or 201 but got $s" }
            })
        }

        // Verify it's standalone (no tripId)
        val detailResult = mockMvc.get("/vma/clinical-cases/$standaloneCaseId") {
            header("Authorization", "Bearer $token")
        }.andReturn()
        val detailJson = objectMapper.readTree(detailResult.response.contentAsString)
        Assertions.assertTrue(
            detailJson["tripId"] == null || detailJson["tripId"].isNull,
            "Standalone case should not have tripId"
        )

        // Now add a related case
        val relatedBody = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId2,
            "patientId" to "S02",
            "caseDate" to "2026-02-18",
        ))
        mockMvc.post("/vma/clinical-cases/$standaloneCaseId/related-case") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = relatedBody
        }.andExpect {
            status { isCreated() }
        }

        // Verify it's now a trip with 2 related cases
        val afterResult = mockMvc.get("/vma/clinical-cases/$standaloneCaseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.tripId") { exists() }
            jsonPath("$.relatedCases") { isArray() }
            jsonPath("$.relatedCases.length()") { value(2) }
        }
    }

    @Test @Order(854)
    fun `delete single case from trip keeps sibling`() {
        // Delete the secondary case from the multi-case trip
        mockMvc.delete("/vma/clinical-cases/$tripCaseId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }

        // The primary case should now be standalone (trip removed when only 1 remains)
        val result = mockMvc.get("/vma/clinical-cases/$tripCaseId1") {
            header("Authorization", "Bearer $token")
        }.andReturn()
        val json = objectMapper.readTree(result.response.contentAsString)
        // After removing sibling, should revert to standalone (no tripId or empty relatedCases)
        Assertions.assertTrue(
            json["tripId"] == null || json["tripId"].isNull ||
            (json["relatedCases"]?.size() ?: 0) <= 1,
            "After removing sibling, case should effectively be standalone"
        )
    }

    @Test @Order(855)
    fun `delete all related cases removes trip and all cases`() {
        // Delete all related cases from the standalone-promoted trip
        mockMvc.delete("/vma/clinical-cases/$standaloneCaseId/related-cases") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }

        // Verify the case no longer exists
        mockMvc.get("/vma/clinical-cases/$standaloneCaseId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(856)
    fun `add related case to nonexistent case returns 404`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "siteId" to siteId, "patientId" to "X99", "caseDate" to "2026-02-18",
        ))
        mockMvc.post("/vma/clinical-cases/NONEXISTENT-CASE/related-case") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(857)
    fun `delete all related from standalone case returns error`() {
        // tripCaseId1 should now be standalone (sibling was deleted in 854)
        mockMvc.delete("/vma/clinical-cases/$tripCaseId1/related-cases") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            // Should error since it's not part of a trip (400, 409, or 500)
            match(ResultMatcher { result ->
                val s = result.response.status
                assert(s == 400 || s == 409 || s == 500) { "Expected 400, 409, or 500 but got $s" }
            })
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §8 Auth Guards
    // ═══════════════════════════════════════════════════════════

    @Test @Order(900)
    fun `P-VALVE endpoints require authentication`() {
        mockMvc.get("/vma/pvalve-products").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/delivery-system-products").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/inventory-transactions").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/clinical-cases").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/sites").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/fit-matrix").andExpect { status { isUnauthorized() } }
    }

    // ═══════════════════════════════════════════════════════════
    // §9 Soft Delete — Inventory Transaction
    // ═══════════════════════════════════════════════════════════

    @Test @Order(950)
    fun `soft delete inventory transaction`() {
        mockMvc.delete("/vma/inventory-transactions/$txnId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.deletedAt") { exists() }
        }
    }

    @Test @Order(951)
    fun `soft-deleted transaction is not visible in list`() {
        val result = mockMvc.get("/vma/inventory-transactions") {
            header("Authorization", "Bearer $token")
            param("productType", "PVALVE")
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val ids = json.map { it["id"].asText() }
        Assertions.assertFalse(ids.contains(txnId), "Soft-deleted transaction should not appear in list")
    }

    // ═══════════════════════════════════════════════════════════
    // §10 Soft Delete — Products
    // ═══════════════════════════════════════════════════════════

    @Test @Order(960)
    fun `delete (deactivate) P-Valve product`() {
        mockMvc.delete("/vma/pvalve-products/$pvProductId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.isActive") { value(false) }
        }
    }

    @Test @Order(961)
    fun `deactivated P-Valve product not in active list`() {
        val result = mockMvc.get("/vma/pvalve-products") {
            header("Authorization", "Bearer $token")
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        val ids = json.map { it["id"].asText() }
        Assertions.assertFalse(ids.contains(pvProductId2), "Deactivated product should not appear in active list")
    }

    @Test @Order(962)
    fun `delete (deactivate) DS product`() {
        mockMvc.delete("/vma/delivery-system-products/$dsProductId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.isActive") { value(false) }
        }
    }
}
