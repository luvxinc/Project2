# MGMT V2 - AI Agent 架构规范 (宪法级)

> **本文档是 AI Agent 在本项目中的最高行为准则。**
> **任何代码生成、修改、建议都必须遵循本规范。**

---

## 0. 不可妥协的目标

1. **每个模块独立、边界清晰** - 可单独测试、可替换
2. **业务规则不依赖 UI** - 不依赖数据库实现细节
3. **新功能只增加少量文件** - 不会把旧代码弄脏 (开闭原则)
4. **类型变更编译期爆炸** - 通过 TypeScript 在编译期发现问题，而不是线上

---

## 1. 技术栈 (硬性规定)

| 层级 | 技术 | 不可替代 |
|------|------|----------|
| **语言** | TypeScript 5.x | ✅ |
| **Monorepo** | pnpm + Turborepo | ✅ |
| **后端** | NestJS 10.x | ✅ |
| **数据库** | PostgreSQL 16 + Prisma | ✅ |
| **Web** | Next.js 14 (App Router) | ✅ |
| **Mobile** | React Native + Expo | ✅ |
| **UI 组件** | shadcn/ui | ✅ |
| **API 契约** | OpenAPI 3.0 → 生成 TS Client | ✅ |

---

## 2. Monorepo 目录结构 (强制)

```
MGMTV2/
├── apps/
│   ├── api/                 # NestJS 后端
│   ├── web/                 # Next.js Web
│   └── mobile/              # React Native
│
├── packages/
│   ├── shared/              # 纯 TS: 类型、常量、工具
│   ├── api-client/          # OpenAPI 生成的客户端
│   ├── ui/                  # shadcn 二次封装组件
│   └── config/              # eslint/prettier/tsconfig
│
├── prisma/                  # 数据库 Schema
└── ops/                     # 运维脚本
```

### 硬约束

| 规则 | 违反后果 |
|------|----------|
| Web/Mobile **禁止**手写 DTO 类型 | 必须从 `api-client` 或 `shared` 引用 |
| `shared` **禁止**引入 React/Node 运行时依赖 | 必须保持纯净可复用 |
| 每个 `apps/*` 只能引用 `packages/*` | 禁止 `apps/web` 直接引用 `apps/api` |

---

## 3. 后端 DDD 分层 (强制)

### 每个业务模块必须包含以下目录结构：

```
apps/api/src/modules/{module_name}/
├── domain/                  # 领域层 (最稳定)
│   ├── entities/            # 实体
│   ├── value-objects/       # 值对象
│   ├── services/            # 领域服务
│   └── events/              # 领域事件
│
├── application/             # 应用层 (用例)
│   ├── use-cases/           # 一个文件一个用例
│   ├── commands/            # 写操作命令
│   └── queries/             # 读操作查询
│
├── infrastructure/          # 基础设施层 (可替换)
│   ├── repositories/        # Prisma 实现
│   ├── external/            # 外部服务调用
│   └── cache/               # 缓存实现
│
├── api/                     # 接口层 (Controller)
│   ├── controllers/
│   ├── dto/
│   └── guards/
│
└── {module}.module.ts       # NestJS 模块声明
```

### 分层铁律

| 规则 | 说明 | 检查方式 |
|------|------|----------|
| **Controller 禁止写业务逻辑** | 只做入参校验、调用 UseCase、返回结果 | Code Review |
| **Domain 层禁止 import Prisma** | 领域层不依赖具体实现 | ESLint Rule |
| **Domain 层禁止 import Redis/HTTP** | 保持纯净 | ESLint Rule |
| **模块间禁止跨库 JOIN** | 通过 API 调用 | Code Review |
| **禁止直接调用其他模块的 Repository** | 通过 Service 暴露 | Code Review |
| **所有写接口必须支持幂等** | Idempotency-Key Header | 统一中间件 |

### 简化版 (Phase 2 使用)

如模块较简单，可使用简化结构：

```
apps/api/src/modules/{module_name}/
├── {module}.module.ts
├── {module}.controller.ts
├── {module}.service.ts      # 业务逻辑
├── {module}.repository.ts   # 数据访问
└── dto/
    ├── create-{module}.dto.ts
    └── update-{module}.dto.ts
```

