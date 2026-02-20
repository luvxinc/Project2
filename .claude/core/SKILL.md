---
name: core-engineering
description: 工程部内核路由入口。Use when 需要在 PM/CTO/QA/工程师/规则/工作流之间做精准技能路由与最小上下文加载。
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

## 任务状态机 (快速参考)

```
DRAFT → SPEC → CONFIRMED → ASSIGNED → IN_PROGRESS
  → CTO_REVIEW → QA_AUDIT → PM_VERIFY → DELIVERED → CLOSED
  (任何环节可驳回 → REWORK → 回到驳回点)
```
> 详见 `workflows/build.md` §0
> 🔴 交付输出格式强制：`core/templates/delivery-gate-output-template.md`（PM 对用户回复必须使用）

---

## 角色路由表

### 管理层 (每次任务都参与)

| 角色 | 文件 | 职责 | 大小 |
|------|------|------|------|
| 📋 **PM 项目经理** | [`skills/project-manager.md`](skills/project-manager.md) | 用户唯一接口, 需求领悟/翻译/督导 | ~8KB |
| 🏛️ **CTO 总工** | [`skills/chief-engineer.md`](skills/chief-engineer.md) | 任务分析/分配/协调/整合验证 | ~7KB |
| 🔍 **QA 审计师** | [`skills/qa-auditor.md`](skills/qa-auditor.md) | 最终审计/错误归档/SOP 更新/培训 | ~8KB |
| 🧠 **记忆管理** | [`skills/memory.md`](skills/memory.md) | 追踪器/验收保护/错题本/规划/上下文约束 | ~8KB |
| 🔄 **协作** | [`skills/collaboration.md`](skills/collaboration.md) | 跨团队交接/依赖/讨论/冲突升级 | ~5KB |

### 工程部门 (按需加载 — 先读域索引, 再读具体 SOP)

| 域 | 索引文件 | 包含工程师 | 关键词 |
|------|---------|------------|--------|
| 📱 **产品工程部** | [`core/skills/domains/product.md`](skills/domains/product.md) | 前端架构师 | `前端`, `React`, `页面`, `组件`, `主题`, `i18n`, `动画`, `UI` |
| ⚙️ **服务工程部** | [`core/skills/domains/service.md`](skills/domains/service.md) | 后端 + 数据 + 安全 + 集成 + 消息 | `后端`, `Kotlin`, `API`, `Schema`, `安全`, `Kafka`, `事务` |
| 🛠️ **平台工程部** | [`core/skills/domains/platform.md`](skills/domains/platform.md) | 基建 + 可观测 + 性能 + 平台 | `Docker`, `K8s`, `CI/CD`, `监控`, `性能`, `技术债` |

> **加载流程:** CTO 判断域 → 读域索引 (~30行) → 按索引加载具体工程师 SOP 的具体 section

### 通用能力 (支撑全员)

| 关键词 | 文件 | 能力 | 大小 |
|--------|------|------|------|
| `需求`, `spec`, `wizard` | [`skills/requirements.md`](skills/requirements.md) | PM 的数据采集工具 (5 阶段 Wizard) | ~7KB |
| `项目`, `目录`, `新建项目`, `清理` | [`skills/project-structure.md`](skills/project-structure.md) | 项目级目录结构规范 + 生命周期 + 清理规则 | ~5KB |
| `交接`, `检查点`, `恢复` | [`skills/handoff.md`](skills/handoff.md) | 跨会话接力 | ~4KB |
| `验证`, `编码标准`, `学习` | [`skills/agent-mastery.md`](skills/agent-mastery.md) | Agent 行为优化 (v2.1 精简版) | ~7KB |
| `持续学习`, `本能`, `演化` | [`skills/continuous-learning.md`](skills/continuous-learning.md) | 本能架构 + 置信度 + 模式检测 | ~5KB |
| `环境`, `预检`, `前置`, `服务状态` | [`skills/environment-check.md`](skills/environment-check.md) | 任务前环境预检 SOP (Harness B1) | ~3KB |
| `E2E`, `端到端`, `用户旅程`, `链路测试` | [`skills/e2e-testing.md`](skills/e2e-testing.md) | E2E 测试策略 + 场景设计 + CI/CD 集成 + 失败处理 | ~4KB |

### 🔧 Harness 诊断工具 (出错时加载)

