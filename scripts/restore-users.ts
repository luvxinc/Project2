/**
 * 🔄 恢复系统用户脚本 (Restore System Users)
 * 
 * 用途: 恢复所有生产环境需要的系统用户
 * 
 * 使用方法:
 *   cd apps/api && npx ts-node ../../scripts/restore-users.ts
 * 
 * ═══════════════════════════════════════════════════════════════════
 * 🔐 系统用户定义 (与不朽凭证一致)
 * ═══════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// 系统用户定义
const SYSTEM_USERS = [
  {
    username: 'admin',
    email: 'admin@mgmt.local',
    password: '1522P',
    displayName: 'System Administrator',
    roles: ['superuser', 'admin'],
  },
  {
    username: 'simon',
    email: 'simon@mgmt.local',
    password: 'topmorrow',
    displayName: 'Simon',
    roles: ['admin', 'staff'],
  },
  {
    username: 'operator',
    email: 'operator@mgmt.local',
    password: '12345',
    displayName: 'Default Operator',
    roles: ['staff'],
  },
  {
    username: 'editor',
    email: 'editor@mgmt.local',
    password: '12345',
    displayName: 'Default Editor',
    roles: ['editor'],
  },
];

async function main() {
  console.log('');
  console.log('🔄 ═══════════════════════════════════════════════════════════');
  console.log('   系统用户恢复工具 (System Users Restore)');
  console.log('   ═══════════════════════════════════════════════════════════');
  console.log('');

  // 1. 确保角色存在
  console.log('📋 确保系统角色存在...');
  const systemRoles = [
    { name: 'superuser', displayName: '超级管理员', level: 0, color: '#EF4444', isSystem: true },
    { name: 'admin', displayName: '管理员', level: 1, color: '#F59E0B', isSystem: false },
    { name: 'staff', displayName: '员工', level: 2, color: '#34D399', isSystem: false },
    { name: 'editor', displayName: '编辑', level: 3, color: '#60A5FA', isSystem: false },
  ];

  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
    console.log(`   ✓ 角色: ${role.name}`);
  }

  // 2. 创建/更新用户
  console.log('');
  console.log('👤 恢复系统用户...');
  for (const user of SYSTEM_USERS) {
    try {
      const passwordHash = await bcrypt.hash(user.password, 10);
      
      const result = await prisma.user.upsert({
        where: { username: user.username },
        update: {
          passwordHash,
          displayName: user.displayName,
          roles: user.roles,
          status: 'ACTIVE',
          deletedAt: null, // 确保未被软删除
        },
        create: {
          username: user.username,
          email: user.email,
          passwordHash,
          displayName: user.displayName,
          roles: user.roles,
          status: 'ACTIVE',
          permissions: {},
          settings: { language: 'zh', timezone: 'Asia/Shanghai' },
        },
      });
      
      console.log(`   ✓ ${user.username}: ${result.id}`);
    } catch (e) {
      console.log(`   ✗ ${user.username}: 恢复失败 - ${e}`);
    }
  }

  // 3. 显示结果
  console.log('');
  console.log('📊 当前用户列表:');
  const users = await prisma.user.findMany({
    select: { username: true, displayName: true, roles: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  
  for (const u of users) {
    console.log(`   - ${u.username} (${u.roles.join(', ')}) [${u.status}]`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ 用户恢复完成!');
  console.log('');
  console.log('   登录凭证:');
  console.log('     admin:    1522P');
  console.log('     simon:    topmorrow');
  console.log('     operator: 12345');
  console.log('     editor:   12345');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
