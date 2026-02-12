# 技术栈对比分析

## 当前技术栈 vs 目标技术栈

| 层级 | 当前 | 目标 | 迁移成本 |
|------|------|------|----------|
| **语言** | Python 3.12 | TypeScript 5.x | 🔴 高 |
| **后端框架** | Django 6.0 | NestJS 10.x | 🔴 高 |
| **数据库** | MySQL 8.x | PostgreSQL 16 | 🟡 中 |
| **ORM** | Django ORM + SQLAlchemy | Prisma | 🟡 中 |
| **Web 前端** | Django Templates + HTMX | Next.js 14 + React 18 | 🔴 高 |
| **Mobile** | 无 | React Native + Expo | 🟢 新增 |
| **API 规范** | 无规范 | OpenAPI 3.0 | 🟢 新增 |

---

## 后端框架对比

### Django vs NestJS

| 特性 | Django | NestJS |
|------|--------|--------|
| 语言 | Python | TypeScript |
| 架构模式 | MTV (Model-Template-View) | 模块化 + 依赖注入 |
| ORM | Django ORM (内置) | Prisma/TypeORM (可选) |
| Admin 后台 | 内置 (一行代码) | 需自建 |
| 认证系统 | 内置 | Passport.js (需配置) |
| Session 管理 | 内置 | 需实现 |
| 生态成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 类型安全 | 弱 (动态类型) | 强 (静态类型) |
| 性能 | 中 | 高 (V8) |
| 学习曲线 | 低 | 中 |

### NestJS 优势
- ✅ TypeScript 全栈类型共享
- ✅ 依赖注入，易于测试
- ✅ 装饰器语法清晰
- ✅ 与 React 生态一致 (JS 全栈)

### NestJS 劣势
- ❌ 无内置 Admin 后台
- ❌ 需要更多样板代码
- ❌ Session 管理需自行实现
- ❌ 认证系统需手动配置

---

## ORM 对比

### Django ORM vs Prisma

| 特性 | Django ORM | Prisma |
|------|------------|--------|
| 语言 | Python | TypeScript |
| Schema 定义 | Python Class | Prisma Schema (DSL) |
| 迁移工具 | makemigrations | prisma migrate |
| 类型安全 | 无 | ✅ 完整类型推断 |
| 查询构建 | Queryset | Fluent API |
| 原生 SQL | `raw()` | `$queryRaw` |
| N+1 检测 | 无 | ✅ 内置 |

### Prisma Schema 示例
```prisma
model Product {
  id          Int       @id @default(autoincrement())
  sku         String    @unique
  name        String
  category    String?
  cogs        Decimal   @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  
  fifoLayers  FifoLayer[]
  orderItems  PurchaseOrderItem[]
}
```

---

## 前端框架对比

### Django Templates + HTMX vs Next.js + React

| 特性 | Django Templates | Next.js |
|------|------------------|---------|
| 渲染模式 | SSR (服务端渲染) | SSR + CSR + SSG |
| 交互能力 | HTMX (有限) | React (完整) |
| 状态管理 | 无 | React Query + Zustand |
| 组件化 | 有限 (include/extend) | 完整 (JSX) |
| 类型安全 | 无 | ✅ TypeScript |
| 开发体验 | 快速 | 需配置 |
| 复杂交互 | 困难 | 容易 |

### 何时选择 Next.js
- ✅ 需要复杂前端交互 (拖拽、实时更新)
- ✅ 需要与 Mobile 共享类型
- ✅ 团队熟悉 React

### 何时选择 Django Templates
- ✅ CRUD 为主的应用
- ✅ 快速开发
- ✅ 不需要 Mobile

---

## 数据库对比

### MySQL vs PostgreSQL

| 特性 | MySQL | PostgreSQL |
|------|-------|------------|
| JSONB 支持 | JSON (存储型) | JSONB (可索引) |
| 全文搜索 | 有限 | ✅ 强大 |
| CTE (递归查询) | 8.0+ | ✅ 原生 |
| 并发控制 | 表锁/行锁 | MVCC |
| GIS 支持 | 有限 | PostGIS |
| 扩展性 | 有限 | ✅ 丰富扩展 |

---

## 推荐技术栈

基于项目需求，推荐以下技术组合：

### 后端
```
NestJS 10.x
├── TypeScript 5.x
├── Prisma (ORM)
├── PostgreSQL 16
├── Redis (缓存/队列)
├── BullMQ (任务队列)
└── Passport.js (认证)
```

### Web
```
Next.js 14 (App Router)
├── React 18
├── TypeScript 5.x
├── TanStack Query (数据获取)
├── TanStack Table (表格)
├── React Hook Form + Zod (表单)
├── Zustand (状态管理)
└── Ant Design / shadcn/ui (UI 组件)
```

### Mobile
```
React Native + Expo
├── Expo Router
├── TypeScript
└── 共享 packages/api-client
```

### DevOps
```
Docker + Docker Compose
├── GitHub Actions (CI/CD)
├── PostgreSQL (容器化)
├── Redis (容器化)
└── S3/MinIO (对象存储)
```

---

*Last Updated: 2026-02-04*
