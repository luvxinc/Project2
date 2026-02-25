package com.mgmt.modules.sales

import com.mgmt.modules.auth.AuthService
import com.mgmt.modules.auth.dto.LoginRequest
import org.junit.jupiter.api.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

/**
 * RawTransactionIntegrationTest — 只读, 基于已有 61,363 条数据。
 *
 * V1 验证: tab_transaction 页面能正确展示 Data_Transaction 数据。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RawTransactionIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var authService: AuthService

    private lateinit var token: String

    companion object {
        var firstId: Long = 0
        var testOrderNumber: String = ""
    }

    @BeforeEach
    fun setup() {
        val result = authService.login(LoginRequest(username = "admin", password = "1522P"))
        token = result.accessToken
    }

    @Test
    @Order(1)
    fun `list raw transactions with pagination`() {
        val result = mockMvc.get("/api/sales/raw-transactions?page=1&limit=5") {
            header("Authorization", "Bearer $token")
        }
            .andDo { print() }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
                jsonPath("$.total") { isNumber() }
                jsonPath("$.page") { value(1) }
                jsonPath("$.limit") { value(5) }
            }
            .andReturn()

        val body = result.response.contentAsString
        val idMatch = Regex("\"id\":(\\d+)").find(body)
        if (idMatch != null) firstId = idMatch.groupValues[1].toLong()

        val orderMatch = Regex("\"orderNumber\":\"([^\"]+)\"").find(body)
        if (orderMatch != null) testOrderNumber = orderMatch.groupValues[1]
    }

    @Test
    @Order(2)
    fun `get raw transaction by id`() {
        if (firstId == 0L) return

        mockMvc.get("/api/sales/raw-transactions/$firstId") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data.id") { value(firstId.toInt()) }
                jsonPath("$.data.source") { isString() }
                jsonPath("$.data.items") { isArray() }
            }
    }

    @Test
    @Order(3)
    fun `filter by source ebay`() {
        mockMvc.get("/api/sales/raw-transactions?source=ebay&limit=3") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
            }
    }

    @Test
    @Order(4)
    fun `search by order number`() {
        if (testOrderNumber.isEmpty()) return

        mockMvc.get("/api/sales/raw-transactions/by-order/$testOrderNumber") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
            }
    }

    @Test
    @Order(5)
    fun `not found returns 404`() {
        mockMvc.get("/api/sales/raw-transactions/999999999") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isNotFound() }
            }
    }
}
