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
 * VMA Training Integration Tests
 *
 * Covers all 22 Training endpoints:
 *
 *   Training SOP (7):
 *     GET    /vma/training-sops              - SOP list
 *     GET    /vma/training-sops/next-seq     - next seqNo
 *     GET    /vma/training-sops/{id}         - single SOP
 *     POST   /vma/training-sops             - create SOP
 *     PATCH  /vma/training-sops/{id}         - update SOP
 *     POST   /vma/training-sops/{id}/version - add version
 *     PATCH  /vma/training-sops/{id}/toggle  - toggle status
 *
 *   Training Record (6):
 *     GET    /vma/training-records                         - all records
 *     GET    /vma/training-records/employee/{empNo}        - employee records
 *     GET    /vma/training-records/{id}                    - single record
 *     POST   /vma/training-records                         - create
 *     PATCH  /vma/training-records/{id}                    - update
 *     DELETE /vma/training-records/{id}                    - delete
 *
 *   Training Session (4):
 *     GET    /vma/training-sessions                                - list
 *     GET    /vma/training-sessions/{id}                           - detail
 *     DELETE /vma/training-sessions/{sessionId}/records/{recordId} - remove record
 *     DELETE /vma/training-sessions/{id}                           - delete session
 *
 *   Analytics (3):
 *     GET    /vma/training-records/status    - employee status overview
 *     GET    /vma/training-records/matrix    - training matrix
 *     GET    /vma/training-records/roadmap   - training roadmap
 *
 *   SmartFill + PDF (2):
 *     POST   /vma/training-records/smart-fill              - auto-fill
 *     GET    /vma/training-sessions/{trainingNo}/pdf       - PDF download
 *
 * Prerequisites created by test:
 *   - Department (TRN-TEST) with duty-SOP assignment
 *   - Employee (EMP-TRN-001) assigned to department
 *   - Second Employee (EMP-TRN-002) for multi-employee SmartFill
 *
 * Test data is fully self-contained — cleaned before/after test suite.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class VmaTrainingIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var authService: AuthService
    @Autowired lateinit var dataSource: DataSource

    private lateinit var token: String

    companion object {
        // Test entity IDs — populated during test execution
        var sopId: String = ""
        var sopId2: String = ""
        var versionId: String = ""
        var recordId: String = ""
        var recordId2: String = ""
        var sessionId: String = ""
        var sessionTrainingNo: String = ""
        var deptId: String = ""
        var empId: String = ""
        var empId2: String = ""
        var assignmentId: String = ""
        var assignmentId2: String = ""

        // Test constants
        const val SOP_NO = "SOP-TRN-TEST-001"
        const val SOP_NO_2 = "SOP-TRN-TEST-002"
        const val EMP_NO = "EMP-TRN-001"
        const val EMP_NO_2 = "EMP-TRN-002"
        const val DEPT_CODE = "TRN-TEST"
    }

    /** Clean up ALL test data for idempotency. */
    private fun cleanTestData() {
        dataSource.connection.use { conn ->
            conn.createStatement().use { stmt ->
                // Order matters: FKs and children first
                stmt.execute("DELETE FROM vma_training_records WHERE sop_no LIKE 'SOP-TRN-TEST-%' OR employee_no LIKE 'EMP-TRN-%'")
                stmt.execute("DELETE FROM vma_training_sessions WHERE training_subject LIKE '%TRN-TEST%' OR lecturer_no LIKE 'EMP-TRN-%'")
                stmt.execute("DELETE FROM vma_training_sop_versions WHERE sop_id IN (SELECT id FROM vma_training_sops WHERE sop_no LIKE 'SOP-TRN-TEST-%')")
                stmt.execute("DELETE FROM vma_duty_sop_requirements WHERE sop_no LIKE 'SOP-TRN-TEST-%'")
                stmt.execute("DELETE FROM vma_duty_sop_history WHERE sop_no LIKE 'SOP-TRN-TEST-%'")
                stmt.execute("DELETE FROM vma_training_sops WHERE sop_no LIKE 'SOP-TRN-TEST-%'")
                stmt.execute("DELETE FROM vma_employee_departments WHERE employee_id IN (SELECT id FROM vma_employees WHERE employee_no LIKE 'EMP-TRN-%')")
                stmt.execute("DELETE FROM vma_employees WHERE employee_no LIKE 'EMP-TRN-%'")
                stmt.execute("DELETE FROM vma_departments WHERE code = '$DEPT_CODE'")
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
    // §0 Prerequisites: Department + Employees
    // ═══════════════════════════════════════════════════════════

    @Test @Order(10)
    fun `create test department`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "code" to DEPT_CODE,
            "name" to "Training Test Department",
            "duties" to "Test Duties",
        ))
        val result = mockMvc.post("/vma/departments") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.code") { value(DEPT_CODE) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        deptId = json["id"].asText()
    }

    @Test @Order(11)
    fun `create test employee 1`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to EMP_NO,
            "lastName" to "Test",
            "firstName" to "Employee1",
            "departmentIds" to listOf(deptId),
            "hireDate" to "2025-01-15",
        ))
        val result = mockMvc.post("/vma/employees") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.employeeNo") { value(EMP_NO) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        empId = json["id"].asText()
        // Capture department assignment ID
        if (json.has("departmentAssignments") && json["departmentAssignments"].size() > 0) {
            assignmentId = json["departmentAssignments"][0]["id"].asText()
        }
    }

    @Test @Order(12)
    fun `create test employee 2`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to EMP_NO_2,
            "lastName" to "Test",
            "firstName" to "Employee2",
            "departmentIds" to listOf(deptId),
            "hireDate" to "2025-06-01",
        ))
        val result = mockMvc.post("/vma/employees") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.employeeNo") { value(EMP_NO_2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        empId2 = json["id"].asText()
        if (json.has("departmentAssignments") && json["departmentAssignments"].size() > 0) {
            assignmentId2 = json["departmentAssignments"][0]["id"].asText()
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §1 Training SOP CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(100)
    fun `get next seq no`() {
        mockMvc.get("/vma/training-sops/next-seq") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.nextSeqNo") { isNumber() }
        }
    }

    @Test @Order(101)
    fun `create training SOP`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "seqNo" to 9901,
            "sopNo" to SOP_NO,
            "name" to "Test SOP - Safety Procedures",
            "description" to "Integration test SOP",
            "structureClassification" to "QMS",
            "documentType" to "SOP",
            "version" to "A",
            "daNo" to "DA-TRN-001",
            "effectiveDate" to "2025-01-01",
            "trainingRequired" to true,
        ))
        val result = mockMvc.post("/vma/training-sops") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.sopNo") { value(SOP_NO) }
            jsonPath("$.name") { value("Test SOP - Safety Procedures") }
            jsonPath("$.status") { value("ACTIVE") }
            jsonPath("$.version") { value("A") }
            jsonPath("$.versions") { isArray() }
            jsonPath("$.versions.length()") { value(1) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        sopId = json["id"].asText()
        versionId = json["versions"][0]["id"].asText()
    }

    @Test @Order(102)
    fun `create second training SOP`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "seqNo" to 9902,
            "sopNo" to SOP_NO_2,
            "name" to "Test SOP - Equipment Handling",
            "structureClassification" to "QMS",
            "documentType" to "WI",
            "version" to "A",
            "daNo" to "DA-TRN-002",
            "effectiveDate" to "2025-03-01",
            "trainingRequired" to true,
        ))
        val result = mockMvc.post("/vma/training-sops") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.sopNo") { value(SOP_NO_2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        sopId2 = json["id"].asText()
    }

    @Test @Order(103)
    fun `create duplicate SOP returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "seqNo" to 9903,
            "sopNo" to SOP_NO,
            "name" to "Duplicate",
            "structureClassification" to "QMS",
            "documentType" to "SOP",
            "version" to "A",
            "daNo" to "DA-DUP",
            "effectiveDate" to "2025-01-01",
        ))
        mockMvc.post("/vma/training-sops") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(110)
    fun `get all training SOPs`() {
        mockMvc.get("/vma/training-sops") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(111)
    fun `get single training SOP`() {
        mockMvc.get("/vma/training-sops/$sopId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(sopId) }
            jsonPath("$.sopNo") { value(SOP_NO) }
            jsonPath("$.versions") { isArray() }
        }
    }

    @Test @Order(112)
    fun `get nonexistent SOP returns 404`() {
        mockMvc.get("/vma/training-sops/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(120)
    fun `update training SOP`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "name" to "Test SOP - Updated Safety Procedures",
            "description" to "Updated description",
        ))
        mockMvc.patch("/vma/training-sops/$sopId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Test SOP - Updated Safety Procedures") }
            jsonPath("$.description") { value("Updated description") }
        }
    }

    @Test @Order(130)
    fun `add SOP version`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "version" to "B",
            "daNo" to "DA-TRN-001-B",
            "effectiveDate" to "2025-06-01",
            "trainingRequired" to true,
        ))
        mockMvc.post("/vma/training-sops/$sopId/version") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.version") { value("B") }
            jsonPath("$.daNo") { value("DA-TRN-001-B") }
        }
    }

    @Test @Order(131)
    fun `add duplicate version returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "version" to "B",
            "daNo" to "DA-DUP",
            "effectiveDate" to "2025-07-01",
        ))
        mockMvc.post("/vma/training-sops/$sopId/version") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(132)
    fun `verify SOP now has 2 versions`() {
        mockMvc.get("/vma/training-sops/$sopId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.versions.length()") { value(2) }
            // Latest version should be B (sorted by effectiveDate DESC)
            jsonPath("$.version") { value("B") }
        }
    }

    @Test @Order(140)
    fun `toggle SOP status to DEPRECATED`() {
        mockMvc.patch("/vma/training-sops/$sopId/toggle") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("DEPRECATED") }
        }
    }

    @Test @Order(141)
    fun `toggle SOP status back to ACTIVE`() {
        mockMvc.patch("/vma/training-sops/$sopId/toggle") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("ACTIVE") }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §2 Duty-SOP Assignment (prerequisite for analytics)
    // ═══════════════════════════════════════════════════════════

    @Test @Order(200)
    fun `assign SOPs to department duty`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "sopNos" to listOf(SOP_NO, SOP_NO_2),
            "changeDate" to "2025-01-01",
        ))
        mockMvc.put("/vma/departments/$deptId/sop-requirements") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
        }
    }

    @Test @Order(201)
    fun `verify SOP requirements for department`() {
        mockMvc.get("/vma/departments/$deptId/sop-requirements") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(202)
    fun `verify SOP history for department`() {
        mockMvc.get("/vma/departments/$deptId/sop-history") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §3 Training Record CRUD
    // ═══════════════════════════════════════════════════════════

    @Test @Order(300)
    fun `create training record for employee 1`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to EMP_NO,
            "sopNo" to SOP_NO,
            "sopVersion" to "A",
            "trainingDate" to "2025-02-01",
            "completedAt" to "2025-02-01",
            "trainerId" to "TRAINER-001",
            "trainingLocation" to "On-Site",
            "trainingDuration" to 60,
        ))
        val result = mockMvc.post("/vma/training-records") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.employeeNo") { value(EMP_NO) }
            jsonPath("$.sopNo") { value(SOP_NO) }
            jsonPath("$.sopVersion") { value("A") }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        recordId = json["id"].asText()
    }

    @Test @Order(301)
    fun `create duplicate training record returns 409`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to EMP_NO,
            "sopNo" to SOP_NO,
            "sopVersion" to "A",
            "trainingDate" to "2025-02-15",
        ))
        mockMvc.post("/vma/training-records") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test @Order(302)
    fun `create training record for employee 2`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "employeeNo" to EMP_NO_2,
            "sopNo" to SOP_NO,
            "sopVersion" to "A",
            "trainingDate" to "2025-07-01",
            "completedAt" to "2025-07-01",
        ))
        val result = mockMvc.post("/vma/training-records") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.employeeNo") { value(EMP_NO_2) }
        }.andReturn()

        val json = objectMapper.readTree(result.response.contentAsString)
        recordId2 = json["id"].asText()
    }

    @Test @Order(310)
    fun `get all training records`() {
        mockMvc.get("/vma/training-records") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(311)
    fun `get training records by employee`() {
        mockMvc.get("/vma/training-records/employee/$EMP_NO") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(312)
    fun `get single training record`() {
        mockMvc.get("/vma/training-records/$recordId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(recordId) }
            jsonPath("$.sopNo") { value(SOP_NO) }
        }
    }

    @Test @Order(320)
    fun `update training record`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "trainingLocation" to "Conference Room B",
            "trainingDuration" to 90,
        ))
        mockMvc.patch("/vma/training-records/$recordId") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.trainingLocation") { value("Conference Room B") }
            jsonPath("$.trainingDuration") { value(90) }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §4 Analytics Endpoints
    // ═══════════════════════════════════════════════════════════

    @Test @Order(400)
    fun `get employee training status`() {
        mockMvc.get("/vma/training-records/status") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    @Test @Order(401)
    fun `get training matrix`() {
        mockMvc.get("/vma/training-records/matrix") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sopColumns") { isArray() }
            jsonPath("$.rows") { isArray() }
            jsonPath("$.summary") { isMap() }
            jsonPath("$.summary.totalEmployees") { isNumber() }
            jsonPath("$.summary.totalSops") { isNumber() }
        }
    }

    @Test @Order(402)
    fun `get training roadmap`() {
        mockMvc.get("/vma/training-records/roadmap") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.milestones") { isArray() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §5 SmartFill Auto-Generation
    // ═══════════════════════════════════════════════════════════

    @Test @Order(500)
    fun `smart fill generates training sessions`() {
        // SmartFill should find missing SOPs for employees and create sessions
        val body = objectMapper.writeValueAsString(mapOf(
            "cutoffDate" to "2026-02-15",
            "lecturerNo" to EMP_NO,  // Use employee 1 as lecturer
        ))
        val result = mockMvc.post("/vma/training-records/smart-fill") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isOk() }
            jsonPath("$.message") { isString() }
            jsonPath("$.sessions") { isArray() }
        }.andReturn()

        // Capture session info if any were created
        val json = objectMapper.readTree(result.response.contentAsString)
        val sessions = json["sessions"]
        if (sessions.size() > 0) {
            sessionTrainingNo = sessions[0]["trainingNo"].asText()
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §6 Training Session Lifecycle
    // ═══════════════════════════════════════════════════════════

    @Test @Order(600)
    fun `list training sessions`() {
        val result = mockMvc.get("/vma/training-sessions") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }.andReturn()

        // Capture the first session ID for subsequent tests
        val json = objectMapper.readTree(result.response.contentAsString)
        if (json.size() > 0) {
            sessionId = json[0]["id"].asText()
            if (sessionTrainingNo.isEmpty() && json[0].has("trainingNo")) {
                sessionTrainingNo = json[0]["trainingNo"].asText()
            }
        }
    }

    @Test @Order(601)
    fun `get single training session`() {
        if (sessionId.isEmpty()) return  // Skip if no sessions exist
        mockMvc.get("/vma/training-sessions/$sessionId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.session") { isMap() }
            jsonPath("$.records") { isArray() }
        }
    }

    @Test @Order(602)
    fun `get nonexistent session returns 404`() {
        mockMvc.get("/vma/training-sessions/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(610)
    fun `generate session PDF`() {
        if (sessionTrainingNo.isEmpty()) return  // Skip if no sessions
        mockMvc.get("/vma/training-sessions/$sessionTrainingNo/pdf") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            content { contentType(MediaType.APPLICATION_PDF) }
        }
    }

    @Test @Order(611)
    fun `generate PDF for nonexistent session returns 404`() {
        mockMvc.get("/vma/training-sessions/NONEXISTENT-NO/pdf") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §7 Session Record Removal
    // ═══════════════════════════════════════════════════════════

    @Test @Order(700)
    fun `remove record from session`() {
        if (sessionId.isEmpty()) return  // Skip if no sessions
        // Get session detail to find a record ID
        val sessionResult = mockMvc.get("/vma/training-sessions/$sessionId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }.andReturn()

        val sjson = objectMapper.readTree(sessionResult.response.contentAsString)
        val records = sjson["records"]
        if (records == null || records.size() == 0) return

        val targetRecordId = records[0]["id"].asText()
        mockMvc.delete("/vma/training-sessions/$sessionId/records/$targetRecordId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.remaining") { isNumber() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §8 Cleanup: Delete Records, Sessions, SOPs
    // ═══════════════════════════════════════════════════════════

    @Test @Order(800)
    fun `delete training record`() {
        // Delete the manually-created record (if it still exists)
        if (recordId.isEmpty()) return
        mockMvc.delete("/vma/training-records/$recordId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    @Test @Order(801)
    fun `delete nonexistent record returns 404`() {
        mockMvc.delete("/vma/training-records/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test @Order(810)
    fun `delete training session`() {
        if (sessionId.isEmpty()) return
        mockMvc.delete("/vma/training-sessions/$sessionId") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
        }
    }

    @Test @Order(811)
    fun `delete nonexistent session returns 404`() {
        mockMvc.delete("/vma/training-sessions/nonexistent-id") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isNotFound() }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // §9 Auth Guards — unauthenticated access
    // ═══════════════════════════════════════════════════════════

    @Test @Order(900)
    fun `unauthenticated SOP access returns 401 or 403`() {
        mockMvc.get("/vma/training-sops") {
            // No Authorization header
        }.andExpect {
            status { is4xxClientError() }
        }
    }

    @Test @Order(901)
    fun `unauthenticated record access returns 401 or 403`() {
        mockMvc.get("/vma/training-records") {
            // No Authorization header
        }.andExpect {
            status { is4xxClientError() }
        }
    }

    @Test @Order(902)
    fun `unauthenticated session access returns 401 or 403`() {
        mockMvc.get("/vma/training-sessions") {
            // No Authorization header
        }.andExpect {
            status { is4xxClientError() }
        }
    }

    @Test @Order(903)
    fun `unauthenticated smart-fill returns 401 or 403`() {
        val body = objectMapper.writeValueAsString(mapOf(
            "cutoffDate" to "2026-02-15",
            "lecturerNo" to EMP_NO,
        ))
        mockMvc.post("/vma/training-records/smart-fill") {
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { is4xxClientError() }
        }
    }
}
