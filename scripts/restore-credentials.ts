/**
 * 🔒 不朽凭证恢复脚本 (Immortal Credentials Restore)
 * 
 * 用途: 快速恢复生产关键凭证，无需交互
 * 
 * 使用方法:
 *   cd apps/api && npx ts-node ../../scripts/restore-credentials.ts
 * 
 * 或使用快捷脚本:
 *   ./scripts/restore-credentials.sh
 * 
 * ═══════════════════════════════════════════════════════════════════
 * 🔐 不朽凭证 GROUND TRUTH (绝对不可更改!)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * 用户密码:
 *   - admin:  1522P
 *   - simon:  topmorrow
 *   - 其他:   12345
 * 
 * 安全码 (Security Codes):
 *   - L1 (Query):    7951
 *   - L2 (Modify):   1522
 *   - L3 (Database): 6130
 *   - L4 (System):   Caonima123!
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============================================
// 🔐 不朽凭证定义 - GROUND TRUTH
// ⚠️ 永远不能被修改! 这是系统的基石!
// ============================================
const IMMORTAL_CREDENTIALS = {
  users: [
    { username: 'admin', password: '1522P' },
    { username: 'simon', password: 'topmorrow' },
  ],
  // L1-L4 安全码 - 每级不同!
  securityCodes: {
    L1: '7951',        // Query level
    L2: '1522',        // Modify level  
    L3: '6130',        // Database level
    L4: 'Caonima123!', // System level (critical)
  },
  // 其他普通用户的默认密码
  defaultPassword: '12345',
};

async function main() {
  console.log('');
  console.log('🔒 ═══════════════════════════════════════════════════════════');
  console.log('   不朽凭证恢复工具 (Immortal Credentials Restore)');
  console.log('   GROUND TRUTH - 这些值永远不能被修改!');
  console.log('   ═══════════════════════════════════════════════════════════');
  console.log('');

  // 1. 恢复核心用户密码
  console.log('📝 恢复核心用户密码...');
  for (const { username, password } of IMMORTAL_CREDENTIALS.users) {
    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await prisma.user.updateMany({
        where: { username },
        data: { passwordHash: hash },
      });
      if (result.count > 0) {
        console.log(`   ✓ ${username}: 密码已恢复 (${password.substring(0, 2)}***)`);
      } else {
        console.log(`   ⚠ ${username}: 用户不存在`);
      }
    } catch (e) {
      console.log(`   ✗ ${username}: 恢复失败 - ${e}`);
    }
  }

  // 2. 恢复其他用户的默认密码
  console.log('');
  console.log('📝 恢复其他用户密码 (默认: 12345)...');
  try {
    const defaultHash = await bcrypt.hash(IMMORTAL_CREDENTIALS.defaultPassword, 10);
    const coreUsernames = IMMORTAL_CREDENTIALS.users.map(u => u.username);
    const result = await prisma.user.updateMany({
      where: { 
        username: { notIn: coreUsernames }
      },
      data: { passwordHash: defaultHash },
    });
    console.log(`   ✓ 已更新 ${result.count} 个其他用户`);
  } catch (e) {
    console.log(`   ✗ 恢复失败 - ${e}`);
  }

  // 3. 恢复安全码 (每级不同!)
  console.log('');
  console.log('🔑 恢复安全码 (L1-L4 各有不同!)...');
  const levelDescriptions: Record<string, string> = {
    L1: 'Query',
    L2: 'Modify',
    L3: 'Database',
    L4: 'System',
  };
  
  for (const [level, code] of Object.entries(IMMORTAL_CREDENTIALS.securityCodes)) {
    try {
      const hash = await bcrypt.hash(code, 10);
      await prisma.securityCode.upsert({
        where: { level_isActive: { level, isActive: true } },
        update: { codeHash: hash },
        create: {
          level,
          codeHash: hash,
          isActive: true,
        },
      });
      // 只显示部分安全码
      const maskedCode = code.length > 4 
        ? code.substring(0, 2) + '***' 
        : code.substring(0, 1) + '***';
      console.log(`   ✓ ${level} (${levelDescriptions[level]}): ${maskedCode}`);
    } catch (e) {
      console.log(`   ✗ ${level}: 恢复失败 - ${e}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ 凭证恢复完成!');
  console.log('');
  console.log('   登录凭证:');
  console.log('     用户名: admin');
  console.log('     密码:   1522P');
  console.log('');
  console.log('   安全码 GROUND TRUTH:');
  console.log('     L1 (Query):    7951');
  console.log('     L2 (Modify):   1522');
  console.log('     L3 (Database): 6130');
  console.log('     L4 (System):   Caonima123!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
