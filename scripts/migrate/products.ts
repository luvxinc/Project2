/**
 * Products 数据迁移脚本
 * 从老系统 (MySQL) 迁移到新系统 (PostgreSQL)
 * 
 * 老系统表:
 * - Data_COGS: 产品成本信息 (包含 SKU, Product, Cog 等)
 * 
 * 新系统表:
 * - products: Prisma 管理的产品表
 * 
 * 使用方式:
 * npx ts-node scripts/migrate/products.ts
 * npx ts-node scripts/migrate/products.ts --validate
 */
import { PrismaClient, Prisma } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 老系统 MySQL 连接配置 (使用 .env 中的配置)
const LEGACY_DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'MGMT',
};

// 新系统 Prisma 客户端
const prisma = new PrismaClient();

/**
 * 老系统 Data_COGS 表结构
 * 根据数据库表.md 的定义
 */
interface LegacyProduct {
  SKU: string;
  Product?: string;          // 产品名称 (可选)
  Category?: string;         // 分类
  SubCategory?: string;      // 子分类
  Type?: string;             // 类型
  Cost?: string | number;    // 基础成本
  Freight?: string | number; // 运费
  Cog: string | number;      // 总成本 (TEXT 类型, 需转换) = Cost + Freight
  Weight?: string | number;  // 重量 (克)
  UPC?: string;              // UPC 条码 (可选)
  Status?: string;           // 状态 (可选)
  Size?: string;             // 尺寸 (可选)
}

/**
 * 转换老系统产品数据到新系统格式
 */
function transformProduct(legacy: LegacyProduct): Prisma.ProductCreateInput {
  // 解析 Cost
  let cost = 0;
  if (legacy.Cost !== null && legacy.Cost !== undefined && legacy.Cost !== '') {
    const parsed = parseFloat(String(legacy.Cost));
    if (!isNaN(parsed) && parsed >= 0) {
      cost = parsed;
    }
  }

  // 解析 Freight
  let freight = 0;
  if (legacy.Freight !== null && legacy.Freight !== undefined && legacy.Freight !== '') {
    const parsed = parseFloat(String(legacy.Freight));
    if (!isNaN(parsed) && parsed >= 0) {
      freight = parsed;
    }
  }

  // 解析 COGS (处理 Type Erasure: TEXT → Decimal)
  // 优先使用 Cog 字段，若无则计算 Cost + Freight
  let cogs = 0;
  if (legacy.Cog !== null && legacy.Cog !== undefined && legacy.Cog !== '') {
    const parsed = parseFloat(String(legacy.Cog));
    if (!isNaN(parsed) && parsed >= 0) {
      cogs = parsed;
    }
  } else {
    cogs = cost + freight;
  }

  // 解析 Weight
  let weight = 0;
  if (legacy.Weight !== null && legacy.Weight !== undefined && legacy.Weight !== '') {
    const parsed = parseInt(String(legacy.Weight), 10);
    if (!isNaN(parsed) && parsed > 0) {
      weight = parsed;
    }
  }

  // 解析状态
  const status = legacy.Status?.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  return {
    sku: legacy.SKU.trim().toUpperCase(),
    name: legacy.Product?.trim() || null,
    category: legacy.Category?.trim() || null,
    subcategory: legacy.SubCategory?.trim() || null,
    type: legacy.Type?.trim() || null,
    cost: new Prisma.Decimal(cost.toFixed(2)),
    freight: new Prisma.Decimal(freight.toFixed(2)),
    cogs: new Prisma.Decimal(cogs.toFixed(2)),
    weight,
    upc: legacy.UPC?.trim() || null,
    status,
  };
}


