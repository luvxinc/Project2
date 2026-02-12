---
name: frontend
description: 前端架构师 — Next.js + React + TypeScript。负责页面/组件/API Client/主题/i18n/错误监控/埋点。
---

# 前端规范 — Next.js + React (保留 & 增强)

> **你是前端架构师。你的职责是: 设计+实现前端页面、组件体系、API 对接、主题系统、国际化。**
> **⚠️ 本文件 ~12KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `技术栈`, `版本`, `依赖` | → §1 技术栈 |
| `目录`, `文件结构`, `组织` | → §2 目录结构 |
| `组件`, `封装`, `props`, `UI` | → §3 组件封装 |
| `API`, `client`, `openapi`, `fetch` | → §4 API Client |
| `主题`, `theme`, `暗色`, `light` | → §5 主题系统 |
| `解耦`, `前后端` | → §6 解耦点 |
| `i18n`, `翻译`, `多语言` | → §7 i18n |
| `sentry`, `错误`, `监控` | → §8 错误监控 |
| `埋点`, `分析`, `analytics` | → §9 埋点 |

---

> **企业级前端最佳实践: Next.js App Router + React + TypeScript + 设计系统。**
> **本文件是泛化模板。项目特定的目录结构请参考 `projects/{project}/` 目录。**

---

## 1. 技术栈

| 技术 | 版本 | 状态 | 用途 |
|------|------|------|------|
| **Next.js** | 16.x (App Router) | ✅ 保留 | SSR/ISR + 路由 + 中间件 |
| **React** | 19.x | ✅ 保留 | UI 核心 |
| **TypeScript** | 5.x | ✅ 保留 | 类型安全 |
| **TailwindCSS** | 4.x | ✅ 保留 | 样式系统 |
| **Radix UI** | latest | ✅ 保留 | 无头组件原语 |
| **shadcn/ui** | latest | ✅ 保留 | 二次封装组件 |
| **@tanstack/react-query** | 5.x | ✅ 保留 | 服务端状态管理 |
| **@tanstack/react-table** | 8.x | ✅ 保留 | 轻量表格 (简单页面) |
| **AG Grid** | Enterprise | 🆕 新增 | 企业级表格 (百万行/Excel 导出/拖拽) |
| **next-intl** | 4.x | ✅ 保留 | 国际化 |
| **next-themes** | latest | ✅ 保留 | 主题切换 |
| **Anime.js** | 4.x | ✅ 保留 | 高级动画 |
| **Lucide React** | latest | ✅ 保留 | 图标 |
| **Sonner** | latest | ✅ 保留 | Toast 通知 |
| **Apache ECharts** | 5.x | 🆕 新增 | 报表/图表可视化 |
| **openapi-fetch** | latest | 🆕 新增 | OpenAPI TS Client 自动生成 |

---

## 2. 目录结构

