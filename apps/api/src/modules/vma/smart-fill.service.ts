import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { PdfGeneratorService } from './pdf-generator.service';

// ================================
// Go-Live 日期: 培训体系正式启动日
// 所有在此日期及之前入职的员工, 基线培训统一定于此日期
// SOP 基线版本 = 截至此日期的最新版本
// ================================
const GO_LIVE_DATE = new Date('2025-06-15T00:00:00');

// Types
interface MissingSopVersion {
  sopNo: string;
  sopName: string;
  version: string;
  daNo: string;
  effectiveDate: Date;
  versionCount: number; // total versions for this SOP in system (1=new, >1=updated)
  isBaseline: boolean;  // true = 基线版本 (首次培训), false = 后续更新
}

interface EmployeeMissing {
  employeeNo: string;
  firstName: string;
  lastName: string;
  hireDate: Date;
  departmentCodes: string[];
  isNewEmployee: boolean; // no training records at all
  missingSops: MissingSopVersion[];
}

interface TrainingSessionPlan {
  trainingNo: string;
  trainingDate: Date;
  trainingSubject: string; // "New Employee Training" | "New SOP Training" | "Updated SOP Training"
  evaluationMethod: string; // "oral_qa" | "self_training"
  lecturerNo: string;
  lecturerName: string;
  timeStart: string;
  timeEnd: string;
  employees: { employeeNo: string; departmentCode: string }[];
  sops: { sopNo: string; sopName: string; version: string }[];
}

@Injectable()
export class SmartFillService {
  private readonly logger = new Logger(SmartFillService.name);

  constructor(
    private prisma: PrismaService,
    private pdfGenerator: PdfGeneratorService,
  ) {}

  /**
   * Main entry: compute and create all missing training records + sessions
   */
  async smartFill(cutoffDate: string, lecturerNo: string) {
    const cutoff = new Date(cutoffDate + 'T23:59:59');
    this.logger.log(`[SmartFill] START cutoff=${cutoffDate} lecturer=${lecturerNo}`);
    
    // 1. Get lecturer info
    const lecturer = await this.prisma.vmaEmployee.findFirst({
      where: { employeeNo: lecturerNo },
    });
    if (!lecturer) throw new Error(`Lecturer ${lecturerNo} not found`);
    const lecturerName = `${lecturer.firstName} ${lecturer.lastName}`;
    this.logger.log(`[SmartFill] Step1: Lecturer = ${lecturerName}`);

    // 2. Compute all employees' missing SOPs
    const allMissing = await this.computeAllMissing(cutoff);
    this.logger.log(`[SmartFill] Step2: ${allMissing.length} employees with missing training`);
    for (const emp of allMissing) {
      this.logger.debug(`  ${emp.employeeNo}: ${emp.missingSops.length} missing (isNew=${emp.isNewEmployee}) [${emp.missingSops.map(s => `${s.sopNo}:${s.version}(baseline=${s.isBaseline})`).join(', ')}]`);
    }
    if (allMissing.length === 0) {
      return { message: 'All employees are up to date. No training needed.', sessions: [] };
    }

    // 3. Separate lecturer from everyone else (lecturer does self-training)
    const lecturerMissing = allMissing.filter(e => e.employeeNo === lecturerNo);
    const otherMissing = allMissing.filter(e => e.employeeNo !== lecturerNo);
    this.logger.log(`[SmartFill] Step3: lecturer=${lecturerMissing.length}, others=${otherMissing.length}`);

    // 4. Generate session plans
    const plans: TrainingSessionPlan[] = [];

    // 4a. Lecturer: one session per SOP effective date, self-training
    if (lecturerMissing.length > 0) {
      const lecturer_emp = lecturerMissing[0];
      this.logger.log(`[SmartFill] Step4a: Planning lecturer sessions...`);
      const lecturerPlans = this.planLecturerSessions(lecturer_emp, lecturerNo, lecturerName, cutoff);
      this.logger.log(`[SmartFill] Step4a: ${lecturerPlans.length} lecturer plans`);
      plans.push(...lecturerPlans);
    }

    // 4b. Other employees: group by common SOPs for max overlap
    if (otherMissing.length > 0) {
      this.logger.log(`[SmartFill] Step4b: Planning group sessions for ${otherMissing.length} employees...`);
      const otherPlans = this.planGroupSessions(
        otherMissing, lecturerNo, lecturerName, cutoff,
      );
      this.logger.log(`[SmartFill] Step4b: ${otherPlans.length} group plans`);
      plans.push(...otherPlans);
    }

    this.logger.log(`[SmartFill] Step5: Assigning training numbers for ${plans.length} plans...`);
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const dateValid = p.trainingDate instanceof Date && !isNaN(p.trainingDate.getTime());
      if (!dateValid) {
        this.logger.error(`[SmartFill] Plan #${i} has invalid trainingDate: ${p.trainingDate}, subject=${p.trainingSubject}, emps=${p.employees.map(e => e.employeeNo).join(',')}`);
      }
    }
    await this.assignTrainingNumbers(plans, lecturerName);
    this.logger.log(`[SmartFill] Step5 done`);

