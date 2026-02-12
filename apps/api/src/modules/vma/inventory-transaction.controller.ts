import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request, UseGuards,
  HttpCode, HttpStatus, Res, Header,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { InventoryTransactionService } from './inventory-transaction.service';
import {
  CreateInventoryTransactionDto,
  UpdateInventoryTransactionDto,
  ProductType,
  InventoryAction,
  InspectionResult,
} from './dto/inventory-transaction.dto';
import { ReceiveFromChinaDto } from './dto/receive-from-china.dto';
import { ReceivingInspectionPdfService } from './receiving-inspection-pdf.service';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { extractClientIp } from './vma-shared.util';

interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}



@Controller('vma')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryTransactionController {
  constructor(
    private readonly service: InventoryTransactionService,
    private readonly logWriter: LogWriterService,
    private readonly receivingPdf: ReceivingInspectionPdfService,
  ) {}



  // ======== Inventory Transactions ========

  @Get('inventory-transactions')
  @Permissions('vma.employees.manage')
  async findAll(@Query('productType') productType?: ProductType) {
    return this.service.findAll(productType);
  }

  @Get('inventory-transactions/:id')
  @Permissions('vma.employees.manage')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('inventory-transactions')
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInventoryTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.create(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-inv-txn-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/inventory-transactions',
      },
      module: 'vma',
      action: 'CREATE_INVENTORY_TRANSACTION',
      summary: `Created ${dto.action} for ${dto.specNo} x${dto.qty}`,
      entityType: 'VmaInventoryTransaction',
      entityId: result.id,
    });

    return result;
  }

  @Patch('inventory-transactions/:id')
  @Permissions('vma.employees.manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.update(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-inv-txn-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/inventory-transactions/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_INVENTORY_TRANSACTION',
      summary: `Updated transaction ${id}`,
      entityType: 'VmaInventoryTransaction',
      entityId: id,
    });

    return result;
  }

  @Delete('inventory-transactions/:id')
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.service.remove(id);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-inv-txn-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/inventory-transactions/${id}`,
      },
      module: 'vma',
      action: 'DELETE_INVENTORY_TRANSACTION',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      oldValue: result,
      newValue: null,
    });

    return result;
  }

  @Get('inventory-spec-options')
  @Permissions('vma.employees.manage')
  async getSpecOptions(@Query('productType') productType: ProductType) {
    return this.service.getSpecOptions(productType);
  }

  @Get('inventory-summary')
  @Permissions('vma.employees.manage')
  async getInventorySummary(@Query('productType') productType: ProductType) {
    return this.service.getInventorySummary(productType);
  }

  @Get('inventory-detail')
  @Permissions('vma.employees.manage')
  async getInventoryDetail(
    @Query('specNo') specNo: string,
    @Query('productType') productType: ProductType,
  ) {
    return this.service.getInventoryDetail(specNo, productType);
  }

  @Get('demo-inventory')
  @Permissions('vma.employees.manage')
  async getDemoInventory() {
    return this.service.getDemoInventory();
  }

  @Get('inventory-operators')
  @Permissions('vma.employees.manage')
  async getOperatorOptions() {
    return this.service.getActiveOperators();
  }

  // ======== Receive from China ========

  @Post('inventory-receive')
  @Permissions('vma.employees.manage')
  async receiveFromChina(
    @Body() dto: ReceiveFromChinaDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const dateReceived = dto.dateTimeReceived.split(' ')[0]; // YYYY-MM-DD
    const timeReceived = dto.dateTimeReceived.split(' ').slice(1).join(' ') || null; // HH:MM PST

    // 1. Create or update Receiving Batch record (preserves batch-level data)
    await this.service.upsertReceivingBatch({
      batchNo: dto.batchNo,
      poNo: dto.poNo || null,
      dateShipped: dto.dateShipped || null,
      dateReceived,
      timeReceived,
      operator: dto.operator,
      comments: dto.comments || null,
    });

    // 2. Create inventory transactions for each product line
    const createdIds: string[] = [];

    for (const line of dto.products) {
      const txn = await this.service.create({
        date: dateReceived,
        action: InventoryAction.REC_CN,
        productType: line.productType as ProductType,
        specNo: line.productModel,
        serialNo: line.serialNo,
        qty: line.qty,
        batchNo: dto.batchNo,
        inspection: line.result as InspectionResult,
        condition: line.failedNoteIndices || [],
        operator: dto.operator,
        notes: '',
        expDate: line.expDate || undefined,
      });
      createdIds.push(txn.id);

      // Auto-create MOVE_DEMO when product is REJECTED at receiving
      if (line.result === 'REJECT') {
        const demoTxn = await this.service.create({
          date: dateReceived,
          action: InventoryAction.MOVE_DEMO,
          productType: line.productType as ProductType,
          specNo: line.productModel,
          serialNo: line.serialNo,
          qty: line.qty,
          batchNo: dto.batchNo,
          inspection: InspectionResult.REJECT,
          condition: line.failedNoteIndices || [],
          operator: dto.operator,
          notes: 'RECEIVING_AUTO|REJECT→DEMO',
          expDate: line.expDate || undefined,
        });
        createdIds.push(demoTxn.id);
      }
    }

    // 3. Generate merged receiving inspection PDF
    const pdfBuffer = await this.receivingPdf.generateReceivingPdf(dto);

    // 4. Log
    this.logWriter.logBusiness({
      context: {
        traceId: `vma-receive-cn-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/inventory-receive',
      },
      module: 'vma',
      action: 'RECEIVE_FROM_CHINA',
      summary: `Received ${dto.products.length} product(s) from China, batch ${dto.batchNo}`,
      entityType: 'VmaInventoryTransaction',
      entityId: createdIds.join(','),
    });

    // 5. Stream PDF response
    const filename = `receiving_inspection_${dto.batchNo}_${dateReceived}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // ======== Regenerate single-product Receiving PDF from stored data ========

  @Get('inventory-receive-pdf/:txnId')
  @Permissions('vma.employees.manage')
  async regenerateReceivingPdf(
    @Param('txnId') txnId: string,
    @Res() res: Response,
  ) {
    // Load the single transaction with its batch
    const txn = await this.service.findOneWithBatch(txnId);

    const batch = txn.batch;
    const dateReceived = batch
      ? batch.dateReceived.toISOString().split('T')[0]
      : txn.date.toISOString().split('T')[0];

    // Reconstruct shared DTO from batch data
    const sharedDto: ReceiveFromChinaDto = {
      batchNo: batch?.batchNo || txn.batchNo || '',
      poNo: batch?.poNo || '',
      dateShipped: batch?.dateShipped?.toISOString().split('T')[0] || '',
      dateTimeReceived: `${dateReceived} ${batch?.timeReceived || ''}`.trim(),
      operator: batch?.operator || txn.operator || '',
      comments: batch?.comments || '',
      products: [],
    } as any;

    // Build single product line
    const line = {
      productType: txn.productType,
      productModel: txn.specNo,
      serialNo: txn.serialNo || '',
      qty: txn.qty,
      productCondition: txn.inspection || 'ACCEPT',
      failedNoteIndices: txn.condition || [],
      result: txn.inspection || 'ACCEPT',
      inspectionBy: txn.operator || '',
      expDate: txn.expDate?.toISOString().split('T')[0] || undefined,
    } as any;

    const pdfBuffer = await this.receivingPdf.fillOnePdf(sharedDto, line);

    const filename = `receiving_inspection_${txn.specNo}_${txn.serialNo || 'N-A'}_${dateReceived}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}

