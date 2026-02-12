/**
 * VMA Employees Service - 员工管理服务
 * 支持时间维度追踪 (部门分配历史、离职日期、SOP变更历史)
 */
import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  CreateEmployeeDto, UpdateEmployeeDto, EmployeeQueryDto,
  ToggleEmployeeStatusDto,
  AddDepartmentAssignmentDto, UpdateDepartmentAssignmentDto, RemoveDepartmentAssignmentDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  UpdateSopRequirementsDto, UpdateSopHistoryDto,
} from './dto';
import { parsePacificDate } from './vma-shared.util';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================
  // Employee CRUD
  // ================================

  /**
   * 获取员工列表 (分页 + 搜索)
   * 使用新的 departmentAssignments 替代旧的 departments
   */
  async findAllEmployees(query: EmployeeQueryDto) {
    const { search, departmentId, status, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { employeeNo: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (departmentId) {
      where.departmentAssignments = {
        some: { departmentId, removedAt: null }, // 当前在职的分配
      };
    }

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.vmaEmployee.findMany({
        where,
        include: {
          departmentAssignments: {
            include: { department: true },
            orderBy: { assignedAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.vmaEmployee.count({ where }),
    ]);

    // 为了向后兼容，也返回 departments 字段（当前在职的部门）
    const enriched = data.map((emp) => ({
      ...emp,
      departments: emp.departmentAssignments
        .filter((a) => !a.removedAt)
        .map((a) => a.department),
    }));

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取单个员工 (含完整职业生涯)
   */
  async findOneEmployee(id: string) {
    const employee = await this.prisma.vmaEmployee.findUnique({
      where: { id },
      include: {
        departmentAssignments: {
          include: { department: true },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    // 向后兼容
    return {
      ...employee,
      departments: employee.departmentAssignments
        .filter((a) => !a.removedAt)
        .map((a) => a.department),
    };
  }

  /**
   * 创建员工
   * 每个部门分配记录的 assignedAt = hireDate
   */
  async createEmployee(dto: CreateEmployeeDto) {
    const existing = await this.prisma.vmaEmployee.findUnique({
      where: { employeeNo: dto.employeeNo },
    });
    if (existing) {
      throw new ConflictException(`Employee number ${dto.employeeNo} already exists`);
    }

    const hireDate = parsePacificDate(dto.hireDate);

    const employee = await this.prisma.vmaEmployee.create({
      data: {
        employeeNo: dto.employeeNo,
        lastName: dto.lastName,
        firstName: dto.firstName,
        hireDate,
        departmentAssignments: {
          create: dto.departmentIds.map((deptId) => ({
            departmentId: deptId,
            assignedAt: hireDate,
          })),
        },
      },
      include: {
        departmentAssignments: {
          include: { department: true },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });

    return {
      ...employee,
      departments: employee.departmentAssignments
        .filter((a) => !a.removedAt)
        .map((a) => a.department),
    };
  }

  /**
   * 更新员工基本信息（不含部门变更）
   */
  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    await this.findOneEmployee(id);

    if (dto.employeeNo) {
      const existing = await this.prisma.vmaEmployee.findFirst({
        where: { employeeNo: dto.employeeNo, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Employee number ${dto.employeeNo} already exists`);
      }
    }

    const data: any = {};
    if (dto.employeeNo) data.employeeNo = dto.employeeNo;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.status) data.status = dto.status;
    if (dto.hireDate) {
      data.hireDate = parsePacificDate(dto.hireDate);
    }
    if (dto.terminationDate) {
      data.terminationDate = parsePacificDate(dto.terminationDate);
    }

    const updated = await this.prisma.vmaEmployee.update({
      where: { id },
      data,
      include: {
        departmentAssignments: {
          include: { department: true },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });

    return {
      ...updated,
      departments: updated.departmentAssignments
        .filter((a) => !a.removedAt)
        .map((a) => a.department),
    };
  }

  /**
   * 软删除员工 (保留审计追踪)
   */
  async deleteEmployee(id: string) {
    await this.findOneEmployee(id);
    await this.prisma.vmaEmployee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    return { success: true, id };
  }

  /**
   * 切换员工状态
   * 停用时: 必须提供 terminationDate
   * 激活时: 清除 terminationDate
   */
  async toggleEmployeeStatus(id: string, dto?: ToggleEmployeeStatusDto) {
    const employee = await this.findOneEmployee(id);
    const newStatus = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (newStatus === 'INACTIVE' && !dto?.terminationDate) {
      throw new BadRequestException('Termination date is required when deactivating an employee');
    }

    const data: any = { status: newStatus };
    if (newStatus === 'INACTIVE') {
      data.terminationDate = parsePacificDate(dto!.terminationDate!);
    } else {
      data.terminationDate = null; // 重新激活时清除离职日期
    }

    const updated = await this.prisma.vmaEmployee.update({
      where: { id },
      data,
      include: {
        departmentAssignments: {
          include: { department: true },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });

    return {
      ...updated,
      departments: updated.departmentAssignments
        .filter((a) => !a.removedAt)
        .map((a) => a.department),
    };
  }

  // ================================
  // Employee-Department Assignments
  // ================================

  /**
   * 添加部门分配
   */
  async addDepartmentAssignment(employeeId: string, dto: AddDepartmentAssignmentDto) {
    await this.findOneEmployee(employeeId);

    // 检查部门是否存在
    const dept = await this.prisma.vmaDepartment.findUnique({ where: { id: dto.departmentId } });
    if (!dept) throw new NotFoundException(`Department ${dto.departmentId} not found`);

    // 检查是否已有未结束的相同部门分配
    const activeAssignment = await this.prisma.vmaEmployeeDepartment.findFirst({
      where: { employeeId, departmentId: dto.departmentId, removedAt: null },
    });
    if (activeAssignment) {
      throw new ConflictException('Employee already has an active assignment to this department');
    }

    return this.prisma.vmaEmployeeDepartment.create({
      data: {
        employeeId,
        departmentId: dto.departmentId,
        assignedAt: parsePacificDate(dto.assignedAt),
      },
      include: { department: true },
    });
  }

  /**
   * 移除部门分配（设 removedAt）
   */
  async removeDepartmentAssignment(assignmentId: string, dto: RemoveDepartmentAssignmentDto) {
    const assignment = await this.prisma.vmaEmployeeDepartment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    if (assignment.removedAt) throw new ConflictException('Assignment already removed');

    return this.prisma.vmaEmployeeDepartment.update({
      where: { id: assignmentId },
      data: { removedAt: parsePacificDate(dto.removedAt) },
      include: { department: true },
    });
  }

  /**
   * 编辑部门分配记录（栈式规则：仅最近一条）
   */
  async updateDepartmentAssignment(assignmentId: string, dto: UpdateDepartmentAssignmentDto) {
    const assignment = await this.prisma.vmaEmployeeDepartment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException(`Assignment ${assignmentId} not found`);

    // 栈式规则验证
    await this.enforceStackRule('vmaEmployeeDepartment', assignment.employeeId, assignmentId);

    const data: any = {};
    if (dto.assignedAt) data.assignedAt = parsePacificDate(dto.assignedAt);
    if (dto.removedAt) data.removedAt = parsePacificDate(dto.removedAt);

    return this.prisma.vmaEmployeeDepartment.update({
      where: { id: assignmentId },
      data,
      include: { department: true },
    });
  }

  /**
   * 删除部门分配记录（栈式规则：仅最近一条）
   */
  async deleteDepartmentAssignment(assignmentId: string) {
    const assignment = await this.prisma.vmaEmployeeDepartment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException(`Assignment ${assignmentId} not found`);

    // 栈式规则验证
    await this.enforceStackRule('vmaEmployeeDepartment', assignment.employeeId, assignmentId);

    await this.prisma.vmaEmployeeDepartment.delete({ where: { id: assignmentId } });
    return { success: true, id: assignmentId };
  }

  /**
   * 栈式编辑规则: 只允许修改/删除最近一条记录
   */
  private async enforceStackRule(model: string, parentId: string, targetId: string) {
    let records: any[];
    if (model === 'vmaEmployeeDepartment') {
      records = await this.prisma.vmaEmployeeDepartment.findMany({
        where: { employeeId: parentId },
        orderBy: { assignedAt: 'desc' },
      });
    } else {
      throw new Error(`Unknown model: ${model}`);
    }

    if (records.length === 0) return;
    if (records[0].id !== targetId) {
      throw new ForbiddenException('Only the most recent record can be modified. Delete newer records first.');
    }
  }

  // ================================
  // Department CRUD
  // ================================

  /**
   * 获取所有部门 (使用新关联计数)
   */
  async findAllDepartments() {
    return this.prisma.vmaDepartment.findMany({
      include: {
        _count: { select: { employeeAssignments: true } },
        sopRequirements: true,
      },
      orderBy: [{ code: 'asc' }, { duties: 'asc' }],
    });
  }

  /**
   * 创建部门
   */
  async createDepartment(dto: CreateDepartmentDto) {
    const existing = await this.prisma.vmaDepartment.findUnique({
      where: { code_duties: { code: dto.code, duties: dto.duties } },
    });
    if (existing) {
      throw new ConflictException(`Department code "${dto.code}" with duty "${dto.duties}" already exists`);
    }

    return this.prisma.vmaDepartment.create({
      data: {
        code: dto.code,
        name: dto.name,
        duties: dto.duties,
        sopTrainingReq: dto.sopTrainingReq || null,
      },
      include: { _count: { select: { employeeAssignments: true } } },
    });
  }

  /**
   * 更新部门
   */
  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.vmaDepartment.findUnique({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`Department ${id} not found`);
    }

    const newCode = dto.code || dept.code;
    const newDuties = dto.duties || dept.duties;
    if (dto.code || dto.duties) {
      const existing = await this.prisma.vmaDepartment.findFirst({
        where: { code: newCode, duties: newDuties, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Department code "${newCode}" with duty "${newDuties}" already exists`);
      }
    }

    return this.prisma.vmaDepartment.update({
      where: { id },
      data: dto,
      include: { _count: { select: { employeeAssignments: true } } },
    });
  }

  /**
   * 软删除部门 (有员工分配时禁止删除, 保留审计追踪)
   */
  async deleteDepartment(id: string) {
    const dept = await this.prisma.vmaDepartment.findUnique({
      where: { id },
      include: { _count: { select: { employeeAssignments: true } } },
    });
    if (!dept) {
      throw new NotFoundException(`Department ${id} not found`);
    }
    if (dept._count.employeeAssignments > 0) {
      throw new ConflictException(`Cannot delete department with ${dept._count.employeeAssignments} employee assignments (active or historical)`);
    }
    await this.prisma.vmaDepartment.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { success: true, id };
  }

  // ================================
  // Duty SOP Requirements + History
  // ================================

  /**
   * 获取某个职责的 SOP 培训需求列表
   */
  async getDutySopRequirements(dutyId: string) {
    const dept = await this.prisma.vmaDepartment.findUnique({ where: { id: dutyId } });
    if (!dept) throw new NotFoundException(`Department ${dutyId} not found`);

    const reqs = await this.prisma.vmaDutySopRequirement.findMany({
      where: { dutyId },
      orderBy: { createdAt: 'asc' },
    });
    return reqs.map((r: any) => r.sopNo);
  }

  /**
   * 更新某个职责的 SOP 培训需求 (差异对比 + 生成历史记录)
   */
  async updateDutySopRequirements(dutyId: string, dto: UpdateSopRequirementsDto) {
    const dept = await this.prisma.vmaDepartment.findUnique({ where: { id: dutyId } });
    if (!dept) throw new NotFoundException(`Department ${dutyId} not found`);

    const unique = [...new Set(dto.sopNos)];
    const changeDate = parsePacificDate(dto.changeDate);

    // ===== 日期校验: 不得早于或等于最后一个历史日期 =====
    const latestHistory = await this.prisma.vmaDutySopHistory.findFirst({
      where: { departmentId: dutyId },
      orderBy: { changeDate: 'desc' },
    });
    if (latestHistory && changeDate <= latestHistory.changeDate) {
      throw new BadRequestException(
        `Change date must be after the latest history date (${latestHistory.changeDate.toISOString().slice(0, 10)})`,
      );
    }

    // 获取当前 SOP 列表
    const currentReqs = await this.prisma.vmaDutySopRequirement.findMany({
      where: { dutyId },
    });
    const currentSopNos = new Set(currentReqs.map((r: any) => r.sopNo));
    const newSopNos = new Set(unique);

    // 计算差异
    const added = unique.filter((s) => !currentSopNos.has(s));
    const removed = [...currentSopNos].filter((s) => !newSopNos.has(s));

    // 生成历史记录
    const historyRecords: any[] = [];
    for (const sopNo of added) {
      historyRecords.push({ departmentId: dutyId, changeDate, changeType: 'ADD', sopNo });
    }
    for (const sopNo of removed) {
      historyRecords.push({ departmentId: dutyId, changeDate, changeType: 'REMOVE', sopNo });
    }

    // 执行事务
    await this.prisma.$transaction([
      // 更新需求表（全量替换）
      this.prisma.vmaDutySopRequirement.deleteMany({ where: { dutyId } }),
      ...unique.map((sopNo) =>
        this.prisma.vmaDutySopRequirement.create({ data: { dutyId, sopNo } }),
      ),
      // 写入历史记录
      ...historyRecords.map((h) =>
        this.prisma.vmaDutySopHistory.create({ data: h }),
      ),
    ]);

    return { dutyId, sopNos: unique, count: unique.length, added, removed };
  }

  /**
   * 获取职责 SOP 变更历史
   */
  async getDutySopHistory(dutyId: string) {
    const dept = await this.prisma.vmaDepartment.findUnique({ where: { id: dutyId } });
    if (!dept) throw new NotFoundException(`Department ${dutyId} not found`);

    const history = await this.prisma.vmaDutySopHistory.findMany({
      where: { departmentId: dutyId },
      orderBy: { changeDate: 'asc' },
    });

    // SOP名称查找表
    const sopNos: string[] = [...new Set((history as any[]).map((h: any) => h.sopNo))];
    const sops = await this.prisma.vmaTrainingSop.findMany({
      where: { sopNo: { in: sopNos } },
      distinct: ['sopNo'],
    });
    const sopNameMap = new Map(sops.map(s => [s.sopNo, s.name]));

    // 按 changeDate 分组
    const grouped = new Map<string, any[]>();
    for (const h of history) {
      const key = h.changeDate.toISOString();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(h);
    }

    return Array.from(grouped.entries()).map(([date, records]) => ({
      changeDate: date,
      changeType: records[0].changeType === 'INITIAL' ? 'INITIAL' : 'CHANGE',
      changes: records.map((r: any) => ({
        id: r.id,
        changeType: r.changeType,
        sopNo: r.sopNo,
        sopName: sopNameMap.get(r.sopNo) || r.sopNo,
      })),
    }));
  }

  /**
   * 编辑 SOP 历史记录（栈式规则：仅最近一组）
   */
  async updateSopHistory(historyId: string, dto: UpdateSopHistoryDto) {
    const record = await this.prisma.vmaDutySopHistory.findUnique({ where: { id: historyId } });
    if (!record) throw new NotFoundException(`SOP history record ${historyId} not found`);

    // 栈式规则
    await this.enforceSopHistoryStackRule(record.departmentId, historyId);

    const data: any = {};
    if (dto.changeDate) data.changeDate = parsePacificDate(dto.changeDate);
    if (dto.changeType) data.changeType = dto.changeType;
    if (dto.sopNo) data.sopNo = dto.sopNo;

    return this.prisma.vmaDutySopHistory.update({ where: { id: historyId }, data });
  }

  /**
   * 删除 SOP 历史记录（栈式规则：仅最近一组）
   */
  async deleteSopHistory(historyId: string) {
    const record = await this.prisma.vmaDutySopHistory.findUnique({ where: { id: historyId } });
    if (!record) throw new NotFoundException(`SOP history record ${historyId} not found`);

    await this.enforceSopHistoryStackRule(record.departmentId, historyId);

    await this.prisma.vmaDutySopHistory.delete({ where: { id: historyId } });
    return { success: true, id: historyId };
  }

  /**
   * SOP 历史栈式规则: 只允许修改最近一个日期分组的记录
   */
  private async enforceSopHistoryStackRule(departmentId: string, targetId: string) {
    const allHistory = await this.prisma.vmaDutySopHistory.findMany({
      where: { departmentId },
      orderBy: { changeDate: 'desc' },
    });

    if (allHistory.length === 0) return;

    // 找到最近日期的所有记录
    const latestDate = allHistory[0].changeDate.getTime();
    const latestGroup = allHistory.filter((h) => h.changeDate.getTime() === latestDate);
    const isInLatestGroup = latestGroup.some((h) => h.id === targetId);

    if (!isInLatestGroup) {
      throw new ForbiddenException('Only the most recent history group can be modified. Delete newer records first.');
    }
  }
}
