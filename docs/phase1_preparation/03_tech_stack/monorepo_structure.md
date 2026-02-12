# Monorepo 目录结构设计

## 根目录结构

```
MGMTV2/
├── apps/                        # 应用层
│   ├── api/                     # NestJS 后端
│   ├── web/                     # Next.js Web 端
│   └── mobile/                  # React Native 移动端
│
├── packages/                    # 共享包
│   ├── shared/                  # 共享类型、常量、工具
│   ├── api-client/              # OpenAPI 生成的客户端
│   ├── ui/                      # 共享 UI 组件 (可选)
│   └── config/                  # 统一配置 (eslint/prettier/tsconfig)
│
├── prisma/                      # 数据库 Schema
│   ├── schema.prisma
│   └── migrations/
│
├── ops/                         # 运维脚本
│   ├── docker/
│   ├── scripts/
│   └── ci/
│
├── docs/                        # 文档
│   ├── api/                     # API 文档
│   ├── architecture/            # 架构文档
│   └── v2_migration/            # 迁移文档
│
├── data/                        # 数据目录 (gitignore)
│   ├── backups/
│   ├── exports/
│   └── uploads/
│
├── package.json                 # 根 package.json
├── pnpm-workspace.yaml          # pnpm 工作区配置
├── turbo.json                   # Turborepo 配置
├── tsconfig.base.json           # 基础 TypeScript 配置
├── .env.example                 # 环境变量模板
└── docker-compose.yml           # 本地开发容器
```

---

## apps/api/ (NestJS 后端)

```
apps/api/
├── src/
│   ├── main.ts                  # 入口
│   ├── app.module.ts            # 根模块
│   │
│   ├── modules/                 # 业务模块 (按领域划分)
│   │   ├── auth/                # 认证模块
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   ├── guards/
│   │   │   └── strategies/
│   │   │
│   │   ├── users/               # 用户管理
│   │   ├── products/            # 产品管理
│   │   ├── inventory/           # 库存管理
│   │   ├── purchase/            # 采购管理
│   │   │   ├── suppliers/
│   │   │   ├── orders/
│   │   │   ├── shipments/
│   │   │   └── receipts/
│   │   ├── sales/               # 销售管理
│   │   ├── finance/             # 财务管理
│   │   └── audit/               # 审计日志
│   │
│   ├── common/                  # 通用组件
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── pipes/
│   │
│   └── config/                  # 配置
│       ├── database.config.ts
│       ├── auth.config.ts
│       └── app.config.ts
│
├── test/                        # 测试
├── package.json
├── nest-cli.json
└── tsconfig.json
```

---

## apps/web/ (Next.js Web 端)

```
apps/web/
├── src/
│   ├── app/                     # App Router
│   │   ├── layout.tsx           # 根布局
│   │   ├── page.tsx             # 首页
│   │   ├── (auth)/              # 认证路由组
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/         # 仪表板路由组
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── sales/
│   │   │   ├── purchase/
│   │   │   ├── inventory/
│   │   │   ├── finance/
│   │   │   ├── products/
│   │   │   ├── db-admin/
│   │   │   ├── user-admin/
│   │   │   └── audit/
│   │   └── api/                 # API Routes (BFF)
│   │
│   ├── components/              # 组件
│   │   ├── ui/                  # 基础 UI 组件
│   │   ├── forms/               # 表单组件
│   │   ├── tables/              # 表格组件
│   │   └── layout/              # 布局组件
│   │
│   ├── hooks/                   # 自定义 Hooks
│   ├── lib/                     # 工具库
│   ├── stores/                  # Zustand 状态
│   └── styles/                  # 样式
│
├── public/                      # 静态资源
├── package.json
├── next.config.js
└── tsconfig.json
```

---

## apps/mobile/ (React Native)

```
apps/mobile/
├── src/
│   ├── app/                     # Expo Router
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── (auth)/
│   │   └── (tabs)/
│   │
│   ├── components/
│   ├── hooks/
│   └── lib/
│
├── app.json
├── package.json
└── tsconfig.json
```

---

## packages/shared/ (共享类型)

```
packages/shared/
├── src/
│   ├── types/                   # 类型定义
│   │   ├── product.ts
│   │   ├── inventory.ts
│   │   ├── purchase.ts
│   │   ├── sales.ts
│   │   ├── finance.ts
│   │   └── user.ts
│   │
│   ├── constants/               # 常量
│   │   ├── permissions.ts
│   │   ├── status.ts
│   │   └── config.ts
│   │
│   ├── utils/                   # 工具函数
│   │   ├── format.ts
│   │   ├── validate.ts
│   │   └── calculate.ts
│   │
│   └── index.ts                 # 导出入口
│
├── package.json
└── tsconfig.json
```

---

## 配置文件

### pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {}
  }
}
```

### package.json (根)
```json
{
  "name": "mgmt-v2",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter api prisma migrate dev",
    "db:generate": "pnpm --filter api prisma generate"
  },
  "devDependencies": {
    "turbo": "^1.10.0"
  },
  "packageManager": "pnpm@8.0.0"
}
```

---

## 初始化命令

```bash
# 1. 创建目录
mkdir -p MGMTV2/{apps,packages,prisma,ops,docs,data}

# 2. 初始化 pnpm
cd MGMTV2
pnpm init

# 3. 创建 pnpm-workspace.yaml
echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml

# 4. 安装 Turborepo
pnpm add -D turbo

# 5. 创建 NestJS 应用
cd apps
npx @nestjs/cli new api --package-manager pnpm

# 6. 创建 Next.js 应用
npx create-next-app@latest web --typescript --tailwind --app

# 7. 创建 Expo 应用
npx create-expo-app mobile --template tabs
```

---

*Last Updated: 2026-02-04*
