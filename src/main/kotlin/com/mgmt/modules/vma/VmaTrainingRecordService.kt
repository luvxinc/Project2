package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * VmaTrainingRecordService — Training Record CRUD + Session + Status/Matrix/Roadmap
 *
 *
 * Features:
 *   - Training Record CRUD
 *   - Training Session lifecycle (list, detail, delete, remove record)
 *   - Employee Training Status overview (progressive versioning)
 *   - Training Matrix (Employee × SOP cross-table)
 *   - Training Roadmap (temporal compliance milestones)
 */
@Service
@Transactional
class VmaTrainingRecordService(
    private val recordRepo: VmaTrainingRecordRepository,
    private val sessionRepo: VmaTrainingSessionRepository,
    private val employeeRepo: VmaEmployeeRepository,
    private val sopRepo: VmaTrainingSopRepository,
    private val versionRepo: VmaTrainingSopVersionRepository,
    private val departmentRepo: VmaDepartmentRepository,
    private val assignmentRepo: VmaEmployeeDepartmentRepository,
    private val sopReqRepo: VmaDutySopRequirementRepository,
    private val sopHistoryRepo: VmaDutySopHistoryRepository,
) {

    // Go-Live 日期: 培训体系正式启动日 (2025-06-15)
    private val GO_LIVE_DATE: Instant = LocalDate.of(2025, 6, 15)
        .atStartOfDay(ZoneId.of("UTC")).toInstant()

    private val pacific = ZoneId.of("America/Los_Angeles")

    private fun parsePacificDate(dateStr: String): Instant =
        LocalDate.parse(dateStr)
            .atTime(12, 0)
            .atZone(pacific)
            .toInstant()

    // ═══════════ Training Record CRUD ═══════════

    fun findAllRecords(): List<VmaTrainingRecord> =
        recordRepo.findAllByOrderByCreatedAtDesc()

    fun findRecordsByEmployee(employeeNo: String): List<VmaTrainingRecord> =
        recordRepo.findAllByEmployeeNoOrderByTrainingDateDesc(employeeNo)

    fun findOneRecord(id: String): VmaTrainingRecord =
        recordRepo.findById(id).orElseThrow { NotFoundException("Training record $id not found") }

    fun createRecord(dto: CreateTrainingRecordRequest): VmaTrainingRecord {
        recordRepo.findByEmployeeNoAndSopNoAndSopVersion(dto.employeeNo, dto.sopNo, dto.sopVersion)?.let {
            throw ConflictException("Training record already exists for ${dto.employeeNo} - ${dto.sopNo} - ${dto.sopVersion}")
        }
        return recordRepo.save(VmaTrainingRecord(
            id = UUID.randomUUID().toString(),
            employeeNo = dto.employeeNo,
            sopNo = dto.sopNo,
            sopVersion = dto.sopVersion,
            completedAt = dto.completedAt?.let { parsePacificDate(it) },
            trainerId = dto.trainerId,
            trainingDate = parsePacificDate(dto.trainingDate),
            trainingNo = dto.trainingNo,
            trainingLocation = dto.trainingLocation,
            trainingDuration = dto.trainingDuration,
        ))
    }

    fun updateRecord(id: String, dto: UpdateTrainingRecordRequest): VmaTrainingRecord {
        val record = findOneRecord(id)
        dto.completedAt?.let { record.completedAt = parsePacificDate(it) }
        dto.trainerId?.let { record.trainerId = it }
        dto.trainingDate?.let { record.trainingDate = parsePacificDate(it) }
        dto.trainingNo?.let { record.trainingNo = it }
        dto.trainingLocation?.let { record.trainingLocation = it }
        dto.trainingDuration?.let { record.trainingDuration = it }
        record.updatedAt = Instant.now()
        return recordRepo.save(record)
    }

    fun removeRecord(id: String): VmaTrainingRecord {
        val record = findOneRecord(id)
        recordRepo.delete(record)
        return record
    }

    // ═══════════ Training Session Operations ═══════════

    fun listSessions(): List<Map<String, Any?>> {
        val sessions = sessionRepo.findAllByOrderByTrainingNoDesc()
        if (sessions.isEmpty()) return emptyList()

        // Batch-load all records, group by sessionId
        val allRecords = recordRepo.findAll()
        val recordsBySession = allRecords.groupBy { it.sessionId }

        return sessions.map { s ->
            mapOf(
                "id" to s.id,
                "trainingNo" to s.trainingNo,
                "trainingDate" to s.trainingDate,
                "trainingSubject" to s.trainingSubject,
                "trainingObjective" to s.trainingObjective,
                "evaluationMethod" to s.evaluationMethod,
                "lecturerNo" to s.lecturerNo,
                "lecturerName" to s.lecturerName,
                "trainingTimeStart" to s.trainingTimeStart,
                "trainingTimeEnd" to s.trainingTimeEnd,
                "trainingPlace" to s.trainingPlace,
                "attendCount" to s.attendCount,
                "passCount" to s.passCount,
                "pdfUrl" to s.pdfUrl,
                "records" to (recordsBySession[s.id] ?: emptyList()),
            )
        }
    }

    fun getSession(id: String): Map<String, Any?> {
        val session = sessionRepo.findById(id)
            .orElseThrow { NotFoundException("Training session $id not found") }
        val records = recordRepo.findAllBySessionId(id)
        return mapOf(
            "session" to session,
            "records" to records,
        )
    }

    fun deleteSession(id: String): VmaTrainingSession {
        val session = sessionRepo.findById(id)
            .orElseThrow { NotFoundException("Training session $id not found") }
        recordRepo.deleteAllBySessionId(id)
        sessionRepo.delete(session)
        return session
    }

    fun removeRecordFromSession(sessionId: String, recordId: String): Map<String, Any> {
        val record = findOneRecord(recordId)
        recordRepo.delete(record)
        // Update attend/pass counts
        val remaining = recordRepo.findDistinctEmployeeNosBySessionId(sessionId)
        sessionRepo.findById(sessionId).ifPresent { session ->
            session.attendCount = remaining.size
            session.passCount = remaining.size
            session.updatedAt = Instant.now()
            sessionRepo.save(session)
        }
        return mapOf("remaining" to remaining.size)
    }

    // ═══════════ Employee Training Status ═══════════

    /**
     * 员工培训状态总览 (时间维度版本)
     * Logic: progressive versioning — baseline + trainingRequired updates
     */
    fun getEmployeeTrainingStatus(): List<EmployeeTrainingStatusResponse> {
        val employees = employeeRepo.findAll().filter { it.status == VmaEmployeeStatus.ACTIVE }
        val allRecords = recordRepo.findAll()
        val recordMap = buildRecordMap(allRecords)
        val allSops = sopRepo.findAllByStatusOrderBySeqNoAsc(VmaSopStatus.ACTIVE)
        val sopMap = allSops.associateBy { it.sopNo }

        // Load versions per SOP
        val versionMap = mutableMapOf<String, List<VmaTrainingSopVersion>>()
        for (sop in allSops) {
            versionMap[sop.sopNo] = versionRepo.findAllBySopIdOrderByEffectiveDateAsc(sop.id)
        }

        // Load department assignments + SOP requirements
        val allAssignments = assignmentRepo.findAll()
        val allReqs = sopReqRepo.findAll()
        val reqsByDeptId = allReqs.groupBy { it.dutyId }

        return employees.sortedBy { it.employeeNo }.map { emp ->
            val activeAssignments = allAssignments.filter { it.employeeId == emp.id }
            val requiredSopNos = mutableSetOf<String>()
            for (assignment in activeAssignments) {
                reqsByDeptId[assignment.departmentId]?.forEach { requiredSopNos.add(it.sopNo) }
            }

            val empRecords = recordMap[emp.employeeNo] ?: emptySet()
            val missing = mutableListOf<MissingSopItem>()
            val completed = mutableListOf<String>()

            for (sopNo in requiredSopNos) {
                val sop = sopMap[sopNo] ?: continue
                val sortedVersions = versionMap[sopNo] ?: continue
                if (sortedVersions.isEmpty()) continue

                val effectiveHireDate = if (emp.hireDate <= GO_LIVE_DATE) GO_LIVE_DATE else emp.hireDate
                val baselineIdx = findBaselineIndex(sortedVersions, effectiveHireDate)
                val applicableVersions = sortedVersions.subList(baselineIdx, sortedVersions.size)

                val missingVersions = mutableListOf<VmaTrainingSopVersion>()
                for ((vi, ver) in applicableVersions.withIndex()) {
                    val isBaseline = vi == 0
                    val mustTrain = isBaseline || ver.trainingRequired
                    if (mustTrain && !empRecords.contains("${sopNo}|${ver.version}")) {
                        missingVersions.add(ver)
                    }
                }

                if (missingVersions.isNotEmpty()) {
                    for (mv in missingVersions) {
                        missing.add(MissingSopItem(
                            sopNo = sopNo,
                            name = sop.name,
                            version = mv.version,
                            daNo = mv.daNo,
                            effectiveDate = mv.effectiveDate,
                        ))
                    }
                } else {
                    completed.add(sopNo)
                }
            }

            EmployeeTrainingStatusResponse(
                employeeNo = emp.employeeNo,
                lastName = emp.lastName,
                firstName = emp.firstName,
                hireDate = emp.hireDate,
                totalRequired = requiredSopNos.size,
                completedCount = completed.size,
                missingCount = missing.size,
                missingSops = missing,
                status = if (missing.isEmpty()) "COMPLETE" else "MISSING",
            )
        }
    }

    // ═══════════ Training Matrix ═══════════

    /**
     * Employee × SOP cross-matrix for audit
     */
    fun getTrainingMatrix(): TrainingMatrixResponse {
        val employees = employeeRepo.findAll().filter { it.status == VmaEmployeeStatus.ACTIVE }.sortedBy { it.employeeNo }
        val allSops = sopRepo.findAllByStatusOrderBySeqNoAsc(VmaSopStatus.ACTIVE)
        val allRecords = recordRepo.findAll()
        val recordSet = allRecords.map { "${it.employeeNo}|${it.sopNo}|${it.sopVersion}" }.toSet()

        // Load latest version per SOP
        val latestVersionMap = mutableMapOf<String, VmaTrainingSopVersion?>()
        for (sop in allSops) {
            latestVersionMap[sop.sopNo] = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id).firstOrNull()
        }

        val sopColumns = allSops.map { SopColumnDef(
            sopNo = it.sopNo,
            name = it.name,
            seqNo = it.seqNo,
            latestVersion = latestVersionMap[it.sopNo]?.version ?: "-",
        ) }

        // Load assignments + reqs
        val allAssignments = assignmentRepo.findAll().filter { it.removedAt == null }
        val allReqs = sopReqRepo.findAll()
        val reqsByDeptId = allReqs.groupBy { it.dutyId }

        val rows = employees.map { emp ->
            val empAssignments = allAssignments.filter { it.employeeId == emp.id }
            val deptNames = mutableListOf<String>()
            val requiredSopNos = mutableSetOf<String>()
            for (assignment in empAssignments) {
                departmentRepo.findById(assignment.departmentId).ifPresent { dept ->
                    deptNames.add("${dept.name} - ${dept.duties}")
                    reqsByDeptId[assignment.departmentId]?.forEach { requiredSopNos.add(it.sopNo) }
                }
            }

            val cells = mutableMapOf<String, String>()
            var completedCount = 0
            var missingCount = 0

            for (col in sopColumns) {
                if (col.sopNo !in requiredSopNos) {
                    cells[col.sopNo] = "na"
                    continue
                }
                if (recordSet.contains("${emp.employeeNo}|${col.sopNo}|${col.latestVersion}")) {
                    cells[col.sopNo] = "completed"
                    completedCount++
                } else {
                    cells[col.sopNo] = "missing"
                    missingCount++
                }
            }

            MatrixRow(
                employeeNo = emp.employeeNo,
                lastName = emp.lastName,
                firstName = emp.firstName,
                hireDate = emp.hireDate,
                departments = deptNames,
                cells = cells,
                totalRequired = requiredSopNos.size,
                completedCount = completedCount,
                missingCount = missingCount,
                completionRate = if (requiredSopNos.isNotEmpty())
                    (completedCount * 100 / requiredSopNos.size) else 100,
            )
        }

        return TrainingMatrixResponse(
            generatedAt = Instant.now().toString(),
            sopColumns = sopColumns,
            rows = rows,
            summary = MatrixSummary(
                totalEmployees = rows.size,
                totalSops = sopColumns.size,
                fullyCompliant = rows.count { it.missingCount == 0 },
                overallCompletionRate = if (rows.isNotEmpty())
                    rows.sumOf { it.completionRate } / rows.size else 100,
            ),
        )
    }

    // ═══════════ Training Roadmap ═══════════

    /**
     * 培训合规路线图 — temporal milestones
     * Logic ported from V2 getTrainingRoadmap() with FIX LOG (2026-02-07)
     */
    fun getTrainingRoadmap(): Map<String, Any> {
        val BASELINE_DATE = LocalDate.of(2025, 6, 15)
            .atStartOfDay(ZoneId.of("UTC")).toInstant()
        val baselineDateStr = "2025-06-15"

        // 1. All active SOP versions
        val activeSops = sopRepo.findAllByStatusOrderBySeqNoAsc(VmaSopStatus.ACTIVE)
        val activeSopIds = activeSops.map { it.id }
        if (activeSopIds.isEmpty()) return mapOf("milestones" to emptyList<Any>())

        val allVersions = versionRepo.findAllBySopIdInOrderByEffectiveDateAsc(activeSopIds)
        val sopByIdMap = activeSops.associateBy { it.id }

        if (allVersions.isEmpty()) return mapOf("milestones" to emptyList<Any>())

        // 2. Group by effectiveDate, < BASELINE → BASELINE
        val dateGroups = mutableMapOf<String, MutableList<Pair<VmaTrainingSopVersion, VmaTrainingSop>>>()
        for (v in allVersions) {
            val sop = sopByIdMap[v.sopId] ?: continue
            val effectiveDate = if (v.effectiveDate < BASELINE_DATE) BASELINE_DATE else v.effectiveDate
            val key = effectiveDate.toString().take(10)
            dateGroups.getOrPut(key) { mutableListOf() }.add(v to sop)
        }

        // Filter: only keep dates with training-required versions (or baseline always)
        val sortedDates = dateGroups.keys.sorted().filter { dateStr ->
            if (dateStr == baselineDateStr) true
            else dateGroups[dateStr]?.any { (v, _) -> v.trainingRequired } == true
        }

        // 3. All employees (all statuses, for FIX #2)
        val employees = employeeRepo.findAll().sortedBy { it.employeeNo }
        val allAssignments = assignmentRepo.findAll()
        val assignmentsByEmpId = allAssignments.groupBy { it.employeeId }

        // 4. SOP history for time-replay
        val allSopHistory = sopHistoryRepo.findAll().sortedBy { it.changeDate }

        // Fallback: static dept→SOP mapping when no history
        var staticDeptSopMap: Map<String, Set<String>>? = null
        if (allSopHistory.isEmpty()) {
            val allDeptReqs = sopReqRepo.findAll()
            staticDeptSopMap = allDeptReqs.groupBy { it.dutyId }
                .mapValues { (_, reqs) -> reqs.map { it.sopNo }.toSet() }
        }

        // 5. All training records → Set for existence check
        val allRecords = recordRepo.findAll()
        val recordSet = allRecords.map { "${it.employeeNo}|${it.sopNo}|${it.sopVersion}" }.toSet()

        // 6. Build milestones
        val effectiveSops = mutableMapOf<String, MutableList<VersionInfo>>()
        val milestones = mutableListOf<Map<String, Any>>()

        for (dateStr in sortedDates) {
            val versions = dateGroups[dateStr]!!
            val milestoneDateStr = "${dateStr}T23:59:59.000Z"
            val milestoneDate = Instant.parse(milestoneDateStr)
            val isBaseline = dateStr == baselineDateStr

            // Update effective SOP versions
            for ((v, sop) in versions) {
                effectiveSops.getOrPut(sop.sopNo) { mutableListOf() }.add(VersionInfo(
                    version = v.version,
                    effectiveDate = if (v.effectiveDate < BASELINE_DATE) BASELINE_DATE else v.effectiveDate,
                    sopName = sop.name,
                    trainingRequired = v.trainingRequired,
                ))
            }

            // Rebuild dept SOP requirements at milestoneDate
            val deptSopAtDate: Map<String, Set<String>>
            if (allSopHistory.isNotEmpty()) {
                val builder = mutableMapOf<String, MutableSet<String>>()
                for (h in allSopHistory) {
                    if (h.changeType != "INITIAL" && h.changeDate > milestoneDate) continue
                    val deptSet = builder.getOrPut(h.departmentId) { mutableSetOf() }
                    if (h.changeType == "ADD" || h.changeType == "INITIAL") deptSet.add(h.sopNo)
                    else if (h.changeType == "REMOVE") deptSet.remove(h.sopNo)
                }
                deptSopAtDate = builder
            } else {
                deptSopAtDate = staticDeptSopMap!!
            }

            // Compute compliance per employee
            var totalRequired = 0
            var totalCompleted = 0
            var compliantEmps = 0
            var nonCompliantEmps = 0
            val snapshots = mutableListOf<Map<String, Any>>()

            for (emp in employees) {
                if (emp.hireDate > milestoneDate) continue
                if (emp.terminationDate != null && emp.terminationDate!! <= milestoneDate) continue

                val empAssignments = assignmentsByEmpId[emp.id] ?: emptyList()
                val activeDeptIds = empAssignments
                    .filter { it.assignedAt <= milestoneDate && (it.removedAt == null || it.removedAt!! > milestoneDate) }
                    .map { it.departmentId }
                    .toSet()

                if (activeDeptIds.isEmpty()) continue

                val requiredSopNos = mutableSetOf<String>()
                for (deptId in activeDeptIds) {
                    deptSopAtDate[deptId]?.let { requiredSopNos.addAll(it) }
                }

                if (requiredSopNos.isEmpty()) {
                    compliantEmps++
                    snapshots.add(mapOf(
                        "employeeNo" to emp.employeeNo,
                        "name" to "${emp.lastName}, ${emp.firstName}",
                        "required" to 0, "completed" to 0, "missing" to 0,
                        "compliant" to true, "missingSops" to emptyList<String>(),
                    ))
                    continue
                }

                var empRequired = 0
                var empCompleted = 0
                val missingSops = mutableListOf<String>()
                val effectiveHireDate = if (emp.hireDate <= BASELINE_DATE) BASELINE_DATE else emp.hireDate

                for (sopNo in requiredSopNos) {
                    val allVers = effectiveSops[sopNo] ?: continue
                    val applicableAll = allVers
                        .filter { it.effectiveDate <= milestoneDate }
                        .sortedBy { it.effectiveDate }
                    if (applicableAll.isEmpty()) continue

                    val baselineIdx = findBaselineIndexInfo(applicableAll, effectiveHireDate)
                    val applicable = applicableAll.subList(baselineIdx, applicableAll.size)

                    for ((vi, ver) in applicable.withIndex()) {
                        val isVerBaseline = vi == 0
                        val mustTrain = isVerBaseline || ver.trainingRequired
                        if (mustTrain) {
                            empRequired++
                            if (recordSet.contains("${emp.employeeNo}|${sopNo}|${ver.version}")) {
                                empCompleted++
                            } else {
                                missingSops.add(sopNo)
                            }
                        }
                    }
                }

                val empMissing = empRequired - empCompleted
                totalRequired += empRequired
                totalCompleted += empCompleted

                if (empMissing == 0) compliantEmps++ else nonCompliantEmps++

                snapshots.add(mapOf(
                    "employeeNo" to emp.employeeNo,
                    "name" to "${emp.lastName}, ${emp.firstName}",
                    "required" to empRequired, "completed" to empCompleted, "missing" to empMissing,
                    "compliant" to (empMissing == 0), "missingSops" to missingSops,
                ))
            }

            val sopChanges = versions.map { (v, sop) ->
                mapOf(
                    "sopNo" to sop.sopNo, "sopName" to sop.name,
                    "version" to v.version, "daNo" to v.daNo,
                    "effectiveDate" to v.effectiveDate.toString(),
                )
            }

            milestones.add(mapOf(
                "date" to dateStr,
                "changeType" to if (isBaseline) "INITIAL" else "UPDATE",
                "sopChanges" to sopChanges,
                "summary" to mapOf(
                    "totalEmployees" to snapshots.size,
                    "compliant" to compliantEmps,
                    "nonCompliant" to nonCompliantEmps,
                    "totalRequired" to totalRequired,
                    "totalCompleted" to totalCompleted,
                    "completionRate" to if (totalRequired > 0) (totalCompleted * 100 / totalRequired) else 100,
                ),
                "topNonCompliant" to snapshots
                    .filter { (it["compliant"] as? Boolean) != true }
                    .sortedByDescending { (it["missing"] as? Int) ?: 0 }
                    .take(10),
            ))
        }

        return mapOf("milestones" to milestones)
    }

    // ═══════════ Helper Functions ═══════════

    private fun buildRecordMap(records: List<VmaTrainingRecord>): Map<String, Set<String>> {
        val map = mutableMapOf<String, MutableSet<String>>()
        for (r in records) {
            map.getOrPut(r.employeeNo) { mutableSetOf() }.add("${r.sopNo}|${r.sopVersion}")
        }
        return map
    }

    private fun findBaselineIndex(versions: List<VmaTrainingSopVersion>, effectiveHireDate: Instant): Int {
        var baselineIdx = -1
        for (i in versions.indices.reversed()) {
            if (versions[i].effectiveDate <= effectiveHireDate) {
                baselineIdx = i
                break
            }
        }
        return if (baselineIdx == -1) 0 else baselineIdx
    }

    private fun findBaselineIndexInfo(versions: List<VersionInfo>, effectiveHireDate: Instant): Int {
        var baselineIdx = -1
        for (i in versions.indices.reversed()) {
            if (versions[i].effectiveDate <= effectiveHireDate) {
                baselineIdx = i
                break
            }
        }
        return if (baselineIdx == -1) 0 else baselineIdx
    }

    private data class VersionInfo(
        val version: String,
        val effectiveDate: Instant,
        val sopName: String,
        val trainingRequired: Boolean,
    )
}
