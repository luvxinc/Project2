---
name: product-engineering
description: 产品工程域 — 用户可见的一切。前端页面/组件/主题/动画/i18n/API Client。
---

# 产品工程部

> **CTO 路由到此文件后, 按关键词选择加载对应工程师 SOP 的对应 section。**
> **禁止全部加载。只加载命中的。**

## 部门职能总览

```
产品工程部
├── 页面与路由 ──────── frontend.md §2 目录 + §6 解耦
├── 组件封装 ─────────── frontend.md §3 组件规范
├── API Client ────────── frontend.md §4 OpenAPI 自动生成
├── 主题系统 ─────────── frontend.md §5 双模式主题
├── 国际化 (i18n) ────── frontend.md §7 i18n 管理
├── 错误监控 ─────────── frontend.md §8 Sentry + Error Boundary
├── 数据埋点 ─────────── frontend.md §9 用户行为分析
└── UI/UX 设计 ────────── L3: UI UX Pro Max (按需)
```

## 工程师索引 (按职能精准跳转)

### 页面 & 路由

| 关键词 | section | 具体能力 |
|--------|---------|---------|
| `页面`, `page`, `路由`, `layout` | `frontend.md` §2 | App Router 目录结构/嵌套布局/动态路由 |
| `Server Component`, `Client Component` | `frontend.md` §2 | RSC 边界划分/数据预取 |

### 组件 & UI

| 关键词 | section | 具体能力 |
|--------|---------|---------|
| `组件`, `Component`, `Modal`, `Table` | `frontend.md` §3 | 组件封装规范/Props/复用 |
| `动画`, `Anime.js`, `过渡`, `交互` | `frontend.md` §3 + L3 | 微动画/页面过渡/Hub 动画 |
| `UI 设计`, `配色`, `排版`, `Hub` | L3: UI UX Pro | 20 风格 + 行业配色 + UX 70 准则 |
| `主题`, `dark`, `light`, `Glassmorphism` | `frontend.md` §5 | CSS 变量/ThemeContext/双模式 |

### 数据通信

| 关键词 | section | 具体能力 |
|--------|---------|---------|
| `API Client`, `React Query`, `fetch` | `frontend.md` §4 | OpenAPI 自动生成 TS Client |
| `前后端解耦`, `DTO`, `契约` | `frontend.md` §6 | 前后端接口边界定义 |

### 国际化 & 监控

| 关键词 | section | 具体能力 |
|--------|---------|---------|
| `i18n`, `翻译`, `多语言`, `next-intl` | `frontend.md` §7 | 命名空间/显式注入/动态映射 |
| `Sentry`, `Error Boundary`, `错误` | `frontend.md` §8 | 前端错误捕获/上报/告警 |
| `埋点`, `analytics`, `track`, `行为` | `frontend.md` §9 | 用户行为数据采集/分析 |

## 域内协调规则

```
职能优先级 (有依赖时):
  1. API Client (§4) — 先确保后端接口可用
  2. 页面路由 (§2) — 骨架搭建
  3. 组件封装 (§3) — UI 实现
  4. 主题适配 (§5) — 视觉层
  5. i18n (§7) — 多语言
  6. 埋点 (§9) — 数据采集

如果任务涉及 前端 + 后端 API:
  → 接口契约先由 服务工程域 定义 (integration.md §2)
  → 前端按契约对接 (frontend.md §4)
```

## L3 工具 (域级推荐)

| 场景 | 工具 | 路径 | 何时加载 |
|------|------|------|---------|
| UI 设计决策 | UI UX Pro: Design System | `warehouse/tools/ui-ux-pro-max/01-design-system.md` | v2.0 设计系统生成器 |
| UX 交付检查 | UI UX Pro: UX Rules | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` | 99 条准则 + 反模式 |
| 动画 API | Anime.js | `warehouse/tools/animejs/INDEX.md` | Anime.js 4.0 核心 + 高级模式 |
| React 审查 | ECC: Review §3 | `warehouse/tools/everything-claude-code/01-agents-review.md` | React/Next.js 反模式 |
| 编码规范 | ECC: Rules §1 | `warehouse/tools/everything-claude-code/02-rules-hooks.md` | 强制规则 |

---

*Version: 2.0.0 — 职能细分 + 精准索引*
