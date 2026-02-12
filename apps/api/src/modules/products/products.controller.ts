/**
 * Products Controller - 产品管理 API 端点
 *
 * 所有端点都需要认证 (JWT)
 * 敏感操作需要安全码验证 (SecurityLevel Guard)
 *
 * ⚠️ 日志规范: 所有操作都必须记录 BusinessLog/AuditLog
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
  Request,
  Response,
  UseGuards,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { ProductsService } from './products.service';
import {
  ProductQueryDto,
  CreateProductDto,
  UpdateProductDto,
  BatchUpdateCogsDto,
  BatchCreateProductDto,
  GenerateBarcodeDto,
} from './dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequireSecurityLevel } from '../auth/decorators/security-level.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { SecurityLevelGuard } from '../auth/guards/security-level.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LogWriterService } from '../../common/logging/log-writer.service';
import { BarcodeService } from './barcode.service';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    userId: string;
    username: string;
    roles?: string[];
  };
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly barcodeService: BarcodeService,
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

  // ================================
  // 查询端点 (公开/低安全级别)
  // ================================

  /**
   * GET /products
   * 获取产品列表 (分页)
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('products.catalog.view')
  async findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  /**
   * GET /products/categories
   * 获取所有分类
   */
  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  /**
   * GET /products/sku-list
   * 获取 SKU 列表 (用于下拉选择)
   */
  @Get('sku-list')
  async getSkuList() {
    return this.productsService.getSkuList();
  }

  /**
   * GET /products/:id
   * 获取单个产品
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * GET /products/sku/:sku
   * 通过 SKU 获取产品
   */
  @Get('sku/:sku')
  async findBySku(@Param('sku') sku: string) {
    return this.productsService.findBySku(sku);
  }

  // ================================
  // 创建端点 (需要安全验证)
  // ================================

  /**
   * POST /products
   * 创建产品
   * 安全等级: L2
   */
  @Post()
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.catalog.create')
  @RequireSecurityLevel('L2')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productsService.create(dto);

    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `products-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/products',
      },
      module: 'products',
      action: 'CREATE_PRODUCT',
      summary: `Created product SKU: ${result.sku}`,
      entityType: 'Product',
      entityId: result.id,
    });

    return result;
  }

  /**
   * POST /products/batch
   * 批量创建产品
   * 安全等级: L2
   */
  @Post('batch')
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.catalog.create')
  @RequireSecurityLevel('L2')
  @HttpCode(HttpStatus.CREATED)
  async batchCreate(
    @Body() dto: BatchCreateProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productsService.batchCreate(dto);

    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `products-batch-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/products/batch',
      },
      module: 'products',
      action: 'BATCH_CREATE_PRODUCTS',
      summary: `Batch created ${result.success}/${result.total} products`,
      entityType: 'Product',
      details: { results: result.results },
    });

    return result;
  }

  // ================================
  // 更新端点 (需要安全验证)
  // ================================

  /**
   * PATCH /products/:id
   * 更新产品
   * 安全等级: L2
   */
  @Patch(':id')
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.catalog.update')
  @RequireSecurityLevel('L2')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const oldProduct = await this.productsService.findOne(id);
    const result = await this.productsService.update(id, dto);

    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `products-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'PATCH',
        path: `/products/${id}`,
      },
      module: 'products',
      action: 'UPDATE_PRODUCT',
      summary: `Updated product SKU: ${result.sku}`,
      entityType: 'Product',
      entityId: id,
      details: { before: oldProduct, after: result },
    });

    return result;
  }

  /**
   * POST /products/cogs/batch
   * 批量更新 COGS
   * 安全等级: L2
   */
  @Post('cogs/batch')
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.catalog.update')
  @RequireSecurityLevel('L2')
  @HttpCode(HttpStatus.OK)
  async batchUpdateCogs(
    @Body() dto: BatchUpdateCogsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productsService.batchUpdateCogs(dto);

    // 记录业务日志
    this.logWriter.logBusiness({
      context: {
        traceId: `products-cogs-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/products/cogs/batch',
      },
      module: 'products',
      action: 'BATCH_UPDATE_COGS',
      summary: `Batch updated COGS for ${result.success}/${result.total} products`,
      entityType: 'Product',
      details: { results: result.results },
    });

    return result;
  }

  // ================================
  // 删除端点 (高安全级别)
  // ================================

  /**
   * DELETE /products/:id
   * 删除产品 (软删除)
   * 安全等级: L3
   */
  @Delete(':id')
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.catalog.delete')
  @RequireSecurityLevel('L3')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await this.productsService.findOne(id);
    const result = await this.productsService.delete(id);

    // 记录审计日志 (删除是高风险操作)
    this.logWriter.logAudit({
      context: {
        traceId: `products-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'DELETE',
        path: `/products/${id}`,
      },
      module: 'products',
      action: 'DELETE_PRODUCT',
      result: 'SUCCESS',
      riskLevel: 'HIGH',
      oldValue: product,
      newValue: null,
    });

    return result;
  }

  // ================================
  // 条形码端点
  // ================================

  /**
   * POST /products/barcode/generate
   * 生成条形码 PDF
   * 安全等级: L1
   */
  @Post('barcode/generate')
  @UseGuards(PermissionsGuard, SecurityLevelGuard)
  @Permissions('products.barcode.generate')
  @RequireSecurityLevel('L1')
  async generateBarcode(
    @Body() dto: GenerateBarcodeDto,
    @Request() req: AuthenticatedRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<StreamableFile> {
    // 获取产品名称映射
    const products = await this.productsService.getSkuList();
    const names: Record<string, string> = {};
    products.forEach((p: { sku: string; name: string | null }) => {
      if (p.name) names[p.sku] = p.name;
    });

    // 生成条形码 PDF
    const result = await this.barcodeService.generateBarcodePdf({
      skus: dto.skus,
      names,
      copiesPerSku: dto.copiesPerSku ?? 1,
      format: dto.format ?? 'CODE128',
    });

    if (!result.success || !result.pdfBuffer) {
      // 记录失败日志
      this.logWriter.logBusiness({
        context: {
          traceId: `products-barcode-${Date.now()}`,
          userId: req.user.userId,
          username: req.user.username,
          ipAddress: this.extractClientIp(req),
          method: 'POST',
          path: '/products/barcode/generate',
        },
        module: 'products',
        action: 'GENERATE_BARCODE_FAILED',
        summary: `Failed to generate barcode: ${result.error}`,
        entityType: 'Barcode',
        details: { skus: dto.skus, error: result.error },
      });

      throw new Error(result.error || 'Failed to generate barcodes');
    }

    // 记录成功日志
    this.logWriter.logBusiness({
      context: {
        traceId: `products-barcode-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: this.extractClientIp(req),
        method: 'POST',
        path: '/products/barcode/generate',
      },
      module: 'products',
      action: 'GENERATE_BARCODE',
      summary: `Generated ${result.totalLabels} barcode labels for ${result.skuCount} SKUs`,
      entityType: 'Barcode',
      details: {
        skus: dto.skus,
        format: dto.format,
        copiesPerSku: dto.copiesPerSku,
        totalLabels: result.totalLabels,
      },
    });

    // 设置响应头
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=barcodes_${Date.now()}.pdf`,
    });

    return new StreamableFile(result.pdfBuffer);
  }
}
