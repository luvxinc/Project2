---
description: 造 — 新建模块, 新建页面, API 契约, 数据库迁移, 重构, 验证
---

# /build — 造

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **⚠️ §0 是强制第一步, 任何任务必须先过 Wizard。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| **(所有任务)** | → **§0 需求向导 (强制)** |
| `新模块`, `后端模块`, `module` | → §1 新建后端模块 |
| `新页面`, `page`, `前端` | → §2 新建前端页面 |
| `API`, `契约`, `接口` | → §3 API 契约 |
| `数据库`, `迁移`, `flyway`, `schema` | → §4 数据库迁移 |
| `重构`, `refactor`, `拆分` | → §5 重构模块 |
| `验证`, `validate`, `检查` | → §6 模块验证 |

---

## §0 需求向导 (强制第一步)

> **完整方法论见 `core/skills/requirements.md`**
> **不理解 = 不动手。猜测 = 失败。**

### 流程

```
用户 prompt
    ↓
Phase 1: GATHER — 自动采集 (代码 + KI + 菜谱 + 依赖)
    ↓
Phase 2: SPEC — 输出规格文档 (As-Is / To-Be / 影响 / 步骤 / 风险)
    ↓
Phase 3: CONFIRM — 用户确认 (❓ 不确定的必须问)
    ↓  用户说 "确认"
Phase 4: CTO 分配 — Spec → CTO 做分解 → 分配到 §1-§6 对应工程师执行
    ↓
Phase 5: 三级验证 — CTO 整合验证 → QA 审计 → PM 交付用户
```

### 快捷判断

| 条件 | 模式 |
|------|------|
| 影响 ≤ 3 文件, 无数据模型变更 | 简化 Spec (Quick Spec) |
| 影响 > 3 文件, 或有数据模型变更 | 完整 Spec |
| 任何涉及删除/迁移/安全的操作 | 完整 Spec + 额外风险审查 |

---

## §1 新建后端模块

### 步骤

1. **确定模块名称** — kebab-case (如 `purchase-orders`)
2. **选择架构层级**:

```
简化版 (小模块):                 完整 DDD 版 (复杂模块):
{module}/                        {module}/
├── {module}.controller.kt       ├── domain/
├── {module}.service.kt          │   ├── model/
├── {module}.repository.kt       │   ├── event/
└── dto/                         │   └── repository/  (接口)
    ├── Create{Module}Cmd.kt     ├── application/
    └── {Module}Response.kt      │   ├── usecase/
                                 │   └── dto/
                                 ├── infrastructure/
                                 │   └── persistence/
                                 └── api/
                                     └── {Module}Controller.kt
```

3. **创建文件** — 参照 `core/skills/backend.md` §3.2 模块内部模板
4. **注册模块** — Spring Modulith 自动扫描 (包在 `modules.{name}` 下即可)
5. **创建 Flyway 迁移** — 参照 §4

### 检查清单

| # | 检查项 | 必须 |
|---|--------|------|
| 1 | Controller 只做参数校验+调用 UseCase | ✅ |
| 2 | Service/UseCase 包含全部业务逻辑 | ✅ |
| 3 | Repository 接口在 Domain 层, 实现在 Infrastructure 层 | ✅ |
| 4 | DTO 有 `@Valid` + Jakarta Validation | ✅ |
| 5 | 事务注解在 Service/UseCase 层 | ✅ |
| 6 | 统一响应格式 `ApiResponse<T>` | ✅ |
| 7 | 异常使用统一异常类 + GlobalExceptionHandler | ✅ |
| 8 | 审计日志: 写操作触发审计事件 | ✅ |
| 9 | 权限: `@PreAuthorize` 或 `@SecurityLevel` | ✅ |
| 10 | 测试: 至少 Unit + Integration 各 1 个 | ✅ |

---

## §2 新建前端页面

### 步骤

1. **确定路由路径** — `app/(dashboard)/{module}/{page}/page.tsx`
2. **选择页面类型**:

| 类型 | 模板 | 用途 |
|------|------|------|
| 列表页 | `PageLayout` + `DataTable` | CRUD 列表 |
| 详情页 | `PageLayout` + `FormWrapper` | 查看/编辑 |
| Hub 页 | 使用 `/ui` workflow | 模块首页 |
| 报表页 | `PageLayout` + `EnterpriseGrid` / `Chart` | 数据分析 |

3. **创建文件结构**:

