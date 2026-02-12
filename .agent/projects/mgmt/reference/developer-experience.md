---
description: 开发者体验 — Storybook, API Playground, CLI 脚手架, 入门指南
---

# 开发者体验 (Developer Experience — DX)

> **原则**: 优秀的 DX = 高效产出 + 低学习成本 + 快速反馈循环。
> **目标**: 新开发者 < 1 天完成环境搭建, < 1 周可以独立提交 PR。

---

## 1. 开发环境一键启动

```bash
# 克隆仓库
git clone https://github.com/mgmt-erp/mgmt-v3.git
cd mgmt-v3

# 一键启动所有基础设施 (PG, Redis, Kafka, OpenSearch, MinIO)
docker compose -f infra/docker-compose.yml up -d

# 后端启动
cd apps/api-v3 && ./gradlew bootRun --args='--spring.profiles.active=local'

# 前端启动
cd apps/web && pnpm install && pnpm dev
```

### Docker Compose (本地完整环境)

```yaml
# infra/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mgmt_erp
      POSTGRES_USER: erp_dev
      POSTGRES_PASSWORD: dev_password
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports: ["9092:9092"]

  opensearch:
    image: opensearchproject/opensearch:2.11.0
    ports: ["9200:9200"]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]

  mailhog:  # 本地邮件测试
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]

  unleash:  # Feature Flags
    image: unleashorg/unleash-server:latest
    ports: ["4242:4242"]

volumes:
  pgdata:
```

---

## 2. 组件库文档 (Storybook)

```bash
# 启动 Storybook
cd apps/web && pnpm storybook
# 访问 http://localhost:6006
```

所有 shadcn/ui 组件 + 业务组件 都应有 Story:

```tsx
// src/components/ui/DataTable.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './DataTable';

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataTable>;

export const Default: Story = {
  args: {
    columns: [...],
    data: [...],
  },
};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: { data: [] },
};
```

---

## 3. API Playground (Swagger UI)

SpringDoc OpenAPI 自动生成交互式 API 文档:

```yaml
# application-local.yml
springdoc:
  swagger-ui:
    enabled: true
    path: /swagger-ui.html
    tags-sorter: alpha
    operations-sorter: method
  api-docs:
    path: /api-docs
```

访问: `http://localhost:8080/swagger-ui.html`

---

## 4. 代码生成器 CLI

### 4.1 后端模块脚手架

```bash
# 生成新的 DDD 模块骨架
./gradlew scaffoldModule --name=warehouse

# 生成结构:
# apps/api-v3/src/main/kotlin/com/mgmt/erp/warehouse/
# ├── domain/
# │   ├── model/
# │   ├── repository/
# │   └── service/
# ├── application/
# │   ├── usecase/
# │   └── dto/
# ├── infrastructure/
# │   ├── persistence/
# │   └── config/
# └── api/
#     └── WarehouseController.kt
```

### 4.2 前端页面脚手架

```bash
# 生成新的页面模板
pnpm gen:page --module=warehouse --page=inventory

# 生成结构:
# apps/web/src/app/[locale]/warehouse/inventory/
# ├── page.tsx
# ├── components/
# │   └── InventoryTable.tsx
# └── hooks/
#     └── useInventory.ts
```

---

## 5. 编码规范与工具链

| 工具 | 用途 | 配置 |
|------|------|------|
| **detekt** | Kotlin 静态分析 | `detekt.yml` |
| **ktlint** | Kotlin 代码格式化 | `.editorconfig` |
| **ESLint** | TypeScript/React 静态分析 | `.eslintrc.js` |
| **Prettier** | 前端代码格式化 | `.prettierrc` |
| **Husky** | Git Hook (pre-commit) | `.husky/pre-commit` |
| **lint-staged** | 只检查 staged 文件 | `package.json` |
| **Commitlint** | Git 提交信息规范 | `commitlint.config.js` |

### Git 提交规范

```
<type>(<scope>): <subject>

type: feat|fix|docs|style|refactor|test|chore|perf|ci
scope: auth|users|products|vma|purchase|sales|inventory|finance|infra

示例:
feat(purchase): add multi-level approval workflow
fix(vma): correct training certificate PDF generation
docs(infra): add disaster recovery runbook
```

---

## 6. CONTRIBUTING.md 大纲

```markdown
# Contributing Guide

## 环境搭建 (< 30 分钟)
1. 安装: JDK 21, Node.js 20, pnpm, Docker
2. 克隆仓库
3. `docker compose up -d`
4. 后端: `./gradlew bootRun`
5. 前端: `pnpm dev`

## 开发流程
1. 从 `main` 切分支: `feat/MODULE-123-description`
2. 编写代码 + 测试
3. 本地通过: `./gradlew check && pnpm build`
4. 提交 PR, 等待 CI + Code Review
5. Squash merge to `main`

## 代码规范
- 后端: Kotlin + DDD 四层架构
- 前端: React + TypeScript + shadcn/ui
- 测试: 覆盖率 ≥ 80% (后端), 核心流程 E2E
- i18n: 所有用户可见文字必须外置

## 获取帮助
- 架构问题: 阅读 `docs/reference/v3-architecture.md`
- API 问题: 访问 Swagger UI
- 组件问题: 访问 Storybook
```

---

*Version: 1.0.0 — 2026-02-11*
