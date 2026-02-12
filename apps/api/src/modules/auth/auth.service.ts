import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma';
import { CacheService } from '../../common/redis';
import { AlertService } from '../../common/alert';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto';
import type { User, JwtPayload, LoginResponse, RefreshResponse } from '@mgmt/shared';

// 错误码常量 (前端使用这些 code 进行 i18n 翻译)
export const AuthErrorCodes = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  ACCOUNT_STATUS_ERROR: 'ACCOUNT_STATUS_ERROR',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CURRENT_PASSWORD_WRONG: 'CURRENT_PASSWORD_WRONG',
  PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
  PASSWORD_SAME_AS_OLD: 'PASSWORD_SAME_AS_OLD',
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly alertService: AlertService,
  ) {}

  /**
   * 验证用户凭据
   */
  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return null;
    }

    // 检查账户状态
    if (user.status === 'DISABLED') {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.ACCOUNT_DISABLED,
        message: '账户已禁用',
      });
    }
    if (user.status === 'LOCKED') {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.ACCOUNT_LOCKED,
        message: '账户已锁定',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    return this.mapUserToDto(user);
  }

  /**
   * 用户登录
   * 单设备登录：新登录会踢掉之前的所有 session
   * 🔒 安全加固：5次失败后锁定15分钟
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const { username, password } = dto;

    // 🔒 1. 检查账户是否被锁定
    const isLocked = await this.cacheService.isAccountLocked(username);
    if (isLocked) {
      const remainingTime = await this.cacheService.getAccountLockTTL(username);
      this.logger.warn(`🔒 Login blocked for locked account: ${username}`);
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.ACCOUNT_LOCKED,
        message: `账户已锁定，请在 ${Math.ceil(remainingTime / 60)} 分钟后重试`,
        remainingSeconds: remainingTime,
      });
    }

    // 2. 验证用户凭据
    const user = await this.validateUser(username, password);

    if (!user) {
      // 🔒 3. 记录登录失败并检查是否需要锁定
      const { remainingAttempts, locked } = await this.cacheService.recordLoginFailure(username);

      if (locked) {
        // 🔔 发送账户锁定告警
        this.alertService.alertAccountLocked(username, 'Too many failed login attempts').catch(() => {});
        
        throw new UnauthorizedException({
          errorCode: AuthErrorCodes.ACCOUNT_LOCKED,
          message: '登录失败次数过多，账户已锁定 15 分钟',
          remainingSeconds: 15 * 60,
        });
      }

      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.INVALID_CREDENTIALS,
        message: `用户名或密码错误 (剩余 ${remainingAttempts} 次尝试)`,
        remainingAttempts,
      });
    }

    // 🔒 4. 登录成功，清除失败计数
    await this.cacheService.clearLoginFailures(username);

    // 撤销该用户之前的所有 refresh tokens (单设备登录)
    // 这意味着在别处登录会踢掉当前 session
    await this.prisma.refreshToken.updateMany({
      where: { 
        userId: user.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // 清除旧的 Redis 缓存（踢掉之前的 session）
    await this.cacheService.clearSession(user.id);
    await this.cacheService.invalidateUserPermissions(user.id);

    // 生成新的 tokens
    const tokens = await this.generateTokens(user);

    // 缓存用户权限到 Redis（5分钟 TTL）
    // 这样后续请求可以直接从 Redis 读取权限，不需要解析 JWT
    const permissionKeys = this.flattenPermissions(user.permissions);
    await this.cacheService.setUserPermissions(user.id, permissionKeys);
    
    // 缓存用户会话信息（6小时 TTL）
    await this.cacheService.setSession(user.id, {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      loginAt: new Date().toISOString(),
    });

    // 更新最后登录时间
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User ${user.username} logged in, permissions cached to Redis`);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * 刷新 Access Token
   */
  async refreshToken(dto: RefreshTokenDto): Promise<RefreshResponse> {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!refreshToken) {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.INVALID_REFRESH_TOKEN,
        message: '无效的 Refresh Token',
      });
    }

    // 检查是否过期或已撤销
    if (refreshToken.expiresAt < new Date() || refreshToken.revokedAt) {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.REFRESH_TOKEN_EXPIRED,
        message: 'Refresh Token 已过期或已撤销',
      });
    }

    // 检查用户状态
    if (refreshToken.user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.ACCOUNT_STATUS_ERROR,
        message: '账户状态异常',
      });
    }

    const user = this.mapUserToDto(refreshToken.user);
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      expiresIn: this.configService.get<number>('JWT_ACCESS_EXPIRATION', 21600), // 6小时
    };
  }

  /**
   * 用户登出
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // 撤销指定的 refresh token
      await this.prisma.refreshToken.updateMany({
        where: { 
          userId,
          token: refreshToken,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      // 撤销用户所有 refresh tokens
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
    }

    // 清除 Redis 缓存
    await this.cacheService.clearSession(userId);
    await this.cacheService.invalidateUserPermissions(userId);
    
    this.logger.log(`User ${userId} logged out, Redis cache cleared`);
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException({
        errorCode: AuthErrorCodes.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException({
        errorCode: AuthErrorCodes.CURRENT_PASSWORD_WRONG,
        message: '当前密码错误',
      });
    }

    // 验证新密码确认
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException({
        errorCode: AuthErrorCodes.PASSWORD_MISMATCH,
        message: '两次输入的密码不一致',
      });
    }

    // 验证新密码不能与旧密码相同
    const isSameAsOld = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSameAsOld) {
      throw new BadRequestException({
        errorCode: AuthErrorCodes.PASSWORD_SAME_AS_OLD,
        message: '新密码不能与旧密码相同',
      });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    // 撤销所有 refresh tokens (强制重新登录)
    await this.logout(userId);
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        errorCode: AuthErrorCodes.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    return this.mapUserToDto(user);
  }

  // =====================
  // Private Methods
  // =====================

  private generateAccessToken(user: User): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: user.id,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    };

    return this.jwtService.sign(payload);
  }

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const accessToken = this.generateAccessToken(user);
    
    // 生成 refresh token
    const refreshTokenValue = this.generateRefreshTokenValue();
    const refreshExpiration = this.configService.get<number>('JWT_REFRESH_EXPIRATION', 604800);
    
    // 保存到数据库
    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: user.id,
        expiresAt: new Date(Date.now() + refreshExpiration * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: this.configService.get<number>('JWT_ACCESS_EXPIRATION', 21600), // 6小时
    };
  }

  private generateRefreshTokenValue(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private mapUserToDto(user: any): User {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles || [],
      permissions: user.permissions || {},
      status: user.status,
      settings: user.settings || { language: 'en', timezone: 'UTC' },
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 将嵌套的权限对象转换为平面字符串数组
   * 例如: { modules: { users: { list: ['read', 'write'] } } }
   * 转换为: ['module.users.list.read', 'module.users.list.write']
   */
  private flattenPermissions(permissions: any): string[] {
    const result: string[] = [];
    
    if (!permissions || !permissions.modules) {
      return result;
    }

    const modules = permissions.modules;
    for (const moduleName of Object.keys(modules)) {
      const modulePerms = modules[moduleName];
      for (const submodule of Object.keys(modulePerms)) {
        const actions = modulePerms[submodule];
        if (Array.isArray(actions)) {
          for (const action of actions) {
            result.push(`module.${moduleName}.${submodule}.${action}`);
          }
        }
      }
    }

    return result;
  }
}
