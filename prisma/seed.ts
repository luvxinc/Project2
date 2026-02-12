/**
 * 数据库种子脚本
 * 初始化系统角色和管理员用户
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// 使用 bcrypt 哈希密码（与 auth.service.ts 保持一致）
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}


const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. 创建系统角色 (L0=超管不显示, L1=管理员, L2=员工, L3=编辑)
  console.log('Creating system roles...');
  const systemRoles = [
    { name: 'superuser', displayName: '超级管理员', level: 0, color: '#EF4444', isSystem: true },
    { name: 'admin', displayName: '管理员', level: 1, color: '#F59E0B', isSystem: false },
    { name: 'staff', displayName: '员工', level: 2, color: '#34D399', isSystem: false },
    { name: 'editor', displayName: '编辑', level: 3, color: '#60A5FA', isSystem: false },
  ];

  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { displayName: role.displayName, color: role.color },
      create: role,
    });
    console.log(`  ✓ Role: ${role.name} (Level ${role.level})`);
  }

  // 2. 创建超级管理员用户
  console.log('\nCreating superuser...');
  const passwordHash = hashPassword('Admin@123');
  
  const superuser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@mgmt.local',
      passwordHash,
      displayName: 'System Admin',
      roles: ['superuser', 'admin'],
      status: 'ACTIVE',
      permissions: {},
      settings: { language: 'zh', timezone: 'Asia/Shanghai' },
    },
  });
  console.log(`  ✓ Superuser: ${superuser.username} (${superuser.id})`);

  // 3. 创建安全码
  console.log('\nCreating security codes...');
  const securityLevels = ['L1', 'L2', 'L3', 'L4'];
  const defaultCode = hashPassword('1234');

  for (const level of securityLevels) {
    await prisma.securityCode.upsert({
      where: { level_isActive: { level, isActive: true } },
      update: {},
      create: {
        level,
        codeHash: defaultCode,
        isActive: true,
      },
    });
    console.log(`  ✓ Security code: ${level}`);
  }

  console.log('\n✅ Seeding completed!');
  console.log('\n📋 Default credentials:');
  console.log('  Username: admin');
  console.log('  Password: Admin@123');
  console.log('  Security Code (L1-L4): 1234');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
