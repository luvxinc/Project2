import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CacheService } from '../redis/cache.service';

/**
 * 🔒 IP 黑名单守卫
 * 
 * 检查请求 IP 是否在黑名单中
 * 应用于全局，在所有其他守卫之前执行
 * 
 * 使用方式:
 * 1. 全局启用: app.module.ts 中添加 APP_GUARD
 * 2. 路由级别: @UseGuards(IpBlacklistGuard)
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
  private readonly logger = new Logger(IpBlacklistGuard.name);

  constructor(private readonly cacheService: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientIp = this.extractClientIp(request);

    // 检查 IP 是否在黑名单
    const isBlacklisted = await this.cacheService.isIpBlacklisted(clientIp);

    if (isBlacklisted) {
      const remainingTime = await this.cacheService.getIpBlacklistTTL(clientIp);
      this.logger.warn(`🚫 Blocked request from blacklisted IP: ${clientIp}`);

      throw new ForbiddenException({
        code: 'IP_BLOCKED',
        message: 'Your IP has been temporarily blocked due to suspicious activity',
        remainingSeconds: remainingTime,
      });
    }

    return true;
  }

  /**
   * 提取客户端 IP 地址
   * 支持代理头 (X-Forwarded-For, X-Real-IP)
   */
  private extractClientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp;
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