**何时需要完整 DDD 结构**：
- 业务逻辑复杂
- 有多个聚合根
- 需要领域事件

---

## 4. 前端组件规范 (强制)

### 4.1 禁止直接使用 shadcn 原始组件

页面**必须**通过封装层组件构建：

| 封装组件 | 用途 | 优先级 |
|----------|------|--------|
| `<DataTable>` | 所有表格 (基于 TanStack Table) | P0 |
| `<FormWrapper>` | 表单 (RHF + Zod) | P0 |
| `<PageLayout>` | 页面布局 | P0 |
| `<PageHeader>` | 页头 (标题 + 面包屑 + 操作) | P0 |
| `<ConfirmDialog>` | 确认弹窗 | P0 |
| `<PermissionGate>` | 权限控制 | P0 |
| `<FilterBar>` | 筛选条件栏 | P1 |
| `<AsyncTaskPanel>` | 异步任务 (导入导出) | P1 |
| `<EmptyState>` | 空状态 | P1 |
| `<LoadingSkeleton>` | 加载骨架 | P1 |

### 4.2 页面结构模板

所有列表页必须遵循此结构：

```tsx
// ✅ 正确
export default function ProductListPage() {
  return (
    <PageLayout>
      <PageHeader title="产品管理" actions={<CreateButton />} />
      <FilterBar filters={filterConfig} />
      <DataTable columns={columns} data={data} />
    </PageLayout>
  )
}

// ❌ 错误 - 禁止在页面直接拼 shadcn
export default function ProductListPage() {
  return (
    <div className="p-4">
      <h1>产品管理</h1>
      <Table>
        <TableHeader>...</TableHeader>  // 直接用 shadcn
      </Table>
    </div>
  )
}
```

### 4.3 铁律

| 规则 | 说明 |
|------|------|
| **同类页面用同一个模板** | 列表页、详情页、表单页各一个模板 |
| **禁止每个页面自己实现表格** | 必须用 `<DataTable>` |
| **禁止每个页面自己实现表单** | 必须用 `<FormWrapper>` |
| **禁止硬编码样式** | 使用 CSS 变量和主题 Token |

---

## 5. API 设计规范 (强制)

### 5.1 RESTful 命名

```
✅ /api/v1/products
✅ /api/v1/products/:id
✅ /api/v1/products/:id/inventory
✅ /api/v1/purchase-orders

❌ /api/v1/getProducts
❌ /api/v1/product_list
❌ /api/v1/createPO
```

### 5.2 响应格式

```typescript
// 成功
{
  "success": true,
  "data": { ... },
  "pagination"?: { page, pageSize, total, totalPages }
}

// 错误
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details"?: [...]
  }
}
```

### 5.3 安全验证

| 安全等级 | 需要 | 操作类型 |
|----------|------|----------|
| L1 | Token | 查询操作 |
| L2 | Token + 密码确认 | 修改操作 |
| L3 | Token + 安全码 | 数据库操作 |
| L4 | Token + 系统码 | 系统级操作 |

---

## 6. 类型共享规范 (强制)

### 6.1 类型定义位置

| 类型 | 位置 | 说明 |
|------|------|------|
| 业务实体类型 | `packages/shared/types/` | 如 Product, Order |
| DTO 类型 | `packages/api-client/` (自动生成) | 从 OpenAPI 生成 |
| 枚举/常量 | `packages/shared/constants/` | 如 OrderStatus |
| 工具类型 | `packages/shared/utils/` | 如 Pagination |

### 6.2 禁止行为

```typescript
// ❌ 禁止在前端手写后端已有的类型
// apps/web/types/product.ts
interface Product {
  id: number;
  sku: string;
}

// ✅ 必须从 shared 或 api-client 引用
import { Product } from '@mgmt/shared/types';
import { ProductDto } from '@mgmt/api-client';
```

---

## 7. 国际化 (i18n) 规范 (强制)

> **从第一行代码开始就必须支持多语言，禁止后期补救。**

### 7.1 技术方案

