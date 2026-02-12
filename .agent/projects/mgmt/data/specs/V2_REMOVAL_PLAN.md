# V2 (NestJS) 删除计划

> **计划日期:** 2026-02-12  
> **状态:** ⏳ 待审批  
> **前置条件:** V2→V3 最终审计已通过 (V2_V3_FINAL_AUDIT.md)  

---

## 📌 计划总览

```
Phase 1: 停止 V2 进程
Phase 2: 删除 V2 源码 (apps/api)
Phase 3: 删除 V2 专属配置文件
Phase 4: 清理 Prisma (V2 ORM，V3 使用 JPA/Hibernate)
Phase 5: 清理 V2 遗留脚本
Phase 6: 清理根 package.json 中的 V2 依赖
Phase 7: 更新 dev 脚本 (去掉 NestJS 引用)
Phase 8: 清理 monorepo 配置
Phase 9: 重新安装依赖 + 验证
```

---

## Phase 1: 停止 V2 进程

```bash
# 停止 NestJS (port 3001)
lsof -i :3001 -t | xargs kill 2>/dev/null || echo "V2 未运行"
```

**影响:** 零 — 前端已不连接 3001

---

## Phase 2: 删除 V2 后端源码 ⚠️ 核心操作

### 目标: `apps/api/` (整个目录)

```
apps/api/                          ← 删除整个目录
├── src/                           ← NestJS 源码 (112 子项)
│   ├── modules/auth/
│   ├── modules/users/
│   ├── modules/roles/
│   ├── modules/products/
│   ├── modules/logs/
│   ├── modules/vma/              ← 已被 V3 100% 覆盖
│   ├── app.controller.ts
│   └── app.module.ts
├── test/                          ← V2 测试
├── dist/                          ← V2 编译产物
├── node_modules/                  ← V2 独立依赖
├── package.json                   ← NestJS 依赖声明
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── eslint.config.mjs
├── data/                          ← ⚠️ 需检查是否有共用数据
└── logs/
```

> ⚠️ **注意:** `apps/api/data/` 目录需检查是否包含 V3/前端共用的静态数据（如 PDF 模板）。如有共用，需先迁移到 V3 或 apps/web。

---

## Phase 3: 删除 V2 专属配置文件

| 文件 | 说明 | 操作 |
|------|------|------|
| `.env.v2` | V2 环境变量 (含安全码、JWT密钥) | 🗑️ 删除 |
| `.env.v2.example` | V2 环境变量模板 | 🗑️ 删除 |

> ⚠️ `.env` (根目录) 需保留 — 可能包含 V3/前端共用配置

---

## Phase 4: 清理 Prisma (V2 ORM)

### 目标: `prisma/` (整个目录)

```
prisma/                            ← 删除整个目录
├── schema/                        ← Prisma schema (13 子项)
├── migrations/                    ← Prisma 迁移记录 (7 子项)
├── seeds/                         ← 种子数据
├── seed.ts                        ← 种子脚本
├── schema.prisma.bak
└── schema.prisma.old
```

> **理由:** V3 使用 JPA/Hibernate + Flyway 管理数据库 schema。
> Prisma 的 schema 和 migration 历史不再需要。
> 数据库表结构由 V3 Flyway migration 完全管理。

---

## Phase 5: 清理 V2 遗留脚本

| 文件 | 依赖 V2? | 操作 |
|------|----------|------|
| `scripts/dev.sh` | ✅ 引用 `nest start` | ✏️ 移除 NestJS 相关行 |
| `scripts/start-dev.sh` | 需检查 | ✏️ 更新或删除 |
| `scripts/stop-dev.sh` | 需检查 | ✏️ 更新或删除 |
| `scripts/migrate-users.ts` | Prisma 依赖 | 🗑️ 删除 (已完成迁移) |
| `scripts/restore-credentials.ts` | Prisma 依赖 | 🗑️ 删除 |
| `scripts/restore-users.ts` | Prisma 依赖 | 🗑️ 删除 |
| `scripts/set-passwords.ts` | Prisma 依赖 | 🗑️ 删除 |
| `scripts/fix-role-levels.js` | Prisma 依赖 | 🗑️ 删除 |
| `scripts/restore-credentials.sh` | Shell wrapper | 🗑️ 删除 |
| `scripts/seed-training-sops.py` | Python + DB 直连 | 🔒 保留 (不依赖 V2) |
| `scripts/migrate/` | 迁移脚本 | 🗑️ 删除 (已完成迁移) |

---

## Phase 6: 清理根 package.json

### 6.1 移除 V2 依赖