| 关键词 | 文件 | 能力 | 大小 |
|--------|------|------|------|
| `根因`, `出错`, `分类`, `诊断` | [`reference/root-cause-classifier.md`](reference/root-cause-classifier.md) | 根因分类决策树，出错时先诊断再改代码 | ~3KB |
| `工具`, `能力`, `矩阵`, `失败处理` | [`reference/agent-tool-capability-matrix.md`](reference/agent-tool-capability-matrix.md) | 工具能力边界 + 验证通路 + 超界处理 | ~3KB |

### 🔴 强制规则层 (提交前必查)

> 规则真相源索引：`rules/INDEX.md`
> 文档门禁绿灯标准：`core/reference/agent-doc-gate-standard.md`

| 规则 | 文件 | 内容 | 大小 |
|------|------|------|------|
| 通用规则 | [`rules/common.md`](rules/common.md) | 代码风格/Git/测试门禁(§5)/跨文件影响(§6)/代码拆分+复用(§9)/Hooks拦截(§10.1) | ~6KB |
| 前端自检 | [`rules/frontend.md`](rules/frontend.md) | 10 反模式 (F1-F10) + CRITICAL/HIGH Checklist | ~3KB |
| 后端自检 | [`rules/backend.md`](rules/backend.md) | 10 反模式 (B1-B10) + CRITICAL/HIGH Checklist | ~4KB |

> **加载时机:** 工程师执行完代码后、提交前，必须加载对应 Rules 文件过检查。

### 工作流 (Slash Commands)

> 流程真相源索引：`workflows/INDEX.md`

| 命令 | 文件 | 何时触发 |
|------|------|----------|
| `/build` | [`workflows/build.md`](workflows/build.md) | 新建/重构 (§0 状态机 + §1-§7 全闭环) |
| `/ship` | [`workflows/ship.md`](workflows/ship.md) | 本地开发/CI-CD/部署 |
| `/guard` | [`workflows/guard.md`](workflows/guard.md) | TDD/审查/排查 |
| `/ui` | [`workflows/ui.md`](workflows/ui.md) | Hub 页面/主题/动画 |
| `/learn` | [`workflows/learn.md`](workflows/learn.md) | 学习/更新 GitHub 库并自动纳入工具库 |
| `/migrate` | [`../projects/mgmt/playbooks/migration.md`](../projects/mgmt/playbooks/migration.md) | V1→V3 忠实迁移 |
| `/vma` | [`../projects/mgmt/playbooks/vma.md`](../projects/mgmt/playbooks/vma.md) | VMA 模块开发 |

> 以上命令对应 `.claude/skills/` 中的同名 skill。旧命名 `/main_*` 已废弃。

> 完整的 14 个 skill 入口表见项目根目录 `CLAUDE.md`。以上仅为核心工作流。

### 客户项目 (L4 — 仅在项目上下文时加载)

| 关键词 | 入口文件 | 说明 |
|--------|----------|------|
| `MGMT`, `ERP`, `VMA` | [`../projects/mgmt/CONTEXT.md`](../projects/mgmt/CONTEXT.md) | 项目入口 → roadmap → playbooks → data/ |

### 工具库 (L3 — 按需加载, 先读 INDEX.md)

| 工具 | 目录 | 何时加载 |
|------|------|---------|
| ECC | [`warehouse/tools/everything-claude-code/`](../warehouse/tools/everything-claude-code/) | Agent 系统设计/审查清单 |
| **Agent Research 2025** | [`warehouse/tools/agent-research-2025/`](../warehouse/tools/agent-research-2025/) | **最新 Agent 设计原则** (Context/Tool/Eval/Multi-Agent) |
| UI UX Pro | [`warehouse/tools/ui-ux-pro-max/`](../warehouse/tools/ui-ux-pro-max/) | 选风格/配色/UX 审查 |
| Anthropic Skills | [`warehouse/tools/anthropic-skills/`](../warehouse/tools/anthropic-skills/) | 创建新 Skill |
| Knowledge Plugins | [`warehouse/tools/knowledge-work-plugins/`](../warehouse/tools/knowledge-work-plugins/) | 创建插件 |
| Claude-Mem | [`warehouse/tools/claude-mem/`](../warehouse/tools/claude-mem/) | 理解记忆架构 |
| Skill Seekers | [`warehouse/tools/skill-seekers/`](../warehouse/tools/skill-seekers/) | 文档→Skill |
| Anime.js | [`warehouse/tools/animejs/`](../warehouse/tools/animejs/) | 动画开发 |

---

