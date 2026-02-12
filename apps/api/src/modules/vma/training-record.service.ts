import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreateTrainingRecordDto, UpdateTrainingRecordDto } from './dto/training-record.dto';

@Injectable()
export class TrainingRecordService {
  // Go-Live 日期: 培训体系正式启动日
  // 2025-06-15 及之前入职的员工, 基线培训统一定于此日期
  private readonly GO_LIVE_DATE = new Date('2025-06-15T00:00:00');

  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vmaTrainingRecord.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByEmployee(employeeNo: string) {
    return this.prisma.vmaTrainingRecord.findMany({
      where: { employeeNo },
      orderBy: { trainingDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.vmaTrainingRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Training record ${id} not found`);
    return record;
  }

  async create(dto: CreateTrainingRecordDto) {
    // 检查是否已存在
    const existing = await this.prisma.vmaTrainingRecord.findUnique({
      where: {
        employeeNo_sopNo_sopVersion: {
          employeeNo: dto.employeeNo,
          sopNo: dto.sopNo,
          sopVersion: dto.sopVersion,
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Training record already exists for ${dto.employeeNo} - ${dto.sopNo} - ${dto.sopVersion}`);
    }

    return this.prisma.vmaTrainingRecord.create({
      data: {
        employeeNo: dto.employeeNo,
        sopNo: dto.sopNo,
        sopVersion: dto.sopVersion,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
        trainerId: dto.trainerId,
        trainingDate: new Date(dto.trainingDate),
        trainingNo: dto.trainingNo,
        trainingLocation: dto.trainingLocation,
        trainingDuration: dto.trainingDuration,
      },
    });
  }

  async update(id: string, dto: UpdateTrainingRecordDto) {
    await this.findOne(id);
    const data: any = {};
    if (dto.completedAt !== undefined) data.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    if (dto.trainerId !== undefined) data.trainerId = dto.trainerId;
    if (dto.trainingDate !== undefined) data.trainingDate = new Date(dto.trainingDate);
    if (dto.trainingNo !== undefined) data.trainingNo = dto.trainingNo;
    if (dto.trainingLocation !== undefined) data.trainingLocation = dto.trainingLocation;
    if (dto.trainingDuration !== undefined) data.trainingDuration = dto.trainingDuration;

    return this.prisma.vmaTrainingRecord.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vmaTrainingRecord.delete({ where: { id } });
  }

  // ======== 培训批次 (Session) 操作 ========
  // 从 Controller 迁移至 Service (审计 S-7 修复)

  /** 培训批次列表 */
  async listSessions() {
    return this.prisma.vmaTrainingSession.findMany({
      orderBy: { trainingNo: 'desc' },
      include: { records: true },
    });
  }

  /** 培训批次详情 */
  async getSession(id: string) {
    return this.prisma.vmaTrainingSession.findUnique({
      where: { id },
      include: { records: true },
    });
  }

  /** 删除培训批次 (含所有关联记录) */
  async deleteSession(id: string) {
    // Delete related records first
    await this.prisma.vmaTrainingRecord.deleteMany({ where: { sessionId: id } });
    return this.prisma.vmaTrainingSession.delete({ where: { id } });
  }

  /** 从培训批次中移除某条记录, 并更新批次统计 */
  async removeRecordFromSession(sessionId: string, recordId: string) {
    const record = await this.prisma.vmaTrainingRecord.delete({ where: { id: recordId } });
    // Update attend/pass counts
    const uniqueEmps = await this.prisma.vmaTrainingRecord.findMany({
      where: { sessionId },
      distinct: ['employeeNo'],
      select: { employeeNo: true },
    });
    await this.prisma.vmaTrainingSession.update({
      where: { id: sessionId },
      data: { attendCount: uniqueEmps.length, passCount: uniqueEmps.length },
    });
    return { record, remaining: uniqueEmps.length };
  }

  /** 查找培训批次 by trainingNo */
  async getSessionByTrainingNo(trainingNo: string) {
    return this.prisma.vmaTrainingSession.findFirst({
      where: { trainingNo },
      include: { records: true },
    });
  }

  /** 获取 PDF 生成所需的员工部门映射和 SOP 名称映射 */
  async getSessionPdfData(employeeNos: string[], sopNos: string[]) {
    const employees = await this.prisma.vmaEmployee.findMany({
      where: { employeeNo: { in: employeeNos } },
      include: {
        departmentAssignments: {
          where: { removedAt: null },
          include: { department: true },
        },
      },
    });
    const empDeptMap = new Map<string, string>();
    for (const emp of employees) {
      const dept = emp.departmentAssignments[0]?.department?.code || '';
      empDeptMap.set(emp.employeeNo, dept);
    }

    const sops = await this.prisma.vmaTrainingSop.findMany({
      where: { sopNo: { in: sopNos } },
    });
    const sopNameMap = new Map(sops.map(s => [s.sopNo, s.name]));

    return { empDeptMap, sopNameMap };
  }

  /**
   * 获取员工培训状态总览 (时间维度版本)
   * 逻辑: 基于员工的部门分配历史和 SOP 需求变更历史，
   * 计算员工在每段分配期间需要完成的 SOP 培训
   */
  async getEmployeeTrainingStatus() {
    // 1. 所有 ACTIVE 员工 + 部门分配历史
    const employees = await this.prisma.vmaEmployee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        departmentAssignments: {
          include: {
            department: {
              include: { sopRequirements: true },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
      orderBy: { employeeNo: 'asc' },
    });

    // 2. 所有培训记录
    const allRecords = await this.prisma.vmaTrainingRecord.findMany();
    const recordMap = new Map<string, Set<string>>();
    for (const r of allRecords) {
      const key = r.employeeNo;
      if (!recordMap.has(key)) recordMap.set(key, new Set());
      recordMap.get(key)!.add(`${r.sopNo}|${r.sopVersion}`);
    }

    // 3. 所有 SOP + 版本
    const allSops = await this.prisma.vmaTrainingSop.findMany({
      where: { status: 'ACTIVE' },
      include: { versions: { orderBy: { effectiveDate: 'desc' } } },
    });
    const sopMap = new Map(allSops.map(s => [s.sopNo, s]));

    // 4. 所有 SOP 需求变更历史 (用于时间维度计算)
    const allSopHistory = await this.prisma.vmaDutySopHistory.findMany({
      orderBy: { changeDate: 'asc' },
    });
    // 按 departmentId 分组
    const sopHistoryByDept = new Map<string, any[]>();
    for (const h of allSopHistory) {
      if (!sopHistoryByDept.has(h.departmentId)) sopHistoryByDept.set(h.departmentId, []);
      sopHistoryByDept.get(h.departmentId)!.push(h);
    }

    // 5. 计算每个员工状态
    const result = employees.map(emp => {
      // 收集该员工所有分配期间需要的 SOP 编号
      const requiredSopNos = new Set<string>();
      for (const assignment of emp.departmentAssignments) {
        // 当前分配的部门要求的所有 SOP
        for (const req of assignment.department.sopRequirements) {
          requiredSopNos.add(req.sopNo);
        }
      }

      // 检查每个必需 SOP 的培训状态
      const missing: { sopNo: string; name: string; version: string; daNo: string; effectiveDate: Date }[] = [];
      const completed: string[] = [];
      const empRecords = recordMap.get(emp.employeeNo) || new Set();

      for (const sopNo of requiredSopNos) {
        const sop = sopMap.get(sopNo);
        if (!sop || sop.versions.length === 0) continue;

        // 版本按 effectiveDate 升序排列
        const sortedVersions = [...sop.versions].sort(
          (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
        );

        // Go-Live 规则: 入职日 <= GO_LIVE → 使用 GO_LIVE 作为有效入职日
        const effectiveHireDate = emp.hireDate <= this.GO_LIVE_DATE ? this.GO_LIVE_DATE : emp.hireDate;

        // 找基线版本 = 截至有效入职日的最新版本
        let baselineIdx = -1;
        for (let i = sortedVersions.length - 1; i >= 0; i--) {
          if (sortedVersions[i].effectiveDate <= effectiveHireDate) {
            baselineIdx = i;
            break;
          }
        }
        if (baselineIdx === -1) baselineIdx = 0;

        const applicableVersions = sortedVersions.slice(baselineIdx);

        // 循序渐进: 基线 + 基线之后每个 trainingRequired=true 的版本
        const missingVersions: typeof sortedVersions = [];
        for (let vi = 0; vi < applicableVersions.length; vi++) {
          const ver = applicableVersions[vi];
          const isBaseline = vi === 0;
          const mustTrain = isBaseline || ver.trainingRequired;
          if (mustTrain) {
            if (!empRecords.has(`${sopNo}|${ver.version}`)) {
              missingVersions.push(ver);
            }
          }
        }

        if (missingVersions.length > 0) {
          for (const mv of missingVersions) {
            missing.push({
              sopNo,
              name: sop.name,
              version: mv.version,
              daNo: mv.daNo,
              effectiveDate: mv.effectiveDate,
            });
          }
        } else {
          completed.push(sopNo);
        }
      }

      return {
        employeeNo: emp.employeeNo,
        lastName: emp.lastName,
        firstName: emp.firstName,
        hireDate: emp.hireDate,
        totalRequired: requiredSopNos.size,
        completedCount: completed.length,
        missingCount: missing.length,
        missingSops: missing,
        status: missing.length === 0 ? 'COMPLETE' : 'MISSING',
      };
    });

    return result;
  }

  /**
   * 培训矩阵报告 - 用于审计
   * 返回 Employee × SOP 交叉矩阵
   * 每个单元格: 'completed' | 'missing' | 'na'
   */
  async getTrainingMatrix() {
    // 1. 所有 ACTIVE 员工 + 部门分配
    const employees = await this.prisma.vmaEmployee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        departmentAssignments: {
          where: { removedAt: null },
          include: {
            department: {
              include: { sopRequirements: true },
            },
          },
        },
      },
      orderBy: { employeeNo: 'asc' },
    });

    // 2. 所有 ACTIVE SOP + 最新版本
    const allSops = await this.prisma.vmaTrainingSop.findMany({
      where: { status: 'ACTIVE' },
      include: { versions: { orderBy: { effectiveDate: 'desc' }, take: 1 } },
      orderBy: { seqNo: 'asc' },
    });

    // 3. 所有培训记录
    const allRecords = await this.prisma.vmaTrainingRecord.findMany();
    const recordSet = new Set<string>();
    for (const r of allRecords) {
      recordSet.add(`${r.employeeNo}|${r.sopNo}|${r.sopVersion}`);
    }

    // 4. SOP 列定义
    const sopColumns = allSops.map(s => ({
      sopNo: s.sopNo,
      name: s.name,
      seqNo: s.seqNo,
      latestVersion: s.versions[0]?.version || '-',
    }));

    // 5. 构建矩阵行
    const rows = employees.map(emp => {
      const requiredSopNos = new Set<string>();
      const deptNames: string[] = [];

      for (const assignment of emp.departmentAssignments) {
        deptNames.push(`${assignment.department.name} - ${assignment.department.duties}`);
        for (const req of assignment.department.sopRequirements) {
          requiredSopNos.add(req.sopNo);
        }
      }

      const cells: Record<string, 'completed' | 'missing' | 'na'> = {};
      let completedCount = 0;
      let missingCount = 0;

      for (const col of sopColumns) {
        if (!requiredSopNos.has(col.sopNo)) {
          cells[col.sopNo] = 'na';
          continue;
        }
        // 检查是否有该 SOP 最新版本的记录
        if (recordSet.has(`${emp.employeeNo}|${col.sopNo}|${col.latestVersion}`)) {
          cells[col.sopNo] = 'completed';
          completedCount++;
        } else {
          cells[col.sopNo] = 'missing';
          missingCount++;
        }
      }

      return {
        employeeNo: emp.employeeNo,
        lastName: emp.lastName,
        firstName: emp.firstName,
        hireDate: emp.hireDate,
        departments: deptNames,
        cells,
        totalRequired: requiredSopNos.size,
        completedCount,
        missingCount,
        completionRate: requiredSopNos.size > 0
          ? Math.round((completedCount / requiredSopNos.size) * 100)
          : 100,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      sopColumns,
      rows,
      summary: {
        totalEmployees: rows.length,
        totalSops: sopColumns.length,
        fullyCompliant: rows.filter(r => r.missingCount === 0).length,
        overallCompletionRate: rows.length > 0
          ? Math.round(
              rows.reduce((sum, r) => sum + r.completionRate, 0) / rows.length,
            )
          : 100,
      },
    };
  }

  /**
   * 培训合规路线图 - Training Compliance Roadmap
   * X 轴: SOP 版本的真实 effectiveDate (早于 2025-06-14 统一归到 2025-06-14)
   * 上下卡片: 该日期时刻的员工合规快照
   *
   * === FIX LOG (2026-02-07) ===
   * 1. 部门 SOP 需求现在使用 DutySopHistory 按时间回放（ADD/REMOVE 累积），
   *    而非一次性读取当前快照。保证历史节点的需求准确。
   * 2. 员工范围改为全量加载（不限 status=ACTIVE），
   *    使用 hireDate / terminationDate 判断员工在每个 milestone 是否在职。
   * 3. 清理未使用的 recordMap 死代码。
   */
  async getTrainingRoadmap() {
    const BASELINE_DATE = new Date('2025-06-15T00:00:00.000Z');

    // 1. 获取所有 SOP 版本 (含 SOP 主表信息)
    const allVersions = await this.prisma.vmaTrainingSopVersion.findMany({
      where: { sop: { status: 'ACTIVE' } },
      include: { sop: true },
      orderBy: { effectiveDate: 'asc' },
    });

    if (allVersions.length === 0) return { milestones: [] };

    // 2. 按 effectiveDate 分组, < BASELINE 归到 BASELINE
    const dateGroups = new Map<string, typeof allVersions>();
    for (const v of allVersions) {
      const effectiveDate = v.effectiveDate < BASELINE_DATE ? BASELINE_DATE : v.effectiveDate;
      const key = effectiveDate.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!dateGroups.has(key)) dateGroups.set(key, []);
      dateGroups.get(key)!.push(v);
    }

    // 过滤: 只保留至少有一个 SOP 需要培训的日期
    // BASELINE 节点: 基线版本始终需要培训
    // 非 BASELINE: 至少一个版本 trainingRequired=true 才保留
    const baselineDateStr = BASELINE_DATE.toISOString().slice(0, 10);
    const sortedDates: string[] = [];
    for (const [dateStr, versions] of Array.from(dateGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (dateStr === baselineDateStr) {
        // BASELINE 始终保留
        sortedDates.push(dateStr);
      } else {
        // 非 BASELINE: 至少一个 trainingRequired=true
        const hasTrainingRequired = versions.some(v => v.trainingRequired);
        if (hasTrainingRequired) {
          sortedDates.push(dateStr);
        }
      }
    }

    // 3. [FIX #2] 获取全部员工 (含部门分配)，不限 status
    //    使用 hireDate / terminationDate 判断员工在 milestoneDate 是否在职
    const employees = await this.prisma.vmaEmployee.findMany({
      include: {
        departmentAssignments: {
          include: { department: true },
        },
      },
      orderBy: { employeeNo: 'asc' },
    });

    // 4. 获取部门 SOP 需求
    //    优先使用 DutySopHistory 做时间回放（精确历史）
    //    若 History 为空（尚未记录变更），回退到 VmaDutySopRequirement（当前快照）
    const allSopHistory = await this.prisma.vmaDutySopHistory.findMany({
      orderBy: { changeDate: 'asc' },
    });

    // 回退: 当 History 为空时，加载当前 VmaDutySopRequirement 作为静态需求
    let staticDeptSopMap: Map<string, Set<string>> | null = null;
    if (allSopHistory.length === 0) {
      const departments = await this.prisma.vmaDepartment.findMany({
        include: { sopRequirements: true },
      });
      staticDeptSopMap = new Map();
      for (const dept of departments) {
        const sopNos = new Set<string>();
        for (const req of dept.sopRequirements) {
          sopNos.add(req.sopNo);
        }
        if (sopNos.size > 0) {
          staticDeptSopMap.set(dept.id, sopNos);
        }
      }
    }

    // 5. 获取所有培训记录 — 使用 Set 做存在性检查 (不限日期)
    // Roadmap 是审计工具: 只要有记录就算合规, 不管培训何时完成
    const allRecords = await this.prisma.vmaTrainingRecord.findMany();
    const recordSet = new Set<string>();
    for (const r of allRecords) {
      recordSet.add(`${r.employeeNo}|${r.sopNo}|${r.sopVersion}`);
    }

    // 6. 构建每个时间节点的合规快照
    // 追踪截至当前节点已生效的所有 SOP 版本 (含 trainingRequired 标志)
    const effectiveSops = new Map<string, { version: string; effectiveDate: Date; sopName: string; trainingRequired: boolean }[]>();

    const milestones: any[] = [];

    for (const dateStr of sortedDates) {
      const versions = dateGroups.get(dateStr)!;
      const milestoneDate = new Date(dateStr + 'T23:59:59.000Z'); // 当天结束
      const isBaseline = dateStr === BASELINE_DATE.toISOString().slice(0, 10);

      // 更新已生效的 SOP 版本
      for (const v of versions) {
        if (!effectiveSops.has(v.sop.sopNo)) {
          effectiveSops.set(v.sop.sopNo, []);
        }
        effectiveSops.get(v.sop.sopNo)!.push({
          version: v.version,
          effectiveDate: v.effectiveDate < BASELINE_DATE ? BASELINE_DATE : v.effectiveDate,
          sopName: v.sop.name,
          trainingRequired: v.trainingRequired,
        });
      }

      // 重建每个部门在 milestoneDate 时的 SOP 需求
      let deptSopAtDate: Map<string, Set<string>>;

      if (allSopHistory.length > 0) {
        // 有历史记录 → 精确时间回放
        // 注意: INITIAL 记录的 changeDate 是创建时间（非实际生效时间），
        //       所以 INITIAL 始终包含（视为一直存在的基线配置）
        //       只有 ADD/REMOVE 按 changeDate 过滤
        deptSopAtDate = new Map();
        for (const h of allSopHistory) {
          // INITIAL 不受时间过滤 — 它们代表初始基线状态
          if (h.changeType !== 'INITIAL' && h.changeDate > milestoneDate) continue;

          if (!deptSopAtDate.has(h.departmentId)) {
            deptSopAtDate.set(h.departmentId, new Set());
          }
          const deptSet = deptSopAtDate.get(h.departmentId)!;
          if (h.changeType === 'ADD' || h.changeType === 'INITIAL') {
            deptSet.add(h.sopNo);
          } else if (h.changeType === 'REMOVE') {
            deptSet.delete(h.sopNo);
          }
        }
      } else {
        // 无历史记录 → 回退到当前快照 (视为所有需求一直存在)
        deptSopAtDate = staticDeptSopMap!;
      }

      // 计算每个员工的合规状态
      let totalRequired = 0;
      let totalCompleted = 0;
      let compliantEmployees = 0;
      let nonCompliantEmployees = 0;
      const employeeSnapshots: any[] = [];

      for (const emp of employees) {
        // [FIX #2] 检查该员工在 milestoneDate 时是否在职
        if (emp.hireDate > milestoneDate) continue;
        if (emp.terminationDate && emp.terminationDate <= milestoneDate) continue;

        // 此员工的部门分配 (在 milestoneDate 时有效的)
        const activeDeptIds = new Set<string>();
        for (const assignment of emp.departmentAssignments) {
          if (assignment.assignedAt <= milestoneDate) {
            if (!assignment.removedAt || assignment.removedAt > milestoneDate) {
              activeDeptIds.add(assignment.departmentId);
            }
          }
        }

        if (activeDeptIds.size === 0) continue;

        // 汇总此员工需要的 SOP 编号 (来自活跃部门的时间回放需求)
        const requiredSopNos = new Set<string>();
        for (const deptId of activeDeptIds) {
          const deptReqs = deptSopAtDate.get(deptId);
          if (!deptReqs) continue;
          for (const sopNo of deptReqs) {
            requiredSopNos.add(sopNo);
          }
        }

        if (requiredSopNos.size === 0) {
          compliantEmployees++;
          employeeSnapshots.push({
            employeeNo: emp.employeeNo,
            name: `${emp.lastName}, ${emp.firstName}`,
            required: 0,
            completed: 0,
            missing: 0,
            compliant: true,
            missingSops: [],
          });
          continue;
        }

        // ===== 核心培训判定逻辑 (与 Training Matrix 统一) =====
        // 规则:
        //   1. 基线版本 = 入职前最近的版本 (若无则取第一个) → 始终需要培训
        //   2. 基线之后 trainingRequired=true 的版本 → 需要培训
        //   3. 基线之后 trainingRequired=false 的版本 → 跳过
        let empRequired = 0;
        let empCompleted = 0;
        const missingSops: string[] = [];

        for (const sopNo of requiredSopNos) {
          const allVers = effectiveSops.get(sopNo);
          if (!allVers || allVers.length === 0) continue;

          // 取截至 milestoneDate 的版本，按 effectiveDate 升序
          const applicableAll = allVers
            .filter(v => v.effectiveDate <= milestoneDate)
            .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
          if (applicableAll.length === 0) continue;

          // Go-Live 规则: 入职日 <= BASELINE_DATE → 使用 BASELINE_DATE 作为有效入职日
          const effectiveHireDate = emp.hireDate <= BASELINE_DATE ? BASELINE_DATE : emp.hireDate;

          // 找基线: 截至有效入职日的最新版本
          let baselineIdx = -1;
          for (let i = applicableAll.length - 1; i >= 0; i--) {
            if (applicableAll[i].effectiveDate <= effectiveHireDate) {
              baselineIdx = i;
              break;
            }
          }
          if (baselineIdx === -1) baselineIdx = 0;

          const applicableVersions = applicableAll.slice(baselineIdx);

          // 循序渐进: 基线 + 基线之后每个 trainingRequired=true 的版本
          for (let vi = 0; vi < applicableVersions.length; vi++) {
            const ver = applicableVersions[vi];
            const isVerBaseline = vi === 0;
            const mustTrain = isVerBaseline || ver.trainingRequired;

            if (mustTrain) {
              empRequired++;
              const hasTrained = recordSet.has(`${emp.employeeNo}|${sopNo}|${ver.version}`);
              if (hasTrained) {
                empCompleted++;
              } else {
                missingSops.push(sopNo);
              }
            }
          }
        }

        const empMissing = empRequired - empCompleted;

        totalRequired += empRequired;
        totalCompleted += empCompleted;

        if (empMissing === 0) {
          compliantEmployees++;
        } else {
          nonCompliantEmployees++;
        }

        employeeSnapshots.push({
          employeeNo: emp.employeeNo,
          name: `${emp.lastName}, ${emp.firstName}`,
          required: empRequired,
          completed: empCompleted,
          missing: empMissing,
          compliant: empMissing === 0,
          missingSops,
        });
      }

      // 变更 SOP 描述
      const sopChanges = versions.map(v => ({
        sopNo: v.sop.sopNo,
        sopName: v.sop.name,
        version: v.version,
        daNo: v.daNo,
        effectiveDate: v.effectiveDate.toISOString(),
      }));

      milestones.push({
        date: dateStr,
        changeType: isBaseline ? 'INITIAL' : 'UPDATE',
        sopChanges,
        summary: {
          totalEmployees: employeeSnapshots.length,
          compliant: compliantEmployees,
          nonCompliant: nonCompliantEmployees,
          totalRequired,
          totalCompleted,
          completionRate: totalRequired > 0
            ? Math.round((totalCompleted / totalRequired) * 100)
            : 100,
        },
        topNonCompliant: employeeSnapshots
          .filter(e => !e.compliant)
          .sort((a, b) => b.missing - a.missing)
          .slice(0, 10),
      });
    }

    return { milestones };
  }
}
