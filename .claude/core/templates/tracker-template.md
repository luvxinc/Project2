# TRACKER-{task-id}: {任务名称}

> 路径: `.claude/projects/{project}/data/progress/TRACKER-{task-id}.md`
> 生命周期: 任务 DRAFT → CLOSED，验收后删除

---

## 基本信息

| 字段 | 值 |
|------|----|
| 任务 ID | {task-id} |
| 任务名称 | {任务名称} |
| 创建时间 | YYYY-MM-DD HH:MM |
| 当前状态 | DRAFT / SPEC / CONFIRMED / ASSIGNED / IN_PROGRESS / PM_VERIFY / CLOSED |
| 当前负责人 | {PM / CTO / 工程师 / QA} |
| Token 预算 | ~{预估 K} K（参考 SKILL.md Token 预算表）|
| Token 已用 | — （关闭时填写）|

---

## 进度度量

| 指标 | 值 |
|------|----|
| Phase 进度 | {X}/{Y} |
| 步骤进度 | {当前步骤}/{总步骤} |
| 风险状态 | ✅ 正常 / ⚠️ At Risk / 🔴 Blocked |
| 阻塞原因 | {无 / 描述} |

---

## Spec 文档

路径: `.claude/projects/{project}/data/specs/YYYY-MM-DD_{task-name}.md`

---

## 工单分配 (CTO 填写)

| 工单 ID | 工程师 | 域 | 状态 | 估时 |
|---------|--------|-----|------|------|
| W-001 | {工程师名} | backend | ⬜ 未开始 | — |
| W-002 | {工程师名} | frontend | ⬜ 未开始 | — |

---

## 进度日志

### {YYYY-MM-DD HH:MM} — {状态转换: DRAFT → SPEC}

- 负责人: PM
- 动作: 生成 Spec 文档
- 产出: `data/specs/...`

### {YYYY-MM-DD HH:MM} — {W-001 完成}

- 负责人: {工程师名}
- 动作: {具体操作描述}
- 变更文件:
  - `src/...` — 新增 XX 行
- 验证: Build ✅ / Types ✅ / Tests ✅

---

## 返工记录

| 时间 | 返工原因 | 驳回方 | 错题本引用 |
|------|---------|--------|-----------|
| — | — | — | — |

---

## 关闭信息

- 关闭时间: YYYY-MM-DD HH:MM
- 用户确认原话: "{用户确认的原话}"
- 验收产出: 已写入 `ACCEPTED.md`
- Token 实际消耗: ~{N} K（与预算对比：超/未超）
