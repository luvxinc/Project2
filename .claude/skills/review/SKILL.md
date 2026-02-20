---

name: review
description: "代码审查 — 自动注入 git diff，按严重级分类"
---


你正在为 MGMT ERP 执行代码审查。**这是只读审查，不做修复。需要修复请用 `/guard`。纯验证请用 `/qa-gate`。**

## 加载

1. `.claude/core/workflows/guard.md` §2（代码审查流程）
2. `.claude/core/rules/common.md` §0（范围纪律）+ §1（代码风格）+ §6（跨文件影响）
3. `.claude/projects/mgmt/reference/iron-laws.md` — 只读 R0-R2

根据变更文件类型加载对应规则:
- `.kt` / `.kts` 文件 → 同时读 `.claude/core/rules/backend.md`
- `.ts` / `.tsx` 文件 → 同时读 `.claude/core/rules/frontend.md`

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 当前变更

!`git diff --stat`
!`git diff | head -c 15000`

## 审查协议

1. 识别所有变更文件及其关系
2. 阅读变更周围的上下文代码（禁止孤立审查）
3. 按 CRITICAL → HIGH → MEDIUM → LOW 严重级排序
4. 只报告 >80% 确信的真实问题
5. 合并同类问题

## 严重级定义

| 级别 | 触发条件 |
|------|---------|
| CRITICAL | 安全漏洞、数据丢失风险、铁律违反 |
| HIGH | 缺失错误处理、逻辑错误、测试空白、文件>600行 |
| MEDIUM | 性能问题、不必要重渲染、缺失缓存 |
| LOW | 命名、注释、格式 |

## 输出格式

每个发现: `严重级 | 文件:行号 | 问题描述 | 修复建议`

结论: **APPROVE** / **WARNING** ⚠️ (列出项) / **BLOCK** (列出 CRITICAL 项)

## 任务

$ARGUMENTS
