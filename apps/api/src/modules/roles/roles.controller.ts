/**
 * Roles Controller - 职能角色管理 API
 * 
 * 所有端点仅限 superuser 访问
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { RolesService } from './roles.service';
import type { CreateRoleDto, UpdateRoleDto, BoundaryDto } from './roles.service';
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

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superuser')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly logWriter: LogWriterService,
  ) {}

  /**
   * 提取客户端 IP 地址
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
   * 获取所有职能角色
   * GET /roles
   */
  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  /**
   * 获取单个职能角色
   * GET /roles/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  /**
   * 创建新职能
   * POST /roles
   * 安全等级: L3
   */
  @Post()
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L3')
  async create(@Body() dto: CreateRoleDto, @Request() req: AuthenticatedRequest) {
    const result = await this.rolesService.create(dto, req.user.userId);
    
    // 记录审计日志 - 创建角色是高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `role-create-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/roles',
      },
      module: 'roles',
      action: 'CREATE_ROLE',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      newValue: { name: dto.name, level: dto.level },
    });
    
    return result;
  }

  /**
   * 更新职能信息
   * PATCH /roles/:id
   * 安全等级: L3
   */
  @Patch(':id')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L3')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.rolesService.update(id, dto, req.user.userId);
    
    // 记录审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `role-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'PATCH',
        path: `/roles/${id}`,
      },
      module: 'roles',
      action: 'UPDATE_ROLE',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      details: { roleId: id },
      newValue: dto,
    });
    
    return result;
  }

  /**
   * 删除职能
   * DELETE /roles/:id
   * 安全等级: L4 (最高级别，不可逆)
   */
  @Delete(':id')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L4')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.rolesService.delete(id, req.user.userId);
    
    // 记录审计日志 - 删除角色是最高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `role-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'DELETE',
        path: `/roles/${id}`,
      },
      module: 'roles',
      action: 'DELETE_ROLE',
      result: 'SUCCESS',
      riskLevel: 'CRITICAL',
      details: { roleId: id },
    });
  }

  // ================================
  // 权限边界管理
  // ================================

  /**
   * 获取角色的权限边界
   * GET /roles/:id/boundaries
   */
  @Get(':id/boundaries')
  async getBoundaries(@Param('id') id: string) {
    return this.rolesService.getBoundaries(id);
  }

  /**
   * 批量设置角色权限边界
   * PUT /roles/:id/boundaries
   * 安全等级: L4 (需要 L1 + L4 双重验证)
   */
  @Post(':id/boundaries/batch')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L4')
  async setBoundaries(
    @Param('id') id: string,
    @Body() boundaries: BoundaryDto[],
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.rolesService.setBoundaries(id, boundaries, req.user.userId);
    
    // 记录审计日志 - 批量设置权限边界是最高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `role-boundaries-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: `/roles/${id}/boundaries/batch`,
      },
      module: 'roles',
      action: 'SET_ROLE_BOUNDARIES',
      result: 'SUCCESS',
      riskLevel: 'CRITICAL',
      details: { roleId: id, boundaryCount: boundaries.length },
    });
    
    return result;
  }

  /**
   * 添加单个权限边界
   * POST /roles/:id/boundaries
   * 安全等级: L2
   */
  @Post(':id/boundaries')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L2')
  async addBoundary(
    @Param('id') id: string,
    @Body() dto: BoundaryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.rolesService.addBoundary(id, dto, req.user.userId);
    
    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `role-boundary-add-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: `/roles/${id}/boundaries`,
      },
      module: 'roles',
      action: 'ADD_BOUNDARY',
      summary: `为角色 ${id} 添加了权限边界 ${dto.permissionKey}`,
      entityType: 'Role',
      entityId: id,
    });
    
    return result;
  }

  /**
   * 删除权限边界
   * DELETE /roles/:id/boundaries/:permissionKey
   * 安全等级: L3
   */
  @Delete(':id/boundaries/:permissionKey')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L3')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBoundary(
    @Param('id') id: string,
    @Param('permissionKey') permissionKey: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.rolesService.removeBoundary(id, permissionKey, req.user.userId);
    
    // 记录审计日志
    this.logWriter.logAudit({
      context: {
        traceId: `role-boundary-remove-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'DELETE',
        path: `/roles/${id}/boundaries/${permissionKey}`,
      },
      module: 'roles',
      action: 'REMOVE_BOUNDARY',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      details: { roleId: id, permissionKey },
    });
  }

  // ================================
  // 系统初始化
  // ================================

  /**
   * 初始化系统角色 (Seed)
   * POST /roles/seed
   * 仅用于初始化
   */
  @Post('seed')
  @UseGuards(SecurityLevelGuard)
  @RequireSecurityLevel('L4')
  async seed(@Request() req: AuthenticatedRequest) {
    const result = await this.rolesService.seedSystemRoles();
    
    // 记录审计日志 - 初始化是最高风险操作
    this.logWriter.logAudit({
      context: {
        traceId: `role-seed-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/roles/seed',
      },
      module: 'roles',
      action: 'SEED_ROLES',
      result: 'SUCCESS',
      riskLevel: 'CRITICAL',
    });
    
    return result;
  }
}