    // 6. Assign time slots
    this.logger.log(`[SmartFill] Step6: Assigning time slots...`);
    this.assignTimeSlots(plans);
    this.logger.log(`[SmartFill] Step6 done`);

    // 7. Write to database
    const sessionIds = await this.writeToDB(plans);

    // 8. Generate PDFs
    const sessionDataList = plans.map(p => ({
      trainingNo: p.trainingNo,
      trainingDate: p.trainingDate,
      trainingSubject: p.trainingSubject,
      trainingObjective: 'Ensure understanding of updated working procedures and responsibilities',
      evaluationMethod: p.evaluationMethod,
      lecturerName: p.lecturerName,
      timeStart: p.timeStart,
      timeEnd: p.timeEnd,
      employees: p.employees,
      sops: p.sops,
    }));

    let downloadUrl: string | undefined;
    try {
      // Save individual PDF per session (for per-session download)
      for (const sd of sessionDataList) {
        const sessionPdf = await this.pdfGenerator.generateSessionPdf(sd);
        const sessionFilename = `training_${sd.trainingNo}.pdf`;
        await this.pdfGenerator.savePdf(sessionPdf, sessionFilename);
        this.logger.log(`PDF saved: ${sessionFilename}`);
      }

      // Also save merged PDF (all sessions combined)
      const mergedPdf = await this.pdfGenerator.generateAllSessionsPdf(sessionDataList);
      const filename = `training_${cutoffDate.replace(/-/g, '')}_${Date.now()}.pdf`;
      const filepath = await this.pdfGenerator.savePdf(mergedPdf, filename);
      downloadUrl = `/vma/training-records/download/${filename}`;
      this.logger.log(`Merged PDF saved: ${filepath}`);
    } catch (err) {
      this.logger.error('PDF generation failed', err);
    }

    this.logger.log(`Smart fill complete: ${plans.length} sessions, ${sessionIds.length} created`);