```
apps/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # 认证相关页面 (登录/SSO)
│   │   ├── (dashboard)/              # 主应用 (需要认证)
│   │   │   ├── layout.tsx            # Dashboard 布局 (Sidebar + Header)
│   │   │   ├── page.tsx              # 首页 Hub
│   │   │   ├── users/                # 用户管理
│   │   │   ├── products/             # 产品管理
│   │   │   ├── {module}/                  # 业务模块
│   │   │   │   ├── employees/
│   │   │   │   ├── training/
│   │   │   │   ├── {sub-module}/
│   │   │   │   │   ├── inventory/
│   │   │   │   │   ├── clinical-case/
│   │   │   │   │   ├── overview/
│   │   │   │   │   └── demo-inventory/
│   │   │   │   └── layout.tsx
│   │   │   ├── purchase/             # 采购
│   │   │   ├── sales/                # 销售
│   │   │   ├── inventory/            # 库存
│   │   │   ├── finance/              # 财务
│   │   │   ├── logs/                 # 日志
│   │   │   └── admin/                # 系统管理
│   │   ├── layout.tsx                # Root Layout
│   │   └── globals.css               # 全局样式
│   │
│   ├── components/                   # 封装组件
│   │   ├── ui/                       # shadcn 二次封装
│   │   ├── data-table/               # DataTable 组件 (TanStack)
│   │   ├── ag-grid/                  # AG Grid 主题化封装
│   │   ├── charts/                   # ECharts 封装
│   │   ├── modal/                    # 统一弹窗
│   │   ├── form/                     # 表单封装 (RHF + Zod)
│   │   └── layout/                   # 布局组件 (Sidebar, Header, Hub)
│   │
│   ├── contexts/                     # React Context
│   │   ├── ThemeContext.tsx           # iOS/macOS 双主题
│   │   ├── AuthContext.tsx            # 认证状态
│   │   └── PermissionContext.tsx      # 权限状态
│   │
│   ├── lib/                          # 工具库
│   │   ├── api/                      # API Client (OpenAPI 生成)
│   │   ├── hooks/                    # 自定义 Hooks
│   │   └── utils/                    # 工具函数
│   │
│   └── styles/                       # 样式
│       └── ag-grid-theme.css         # AG Grid 主题适配
│
├── public/                           # 静态资源
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 3. 组件封装规范 (强制)

### 3.1 禁止直接使用原始组件

| 使用场景 | 必须使用 | 禁止使用 |
|----------|---------|----------|
| 简单表格 (<1000行) | `<DataTable>` (TanStack) | 原始 `<table>` |
| 企业表格 (>1000行) | `<EnterpriseGrid>` (AG Grid) | 原始 AG Grid |
| 表单 | `<FormWrapper>` (RHF + Zod) | 原始 `<form>` |
| 图表 | `<Chart>` (ECharts 封装) | 原始 ECharts |
| 弹窗 | `<Modal>` (Radix Dialog 封装) | 原始 `<dialog>` |
| 确认 | `<ConfirmDialog>` | `window.confirm()` |
| 页面布局 | `<PageLayout>` | 自行拼 `<div>` |
| 权限控制 | `<PermissionGate>` | 手动 if/else |

### 3.2 页面模板

```tsx
// ✅ 标准列表页
export default function ProductListPage() {
  const t = useTranslations('products');
  const { data, isLoading } = useProducts();

  return (
    <PageLayout>
      <PageHeader
        title={t('list.title')}
        actions={<CreateButton onClick={handleCreate} />}
      />
      <FilterBar filters={filterConfig} />
      <DataTable columns={columns} data={data} loading={isLoading} />
    </PageLayout>
  );
}

// ✅ 企业级报表页 (使用 AG Grid)
export default function SalesReportPage() {
  const t = useTranslations('sales');

  return (
    <PageLayout>
      <PageHeader title={t('report.title')} />
      <EnterpriseGrid
        columnDefs={reportColumns}
        rowData={data}
        enableExcelExport
        enablePivotMode
        enableCharts
      />
    </PageLayout>
  );
}
```

---

## 4. API Client (OpenAPI 自动生成)

### 4.1 工作流

```
Spring Boot (后端)
    ↓ springdoc 自动生成
OpenAPI 3.0 Spec (openapi.json)
    ↓ openapi-typescript 生成
TypeScript Client (packages/api-client/)
    ↓ 前端 import
React Query Hooks
```

### 4.2 使用方式

```typescript
// packages/api-client/generated.ts (自动生成, 禁止手动修改)
export interface paths {
  "/api/v1/products": {
    get: { responses: { 200: { content: { "application/json": ProductListResponse } } } };
    post: { requestBody: { content: { "application/json": CreateProductCommand } } };
  };
}

// lib/hooks/useProducts.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { client } from '@/lib/api/client';

