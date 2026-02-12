/**
 * Site DTOs — 站点管理验证
 *
 * 从 site.controller.ts 迁移至独立 DTO 文件
 */
import { IsString, IsOptional } from 'class-validator';

/** POST /vma/sites — 创建站点 */
export class CreateSiteDto {
  @IsString()
  siteId: string;

  @IsString()
  siteName: string;

  @IsString()
  address: string;

  @IsOptional() @IsString()
  address2?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zipCode: string;

  @IsString()
  country: string;
}

/** PATCH /vma/sites/:siteId — 更新站点 */
export class UpdateSiteDto {
  @IsOptional() @IsString()
  siteName?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsString()
  address2?: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsString()
  state?: string;

  @IsOptional() @IsString()
  zipCode?: string;

  @IsOptional() @IsString()
  country?: string;
}
