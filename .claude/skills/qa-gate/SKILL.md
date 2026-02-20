---

name: qa-gate
description: "6 阶段质量门禁 — 编译、类型、Lint、测试、覆盖率、安全"
---


执行 MGMT ERP 的 6 阶段质量门禁。

> **边界**: 这是纯验证工具 — 只报告通过/失败，不做修复（修复 → `/guard`），不做代码审查（审查 → `/review`）。

## 加载

读 `.claude/core/rules/common.md` §5（验证规则）。
如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## $ARGUMENTS 用途

指定验证范围。例:
- 无参数 → 执行全部 6 阶段
- `backend` → 只执行后端相关阶段（1, 4, 5）
- `frontend` → 只执行前端相关阶段（1, 2, 3）
- `stage 1-3` → 只执行阶段 1 到 3

## 规则

> **Agent 注意: 严格按顺序逐阶段评估。阶段 N 失败 = 全停，不继续阶段 N+1。先运行一条命令，检查退出码，再决定是否继续。**

## Stage 1: 编译

后端:
!`cd mgmt-v3 && ./gradlew build -x test 2>&1 | tail -5`

前端:
!`cd apps/web && pnpm build 2>&1 | tail -10`

## Stage 2: 类型检查

!`cd apps/web && pnpm tsc --noEmit 2>&1 | tail -10`

## Stage 3: Lint

!`cd apps/web && pnpm lint 2>&1 | tail -10`

## Stage 4: 测试

!`cd mgmt-v3 && ./gradlew test 2>&1 | tail -10`

## Stage 5: 覆盖率

从测试输出中提取覆盖率数字。目标: >=80%

## Stage 6: 安全

!`cd apps/web && pnpm audit --audit-level=high 2>&1 | tail -5`

## 输出格式

| 阶段 | 状态 | 详情 |
|------|------|------|
| 1. 编译 | Pass/Fail | |
| 2. 类型 | Pass/Fail | |
| 3. Lint | Pass/Fail | |
| 4. 测试 | Pass/Fail | |
| 5. 覆盖率 | Pass/Fail | {N}% |
| 6. 安全 | Pass/Fail | |

**结论**: ALL GATES PASSED / BLOCKED AT STAGE {N}

## 任务

$ARGUMENTS
