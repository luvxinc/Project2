/**
 * Seed script for P-Valve product catalog
 * 数据来源: Venus P-Valve 产品规格表
 * 
 * Usage: npx ts-node prisma/seeds/seed-pvalve-products.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Seeding P-Valve product catalog...');

  // ================================
  // P-Valve Products (瓣膜)
  // ================================
  const pvalveData = [
    { model: 'L28P', specification: 'P28-25', diameterA: 38, diameterB: 28, diameterC: 38, expandedLengthD: 25, expandedLengthE: 53, crimpedTotalLength: 68 },
    { model: 'L28P', specification: 'P28-30', diameterA: 38, diameterB: 28, diameterC: 38, expandedLengthD: 30, expandedLengthE: 60, crimpedTotalLength: 75 },
    { model: 'L30P', specification: 'P30-25', diameterA: 40, diameterB: 30, diameterC: 40, expandedLengthD: 25, expandedLengthE: 54, crimpedTotalLength: 68 },
    { model: 'L30P', specification: 'P30-30', diameterA: 40, diameterB: 30, diameterC: 40, expandedLengthD: 30, expandedLengthE: 60, crimpedTotalLength: 75 },
    { model: 'L32P', specification: 'P32-25', diameterA: 42, diameterB: 32, diameterC: 42, expandedLengthD: 25, expandedLengthE: 58, crimpedTotalLength: 73 },
    { model: 'L32P', specification: 'P32-30', diameterA: 42, diameterB: 32, diameterC: 42, expandedLengthD: 30, expandedLengthE: 65, crimpedTotalLength: 80 },
    { model: 'L34P', specification: 'P34-25', diameterA: 43, diameterB: 34, diameterC: 44, expandedLengthD: 25, expandedLengthE: 62, crimpedTotalLength: 78 },
    { model: 'L34P', specification: 'P34-30', diameterA: 43, diameterB: 34, diameterC: 44, expandedLengthD: 30, expandedLengthE: 67, crimpedTotalLength: 84 },
    { model: 'L36P', specification: 'P36-25', diameterA: 46, diameterB: 36, diameterC: 46, expandedLengthD: 25, expandedLengthE: 63, crimpedTotalLength: 80 },
    { model: 'L36P', specification: 'P36-30', diameterA: 46, diameterB: 36, diameterC: 46, expandedLengthD: 30, expandedLengthE: 67, crimpedTotalLength: 87 },
  ];

  for (const data of pvalveData) {
    await prisma.vmaPValveProduct.upsert({
      where: { specification: data.specification },
      update: data,
      create: data,
    });
    console.log(`  ✓ P-Valve: ${data.model} / ${data.specification}`);
  }

  // ================================
  // Delivery System Products (输送系统)
  // ================================
  const dsData = [
    { model: '22Fr', specification: 'DS22-P70' },
    { model: '22Fr', specification: 'DS22-P77' },
    { model: '24Fr', specification: 'DS24-P75' },
    { model: '24Fr', specification: 'DS24-P81' },
    { model: '24Fr', specification: 'DS24-P87' },
  ];

  for (const data of dsData) {
    await prisma.vmaDeliverySystemProduct.upsert({
      where: { specification: data.specification },
      update: data,
      create: data,
    });
    console.log(`  ✓ DS: ${data.model} / ${data.specification}`);
  }

  // ================================
  // Fit Relationships (适配关系)
  // Model 级别的多对多:
  //   22Fr → L28P, L30P (所有 spec)
  //   24Fr → L32P, L34P, L36P (所有 spec)
  // ================================
  const dsModelToFitPvModels: Record<string, string[]> = {
    '22Fr': ['L28P', 'L30P'],
    '24Fr': ['L32P', 'L34P', 'L36P'],
  };

  // 清除所有旧 Fit 记录再重建
  await prisma.vmaDeliverySystemFit.deleteMany({});
  console.log('  🔄 Cleared old fit relationships');

  for (const [dsModel, pvModels] of Object.entries(dsModelToFitPvModels)) {
    // 找到该 model 下的所有 DS
    const dsList = await prisma.vmaDeliverySystemProduct.findMany({
      where: { model: dsModel },
    });

    // 找到适配的所有 P-Valve
    const pvList = await prisma.vmaPValveProduct.findMany({
      where: { model: { in: pvModels } },
    });

    // 建立所有组合
    for (const ds of dsList) {
      for (const pv of pvList) {
        await prisma.vmaDeliverySystemFit.create({
          data: {
            deliverySystemId: ds.id,
            pvalveId: pv.id,
          },
        });
      }
      console.log(`  ✓ Fit: ${ds.specification} (${dsModel}) → [${pvList.map(p => p.specification).join(', ')}]`);
    }
  }

  console.log('\n✅ P-Valve product catalog seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
