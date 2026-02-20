---

name: status
description: "项目状态概览 — 当前阶段、最近活动、待办事项"
---


提供 MGMT ERP 项目状态概览。

## 加载

1. **当前阶段**: 读 `.claude/projects/mgmt/CONTEXT.md` §2（只读阶段部分）。
   如果不存在，读 `CLAUDE.md` 基础信息继续执行。

2. **已验收工作**: 如 `.claude/projects/mgmt/data/progress/ACCEPTED.md` 存在，只读摘要/统计行（前 30 行或尾部汇总）。

3. **项目记忆**: 如 `.claude/projects/mgmt/data/progress/PROJECT-MEMORY.md` 存在，只读最近 5 条条目。

4. **已知问题**: 只读 `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` 的关键词索引，统计条目数。

5. **活跃追踪器**: 检查 `.claude/projects/mgmt/data/progress/TRACKER-*.md` 是否存在。

6. **最近 Git 活动**:
!`git log --oneline -15`

7. **工作区状态**:
!`git status --short`

## 输出格式

```
## MGMT ERP 状态报告

### 当前阶段
{从 CONTEXT.md §2 提取}

### 最近活动
{git log 摘要}

### 工作区
{干净 / N 个修改文件 / N 个未跟踪文件}

### 已验收交付
{从 ACCEPTED.md 统计，或"文件不存在"}

### 已知陷阱
{ERROR-BOOK 条目数，列出关键项}

### 活跃任务
{活跃 TRACKER 列表，或"无"}
```

## 任务

$ARGUMENTS
