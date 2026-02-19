---
name: continuous-learning
description: 持续学习 SOP。Use when 需要将错误与实践沉淀为可复用经验并更新技能体系。
---

# 持续学习 (Continuous Learning)

> **来源**: ECC Continuous Learning v2 (Instinct-Based Architecture)
> **适配**: 从 Claude Code Hooks 适配到 Antigravity + Knowledge Items 环境
> **⚠️ 本文件 ~5KB。按需阅读, Agent 在会话结束时应回顾 §5 实践协议。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `理念`, `架构`, `为什么` | → §1 核心理念 |
| `本能`, `instinct`, `模型` | → §2 本能模型 |
| `置信`, `评分`, `confidence` | → §3 置信度评分 |
| `适配`, `Antigravity`, `KI` | → §4 Antigravity 适配 |
| `实践`, `协议`, `会话结束` | → §5 实践协议 |
| `检测`, `类型`, `pattern` | → §6 模式检测类型 |

---

## 1. 核心理念

Agent 应该从每次会话中学习模式, 并将其沉淀为可复用的 "本能 (Instinct)":

```
会话活动
    │
    │ 观察: 用户修正, 错误解决, 重复工作流
    ▼
┌─────────────────────────────────────┐
│         模式检测 (Pattern Detection) │
│  • 用户修正 → 本能                   │
│  • 错误解决方案 → 本能               │
│  • 重复工作流 → 本能                 │
└─────────────────────────────────────┘
    │
    │ 创建/更新
    ▼
┌─────────────────────────────────────┐
│       本能库 (Instinct Registry)     │
│  • 置信度: 0.3(试探) → 0.9(确定)    │
│  • 领域标签: code-style, testing,    │
│    git, debugging, workflow, domain  │
└─────────────────────────────────────┘
    │
    │ 聚合演化 (/evolve)
    ▼
┌─────────────────────────────────────┐
│       技能演化 (Skill Evolution)     │
│  • 3+ 相关本能 → 新 Skill           │
│  • 5+ 相关本能 → 新 Workflow        │
│  • 10+ 相关本能 → 新 Agent          │
└─────────────────────────────────────┘
```

---

## 2. 本能模型

一个本能是一个小的学习行为:

```yaml
---
id: prefer-data-class-over-entity
trigger: "创建新的数据对象时"
confidence: 0.8
domain: "code-style"
source: "session-observation"
---

# 优先使用 data class 而非 Entity

## 行为
Kotlin 中传递数据时优先使用 data class, Entity 只用于 JPA 持久化层。

## 证据
- 在 5 次会话中发现用户都修正了直接传 Entity 的做法
- V3 架构规范 (02-backend.md) 明确要求 DDD 分层
```

---

## 3. 置信度评分

| 分值 | 含义 | Agent 行为 |
|------|------|-----------|
| 0.3 | 试探性 | 建议但不强制 |
| 0.5 | 中等 | 相关时应用 |
| 0.7 | 强 | 自动应用 |
| 0.9 | 近确定 | 核心行为 |

**置信度上升**: 同一模式被重复观察, 用户未修正
**置信度下降**: 用户明确修正, 长期未观察到, 出现矛盾证据

---

## 4. Antigravity 适配 (关键差异)

ECC 使用 Claude Code Hooks (文件系统)。我们使用 Antigravity Knowledge Items:

| ECC 原始机制 | 我们的适配 |
|-------------|-----------|
| `hooks.json` PreToolUse/PostToolUse | Antigravity Knowledge Items 自动存储 |
| `~/.claude/homunculus/observations.jsonl` | KI Summaries (每次会话自动生成) |
| `instincts/personal/*.md` | `.agent/skills/learned/*.md` |
| `/instinct-status` 命令 | 人工审计 + KI 查阅 |
| `/evolve` 聚合 | 手动提取 → 写入现有 Skill |

---

## 5. 实践协议

**每次会话结束前** (Agent 主动执行):

```
1. 回顾: 本次会话中有哪些模式值得记录?
   - 用户修正了什么? → 可能的新本能
   - 解决了什么棘手 Bug? → 排查方案
   - 什么工作流被重复了 3+ 次? → 自动化候选

2. 记录: 值得沉淀的模式写入以下位置:
   - 通用模式 → 更新 agent-mastery/SKILL.md 对应 section
   - 领域模式 → 更新对应 V3 Skill
   - 项目特定 → 更新 .agent/projects/{project}/reference/ 或 playbooks/

3. 置信度检查: 已有本能是否需要调整?
   - 如果被用户修正 → 降低置信度或删除
   - 如果被反复验证 → 提升置信度
```

---

## 6. 模式检测类型

| 类型 | 触发条件 | 示例 |
|------|----------|------|
| `user_corrections` | 用户修正了 Agent 的做法 | "不要用 Entity 直接返回 API" |
| `error_resolutions` | 解决了难以复现的 Bug | "Prisma 热加载需要 restart" |
| `repeated_workflows` | 同一流程被执行 3+ 次 | "每次加新模块都要改 AppModule" |
| `tool_preferences` | 用户偏好特定工具/方式 | "总是先看 outline 再看 code" |
| `project_conventions` | 项目独特的约定 | "日志四表, 不用 console.log" |

---

*Version: 1.0.0 — 从 agent-mastery.md §4 拆分独立*
*Created: 2026-02-15*
