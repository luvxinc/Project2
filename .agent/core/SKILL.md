---
name: core-engineering
description: 工程部内核 — 层级式索引路由。17 个技能 + 4 个工作流, 覆盖 CTO/PM/QA/工程师/协作全部角色。
---

# 工程部内核 (Engineering Core)

> **本索引是公司的组织架构图。根据用户请求, 精确路由到对应角色和文件。**
> **绝不全量加载。每次只读需要的 1-2 个文件。**

---

## 组织架构

```
用户 ←→ PM (L2) ←→ CTO (L1) ←→ 工程师团队 (L1) ←→ QA (L1)
                                                          ↕
                                                     L3 仓库
```

---

## 角色路由表

### 管理层 (每次任务都参与)

| 角色 | 文件 | 职责 | 大小 |
|------|------|------|------|
| 📋 **PM 项目经理** | [`skills/project-manager.md`](skills/project-manager.md) | 用户唯一接口, 需求领悟/翻译/督导 | ~8KB |
| 🏛️ **CTO 总工** | [`skills/chief-engineer.md`](skills/chief-engineer.md) | 任务分析/分配/协调/整合验证 | ~7KB |
| 🔍 **QA 审计师** | [`skills/qa-auditor.md`](skills/qa-auditor.md) | 最终审计/错误归档/SOP 更新/培训 | ~8KB |
| 🔄 **协作** | [`skills/collaboration.md`](skills/collaboration.md) | 跨团队交接/依赖/讨论/冲突升级 | ~5KB |

### 专业工程师 (按需参与 — 10 大职能)

| 关键词 | 文件 | 专精领域 | 大小 |
|--------|------|----------|------|
| `kotlin`, `spring boot`, `DDD`, `后端` | [`skills/backend.md`](skills/backend.md) | 后端业务逻辑/DDD/事务 | ~14KB |
| `next.js`, `react`, `前端`, `i18n`, `埋点` | [`skills/frontend.md`](skills/frontend.md) | 前端 + i18n + 错误监控 + 埋点 | ~14KB |
| `postgresql`, `redis`, `数据建模`, `ETL` | [`skills/data.md`](skills/data.md) | 数据建模/存储/查询/ETL | ~10KB |
| `kafka`, `saga`, `消息`, `异步`, `事件` | [`skills/messaging.md`](skills/messaging.md) | 消息队列/Saga/幂等/事件溯源 | ~8KB |
| `API`, `webhook`, `集成`, `契约`, `网关` | [`skills/integration.md`](skills/integration.md) | API 契约/第三方/Webhook/版本管理 | ~9KB |
| `security`, `安全`, `RBAC`, `加密` | [`skills/security.md`](skills/security.md) | Spring Security + Vault | ~12KB |
| `docker`, `k8s`, `terraform`, `部署` | [`skills/infrastructure.md`](skills/infrastructure.md) | K8s + Terraform + CI/CD | ~12KB |
| `monitoring`, `prometheus`, `SRE`, `复盘` | [`skills/observability.md`](skills/observability.md) | OTel + Prometheus + SRE + 事故复盘 | ~14KB |
| `N+1`, `缓存`, `慢查询`, `优化` | [`skills/performance.md`](skills/performance.md) | N+1/缓存/索引/批量 | ~7KB |
| `脚手架`, `代码生成`, `Feature Flag`, `技术债` | [`skills/platform.md`](skills/platform.md) | 平台工程/开发者效率/技术债治理 | ~7KB |

### 通用能力 (支撑全员)

| 关键词 | 文件 | 能力 | 大小 |
|--------|------|------|------|
| `需求`, `spec`, `wizard` | [`skills/requirements.md`](skills/requirements.md) | PM 的数据采集工具 (5 阶段 Wizard) | ~7KB |
| `交接`, `检查点`, `恢复` | [`skills/handoff.md`](skills/handoff.md) | 跨会话接力 | ~4KB |
| `验证`, `编码标准`, `学习` | [`skills/agent-mastery.md`](skills/agent-mastery.md) | Agent 行为优化 | ~17KB |

### 工作流 (Slash Commands)

| 命令 | 文件 | 何时触发 |
|------|------|----------|
| `/main_build` | [`workflows/build.md`](workflows/build.md) | 新建/重构 (包含 §0 需求向导) |
| `/main_ship` | [`workflows/ship.md`](workflows/ship.md) | 本地开发/CI-CD/部署 |
| `/main_guard` | [`workflows/guard.md`](workflows/guard.md) | TDD/审查/排查 |
| `/main_ui` | [`workflows/ui.md`](workflows/ui.md) | Hub 页面/主题/动画 |

### 客户项目 (L4 — 仅在项目上下文时加载)

| 关键词 | 入口文件 | 说明 |
|--------|----------|------|
| `MGMT`, `ERP`, `VMA` | [`../../projects/mgmt/CONTEXT.md`](../../projects/mgmt/CONTEXT.md) | 项目入口 → roadmap → recipes → data/ |

### 工具库 (L3 — 按需加载)

| 目录 | 说明 |
|------|------|
| [`../../warehouse/tools/`](../../warehouse/tools/) | 跨项目通用 SDK/库参考 |

---

## 完整任务流程

```
1. 用户说需求
2. PM 领悟 → 翻译 → 分诊 → 写需求文档 (存 L4 data/specs/)
3. PM 交需求文档给 CTO
4. CTO 分析 → 分解 → 写任务分配单 (存 L4 data/plans/) → 分配给工程师
5. 工程师按 SOP 执行 → 内部讨论 → 交给 CTO
6. CTO 整合验证 → 通过交 QA / 不通过退回工程师
7. QA 审计 → 写审计报告 (存 L4 data/audits/) → 通过交 PM / 不通过退回
8. QA 记录错误 (存 L4 data/errors/) → 更新 SOP → 培训
9. PM 检查交付 → 交给用户确认
10. 用户确认 → 完成 ✅ / 不满意 → PM 重启循环
```

---

## 加载规则

```
规则 1: 管理层 SOP 分阶段加载, 不一次全读
         - PM SOP: 需求领悟阶段加载
         - CTO SOP: 任务分配阶段加载
         - QA SOP: 审计阶段加载
         - 协作 SOP: 多人协作时加载
规则 2: 专业工程师 SOP 按需加载 (最多 2 个)
规则 3: L4 项目资料只在检测到项目上下文时加载
规则 4: L3 工具库按需加载, 不全量读
规则 5: 用完大文件 (>10KB) 释放上下文
规则 6: 总单次加载上限: ≤ 30KB (约 2-3 个文件)
```

---

*Version: 2.0.0 — 公司化组织架构*
*Created: 2026-02-11*
