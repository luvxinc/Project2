import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const pv = await prisma.vmaPValveProduct.findMany({ orderBy: { specification: 'asc' } });
  console.log('=== P-Valve Products (' + pv.length + ') ===');
  pv.forEach(p => console.log('  ' + p.model + ' | ' + p.specification + ' | A:' + p.diameterA + ' B:' + p.diameterB + ' C:' + p.diameterC + ' | D:' + p.expandedLengthD + ' E:' + p.expandedLengthE + ' | Crimped:' + p.crimpedTotalLength));

  const ds = await prisma.vmaDeliverySystemProduct.findMany({ orderBy: { specification: 'asc' } });
  console.log('\n=== Delivery System Products (' + ds.length + ') ===');
  ds.forEach(d => console.log('  ' + d.model + ' | ' + d.specification));

  const fits = await prisma.vmaDeliverySystemFit.findMany({
    include: { deliverySystem: true, pvalve: true },
    orderBy: { deliverySystem: { specification: 'asc' } },
  });
  console.log('\n=== Fit Relationships (' + fits.length + ') ===');
  fits.forEach(f => console.log('  ' + f.deliverySystem.specification + ' → ' + f.pvalve.specification));

  await prisma.$disconnect();
}
main();
