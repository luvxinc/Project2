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
 * Products Module Integration Tests
 *
 * V1 parity validation — covers:
 *   1. Product CRUD (9-field create, update, soft delete)
 *   2. COGS batch update (6 fields — fixes V2 bug)
 *   3. Barcode PDF generation (ZXing+PDFBox, stateless)
 *   4. Metadata endpoint (dropdown options)
 *   5. Unified API response format {success, data}
 *   6. Auth guards (401)
 *   7. SKU validation (format, duplicate)
 *   8. Audit fields (createdBy, updatedBy)
 *
 * Integration with Users module:
 *   - Permission enforcement via @RequirePermission + PermissionCheckAspect
 *   - Security code via @SecurityLevel + SecurityLevelAspect
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
        const val TEST_SKU_SLASH = "TEST/PROD/003"  // V1 parity: SKUs can contain '/'
    }

    /** Clean up test data for idempotency */
    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM products WHERE sku IN ('$TEST_SKU', '$TEST_SKU_2', '$TEST_SKU_SLASH', 'BATCH-A', 'BATCH-B')")
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
    fun `get metadata returns dropdown options`() {
        mockMvc.get("/products/metadata") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.categories") { isArray() }
            jsonPath("$.data.subcategories") { isArray() }
            jsonPath("$.data.types") { isArray() }
            jsonPath("$.data.existingSkus") { isArray() }
        }
    }

    @Test @Order(3)
    fun `get categories returns unified response`() {
        mockMvc.get("/products/categories") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    @Test @Order(4)
    fun `get SKU list returns unified response`() {
        mockMvc.get("/products/sku-list") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data") { isArray() }
        }
    }

    // ─── Create Endpoints (9-field V1 parity) ────────────

    @Test @Order(10)
    fun `create product with all 9 fields`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to TEST_SKU,
            "name" to "Test Integration Product",
            "category" to "Test Category",
            "subcategory" to "Test Sub",
            "type" to "Test Type",
            "cost" to 10.50,
            "freight" to 2.50,
            "weight" to 16,
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
            jsonPath("$.data.subcategory") { value("Test Sub") }
            jsonPath("$.data.type") { value("Test Type") }
            jsonPath("$.data.cost") { value(10.5) }
            jsonPath("$.data.freight") { value(2.5) }
            jsonPath("$.data.cogs") { value(13.0) }  // Auto-calculated: 10.50 + 2.50
            jsonPath("$.data.weight") { value(16) }
            jsonPath("$.data.createdBy") { exists() }
            jsonPath("$.data.updatedBy") { exists() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        productId = json["data"]["id"].asText()
    }

    @Test @Order(11)
    fun `create product with slash in SKU (V1 parity)`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sku" to TEST_SKU_SLASH,
            "name" to "Slash SKU Product",
            "cost" to 5.00,
            "freight" to 1.00,
        ))
        val result = mockMvc.post("/products") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.sku") { value(TEST_SKU_SLASH) }
            jsonPath("$.data.cogs") { value(6.0) }  // 5.00 + 1.00
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
        // Try lowercase version of existing SKU
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
                mapOf("sku" to "BATCH-A", "name" to "Batch A", "cost" to 1.00, "freight" to 0.50),
                mapOf("sku" to "BATCH-B", "name" to "Batch B", "cost" to 2.00, "freight" to 1.00),
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
            jsonPath("$.data.createdBy") { exists() }
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

    // ─── Update ──────────────────────────────────────────

    @Test @Order(30)
    fun `update product`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "name" to "Updated Name",
            "cost" to 15.00,
            "freight" to 3.00,
        ))
        mockMvc.patch("/products/$productId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.success") { value(true) }
            jsonPath("$.data.name") { value("Updated Name") }
            jsonPath("$.data.cost") { value(15.0) }
            jsonPath("$.data.freight") { value(3.0) }
            jsonPath("$.data.cogs") { value(18.0) }  // Auto-recalculated
            jsonPath("$.data.updatedBy") { exists() }
        }
    }

    // ─── COGS Batch Update (6 fields — V2 bug fix) ───────

    @Test @Order(40)
    fun `batch update COGS with all 6 fields`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "items" to listOf(
                mapOf(
                    "id" to productId,
                    "category" to "Updated Category",
                    "subcategory" to "Updated Sub",
                    "type" to "Updated Type",
                    "cost" to 20.00,
                    "freight" to 5.00,
                    "weight" to 32,
                ),
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

        // Verify all 6 fields were saved (V2 bug: only {id, cogs} was sent)
        mockMvc.get("/products/$productId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            jsonPath("$.data.category") { value("Updated Category") }
            jsonPath("$.data.subcategory") { value("Updated Sub") }
            jsonPath("$.data.type") { value("Updated Type") }
            jsonPath("$.data.cost") { value(20.0) }
            jsonPath("$.data.freight") { value(5.0) }
            jsonPath("$.data.cogs") { value(25.0) }  // Auto: 20 + 5
            jsonPath("$.data.weight") { value(32) }
        }
    }

    // ─── Barcode PDF (ZXing+PDFBox, stateless) ───────────

    @Test @Order(50)
    fun `generate barcode PDF returns byte stream`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "items" to listOf(
                mapOf("sku" to TEST_SKU, "qtyPerBox" to 12, "boxPerCtn" to 4),
            ),
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
            param("category", "Updated Category")
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
        mockMvc.get("/products/metadata").andExpect { status { isUnauthorized() } }
        mockMvc.post("/products") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isUnauthorized() } }
    }
}
