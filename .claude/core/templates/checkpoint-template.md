# 检查点: {task-name} — {YYYY-MM-DD}

> 路径: `.claude/projects/{project}/data/checkpoints/YYYY-MM-DD_{task-name}_checkpoint.md`
> 用途: 跨会话恢复所需的最小信息（≤50 行）

---

## 标准模式

### 上下文

- 任务: {任务名称}
- Spec: `.claude/projects/{project}/data/specs/YYYY-MM-DD_{task-name}.md`
- 追踪器: `.claude/projects/{project}/data/progress/TRACKER-{task-id}.md`
- 状态: {当前工作流状态，如 IN_PROGRESS}

### 已完成

- ✅ Step 1: {描述} — `{相关文件}`
- ✅ Step 2: {描述} — `{相关文件}`

### 下一步

- ⬜ Step 3: {描述} — 从 `{文件名}` 开始
- ⬜ Step 4: {描述}

### 关键信息

- {对恢复至关重要的状态、决策或约定}
- 相关文件: `{路径}`, `{路径}`

---

## 紧急模式（快速保存）

```
任务: {任务名称}
状态: 做到 Step {N}（{文件名} {函数名}）
下一步: {一句话描述下一步}
相关文件: {路径1}, {路径2}
```
