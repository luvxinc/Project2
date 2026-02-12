/**
 * Users Controller - 用户管理 API 端点
 * 
 * 所有端点都需要认证 (JWT)
 * 敏感操作需要安全码验证 (SecurityLevel Guard)
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdatePermissionsDto,
  ResetPasswordDto,
  ChangeOwnPasswordDto,
  DeleteUserDto,
  UserQueryDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireSecurityLevel } from '../auth/decorators/security-level.decorator';
import { SecurityLevelGuard } from '../auth/guards/security-level.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    userId: string;
    username: string;
    roles?: string[];
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logWriter: LogWriterService,
  ) {}

  /**
   * 提取客户端 IP 地址
   * 支持代理头 (X-Forwarded-For, X-Real-IP)
   */
  private extractClientIp(req: AuthenticatedRequest): string {
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
   * 获取用户列表
   * GET /users
   * 权限: staff 及以上
   */
  @Get()
  @Roles('staff', 'admin', 'superuser')
  async findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll({
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
      search: query.search,
    });
  }

  /**
   * 获取单个用户
   * GET /users/:id
   * 权限: staff 及以上
   */
  @Get(':id')
  @Roles('staff', 'admin', 'superuser')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * 创建用户
   * POST /users
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Post()
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async create(@Body() dto: CreateUserDto, @Request() req: AuthenticatedRequest) {
    const result = await this.usersService.create(dto, req.user.userId);
    
    // 记录审计日志 - 创建用户是敏感操作
    this.logWriter.logAudit({
      context: {
        traceId: `user-create-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/users',
      },
      module: 'users',
      action: 'CREATE_USER',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      newValue: { username: dto.username, roles: dto.roles },
    });
    
    return result;
  }

  /**
   * 更新用户基本信息
   * PATCH /users/:id
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Patch(':id')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.usersService.update(id, dto, req.user.userId);
    
    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `user-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'PATCH',
        path: `/users/${id}`,
      },
      module: 'users',
      action: 'UPDATE_USER',
      summary: `更新了用户 ${id}`,
      entityType: 'User',
      entityId: id,
    });
    
    return result;
  }

  /**
   * 删除用户 (软删除)
   * DELETE /users/:id
   * 权限: admin 及以上
   * 安全等级: L3 (高风险)
   * 需要提供删除原因
   */
  @Delete(':id')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L3')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.usersService.delete(id, req.user.userId, dto.reason);
    
    // 记录审计日志 - 删除用户是高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `user-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'DELETE',
        path: `/users/${id}`,
      },
      module: 'users',
      action: 'DELETE_USER',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      details: { targetUserId: id, reason: dto.reason },
    });
  }

  /**
   * 锁定用户
   * POST /users/:id/lock
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Post(':id/lock')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async lock(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const result = await this.usersService.lock(id, req.user.userId);
    
    // 记录审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `user-lock-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: `/users/${id}/lock`,
      },
      module: 'users',
      action: 'LOCK_USER',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      details: { targetUserId: id },
    });
    
    return result;
  }

  /**
   * 解锁用户
   * POST /users/:id/unlock
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Post(':id/unlock')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async unlock(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const result = await this.usersService.unlock(id, req.user.userId);
    
    // 记录审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `user-unlock-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: `/users/${id}/unlock`,
      },
      module: 'users',
      action: 'UNLOCK_USER',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      details: { targetUserId: id },
    });
    
    return result;
  }

  /**
   * 更新用户权限
   * PATCH /users/:id/permissions
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Patch(':id/permissions')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.usersService.updatePermissions(id, dto, req.user.userId);
    
    // 记录审计日志 - 权限变更是高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `user-permissions-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'PATCH',
        path: `/users/${id}/permissions`,
      },
      module: 'users',
      action: 'UPDATE_PERMISSIONS',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      newValue: dto,
      details: { targetUserId: id },
    });
    
    return result;
  }

  /**
   * 重置用户密码 (管理员操作他人密码)
   * POST /users/:id/reset-password
   * 权限: admin 及以上
   * 安全等级: L2
   */
  @Post(':id/reset-password')
  @Roles('admin', 'superuser')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.usersService.resetPassword(id, dto.newPassword, req.user.userId);
    
    // 记录审计日志 - 密码重置是高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `user-reset-pwd-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: `/users/${id}/reset-password`,
      },
      module: 'users',
      action: 'RESET_PASSWORD',
      result: 'SUCCESS',
      riskLevel: 'CRITICAL',
      details: { targetUserId: id },
    });
    
    return result;
  }

  /**
   * 修改自己的密码 (需验证旧密码)
   * POST /users/me/change-password
   * 权限: 所有登录用户
   * 安全等级: L1 (仅需登录)
   */
  @Post('me/change-password')
  async changeOwnPassword(
    @Body() dto: ChangeOwnPasswordDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.usersService.changeOwnPassword(
      req.user.userId,
      dto.oldPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
    
    // 记录审计日志 - 密码修改
    this.logWriter.logAudit({
      context: {
        traceId: `user-change-pwd-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/users/me/change-password',
      },
      module: 'users',
      action: 'CHANGE_OWN_PASSWORD',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
    });
    
    return result;
  }
}
