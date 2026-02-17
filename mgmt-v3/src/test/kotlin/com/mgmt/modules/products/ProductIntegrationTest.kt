package com.mgmt.modules.products

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
 * Products Module Integration Tests — V1 Functional Parity
 *
 * Tests all endpoints with V1 DTO format:
 *   1. Create: {sku, name, category, cogs, upc}
 *   2. Update: {name, category, cogs, upc, status}
 *   3. COGS batch: {items: [{id, cogs}]}
 *   4. Barcode: {skus, copiesPerSku, format}
 *   5. Query: findAll, categories, sku-list, findOne, findBySku
 *   6. Delete: soft delete
 *   7. Auth: 401
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var productId: String = ""
        var productId2: String = ""
        const val TEST_SKU = "TEST-PROD-001"
        const val TEST_SKU_2 = "TEST-PROD-002"
    }

    /** Clean up test data for idempotency */
    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM products WHERE sku IN ('$TEST_SKU', '$TEST_SKU_2', 'BATCH-A', 'BATCH-B')")
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

    // ─── Query Endpoints ─────────────────────────────────

    @Test @Order(1)
    fun `list products returns unified paginated response`() {
        mockMvc.get("/products") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.meta.page") { exists() }
            jsonPath("$.meta.total") { exists() }
        }
    }

    @Test @Order(2)
    fun `get categories returns unified response`() {
        mockMvc.get("/products/categories") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(3)
    fun `get SKU list returns unified response`() {
        mockMvc.get("/products/sku-list") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Create Endpoints (V1 parity: 5 fields) ──────────

    @Test @Order(10)
    fun `create product with V1 fields (sku, name, category, cogs, upc)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to TEST_SKU,
            "name" to "Test Integration Product",
            "category" to "Test Category",
            "cogs" to 13.00,
            "upc" to "123456789012",
        ))
        val result = mockMvc.post("/products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.sku") { value(TEST_SKU) }
            jsonPath("$.data.name") { value("Test Integration Product") }
            jsonPath("$.data.category") { value("Test Category") }
            jsonPath("$.data.cogs") { value(13.0) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        productId = json["data"]["id"].asText()
    }

    @Test @Order(11)
    fun `create product with minimal fields`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to TEST_SKU_2,
        ))
        val result = mockMvc.post("/products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.sku") { value(TEST_SKU_2) }
            jsonPath("$.data.cogs") { value(0.0) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        productId2 = json["data"]["id"].asText()
    }

    @Test @Order(12)
    fun `create product with duplicate SKU returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to TEST_SKU,
            "name" to "Duplicate",
        ))
        mockMvc.post("/products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(13)
    fun `SKU is case-insensitive (forced uppercase)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to "test-prod-001",  // lowercase
            "name" to "Should conflict",
        ))
        mockMvc.post("/products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(14)
    fun `batch create products`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "products" to listOf(
                mapOf("sku" to "BATCH-A", "name" to "Batch A", "cogs" to 1.50),
                mapOf("sku" to "BATCH-B", "name" to "Batch B", "cogs" to 3.00),
            ),
        ))
        mockMvc.post("/products/batch") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.total") { value(2) }
            jsonPath("$.data.success") { value(2) }
            jsonPath("$.data.failed") { value(0) }
        }
    }

    // ─── Get by ID / SKU ─────────────────────────────────

    @Test @Order(20)
    fun `get product by id`() {
        mockMvc.get("/products/$productId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.sku") { value(TEST_SKU) }
        }
    }

    @Test @Order(21)
    fun `get product by SKU`() {
        mockMvc.get("/products/sku/$TEST_SKU") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.id") { value(productId) }
        }
    }

    @Test @Order(22)
    fun `get nonexistent product returns 404`() {
        mockMvc.get("/products/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Update (V1 parity: {name, category, cogs, upc, status}) ──

    @Test @Order(30)
    fun `update product with V1 fields`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "name" to "Updated Name",
            "cogs" to 18.00,
        ))
        mockMvc.patch("/products/$productId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.name") { value("Updated Name") }
            jsonPath("$.data.cogs") { value(18.0) }
        }
    }

    // ─── COGS Batch Update (V1 parity: {id, cogs}) ───────

    @Test @Order(40)
    fun `batch update COGS with V1 format (id, cogs)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "items" to listOf(
                mapOf("id" to productId, "cogs" to 25.00),
            ),
        ))
        mockMvc.post("/products/cogs/batch") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.total") { value(1) }
            jsonPath("$.data.success") { value(1) }
        }

        // Verify COGS was updated
        mockMvc.get("/products/$productId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.cogs") { value(25.0) }
        }
    }

    // ─── Barcode PDF (V1 parity: {skus, copiesPerSku, format}) ───

    @Test @Order(50)
    fun `generate barcode PDF with V1 format`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "skus" to listOf(TEST_SKU),
            "copiesPerSku" to 2,
            "format" to "CODE128",
        ))
        mockMvc.post("/products/barcode/generate") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            header { string("Content-Type", "application/pdf") }
            header { exists("Content-Disposition") }
        }
    }

    // ─── Search + Pagination ─────────────────────────────

    @Test @Order(60)
    fun `search products by name`() {
        mockMvc.get("/products") {
            header("Authorization", "Bearer $token")
            param("search", "Updated Name")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(61)
    fun `filter products by category`() {
        mockMvc.get("/products") {
            header("Authorization", "Bearer $token")
            param("category", "Test Category")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Delete (soft) ───────────────────────────────────

    @Test @Order(80)
    fun `soft delete product`() {
        mockMvc.delete("/products/$productId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
        }

        // Confirm not found after delete
        mockMvc.get("/products/$productId2") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ─── Auth Guards ─────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/products").andExpect { status { isUnauthorized() } }
        mockMvc.post("/products") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
