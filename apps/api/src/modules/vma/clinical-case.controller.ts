/**
 * VMA Clinical Case Controller - 临床案例管理 API
 *
 * 端点:
 *   GET    /vma/clinical-cases                             - 案例列表
 *   GET    /vma/clinical-cases/:caseId                     - 单个案例详情
 *   POST   /vma/clinical-cases                             - 创建案例 + 生成装箱单 PDF
 *   PATCH  /vma/clinical-cases/:caseId                     - 更新案例基本信息
 *   PATCH  /vma/clinical-cases/:caseId/items/:txnId        - 更新案例产品
 *   DELETE /vma/clinical-cases/:caseId/items/:txnId        - 删除案例产品
 *   POST   /vma/clinical-cases/:caseId/items               - 添加新产品到案例
 *   GET    /vma/clinical-cases/:caseId/pdf                 - 重新生成装箱单 PDF
 *   POST   /vma/clinical-cases/:caseId/complete            - 完成案例
 *   POST   /vma/clinical-cases/:caseId/reverse-completion  - 反转完成
 *   POST   /vma/case-pick-products                         - 自动拣货
 *   POST   /vma/case-available-products                    - 可用产品查询
 *   GET    /vma/case-compatible-ds                         - 兼容 DS 查询
 *
 * 审计修复:
 *   - [S-3/L-1] 添加 LogWriterService 审计日志
 *   - [V-1~V-3] 使用正式 DTO + class-validator 验证
 *   - [DRY] 使用共享 extractClientIp
 */
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, Request, UseGuards } from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ClinicalCaseService } from './clinical-case.service';
import { PackingListPdfService } from './packing-list-pdf.service';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { extractClientIp, MONTHS } from './vma-shared.util';
import {
  CreateClinicalCaseDto,
  UpdateClinicalCaseInfoDto,
  UpdateCaseItemDto,
  AddCaseItemDto,
  PickProductsDto,
  AvailableProductsDto,
  CompleteCaseDto,
} from './dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalCaseController {
  constructor(
    private readonly caseService: ClinicalCaseService,
    private readonly packingPdf: PackingListPdfService,
    private readonly logWriter: LogWriterService,
  ) {}

  // GET /vma/clinical-cases
  @Get('clinical-cases')
  @Permissions('vma.employees.manage')
  async findAll() {
    return this.caseService.findAll();
  }

  // GET /vma/clinical-cases/:caseId
  @Get('clinical-cases/:caseId')
  @Permissions('vma.employees.manage')
  async findOne(@Param('caseId') caseId: string) {
    return this.caseService.findOne(caseId);
  }

  // POST /vma/case-pick-products
  @Post('case-pick-products')
  @Permissions('vma.employees.manage')
  async pickProducts(@Body() dto: PickProductsDto) {
    return this.caseService.pickProducts(dto.specNo, dto.qty, dto.caseDate, dto.productType);
  }

  // POST /vma/case-available-products
  @Post('case-available-products')
  @Permissions('vma.employees.manage')
  async getAvailableProducts(@Body() dto: AvailableProductsDto) {
    return this.caseService.getAvailableProducts(dto.specNo, dto.caseDate, dto.productType);
  }

  // GET /vma/case-compatible-ds?specs=P28-25,P30-30
  @Get('case-compatible-ds')
  @Permissions('vma.employees.manage')
  async getCompatibleDS(@Query('specs') specs: string) {
    if (!specs || !specs.trim()) {
      return { error: 'specs query parameter is required', statusCode: 400 };
    }
    const specList = specs.split(',').map(s => s.trim()).filter(Boolean);
    if (specList.length === 0) {
      return { error: 'specs must contain at least one valid spec number', statusCode: 400 };
    }
    return this.caseService.getCompatibleDS(specList);
  }

  // POST /vma/clinical-cases
  // Creates case + generates PDF
  @Post('clinical-cases')
  @Permissions('vma.employees.manage')
  async createCase(
    @Body() dto: CreateClinicalCaseDto,
    @Res() res: Response,
    @Request() req: AuthenticatedRequest,
  ) {
    // 1. Create case + OUT_CASE transactions
    const caseResult = await this.caseService.createCase(dto);
    const caseId = caseResult.caseId;

    // Audit log
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-case-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/clinical-cases',
      },
      module: 'vma',
      action: 'CREATE_CLINICAL_CASE',
      summary: `Created clinical case: ${caseId}`,
      entityType: 'VmaClinicalCase',
      entityId: caseId,
    });

    // 2. Get full case with site for PDF
    const fullCase = await this.caseService.findOne(caseId);

    // 3. Build packing list items
    let itemNo = 0;
    const months = MONTHS;
    const packingItems = fullCase.transactions.map(txn => {
      itemNo++;
      const expD = txn.expDate ? new Date(txn.expDate) : null;
      const expFormatted = expD
        ? `${expD.getUTCFullYear()} ${months[expD.getUTCMonth()]} ${String(expD.getUTCDate()).padStart(2, '0')}`
        : '';
      return {
        itemNo,
        specNo: txn.specNo,
        serialNo: txn.serialNo || '',
        expDate: txn.expDate?.toISOString().split('T')[0] || '',
        expDateFormatted: expFormatted,
        deviceName: txn.productType === 'PVALVE'
          ? 'Transcatheter\nPulmonary Valve'
          : 'Delivery System',
      };
    });

    // 4. Generate PDF (or DOCX fallback)
    const result = await this.packingPdf.generate({
      caseId,
      caseDate: dto.caseDate,
      site: {
        siteName: fullCase.site.siteName,
        address: fullCase.site.address,
        address2: fullCase.site.address2 || '',
        city: fullCase.site.city,
        state: fullCase.site.state,
        zipCode: fullCase.site.zipCode,
        country: fullCase.site.country,
      },
      items: packingItems,
    });

    // 5. Stream result with correct content type
    const filename = `PackingList_${caseId}.${result.extension}`;
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': result.buffer.length,
    });
    res.send(result.buffer);
  }

  // PATCH /vma/clinical-cases/:caseId — update case basic info
  @Patch('clinical-cases/:caseId')
  @Permissions('vma.employees.manage')
  async updateCaseInfo(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateClinicalCaseInfoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.updateCaseInfo(caseId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-case-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/clinical-cases/${caseId}`,
      },
      module: 'vma',
      action: 'UPDATE_CLINICAL_CASE',
      summary: `Updated clinical case info: ${caseId}`,
      entityType: 'VmaClinicalCase',
      entityId: caseId,
    });

    return result;
  }

  // PATCH /vma/clinical-cases/:caseId/items/:txnId
  @Patch('clinical-cases/:caseId/items/:txnId')
  @Permissions('vma.employees.manage')
  async updateCaseItem(
    @Param('caseId') caseId: string,
    @Param('txnId') txnId: string,
    @Body() dto: UpdateCaseItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.updateCaseItem(caseId, txnId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-case-item-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/clinical-cases/${caseId}/items/${txnId}`,
      },
      module: 'vma',
      action: 'UPDATE_CASE_ITEM',
      summary: `Updated case item: ${txnId} in case ${caseId}`,
      entityType: 'VmaInventoryTransaction',
      entityId: txnId,
    });

    return result;
  }

  // DELETE /vma/clinical-cases/:caseId/items/:txnId
  @Delete('clinical-cases/:caseId/items/:txnId')
  @Permissions('vma.employees.manage')
  async deleteCaseItem(
    @Param('caseId') caseId: string,
    @Param('txnId') txnId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.deleteCaseItem(caseId, txnId);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-case-del-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/clinical-cases/${caseId}/items/${txnId}`,
      },
      module: 'vma',
      action: 'DELETE_CASE_ITEM',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      entityType: 'VmaInventoryTransaction',
      entityId: txnId,
    });

    return result;
  }

  // POST /vma/clinical-cases/:caseId/items — add new item to existing case
  @Post('clinical-cases/:caseId/items')
  @Permissions('vma.employees.manage')
  async addCaseItem(
    @Param('caseId') caseId: string,
    @Body() dto: AddCaseItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.addCaseItem(caseId, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-case-add-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: `/vma/clinical-cases/${caseId}/items`,
      },
      module: 'vma',
      action: 'ADD_CASE_ITEM',
      summary: `Added item to case ${caseId}: ${dto.productType} ${dto.specNo}`,
      entityType: 'VmaClinicalCase',
      entityId: caseId,
    });

    return result;
  }

  // GET /vma/clinical-cases/:caseId/pdf — regenerate packing list PDF
  @Get('clinical-cases/:caseId/pdf')
  @Permissions('vma.employees.manage')
  async downloadPdf(
    @Param('caseId') caseId: string,
    @Res() res: Response,
  ) {
    const fullCase = await this.caseService.findOne(caseId);

    let itemNo = 0;
    const months = MONTHS;
    const packingItems = fullCase.transactions.map(txn => {
      itemNo++;
      const expD = txn.expDate ? new Date(txn.expDate) : null;
      const expFormatted = expD
        ? `${expD.getUTCFullYear()} ${months[expD.getUTCMonth()]} ${String(expD.getUTCDate()).padStart(2, '0')}`
        : '';
      return {
        itemNo,
        specNo: txn.specNo,
        serialNo: txn.serialNo || '',
        expDate: txn.expDate?.toISOString().split('T')[0] || '',
        expDateFormatted: expFormatted,
        deviceName: txn.productType === 'PVALVE'
          ? 'Transcatheter\nPulmonary Valve'
          : 'Delivery System',
      };
    });

    const caseDate = fullCase.caseDate.toISOString().split('T')[0];
    const result = await this.packingPdf.generate({
      caseId,
      caseDate,
      site: {
        siteName: fullCase.site.siteName,
        address: fullCase.site.address,
        address2: (fullCase.site as any).address2 || '',
        city: fullCase.site.city,
        state: fullCase.site.state,
        zipCode: fullCase.site.zipCode,
        country: fullCase.site.country,
      },
      items: packingItems,
    });

    const filename = `PackingList_${caseId}.${result.extension}`;
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': result.buffer.length,
    });
    res.send(result.buffer);
  }

  // POST /vma/clinical-cases/:caseId/complete — complete a case
  @Post('clinical-cases/:caseId/complete')
  @Permissions('vma.employees.manage')
  async completeCase(
    @Param('caseId') caseId: string,
    @Body() dto: CompleteCaseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.completeCase(caseId, dto);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-case-complete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: `/vma/clinical-cases/${caseId}/complete`,
      },
      module: 'vma',
      action: 'COMPLETE_CLINICAL_CASE',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      entityType: 'VmaClinicalCase',
      entityId: caseId,
      details: { itemCount: dto.items.length },
    });

    return result;
  }

  // POST /vma/clinical-cases/:caseId/reverse-completion — undo completion
  @Post('clinical-cases/:caseId/reverse-completion')
  @Permissions('vma.employees.manage')
  async reverseCompletion(
    @Param('caseId') caseId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.caseService.reverseCompletion(caseId);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-case-reverse-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: `/vma/clinical-cases/${caseId}/reverse-completion`,
      },
      module: 'vma',
      action: 'REVERSE_CLINICAL_CASE',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      entityType: 'VmaClinicalCase',
      entityId: caseId,
    });

    return result;
  }
}
