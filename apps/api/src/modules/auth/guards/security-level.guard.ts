import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SECURITY_LEVEL_KEY } from '../decorators/security-level.decorator';
import { SecurityPolicyService } from '../security-policy.service';
import type { SecurityLevel } from '@mgmt/shared';

/**
 * 安全等级守卫
 * 验证请求是否满足操作所需的安全等级
 * 
 * 支持两种验证方式:
 * 1. Header 传递: x-security-level, x-security-code
 * 2. Body 传递: sec_code_l0, sec_code_l1, sec_code_l2, sec_code_l3, sec_code_l4
 * 
 * 使用方式:
 * @UseGuards(SecurityLevelGuard)
 * @RequireSecurityLevel('L2')
 * async sensitiveOperation() { ... }
 */
@Injectable()
export class SecurityLevelGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private securityPolicyService: SecurityPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredLevel = this.reflector.getAllAndOverride<SecurityLevel>(
      SECURITY_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有指定安全等级要求，放行
    if (!requiredLevel) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // L1 只需要 Token 认证，已通过 JwtAuthGuard
    if (requiredLevel === 'L1') {
      return true;
    }

    // 获取用户 ID
    const userId = request.user?.userId || request.user?.sub;

    // 方式 1: 从 Header 读取
    const headerSecurityCode = request.headers['x-security-code'];
    
    // 方式 2: 从 Body 读取 (sec_code_lX 格式，兼容老系统)
    const body = request.body || {};
    
    // 构建验证数据
    const securityData: Record<string, string> = {};
    
    // 如果有 Header，转换为对应的 sec_code_lX
    if (headerSecurityCode) {
      const meta = this.securityPolicyService.getMetaForLevel(requiredLevel);
      if (meta) {
        securityData[meta.codeKey] = headerSecurityCode;
      }
    }
    
    // 合并 Body 中的安全码
    for (const key of ['sec_code_l0', 'sec_code_l1', 'sec_code_l2', 'sec_code_l3', 'sec_code_l4']) {
      if (body[key]) {
        securityData[key] = body[key];
      }
    }

    // 检查是否有任何安全码提供
    const hasSecurityCode = Object.keys(securityData).length > 0;
    
    if (!hasSecurityCode) {
      throw new BadRequestException({
        code: 'SECURITY_CODE_REQUIRED',
        message: `此操作需要 ${requiredLevel} 级安全验证`,
        requiredLevel,
        hint: `请在 Header 中提供 x-security-code 或在 Body 中提供 ${this.securityPolicyService.getMetaForLevel(requiredLevel)?.codeKey || 'sec_code_lX'}`,
      });
    }

    // 使用 SecurityPolicyService 验证
    const result = await this.securityPolicyService.verifySecurityLevel(
      requiredLevel,
      securityData,
      userId,
    );

    if (!result.valid) {
      throw new ForbiddenException({
        code: 'SECURITY_VERIFICATION_FAILED',
        message: result.message,
        requiredLevel,
      });
    }

    // 标记验证通过
    request.securityContext = {
      level: requiredLevel,
      verified: true,
    };

    return true;
  }
}