    return {
      message: `Generated ${plans.length} training sessions with ${plans.reduce((s, p) => s + p.employees.length * p.sops.length, 0)} records.`,
      downloadUrl,
      sessions: plans.map(p => ({
        trainingNo: p.trainingNo,
        date: p.trainingDate,
        subject: p.trainingSubject,
        employees: p.employees.length,
        sops: p.sops.length,
        time: `${p.timeStart} - ${p.timeEnd} PST`,
      })),
    };
  }

  /**
   * Compute all employees with missing training versions up to cutoff
   *
   * Go-Live 规则:
   * - GO_LIVE_DATE (2025-06-15) 为培训体系启动日
   * - 在此日期及之前入职的员工, effectiveHireDate = GO_LIVE_DATE
   * - SOP 基线版本 = 截至 effectiveHireDate 的最新版本 (更早版本忽略)
   * - trainingRequired=false 的版本: 不生成培训, 但视为已完成 (不报 missing)
   */
  private async computeAllMissing(cutoff: Date): Promise<EmployeeMissing[]> {
    const employees = await this.prisma.vmaEmployee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        departmentAssignments: {
          include: {
            department: { include: { sopRequirements: true } },
          },
        },
      },
    });

    const allRecords = await this.prisma.vmaTrainingRecord.findMany();
    const recordMap = new Map<string, Set<string>>();
    for (const r of allRecords) {
      if (!recordMap.has(r.employeeNo)) recordMap.set(r.employeeNo, new Set());
      recordMap.get(r.employeeNo)!.add(`${r.sopNo}|${r.sopVersion}`);
    }
    const hasAnyRecord = new Map<string, boolean>();
    for (const emp of employees) {
      hasAnyRecord.set(emp.employeeNo, (recordMap.get(emp.employeeNo)?.size || 0) > 0);
    }

    const allSops = await this.prisma.vmaTrainingSop.findMany({
      where: { status: 'ACTIVE' },
      include: { versions: { orderBy: { effectiveDate: 'asc' } } },
    });
    const sopMap = new Map(allSops.map(s => [s.sopNo, s]));

    const result: EmployeeMissing[] = [];

    for (const emp of employees) {
      const requiredSopNos = new Set<string>();
      const deptCodes: string[] = [];
      for (const assignment of emp.departmentAssignments) {
        if (!assignment.removedAt) { // 只考虑当前在职的分配
          deptCodes.push(assignment.department.code);
          for (const req of assignment.department.sopRequirements) {
            requiredSopNos.add(req.sopNo);
          }
        }
      }

      // Go-Live 规则: 入职日 <= GO_LIVE → 使用 GO_LIVE 作为有效入职日
      const isGoLiveEmployee = emp.hireDate <= GO_LIVE_DATE;
      const effectiveHireDate = isGoLiveEmployee ? GO_LIVE_DATE : emp.hireDate;

      const empRecords = recordMap.get(emp.employeeNo) || new Set();
      const missing: MissingSopVersion[] = [];

      for (const sopNo of requiredSopNos) {
        const sop = sopMap.get(sopNo);
        if (!sop || sop.versions.length === 0) continue;

        const sortedVersions = [...sop.versions].sort(
          (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
        );

        // 找基线版本: 截至 effectiveHireDate 的最新版本
        // 对于 go-live 员工, 这意味着截至 2025-06-15 的最新版本
        let baselineIdx = -1;
        for (let i = sortedVersions.length - 1; i >= 0; i--) {
          if (sortedVersions[i].effectiveDate <= effectiveHireDate) {
            baselineIdx = i;
            break;
          }
        }
        if (baselineIdx === -1) baselineIdx = 0;

        const applicableVersions = sortedVersions
          .slice(baselineIdx)
          .filter(v => v.effectiveDate <= cutoff); // Only up to cutoff

        // 核心培训判定逻辑 (循序渐进):
        // 基线版本 (vi===0) → 始终需要培训 (入职时必须了解当前 SOP)
        // 基线之后的版本 → trainingRequired=true 时需要培训 (按时间顺序逐个)
        // trainingRequired=false → 跳过 (小修改无需培训)
        // 基线之前的版本 → 完全无视 (已被基线 supersede)
        for (let vi = 0; vi < applicableVersions.length; vi++) {
          const ver = applicableVersions[vi];
          const isBaseline = vi === 0;
          const mustTrain = isBaseline || ver.trainingRequired;

          if (mustTrain) {
            if (!empRecords.has(`${sopNo}|${ver.version}`)) {
              missing.push({
                sopNo,
                sopName: sop.name,
                version: ver.version,
                daNo: ver.daNo,
                // Go-Live 员工的基线 SOP: 培训日期设为 GO_LIVE_DATE
                effectiveDate: (isGoLiveEmployee && isBaseline) ? GO_LIVE_DATE : ver.effectiveDate,
                versionCount: sop.versions.length,
                isBaseline,
              });
            }
          }
        }
      }

      if (missing.length > 0) {
        result.push({
          employeeNo: emp.employeeNo,
          firstName: emp.firstName,
          lastName: emp.lastName,
          hireDate: emp.hireDate,
          departmentCodes: deptCodes,
          // 新员工判定: 仅 Go-Live 之后入职 且 没有任何 training record
          // Go-Live 及之前入职的员工: 基线培训是补训, 永远不算新员工
          isNewEmployee: emp.hireDate > GO_LIVE_DATE && !hasAnyRecord.get(emp.employeeNo),
          missingSops: missing,
        });
      }
    }

    return result;
  }

  /**
   * Lecturer: one session per SOP effective date, self-training
   */
  private planLecturerSessions(
    lecturerEmp: EmployeeMissing,
    lecturerNo: string,
    lecturerName: string,
    cutoff: Date,
  ): TrainingSessionPlan[] {
    // Group missing SOPs by effectiveDate
    const byDate = new Map<string, MissingSopVersion[]>();
    for (const sop of lecturerEmp.missingSops) {
      const key = sop.effectiveDate.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(sop);
    }

    const plans: TrainingSessionPlan[] = [];
    for (const [dateStr, sops] of byDate) {
      const trainingDate = new Date(dateStr + 'T00:00:00');
      if (trainingDate > cutoff) continue;

      const subject = this.determineSubject(sops, lecturerEmp.isNewEmployee);

      plans.push({
        trainingNo: '', // assigned later
        trainingDate,
        trainingSubject: subject,
        evaluationMethod: 'self_training',
        lecturerNo,
        lecturerName,
        timeStart: '',
        timeEnd: '',
        employees: [{ employeeNo: lecturerEmp.employeeNo, departmentCode: lecturerEmp.departmentCodes[0] || '' }],
        sops: sops.map(s => ({ sopNo: s.sopNo, sopName: s.sopName, version: s.version })),
      });
    }

    return plans;
  }

  /**
   * Group other employees by shared missing SOPs for maximum overlap
   *
   * 新员工定义 (Go-Live 规则):
   * - 入职日 > GO_LIVE_DATE 且 没有任何培训记录 → 新员工
   * - 入职日 <= GO_LIVE_DATE → 永远不是新员工 (基线培训是补训)
   *
   * 新员工培训:
   * - 所有 missing SOPs 都进入 "New Employee Training" (不拆分基线/非基线)
   * - 必须优先完成新员工培训, 再处理后续 Updated/New SOP
   *
   * 非新员工:
   * - versionCount === 1 → New SOP Training
   * - versionCount > 1 → Updated SOP Training
   */
  private planGroupSessions(
    employees: EmployeeMissing[],
    lecturerNo: string,
    lecturerName: string,
    cutoff: Date,
  ): TrainingSessionPlan[] {
    const plans: TrainingSessionPlan[] = [];

    // 分离新员工 vs 非新员工
    const newEmps = employees.filter(e => e.isNewEmployee);
    const oldEmps = employees.filter(e => !e.isNewEmployee);

    // 1. 新员工培训 — 只包含基线 SOPs (入职时已存在的版本)
    //    入职后才发布的更新 (isBaseline=false) 归入老员工的 Updated SOP Training
    const newEmpUpdateSops: EmployeeMissing[] = []; // 新员工的后续更新，转给老员工流程

    if (newEmps.length > 0) {
      // 按入职日分组 (同一天入职的新员工可以合并培训)
      const byHireDate = new Map<string, EmployeeMissing[]>();
      for (const emp of newEmps) {
        const key = emp.hireDate.toISOString().slice(0, 10);
        if (!byHireDate.has(key)) byHireDate.set(key, []);
        byHireDate.get(key)!.push(emp);
      }

      for (const [, group] of byHireDate) {
        // 分离: 基线 SOPs vs 入职后更新 SOPs
        const baselineSopsMap = new Map<string, MissingSopVersion>();
        for (const emp of group) {
          const empUpdateSops: MissingSopVersion[] = [];
          for (const sop of emp.missingSops) {
            if (sop.isBaseline) {
              const key = `${sop.sopNo}|${sop.version}`;
              if (!baselineSopsMap.has(key)) baselineSopsMap.set(key, sop);
            } else {
              empUpdateSops.push(sop);
            }
          }
          // 新员工的更新 SOPs 转入老员工流程
          if (empUpdateSops.length > 0) {
            newEmpUpdateSops.push({
              ...emp,
              isNewEmployee: false, // 对于更新培训，视为老员工
              missingSops: empUpdateSops,
            });
          }
        }

        const baselineSops = Array.from(baselineSopsMap.values());
        if (baselineSops.length === 0) continue;

        // 培训日期 = 该组最晚入职日的下一个工作日
        const latestHire = group.reduce(
          (max, e) => e.hireDate > max ? e.hireDate : max,
          group[0].hireDate,
        );
        const trainingDate = this.nextBusinessDay(latestHire);

        if (trainingDate > cutoff) continue;

        // 所有员工参加，每人带自己的部门
        const employees = group.map(e => ({
          employeeNo: e.employeeNo,
          departmentCode: e.departmentCodes[0] || '',
        }));

        plans.push({
          trainingNo: '',
          trainingDate,
          trainingSubject: 'New Employee Training',
          evaluationMethod: 'oral_qa',
          lecturerNo,
          lecturerName,
          timeStart: '',
          timeEnd: '',
          employees,
          sops: baselineSops.map(s => ({ sopNo: s.sopNo, sopName: s.sopName, version: s.version })),
        });
      }
    }

    // 合并: 新员工的更新 SOPs + 老员工
    const allOldEmps = [...oldEmps, ...newEmpUpdateSops];

    // 2. 非新员工: 按 基线 vs 更新 分类
    //    isBaseline=true → New SOP Training (Go-Live 基线补训)
    //    isBaseline=false → Updated SOP Training (后续更新培训)
    if (allOldEmps.length > 0) {
      const baselineSopEmps: EmployeeMissing[] = [];
      const updateSopEmps: EmployeeMissing[] = [];

      for (const emp of allOldEmps) {
        const baselineSops = emp.missingSops.filter(s => s.isBaseline);
        const updateSops = emp.missingSops.filter(s => !s.isBaseline);

        if (baselineSops.length > 0) {
          baselineSopEmps.push({ ...emp, missingSops: baselineSops });
        }
        if (updateSops.length > 0) {
          updateSopEmps.push({ ...emp, missingSops: updateSops });
        }
      }

      if (baselineSopEmps.length > 0) {
        plans.push(...this.groupByCommonSops(baselineSopEmps, 'New SOP Training', lecturerNo, lecturerName, cutoff));
      }
      if (updateSopEmps.length > 0) {
        plans.push(...this.groupByCommonSops(updateSopEmps, 'Updated SOP Training', lecturerNo, lecturerName, cutoff));
      }
    }

    return plans;
  }

  /**
   * Greedy grouping: find the largest common SOP set shared by the most employees
   * Max 34 employees per form
   */
  private groupByCommonSops(
    employees: EmployeeMissing[],
    subject: string,
    lecturerNo: string,
    lecturerName: string,
    cutoff: Date,
  ): TrainingSessionPlan[] {
    const plans: TrainingSessionPlan[] = [];
    const remaining = [...employees];

    while (remaining.length > 0) {
      // Safety guard: prevent infinite loop
      if (plans.length > 500) {
        this.logger.error(`groupByCommonSops: exceeded 500 plans, breaking. Remaining: ${remaining.length} employees`);
        break;
      }

      // Build SOP→employee index
      const sopToEmps = new Map<string, Set<number>>();
      for (let i = 0; i < remaining.length; i++) {
        for (const sop of remaining[i].missingSops) {
          const key = `${sop.sopNo}|${sop.version}`;
          if (!sopToEmps.has(key)) sopToEmps.set(key, new Set());
          sopToEmps.get(key)!.add(i);
        }
      }

      // Find the SOP set that covers the most employees
      // Strategy: start with the SOP that has the most employees, then intersect
      let bestSopKeys: string[] = [];
      let bestEmpIndices: Set<number> = new Set();

      // Sort SOPs by employee count desc
      const sortedSops = [...sopToEmps.entries()].sort((a, b) => b[1].size - a[1].size);

      for (const [sopKey, empSet] of sortedSops) {
        if (empSet.size <= bestEmpIndices.size && bestSopKeys.length > 0) continue;

        // Try building a group starting from this SOP
        const candidateEmps = new Set(empSet);
        const candidateSops = [sopKey];

        // Find all SOPs shared by ALL employees in candidateEmps
        for (const [otherKey, otherSet] of sopToEmps) {
          if (otherKey === sopKey) continue;
          // Check if all candidate employees also need this SOP
          let allHave = true;
          for (const empIdx of candidateEmps) {
            if (!otherSet.has(empIdx)) { allHave = false; break; }
          }
          if (allHave) candidateSops.push(otherKey);
        }

        // Score = employees × SOPs (maximize coverage)
        const score = candidateEmps.size * candidateSops.length;
        const bestScore = bestEmpIndices.size * bestSopKeys.length;
        if (score > bestScore) {
          bestSopKeys = candidateSops;
          bestEmpIndices = candidateEmps;
        }
      }

      if (bestSopKeys.length === 0 || bestEmpIndices.size === 0) break;

      // Cap at 34 employees per form
      const empIndicesArr = [...bestEmpIndices];
      for (let batch = 0; batch < empIndicesArr.length; batch += 34) {
        const batchIndices = empIndicesArr.slice(batch, batch + 34);
        const batchEmps = batchIndices.map(i => remaining[i]);

        // Determine training date: next business day after max effectiveDate among included SOPs
        const sopVersions = bestSopKeys.map(k => {
          const [sopNo, version] = k.split('|');
          const emp0Sop = batchEmps[0].missingSops.find(s => s.sopNo === sopNo && s.version === version);
          return emp0Sop!;
        });
        
        // 培训日期逻辑:
        // - New Employee Training → 基于最晚入职日 (新员工入职后培训)
        // - Updated/New SOP Training → 基于 SOP effectiveDate (SOP 更新后培训)
        //   对于 Go-Live 员工的 baseline SOPs, effectiveDate 已在 computeAllMissing 中设为 GO_LIVE_DATE
        let trainingDate: Date;
        if (subject === 'New Employee Training') {
          // 新员工: 基于最晚入职日的下一个工作日
          const latestHire = batchEmps.reduce(
            (max, e) => e.hireDate > max ? e.hireDate : max,
            batchEmps[0].hireDate,
          );
          trainingDate = this.nextBusinessDay(latestHire);
        } else {
          // 非新员工: 基于 SOP effectiveDate
          const latestEffective = sopVersions.reduce(
            (max, s) => s.effectiveDate > max ? s.effectiveDate : max,
            sopVersions[0].effectiveDate,
          );
          trainingDate = this.nextBusinessDay(latestEffective);
        }

        // Check cutoff — skip but still remove these SOPs from remaining
        if (trainingDate > cutoff) {
          this.logger.warn(`Training date ${trainingDate.toISOString()} exceeds cutoff ${cutoff.toISOString()}, skipping batch`);
          // Don't create plan but still fall through to removal below
          continue;
        }

        plans.push({
          trainingNo: '',
          trainingDate,
          trainingSubject: subject,
          evaluationMethod: 'oral_qa',
          lecturerNo,
          lecturerName,
          timeStart: '',
          timeEnd: '',
          employees: batchEmps.map(e => ({
            employeeNo: e.employeeNo,
            departmentCode: e.departmentCodes[0] || '',
          })),
          sops: sopVersions.map(s => ({ sopNo: s.sopNo, sopName: s.sopName, version: s.version })),
        });
      }

      // Remove covered SOPs from remaining employees (ALWAYS, even if skipped by cutoff)
      const coveredSopKeys = new Set(bestSopKeys);
      for (const idx of [...bestEmpIndices].sort((a, b) => b - a)) {
        remaining[idx] = {
          ...remaining[idx],
          missingSops: remaining[idx].missingSops.filter(
            s => !coveredSopKeys.has(`${s.sopNo}|${s.version}`),
          ),
        };
        if (remaining[idx].missingSops.length === 0) {
          remaining.splice(idx, 1);
        }
      }
    }

    return plans;
  }

  /**
   * Assign unique training numbers: YYYYMMDD + initials + ##
   */
  private async assignTrainingNumbers(plans: TrainingSessionPlan[], lecturerName: string) {
    // Get existing training numbers to avoid conflicts
    const existing = await this.prisma.vmaTrainingSession.findMany({
      select: { trainingNo: true },
    });
    const existingNos = new Set(existing.map(e => e.trainingNo));

    // Get initials from lecturer name
    const initials = lecturerName
      .split(/\s+/)
      .map(w => w[0]?.toUpperCase() || '')
      .join('');

    // Group plans by date
    const byDate = new Map<string, TrainingSessionPlan[]>();
    for (const plan of plans) {
      const dateStr = plan.trainingDate.toISOString().slice(0, 10).replace(/-/g, '');
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr)!.push(plan);
    }

    for (const [dateStr, datePlans] of byDate) {
      let seq = 1;
      for (const plan of datePlans) {
        let no: string;
        do {
          no = `${dateStr}${initials}${String(seq).padStart(2, '0')}`;
          seq++;
        } while (existingNos.has(no));
        plan.trainingNo = no;
        existingNos.add(no);
      }
    }
  }

  /**
   * Assign time slots: 9:30 AM start, 10 min per SOP, max 5:30 PM
   * 溢出时级联后移 — 超过 5:30 PM 的 session 及后续全部移到下一个工作日
   */
  private assignTimeSlots(plans: TrainingSessionPlan[]) {
    // Sort all plans by training date for sequential scheduling
    plans.sort((a, b) => a.trainingDate.getTime() - b.trainingDate.getTime());

    // Track current time pointer per date (minutes from midnight)
    const dateCurrentMinutes = new Map<string, number>();
    const DAY_START = 9 * 60 + 30; // 9:30 AM
    const DAY_END = 17 * 60 + 30;  // 5:30 PM
    const DAY_CAPACITY = DAY_END - DAY_START; // 480 min

    for (const plan of plans) {
      const durationMin = Math.max(plan.sops.length * 10, 10); // 10 min per SOP, minimum 10

      // Find a date with available time
      let targetDate = plan.trainingDate;
      let dateKey = targetDate.toISOString().slice(0, 10);
      let startMinutes = dateCurrentMinutes.get(dateKey) ?? DAY_START;

      // If this session would overflow 5:30 PM, cascade to next business day
      // Safety: if duration > DAY_CAPACITY, don't loop forever — just use a fresh day
      if (durationMin > DAY_CAPACITY) {
        // Session is longer than a full day — find a fresh day and start at 9:30
        if (startMinutes > DAY_START) {
          targetDate = this.nextBusinessDay(targetDate);
          dateKey = targetDate.toISOString().slice(0, 10);
        }
        startMinutes = DAY_START;
      } else {
        let safety = 0;
        while (startMinutes + durationMin > DAY_END && safety < 365) {
          targetDate = this.nextBusinessDay(targetDate);
          dateKey = targetDate.toISOString().slice(0, 10);
          startMinutes = dateCurrentMinutes.get(dateKey) ?? DAY_START;
          safety++;
        }
      }

      plan.trainingDate = targetDate;
      plan.timeStart = this.formatTime(startMinutes);
      plan.timeEnd = this.formatTime(startMinutes + durationMin);

      dateCurrentMinutes.set(dateKey, startMinutes + durationMin);
    }
  }

  /**
   * Write sessions and records to database
   */
  private async writeToDB(plans: TrainingSessionPlan[]): Promise<string[]> {
    const sessionIds: string[] = [];

    for (const plan of plans) {
      const session = await this.prisma.vmaTrainingSession.create({
        data: {
          trainingNo: plan.trainingNo,
          trainingDate: plan.trainingDate,
          trainingSubject: plan.trainingSubject,
          evaluationMethod: plan.evaluationMethod,
          lecturerNo: plan.lecturerNo,
          lecturerName: plan.lecturerName,
          trainingTimeStart: plan.timeStart,
          trainingTimeEnd: plan.timeEnd,
          attendCount: plan.employees.length,
          passCount: plan.employees.length,
          recordedDate: plan.trainingDate,
        },
      });
      sessionIds.push(session.id);

      // Create individual records for each employee × SOP
      for (const emp of plan.employees) {
        for (const sop of plan.sops) {
          await this.prisma.vmaTrainingRecord.upsert({
            where: {
              employeeNo_sopNo_sopVersion: {
                employeeNo: emp.employeeNo,
                sopNo: sop.sopNo,
                sopVersion: sop.version,
              },
            },
            create: {
              sessionId: session.id,
              employeeNo: emp.employeeNo,
              sopNo: sop.sopNo,
              sopVersion: sop.version,
              trainingDate: plan.trainingDate,
              trainingNo: plan.trainingNo,
              trainerId: plan.lecturerNo,
              trainingLocation: 'On-Site',
              trainingDuration: plan.sops.length * 10,
              completedAt: plan.trainingDate,
            },
            update: {
              sessionId: session.id,
              trainingDate: plan.trainingDate,
              trainingNo: plan.trainingNo,
              completedAt: plan.trainingDate,
            },
          });
        }
      }
    }

    return sessionIds;
  }

  // ========== Helpers ==========

  private determineSubject(sops: MissingSopVersion[], isNewEmployee: boolean): string {
    if (isNewEmployee) return 'New Employee Training';
    const hasNew = sops.some(s => s.versionCount === 1);
    if (hasNew) return 'New SOP Training';
    return 'Updated SOP Training';
  }

  private nextBusinessDay(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  private addBusinessDays(date: Date, days: number): Date {
    const d = new Date(date);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  }

  private formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
}