export function useProducts(params?: ProductQuery) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => client.GET('/api/v1/products', { params: { query: params } }),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductCommand) =>
      client.POST('/api/v1/products', { body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
```

### 4.3 铁律

| 规则 | 说明 |
|------|------|
| **禁止手写 API 类型** | 必须从 `api-client` 自动生成 |
| **禁止手写 fetch** | 必须通过 OpenAPI Client + React Query |
| **API 类型变更自动传播** | 后端改了 DTO → 重新生成 → 前端编译报错 → 修复 |

---

## 5. 主题系统 (保留)

Apple Design System 规范 (保留)：

- **ThemeContext** — 语义化主题引擎
- **themeColors[theme]** — 暗色/亮色语义色值
- **CSS Variables** — 全局 Token
- **Glassmorphism** — 毛玻璃效果
- **Hub Pages** — iPad 风格模块首页
- **Animated Sub-nav** — 交错入场动画

### AG Grid 主题适配

```css
/* styles/ag-grid-theme.css */
.ag-theme-custom {
  --ag-background-color: var(--bg-primary);
  --ag-header-background-color: var(--bg-secondary);
  --ag-row-hover-color: var(--bg-hover);
  --ag-border-color: var(--border-primary);
  --ag-font-family: var(--font-sans);
  --ag-font-size: 13px;
  --ag-row-height: 44px;
  --ag-header-height: 48px;
}

[data-theme="dark"] .ag-theme-custom {
  --ag-background-color: var(--bg-primary-dark);
  --ag-header-background-color: var(--bg-secondary-dark);
  --ag-foreground-color: var(--text-primary-dark);
}
```

---

## 6. 前端与后端的解耦点

```
┌──────────────────┐         ┌──────────────────┐
│    Next.js Web   │         │  Spring Boot API  │
│                  │         │                   │
│  React Query  ───┼── HTTP ─┼──→ Controller     │
│  OpenAPI Client  │ REST    │    UseCase        │
│                  │         │    Domain          │
│  零后端代码依赖   │         │    JPA            │
└──────────────────┘         └──────────────────┘
```

> **前端只依赖 OpenAPI Spec，不依赖具体语言。**
> **前端只依赖 OpenAPI Spec, 后端框架可自由替换, 前端完全无感。**

---

## 7. i18n 管理体系

### 7.1 命名空间策略

```
packages/shared/i18n/
├── en/
│   ├── core.json         # 全局共用 (按钮/状态/通用)
│   ├── users.json        # 用户模块
│   ├── products.json     # 产品模块
│   ├── vma.json          # VMA 模块
│   └── {module}.json     # 每模块一文件
└── zh/
    └── (同上)
```

### 7.2 使用规范

```tsx
// ✅ 使用 namespace
const t = useTranslations('products');
return <h1>{t('list.title')}</h1>;

// ❌ 禁止硬编码字符串
return <h1>Product List</h1>;

// ✅ 动态键
return <span>{t(`status.${product.status}`)}</span>;

// ✅ 复数
return <span>{t('items', { count: items.length })}</span>;
```

### 7.3 覆盖率强制

| 规则 | 说明 |
|------|------|
| **100% 覆盖** | 所有用户可见文本必须通过 i18n |
| **双语同步** | en + zh 同时维护, 新增键两边都加 |
| **验证方式** | 切换语言后全页面检查 |
| **命名规范** | `{模块}.{页面}.{元素}` (层级嵌套) |

---

## 8. 前端错误监控

### 8.1 Sentry 集成

```tsx
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,      // 10% 性能追踪
  replaysSessionSampleRate: 0.01,  // 1% 会话回放
  replaysOnErrorSampleRate: 1.0,   // 100% 错误时回放
});
```

### 8.2 Error Boundary

```tsx
// components/ErrorBoundary.tsx
'use client';

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={<ErrorFallback />}
      beforeCapture={(scope) => {
        scope.setTag('component', 'page');
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
```

### 8.3 API 错误自动上报

```tsx
// queryClient 全局错误处理
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => {
        Sentry.captureException(error, {
          tags: { source: 'react-query-mutation' }
        });
      }
    }
  }
});
```

---

## 9. 数据埋点与分析

### 9.1 事件层

```tsx
// lib/analytics.ts
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  // 发送到分析平台 (Mixpanel/Amplitude/自建)
  analytics.track(event, {
    ...properties,
    timestamp: new Date().toISOString(),
    userId: getCurrentUserId(),
    page: window.location.pathname,
  });
}

// 使用
trackEvent('product.viewed', { productId: '123', source: 'search' });
trackEvent('order.created', { total: 1500, items: 3 });
```

### 9.2 事件分类

| 类别 | 事件 | 属性 |
|------|------|------|
| 页面浏览 | `page.viewed` | path, referrer |
| 用户操作 | `button.clicked` | buttonId, context |
| 业务事件 | `order.created` | orderId, total |
| 错误事件 | `error.occurred` | message, stack |

### 9.3 隐私合规

| 规则 | 说明 |
|------|------|
| **不采集 PII** | 用户名/邮箱/电话不入埋点 |
| **用 userId 代替** | 可关联但不直接显示个人信息 |
| **IP 脱敏** | 只保留地区信息 |

---

*Version: 2.0.0 — Generic Core (expanded: i18n + monitoring + analytics)*
*Based on: battle-tested enterprise patterns*