```jsonc
// 从 devDependencies 移除:
"prisma": "5.22.0"        // V2 ORM

// 从 dependencies 移除:
"@prisma/client": "5.22.0" // V2 ORM client
"bcrypt": "^6.0.0"         // V2 用, V3 用 Spring Security BCrypt
"@types/bcrypt": "^5.0.2"  // bcrypt 类型
"mysql2": "^3.16.3"        // Legacy MySQL (V1 遗留)
"dotenv": "^17.2.3"        // V2 环境加载, V3 用 application.yml

// 从 pnpm.onlyBuiltDependencies 移除:
"@nestjs/core"
"@prisma/client"
"@prisma/engines"
"bcrypt"
"prisma"
```

### 6.2 移除 V2 scripts

```jsonc
// 从 scripts 移除:
"db:generate"  // prisma generate
"db:push"      // prisma db push
"db:migrate"   // prisma migrate dev
"db:studio"    // prisma studio
```

### 6.3 保留的 scripts

```jsonc
// 保留 (仍然有用):
"build": "turbo build"        // 前端 build
"dev": "turbo dev"            // 前端 dev
"dev:safe" / "dev:bg" / etc.  // 需更新 dev.sh 后保留
"lint" / "test" / "clean"     // 工具链
"format"                      // Prettier
```

---

## Phase 7: 更新 dev.sh

修改 `scripts/dev.sh`:
1. 移除第 37-38 行 `pkill -f "nest start"` 相关行
2. 移除第 47 行 `pkill -9 -f "nest start"` 相关行
3. 移除端口检查中的 `3001` (第 62 行)
4. 移除端口状态中的 `3001` (第 142 行)
5. 更新注释 "MGMT V2" → "MGMT V3"

---

## Phase 8: 清理 monorepo 配置

### 8.1 `pnpm-workspace.yaml`

```yaml
# 当前:
packages:
  - apps/*        # 包含 apps/api (V2)
  - packages/*

# 修改后:
packages:
  - apps/web      # 只保留前端
  - packages/*

# 同时移除:
ignoredBuiltDependencies:
  - '@nestjs/core'      # ← 删除
  - '@prisma/client'    # ← 删除
  - '@prisma/engines'   # ← 删除
  - bcrypt              # ← 删除
  - prisma              # ← 删除
  # 保留:
  - unrs-resolver
```

### 8.2 `turbo.json` — 无需修改

turbo.json 是通用的 task 配置，不含 V2 特定逻辑。

---

## Phase 9: 重新安装 + 验证

```bash
# 1. 重新安装依赖
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 2. 验证前端正常启动
cd apps/web && pnpm dev

# 3. 验证 V3 正常
cd mgmt-v3 && ./gradlew bootRun

# 4. 验证 API 连通性
curl http://localhost:8080/api/v1/health
curl -H "Origin: http://localhost:3000" -X OPTIONS http://localhost:8080/api/v1/vma/employees
```

---

## 🔒 不删除的目录 (明确保留)

| 目录 | 理由 |
|------|------|
| `apps/web/` | Next.js 前端 — 继续使用 |
| `mgmt-v3/` | Spring Boot V3 后端 — 继续使用 |
| `packages/` | 共享包 (i18n 等) — 前端依赖 |
| `backend/` | Django Legacy 后端 — 历史参考 (独立不影响) |
| `.env` | 可能含共用配置 — 需单独审查 |
| `.agent/` | Agent 配置 — 继续使用 |
| `data/` | 共用数据文件 |
| `docs/` | 文档 |

---

## ⏱️ 执行顺序与回滚

### 执行顺序 (建议)

```
Step 1: 先 git commit 当前状态 (备份)
Step 2: Phase 1 — 停止进程
Step 3: Phase 2 — 删除 apps/api
Step 4: Phase 4 — 删除 prisma/
Step 5: Phase 3 — 删除 .env.v2 文件
Step 6: Phase 5 — 清理脚本
Step 7: Phase 6 — 清理 package.json
Step 8: Phase 7 — 更新 dev.sh
Step 9: Phase 8 — 更新 pnpm-workspace.yaml
Step 10: Phase 9 — 重装依赖 + 验证
Step 11: git commit "chore: remove V2 NestJS backend"
```

### 回滚方案

```bash
# 如果出问题, 一键回滚:
git revert HEAD
pnpm install
```

---

## 📊 预计影响

| 指标 | 数值 |
|------|------|
| 删除文件数 | ~250+ 文件 |
| 节省磁盘空间 | ~200MB+ (含 node_modules) |
| 移除依赖包数 | ~150+ npm 包 (NestJS 生态) |
| 前端影响 | **零** |
| V3 影响 | **零** |
| 风险等级 | **低** (有 git 回滚保底) |
