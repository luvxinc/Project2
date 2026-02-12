/**
 * VMA P-Valve Product Service - 产品管理服务
 * 管理 P-Valve 瓣膜产品和 Delivery System 输送系统产品
 * 含适配关系 (Fit) 管理
 */
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  CreatePValveProductDto, UpdatePValveProductDto,
  CreateDeliverySystemProductDto, UpdateDeliverySystemProductDto,
  UpdateFitRelationshipDto,
} from './dto/pvalve-product.dto';

@Injectable()
export class PValveProductService {
  private readonly logger = new Logger(PValveProductService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================
  // P-Valve Products
  // ================================

  /** 获取所有 P-Valve 产品 */
  async findAllPValveProducts() {
    return this.prisma.vmaPValveProduct.findMany({
      where: { isActive: true },
      include: {
        deliverySystemFits: {
          include: {
            deliverySystem: { select: { id: true, model: true, specification: true } },
          },
        },
      },
      orderBy: [{ model: 'asc' }, { specification: 'asc' }],
    });
  }

  /** 创建 P-Valve 产品 */
  async createPValveProduct(dto: CreatePValveProductDto) {
    // 检查 specification 唯一性
    const existing = await this.prisma.vmaPValveProduct.findUnique({
      where: { specification: dto.specification },
    });
    if (existing) {
      throw new ConflictException(`P-Valve specification "${dto.specification}" already exists`);
    }

    return this.prisma.vmaPValveProduct.create({
      data: {
        model: dto.model,
        specification: dto.specification,
        diameterA: dto.diameterA,
        diameterB: dto.diameterB,
        diameterC: dto.diameterC,
        expandedLengthD: dto.expandedLengthD,
        expandedLengthE: dto.expandedLengthE,
        crimpedTotalLength: dto.crimpedTotalLength,
      },
    });
  }

  /** 更新 P-Valve 产品 */
  async updatePValveProduct(id: string, dto: UpdatePValveProductDto) {
    const product = await this.prisma.vmaPValveProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('P-Valve product not found');

    return this.prisma.vmaPValveProduct.update({
      where: { id },
      data: dto,
    });
  }

  /** 删除 P-Valve 产品 (软删除) */
  async deletePValveProduct(id: string) {
    const product = await this.prisma.vmaPValveProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('P-Valve product not found');

    return this.prisma.vmaPValveProduct.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ================================
  // Delivery System Products
  // ================================

  /** 获取所有 Delivery System 产品 (含适配关系) */
  async findAllDeliverySystemProducts() {
    return this.prisma.vmaDeliverySystemProduct.findMany({
      where: { isActive: true },
      include: {
        pvalveFits: {
          include: {
            pvalve: { select: { id: true, model: true, specification: true } },
          },
        },
      },
      orderBy: [{ model: 'asc' }, { specification: 'asc' }],
    });
  }

  /** 创建 Delivery System 产品 */
  async createDeliverySystemProduct(dto: CreateDeliverySystemProductDto) {
    const existing = await this.prisma.vmaDeliverySystemProduct.findUnique({
      where: { specification: dto.specification },
    });
    if (existing) {
      throw new ConflictException(`Delivery System specification "${dto.specification}" already exists`);
    }

    // 创建产品并建立适配关系
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.vmaDeliverySystemProduct.create({
        data: {
          model: dto.model,
          specification: dto.specification,
        },
      });

      // 如果提供了 fitPValveSpecs，建立适配关系
      if (dto.fitPValveSpecs?.length) {
        const pvalves = await tx.vmaPValveProduct.findMany({
          where: { specification: { in: dto.fitPValveSpecs } },
        });

        if (pvalves.length !== dto.fitPValveSpecs.length) {
          const found = pvalves.map(p => p.specification);
          const missing = dto.fitPValveSpecs.filter(s => !found.includes(s));
          throw new NotFoundException(`P-Valve specifications not found: ${missing.join(', ')}`);
        }

        await tx.vmaDeliverySystemFit.createMany({
          data: pvalves.map(pv => ({
            deliverySystemId: product.id,
            pvalveId: pv.id,
          })),
        });
      }

      // 返回包含适配关系的产品
      return tx.vmaDeliverySystemProduct.findUnique({
        where: { id: product.id },
        include: {
          pvalveFits: {
            include: {
              pvalve: { select: { id: true, model: true, specification: true } },
            },
          },
        },
      });
    });
  }

