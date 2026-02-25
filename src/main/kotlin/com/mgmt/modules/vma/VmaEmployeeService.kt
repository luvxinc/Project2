package com.mgmt.modules.vma

import com.mgmt.common.exception.BadRequestException
import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.ForbiddenException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*

/**
 * VmaEmployeeService — 员工 + 部门 + 部门分配 + SOP 需求/历史。
 *
 * V3 Improvements over V2:
 *   - JPA Specification for dynamic search (no raw `where: any = {}`)
 *   - Pacific Date utility inlined as Kotlin extension
 *   - Stack-edit rule preserved with cleaner Kotlin code
 *   - All responses use typed DTOs instead of Prisma spread objects
 */
@Service
@Transactional
class VmaEmployeeService(
    private val employeeRepo: VmaEmployeeRepository,
    private val departmentRepo: VmaDepartmentRepository,
    private val assignmentRepo: VmaEmployeeDepartmentRepository,
    private val sopReqRepo: VmaDutySopRequirementRepository,
    private val sopHistoryRepo: VmaDutySopHistoryRepository,
    private val trainingSopRepo: VmaTrainingSopRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // ─── Pacific Date Utility ───────────────────────────────

    /**
     * 太平洋时区铁律: YYYY-MM-DD → T12:00:00Z , 防止跨天偏移
     */
    private fun parsePacificDate(dateStr: String): Instant =
        Instant.parse("${dateStr}T12:00:00.000Z")

    // ════════════════════════════════════════════════════════
    // Employee CRUD
    // ════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun findAllEmployees(query: EmployeeQueryParams): Map<String, Any> {
        val pageable = PageRequest.of(
            (query.page - 1).coerceAtLeast(0),
            query.limit,
            Sort.by(Sort.Direction.DESC, "createdAt"),
        )

        // Dynamic filter with JPA Specification
        var spec = Specification.where<VmaEmployee>(null)

        if (!query.search.isNullOrBlank()) {
            spec = spec.and { root, _, cb ->
                val pattern = "%${query.search.lowercase()}%"
                cb.or(
                    cb.like(cb.lower(root.get("employeeNo")), pattern),
                    cb.like(cb.lower(root.get("lastName")), pattern),
                    cb.like(cb.lower(root.get("firstName")), pattern),
                )
            }
        }
        if (!query.status.isNullOrBlank()) {
            spec = spec.and { root, _, cb ->
                cb.equal(root.get<VmaEmployeeStatus>("status"), VmaEmployeeStatus.valueOf(query.status))
            }
        }
        // Note: departmentId filter requires a subquery via assignment table
        if (!query.departmentId.isNullOrBlank()) {
            spec = spec.and { root, cq, cb ->
                val sub = cq!!.subquery(String::class.java)
                val assign = sub.from(VmaEmployeeDepartment::class.java)
                sub.select(assign.get("employeeId"))
                    .where(
                        cb.equal(assign.get<String>("departmentId"), query.departmentId),
                        cb.isNull(assign.get<Instant?>("removedAt")),
                    )
                root.get<String>("id").`in`(sub)
            }
        }

        val page = employeeRepo.findAll(spec, pageable)

        // Enrich with department assignments
        val result = page.content.map { emp -> toEmployeeResponse(emp) }

        return mapOf(
            "data" to result,
            "total" to page.totalElements,
            "page" to query.page,
            "limit" to query.limit,
            "totalPages" to page.totalPages,
        )
    }

    @Transactional(readOnly = true)
    fun findOneEmployee(id: String): EmployeeResponse {
        val emp = employeeRepo.findById(id)
            .orElseThrow { NotFoundException("Employee $id not found") }
        return toEmployeeResponse(emp)
    }

    fun createEmployee(dto: CreateEmployeeRequest): EmployeeResponse {
        // Unique check
        employeeRepo.findByEmployeeNo(dto.employeeNo)?.let {
            throw ConflictException("Employee number ${dto.employeeNo} already exists")
        }

        val hireDate = parsePacificDate(dto.hireDate)
        val emp = VmaEmployee(
            id = UUID.randomUUID().toString(),
            employeeNo = dto.employeeNo,
            lastName = dto.lastName,
            firstName = dto.firstName,
            hireDate = hireDate,
        )
        employeeRepo.save(emp)

        // Create department assignments
        dto.departmentIds.forEach { deptId ->
            departmentRepo.findById(deptId)
                .orElseThrow { NotFoundException("Department $deptId not found") }
            assignmentRepo.save(VmaEmployeeDepartment(
                id = UUID.randomUUID().toString(),
                employeeId = emp.id,
                departmentId = deptId,
                assignedAt = hireDate,
            ))
        }

        log.info("Created employee: ${emp.employeeNo} ${emp.lastName} ${emp.firstName}")
        return toEmployeeResponse(emp)
    }

    fun updateEmployee(id: String, dto: UpdateEmployeeRequest): EmployeeResponse {
        val emp = employeeRepo.findById(id)
            .orElseThrow { NotFoundException("Employee $id not found") }

        // Unique check for employeeNo
        dto.employeeNo?.let { newNo ->
            employeeRepo.findByEmployeeNoAndIdNot(newNo, id)?.let {
                throw ConflictException("Employee number $newNo already exists")
            }
            emp.employeeNo = newNo
        }

        dto.lastName?.let { emp.lastName = it }
        dto.firstName?.let { emp.firstName = it }
        dto.hireDate?.let { emp.hireDate = parsePacificDate(it) }
        dto.status?.let { emp.status = VmaEmployeeStatus.valueOf(it) }
        dto.terminationDate?.let { emp.terminationDate = parsePacificDate(it) }
        emp.updatedAt = Instant.now()

        employeeRepo.save(emp)
        return toEmployeeResponse(emp)
    }

    fun deleteEmployee(id: String): Map<String, Any> {
        val emp = employeeRepo.findById(id)
            .orElseThrow { NotFoundException("Employee $id not found") }
        emp.deletedAt = Instant.now()
        emp.status = VmaEmployeeStatus.INACTIVE
        emp.updatedAt = Instant.now()
        employeeRepo.save(emp)
        return mapOf("success" to true, "id" to id)
    }

    fun toggleEmployeeStatus(id: String, dto: ToggleEmployeeStatusRequest?): EmployeeResponse {
        val emp = employeeRepo.findById(id)
            .orElseThrow { NotFoundException("Employee $id not found") }

        val newStatus = if (emp.status == VmaEmployeeStatus.ACTIVE) VmaEmployeeStatus.INACTIVE else VmaEmployeeStatus.ACTIVE

        if (newStatus == VmaEmployeeStatus.INACTIVE && dto?.terminationDate.isNullOrBlank()) {
            throw BadRequestException("Termination date is required when deactivating an employee")
        }

        emp.status = newStatus
        if (newStatus == VmaEmployeeStatus.INACTIVE) {
            emp.terminationDate = parsePacificDate(dto!!.terminationDate!!)
        } else {
            emp.terminationDate = null
        }
        emp.updatedAt = Instant.now()
        employeeRepo.save(emp)

        return toEmployeeResponse(emp)
    }

    // ════════════════════════════════════════════════════════
    // Employee-Department Assignments
    // ════════════════════════════════════════════════════════

    fun addDepartmentAssignment(employeeId: String, dto: AddDepartmentAssignmentRequest): DepartmentAssignmentResponse {
        employeeRepo.findById(employeeId).orElseThrow { NotFoundException("Employee $employeeId not found") }
        val dept = departmentRepo.findById(dto.departmentId)
            .orElseThrow { NotFoundException("Department ${dto.departmentId} not found") }

        // Check duplicate active assignment
        assignmentRepo.findByEmployeeIdAndDepartmentIdAndRemovedAtIsNull(employeeId, dto.departmentId)?.let {
            throw ConflictException("Employee already has an active assignment to this department")
        }

        val assignment = VmaEmployeeDepartment(
            id = UUID.randomUUID().toString(),
            employeeId = employeeId,
            departmentId = dto.departmentId,
            assignedAt = parsePacificDate(dto.assignedAt),
        )
        assignmentRepo.save(assignment)

        return toAssignmentResponse(assignment, dept)
    }

    fun removeDepartmentAssignment(assignmentId: String, dto: RemoveDepartmentAssignmentRequest): DepartmentAssignmentResponse {
        val assignment = assignmentRepo.findById(assignmentId)
            .orElseThrow { NotFoundException("Assignment $assignmentId not found") }
        if (assignment.removedAt != null) {
            throw ConflictException("Assignment already removed")
        }
        assignment.removedAt = parsePacificDate(dto.removedAt)
        assignmentRepo.save(assignment)

        val dept = departmentRepo.findById(assignment.departmentId).orElse(null)
        return toAssignmentResponse(assignment, dept)
    }

    fun updateDepartmentAssignment(assignmentId: String, dto: UpdateDepartmentAssignmentRequest): DepartmentAssignmentResponse {
        val assignment = assignmentRepo.findById(assignmentId)
            .orElseThrow { NotFoundException("Assignment $assignmentId not found") }
        enforceStackRule(assignment.employeeId, assignmentId)

        dto.assignedAt?.let { assignment.assignedAt = parsePacificDate(it) }
        dto.removedAt?.let { assignment.removedAt = parsePacificDate(it) }
        assignmentRepo.save(assignment)

        val dept = departmentRepo.findById(assignment.departmentId).orElse(null)
        return toAssignmentResponse(assignment, dept)
    }

    fun deleteDepartmentAssignment(assignmentId: String): Map<String, Any> {
        val assignment = assignmentRepo.findById(assignmentId)
            .orElseThrow { NotFoundException("Assignment $assignmentId not found") }
        enforceStackRule(assignment.employeeId, assignmentId)
        assignmentRepo.delete(assignment)
        return mapOf("success" to true, "id" to assignmentId)
    }

    /**
     * Stack-edit rule: Only the most recent assignment can be modified/deleted.
     */
    private fun enforceStackRule(employeeId: String, targetId: String) {
        val records = assignmentRepo.findAllByEmployeeIdOrderByAssignedAtDesc(employeeId)
        if (records.isNotEmpty() && records[0].id != targetId) {
            throw ForbiddenException("Only the most recent record can be modified. Delete newer records first.")
        }
    }

    // ════════════════════════════════════════════════════════
    // Department CRUD
    // ════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun findAllDepartments(): List<DepartmentResponse> {
        val departments = departmentRepo.findAllByOrderByCodeAscDutiesAsc()
        return departments.map { dept ->
            val empCount = assignmentRepo.countByDepartmentIdAndRemovedAtIsNull(dept.id)
            toDepartmentResponse(dept, empCount)
        }
    }

    fun createDepartment(dto: CreateDepartmentRequest): DepartmentResponse {
        departmentRepo.findByCodeAndDuties(dto.code, dto.duties)?.let {
            throw ConflictException("Department code \"${dto.code}\" with duty \"${dto.duties}\" already exists")
        }

        val dept = VmaDepartment(
            id = UUID.randomUUID().toString(),
            code = dto.code,
            name = dto.name,
            duties = dto.duties,
            sopTrainingReq = dto.sopTrainingReq,
        )
        departmentRepo.save(dept)
        return toDepartmentResponse(dept, 0)
    }

    fun updateDepartment(id: String, dto: UpdateDepartmentRequest): DepartmentResponse {
        val dept = departmentRepo.findById(id)
            .orElseThrow { NotFoundException("Department $id not found") }

        val newCode = dto.code ?: dept.code
        val newDuties = dto.duties ?: dept.duties
        if (dto.code != null || dto.duties != null) {
            departmentRepo.findByCodeAndDutiesAndIdNot(newCode, newDuties, id)?.let {
                throw ConflictException("Department code \"$newCode\" with duty \"$newDuties\" already exists")
            }
        }

        dto.code?.let { dept.code = it }
        dto.name?.let { dept.name = it }
        dto.duties?.let { dept.duties = it }
        dto.sopTrainingReq?.let { dept.sopTrainingReq = it }
        dto.isActive?.let { dept.isActive = it }
        dept.updatedAt = Instant.now()
        departmentRepo.save(dept)

        val empCount = assignmentRepo.countByDepartmentIdAndRemovedAtIsNull(dept.id)
        return toDepartmentResponse(dept, empCount)
    }

    fun deleteDepartment(id: String): Map<String, Any> {
        val dept = departmentRepo.findById(id)
            .orElseThrow { NotFoundException("Department $id not found") }

        val empCount = assignmentRepo.countByDepartmentId(id)
        if (empCount > 0) {
            throw ConflictException("Cannot delete department with $empCount employee assignments (active or historical)")
        }

        dept.deletedAt = Instant.now()
        dept.isActive = false
        dept.updatedAt = Instant.now()
        departmentRepo.save(dept)
        return mapOf("success" to true, "id" to id)
    }

    // ════════════════════════════════════════════════════════
    // Duty SOP Requirements + History
    // ════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getDutySopRequirements(dutyId: String): List<String> {
        departmentRepo.findById(dutyId).orElseThrow { NotFoundException("Department $dutyId not found") }
        return sopReqRepo.findAllByDutyIdOrderByCreatedAtAsc(dutyId).map { it.sopNo }
    }

    fun updateDutySopRequirements(dutyId: String, dto: UpdateSopRequirementsRequest): Map<String, Any> {
        departmentRepo.findById(dutyId).orElseThrow { NotFoundException("Department $dutyId not found") }

        val unique = dto.sopNos.distinct()
        val changeDate = parsePacificDate(dto.changeDate)

        // Date validation: must be after latest history date
        sopHistoryRepo.findFirstByDepartmentIdOrderByChangeDateDesc(dutyId)?.let { latest ->
            if (changeDate <= latest.changeDate) {
                throw BadRequestException(
                    "Change date must be after the latest history date (${latest.changeDate.toString().take(10)})"
                )
            }
        }

        // Get current SOP list
        val currentSopNos = sopReqRepo.findAllByDutyIdOrderByCreatedAtAsc(dutyId).map { it.sopNo }.toSet()
        val newSopNos = unique.toSet()

        val added = unique.filter { it !in currentSopNos }
        val removed = currentSopNos.filter { it !in newSopNos }

        // Transaction: replace requirements + write history
        sopReqRepo.deleteAllByDutyId(dutyId)
        unique.forEach { sopNo ->
            sopReqRepo.save(VmaDutySopRequirement(
                id = UUID.randomUUID().toString(),
                dutyId = dutyId,
                sopNo = sopNo,
            ))
        }

        // Write history records
        added.forEach { sopNo ->
            sopHistoryRepo.save(VmaDutySopHistory(
                id = UUID.randomUUID().toString(),
                departmentId = dutyId,
                changeDate = changeDate,
                changeType = "ADD",
                sopNo = sopNo,
            ))
        }
        removed.forEach { sopNo ->
            sopHistoryRepo.save(VmaDutySopHistory(
                id = UUID.randomUUID().toString(),
                departmentId = dutyId,
                changeDate = changeDate,
                changeType = "REMOVE",
                sopNo = sopNo,
            ))
        }

        return mapOf(
            "dutyId" to dutyId,
            "sopNos" to unique,
            "count" to unique.size,
            "added" to added,
            "removed" to removed,
        )
    }

    @Transactional(readOnly = true)
    fun getDutySopHistory(dutyId: String): List<SopHistoryGroupResponse> {
        departmentRepo.findById(dutyId).orElseThrow { NotFoundException("Department $dutyId not found") }

        val history = sopHistoryRepo.findAllByDepartmentIdOrderByChangeDateAsc(dutyId)
        if (history.isEmpty()) return emptyList()

        // SOP name lookup
        val allSopNos = history.map { it.sopNo }.distinct()
        val sops = trainingSopRepo.findBySopNoIn(allSopNos)
        val sopNameMap = sops.associate { it.sopNo to it.name }

        // Group by changeDate
        return history.groupBy { it.changeDate.toString() }
            .map { (date, records) ->
                SopHistoryGroupResponse(
                    changeDate = date,
                    changeType = if (records[0].changeType == "INITIAL") "INITIAL" else "CHANGE",
                    changes = records.map { r ->
                        SopHistoryItemResponse(
                            id = r.id,
                            changeType = r.changeType,
                            sopNo = r.sopNo,
                            sopName = sopNameMap[r.sopNo] ?: r.sopNo,
                        )
                    },
                )
            }
    }

    fun updateSopHistory(historyId: String, dto: UpdateSopHistoryRequest): VmaDutySopHistory {
        val record = sopHistoryRepo.findById(historyId)
            .orElseThrow { NotFoundException("SOP history record $historyId not found") }
        enforceSopHistoryStackRule(record.departmentId, historyId)

        dto.changeDate?.let { record.changeDate = parsePacificDate(it) }
        dto.changeType?.let { record.changeType = it }
        dto.sopNo?.let { record.sopNo = it }

        return sopHistoryRepo.save(record)
    }

    fun deleteSopHistory(historyId: String): Map<String, Any> {
        val record = sopHistoryRepo.findById(historyId)
            .orElseThrow { NotFoundException("SOP history record $historyId not found") }
        enforceSopHistoryStackRule(record.departmentId, historyId)
        sopHistoryRepo.delete(record)
        return mapOf("success" to true, "id" to historyId)
    }

    /**
     * SOP History stack rule: only the most recent date-group can be modified.
     */
    private fun enforceSopHistoryStackRule(departmentId: String, targetId: String) {
        val history = sopHistoryRepo.findAllByDepartmentIdOrderByChangeDateDesc(departmentId)
        if (history.isEmpty()) return

        val latestTime = history[0].changeDate
        val latestGroup = history.filter { it.changeDate == latestTime }
        if (latestGroup.none { it.id == targetId }) {
            throw ForbiddenException("Only the most recent history group can be modified. Delete newer records first.")
        }
    }

    // ─── Response Mappers ───────────────────────────────────

    private fun toEmployeeResponse(emp: VmaEmployee): EmployeeResponse {
        val assignments = assignmentRepo.findAllByEmployeeIdOrderByAssignedAtAsc(emp.id)
        val deptIds = assignments.map { it.departmentId }.distinct()
        val deptMap = if (deptIds.isNotEmpty()) {
            departmentRepo.findAllById(deptIds).associateBy { it.id }
        } else emptyMap()

        val activeDepts = assignments
            .filter { it.removedAt == null }
            .mapNotNull { a -> deptMap[a.departmentId]?.let { toDeptBrief(it) } }

        val assignmentResponses = assignments.map { a ->
            toAssignmentResponse(a, deptMap[a.departmentId])
        }

        return EmployeeResponse(
            id = emp.id,
            employeeNo = emp.employeeNo,
            lastName = emp.lastName,
            firstName = emp.firstName,
            hireDate = emp.hireDate,
            terminationDate = emp.terminationDate,
            status = emp.status.name,
            departments = activeDepts,
            departmentAssignments = assignmentResponses,
            createdAt = emp.createdAt,
            updatedAt = emp.updatedAt,
        )
    }

    private fun toAssignmentResponse(a: VmaEmployeeDepartment, dept: VmaDepartment?): DepartmentAssignmentResponse {
        return DepartmentAssignmentResponse(
            id = a.id,
            employeeId = a.employeeId,
            departmentId = a.departmentId,
            assignedAt = a.assignedAt,
            removedAt = a.removedAt,
            department = dept?.let { toDeptBrief(it) },
            createdAt = a.createdAt,
        )
    }

    private fun toDeptBrief(dept: VmaDepartment) = DepartmentBrief(
        id = dept.id, code = dept.code, name = dept.name, duties = dept.duties,
    )

    private fun toDepartmentResponse(dept: VmaDepartment, empCount: Long) = DepartmentResponse(
        id = dept.id,
        code = dept.code,
        name = dept.name,
        duties = dept.duties,
        sopTrainingReq = dept.sopTrainingReq,
        isActive = dept.isActive,
        employeeCount = empCount,
        createdAt = dept.createdAt,
        updatedAt = dept.updatedAt,
    )
}
