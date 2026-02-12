package com.mgmt.modules.vma

import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * VmaSmartFillService — 智能补训自动生成
 *
 * V2 parity: smart-fill.service.ts (801 lines)
 *
 * Features:
 *   - Go-Live baseline (2025-06-15) logic
 *   - Compute missing training for all employees
 *   - Lecturer self-training sessions
 *   - Greedy grouping for max SOP overlap (34 employees/form)
 *   - Auto training-number assignment (YYYYMMDD + initials + ##)
 *   - Time slot scheduling (9:30 AM – 5:30 PM, cascade)
 *   - DB write + PDF generation
 */
@Service
@Transactional
class VmaSmartFillService(
    private val employeeRepo: VmaEmployeeRepository,
    private val departmentRepo: VmaDepartmentRepository,
    private val assignmentRepo: VmaEmployeeDepartmentRepository,
    private val sopReqRepo: VmaDutySopRequirementRepository,
    private val sopRepo: VmaTrainingSopRepository,
    private val versionRepo: VmaTrainingSopVersionRepository,
    private val recordRepo: VmaTrainingRecordRepository,
    private val sessionRepo: VmaTrainingSessionRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // Go-Live 日期: 2025-06-15T00:00:00 UTC
    private val GO_LIVE_DATE: Instant = LocalDate.of(2025, 6, 15)
        .atStartOfDay(ZoneId.of("UTC")).toInstant()

    // ═══════════ Main Entry ═══════════

    fun smartFill(cutoffDate: String, lecturerNo: String): SmartFillResponse {
        val cutoff = Instant.parse("${cutoffDate}T23:59:59Z")
        log.info("[SmartFill] START cutoff=$cutoffDate lecturer=$lecturerNo")

        // 1. Get lecturer info
        val lecturer = employeeRepo.findByEmployeeNo(lecturerNo)
            ?: throw NotFoundException("Lecturer $lecturerNo not found")
        val lecturerName = "${lecturer.firstName} ${lecturer.lastName}"
        log.info("[SmartFill] Step1: Lecturer = $lecturerName")

        // 2. Compute all missing
        val allMissing = computeAllMissing(cutoff)
        log.info("[SmartFill] Step2: ${allMissing.size} employees with missing training")
        if (allMissing.isEmpty()) {
            return SmartFillResponse(
                message = "All employees are up to date. No training needed.",
                sessions = emptyList(),
            )
        }

        // 3. Separate lecturer from others
        val lecturerMissing = allMissing.filter { it.employeeNo == lecturerNo }
        val otherMissing = allMissing.filter { it.employeeNo != lecturerNo }
        log.info("[SmartFill] Step3: lecturer=${lecturerMissing.size}, others=${otherMissing.size}")

        // 4. Generate session plans
        val plans = mutableListOf<TrainingSessionPlan>()

        // 4a. Lecturer: self-training
        if (lecturerMissing.isNotEmpty()) {
            val lecturerPlans = planLecturerSessions(lecturerMissing[0], lecturerNo, lecturerName, cutoff)
            log.info("[SmartFill] Step4a: ${lecturerPlans.size} lecturer plans")
            plans.addAll(lecturerPlans)
        }

        // 4b. Other employees: group sessions
        if (otherMissing.isNotEmpty()) {
            val otherPlans = planGroupSessions(otherMissing, lecturerNo, lecturerName, cutoff)
            log.info("[SmartFill] Step4b: ${otherPlans.size} group plans")
            plans.addAll(otherPlans)
        }

        // 5. Assign training numbers
        log.info("[SmartFill] Step5: Assigning training numbers for ${plans.size} plans...")
        assignTrainingNumbers(plans, lecturerName)

        // 6. Assign time slots
        log.info("[SmartFill] Step6: Assigning time slots...")
        assignTimeSlots(plans)

        // 7. Write to database
        val sessionIds = writeToDB(plans)

        val totalRecords = plans.sumOf { it.employees.size * it.sops.size }
        log.info("Smart fill complete: ${plans.size} sessions, ${sessionIds.size} created, $totalRecords records")

        return SmartFillResponse(
            message = "Generated ${plans.size} training sessions with $totalRecords records.",
            sessions = plans.map { p ->
                SmartFillSessionSummary(
                    trainingNo = p.trainingNo,
                    date = p.trainingDate,
                    subject = p.trainingSubject,
                    employees = p.employees.size,
                    sops = p.sops.size,
                    time = "${p.timeStart} - ${p.timeEnd} PST",
                )
            },
        )
    }

    // ═══════════ Compute All Missing ═══════════

    private fun computeAllMissing(cutoff: Instant): List<EmployeeMissing> {
        val employees = employeeRepo.findAll().filter { it.status == VmaEmployeeStatus.ACTIVE }
        val allRecords = recordRepo.findAll()

        // Build record map: employeeNo → Set<"sopNo|version">
        val recordMap = mutableMapOf<String, MutableSet<String>>()
        for (r in allRecords) {
            recordMap.getOrPut(r.employeeNo) { mutableSetOf() }.add("${r.sopNo}|${r.sopVersion}")
        }
        val hasAnyRecord = employees.associate { it.employeeNo to ((recordMap[it.employeeNo]?.size ?: 0) > 0) }

        val allSops = sopRepo.findAllByStatusOrderBySeqNoAsc(VmaSopStatus.ACTIVE)
        val sopVersions = mutableMapOf<String, List<VmaTrainingSopVersion>>()
        for (sop in allSops) {
            sopVersions[sop.sopNo] = versionRepo.findAllBySopIdOrderByEffectiveDateAsc(sop.id)
        }
        val sopMap = allSops.associateBy { it.sopNo }

        // Load assignments
        val allAssignments = assignmentRepo.findAll()
        val allReqs = sopReqRepo.findAll()
        val reqsByDeptId = allReqs.groupBy { it.dutyId }

        val result = mutableListOf<EmployeeMissing>()

        for (emp in employees) {
            val requiredSopNos = mutableSetOf<String>()
            val deptCodes = mutableListOf<String>()
            val empAssignments = allAssignments.filter { it.employeeId == emp.id && it.removedAt == null }

            for (assignment in empAssignments) {
                departmentRepo.findById(assignment.departmentId).ifPresent { dept ->
                    deptCodes.add(dept.code)
                    reqsByDeptId[assignment.departmentId]?.forEach { requiredSopNos.add(it.sopNo) }
                }
            }

            val isGoLiveEmployee = emp.hireDate <= GO_LIVE_DATE
            val effectiveHireDate = if (isGoLiveEmployee) GO_LIVE_DATE else emp.hireDate

            val empRecords = recordMap[emp.employeeNo] ?: emptySet()
            val missing = mutableListOf<MissingSopVersion>()

            for (sopNo in requiredSopNos) {
                val sop = sopMap[sopNo] ?: continue
                val sortedVersions = sopVersions[sopNo] ?: continue
                if (sortedVersions.isEmpty()) continue

                var baselineIdx = -1
                for (i in sortedVersions.indices.reversed()) {
                    if (sortedVersions[i].effectiveDate <= effectiveHireDate) {
                        baselineIdx = i
                        break
                    }
                }
                if (baselineIdx == -1) baselineIdx = 0

                val applicableVersions = sortedVersions
                    .subList(baselineIdx, sortedVersions.size)
                    .filter { it.effectiveDate <= cutoff }

                for ((vi, ver) in applicableVersions.withIndex()) {
                    val isBaseline = vi == 0
                    val mustTrain = isBaseline || ver.trainingRequired
                    if (mustTrain && !empRecords.contains("${sopNo}|${ver.version}")) {
                        missing.add(MissingSopVersion(
                            sopNo = sopNo,
                            sopName = sop.name,
                            version = ver.version,
                            daNo = ver.daNo,
                            effectiveDate = if (isGoLiveEmployee && isBaseline) GO_LIVE_DATE else ver.effectiveDate,
                            versionCount = sortedVersions.size,
                            isBaseline = isBaseline,
                        ))
                    }
                }
            }

            if (missing.isNotEmpty()) {
                result.add(EmployeeMissing(
                    employeeNo = emp.employeeNo,
                    firstName = emp.firstName,
                    lastName = emp.lastName,
                    hireDate = emp.hireDate,
                    departmentCodes = deptCodes,
                    isNewEmployee = emp.hireDate > GO_LIVE_DATE && hasAnyRecord[emp.employeeNo] != true,
                    missingSops = missing,
                ))
            }
        }

        return result
    }

    // ═══════════ Plan Lecturer Sessions ═══════════

    private fun planLecturerSessions(
        lecturerEmp: EmployeeMissing,
        lecturerNo: String,
        lecturerName: String,
        cutoff: Instant,
    ): List<TrainingSessionPlan> {
        // Group by effectiveDate
        val byDate = mutableMapOf<String, MutableList<MissingSopVersion>>()
        for (sop in lecturerEmp.missingSops) {
            val key = sop.effectiveDate.toString().take(10)
            byDate.getOrPut(key) { mutableListOf() }.add(sop)
        }

        return byDate.entries.mapNotNull { (dateStr, sops) ->
            val trainingDate = Instant.parse("${dateStr}T00:00:00Z")
            if (trainingDate > cutoff) return@mapNotNull null

            TrainingSessionPlan(
                trainingDate = trainingDate,
                trainingSubject = determineSubject(sops, lecturerEmp.isNewEmployee),
                evaluationMethod = "self_training",
                lecturerNo = lecturerNo,
                lecturerName = lecturerName,
                employees = mutableListOf(PlanEmployee(lecturerEmp.employeeNo, lecturerEmp.departmentCodes.firstOrNull() ?: "")),
                sops = sops.map { PlanSop(it.sopNo, it.sopName, it.version) }.toMutableList(),
            )
        }
    }

    // ═══════════ Plan Group Sessions ═══════════

    private fun planGroupSessions(
        employees: List<EmployeeMissing>,
        lecturerNo: String,
        lecturerName: String,
        cutoff: Instant,
    ): List<TrainingSessionPlan> {
        val plans = mutableListOf<TrainingSessionPlan>()

        val newEmps = employees.filter { it.isNewEmployee }
        val oldEmps = employees.filter { !it.isNewEmployee }
        val newEmpUpdateSops = mutableListOf<EmployeeMissing>()

        // 1. New Employee Training
        if (newEmps.isNotEmpty()) {
            val byHireDate = newEmps.groupBy { it.hireDate.toString().take(10) }
            for ((_, group) in byHireDate) {
                val baselineSopsMap = mutableMapOf<String, MissingSopVersion>()
                for (emp in group) {
                    val empUpdateSops = mutableListOf<MissingSopVersion>()
                    for (sop in emp.missingSops) {
                        if (sop.isBaseline) {
                            baselineSopsMap.putIfAbsent("${sop.sopNo}|${sop.version}", sop)
                        } else {
                            empUpdateSops.add(sop)
                        }
                    }
                    if (empUpdateSops.isNotEmpty()) {
                        newEmpUpdateSops.add(emp.copy(isNewEmployee = false, missingSops = empUpdateSops))
                    }
                }

                val baselineSops = baselineSopsMap.values.toList()
                if (baselineSops.isEmpty()) continue

                val latestHire = group.maxOf { it.hireDate }
                val trainingDate = nextBusinessDay(latestHire)
                if (trainingDate > cutoff) continue

                plans.add(TrainingSessionPlan(
                    trainingDate = trainingDate,
                    trainingSubject = "New Employee Training",
                    evaluationMethod = "oral_qa",
                    lecturerNo = lecturerNo,
                    lecturerName = lecturerName,
                    employees = group.map { PlanEmployee(it.employeeNo, it.departmentCodes.firstOrNull() ?: "") }.toMutableList(),
                    sops = baselineSops.map { PlanSop(it.sopNo, it.sopName, it.version) }.toMutableList(),
                ))
            }
        }

        // 2. Merge old + new-update employees
        val allOldEmps = oldEmps + newEmpUpdateSops

        if (allOldEmps.isNotEmpty()) {
            val baselineSopEmps = mutableListOf<EmployeeMissing>()
            val updateSopEmps = mutableListOf<EmployeeMissing>()

            for (emp in allOldEmps) {
                val baseline = emp.missingSops.filter { it.isBaseline }
                val update = emp.missingSops.filter { !it.isBaseline }
                if (baseline.isNotEmpty()) baselineSopEmps.add(emp.copy(missingSops = baseline))
                if (update.isNotEmpty()) updateSopEmps.add(emp.copy(missingSops = update))
            }

            if (baselineSopEmps.isNotEmpty()) {
                plans.addAll(groupByCommonSops(baselineSopEmps, "New SOP Training", lecturerNo, lecturerName, cutoff))
            }
            if (updateSopEmps.isNotEmpty()) {
                plans.addAll(groupByCommonSops(updateSopEmps, "Updated SOP Training", lecturerNo, lecturerName, cutoff))
            }
        }

        return plans
    }

    // ═══════════ Greedy Grouping ═══════════

    private fun groupByCommonSops(
        employees: List<EmployeeMissing>,
        subject: String,
        lecturerNo: String,
        lecturerName: String,
        cutoff: Instant,
    ): List<TrainingSessionPlan> {
        val plans = mutableListOf<TrainingSessionPlan>()
        val remaining = employees.toMutableList()

        while (remaining.isNotEmpty()) {
            if (plans.size > 500) {
                log.error("groupByCommonSops: exceeded 500 plans, breaking. Remaining: ${remaining.size}")
                break
            }

            // Build SOP→employee index
            val sopToEmps = mutableMapOf<String, MutableSet<Int>>()
            for (i in remaining.indices) {
                for (sop in remaining[i].missingSops) {
                    sopToEmps.getOrPut("${sop.sopNo}|${sop.version}") { mutableSetOf() }.add(i)
                }
            }

            var bestSopKeys = listOf<String>()
            var bestEmpIndices = setOf<Int>()

            val sortedSops = sopToEmps.entries.sortedByDescending { it.value.size }

            for ((sopKey, empSet) in sortedSops) {
                if (empSet.size <= bestEmpIndices.size && bestSopKeys.isNotEmpty()) continue

                val candidateEmps = empSet.toMutableSet()
                val candidateSops = mutableListOf(sopKey)

                for ((otherKey, otherSet) in sopToEmps) {
                    if (otherKey == sopKey) continue
                    if (candidateEmps.all { it in otherSet }) {
                        candidateSops.add(otherKey)
                    }
                }

                val score = candidateEmps.size * candidateSops.size
                val bestScore = bestEmpIndices.size * bestSopKeys.size
                if (score > bestScore) {
                    bestSopKeys = candidateSops
                    bestEmpIndices = candidateEmps.toSet()
                }
            }

            if (bestSopKeys.isEmpty() || bestEmpIndices.isEmpty()) break

            // Batch (34 per form)
            val empIndicesArr = bestEmpIndices.toList()
            for (batch in empIndicesArr.chunked(34)) {
                val batchEmps = batch.map { remaining[it] }

                val sopVersions = bestSopKeys.map { key ->
                    val (sopNo, version) = key.split("|")
                    batchEmps[0].missingSops.first { it.sopNo == sopNo && it.version == version }
                }

                val trainingDate = if (subject == "New Employee Training") {
                    nextBusinessDay(batchEmps.maxOf { it.hireDate })
                } else {
                    nextBusinessDay(sopVersions.maxOf { it.effectiveDate })
                }

                if (trainingDate > cutoff) {
                    log.warn("Training date $trainingDate exceeds cutoff $cutoff, skipping batch")
                    continue
                }

                plans.add(TrainingSessionPlan(
                    trainingDate = trainingDate,
                    trainingSubject = subject,
                    evaluationMethod = "oral_qa",
                    lecturerNo = lecturerNo,
                    lecturerName = lecturerName,
                    employees = batchEmps.map { PlanEmployee(it.employeeNo, it.departmentCodes.firstOrNull() ?: "") }.toMutableList(),
                    sops = sopVersions.map { PlanSop(it.sopNo, it.sopName, it.version) }.toMutableList(),
                ))
            }

            // Remove covered SOPs
            val coveredSopKeys = bestSopKeys.toSet()
            for (idx in bestEmpIndices.sortedDescending()) {
                val emp = remaining[idx]
                val remainingSops = emp.missingSops.filter { "${it.sopNo}|${it.version}" !in coveredSopKeys }
                if (remainingSops.isEmpty()) {
                    remaining.removeAt(idx)
                } else {
                    remaining[idx] = emp.copy(missingSops = remainingSops)
                }
            }
        }

        return plans
    }

    // ═══════════ Training Number Assignment ═══════════

    private fun assignTrainingNumbers(plans: MutableList<TrainingSessionPlan>, lecturerName: String) {
        val existing = sessionRepo.findAll().map { it.trainingNo }.toMutableSet()
        val initials = lecturerName.split("\\s+".toRegex())
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .joinToString("")

        val byDate = plans.groupBy { it.trainingDate.toString().take(10).replace("-", "") }
        for ((dateStr, datePlans) in byDate) {
            var seq = 1
            for (plan in datePlans) {
                var no: String
                do {
                    no = "$dateStr$initials${seq.toString().padStart(2, '0')}"
                    seq++
                } while (existing.contains(no))
                plan.trainingNo = no
                existing.add(no)
            }
        }
    }

    // ═══════════ Time Slot Assignment ═══════════

    private fun assignTimeSlots(plans: MutableList<TrainingSessionPlan>) {
        plans.sortBy { it.trainingDate }

        val dateCurrentMinutes = mutableMapOf<String, Int>()
        val dayStart = 9 * 60 + 30   // 9:30 AM
        val dayEnd = 17 * 60 + 30    // 5:30 PM
        val dayCapacity = dayEnd - dayStart

        for (plan in plans) {
            val durationMin = maxOf(plan.sops.size * 10, 10)

            var targetDate = plan.trainingDate
            var dateKey = targetDate.toString().take(10)
            var startMinutes = dateCurrentMinutes[dateKey] ?: dayStart

            if (durationMin > dayCapacity) {
                if (startMinutes > dayStart) {
                    targetDate = nextBusinessDay(targetDate)
                    dateKey = targetDate.toString().take(10)
                }
                startMinutes = dayStart
            } else {
                var safety = 0
                while (startMinutes + durationMin > dayEnd && safety < 365) {
                    targetDate = nextBusinessDay(targetDate)
                    dateKey = targetDate.toString().take(10)
                    startMinutes = dateCurrentMinutes[dateKey] ?: dayStart
                    safety++
                }
            }

            plan.trainingDate = targetDate
            plan.timeStart = formatTime(startMinutes)
            plan.timeEnd = formatTime(startMinutes + durationMin)
            dateCurrentMinutes[dateKey] = startMinutes + durationMin
        }
    }

    // ═══════════ Write to DB ═══════════

    private fun writeToDB(plans: List<TrainingSessionPlan>): List<String> {
        val sessionIds = mutableListOf<String>()

        for (plan in plans) {
            val session = sessionRepo.save(VmaTrainingSession(
                id = UUID.randomUUID().toString(),
                trainingNo = plan.trainingNo,
                trainingDate = plan.trainingDate,
                trainingSubject = plan.trainingSubject,
                evaluationMethod = plan.evaluationMethod,
                lecturerNo = plan.lecturerNo,
                lecturerName = plan.lecturerName,
                trainingTimeStart = plan.timeStart,
                trainingTimeEnd = plan.timeEnd,
                attendCount = plan.employees.size,
                passCount = plan.employees.size,
                recordedDate = plan.trainingDate,
            ))
            sessionIds.add(session.id)

            for (emp in plan.employees) {
                for (sop in plan.sops) {
                    val existing = recordRepo.findByEmployeeNoAndSopNoAndSopVersion(
                        emp.employeeNo, sop.sopNo, sop.version,
                    )
                    if (existing != null) {
                        existing.sessionId = session.id
                        existing.trainingDate = plan.trainingDate
                        existing.trainingNo = plan.trainingNo
                        existing.completedAt = plan.trainingDate
                        existing.updatedAt = Instant.now()
                        recordRepo.save(existing)
                    } else {
                        recordRepo.save(VmaTrainingRecord(
                            id = UUID.randomUUID().toString(),
                            sessionId = session.id,
                            employeeNo = emp.employeeNo,
                            sopNo = sop.sopNo,
                            sopVersion = sop.version,
                            trainingDate = plan.trainingDate,
                            trainingNo = plan.trainingNo,
                            trainerId = plan.lecturerNo,
                            trainingLocation = "On-Site",
                            trainingDuration = plan.sops.size * 10,
                            completedAt = plan.trainingDate,
                        ))
                    }
                }
            }
        }

        return sessionIds
    }

    // ═══════════ Helpers ═══════════

    private fun determineSubject(sops: List<MissingSopVersion>, isNewEmployee: Boolean): String {
        if (isNewEmployee) return "New Employee Training"
        if (sops.any { it.versionCount == 1 }) return "New SOP Training"
        return "Updated SOP Training"
    }

    private fun nextBusinessDay(instant: Instant): Instant {
        var date = instant.atZone(ZoneId.of("UTC")).toLocalDate().plusDays(1)
        while (date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY) {
            date = date.plusDays(1)
        }
        return date.atStartOfDay(ZoneId.of("UTC")).toInstant()
    }

    private fun formatTime(minutes: Int): String {
        val h = minutes / 60
        val m = minutes % 60
        val ampm = if (h >= 12) "PM" else "AM"
        val h12 = when {
            h > 12 -> h - 12
            h == 0 -> 12
            else -> h
        }
        return "$h12:${m.toString().padStart(2, '0')} $ampm"
    }

    // ═══════════ Internal Data Classes ═══════════

    private data class MissingSopVersion(
        val sopNo: String,
        val sopName: String,
        val version: String,
        val daNo: String,
        val effectiveDate: Instant,
        val versionCount: Int,
        val isBaseline: Boolean,
    )

    private data class EmployeeMissing(
        val employeeNo: String,
        val firstName: String,
        val lastName: String,
        val hireDate: Instant,
        val departmentCodes: List<String>,
        val isNewEmployee: Boolean,
        val missingSops: List<MissingSopVersion>,
    )

    data class TrainingSessionPlan(
        var trainingNo: String = "",
        var trainingDate: Instant,
        val trainingSubject: String,
        val evaluationMethod: String,
        val lecturerNo: String,
        val lecturerName: String,
        var timeStart: String = "",
        var timeEnd: String = "",
        val employees: MutableList<PlanEmployee>,
        val sops: MutableList<PlanSop>,
    )

    data class PlanEmployee(val employeeNo: String, val departmentCode: String)
    data class PlanSop(val sopNo: String, val sopName: String, val version: String)
}
