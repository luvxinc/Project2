/**
 * Products DTOs - 产品模块数据传输对象
 *
 * 验证规则:
 * - SKU: 大写字母/数字/下划线，3-50字符
 * - COGS: 0-999999.99 范围
 *
 * ⚠️ 安全码字段说明:
 * SecurityLevelGuard 从 body 读取 sec_code_lX 验证安全等级。
 * ValidationPipe (forbidNonWhitelisted: true) 要求所有 body 字段必须在 DTO 中声明。
 */
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  Max,
  Length,
  Matches,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 安全码字段 Mixin
 * Guard 在 ValidationPipe 之前提取这些值，此处仅做白名单声明
 */
class SecurityCodeFields {
  @IsOptional()
  @IsString()
  sec_code_l0?: string;

  @IsOptional()
  @IsString()
  sec_code_l1?: string;

  @IsOptional()
  @IsString()
  sec_code_l2?: string;

  @IsOptional()
  @IsString()
  sec_code_l3?: string;

  @IsOptional()
  @IsString()
  sec_code_l4?: string;
}

// ================================
// 查询 DTOs (无需安全码 - Query 参数)
// ================================

export class ProductQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

// ================================
// 创建 DTOs (安全等级: L2)
// ================================

export class CreateProductDto extends SecurityCodeFields {
  @IsString()
  @Length(3, 50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'SKU must be uppercase letters, numbers, underscores or hyphens',
  })
  sku: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  @Type(() => Number)
  cogs?: number;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  upc?: string;
}

export class BatchCreateProductDto extends SecurityCodeFields {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}

// ================================
// 更新 DTOs (安全等级: L2)
// ================================

export class UpdateProductDto extends SecurityCodeFields {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  @Type(() => Number)
  cogs?: number;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  upc?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateCogsDto {
  @IsUUID()
  id: string;

  @IsNumber()
  @Min(0)
  @Max(999999.99)
  @Type(() => Number)
  cogs: number;
}

export class BatchUpdateCogsDto extends SecurityCodeFields {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCogsDto)
  items: UpdateCogsDto[];
}

// ================================
// 条形码 DTOs (安全等级: L1 - 无需安全码)
// ================================

export class GenerateBarcodeDto {
  @IsArray()
  @IsString({ each: true })
  skus: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  copiesPerSku?: number = 1;

  @IsOptional()
  @IsEnum(['CODE128', 'EAN13', 'UPC'])
  format?: 'CODE128' | 'EAN13' | 'UPC' = 'CODE128';
}

