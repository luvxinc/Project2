import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '@mgmt/shared';

/**
 * 🔒 JWT 策略 - 安全加固版
 * 
 * 安全特性:
 * 1. 强制要求 JWT_SECRET 环境变量 (无默认值)
 * 2. 最小密钥长度检查 (32 字符)
 * 3. 启动时失败 (fail-fast) 而非运行时降级
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    // 🔒 强制要求配置 JWT_SECRET - 无默认值
    if (!jwtSecret) {
      throw new Error(
        '🔴 FATAL: JWT_SECRET environment variable is required!\n' +
        'Generate a secure secret with: openssl rand -base64 64\n' +
        'Then add to .env.v2: JWT_SECRET=your_generated_secret'
      );
    }

    // 🔒 最小长度检查
    if (jwtSecret.length < 32) {
      throw new Error(
        '🔴 FATAL: JWT_SECRET is too short (minimum 32 characters)!\n' +
        'Current length: ' + jwtSecret.length + '\n' +
        'Generate a secure secret with: openssl rand -base64 64'
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    this.logger.log('✅ JWT Strategy initialized with secure secret');
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
