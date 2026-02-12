/**
 * 修复角色等级脚本 V2
 * L0=超管, L1=管理员, L2=员工, L3=编辑
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing role levels (v2)...');

  // 先把所有角色的 level 设为临时值（100+），避免唯一约束冲突
  const roles = await prisma.role.findMany();
  console.log('  Setting temporary levels...');
  for (let i = 0; i < roles.length; i++) {
    await prisma.role.update({
      where: { id: roles[i].id },
      data: { level: 100 + i },
    });
  }

  // 更新到正确的等级
  const roleUpdates = [
    { name: 'superuser', level: 0, displayName: '超级管理员' },
    { name: 'admin', level: 1, displayName: '管理员' },
    { name: 'staff', level: 2, displayName: '员工' },
    { name: 'editor', level: 3, displayName: '编辑' },
  ];

  for (const r of roleUpdates) {
    try {
      await prisma.role.update({
        where: { name: r.name },
        data: { level: r.level, displayName: r.displayName },
      });
      console.log(`  ✓ L${r.level}: ${r.name} (${r.displayName})`);
    } catch (e) {
      console.log(`  ⚠ Failed: ${r.name} - ${e.message}`);
    }
  }

  // 验证结果
  const finalRoles = await prisma.role.findMany({ orderBy: { level: 'asc' } });
  console.log('\n📋 Final roles:');
  for (const role of finalRoles) {
    console.log(`  L${role.level}: ${role.name} (${role.displayName})`);
  }

  console.log('\n✅ Done!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
