# MGMT ERP — 项目上下文 (L4 总索引)

> **Agent 进入 MGMT 项目时第一个读的文件。**
> **告诉 Agent: 这是什么项目, 当前在做什么, 该读哪些实施方案。**

---

## 1. 项目一句话

MGMT ERP 是一个医疗器械企业级管理系统, 经历三代架构演进:
V1 (Django+MySQL) → ~~V2 (NestJS+PostgreSQL)~~ → V3 (Kotlin/Spring Boot)。
前端 Next.js 16 + React 19 直连 V3, 保持不变。

**当前状态**: 🔴 **V2 NestJS 已彻底移除, 不存在于项目中。** V3 是唯一后端。
核心模块 (Auth/Users/Products/VMA/Logs) 已迁移到 V3。
辅助模块 (Purchase/Sales/Inventory/Finance) 正在从 V1 迁移到 V3 (Phase 8)。

---

## 2. 当前阶段指针

> **→ 详见 `roadmap.md` 获取完整进度**

| 指标 | 值 |
|------|-----|
| **活跃阶段 1** | Phase 6.9 — VMA 多岗位数据模型重构 |
| **活跃阶段 2** | Phase 8 — V1→V3 业务模块迁移 |
| **运行栈** | V3 (Spring Boot) 单栈运行（唯一后端） |
| **下一步** | 完成 VMA 6.9 → 推进 Phase 8 各业务模块迁移 |

---

## 3. 技术栈

> **L1 通用 SOP 读此章节确认当前运行栈，禁止假设。**

### 3.1 当前运行栈

| 层级 | 技术 | 版本 | 备注 |
|------|------|------|------|
| **后端语言** | Kotlin | 2.0.x | JVM 21 |
| **后端框架** | Spring Boot | 3.3.x | DDD 分层: domain→application→infrastructure→api |
| **ORM** | Spring Data JPA / Hibernate | — | `@Transactional` 声明式事务 |
| **数据库** | PostgreSQL | 16.x | 唯一数据库，禁止 MySQL |
| **迁移工具** | Flyway | — | `V{N}__description.sql` 命名 |
| **构建工具** | Gradle | 8.x | Kotlin DSL (`build.gradle.kts`) |
| **前端框架** | Next.js (App Router) | 16.x | SSR/ISR + 中间件 |
| **前端 UI** | React | 19.x | Server/Client Components |
| **样式** | TailwindCSS | 4.x | 禁止行内 style |
| **组件库** | shadcn/ui + Radix UI | latest | 二次封装 |
| **数据获取** | @tanstack/react-query | 5.x | 服务端状态管理 |
| **包管理** | pnpm | 9.x | monorepo |
| **国际化** | next-intl | 4.x | EN/ZH/VI (VI 仅 VMA) |
| **缓存** | Redis | — | 通过 Spring Data Redis |
| **消息队列** | Kafka | — | 未来 Phase 8，暂未接入 |

### 3.2 已废弃技术栈（禁止引用）

| 技术 | 废弃原因 | 废弃时间 |
|------|---------|---------|
| 🔴 **NestJS / V2** | 已彻底移除，项目中不存在 | Phase 6 完成后 |
| 🔴 **Prisma** | 随 V2 移除 | Phase 6 完成后 |
| 🔴 **MySQL** | 已迁移至 PostgreSQL | Phase 6 完成后 |
| 🟡 **Django / V1** | 仍在运行，但正迁移到 V3，禁止新增功能 | Phase 8 结束后归档 |

---

## 4. 全局约束 (每次都要记住)

不管做什么任务, 以下约束永远生效:

| 编号 | 铁律 | 严重级 |
|------|------|--------|
| R0 | **数据保护**: 任何可能导致数据丢失的操作, 禁止自动执行 | 🔴 |
| R1 | **太平洋时区**: 全项目 `America/Los_Angeles`, 后端日期加 `T12:00:00.000Z` | 🔴 |
| R2 | **最小修改**: 只修用户要求的, 超出范围先问 | 🔴 |
| R3 | **身份保护**: 不允许更改项目品牌/Logo/名称 | 🔴 |
| R4 | **日志优先**: 所有写操作必须有审计日志 | 🟡 |
| R5 | **越南语 Fallback**: VI 只在 VMA 维护, 其他模块 VI→EN | 🔴 |
| R6 | 🔴 **V2 已死**: V2 NestJS 已彻底移除, 项目中不存在。禁止引用、提及、参考 V2 代码。遗忘 V2。 | 🔴 |
| R7 | 🔴 **V1 忠实迁移**: V1→V3 必须先逐行读懂 V1 Django 源码, 完全理解后才可写 V3。**禁止猜测、臆造、创造性发挥。** 架构变, 内容不变。先读后写, 不明白不动手。 | 🔴 |

