import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import type { SecurityLevel } from '@mgmt/shared';

/**
 * 安全验证请求 DTO
 */
export class VerifySecurityDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['L1', 'L2', 'L3', 'L4'])
  securityLevel: SecurityLevel;

  @IsString()
  @IsNotEmpty()
  securityCode: string;

  @IsString()
  @IsNotEmpty()
  actionKey: string;
}