  /** 更新 Delivery System 产品 */
  async updateDeliverySystemProduct(id: string, dto: UpdateDeliverySystemProductDto) {
    const product = await this.prisma.vmaDeliverySystemProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Delivery System product not found');

    return this.prisma.$transaction(async (tx) => {
      // 更新基本信息
      if (dto.model) {
        await tx.vmaDeliverySystemProduct.update({
          where: { id },
          data: { model: dto.model },
        });
      }

      // 更新适配关系 (替换式)
      if (dto.fitPValveSpecs !== undefined) {
        // 删除旧关系
        await tx.vmaDeliverySystemFit.deleteMany({
          where: { deliverySystemId: id },
        });

        // 建立新关系
        if (dto.fitPValveSpecs.length > 0) {
          const pvalves = await tx.vmaPValveProduct.findMany({
            where: { specification: { in: dto.fitPValveSpecs } },
          });

          await tx.vmaDeliverySystemFit.createMany({
            data: pvalves.map(pv => ({
              deliverySystemId: id,
              pvalveId: pv.id,
            })),
          });
        }
      }

      return tx.vmaDeliverySystemProduct.findUnique({
        where: { id },
        include: {
          pvalveFits: {
            include: {
              pvalve: { select: { id: true, model: true, specification: true } },
            },
          },
        },
      });
    });
  }

  /** 删除 Delivery System 产品 (软删除) */
  async deleteDeliverySystemProduct(id: string) {
    const product = await this.prisma.vmaDeliverySystemProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Delivery System product not found');

    return this.prisma.vmaDeliverySystemProduct.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ================================
  // Fit Relationship (独立管理)
  // ================================

  /** 获取完整适配矩阵 */
  async getFitMatrix() {
    const pvalves = await this.prisma.vmaPValveProduct.findMany({
      where: { isActive: true },
      include: {
        deliverySystemFits: {
          include: {
            deliverySystem: { select: { id: true, model: true, specification: true } },
          },
        },
      },
      orderBy: [{ model: 'asc' }, { specification: 'asc' }],
    });

    const deliverySystems = await this.prisma.vmaDeliverySystemProduct.findMany({
      where: { isActive: true },
      include: {
        pvalveFits: {
          include: {
            pvalve: { select: { id: true, model: true, specification: true } },
          },
        },
      },
      orderBy: [{ model: 'asc' }, { specification: 'asc' }],
    });

    return { pvalves, deliverySystems };
  }

  /** 更新适配关系 (按 DS specification 批量设置) */
  async updateFitRelationship(dto: UpdateFitRelationshipDto) {
    const ds = await this.prisma.vmaDeliverySystemProduct.findUnique({
      where: { specification: dto.deliverySystemSpec },
    });
    if (!ds) throw new NotFoundException(`Delivery System "${dto.deliverySystemSpec}" not found`);

    return this.prisma.$transaction(async (tx) => {
      // 清除该 DS 的旧关系
      await tx.vmaDeliverySystemFit.deleteMany({
        where: { deliverySystemId: ds.id },
      });

      // 建立新关系
      if (dto.pvalveSpecs.length > 0) {
        const pvalves = await tx.vmaPValveProduct.findMany({
          where: { specification: { in: dto.pvalveSpecs }, isActive: true },
        });

        await tx.vmaDeliverySystemFit.createMany({
          data: pvalves.map(pv => ({
            deliverySystemId: ds.id,
            pvalveId: pv.id,
          })),
        });
      }

      return tx.vmaDeliverySystemProduct.findUnique({
        where: { id: ds.id },
        include: {
          pvalveFits: {
            include: {
              pvalve: { select: { id: true, model: true, specification: true } },
            },
          },
        },
      });
    });
  }
}
