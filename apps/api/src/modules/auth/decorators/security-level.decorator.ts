import { SetMetadata } from '@nestjs/common';
import type { SecurityLevel } from '@mgmt/shared';

export const SECURITY_LEVEL_KEY = 'securityLevel';

/**
 * 指定端点需要的安全等级
 * @param level 安全等级 (L1-L4)
 */
export const RequireSecurityLevel = (level: SecurityLevel) => 
  SetMetadata(SECURITY_LEVEL_KEY, level);
