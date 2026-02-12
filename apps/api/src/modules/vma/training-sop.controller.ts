/**
 * VMA Training SOP Controller - 两表架构 API
 *
 * 端点:
 *   GET    /vma/training-sops              - SOP列表 (含版本历史)
 *   GET    /vma/training-sops/next-seq     - 获取下一个可用编号
 *   GET    /vma/training-sops/:id          - 单个SOP (含版本)
 *   POST   /vma/training-sops             - 创建SOP + 初始版本
 *   PATCH  /vma/training-sops/:id         - 更新SOP主文档信息
 *   POST   /vma/training-sops/:id/version - 添加新版本
 *   PATCH  /vma/training-sops/:id/toggle  - 切换状态 (整个文件)
 *
 * 注意: 没有 DELETE — SOP 永不删除，只有 DEPRECATED
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TrainingSopService } from './training-sop.service';
import { CreateTrainingSopDto, UpdateTrainingSopDto, AddSopVersionDto } from './dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { Request as ExpressRequest } from 'express';
import { extractClientIp } from './vma-shared.util';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard)
export class TrainingSopController {
  constructor(
    private readonly trainingSopService: TrainingSopService,
    private readonly logWriter: LogWriterService,
  ) {}



  @Get('training-sops')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  async findAll() {
    return this.trainingSopService.findAll();
  }

  @Get('training-sops/next-seq')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  async getNextSeqNo() {
    const nextSeqNo = await this.trainingSopService.getNextSeqNo();
    return { nextSeqNo };
  }

  @Get('training-sops/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  async findOne(@Param('id') id: string) {
    return this.trainingSopService.findOne(id);
  }

  @Post('training-sops')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTrainingSopDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.trainingSopService.create(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-sop-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/training-sops',
      },
      module: 'vma',
      action: 'CREATE_TRAINING_SOP',
      summary: `Created SOP #${result.seqNo}: ${result.sopNo} - ${result.name}`,
      entityType: 'VmaTrainingSop',
      entityId: result.id,
    });

    return result;
  }

  @Patch('training-sops/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingSopDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.trainingSopService.update(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-sop-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/training-sops/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_TRAINING_SOP',
      summary: `Updated SOP #${result.seqNo}: ${result.sopNo} - ${result.name}`,
      entityType: 'VmaTrainingSop',
      entityId: id,
    });

    return result;
  }

  /**
   * 添加新版本 (版本更新时)
   */
  @Post('training-sops/:id/version')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  @HttpCode(HttpStatus.CREATED)
  async addVersion(
    @Param('id') id: string,
    @Body() dto: AddSopVersionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const sop = await this.trainingSopService.findOne(id);
    const result = await this.trainingSopService.addVersion(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-sop-version-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: `/vma/training-sops/${id}/version`,
      },
      module: 'vma',
      action: 'ADD_SOP_VERSION',
      summary: `Added ${result.version} to SOP ${sop.sopNo} (training=${result.trainingRequired})`,
      entityType: 'VmaTrainingSopVersion',
      entityId: result.id,
    });

    return result;
  }

  @Patch('training-sops/:id/toggle')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training_sop.manage')
  async toggleStatus(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.trainingSopService.toggleStatus(id);
    const latestVer = result.versions?.[0]?.version || '';

    this.logWriter.logAudit({
      context: {
        traceId: `vma-sop-toggle-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/training-sops/${id}/toggle`,
      },
      module: 'vma',
      action: 'TOGGLE_SOP_STATUS',
      entityType: 'VmaTrainingSop',
      entityId: id,
      details: { sopNo: result.sopNo, seqNo: result.seqNo, newStatus: result.status, version: latestVer },
      result: 'SUCCESS',
      riskLevel: result.status === 'DEPRECATED' ? 'HIGH' : 'MEDIUM',
    });

    return result;
  }
}
