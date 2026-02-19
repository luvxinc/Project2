# Agent System Consolidation v1

> 目标：保留现有治理内核（PM/CTO/QA/Rules/Workflow），降低重复与冲突，按白名单引入 antigravity-kit 的增量能力。

## 0) 决策摘要

- **不做全量覆盖** `npx @vudovn/ag-kit init --force`。
- **保留主干**：`.agent/core/**`（组织流程 + 门禁规则）继续作为唯一执行内核。
- **增量引入**：只引入可复用的“通用能力模块”（调试、测试、性能），不引入其治理主控层（`rules/GEMINI.md`、`agents/orchestrator.md`）。

---

## 1) 真相源收敛（Single Source of Truth）

### 1.1 规则类（必须唯一）

- 统一规则真相源为：
  - `.agent/core/rules/common.md`
  - `.agent/core/rules/frontend.md`
  - `.agent/core/rules/backend.md`

**执行策略：**
- `core/workflows/*.md` 与 `core/skills/*.md` 中出现的规则条文，改为“引用规则节号 + 简短意图”，不重复完整条文。
- 保留 workflow 的“流程编排”，去掉与 rules 的重复细则。

### 1.2 流程类（必须唯一）

- 统一流程真相源为：`.agent/core/workflows/build.md`（以及 ship/guard/ui）
- PM/CTO/QA skill 只保留角色职责与输入输出，不重复完整状态机定义。

### 1.3 项目事实类（必须唯一）

- 统一项目事实真相源为：
  - `.agent/projects/mgmt/CONTEXT.md`
  - `.agent/projects/mgmt/roadmap.md`

**冲突修复原则：**
- 禁止同一事实在两文件出现矛盾表述（例如 V2 是否退役、是否双栈并行）。
- 若存在历史阶段描述，必须带“时间点/阶段标签”。

---

## 2) 冲突与重复治理（本轮）

### 2.1 P0（本周必改）

1. **修复项目事实冲突**：`CONTEXT.md` 与 `roadmap.md` 的 V2/V3 表述统一。
2. **规则去重第一批**：
   - `core/workflows/build.md`：保留 gate 入口与执行顺序，删除与 `rules/common.md` 的重复条款正文。
3. **链接完整性修复**：修复 core 索引中失效路径（仅改链接，不改语义）。

### 2.2 P1（下周）

1. PM/CTO/QA 三份 skill 的重复验收条款抽取为引用。
2. `memory/handoff/collaboration` 交叉引用统一（减少同义重复段落）。

### 2.3 P2（后续）

1. 增加“规则索引页”与“流程索引页”。
2. 建立 lint 脚本检查：重复条款、失效链接、矛盾事实。

---

## 3) Antigravity 增量引入白名单

## 3.1 允许引入（建议）

- 调试能力：`skills/systematic-debugging/*`
- 测试能力：`skills/testing-patterns/*`, `skills/webapp-testing/*`
- 性能能力：`skills/performance-profiling/*`
- 可选 workflow 样板：`workflows/debug.md`, `workflows/test.md`, `workflows/preview.md`（仅作为补充命令）

## 3.2 禁止直接引入（避免双主控）

- `rules/GEMINI.md`（会与现有核心治理冲突）
- `agents/orchestrator.md`（主控逻辑与现有 CTO/workflow 体系重叠）
- `workflows/orchestrate.md`（强制 3-agent 协议会与现有流程冲突）

## 3.3 引入方式

- 放入 `.agent/warehouse/imports/antigravity/` 作为候选库。
- 在 `core/skills/agent-mastery.md` 建立“可选能力路由表”。
- 只路由到经过你确认的模块。

---

## 4) 实施顺序（低风险）

1. **冻结主干**：本轮不覆盖 `.agent/core`。
2. **先修事实冲突**（CONTEXT/roadmap）。
3. **再做规则去重**（build.md 第一批）。
4. **最后引入白名单技能**（单模块逐个验证）。

---

## 5) 验收标准

- [ ] `CONTEXT.md` 与 `roadmap.md` 无冲突事实。
- [ ] `build.md` 规则重复减少（仅保留流程编排 + 引用规则）。
- [ ] core 索引无失效链接。
- [ ] antigravity 增量模块可独立调用，且不覆盖主控。

---

## 6) 回滚策略

- 所有变更先提交独立 commit：`agent-consolidation-v1-*`
- 每步改动可单独回滚（文档级别无代码执行风险）

---

*Created: 2026-02-17*
*Owner: 超级牛马*