> **详细铁律 + 生产凭据**: [`reference/iron-laws.md`](reference/iron-laws.md)
> **架构合规门禁**: [`reference/architecture-gate.md`](reference/architecture-gate.md)

---

## 5. 工具命令速查

> **L1 Harness 工具（environment-check.md、agent-tool-capability-matrix.md）读此章节获取具体命令。**

### 5.1 本地开发启动顺序

```bash
# Step 1: 启动基础设施 (PostgreSQL + Redis)
./dev.sh up

# Step 2: 后端启动 (Kotlin / Spring Boot)
./gradlew bootRun
# 验证: curl http://localhost:3001/api/health

# Step 3: 前端启动 (Next.js)
cd apps/web && pnpm dev
# 验证: open http://localhost:3000
```

### 5.2 验证循环命令（对应 common.md §5 的 6 个阶段）

| 阶段 | 命令 | 通过标准 |
|------|------|---------|
| 1. 后端编译 | `./gradlew build -x test` | BUILD SUCCESSFUL |
| 1. 前端编译 | `pnpm build` | ✓ Compiled |
| 2. 前端类型 | `pnpm tsc --noEmit` | 零错误 |
| 3. 前端 Lint | `pnpm lint` | 零错误 |
| 4. 后端测试 | `./gradlew test` | BUILD SUCCESSFUL (X tests) |
| 4. 前端测试 | `pnpm test` | All tests passed |
| 5. 前端覆盖率 | `pnpm test --coverage` | ≥80% |
| 6. 安全审计 | `npm audit` | 无 high/critical |

### 5.3 数据库命令

```bash
# 应用迁移
./gradlew flywayMigrate

# 查看迁移状态
./gradlew flywayInfo

# 数据库连接 (开发)
psql -h localhost -U postgres -d mgmt_dev
```

### 5.4 部署相关

```bash
# 镜像 registry
# harbor.company.com/mgmt/{service}:{version}
# 详见 reference/iron-laws.md §5 生产凭据
```

---

## 6. 实施方案目录

Agent 根据当前任务类型, 加载对应实施方案:

| 你在做什么 | 加载实施方案 | 引用的 L1 通用 SOP |
|------------|----------|----------------|
| VMA 模块开发 (员工/培训/库存/临床) | [`playbooks/vma.md`](playbooks/vma.md) | backend, frontend, data |
| V1→V3 迁移 (Phase 8) / 忠实重构 | [`playbooks/migration.md`](playbooks/migration.md) | backend, data, infrastructure |
| 安全等级 / 权限 / 审计 | [`playbooks/security.md`](playbooks/security.md) | security, backend |
| UI/Hub 页面 / 主题 | 直接用 L1: `core/workflows/ui.md` | frontend |
| 数据库 / FIFO / 成本计算 | 直接用 L1: `core/skills/data.md` | data |

### L3 工具库快速入口

| 场景 | L3 工具 |
|------|--------|
| Agent 架构/审查清单 | `warehouse/tools/everything-claude-code/` (ECC v1.5.0) |
| UI 设计系统生成 | `warehouse/tools/ui-ux-pro-max/` (67 风格 + 96 配色) |
| 动画开发 | `warehouse/tools/animejs/` (v4.0.0 API) |
| 记忆架构参考 | `warehouse/tools/claude-mem/` (v10.0.7 上下文工程) |
| 文档→Skill 生成 | `warehouse/tools/skill-seekers/` (v3.0.0 RAG+AI) |
| Skill/插件规范 | `warehouse/tools/anthropic-skills/` + `knowledge-work-plugins/` |

---

## 7. 参考资料索引

需要深入了解时, 查阅 `reference/`:

### L4 实现模式（L1 SOP 指向此处）

> **何时加载**: L1 通用 SOP 说"见 CONTEXT.md §3"时，按需加载下列文件获取 MGMT 具体实现代码。

