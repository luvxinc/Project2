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
 * Supplier Integration Tests — V1 Functional Parity
 *
 * Tests:
 *   1. List suppliers
 *   2. Create supplier
 *   3. Duplicate code check
 *   4. Get supplier by ID
 *   5. Update supplier
 *   6. Code-exists check
 *   7. Create strategy
 *   8. Get strategies
 *   9. Strategy date conflict check
 *  10. Effective strategy lookup
 *  11. Soft delete supplier
 *  12. Auth guard
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SupplierIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var supplierId: Long = 0
        const val TEST_CODE = "ZZ"
        const val TEST_NAME = "Test Supplier ZZ"
    }

    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // Clean in FK order
                stmt.execute("DELETE FROM supplier_strategies WHERE supplier_code = '$TEST_CODE'")
                stmt.execute("DELETE FROM suppliers WHERE supplier_code = '$TEST_CODE'")
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

    // ─── List ───────────────────────────────────────────

    @Test @Order(1)
    fun `list all suppliers`() {
        mockMvc.get("/purchase/suppliers") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(2)
    fun `list active suppliers`() {
        mockMvc.get("/purchase/suppliers/active") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Create ─────────────────────────────────────────

    @Test @Order(10)
    fun `create supplier`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to TEST_CODE,
            "supplierName" to TEST_NAME,
        ))
        val result = mockMvc.post("/purchase/suppliers") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
            jsonPath("$.data.supplierName") { value(TEST_NAME) }
            jsonPath("$.data.status") { value(true) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        supplierId = json["data"]["id"].asLong()
    }

    @Test @Order(11)
    fun `create supplier with duplicate code fails`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to TEST_CODE,
            "supplierName" to "Another Supplier",
        ))
        mockMvc.post("/purchase/suppliers") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(12)
    fun `create supplier with invalid code length fails`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to "ABC",  // 3 chars, max is 2
            "supplierName" to "Bad Code",
        ))
        mockMvc.post("/purchase/suppliers") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isBadRequest() }
        }
    }

    // ─── Read ───────────────────────────────────────────

    @Test @Order(20)
    fun `get supplier by id`() {
        mockMvc.get("/purchase/suppliers/$supplierId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
        }
    }

    @Test @Order(21)
    fun `code-exists returns true for existing code`() {
        mockMvc.get("/purchase/suppliers/code-exists") {
            header("Authorization", "Bearer $token")
            param("code", TEST_CODE)
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.exists") { value(true) }
        }
    }

    @Test @Order(22)
    fun `code-exists returns false for non-existing code`() {
        mockMvc.get("/purchase/suppliers/code-exists") {
            header("Authorization", "Bearer $token")
            param("code", "QQ")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.exists") { value(false) }
        }
    }

    // ─── Update ─────────────────────────────────────────

    @Test @Order(30)
    fun `update supplier name`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierName" to "Updated Supplier ZZ",
        ))
        mockMvc.patch("/purchase/suppliers/$supplierId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.supplierName") { value("Updated Supplier ZZ") }
        }
    }

    // ─── Strategy ───────────────────────────────────────

    @Test @Order(40)
    fun `create strategy for supplier`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "supplierCode" to TEST_CODE,
            "category" to "E",
            "currency" to "USD",
            "floatCurrency" to true,
            "floatThreshold" to 3.5,
            "requireDeposit" to true,
            "depositRatio" to 30.0,
            "effectiveDate" to "2026-01-01",
            "note" to "Test strategy",
        ))
        mockMvc.post("/purchase/suppliers/strategies") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
            jsonPath("$.data.floatCurrency") { value(true) }
            jsonPath("$.data.depositRatio") { value(30.0) }
        }
    }

    @Test @Order(41)
    fun `get strategies for supplier`() {
        mockMvc.get("/purchase/suppliers/$supplierId/strategies") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.data[0].supplierCode") { value(TEST_CODE) }
        }
    }

    @Test @Order(42)
    fun `check strategy date conflict - existing date`() {
        mockMvc.get("/purchase/suppliers/strategies/check-conflict") {
            header("Authorization", "Bearer $token")
            param("supplierCode", TEST_CODE)
            param("effectiveDate", "2026-01-01")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.conflict") { value(true) }
        }
    }

    @Test @Order(43)
    fun `check strategy date conflict - new date`() {
        mockMvc.get("/purchase/suppliers/strategies/check-conflict") {
            header("Authorization", "Bearer $token")
            param("supplierCode", TEST_CODE)
            param("effectiveDate", "2099-12-31")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.conflict") { value(false) }
        }
    }

    @Test @Order(44)
    fun `get effective strategy on date`() {
        mockMvc.get("/purchase/suppliers/strategies/effective") {
            header("Authorization", "Bearer $token")
            param("supplierCode", TEST_CODE)
            param("date", "2026-06-15")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.supplierCode") { value(TEST_CODE) }
        }
    }

    // ─── Delete ─────────────────────────────────────────

    @Test @Order(80)
    fun `soft delete supplier`() {
        mockMvc.delete("/purchase/suppliers/$supplierId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.success") { value(true) }
        }

        // Confirm not found after delete
        mockMvc.get("/purchase/suppliers/$supplierId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Auth Guard ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/purchase/suppliers").andExpect { status { isUnauthorized() } }
        mockMvc.post("/purchase/suppliers") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
