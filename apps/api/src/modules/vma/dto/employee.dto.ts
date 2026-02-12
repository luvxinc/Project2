import { IsString, IsOptional, IsDateString, IsEnum, IsUUID, IsInt, Min, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// ================================
// Employee DTOs
// ================================

export class CreateEmployeeDto {
  @IsString()
  employeeNo: string; // 工号

  @IsString()
  lastName: string; // 姓

  @IsString()
  firstName: string; // 名

  @IsArray()
  @IsString({ each: true })
  departmentIds: string[]; // 多个部门/职责 ID

  @IsDateString()
  hireDate: string; // 入职时间
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  employeeNo?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsDateString()
  terminationDate?: string; // 离职日期
}

export class ToggleEmployeeStatusDto {
  @IsOptional()
  @IsDateString()
  terminationDate?: string; // 停用时必填离职日期
}

// 员工-部门分配
export class AddDepartmentAssignmentDto {
  @IsString()
  departmentId: string;

  @IsDateString()
  assignedAt: string; // 用户填写分配日期
}

export class UpdateDepartmentAssignmentDto {
  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @IsOptional()
  @IsDateString()
  removedAt?: string;
}

export class RemoveDepartmentAssignmentDto {
  @IsDateString()
  removedAt: string; // 用户填写移除日期
}

export class EmployeeQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // 搜索工号/姓名

  @IsOptional()
  @IsString()
  departmentId?: string; // 按部门筛选

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

// ================================
// Department DTOs
// ================================

export class CreateDepartmentDto {
  @IsString()
  code: string; // 部门码

  @IsString()
  name: string;

  @IsString()
  duties: string; // 职责 (必填，与code组成联合唯一)

  @IsOptional()
  @IsString()
  sopTrainingReq?: string; // SOP培训需求
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  duties?: string;

  @IsOptional()
  @IsString()
  sopTrainingReq?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// SOP 需求变更
export class UpdateSopRequirementsDto {
  @IsArray()
  @IsString({ each: true })
  sopNos: string[]; // 新的完整 SOP 列表

  @IsDateString()
  changeDate: string; // 用户填写的变更日期
}

// SOP 历史编辑（栈式规则：仅限最近一条）
export class UpdateSopHistoryDto {
  @IsOptional()
  @IsDateString()
  changeDate?: string;

  @IsOptional()
  @IsString()
  changeType?: string;

  @IsOptional()
  @IsString()
  sopNo?: string;
}