## 完整任务流程

```
1. 用户说需求
2. PM 领悟 → 翻译 → 分诊 → 写 Spec (存 L4 data/specs/) → 标注涉及域
3. PM 交需求文档给 CTO (含域分类)
4. CTO 读域索引 → 加载对应工程师 SOP → 分解分配
5. 工程师按 SOP 执行 → 交给 CTO
6. CTO 整合验证 → 通过交 QA / 不通过退回
7. QA 审计 → 通过交 PM / 不通过退回 CTO
8. PM 检查交付 → 交给用户确认
9. 用户确认 → 完成 ✅ / 不满意 → PM 重启
```

---

## 加载规则

```
规则 1: 管理层 SOP 分阶段加载, 不一次全读
         - PM SOP: 需求阶段加载 (~2.2K tok)
         - CTO SOP: 任务分配阶段加载 (~2K tok)
         - QA SOP: 审计阶段加载 (~3.6K tok)
         - 协作 SOP: 多人协作时加载 (~2K tok)
规则 2: 工程师 SOP 通过域索引加载 (三级)
         - 第一级: SKILL.md 域路由 (本文件, ~5行)
         - 第二级: domains/*.md 域索引 (~30行, ~0.5K tok)
         - 第三级: 具体工程师 SOP 的具体 section (~3.5K tok)
         - 禁止跳过域索引直接加载工程师 SOP
规则 3: Rules 层在工程师执行完、提交前加载 (~1K tok/文件)
规则 4: L4 项目资料只在检测到项目上下文时加载
规则 5: L3 工具库按需加载, 先读 INDEX (~0.4K tok) 再读切片
规则 6: 大文件 (>10KB) 只读需要的 section，避免全量进入上下文
规则 7: 总单次加载上限: ≤ 30KB (~7.5K tok)
规则 8: 防 Context Rot (Anthropic 2025-09 研究)
         - Context 污染 = 注意力退化 → 工作质量下降
         - 每加载一个文件: 读完后评估是否仍需保留
         - 避免将错误信息、旧草稿、无关输出积累在上下文中
         - 长任务中途执行 /compact 整理 → 减少 context noise
         - 当会话超过 20 轮或估计已消耗 >50% 窗口时，建议执行 /compact
规则 9: 渐进式披露 (Progressive Disclosure)
         - L1 = metadata + 路由表 (轻量)
         - L2 = 具体 SOP section (按需)
         - L3 = 完整代码/模板 (仅在需要实现时)
         - 先读摘要/路由表，确认相关后再读完整内容
```

### Token 预算参考

| 路径类型 | 典型场景 | Token | 占 200K 窗口 |
|----------|---------|-------|----------|
| 最轻 | 简单问答 | ~1.7K | 0.8% |
| 典型 | 单域任务 | ~10-13K | 5-6% |
| 重型 | 全栈建设 | ~22K | 11% |
| 极端 | 全域全角色 | ~28K | 14% |

---

## L3 工具统一引用 (按场景)

> 各 Skill 文件末尾的 L3 引用表已移除，统一在此维护。域索引保留域级推荐（更精准）。

| 场景 | 工具 | 路径 |
|------|------|------|
| 任务分解 / Agent 系统设计 | ECC: Planner | `warehouse/tools/everything-claude-code/01-agents-review.md §2` |
| 代码审查清单 | ECC: Reviewer | `warehouse/tools/everything-claude-code/01-agents-review.md §3` |
| 强制规则 / TDD | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md §1-§2` |
| 代码采集策略 | ECC: System Prompter | `warehouse/tools/everything-claude-code/01-agents-review.md §1` |
| UI 设计系统 | UI UX Pro: Design | `warehouse/tools/ui-ux-pro-max/01-design-system.md` |
| UX 审查 / 需求评估 | UI UX Pro: UX Rules | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` |
| 动画开发 | Anime.js | `warehouse/tools/animejs/INDEX.md` |
| 文档→Skill 自动化 | Skill Seekers | `warehouse/tools/skill-seekers/01-commands-modules.md` |
| 记忆架构设计 | Claude-Mem | `warehouse/tools/claude-mem/01-architecture.md` |
| Skill 规范模板 | Anthropic Skills | `warehouse/tools/anthropic-skills/01-spec-template.md` |

---

*Version: 3.5.0 — P2 补全：e2e-testing.md 路由 + 规则 8/9 + Agent Research 2025*
*Updated: 2026-02-19*
