/**
 * VMA Site Controller - 站点管理 API
 *
 * 端点:
 *   GET    /vma/sites              - 站点列表
 *   POST   /vma/sites              - 创建站点
 *   PATCH  /vma/sites/:siteId      - 更新站点
 *
 * 审计修复:
 *   - [S-4/L-2] 添加 LogWriterService 审计日志
 *   - [S-5] DTO 迁移到独立文件 dto/site.dto.ts
 *   - [DRY] 使用共享 extractClientIp
 */
import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { SiteService } from './site.service';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { Request as ExpressRequest } from 'express';
import { extractClientIp } from './vma-shared.util';
import { CreateSiteDto, UpdateSiteDto } from './dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SiteController {
  constructor(
    private readonly service: SiteService,
    private readonly logWriter: LogWriterService,
  ) {}

  @Get('sites')
  @Permissions('vma.employees.manage')
  async findAll() {
    return this.service.findAll();
  }

  @Post('sites')
  @Permissions('vma.employees.manage')
  async create(
    @Body() dto: CreateSiteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.create(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-site-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/sites',
      },
      module: 'vma',
      action: 'CREATE_SITE',
      summary: `Created site: ${dto.siteId} - ${dto.siteName}`,
      entityType: 'VmaSite',
      entityId: dto.siteId,
    });

    return result;
  }

  @Patch('sites/:siteId')
  @Permissions('vma.employees.manage')
  async update(
    @Param('siteId') siteId: string,
    @Body() dto: UpdateSiteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.update(siteId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-site-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/sites/${siteId}`,
      },
      module: 'vma',
      action: 'UPDATE_SITE',
      summary: `Updated site: ${siteId}`,
      entityType: 'VmaSite',
      entityId: siteId,
    });

    return result;
  }
}