| 文件 | 内容 | 对应 L1 SOP |
|------|------|------------|
| `reference/impl-patterns-backend.md` | Spring Security / SecurityLevelAspect / Vault / AES / OpenAPI | security.md, backend.md, integration.md |
| `reference/impl-patterns-data.md` | HikariCP / Flyway / Redis / Kafka / OpenSearch / ClickHouse | data.md |
| `reference/impl-patterns-observability.md` | OTel Java Agent / Micrometer / Logback JSON / Prometheus | observability.md |

### 核心参考 (当前在用)

| 文件 | 内容 | 何时需要 |
|------|------|----------|
| `reference/iron-laws.md` | 🔴 铁律 + 生产凭据 | **每次都要记住** |
| `reference/architecture-gate.md` | 架构合规门禁 + 铁律规则 | 代码审查/Build 任务 |
| `reference/v3-architecture.md` | V3 完整技术栈 + 架构原则 | 规划/开发 V3 模块时 |
| `reference/migration.md` | 迁移路线图 + V1/V2 迁移附录 | 规划/执行迁移时 |
| `reference/v1-deep-dive.md` | V1 MySQL 30+ 表全景 | V1→V3 数据迁移时 |
| `data/audits/BASELINE-v1-database-deep-audit.md` | **V1 全表深度审计** (29表→18表映射、冗余分析、字段语义 — 零猜测) | **Phase 8 迁移必读** |
| `data/audits/BASELINE-v3-column-traceability-matrix.md` | V3 字段追踪矩阵 (已迁移模块的字段来源) | 验证字段迁移完整性 |
| `data/audits/BASELINE-v3-inventory-schema-mapping.md` | V3 库存 Schema 映射 | Inventory 模块迁移 |
| `reference/business-rules.md` | FIFO/安全等级/VMA/采购状态 | 实现业务逻辑时 |
| `reference/conventions.md` | 日志/i18n/主题/密码/代码约定 | 编码规范参考 |
| `reference/testing-strategy.md` | 测试分层策略 | 编写测试时 |

### 未来规划参考 (暂未实施, 保留备用)

| 文件 | 内容 | 何时需要 |
|------|------|----------|
| `reference/kafka-design.md` | Kafka topic 设计 | Phase 8 事件驱动 |
| `reference/search-analytics.md` | OpenSearch + ClickHouse | Phase 8 搜索/报表 |
| `reference/cdc.md` | Debezium CDC | Phase 8 数据同步 |
| `reference/resilience.md` | Resilience4j 弹性模式 | 生产稳定性加固 |
| `reference/config-management.md` | Vault 配置中心 | 生产密钥管理 |
| `reference/feature-flags.md` | 功能开关 / 灰度发布 | V3 模块灰度发布与风险控制 |
| `reference/notification.md` | 多通道通知系统 | 通知功能开发 |
| `reference/disaster-recovery.md` | 灾备与恢复 | 生产 DR 规划 |
| `reference/workflow-engine.md` | Temporal 审批引擎 | 审批流程开发 |
| `reference/document-engine.md` | 文档/报表生成 | PDF/Excel 功能 |
| `reference/ai-ml.md` | AI/ML 智能层 | Phase 8+ 智能化 |
| `reference/data-governance.md` | 数据治理 / GDPR | 合规需求 |
| `reference/accessibility.md` | 无障碍 / WCAG 2.2 | 合规需求 |
| `reference/developer-experience.md` | Storybook / CLI | 团队扩展时 |

---

## 8. 项目数据

过程数据存储在 `data/`:

| 目录 | 用途 | 写入时机 |
|------|------|----------|
| `data/audits/` | 审计报告 | QA 审计完成后 |
| `data/specs/` | 需求文档 | PM 翻译需求后 |
| `data/progress/` | 进度追踪 | 每个原子任务完成后 |
| `data/plans/` | 任务分配单 | CTO 分解任务后 |
| `data/checkpoints/` | 会话检查点 | 跨会话交接时 |
| `data/errors/` | 错误归档 | QA 发现缺陷后 |
| `data/training/` | 培训记录 | QA 培训工程师后 |
| `data/tmp/` | 临时工作文件 | 任务执行中，完成后清理 |

---

*MGMT Project Context v4.0 — 2026-02-19 (新增 §3 技术栈 + §5 工具命令速查，满足 L1 Harness 抓取要求)*
