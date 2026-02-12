import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma';
import { CacheService } from '../../common/redis';
import { AlertService } from '../../common/alert';
import type { SecurityLevel, SecurityVerifyRequest, SecurityVerifyResponse } from '@mgmt/shared';

/**
 * 安全验证服务
 * 处理 L2-L4 级别的安全码验证
 * 🔒 安全加固：每个安全等级3次失败后阻止30分钟
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly alertService: AlertService,
  ) {}

  /**
   * 验证安全码
   * 🔒 安全加固：每个安全等级3次失败后阻止30分钟
   */
  async verifySecurityCode(
    request: SecurityVerifyRequest,
    userId?: string,
  ): Promise<SecurityVerifyResponse> {
    const { securityLevel, securityCode, actionKey } = request;

    // 🔒 1. 检查是否已被阻止（仅当有 userId 时）
    if (userId && securityLevel !== 'L1') {
      const isBlocked = await this.cacheService.isSecurityBlocked(userId, securityLevel);
      if (isBlocked) {
        this.logger.warn(`🔒 Security verification blocked: user ${userId}, level ${securityLevel}`);
        throw new ForbiddenException({
          code: 'SECURITY_VERIFICATION_BLOCKED',
          message: `${securityLevel} 验证已被暂时阻止，请30分钟后重试`,
        });
      }
    }

    let isValid = false;

    switch (securityLevel) {
      case 'L1':
        // L1 只需要 Token，无需额外验证
        isValid = true;
        break;

      case 'L2':
        // L2 使用修改级密码
        isValid = await this.verifyL2Code(securityCode);
        break;

      case 'L3':
        // L3 使用运维级密码
        isValid = await this.verifyL3Code(securityCode);
        break;

      case 'L4':
        // L4 使用系统级密码
        isValid = await this.verifyL4Code(securityCode);
        break;

      default:
        throw new BadRequestException('无效的安全等级');
    }

    if (!isValid) {
      // 🔒 2. 记录失败并检查是否需要阻止（仅当有 userId 时）
      if (userId && securityLevel !== 'L1') {
        const { remainingAttempts, blocked } = await this.cacheService.recordSecurityFailure(userId, securityLevel);
        
        // 记录审计日志
        await this.logSecurityVerification(securityLevel, actionKey, false, userId);

        if (blocked) {
          // 🔔 发送安全码验证阻止告警
          this.alertService.alertSecurityCodeBlocked(userId, securityLevel).catch(() => {});
          
          throw new ForbiddenException({
            code: 'SECURITY_VERIFICATION_BLOCKED',
            message: `验证失败次数过多，${securityLevel} 验证已被阻止30分钟`,
          });
        }

        throw new BadRequestException({
          code: 'INVALID_SECURITY_CODE',
          message: `安全验证码错误 (剩余 ${remainingAttempts} 次尝试)`,
          remainingAttempts,
        });
      }

      throw new BadRequestException({
        code: 'INVALID_SECURITY_CODE',
        message: '安全验证码错误',
      });
    }

    // 🔒 3. 验证成功，清除失败计数
    if (userId && securityLevel !== 'L1') {
      await this.cacheService.clearSecurityFailures(userId, securityLevel);
    }

    // 生成一个临时安全令牌 (5分钟有效)
    const securityToken = this.generateSecurityToken();
    const validUntil = new Date(Date.now() + 5 * 60 * 1000);

    // 记录安全验证日志
    await this.logSecurityVerification(securityLevel, actionKey, true, userId);

    // 🔔 L3/L4 使用告警
    if (securityLevel === 'L3' && userId) {
      this.alertService.alertSecurityL3Used(userId, actionKey).catch(() => {});
    } else if (securityLevel === 'L4' && userId) {
      this.alertService.alertSecurityL4Used(userId, actionKey).catch(() => {});
    }

    return {
      verified: true,
      validUntil,
      securityToken,
    };
  }

  /**
   * 验证 L2 级安全码 (修改级)
   */
  private async verifyL2Code(code: string): Promise<boolean> {
    const expectedCode = this.configService.get<string>('SEC_CODE_L2', 'SEC_CODE_MODIFY');
    
    // 也检查数据库中的配置
    const dbCode = await this.getSecurityCodeFromDb('L2');
    
    if (dbCode) {
      return await bcrypt.compare(code, dbCode);
    }
    
    return code === expectedCode;
  }

  /**
   * 验证 L3 级安全码 (运维级)
   */
  private async verifyL3Code(code: string): Promise<boolean> {
    const expectedCode = this.configService.get<string>('SEC_CODE_L3', 'SEC_CODE_DB');
    
    const dbCode = await this.getSecurityCodeFromDb('L3');
    
    if (dbCode) {
      return await bcrypt.compare(code, dbCode);
    }
    
    return code === expectedCode;
  }

  /**
   * 验证 L4 级安全码 (系统级)
   */
  private async verifyL4Code(code: string): Promise<boolean> {
    const expectedCode = this.configService.get<string>('SEC_CODE_L4', 'SEC_CODE_SYSTEM');
    
    const dbCode = await this.getSecurityCodeFromDb('L4');
    
    if (dbCode) {
      return await bcrypt.compare(code, dbCode);
    }
    
    return code === expectedCode;
  }

  /**
   * 从数据库获取安全码 (哈希值)
   */
  private async getSecurityCodeFromDb(level: string): Promise<string | null> {
    const record = await this.prisma.securityCode.findFirst({
      where: { level, isActive: true },
    });
    return record?.codeHash || null;
  }

  /**
   * 生成安全令牌
   */
  private generateSecurityToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 记录安全验证日志
   */
  private async logSecurityVerification(
    level: SecurityLevel,
    actionKey: string,
    success: boolean,
    userId?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: 'SECURITY_VERIFICATION',
        module: 'auth',
        entityType: 'security',
        userId: userId,
        details: {
          level,
          actionKey,
          success,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
