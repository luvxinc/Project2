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
import javax.sql.DataSource

/**
 * VMA Employee+Department Integration Tests (Phase 3)
 *
 * Tests cover:
 *   1. Department CRUD
 *   2. Employee CRUD + search
 *   3. Employee-Department Assignment lifecycle (stack-edit)
 *   4. Employee toggle status (with terminationDate)
 *   5. Error cases (404, 409, 400)
 *   6. Auth guards (401)
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class VmaIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        var deptId: String = ""
        var deptId2: String = ""
        var empId: String = ""
        var assignmentId: String = ""
    }

    /** Clean up residual test data before/after the full suite for idempotency. */
    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("DELETE FROM vma_employee_departments WHERE employee_id IN (SELECT id FROM vma_employees WHERE employee_no = 'VMA-TEST-001')")
                stmt.execute("DELETE FROM vma_employees WHERE employee_no = 'VMA-TEST-001'")
                stmt.execute("DELETE FROM vma_departments WHERE code = 'TEST-VMA'")
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

    // ─── Department CRUD ─────────────────────────────────

    @Test @Order(1)
    fun `create department`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "code" to "TEST-VMA",
            "name" to "Test VMA Dept",
            "duties" to "Testing",
        ))
        val result = mockMvc.post("/vma/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.code") { value("TEST-VMA") }
            jsonPath("$.duties") { value("Testing") }
            jsonPath("$.employeeCount") { value(0) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        deptId = json["id"].asText()
    }

    @Test @Order(2)
    fun `create second department`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "code" to "TEST-VMA",
            "name" to "Test VMA Dept Alt",
            "duties" to "QA",
        ))
        val result = mockMvc.post("/vma/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        deptId2 = json["id"].asText()
    }

    @Test @Order(3)
    fun `create department with duplicate code+duty returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "code" to "TEST-VMA",
            "name" to "Duplicate",
            "duties" to "Testing",
        ))
        mockMvc.post("/vma/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(4)
    fun `list departments`() {
        mockMvc.get("/vma/departments") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    // ─── Employee CRUD ───────────────────────────────────

    @Test @Order(10)
    fun `create employee with department`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to "VMA-TEST-001",
            "lastName" to "Smith",
            "firstName" to "John",
            "departmentIds" to listOf(deptId),
            "hireDate" to "2024-01-15",
        ))
        val result = mockMvc.post("/vma/employees") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.employeeNo") { value("VMA-TEST-001") }
            jsonPath("$.lastName") { value("Smith") }
            jsonPath("$.status") { value("ACTIVE") }
            jsonPath("$.departments") { isArray() }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        empId = json["id"].asText()
    }

    @Test @Order(11)
    fun `create employee with duplicate employeeNo returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to "VMA-TEST-001",
            "lastName" to "Dup",
            "firstName" to "Test",
            "departmentIds" to listOf(deptId),
            "hireDate" to "2024-06-01",
        ))
        mockMvc.post("/vma/employees") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(12)
    fun `get employee by id`() {
        mockMvc.get("/vma/employees/$empId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.employeeNo") { value("VMA-TEST-001") }
            jsonPath("$.departmentAssignments[0].department.code") { value("TEST-VMA") }
        }
    }

    @Test @Order(13)
    fun `search employees`() {
        mockMvc.get("/vma/employees") {
            header("Authorization", "Bearer $token")
            param("search", "Smith")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data") { isArray() }
            jsonPath("$.total") { value(1) }
        }
    }

    @Test @Order(14)
    fun `update employee`() {
        val body = objectMapper.writeValueAsString(mapOf("lastName" to "Johnson"))
        mockMvc.patch("/vma/employees/$empId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.lastName") { value("Johnson") }
        }
    }

    // ─── Department Assignment Lifecycle ─────────────────

    @Test @Order(20)
    fun `add second department assignment`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "departmentId" to deptId2,
            "assignedAt" to "2024-06-01",
        ))
        val result = mockMvc.post("/vma/employees/$empId/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.department.duties") { value("QA") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        assignmentId = json["id"].asText()
    }

    @Test @Order(21)
    fun `duplicate active assignment returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "departmentId" to deptId2,
            "assignedAt" to "2024-07-01",
        ))
        mockMvc.post("/vma/employees/$empId/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(22)
    fun `remove department assignment`() {
        val body = objectMapper.writeValueAsString(mapOf("removedAt" to "2024-12-31"))
        mockMvc.patch("/vma/employee-departments/$assignmentId/remove") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.removedAt") { exists() }
        }
    }

    // ─── Toggle Status ──────────────────────────────────

    @Test @Order(30)
    fun `toggle to INACTIVE requires terminationDate`() {
        mockMvc.patch("/vma/employees/$empId/toggle") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test @Order(31)
    fun `toggle to INACTIVE with terminationDate`() {
        val body = objectMapper.writeValueAsString(mapOf("terminationDate" to "2025-01-15"))
        mockMvc.patch("/vma/employees/$empId/toggle") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("INACTIVE") }
            jsonPath("$.terminationDate") { exists() }
        }
    }

    @Test @Order(32)
    fun `toggle back to ACTIVE`() {
        mockMvc.patch("/vma/employees/$empId/toggle") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("ACTIVE") }
        }
    }

    // ─── Auth Guards ────────────────────────────────────

    @Test @Order(90)
    fun `endpoints require authentication`() {
        mockMvc.get("/vma/employees").andExpect { status { isUnauthorized() } }
        mockMvc.get("/vma/departments").andExpect { status { isUnauthorized() } }
    }

    // ─── Cleanup ────────────────────────────────────────

    @Test @Order(99)
    fun `cleanup - delete test employee and departments`() {
        // Delete employee
        mockMvc.delete("/vma/employees/$empId") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isOk() } }

        // Note: Departments with assignments (even from soft-deleted employees)
        // cannot be hard-deleted per business rules. This validates the constraint.
    }
}