```
{page}/
├── page.tsx              # 主页面 (Server Component 或 Client)
├── columns.tsx           # 表格列定义 (如有)
├── use{Module}.ts        # React Query hooks
└── components/           # 页面专属组件
    ├── {Module}Modal.tsx
    └── {Module}Filter.tsx
```

4. **数据获取** — 参照 `core/skills/frontend.md` §4 (OpenAPI Client + React Query)
5. **国际化** — 所有字符串使用 `useTranslations('{namespace}')`

### 检查清单

| # | 检查项 | 必须 |
|---|--------|------|
| 1 | 使用 `PageLayout` 而非自行拼 div | ✅ |
| 2 | 所有文本通过 i18n | ✅ |
| 3 | 所有 API 调用通过 React Query | ✅ |
| 4 | 暗色/亮色主题兼容 | ✅ |
| 5 | 移动端响应式 (如需要) | ⬜ |
| 6 | Loading/Error/Empty 三态处理 | ✅ |
| 7 | 弹窗使用 `<Modal>` 而非原生 dialog | ✅ |

---

## §3 API 契约

### OpenAPI → TypeScript 自动生成

```
Spring Boot (后端)
    ↓ springdoc 自动生成
OpenAPI 3.0 Spec (openapi.json)
    ↓ openapi-typescript 生成
TypeScript Client (packages/api-client/)
    ↓ 前端 import
React Query Hooks
```

### 铁律

| 规则 | 说明 |
|------|------|
| **禁止手写 API 类型** | 必须从 `api-client` 自动生成 |
| **禁止手写 fetch** | 必须通过 OpenAPI Client + React Query |
| **类型变更自动传播** | 后端改了 DTO → 重新生成 → 前端编译报错 → 修复 |

---

## §4 数据库迁移 (Flyway)

### 命名规范

```
src/main/resources/db/migration/
├── V1__create_users_tables.sql
├── V2__create_{module}_tables.sql
├── V3__add_{column}_to_{table}.sql
└── V4__create_indexes_for_{module}.sql
```

### SQL 规范

```sql
-- 表名: 小写 + 下划线 + 复数
CREATE TABLE products (...);
CREATE TABLE purchase_orders (...);

-- 索引名: idx_{table}_{columns}
CREATE INDEX idx_products_sku ON products(sku);

-- 外键名: fk_{table}_{ref_table}
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_products
  FOREIGN KEY (product_id) REFERENCES products(id);

-- 必须包含审计字段
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by VARCHAR,
updated_by VARCHAR
```

### 铁律

| 规则 | 说明 |
|------|------|
| **禁止修改已执行的迁移** | 只新增, 不修改 |
| **先迁移, 后代码** | 数据库先就绪, 再改 Entity |
| **团队同步** | Pull 后立即 `./gradlew flywayMigrate` |

---

## §5 重构模块

### 安全重构流程

```
1. 准备:  写集成测试覆盖现有行为
2. 验证:  现有测试 100% 通过
3. 重构:  结构性修改 (拆分/合并/移动)
4. 验证:  所有测试仍然通过
5. 清理:  删除旧代码 + 更新文档
6. 部署:  灰度发布 + 监控
```

### 核心原则

| 原则 | 说明 |
|------|------|
| **先有测试, 后有重构** | 没有测试覆盖 = 不允许重构 |
| **行为不变** | 重构不改变外部行为 |
| **小步迭代** | 每步可验证, 可回滚 |
| **文档同步** | 重构完成后更新所有引用 |

---

## §6 模块验证

### 验证清单 (新模块上线前必须全部通过)

| 层级 | 验证项 | 怎么验证 |
|------|--------|----------|
| 编译 | Build 无错误 | `./gradlew build` |
| 测试 | Unit ≥80%, Integration 核心路径 100% | `./gradlew test jacocoReport` |
| API | OpenAPI spec 已生成 | 访问 `/api-docs` |
| 安全 | 权限注解已加 | 代码审查 |
| 审计 | 写操作有审计日志 | 手动操作 + 查审计表 |
| 迁移 | Flyway 迁移已创建且可重放 | `./gradlew flywayClean flywayMigrate` |
| 前端 | 页面可用 + Loading/Error 态正常 | 手动测试 |
| i18n | 所有文本已翻译 | 切换语言验证 |
| 文档 | 项目文档已更新 | 人工检查 |

---

*Version: 1.0.0 — Generic Core*