| 层级 | 方案 | 库 |
|------|------|-----|
| **后端** | 错误消息/邮件模板 | `nestjs-i18n` |
| **Web** | 界面文本 | `next-intl` 或 `react-i18next` |
| **Mobile** | 界面文本 | `react-i18next` |
| **共享** | 翻译 Key | `packages/shared/i18n/` |

### 7.2 目录结构

```
packages/shared/i18n/
├── locales/
│   ├── en/
│   │   ├── common.json       # 通用词汇
│   │   ├── sales.json        # 销售模块
│   │   ├── purchase.json     # 采购模块
│   │   └── ...
│   └── zh/
│       ├── common.json
│       ├── sales.json
│       └── ...
└── index.ts                  # 类型导出
```

### 7.3 翻译 Key 命名规范

```
{module}.{page}.{element}

# 示例
sales.list.title              # 销售 - 列表页 - 标题
sales.list.column_sku         # 销售 - 列表页 - SKU 列
purchase.po.create_button     # 采购 - PO - 创建按钮
common.actions.save           # 通用 - 操作 - 保存
common.actions.cancel         # 通用 - 操作 - 取消
common.errors.required        # 通用 - 错误 - 必填
```

### 7.4 铁律

| 规则 | 说明 |
|------|------|
| **禁止硬编码文本** | 所有用户可见文本必须走 i18n |
| **新建页面必须同时创建翻译文件** | 不能只写中文后期再翻译 |
| **翻译 Key 必须有类型定义** | TypeScript 编译时检查 Key 是否存在 |
| **默认语言为英文** | 中文作为第二语言 |

### 7.5 代码示例

#### 后端
```typescript
// ❌ 禁止
throw new BadRequestException('SKU 不能为空');

// ✅ 正确
import { I18nService } from 'nestjs-i18n';
throw new BadRequestException(this.i18n.t('common.errors.sku_required'));
```

#### 前端
```tsx
// ❌ 禁止
<Button>保存</Button>
<p>请填写必填项</p>

// ✅ 正确
import { useTranslations } from 'next-intl';

const t = useTranslations('common');
<Button>{t('actions.save')}</Button>
<p>{t('errors.required')}</p>
```

### 7.6 支持的语言

| 代码 | 语言 | 状态 |
|------|------|------|
| `en` | English | 🟢 主语言 |
| `zh` | 简体中文 | 🟢 支持 |

---

## 8. 代码生成模板

### 7.1 生成新模块

```bash
pnpm gen:module <module-name>

# 生成结构:
# apps/api/src/modules/<module-name>/
# ├── <module>.module.ts
# ├── <module>.controller.ts
# ├── <module>.service.ts
# ├── <module>.repository.ts
# └── dto/
```

### 7.2 生成新页面

```bash
pnpm gen:page <module>/<page-type>

# page-type: list | detail | form | wizard
```

---

## 8. AI Agent 行为规范

### 8.1 编写代码时必须

1. ✅ 遵循本文档所有规范
2. ✅ 使用封装组件，不直接用 shadcn
3. ✅ 从 `shared` 或 `api-client` 引用类型
4. ✅ Controller 只做路由，不写业务
5. ✅ 新模块使用 DDD 分层结构

### 8.2 禁止行为

1. ❌ 在页面直接拼 shadcn 原始组件
2. ❌ 在前端手写 DTO 类型
3. ❌ 在 Controller 写业务逻辑
4. ❌ Domain 层 import Prisma/Redis
5. ❌ 跨模块直接调用 Repository
6. ❌ 硬编码样式

### 8.3 代码审查清单

每次提交代码前检查：

- [ ] 是否使用了封装组件？
- [ ] 类型是否从 shared/api-client 引用？
- [ ] Controller 是否只做路由？
- [ ] 是否有跨模块直接依赖？
- [ ] 是否符合 RESTful API 规范？

---

## 9. 文档更新

本规范由项目负责人维护，Agent 不得自行修改。

如发现规范与实际开发冲突，应：
1. 记录冲突点
2. 与用户讨论
3. 用户决定后更新规范

---

*Version: 1.0.0*
*Created: 2026-02-04*
*Last Updated: 2026-02-04*
