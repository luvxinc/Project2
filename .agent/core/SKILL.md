---
name: core-engineering
description: 工程部内核 — 层级式索引路由。18 个技能 + 3 个强制规则 + 4 个工作流, 覆盖 CTO/PM/QA/工程师/协作全部角色。
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
| 📱 **产品工程部** | [`domains/product.md`](skills/domains/product.md) | 前端架构师 | `前端`, `React`, `页面`, `组件`, `主题`, `i18n`, `动画`, `UI` |
| ⚙️ **服务工程部** | [`domains/service.md`](skills/domains/service.md) | 后端 + 数据 + 安全 + 集成 + 消息 | `后端`, `Kotlin`, `API`, `Schema`, `安全`, `Kafka`, `事务` |
| 🛠️ **平台工程部** | [`domains/platform.md`](skills/domains/platform.md) | 基建 + 可观测 + 性能 + 平台 | `Docker`, `K8s`, `CI/CD`, `监控`, `性能`, `技术债` |

> **加载流程:** CTO 判断域 → 读域索引 (~30行) → 按索引加载具体工程师 SOP 的具体 section

### 通用能力 (支撑全员)

| 关键词 | 文件 | 能力 | 大小 |
|--------|------|------|------|
| `需求`, `spec`, `wizard` | [`skills/requirements.md`](skills/requirements.md) | PM 的数据采集工具 (5 阶段 Wizard) | ~7KB |
| `项目`, `目录`, `新建项目`, `清理` | [`skills/project-structure.md`](skills/project-structure.md) | 项目级目录结构规范 + 生命周期 + 清理规则 | ~5KB |
| `交接`, `检查点`, `恢复` | [`skills/handoff.md`](skills/handoff.md) | 跨会话接力 | ~4KB |
| `验证`, `编码标准`, `学习` | [`skills/agent-mastery.md`](skills/agent-mastery.md) | Agent 行为优化 (v2.1 精简版) | ~7KB |
| `持续学习`, `本能`, `演化` | [`skills/continuous-learning.md`](skills/continuous-learning.md) | 本能架构 + 置信度 + 模式检测 | ~5KB |

### 🔴 强制规则层 (提交前必查)

| 规则 | 文件 | 内容 | 大小 |
|------|------|------|------|
| 通用规则 | [`rules/common.md`](rules/common.md) | 代码风格/Git/测试门禁(§5)/跨文件影响(§6)/代码拆分+复用(§9) | ~6KB |
| 前端自检 | [`rules/frontend.md`](rules/frontend.md) | 10 反模式 (F1-F10) + CRITICAL/HIGH Checklist | ~3KB |
| 后端自检 | [`rules/backend.md`](rules/backend.md) | 10 反模式 (B1-B10) + CRITICAL/HIGH Checklist | ~4KB |

> **加载时机:** 工程师执行完代码后、提交前，必须加载对应 Rules 文件过检查。

### 工作流 (Slash Commands)

| 命令 | 文件 | 何时触发 |
|------|------|----------|
| `/main_build` | [`workflows/build.md`](workflows/build.md) | 新建/重构 (§0 状态机 + §1-§7 全闭环) |
| `/main_ship` | [`workflows/ship.md`](workflows/ship.md) | 本地开发/CI-CD/部署 |
| `/main_guard` | [`workflows/guard.md`](workflows/guard.md) | TDD/审查/排查 |
| `/main_ui` | [`workflows/ui.md`](workflows/ui.md) | Hub 页面/主题/动画 |

### 客户项目 (L4 — 仅在项目上下文时加载)

| 关键词 | 入口文件 | 说明 |
|--------|----------|------|
| `MGMT`, `ERP`, `VMA` | [`../../projects/mgmt/CONTEXT.md`](../../projects/mgmt/CONTEXT.md) | 项目入口 → roadmap → playbooks → data/ |

### 工具库 (L3 — 按需加载, 先读 INDEX.md)

| 工具 | 目录 | 何时加载 |
|------|------|---------|
| ECC | [`warehouse/tools/everything-claude-code/`](../../warehouse/tools/everything-claude-code/) | Agent 系统设计/审查清单 |
| UI UX Pro | [`warehouse/tools/ui-ux-pro-max/`](../../warehouse/tools/ui-ux-pro-max/) | 选风格/配色/UX 审查 |
| Anthropic Skills | [`warehouse/tools/anthropic-skills/`](../../warehouse/tools/anthropic-skills/) | 创建新 Skill |
| Knowledge Plugins | [`warehouse/tools/knowledge-work-plugins/`](../../warehouse/tools/knowledge-work-plugins/) | 创建插件 |
| Claude-Mem | [`warehouse/tools/claude-mem/`](../../warehouse/tools/claude-mem/) | 理解记忆架构 |
| Skill Seekers | [`warehouse/tools/skill-seekers/`](../../warehouse/tools/skill-seekers/) | 文档→Skill |
| Anime.js | [`warehouse/tools/animejs/`](../../warehouse/tools/animejs/) | 动画开发 |

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
规则 6: 用完大文件 (>10KB) 释放上下文
规则 7: 总单次加载上限: ≤ 30KB (~7.5K tok)
```

### Token 预算参考

| 路径类型 | 典型场景 | Token | 占 200K 窗口 |
|----------|---------|-------|----------|
| 最轻 | 简单问答 | ~1.7K | 0.8% |
| 典型 | 单域任务 | ~10-13K | 5-6% |
| 重型 | 全栈建设 | ~22K | 11% |
| 极端 | 全域全角色 | ~28K | 14% |

---

*Version: 3.3.0 — +continuous-learning 拆分 + Token 预算表 + 规则编号更新*
*Updated: 2026-02-15*
