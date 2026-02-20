---
name: everything-claude-code
description: ECC (42K⭐) Universal Edition — 14 Agent / 28 Skills / 30 Commands / 6 语言规则 / AgentShield
source: https://github.com/affaan-m/everything-claude-code
version: v1.5.0
---

# Everything Claude Code (ECC)

> **用途**: Agent 系统设计的黄金参考 (Universal Edition: Claude/OpenCode/Cursor)
> **状态**: 参考资料, 可 `npm install -g ecc-universal`

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-agents-review.md` | 12 Agent 速查 + Planner 详解 + Code Reviewer 完整清单 | ~5KB | 需审查清单/计划模板时 |
| `02-rules-hooks.md` | Rules 系统 + Hooks 自动化 + 验证循环 + 上下文管理 | ~3KB | 需了解规则/自动化设计时 |

## 快速参考 (不需要读切片)

| ECC 概念 | 我们的对应 | 差异 |
|---------|-----------|------|
| 14 Agents (扁平) | PM→CTO→10工程师→QA (层级) | 我们更企业化 |
| 28 Skills (TS/Py/Go/Java) | 散布在各 L1 Skill 中 | ECC 更跨语言 |
| 30 Commands (含 PM2/Multi) | ❌ 无独立命令层 | 🔴 需评估 |
| 6 语言 Rules | 散布在各 Skill 中 | 🔴 需独立 rules 层 |
| AgentShield 安全审计 | ✅ qa-auditor.md §3 | ECC 有独立工具 |
| Continuous Learning v2 | ❌ 无 | 🔴 Instinct 进化系统 |
| PreToolUse/PostToolUse | ❌ 无 | 🔴 需评估 |
| 验证循环 6 阶段 | ✅ agent-mastery §1 | 一致 |
| Planner | ✅ chief-engineer.md §3 | 一致 |
| Code Reviewer | ✅ qa-auditor.md §2 | ECC 更详尽 |
