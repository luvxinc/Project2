/**
 * 用户密码设置脚本 - 用 bcrypt 设置用户密码和安全码
 * 
 * 使用方法:
 *   npx ts-node scripts/set-passwords.ts
 * 
 * 说明:
 *   此脚本从老系统读取用户列表，然后您需要提供每个用户的明文密码，
 *   脚本会用 bcrypt 加密后存储到 V2 数据库。
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

// 从命令行读取输入
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('🔐 V2 密码设置工具\n');
  console.log('此工具会将您提供的明文密码用 bcrypt 加密存储到 V2 数据库。\n');

  // 1. 获取所有用户
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  });

  console.log(`找到 ${users.length} 个用户:\n`);
  users.forEach((u, i) => console.log(`  ${i + 1}. ${u.username}`));
  console.log('');

  // 2. 询问是否要设置用户密码
  const setUserPwd = await prompt('是否要设置用户密码? (y/n): ');
  
  if (setUserPwd.toLowerCase() === 'y') {
    for (const user of users) {
      const password = await prompt(`  输入 ${user.username} 的密码 (留空跳过): `);
      if (password.trim()) {
        const hash = await bcrypt.hash(password.trim(), 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: hash },
        });
        console.log(`    ✓ ${user.username} 密码已更新`);
      }
    }
    console.log('');
  }

  // 3. 设置安全码
  console.log('设置安全码 (L1-L4):\n');
  
  const levels = ['L1', 'L2', 'L3', 'L4'];
  const descriptions = {
    'L1': '查询级 (Query)',
    'L2': '修改级 (Modify)', 
    'L3': '运维级 (DB Admin)',
    'L4': '系统级 (Critical)',
  };

  for (const level of levels) {
    const code = await prompt(`  ${level} ${descriptions[level as keyof typeof descriptions]} 安全码 (留空跳过): `);
    if (code.trim()) {
      const hash = await bcrypt.hash(code.trim(), 10);
      await prisma.securityCode.upsert({
        where: { level_isActive: { level, isActive: true } },
        update: { codeHash: hash },
        create: {
          level,
          codeHash: hash,
          isActive: true,
        },
      });
      console.log(`    ✓ ${level} 安全码已设置`);
    }
  }

  console.log('\n✅ 完成!\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 错误:', e);
  process.exit(1);
});
