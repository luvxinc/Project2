/**
 * Users 数据迁移脚本
 * 从老系统 (MySQL) 迁移到新系统 (PostgreSQL)
 * 
 * 老系统表:
 * - User_Account: 用户账号
 * - User_Permission: 用户权限
 * 
 * 新系统表:
 * - User: Prisma 管理的用户表
 * 
 * 使用方式:
 * npx ts-node scripts/migrate/users.ts
 */
import { PrismaClient } from '@prisma/client';
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

interface LegacyUser {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  is_locked: number;
  failed_attempts: number;
  session_token: string | null;
  role_version: number;
  created_at: Date;
  updated_at: Date;
}

interface LegacyPermission {
  id: number;
  username: string;
  permission_key: string;
  allowed: number;
}

async function migrateUsers() {
  console.log('🚀 开始用户数据迁移...');
  console.log('━'.repeat(50));

  // 连接老系统数据库
  const legacyConn = await mysql.createConnection(LEGACY_DB_CONFIG);
  console.log('✅ 已连接老系统 MySQL');

  try {
    // 1. 获取老系统用户
    const [users] = await legacyConn.query(
      'SELECT * FROM User_Account ORDER BY id'
    ) as any;
    console.log(`📊 发现 ${users.length} 个用户需要迁移`);

    // 2. 获取老系统权限
    const [permissions] = await legacyConn.query(
      'SELECT * FROM User_Permission WHERE allowed = 1'
    ) as any;
    console.log(`📊 发现 ${permissions.length} 条权限记录`);

    // 3. 构建权限映射 (username -> permissions)
    const permissionMap = new Map<string, Record<string, boolean>>();
    for (const perm of permissions as LegacyPermission[]) {
      if (!permissionMap.has(perm.username)) {
        permissionMap.set(perm.username, {});
      }
      permissionMap.get(perm.username)![perm.permission_key] = true;
    }

    // 4. 迁移用户
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const legacyUser of users as unknown as LegacyUser[]) {
      try {
        // 检查是否已存在
        const existing = await prisma.user.findFirst({
          where: { 
            OR: [
              { username: legacyUser.username },
              { email: `${legacyUser.username}@legacy.local` }, // 老系统没有 email
            ]
          },
        });

        if (existing) {
          console.log(`⏭️  跳过: ${legacyUser.username} (已存在)`);
          skipped++;
          continue;
        }

        // 映射角色
        const roles = mapLegacyRoles(legacyUser);

        // 映射状态
        const status = legacyUser.is_locked ? 'LOCKED' : 'ACTIVE';

        // 获取权限
        const permissions = permissionMap.get(legacyUser.username) || {};

        // 创建新用户
        await prisma.user.create({
          data: {
            username: legacyUser.username,
            email: `${legacyUser.username}@legacy.local`, // 临时邮箱
            passwordHash: legacyUser.password_hash, // 直接迁移哈希
            displayName: legacyUser.username,
            roles,
            status,
            permissions: { modules: permissions },
            createdAt: legacyUser.created_at,
            updatedAt: legacyUser.updated_at,
          },
        });

        console.log(`✅ 迁移成功: ${legacyUser.username} (${roles.join(', ')})`);
        migrated++;
      } catch (error) {
        console.error(`❌ 迁移失败: ${legacyUser.username}`, error);
        failed++;
      }
    }

    // 5. 汇总
    console.log('━'.repeat(50));
    console.log('📊 迁移完成统计:');
    console.log(`   ✅ 成功: ${migrated}`);
    console.log(`   ⏭️  跳过: ${skipped}`);
    console.log(`   ❌ 失败: ${failed}`);
    console.log(`   📝 总计: ${users.length}`);

  } finally {
    await legacyConn.end();
    await prisma.$disconnect();
  }
}

/**
 * 映射老系统角色到新系统
 */
function mapLegacyRoles(user: LegacyUser): string[] {
  // 老系统只有 is_admin 标志
  // 新系统有 superuser, admin, staff, manager, operator, viewer
  
  if (user.username === 'admin' || user.username === process.env.SUPER_ADMIN_USER) {
    return ['superuser'];
  }
  
  if (user.is_admin) {
    return ['admin'];
  }
  
  return ['operator']; // 默认为 operator
}

/**
 * 验证迁移结果
 */
async function validateMigration() {
  console.log('\n🔍 验证迁移结果...');
  
  const legacyConn = await mysql.createConnection(LEGACY_DB_CONFIG);
  
  try {
    // 老系统用户数
    const [legacyResult] = await legacyConn.query('SELECT COUNT(*) as count FROM User_Account');
    const legacyCount = (legacyResult as any)[0].count;
    
    // 新系统用户数
    const newCount = await prisma.user.count();
    
    console.log(`   老系统用户: ${legacyCount}`);
    console.log(`   新系统用户: ${newCount}`);
    
    if (newCount >= legacyCount) {
      console.log('✅ 验证通过: 用户数量匹配');
    } else {
      console.log('⚠️  警告: 新系统用户数少于老系统');
    }
  } finally {
    await legacyConn.end();
    await prisma.$disconnect();
  }
}

// 主函数
async function main() {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│     MGMT V2 - Users Data Migration Script      │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log('');
  
  const args = process.argv.slice(2);
  
  if (args.includes('--validate')) {
    await validateMigration();
  } else {
    await migrateUsers();
    if (!args.includes('--skip-validate')) {
      await validateMigration();
    }
  }
}

main().catch(console.error);
