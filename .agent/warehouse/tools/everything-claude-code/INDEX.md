---
name: everything-claude-code
description: ECC (42K⭐) Agent 架构最佳实践参考集 — 12 Agent / Rules / Hooks / 验证循环
source: https://github.com/affaan-m/everything-claude-code
version: v1.4.1
---

# Everything Claude Code (ECC)

> **用途**: Agent 系统设计的设计黄金参考
> **状态**: 参考资料, 不直接安装

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-agents-review.md` | 12 Agent 速查 + Planner 详解 + Code Reviewer 完整清单 | ~8KB | 需审查清单/计划模板时 |
| `02-rules-hooks.md` | Rules 系统 + Hooks 自动化 + 验证循环 + 上下文管理 | ~5KB | 需了解规则/自动化设计时 |

## 快速参考 (不需要读切片)

| ECC 概念 | 我们的对应 | 差异 |
|---------|-----------|------|
| 12 Agents (扁平) | PM→CTO→10工程师→QA (层级) | 我们更企业化 |
| rules/common/ | 散布在各 Skill 中 | 🔴 需独立 rules 层 |
| PreToolUse/PostToolUse | ❌ 无 | 🔴 需评估 |
| 验证循环 6 阶段 | ✅ agent-mastery §1 | 一致 |
| Planner | ✅ chief-engineer.md §3 | 一致 |
| Code Reviewer | ✅ qa-auditor.md §2 | ECC 更详尽 |
