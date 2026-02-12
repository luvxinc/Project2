import { IsString, IsOptional, IsDateString, IsInt, IsBoolean } from 'class-validator';

// ================================
// Training SOP DTOs (两表架构)
// ================================

/**
 * 创建 SOP 主文档 + 初始版本
 */
export class CreateTrainingSopDto {
  @IsInt()
  seqNo: number; // LCD 编号

  @IsString()
  sopNo: string; // SOP文件号 (唯一)

  @IsString()
  name: string; // SOP文件名字

  @IsOptional()
  @IsString()
  description?: string; // SOP描述

  @IsString()
  structureClassification: string; // 文件种类

  @IsString()
  documentType: string; // SOP种类

  // 初始版本信息
  @IsString()
  version: string; // 版本号 (Rev)

  @IsString()
  daNo: string; // 审批文件号 (DA-####)

  @IsDateString()
  effectiveDate: string; // 生效日期

  @IsOptional()
  @IsBoolean()
  trainingRequired?: boolean; // 初始版本是否需要培训 (default true)
}

/**
 * 添加新版本 (版本更新时 INSERT 新记录到版本表)
 */
export class AddSopVersionDto {
  @IsString()
  version: string; // 新版本号

  @IsString()
  daNo: string; // 审批文件号 (DA-####)

  @IsDateString()
  effectiveDate: string; // 生效日期

  @IsOptional()
  @IsBoolean()
  trainingRequired?: boolean; // 此版本是否需要培训 (default true)
}

/**
 * 更新 SOP 主文档信息 (不影响版本历史)
 */
export class UpdateTrainingSopDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  structureClassification?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  // 版本级别字段 (更新最新版本)
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  daNo?: string;

  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @IsOptional()
  trainingRequired?: boolean;
}
