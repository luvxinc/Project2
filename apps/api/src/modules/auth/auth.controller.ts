import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Ip,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto, VerifySecurityDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { LogWriterService } from '../../common/logging/log-writer.service';
import type { ApiResponse, LoginResponse, RefreshResponse, User, SecurityVerifyResponse } from '@mgmt/shared';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    userId: string;
    username: string;
    roles?: string[];
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly securityService: SecurityService,
    private readonly logWriter: LogWriterService,
  ) {}

  /**
   * 提取客户端 IP 地址
   */
  private extractClientIp(req: ExpressRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /**
   * POST /api/v1/auth/login
   * 用户登录
   * 
   * 🔒 限流: 每分钟最多 5 次 (防止暴力破解)
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Request() req: ExpressRequest,
  ): Promise<ApiResponse<LoginResponse>> {
    const ipAddress = this.extractClientIp(req);
    
    try {
      const result = await this.authService.login(dto);
      
      // 记录登录成功审计日志
      this.logWriter.logAudit({
        context: {
          traceId: `login-${Date.now()}`,
          userId: result.user.id,
          username: result.user.username,
          ipAddress,
          method: 'POST',
          path: '/auth/login',
        },
        module: 'auth',
        action: 'LOGIN',
        result: 'SUCCESS',
        riskLevel: 'LOW',
      });
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      // 记录登录失败审计日志
      this.logWriter.logAudit({
        context: {
          traceId: `login-${Date.now()}`,
          userId: 'unknown',
          username: dto.username,
          ipAddress,
          method: 'POST',
          path: '/auth/login',
        },
        module: 'auth',
        action: 'LOGIN',
        result: 'DENIED',
        riskLevel: 'MEDIUM',
        details: { reason: 'Authentication failed' },
      });
      
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * 刷新 Access Token
   * 
   * 🔒 限流: 每分钟最多 10 次
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<ApiResponse<RefreshResponse>> {
    const result = await this.authService.refreshToken(dto);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * POST /api/v1/auth/logout
   * 用户登出
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: AuthenticatedRequest): Promise<ApiResponse<{ message: string }>> {
    await this.authService.logout(req.user.userId);
    
    // 记录登出审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `logout-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/auth/logout',
      },
      module: 'auth',
      action: 'LOGOUT',
      result: 'SUCCESS',
      riskLevel: 'LOW',
    });
    
    return {
      success: true,
      data: { message: '已成功登出' },
    };
  }

  /**
   * GET /api/v1/auth/me
   * 获取当前用户信息
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: AuthenticatedRequest): Promise<ApiResponse<User>> {
    const user = await this.authService.getCurrentUser(req.user.userId);
    return {
      success: true,
      data: user,
    };
  }

  /**
   * POST /api/v1/auth/change-password
   * 修改密码
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<{ message: string }>> {
    await this.authService.changePassword(req.user.userId, dto);
    
    // 记录密码修改审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `change-pwd-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/auth/change-password',
      },
      module: 'auth',
      action: 'CHANGE_PASSWORD',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
    });
    
    return {
      success: true,
      data: { message: '密码修改成功，请重新登录' },
    };
  }

  /**
   * POST /api/v1/auth/verify-security
   * 验证安全码 (用于 L2-L4 高危操作)
   * 
   * 🔒 限流: 每 5 分钟最多 3 次 (防止暴力猜测 L1-L4 安全码)
   */
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @UseGuards(JwtAuthGuard)
  @Post('verify-security')
  @HttpCode(HttpStatus.OK)
  async verifySecurity(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifySecurityDto,
  ): Promise<ApiResponse<SecurityVerifyResponse>> {
    try {
      // 🔒 传递 userId 用于安全码失败计数
      const result = await this.securityService.verifySecurityCode(dto, req.user.userId);
      
      // 记录安全码验证成功
      this.logWriter.logAudit({
        context: {
          traceId: `security-verify-${Date.now()}`,
          userId: req.user.userId,
          username: req.user.username,
          ipAddress: this.extractClientIp(req),
          method: 'POST',
          path: '/auth/verify-security',
        },
        module: 'auth',
        action: 'VERIFY_SECURITY_CODE',
        result: 'SUCCESS',
        riskLevel: 'MEDIUM',
        details: { securityLevel: dto.securityLevel, actionKey: dto.actionKey },
      });
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      // 记录安全码验证失败
      this.logWriter.logAudit({
        context: {
          traceId: `security-verify-${Date.now()}`,
          userId: req.user.userId,
          username: req.user.username,
          ipAddress: this.extractClientIp(req),
          method: 'POST',
          path: '/auth/verify-security',
        },
        module: 'auth',
        action: 'VERIFY_SECURITY_CODE',
        result: 'DENIED',
        riskLevel: 'HIGH',
        details: { securityLevel: dto.securityLevel, actionKey: dto.actionKey },
      });
      
      throw error;
    }
  }
}
