/**
 * VMA P-Valve Product Controller - 产品管理 API
 *
 * 端点:
 *   GET    /vma/pvalve-products                  - P-Valve 产品列表
 *   POST   /vma/pvalve-products                  - 创建 P-Valve 产品
 *   PATCH  /vma/pvalve-products/:id              - 更新 P-Valve 产品
 *   DELETE /vma/pvalve-products/:id              - 删除 P-Valve 产品
 *
 *   GET    /vma/delivery-system-products          - Delivery System 产品列表
 *   POST   /vma/delivery-system-products          - 创建 Delivery System 产品
 *   PATCH  /vma/delivery-system-products/:id      - 更新 Delivery System 产品
 *   DELETE /vma/delivery-system-products/:id      - 删除 Delivery System 产品
 *
 *   GET    /vma/product-fit-matrix                - 获取完整适配矩阵
 *   PUT    /vma/product-fit                       - 更新适配关系
 */
import {
  Controller,
  Get, Post, Put, Patch, Delete,
  Body, Param, Request,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PValveProductService } from './pvalve-product.service';
import {
  CreatePValveProductDto, UpdatePValveProductDto,
  CreateDeliverySystemProductDto, UpdateDeliverySystemProductDto,
  UpdateFitRelationshipDto,
} from './dto/pvalve-product.dto';
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
export class PValveProductController {
  constructor(
    private readonly productService: PValveProductService,
    private readonly logWriter: LogWriterService,
  ) {}



  // ================================
  // P-Valve Product Endpoints
  // ================================

  @Get('pvalve-products')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async findAllPValveProducts() {
    return this.productService.findAllPValveProducts();
  }

  @Post('pvalve-products')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.CREATED)
  async createPValveProduct(
    @Body() dto: CreatePValveProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.createPValveProduct(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-pv-product-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/pvalve-products',
      },
      module: 'vma',
      action: 'CREATE_PVALVE_PRODUCT',
      summary: `Created P-Valve product: ${result.model} ${result.specification}`,
      entityType: 'VmaPValveProduct',
      entityId: result.id,
    });

    return result;
  }

  @Patch('pvalve-products/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async updatePValveProduct(
    @Param('id') id: string,
    @Body() dto: UpdatePValveProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.updatePValveProduct(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-pv-product-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/pvalve-products/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_PVALVE_PRODUCT',
      summary: `Updated P-Valve product: ${result.specification}`,
      entityType: 'VmaPValveProduct',
      entityId: id,
    });

    return result;
  }

  @Delete('pvalve-products/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.OK)
  async deletePValveProduct(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.deletePValveProduct(id);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-pv-product-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/pvalve-products/${id}`,
      },
      module: 'vma',
      action: 'DELETE_PVALVE_PRODUCT',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      oldValue: result,
      newValue: null,
    });

    return result;
  }

  // ================================
  // Delivery System Product Endpoints
  // ================================

  @Get('delivery-system-products')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async findAllDeliverySystemProducts() {
    return this.productService.findAllDeliverySystemProducts();
  }

  @Post('delivery-system-products')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.CREATED)
  async createDeliverySystemProduct(
    @Body() dto: CreateDeliverySystemProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.createDeliverySystemProduct(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-ds-product-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'POST',
        path: '/vma/delivery-system-products',
      },
      module: 'vma',
      action: 'CREATE_DELIVERY_SYSTEM_PRODUCT',
      summary: `Created DS product: ${result?.model} ${result?.specification}`,
      entityType: 'VmaDeliverySystemProduct',
      entityId: result?.id || '',
    });

    return result;
  }

  @Patch('delivery-system-products/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async updateDeliverySystemProduct(
    @Param('id') id: string,
    @Body() dto: UpdateDeliverySystemProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.updateDeliverySystemProduct(id, dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-ds-product-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PATCH',
        path: `/vma/delivery-system-products/${id}`,
      },
      module: 'vma',
      action: 'UPDATE_DELIVERY_SYSTEM_PRODUCT',
      summary: `Updated DS product: ${result?.specification}`,
      entityType: 'VmaDeliverySystemProduct',
      entityId: id,
    });

    return result;
  }

  @Delete('delivery-system-products/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  @HttpCode(HttpStatus.OK)
  async deleteDeliverySystemProduct(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.deleteDeliverySystemProduct(id);

    this.logWriter.logAudit({
      context: {
        traceId: `vma-ds-product-delete-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'DELETE',
        path: `/vma/delivery-system-products/${id}`,
      },
      module: 'vma',
      action: 'DELETE_DELIVERY_SYSTEM_PRODUCT',
      result: 'SUCCESS',
      riskLevel: 'MEDIUM',
      oldValue: result,
      newValue: null,
    });

    return result;
  }

  // ================================
  // Fit Matrix & Relationships
  // ================================

  @Get('product-fit-matrix')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async getFitMatrix() {
    return this.productService.getFitMatrix();
  }

  @Put('product-fit')
  @UseGuards(PermissionsGuard)
  @Permissions('vma.employees.manage')
  async updateFitRelationship(
    @Body() dto: UpdateFitRelationshipDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.productService.updateFitRelationship(dto);

    this.logWriter.logBusiness({
      context: {
        traceId: `vma-fit-update-${Date.now()}`,
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: extractClientIp(req),
        method: 'PUT',
        path: '/vma/product-fit',
      },
      module: 'vma',
      action: 'UPDATE_FIT_RELATIONSHIP',
      summary: `Updated fit for DS ${dto.deliverySystemSpec} → [${dto.pvalveSpecs.join(', ')}]`,
      entityType: 'VmaDeliverySystemFit',
      entityId: result?.id || '',
    });

    return result;
  }
}
