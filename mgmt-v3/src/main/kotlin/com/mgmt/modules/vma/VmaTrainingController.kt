package com.mgmt.modules.vma

import com.mgmt.common.exception.NotFoundException
import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * VmaTrainingController — REST API for Training SOPs + Training Records
 *
 * Training SOP Endpoints (7):
 *   GET    /vma/training-sops              - SOP列表 (含版本历史)
 *   GET    /vma/training-sops/next-seq     - 获取下一个可用编号
 *   GET    /vma/training-sops/{id}         - 单个SOP (含版本)
 *   POST   /vma/training-sops             - 创建SOP + 初始版本
 *   PATCH  /vma/training-sops/{id}         - 更新SOP主文档信息
 *   POST   /vma/training-sops/{id}/version - 添加新版本
 *   PATCH  /vma/training-sops/{id}/toggle  - 切换状态
 *
 * Training Record Endpoints (6):
 *   GET    /vma/training-records                         - 全部记录
 *   GET    /vma/training-records/employee/{employeeNo}   - 某员工记录
 *   GET    /vma/training-records/{id}                    - 单条记录
 *   POST   /vma/training-records                         - 新增
 *   PATCH  /vma/training-records/{id}                    - 更新
 *   DELETE /vma/training-records/{id}                    - 删除
 *
 * Training Session Endpoints (4):
 *   GET    /vma/training-sessions                                - 批次列表
 *   GET    /vma/training-sessions/{id}                           - 批次详情
 *   DELETE /vma/training-sessions/{id}                           - 删除批次
 *   DELETE /vma/training-sessions/{sessionId}/records/{recordId} - 移除记录
 *
 * Analytics Endpoints (3):
 *   GET    /vma/training-records/status    - 员工培训状态总览
 *   GET    /vma/training-records/matrix    - 培训矩阵报告
 *   GET    /vma/training-records/roadmap   - 培训合规路线图
 *
 * SmartFill + PDF Endpoints (2):
 *   POST   /vma/training-records/smart-fill              - 智能补训
 *   GET    /vma/training-records/download/{filename}     - PDF 下载
 *
 * Total: 22 endpoints
 */
