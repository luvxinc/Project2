# MGMT ERP — 项目上下文 (L4 总索引)

> **Agent 进入 MGMT 项目时第一个读的文件。**
> **告诉 Agent: 这是什么项目, 当前在做什么, 该读哪些实施方案。**

---

## 1. 项目一句话

MGMT ERP 是一个医疗器械企业级管理系统, 经历三代架构演进:
V1 (Django+MySQL) → V2 (NestJS+PostgreSQL) → V3 (Kotlin/Spring Boot)。
前端 Next.js 16 + React 19 横跨 V2/V3, 保持不变。

**当前状态**: V2 和 V3 双栈并行运行。核心模块 (Auth/Users/Products/VMA/Logs) 已迁移到 V3。
辅助模块 (Purchase/Sales/Inventory/Finance) 仍在 V2。

---

## 2. 当前阶段指针

> **→ 详见 `roadmap.md` 获取完整进度**

| 指标 | 值 |
|------|-----|
| **活跃阶段 1** | Phase 6.9 — VMA 多岗位数据模型重构 |
| **活跃阶段 2** | Phase 7 — V2→V3 迁移 (7/9 子阶段已完成) |
| **运行栈** | V2 (NestJS) + V3 (Spring Boot) 双栈并行 |
| **下一步** | 完成 VMA 6.9 → API Gateway 流量切换 (7.8) |

---

## 3. 实施方案目录

Agent 根据当前任务类型, 加载对应实施方案:

| 你在做什么 | 加载实施方案 | 引用的 L1 通用 SOP |
|------------|----------|----------------|
| VMA 模块开发 (员工/培训/库存/临床) | [`playbooks/vma.md`](playbooks/vma.md) | backend, frontend, data |
| V2→V3 迁移 (NestJS→Spring Boot) | [`playbooks/migration.md`](playbooks/migration.md) | backend, data, infrastructure |
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

> **详细铁律 + 生产凭据**: [`reference/iron-laws.md`](reference/iron-laws.md)

---

## 5. 参考资料索引

需要深入了解时, 查阅 `reference/`:

### 核心参考 (当前在用)

| 文件 | 内容 | 何时需要 |
|------|------|----------|
| `reference/iron-laws.md` | 🔴 铁律 + 生产凭据 | **每次都要记住** |
| `reference/v3-architecture.md` | V3 完整技术栈 + 架构原则 | 规划/开发 V3 模块时 |
| `reference/migration.md` | 迁移路线图 + V1/V2 迁移附录 | 规划/执行迁移时 |
| `reference/v1-deep-dive.md` | V1 MySQL 30+ 表全景 | V1→V3 数据迁移时 |
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
| `reference/feature-flags.md` | 功能开关 / 灰度发布 | V2→V3 流量切换 |
| `reference/notification.md` | 多通道通知系统 | 通知功能开发 |
| `reference/disaster-recovery.md` | 灾备与恢复 | 生产 DR 规划 |
| `reference/workflow-engine.md` | Temporal 审批引擎 | 审批流程开发 |
| `reference/document-engine.md` | 文档/报表生成 | PDF/Excel 功能 |
| `reference/ai-ml.md` | AI/ML 智能层 | Phase 8+ 智能化 |
| `reference/data-governance.md` | 数据治理 / GDPR | 合规需求 |
| `reference/accessibility.md` | 无障碍 / WCAG 2.2 | 合规需求 |
| `reference/developer-experience.md` | Storybook / CLI | 团队扩展时 |

---

## 6. 项目数据

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

---

*MGMT Project Context v3.0 — 2026-02-16 (清理过期引用, 反映 V3 双栈现实)*