async function migrateProducts() {
  console.log('🚀 开始产品数据迁移...');
  console.log('━'.repeat(50));

  // 连接老系统数据库
  const legacyConn = await mysql.createConnection(LEGACY_DB_CONFIG);
  console.log('✅ 已连接老系统 MySQL');

  try {
    // 1. 获取老系统产品数据
    const [products] = await legacyConn.query(
      'SELECT * FROM Data_COGS ORDER BY SKU'
    ) as any;
    console.log(`📊 发现 ${products.length} 个产品需要迁移`);

    if (products.length === 0) {
      console.log('⚠️  没有找到待迁移的产品数据');
      return;
    }

    // 2. 显示表结构 (调试用)
    const firstProduct = products[0] as LegacyProduct;
    console.log('📋 老系统表字段:', Object.keys(firstProduct).join(', '));

    // 3. 迁移产品
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { sku: string; error: string }[] = [];

    for (const legacyProduct of products as LegacyProduct[]) {
      try {
        // 跳过空 SKU
        if (!legacyProduct.SKU || legacyProduct.SKU.trim() === '') {
          console.log('⏭️  跳过: 空 SKU');
          skipped++;
          continue;
        }

        const sku = legacyProduct.SKU.trim().toUpperCase();

        // 检查是否已存在
        const existing = await prisma.product.findUnique({
          where: { sku },
        });

        if (existing) {
          // 更新现有产品的完整数据
          const transformed = transformProduct(legacyProduct);
          await prisma.product.update({
            where: { sku },
            data: {
              category: transformed.category || existing.category,
              subcategory: transformed.subcategory || existing.subcategory,
              type: transformed.type || existing.type,
              cost: transformed.cost,
              freight: transformed.freight,
              cogs: transformed.cogs,
              weight: transformed.weight || existing.weight,
              name: transformed.name || existing.name,
              upc: transformed.upc || existing.upc,
            },
          });
          console.log(`🔄 更新: ${sku} (Cost: ${transformed.cost}, Freight: ${transformed.freight}, COGS: ${transformed.cogs})`);
          skipped++;
          continue;
        }


        // 转换并创建新产品
        const productData = transformProduct(legacyProduct);

        await prisma.product.create({
          data: productData,
        });

        console.log(`✅ 迁移成功: ${productData.sku} (COGS: $${productData.cogs})`);
        migrated++;

        // 进度报告
        if ((migrated + skipped + failed) % 50 === 0) {
          console.log(`📊 进度: ${migrated + skipped + failed}/${products.length}`);
        }
      } catch (error: any) {
        console.error(`❌ 迁移失败: ${legacyProduct.SKU}`, error.message);
        errors.push({ sku: legacyProduct.SKU, error: error.message });
        failed++;
      }
    }

    // 4. 汇总
    console.log('━'.repeat(50));
    console.log('📊 迁移完成统计:');
    console.log(`   ✅ 新增: ${migrated}`);
    console.log(`   🔄 更新/跳过: ${skipped}`);
    console.log(`   ❌ 失败: ${failed}`);
    console.log(`   📝 总计: ${products.length}`);

    // 5. 显示失败记录
    if (errors.length > 0) {
      console.log('\n❌ 失败记录 (前10条):');
      errors.slice(0, 10).forEach((e) => {
        console.log(`   - ${e.sku}: ${e.error}`);
      });
    }

  } finally {
    await legacyConn.end();
    await prisma.$disconnect();
  }
}

/**
 * 验证迁移结果
 */
async function validateMigration() {
  console.log('\n🔍 验证迁移结果...');
  
  const legacyConn = await mysql.createConnection(LEGACY_DB_CONFIG);
  
  try {
    // 1. 记录数对比
    const [legacyResult] = await legacyConn.query('SELECT COUNT(*) as count FROM Data_COGS');
    const legacyCount = (legacyResult as any)[0].count;
    
    const newCount = await prisma.product.count();
    
    console.log(`   老系统产品: ${legacyCount}`);
    console.log(`   新系统产品: ${newCount}`);
    
    if (newCount >= legacyCount) {
      console.log('✅ 验证通过: 产品数量匹配');
    } else {
      console.log(`⚠️  警告: 新系统产品数少于老系统 (差异: ${legacyCount - newCount})`);
    }

    // 2. 抽样验证 COGS
    const [samples] = await legacyConn.query(
      'SELECT SKU, Cog FROM Data_COGS ORDER BY RAND() LIMIT 10'
    );

    console.log('\n📋 抽样验证 COGS:');
    let matchCount = 0;
    for (const sample of samples as any[]) {
      const newProduct = await prisma.product.findUnique({
        where: { sku: sample.SKU.trim().toUpperCase() },
        select: { sku: true, cogs: true },
      });

      if (!newProduct) {
        console.log(`   ❌ ${sample.SKU}: 未找到`);
        continue;
      }

      const legacyCogs = parseFloat(sample.Cog) || 0;
      const newCogs = newProduct.cogs.toNumber();
      const match = Math.abs(legacyCogs - newCogs) < 0.01;

      console.log(
        `   ${match ? '✅' : '❌'} ${sample.SKU}: 老=${legacyCogs.toFixed(2)} 新=${newCogs.toFixed(2)}`
      );
      if (match) matchCount++;
    }

    console.log(`\n📊 抽样验证结果: ${matchCount}/${(samples as any[]).length} 匹配`);

    // 3. 统计新系统 COGS 分布
    const cogsStats = await prisma.product.aggregate({
      _count: true,
      _avg: { cogs: true },
      _min: { cogs: true },
      _max: { cogs: true },
    });

    console.log('\n📊 新系统 COGS 统计:');
    console.log(`   产品数: ${cogsStats._count}`);
    console.log(`   平均 COGS: $${cogsStats._avg.cogs?.toFixed(2) || 0}`);
    console.log(`   最小 COGS: $${cogsStats._min.cogs?.toFixed(2) || 0}`);
    console.log(`   最大 COGS: $${cogsStats._max.cogs?.toFixed(2) || 0}`);

  } finally {
    await legacyConn.end();
    await prisma.$disconnect();
  }
}

// 主函数
async function main() {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│    MGMT V2 - Products Data Migration Script    │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log('');
  
  const args = process.argv.slice(2);
  
  if (args.includes('--validate')) {
    await validateMigration();
  } else {
    await migrateProducts();
    if (!args.includes('--skip-validate')) {
      await validateMigration();
    }
  }
}

main().catch(console.error);
