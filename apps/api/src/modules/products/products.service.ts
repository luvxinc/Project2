/**
 * Products Service - 产品管理业务逻辑
 *
 * 功能:
 * - COGS 查询/批量更新
 * - SKU 创建
 * - 缓存集成
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CacheService } from '../../common/redis';
import {
  CreateProductDto,
  UpdateProductDto,
  BatchUpdateCogsDto,
  BatchCreateProductDto,
} from './dto';
import { Product, Prisma } from '@prisma/client';

// 缓存 TTL 常量
const CACHE_TTL = {
  SKU: 3600,        // 1小时
  LIST: 300,        // 5分钟
  CATEGORIES: 900,  // 15分钟
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 获取产品列表 (分页 + 搜索 + 筛选)
   */
  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const { page = 1, limit = 20, search, category, status } = options || {};
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (status) {
      where.status = status;
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          subcategory: true,
          type: true,
          cost: true,
          freight: true,
          cogs: true,
          weight: true,
          upc: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { sku: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map((p: { 
        cogs: Prisma.Decimal | null; 
        cost: Prisma.Decimal | null;
        freight: Prisma.Decimal | null;
        [key: string]: unknown 
      }) => ({
        ...p,
        cost: p.cost ? Number(p.cost) : 0,
        freight: p.freight ? Number(p.freight) : 0,
        cogs: p.cogs ? Number(p.cogs) : 0,
      })),

      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取单个产品
   */
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('products.errors.notFound');
    }

    return {
      ...product,
      cogs: product.cogs ? Number(product.cogs) : 0,
    };
  }

  /**
   * 通过 SKU 获取产品
   */
  async findBySku(sku: string) {
    // 尝试从缓存获取
    const cacheKey = `sku:${sku.toUpperCase()}`;
    const cached = await this.cacheService.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { sku: sku.toUpperCase(), deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('products.errors.notFound');
    }

    const result = {
      ...product,
      cogs: product.cogs ? Number(product.cogs) : 0,
    };

    // 写入缓存
    await this.cacheService.set(cacheKey, result, CACHE_TTL.SKU);

    return result;
  }

  /**
   * 创建产品
   */
  async create(dto: CreateProductDto) {
    // SKU 转大写
    const sku = dto.sku.toUpperCase();

    // 检查 SKU 是否存在
    const existing = await this.prisma.product.findUnique({
      where: { sku },
    });

    if (existing) {
      throw new ConflictException('products.errors.skuExists');
    }

    const product = await this.prisma.product.create({
      data: {
        sku,
        name: dto.name,
        category: dto.category,
        cogs: dto.cogs ?? 0,
        upc: dto.upc,
      },
    });

    this.logger.log(`Product created: ${sku}`);

    return {
      ...product,
      cogs: product.cogs ? Number(product.cogs) : 0,
    };
  }

  /**
   * 批量创建产品
   */
  async batchCreate(dto: BatchCreateProductDto) {
    const results: { sku: string; success: boolean; error?: string }[] = [];

    for (const item of dto.products) {
      try {
        await this.create(item);
        results.push({ sku: item.sku.toUpperCase(), success: true });
      } catch (error) {
        results.push({
          sku: item.sku.toUpperCase(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    this.logger.log(`Batch create: ${successCount} success, ${failCount} failed`);

    return {
      total: dto.products.length,
      success: successCount,
      failed: failCount,
      results,
    };
  }

  /**
   * 更新产品
   */
  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.cogs !== undefined && { cogs: dto.cogs }),
        ...(dto.upc !== undefined && { upc: dto.upc }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    // 清除缓存
    await this.cacheService.del(`sku:${product.sku}`);

    return {
      ...updated,
      cogs: updated.cogs ? Number(updated.cogs) : 0,
    };
  }

  /**
   * 批量更新 COGS
   */
  async batchUpdateCogs(dto: BatchUpdateCogsDto) {
    const results: { id: string; sku: string; success: boolean; error?: string }[] = [];

    // 使用事务处理
    await this.prisma.$transaction(async (tx: typeof this.prisma) => {
      for (const item of dto.items) {
        try {
          const product = await tx.product.update({
            where: { id: item.id },
            data: { cogs: item.cogs },
            select: { id: true, sku: true },
          });

          results.push({ id: item.id, sku: product.sku, success: true });

          // 清除缓存
          await this.cacheService.del(`sku:${product.sku}`);
        } catch (error) {
          results.push({
            id: item.id,
            sku: 'unknown',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    this.logger.log(`Batch COGS update: ${successCount} success, ${failCount} failed`);

    return {
      total: dto.items.length,
      success: successCount,
      failed: failCount,
      results,
    };
  }

  /**
   * 软删除产品
   */
  async delete(id: string) {
    const product = await this.findOne(id);

    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });

    // 清除缓存
    await this.cacheService.del(`sku:${product.sku}`);

    return { success: true };
  }

  /**
   * 获取所有分类列表
   */
  async getCategories() {
    const cacheKey = 'product:categories';
    const cached = await this.cacheService.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        category: { not: null },
      },
      select: { category: true },
      distinct: ['category'],
    });

    const categories = products
      .map((p: { category: string | null }) => p.category)
      .filter((c: string | null): c is string => c !== null)
      .sort();

    await this.cacheService.set(cacheKey, categories, CACHE_TTL.CATEGORIES);

    return categories;
  }

  /**
   * 获取所有 SKU 列表 (用于下拉选择)
   */
  async getSkuList() {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        sku: true,
        name: true,
      },
      orderBy: { sku: 'asc' },
    });

    return products;
  }
}
