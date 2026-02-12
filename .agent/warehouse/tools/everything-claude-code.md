---
name: everything-claude-code
description: ECC — 42K⭐ Anthropic Hackathon Winner。Agent 配置、技能、命令、钩子、规则的最全参考。
source: https://github.com/affaan-m/everything-claude-code
version: v1.4.1
---

# Everything Claude Code (ECC)

> **参考用途**: Agent 架构设计、SOP 最佳实践、技能模板、验证循环
> **⚠️ 篇幅**: 本文件是精炼索引，详细内容请查阅 GitHub 源。

## 1. 核心架构

```
agents/      → 12 个专职子 Agent (planner, tdd-guide, code-reviewer, etc.)
skills/      → 30+ 技能 (前后端模式、TDD、安全、学习、验证)
commands/    → 30+ 斜杠命令 (/tdd, /plan, /code-review, /build-fix, etc.)
rules/       → 强制规则 (common/ + typescript/ + python/ + golang/)
hooks/       → 事件钩子 (PreToolUse, PostToolUse, Stop)
contexts/    → 动态上下文 (dev.md, review.md, research.md)
```

## 2. 我们已吸收的功能

| ECC 功能 | 我们的对应 | 状态 |
|---------|-----------|------|
| 验证循环 (6 阶段) | `agent-mastery.md` §1 | ✅ 一致 |
| 渐进检索 | `agent-mastery.md` §2 | ✅ 一致 |
| 编码标准 | `agent-mastery.md` §3 | ✅ 一致 |
| 上下文管理 | `agent-mastery.md` §4 | ✅ 一致 |
| 持续学习 (Instinct v2) | `agent-mastery.md` §6 | ✅ 适配 KI |
| TDD 流程 | `guard.md` §1 | ✅ 一致 |
| 代码审查清单 | `guard.md` §2 | ✅ 一致 |
| 安全检查 | `guard.md` §3 | ✅ 一致 |
| 构建错误排查 | `guard.md` §4 | ✅ 一致 |

## 3. 值得参考 (可按需取用)

| 功能 | 描述 | 路径 |
|------|------|------|
| **AgentShield** | 安全扫描工具, 387 tests | `npx ecc-agentshield scan` |
| **Skill Creator** | 从 Git 历史生成 Skill | `/skill-create` 命令 |
| **Multi-Agent 编排** | 多 Agent 协作 | `commands/multi-plan.md` |
| **PM2 管理** | 进程管理命令 | `commands/pm2.md` |
| **Django/Spring Boot 模式** | 语言特定技能 | `skills/django-*`, `skills/springboot-*` |

## 4. 关键设计原则

1. **Rules 独立于 Skills** — 强制规则放 `rules/`, 不混在技能中
2. **Hook 自动化** — PreToolUse 拦截高危操作, PostToolUse 自动检查
3. **上下文 ≤ 80 工具** — MCP 服务不超 10 个/项目, 防止上下文爆炸
4. **Agent 单一职责** — 每个 Agent 限定工具集 (Read/Grep/Glob/Bash)
