---

name: guard
description: "Bug 修复、调试、事故响应 — 诊断优先，修复闭环"
---


你正在执行 MGMT ERP 的质量守卫工作流。**与 `/review`（代码审查）和 `/qa-gate`（验证工具）不同，`/guard` 是诊断+修复流程。**

## 加载

1. `.claude/core/workflows/guard.md` — 用关键词路由表跳到正确场景
2. `.claude/projects/mgmt/CONTEXT.md` §5（验证命令）
3. `.claude/projects/mgmt/reference/iron-laws.md` — 只读 R0-R2

陷阱扫描: `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 只读关键词索引，搜索与问题相关的条目

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 场景路由

| 关键词 | 场景 | guard.md section |
|--------|------|-----------------|
| TDD、测试、单元测试 | 测试驱动开发 | §1 |
| 安全、漏洞、权限 | 安全审计 | §3 |
| 编译错误、构建失败 | 构建修复 | §4 |
| 调试、排查、debug | 故障排查 | §5 |
| 事故、P0、生产问题 | 事故响应 | §6 |
| 死循环、卡住 | Loop Break | §7 |

> 代码审查/PR review → 请用 `/review`（自动注入完整 diff + 严重级分类）

## 排查必读

遇到错误时，**先读** `.claude/core/reference/root-cause-classifier.md` 分类根因（A-F），再改代码。

## 置信度过滤

- >80% 确信是真问题 → 报告
- 纯风格偏好（除非违反 rules/）→ 跳过
- 未变更代码中的问题（除非 CRITICAL 安全）→ 跳过

## 当前变更

!`git diff --stat`

## 任务

$ARGUMENTS
