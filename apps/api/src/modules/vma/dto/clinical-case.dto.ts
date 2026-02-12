/**
 * Clinical Case DTOs — 临床案例验证
 *
 * 每个 DTO 严格等价于原 Controller 中的行内类型定义
 * 仅增加 class-validator 验证，不改变任何业务逻辑
 */
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---- 嵌套类型 ----

class CreateCaseItemDto {
  @IsEnum(['PVALVE', 'DELIVERY_SYSTEM'])
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';

  @IsString()
  specNo: string;

  @IsString()
  serialNo: string;

  @IsNumber()
  qty: number;

  @IsString()
  expDate: string;

  @IsOptional()
  @IsString()
  batchNo?: string;
}

class CompleteCaseItemDto {
  @IsString()
  txnId: string;

  @IsBoolean()
  returned: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  returnCondition?: number[];
}

// ---- 主 DTOs ----

/** POST /vma/clinical-cases — 创建临床案例 */
export class CreateClinicalCaseDto {
  @IsOptional()
  @IsString()
  caseNo?: string;

  @IsString()
  siteId: string;

  @IsString()
  patientId: string;

  @IsString()
  caseDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCaseItemDto)
  items: CreateCaseItemDto[];
}

/** PATCH /vma/clinical-cases/:caseId — 更新案例基本信息 */
export class UpdateClinicalCaseInfoDto {
  @IsOptional()
  @IsString()
  caseNo?: string;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  caseDate?: string;
}

/** PATCH /vma/clinical-cases/:caseId/items/:txnId — 更新案例产品 */
export class UpdateCaseItemDto {
  @IsOptional()
  @IsString()
  specNo?: string;

  @IsOptional()
  @IsString()
  serialNo?: string;

  @IsOptional()
  @IsNumber()
  qty?: number;

  @IsOptional()
  @IsString()
  expDate?: string;

  @IsOptional()
  @IsString()
  batchNo?: string;
}

/** POST /vma/clinical-cases/:caseId/items — 添加新产品 */
export class AddCaseItemDto {
  @IsString()
  productType: string;

  @IsString()
  specNo: string;

  @IsString()
  serialNo: string;

  @IsNumber()
  qty: number;

  @IsOptional()
  @IsString()
  expDate?: string;

  @IsOptional()
  @IsString()
  batchNo?: string;
}

/** POST /vma/case-pick-products — 自动拣货 */
export class PickProductsDto {
  @IsString()
  specNo: string;

  @IsNumber()
  qty: number;

  @IsString()
  caseDate: string;

  @IsEnum(['PVALVE', 'DELIVERY_SYSTEM'])
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
}

/** POST /vma/case-available-products — 可用产品查询 */
export class AvailableProductsDto {
  @IsString()
  specNo: string;

  @IsString()
  caseDate: string;

  @IsEnum(['PVALVE', 'DELIVERY_SYSTEM'])
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
}

/** POST /vma/clinical-cases/:caseId/complete — 完成案例 */
export class CompleteCaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteCaseItemDto)
  items: CompleteCaseItemDto[];
}
