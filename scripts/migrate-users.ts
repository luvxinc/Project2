/**
 * 用户迁移脚本 - 从老系统 MySQL 迁移用户到 V2 PostgreSQL
 * 
 * 迁移内容：
 * 1. 用户账户 (只迁移用户名和角色，不迁移密码)
 * 2. 迁移后需要运行 set-passwords.ts 设置密码
 * 
 * 使用方法:
 *   npx ts-node scripts/migrate-users.ts
 */

import { PrismaClient } from '@prisma/client';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();

interface LegacyUser {
  username: string;
  is_admin: number;
  is_locked: number;
}

async function main() {
  console.log('🚀 开始用户迁移...\n');

  // 从 .env 读取老系统数据库配置
  const mysqlConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'MGMT',
  };

  console.log(`连接老系统 MySQL: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
  
  // 1. 连接老系统 MySQL
  const mysqlConnection = await mysql.createConnection(mysqlConfig);
  console.log('✓ 连接老系统 MySQL 成功\n');

  // 2. 读取老系统用户 (不读密码)
  const [rows] = await mysqlConnection.execute<mysql.RowDataPacket[]>(
    'SELECT username, is_admin, is_locked FROM User_Account'
  );
  const legacyUsers = rows as LegacyUser[];
  console.log(`✓ 从老系统读取 ${legacyUsers.length} 个用户\n`);

  // 3. 迁移用户到 V2
  let created = 0;
  let updated = 0;

  for (const user of legacyUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { username: user.username },
    });

    // 设置角色
    const roles = user.is_admin ? ['admin'] : ['viewer'];
    
    // 检查是否是超级管理员 (admin 用户)
    if (user.username === 'admin') {
      roles.unshift('superuser');
    }

    if (existingUser) {
      // 更新用户信息（保留现有密码）
      await prisma.user.update({
        where: { username: user.username },
        data: { 
          roles,
          status: user.is_locked ? 'LOCKED' : 'ACTIVE',
        },
      });
      console.log(`  ↻ 更新: ${user.username} (${roles.join(', ')})`);
      updated++;
    } else {
      // 创建新用户（使用临时密码，需要后续设置）
      const tempPasswordHash = '$2b$10$placeholder'; // 占位符，需要用 set-passwords.ts 设置
      
      await prisma.user.create({
        data: {
          username: user.username,
          email: `${user.username}@mgmt.local`,
          passwordHash: tempPasswordHash,
          displayName: user.username,
          roles,
          permissions: {},
          status: user.is_locked ? 'LOCKED' : 'ACTIVE',
          settings: { language: 'zh', timezone: 'Asia/Shanghai' },
        },
      });
      console.log(`  + 创建: ${user.username} (${roles.join(', ')})`);
      created++;
    }
  }

  console.log(`\n✓ 用户迁移完成: 创建 ${created} 个, 更新 ${updated} 个\n`);

  await mysqlConnection.end();
  await prisma.$disconnect();

  console.log('⚠️  重要: 请运行以下命令设置密码:\n');
  console.log('   npx ts-node scripts/set-passwords.ts\n');
}

main().catch((e) => {
  console.error('❌ 迁移失败:', e);
  process.exit(1);
});
