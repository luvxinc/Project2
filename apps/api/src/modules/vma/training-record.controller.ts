import { Controller, Get, Post, Patch, Delete, Param, Body, Request, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { TrainingRecordService } from './training-record.service';
import { SmartFillService } from './smart-fill.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CreateTrainingRecordDto, UpdateTrainingRecordDto } from './dto/training-record.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { extractClientIp } from './vma-shared.util';
import * as path from 'path';
import * as fs from 'fs';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard)
export class TrainingRecordController {
  constructor(
    private readonly service: TrainingRecordService,
    private readonly smartFill: SmartFillService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly logWriter: LogWriterService,
  ) {}

  /** 培训批次列表 */
  @Get('training-sessions')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async listSessions() {
    return this.service.listSessions();
  }

  /** 培训批次详情 */
  @Get('training-sessions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async getSession(@Param('id') id: string) {
    return this.service.getSession(id);
  }

  /** 删除培训批次 (含所有关联记录) */
  @Delete('training-sessions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async deleteSession(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const session = await this.service.deleteSession(id);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-ts-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/training-sessions/${id}`,
      },
      module: 'vma',
      action: 'DELETE_TRAINING_SESSION',
      entityType: 'VmaTrainingSession',
      entityId: id,
      summary: `Deleted training session ${session.trainingNo}`,
    });
    return session;
  }

  /** 从培训批次中移除某条记录 */
  @Delete('training-sessions/:sessionId/records/:recordId')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async removeRecordFromSession(
    @Param('sessionId') sessionId: string,
    @Param('recordId') recordId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.removeRecordFromSession(sessionId, recordId);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-tr-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/training-sessions/${sessionId}/records/${recordId}`,
      },
      module: 'vma',
      action: 'REMOVE_RECORD_FROM_SESSION',
      entityType: 'VmaTrainingRecord',
      entityId: recordId,
      summary: `Removed record ${result.record.employeeNo}/${result.record.sopNo} from session ${sessionId}`,
    });
    return { remaining: result.remaining };
  }

  /** 员工培训状态总览 */
  @Get('training-records/status')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  getEmployeeTrainingStatus() {
    return this.service.getEmployeeTrainingStatus();
  }

  /** 培训矩阵报告 */
  @Get('training-records/matrix')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  getTrainingMatrix() {
    return this.service.getTrainingMatrix();
  }

  /** 培训合规路线图 */
  @Get('training-records/roadmap')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  getTrainingRoadmap() {
    return this.service.getTrainingRoadmap();
  }

  /** 全部培训记录 */
  @Get('training-records')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  findAll() {
    return this.service.findAll();
  }

  /** 某员工的培训记录 */
  @Get('training-records/employee/:employeeNo')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  findByEmployee(@Param('employeeNo') employeeNo: string) {
    return this.service.findByEmployee(employeeNo);
  }

  /** 单条记录 */
  @Get('training-records/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /** 智能补齐培训记录 */
  @Post('training-records/smart-fill')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async smartFillRecords(
    @Body() body: { cutoffDate: string; lecturerNo: string },
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.smartFill.smartFill(body.cutoffDate, body.lecturerNo);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-sf-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/training-records/smart-fill',
      },
      module: 'vma',
      action: 'SMART_FILL_TRAINING',
      entityType: 'VmaTrainingSession',
      entityId: 'batch',
      summary: `Smart fill: ${result.message}`,
    });
    return result;
  }

  /** 下载生成的 PDF (按需生成) */
  @Get('training-records/download/:filename')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async downloadPdf(@Param('filename') filename: string, @Res() res: Response) {
    const outputDir = path.resolve(__dirname, '../../../generated-pdfs');
    const filepath = path.join(outputDir, filename);

    // If PDF already exists on disk, stream it directly
    if (fs.existsSync(filepath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return fs.createReadStream(filepath).pipe(res);
    }

    // PDF not found → generate on-demand from database
    // Extract trainingNo from filename: "training_{trainingNo}.pdf"
    const match = filename.match(/^training_(.+)\.pdf$/);
    if (!match) {
      return res.status(404).json({ message: 'Invalid filename format' });
    }
    const trainingNo = match[1];

    // Look up session in database
    const session = await this.service.getSessionByTrainingNo(trainingNo);
    if (!session) {
      return res.status(404).json({ message: `Training session ${trainingNo} not found` });
    }

    // Get employee department codes and SOP names via service
    const employeeNos = [...new Set(session.records.map((r: any) => r.employeeNo as string))];
    const sopKeys = [...new Set(session.records.map((r: any) => r.sopNo as string))];
    const { empDeptMap, sopNameMap } = await this.service.getSessionPdfData(employeeNos, sopKeys);

    // Build unique SOPs list from records
    const uniqueSops = new Map<string, { sopNo: string; sopName: string; version: string }>();
    for (const r of session.records) {
      const key = `${r.sopNo}|${r.sopVersion}`;
      if (!uniqueSops.has(key)) {
        uniqueSops.set(key, {
          sopNo: r.sopNo,
          sopName: sopNameMap.get(r.sopNo) || r.sopNo,
          version: r.sopVersion,
        });
      }
    }

    // Assemble SessionData for PDF generator
    const sessionData = {
      trainingNo: session.trainingNo,
      trainingDate: session.trainingDate,
      trainingSubject: session.trainingSubject || '',
      trainingObjective: 'Ensure understanding of updated working procedures and responsibilities',
      evaluationMethod: session.evaluationMethod || 'oral_qa',
      lecturerName: session.lecturerName || '',
      timeStart: session.trainingTimeStart || '',
      timeEnd: session.trainingTimeEnd || '',
      employees: employeeNos.map(no => ({
        employeeNo: no,
        departmentCode: empDeptMap.get(no) || '',
      })),
      sops: [...uniqueSops.values()],
    };

    try {
      const pdfBuffer = await this.pdfGenerator.generateSessionPdf(sessionData);
      // Save for future requests
      await this.pdfGenerator.savePdf(pdfBuffer, filename);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.end(pdfBuffer);
    } catch (err) {
      this.logWriter.logError({
        context: {
          traceId: `vma-pdf-err-${Date.now()}`,
          method: 'GET',
          path: `/vma/training-records/download/${filename}`,
          module: 'vma',
          operation: 'DOWNLOAD_PDF',
        },
        error: err instanceof Error ? err : new Error(String(err)),
        severity: 'MEDIUM',
        category: 'BUSINESS',
        businessContext: { filename, trainingNo: filename.match(/^training_(.+)\.pdf$/)?.[1] },
      });
      return res.status(500).json({ message: 'PDF generation failed', error: String(err) });
    }
  }

  /** 新增培训记录 */
  @Post('training-records')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async create(@Body() dto: CreateTrainingRecordDto, @Request() req: AuthenticatedRequest) {
    const result = await this.service.create(dto);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-tr-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/training-records',
      },
      module: 'vma',
      action: 'CREATE_TRAINING_RECORD',
      entityType: 'VmaTrainingRecord',
      entityId: result.id,
      summary: `Created training record: ${dto.employeeNo} - ${dto.sopNo} ${dto.sopVersion}`,
    });
    return result;
  }

  /** 更新培训记录 */
  @Patch('training-records/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateTrainingRecordDto, @Request() req: AuthenticatedRequest) {
    const result = await this.service.update(id, dto);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-tr-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/training-records/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_TRAINING_RECORD',
      entityType: 'VmaTrainingRecord',
      entityId: id,
      summary: `Updated training record ${id}`,
    });
    return result;
  }

  /** 删除培训记录 */
  @Delete('training-records/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.training.manage')
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const result = await this.service.remove(id);
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-tr-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/training-records/${id}`,
      },
      module: 'vma',
      action: 'DELETE_TRAINING_RECORD',
      entityType: 'VmaTrainingRecord',
      entityId: id,
      summary: `Deleted training record ${id}`,
    });
    return result;
  }
}