@RestController
@RequestMapping("/vma")
class VmaTrainingController(
    private val sopService: VmaTrainingSopService,
    private val recordService: VmaTrainingRecordService,
    private val smartFillService: VmaSmartFillService,
    private val pdfGenerator: VmaPdfGeneratorService,
    private val sessionRepo: VmaTrainingSessionRepository,
    private val recordRepo: VmaTrainingRecordRepository,
    private val employeeRepo: VmaEmployeeRepository,
    private val assignmentRepo: VmaEmployeeDepartmentRepository,
    private val departmentRepo: VmaDepartmentRepository,
    private val sopRepo: VmaTrainingSopRepository,
) {

    // ═══════════ Training SOP Endpoints ═══════════

    @GetMapping("/training-sops")
    @RequirePermission("vma.training_sop.manage")
    fun findAllSops(): ResponseEntity<Any> =
        ResponseEntity.ok(sopService.findAll())

    @GetMapping("/training-sops/next-seq")
    @RequirePermission("vma.training_sop.manage")
    fun getNextSeqNo(): ResponseEntity<Any> =
        ResponseEntity.ok(sopService.getNextSeqNo())

    @GetMapping("/training-sops/{id}")
    @RequirePermission("vma.training_sop.manage")
    fun findOneSop(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(sopService.findOne(id))

    @PostMapping("/training-sops")
    @RequirePermission("vma.training_sop.manage")
    @AuditLog(module = "VMA", action = "CREATE_TRAINING_SOP")
    fun createSop(@RequestBody dto: CreateTrainingSopRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(sopService.create(dto))

    @PatchMapping("/training-sops/{id}")
    @RequirePermission("vma.training_sop.manage")
    @AuditLog(module = "VMA", action = "UPDATE_TRAINING_SOP")
    fun updateSop(@PathVariable id: String, @RequestBody dto: UpdateTrainingSopRequest): ResponseEntity<Any> =
        ResponseEntity.ok(sopService.update(id, dto))

    @PostMapping("/training-sops/{id}/version")
    @RequirePermission("vma.training_sop.manage")
    fun addSopVersion(@PathVariable id: String, @RequestBody dto: AddSopVersionRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(sopService.addVersion(id, dto))

    @PatchMapping("/training-sops/{id}/toggle")
    @RequirePermission("vma.training_sop.manage")
    fun toggleSopStatus(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(sopService.toggleStatus(id))

    // ═══════════ Training Record Endpoints ═══════════

    @GetMapping("/training-records")
    @RequirePermission("vma.training.manage")
    fun findAllRecords(): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.findAllRecords())

    @GetMapping("/training-records/status")
    @RequirePermission("vma.training.manage")
    fun getTrainingStatus(): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.getEmployeeTrainingStatus())

    @GetMapping("/training-records/matrix")
    @RequirePermission("vma.training.manage")
    fun getTrainingMatrix(): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.getTrainingMatrix())

    @GetMapping("/training-records/roadmap")
    @RequirePermission("vma.training.manage")
    fun getTrainingRoadmap(): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.getTrainingRoadmap())

    @GetMapping("/training-records/employee/{employeeNo}")
    @RequirePermission("vma.training.manage")
    fun findRecordsByEmployee(@PathVariable employeeNo: String): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.findRecordsByEmployee(employeeNo))

    @GetMapping("/training-records/{id}")
    @RequirePermission("vma.training.manage")
    fun findOneRecord(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.findOneRecord(id))

    @PostMapping("/training-records")
    @RequirePermission("vma.training.manage")
    @AuditLog(module = "VMA", action = "CREATE_TRAINING_RECORD")
    fun createRecord(@RequestBody dto: CreateTrainingRecordRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(recordService.createRecord(dto))

    @PatchMapping("/training-records/{id}")
    @RequirePermission("vma.training.manage")
    fun updateRecord(@PathVariable id: String, @RequestBody dto: UpdateTrainingRecordRequest): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.updateRecord(id, dto))

    @DeleteMapping("/training-records/{id}")
    @RequirePermission("vma.training.manage")
    @AuditLog(module = "VMA", action = "DELETE_TRAINING_RECORD", riskLevel = "HIGH")
    fun removeRecord(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.removeRecord(id))

    // ═══════════ Training Session Endpoints ═══════════

    @GetMapping("/training-sessions")
    @RequirePermission("vma.training.manage")
    fun listSessions(): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.listSessions())

    @GetMapping("/training-sessions/{id}")
    @RequirePermission("vma.training.manage")
    fun getSession(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.getSession(id))

    @DeleteMapping("/training-sessions/{id}")
    @RequirePermission("vma.training.manage")
    @AuditLog(module = "VMA", action = "DELETE_TRAINING_SESSION", riskLevel = "HIGH")
    fun deleteSession(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.deleteSession(id))

    @DeleteMapping("/training-sessions/{sessionId}/records/{recordId}")
    @RequirePermission("vma.training.manage")
    fun removeRecordFromSession(
        @PathVariable sessionId: String,
        @PathVariable recordId: String,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(recordService.removeRecordFromSession(sessionId, recordId))

    // ═══════════ SmartFill + PDF Endpoints ═══════════

    @PostMapping("/training-records/smart-fill")
    @RequirePermission("vma.training.manage")
    @AuditLog(module = "VMA", action = "SMART_FILL_TRAINING")
    fun smartFill(@RequestBody dto: SmartFillRequest): ResponseEntity<Any> =
        ResponseEntity.ok(smartFillService.smartFill(dto.cutoffDate, dto.lecturerNo))

    /**
     * On-the-fly PDF generation for a training session.
     * Zero disk persistence — generates from DB data every time.
     */
    @GetMapping("/training-sessions/{trainingNo}/pdf")
    @RequirePermission("vma.training.manage")
    fun generateSessionPdf(@PathVariable trainingNo: String): ResponseEntity<ByteArray> {
        val session = sessionRepo.findByTrainingNo(trainingNo)
            ?: throw NotFoundException("Training session $trainingNo not found")

        val records = recordRepo.findAllBySessionId(session.id)
        if (records.isEmpty()) return ResponseEntity.notFound().build()

        // Build unique employee list with department codes
        val employeeNos = records.map { it.employeeNo }.distinct()
        val employees = employeeNos.mapNotNull { employeeRepo.findByEmployeeNo(it) }
        val empMap = employees.associateBy { it.employeeNo }

        // Resolve department codes via junction table (same pattern as SmartFillService)
        val allAssignments = assignmentRepo.findAll()
        val empDeptCodes = mutableMapOf<String, String>()
        for (emp in employees) {
            val activeAssignment = allAssignments.firstOrNull { it.employeeId == emp.id && it.removedAt == null }
            if (activeAssignment != null) {
                departmentRepo.findById(activeAssignment.departmentId).ifPresent { dept ->
                    empDeptCodes[emp.employeeNo] = dept.code
                }
            }
        }

        // Build unique SOP list
        val sopEntries = records
            .map { VmaPdfGeneratorService.SopEntry(it.sopNo, it.sopNo, it.sopVersion) }
            .distinctBy { "${it.sopNo}-${it.version}" }

        // Resolve SOP names
        val allSops = sopRepo.findAllByOrderBySeqNoAsc()
        val sopNames = allSops.associate { it.sopNo to it.name }
        val namedSopEntries = sopEntries.map { se ->
            VmaPdfGeneratorService.SopEntry(se.sopNo, sopNames[se.sopNo] ?: se.sopNo, se.version)
        }

        val sessionData = VmaPdfGeneratorService.SessionData(
            trainingNo = session.trainingNo,
            trainingDate = session.trainingDate,
            trainingSubject = session.trainingSubject,
            trainingObjective = session.trainingObjective,
            evaluationMethod = session.evaluationMethod,
            lecturerName = session.lecturerName,
            timeStart = session.trainingTimeStart ?: "09:00",
            timeEnd = session.trainingTimeEnd ?: "10:00",
            employees = employeeNos.map { empNo ->
                VmaPdfGeneratorService.EmployeeEntry(
                    employeeNo = empNo,
                    departmentCode = empDeptCodes[empNo] ?: "",
                )
            },
            sops = namedSopEntries,
        )

        val pdfBytes = pdfGenerator.generateSessionPdf(sessionData)
        val filename = "training_${session.trainingNo}.pdf"

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentLength(pdfBytes.size.toLong())
            .body(pdfBytes)
    }
}
