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
 * CleanedTransactionIntegrationTest — 只读, 基于已有 63,776 条数据。
 *
 * V1 验证:
 *   - Data_Clean_Log 查询 + action 过滤
 *   - _get_db_stats_before 统计
 *   - _get_data_cutoff_date 日期范围
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CleanedTransactionIntegrationTest {

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
    fun `list cleaned transactions with pagination`() {
        val result = mockMvc.get("/api/sales/cleaned-transactions?page=1&limit=5") {
            header("Authorization", "Bearer $token")
        }
            .andDo { print() }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
                jsonPath("$.total") { isNumber() }
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
    fun `get cleaned transaction by id with sku slots`() {
        if (firstId == 0L) return

        mockMvc.get("/api/sales/cleaned-transactions/$firstId") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data.id") { value(firstId.toInt()) }
                jsonPath("$.data.action") { isString() }
                jsonPath("$.data.skuSlots") { isArray() }
            }
    }

    @Test
    @Order(3)
    fun `filter by action NN (normal sale)`() {
        mockMvc.get("/api/sales/cleaned-transactions?action=NN&limit=3") {
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
    fun `filter by action CA (cancel)`() {
        mockMvc.get("/api/sales/cleaned-transactions?action=CA&limit=3") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
            }
    }

    @Test
    @Order(5)
    fun `search by order number`() {
        if (testOrderNumber.isEmpty()) return

        mockMvc.get("/api/sales/cleaned-transactions/by-order/$testOrderNumber") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
            }
    }

    @Test
    @Order(6)
    fun `stats endpoint returns action counts`() {
        mockMvc.get("/api/sales/cleaned-transactions/stats") {
            header("Authorization", "Bearer $token")
        }
            .andDo { print() }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data.rawCount") { isNumber() }
                jsonPath("$.data.cleanedCount") { isNumber() }
                jsonPath("$.data.actionCounts") { isMap() }
                jsonPath("$.data.actionCounts.NN") { isNumber() }
            }
    }

    @Test
    @Order(7)
    fun `not found returns 404`() {
        mockMvc.get("/api/sales/cleaned-transactions/999999999") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isNotFound() }
            }
    }

    @Test
    @Order(8)
    fun `filter by date range`() {
        mockMvc.get("/api/sales/cleaned-transactions?dateFrom=2024-01-01&dateTo=2024-12-31&limit=3") {
            header("Authorization", "Bearer $token")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.success") { value(true) }
                jsonPath("$.data") { isArray() }
            }
    }
}
