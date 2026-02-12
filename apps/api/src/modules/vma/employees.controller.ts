/**
 * VMA Employees Controller - 员工管理 API
 *
 * 端点:
 *   GET    /vma/employees                    - 员工列表
 *   GET    /vma/employees/:id                - 单个员工 (含职业生涯)
 *   POST   /vma/employees                    - 创建员工
 *   PATCH  /vma/employees/:id                - 更新员工
 *   PATCH  /vma/employees/:id/toggle         - 切换状态 (含离职日期)
 *   DELETE /vma/employees/:id                - 删除员工
 *
 *   POST   /vma/employees/:id/departments         - 添加部门分配
 *   PATCH  /vma/employee-departments/:id           - 编辑分配记录 (栈式)
 *   PATCH  /vma/employee-departments/:id/remove    - 移除部门分配 (设 removedAt)
 *   DELETE /vma/employee-departments/:id           - 删除分配记录 (栈式)
 *
 *   GET    /vma/departments                       - 部门列表
 *   POST   /vma/departments                       - 创建部门
 *   PATCH  /vma/departments/:id                   - 更新部门
 *   DELETE /vma/departments/:id                   - 删除部门
 *
 *   GET    /vma/departments/:id/sop-requirements  - 职责SOP培训需求
 *   PUT    /vma/departments/:id/sop-requirements  - 更新职责SOP培训需求 (含变更日期)
 *   GET    /vma/departments/:id/sop-history       - SOP变更历史
 *   PATCH  /vma/duty-sop-history/:id              - 编辑历史记录 (栈式)
 *   DELETE /vma/duty-sop-history/:id              - 删除历史记录 (栈式)
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeQueryDto,
  ToggleEmployeeStatusDto,
  AddDepartmentAssignmentDto,
  UpdateDepartmentAssignmentDto,
  RemoveDepartmentAssignmentDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  UpdateSopRequirementsDto,
  UpdateSopHistoryDto,
} from './dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { Request as ExpressRequest } from 'express';
import { extractClientIp } from './vma-shared.util';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly logWriter: LogWriterService,
  ) {}



  // ================================
  // Employee Endpoints
  // ================================

  @Get('employees')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async findAllEmployees(@Query() query: EmployeeQueryDto) {
    return this.employeesService.findAllEmployees(query);
  }

  @Get('employees/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async findOneEmployee(@Param('id') id: string) {
    return this.employeesService.findOneEmployee(id);
  }

  @Post('employees')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @Body() dto: CreateEmployeeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.createEmployee(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-emp-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/employees',
      },
      module: 'vma',
      action: 'CREATE_EMPLOYEE',
      summary: `Created employee: ${result.employeeNo} ${result.lastName} ${result.firstName}`,
      entityType: 'VmaEmployee',
      entityId: result.id,
    });

    return result;
  }

  @Patch('employees/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.updateEmployee(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-emp-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/employees/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_EMPLOYEE',
      summary: `Updated employee: ${result.employeeNo}`,
      entityType: 'VmaEmployee',
      entityId: id,
    });

    return result;
  }

  @Patch('employees/:id/toggle')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async toggleEmployeeStatus(
    @Param('id') id: string,
    @Body() dto: ToggleEmployeeStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.toggleEmployeeStatus(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-emp-toggle-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/employees/${id}/toggle`,
      },
      module: 'vma',
      action: 'TOGGLE_EMPLOYEE_STATUS',
      summary: `Employee ${result.employeeNo} status → ${result.status}${result.terminationDate ? ' (terminated: ' + result.terminationDate + ')' : ''}`,
      entityType: 'VmaEmployee',
      entityId: id,
    });

    return result;
  }

  @Delete('employees/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.OK)
  async deleteEmployee(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const employee = await this.employeesService.findOneEmployee(id);
    const result = await this.employeesService.deleteEmployee(id);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-emp-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/employees/${id}`,
      },
      module: 'vma',
      action: 'DELETE_EMPLOYEE',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      oldValue: employee,
      newValue: null,
    });

    return result;
  }

  // ================================
  // Employee-Department Assignments
  // ================================

  @Post('employees/:id/departments')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.CREATED)
  async addDepartmentAssignment(
    @Param('id') employeeId: string,
    @Body() dto: AddDepartmentAssignmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.addDepartmentAssignment(employeeId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-assign-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: `/vma/employees/${employeeId}/departments`,
      },
      module: 'vma',
      action: 'ADD_DEPARTMENT_ASSIGNMENT',
      summary: `Assigned employee to dept ${result.department.code} - ${result.department.duties} from ${dto.assignedAt}`,
      entityType: 'VmaEmployeeDepartment',
      entityId: result.id,
    });

    return result;
  }

  @Patch('employee-departments/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async updateDepartmentAssignment(
    @Param('id') assignmentId: string,
    @Body() dto: UpdateDepartmentAssignmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.updateDepartmentAssignment(assignmentId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-assign-edit-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/employee-departments/${assignmentId}`,
      },
      module: 'vma',
      action: 'UPDATE_DEPARTMENT_ASSIGNMENT',
      summary: `Updated department assignment ${assignmentId}`,
      entityType: 'VmaEmployeeDepartment',
      entityId: assignmentId,
    });

    return result;
  }

  @Patch('employee-departments/:id/remove')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async removeDepartmentAssignment(
    @Param('id') assignmentId: string,
    @Body() dto: RemoveDepartmentAssignmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.removeDepartmentAssignment(assignmentId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-assign-remove-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/employee-departments/${assignmentId}/remove`,
      },
      module: 'vma',
      action: 'REMOVE_DEPARTMENT_ASSIGNMENT',
      summary: `Removed from dept ${result.department.code} on ${dto.removedAt}`,
      entityType: 'VmaEmployeeDepartment',
      entityId: assignmentId,
    });

    return result;
  }

  @Delete('employee-departments/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.OK)
  async deleteDepartmentAssignment(
    @Param('id') assignmentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.deleteDepartmentAssignment(assignmentId);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-dept-assign-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/employee-departments/${assignmentId}`,
      },
      module: 'vma',
      action: 'DELETE_DEPARTMENT_ASSIGNMENT',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      oldValue: null,
      newValue: null,
    });

    return result;
  }

  // ================================
  // Department Endpoints
  // ================================

  @Get('departments')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async findAllDepartments() {
    return this.employeesService.findAllDepartments();
  }

  @Post('departments')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  @HttpCode(HttpStatus.CREATED)
  async createDepartment(
    @Body() dto: CreateDepartmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.createDepartment(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/departments',
      },
      module: 'vma',
      action: 'CREATE_DEPARTMENT',
      summary: `Created department: ${result.name}`,
      entityType: 'VmaDepartment',
      entityId: result.id,
    });

    return result;
  }

  @Patch('departments/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.updateDepartment(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/departments/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_DEPARTMENT',
      summary: `Updated department: ${result.name}`,
      entityType: 'VmaDepartment',
      entityId: id,
    });

    return result;
  }

  @Delete('departments/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  @HttpCode(HttpStatus.OK)
  async deleteDepartment(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.deleteDepartment(id);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-dept-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/departments/${id}`,
      },
      module: 'vma',
      action: 'DELETE_DEPARTMENT',
      summary: `Deleted department ID: ${id}`,
      entityType: 'VmaDepartment',
      entityId: id,
    });

    return result;
  }

  // ================================
  // Duty SOP Requirements + History
  // ================================

  @Get('departments/:id/sop-requirements')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async getDutySopRequirements(@Param('id') id: string) {
    return this.employeesService.getDutySopRequirements(id);
  }

  @Put('departments/:id/sop-requirements')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async updateDutySopRequirements(
    @Param('id') id: string,
    @Body() dto: UpdateSopRequirementsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.updateDutySopRequirements(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-duty-sop-req-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PUT',
        path: `/vma/departments/${id}/sop-requirements`,
      },
      module: 'vma',
      action: 'UPDATE_DUTY_SOP_REQUIREMENTS',
      summary: `Updated SOP requirements for duty ${id}: ${result.count} SOPs (added: ${result.added.length}, removed: ${result.removed.length})`,
      entityType: 'VmaDepartment',
      entityId: id,
    });

    return result;
  }

  @Get('departments/:id/sop-history')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async getDutySopHistory(@Param('id') id: string) {
    return this.employeesService.getDutySopHistory(id);
  }

  @Patch('duty-sop-history/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  async updateSopHistory(
    @Param('id') id: string,
    @Body() dto: UpdateSopHistoryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.updateSopHistory(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-sop-hist-edit-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/duty-sop-history/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_SOP_HISTORY',
      summary: `Updated SOP history record ${id}`,
      entityType: 'VmaDutySopHistory',
      entityId: id,
    });

    return result;
  }

  @Delete('duty-sop-history/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.departments.manage')
  @HttpCode(HttpStatus.OK)
  async deleteSopHistory(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.employeesService.deleteSopHistory(id);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-sop-hist-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/duty-sop-history/${id}`,
      },
      module: 'vma',
      action: 'DELETE_SOP_HISTORY',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      oldValue: null,
      newValue: null,
    });

    return result;
  }
}
