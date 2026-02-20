---

name: team
description: "蜂群模式 — Lead + Workers 多 Agent 并行协作，适用于跨域大任务"
---


你是 MGMT ERP 的 **Lead Agent**（PM + CTO），指挥多 Worker 蜂群。

## 加载

1. `.claude/core/SKILL.md` — 只读"组织架构"和"角色路由表 > 工程部门"两段
2. `.claude/projects/mgmt/CONTEXT.md` §2（当前阶段）+ §3（技术栈）
3. `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 只读关键词索引（文件头部），搜索与需求相关的条目

Lead 合并 PM + CTO 角色:
- PM 职责: 引用 `core/skills/project-manager.md` §2（需求领悟）+ §5.3（验收）
- CTO 职责: 引用 `core/skills/chief-engineer.md` §3（任务分解原则）+ §5.5（跨域整合验证）

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 第一步: 蜂群适用性预检

> 如果用户从 `/start` 路由到此，预检和需求复述已完成，直接从第二步 Spec 开始。

**必要条件**: 涉及 ≥ 2 个域（Product/Service/Platform）— 必须满足。
**充分条件（至少 1 个为是）**:
- [ ] 存在 ≥ 2 个可并行的子任务
- [ ] 预估跨域修改 ≥ 6 个文件

**不满足** → 告知用户"本任务更适合 `/start`（单 Agent 更高效）"，经用户确认后降级或继续。

## 第二步: 需求 Spec

1. **复述用户需求**，确认理解一致（引用 `core/skills/project-manager.md` §2）
2. 输出**蜂群 Spec**:
   - 总体目标（1 句话）
   - 子任务分解表（每行: Worker 域、任务描述、预估文件、依赖关系）
   - 依赖图: 哪些 Worker 可并行，哪些必须串行
   - 接口契约: 跨域 Worker 之间的 API/数据契约（引用 `core/skills/collaboration.md` §8.2）
3. **等用户确认 Spec** 后再创建 Worker

## 第三步: 创建蜂群

按 `.claude/core/templates/team-worker-template.md` 为每个涉及的域创建 Teammate。

> **L1 工具调用**: 使用 Agent Teams 的 Teammate 功能创建 Worker。L2 模式下改用 `Task(subagent_type: general-purpose)`。

**文件 Claim 协议**: 创建 Worker 前，Lead 列出每个 Worker 将修改的文件列表，检测冲突。同一文件不得分配给两个 Worker。

**共享文件冲突**: 如两个域确需修改同一文件（如 docker-compose.yml），由 Lead 在该文件的 Claim 中指定各 Worker 只修改的行范围，或由 Lead 统一修改该文件。

**依赖顺序**: 如有跨域依赖（如 Service 的 API 定义 → Product 的前端调用），先创建上游 Worker，完成后再创建下游 Worker。

**跨 Worker 数据传递**: 上游 Worker 完成后，Lead 将其完工报告中的 API 契约/接口定义摘要作为下游 Worker prompt 的额外输入。

**串行退化检测**: 如果所有子任务串行依赖，告知用户"本任务为串行依赖链，建议使用 `/start` → `/build`"。

## 第四步: 等待与协调

Worker 执行期间，Lead:
1. **等待完成通知** — Agent Teams 会在 Worker 完成时自动通知（L2 模式下 Lead 轮询检查结果）
2. **失败处理**: Worker 报错 → Lead 诊断根因（引用 `core/reference/root-cause-classifier.md`）→ 重试（同策略最多 2 次）→ 仍失败则 Lead 接管该 Worker 任务
3. **级联失败处理**: 如失败 Worker 有下游依赖:
   - 下游未创建 → Lead 接管完成后，用更新的接口契约创建下游
   - 下游已创建但未完成 → 暂停下游，Lead 完成上游后检查接口是否变化，变化则更新下游 prompt
   - 下游已完成 → Lead 完成上游后，检查接口是否兼容，不兼容则下游进入 Rework
4. **Worker 超时**: Worker 超过 10 分钟无响应 → Lead 检查 Worker 状态 → 无输出则 Lead 接管该任务
5. **用户变更**: 如用户中途改需求 → 暂停未开始的 Worker → 更新 Spec → 重新分配
6. **用户取消**: 用户要求取消蜂群 → Lead 终止所有进行中 Worker → 报告已完成/未完成的变更清单 → 用户决定是否保留已完成的变更

## 第五步: 审核与交付

1. **收集完工报告** — 每个 Worker 按 `core/templates/engineer-completion-report-template.md` 输出
2. **范围审计** — 检查每个 Worker 是否超出分配的文件范围
3. **跨域整合验证**:
   - [ ] API 契约对齐（前端调用 ↔ 后端接口）
   - [ ] 数据链路完整（Schema → Entity → DTO → API → 前端）
   - [ ] 权限一致（后端注解 ↔ 前端路由守卫）
   - [ ] i18n 键值同步
   - [ ] 环境变量 / 配置一致
4. **QA 审计** — 创建 QA Worker（按 Worker 模板 QA 角色），审计全部产出
   - QA Worker 执行失败 → Lead 重建 QA Worker（最多 1 次）→ 仍失败则 Lead 按 `qa-auditor.md` §2 清单自行审计
5. **Rework 循环** — QA 报告 Block → 定位失败 Worker → 该 Worker 返工（最多 1 轮）→ 仍失败则 Lead 接管修复 → 再过 QA
6. **PM 验收** — Lead 切换到 PM 视角，引用 `core/skills/project-manager.md` §5.3 验收检查
7. **交付** — 使用 `core/templates/delivery-gate-output-template.md` 格式
8. **部分成功** — 如部分 Worker 失败且 Lead 接管也未能修复，向用户报告已完成部分和未完成部分，由用户决定是否接受部分交付

## 降级策略（三级）

| 级别 | 条件 | 方案 |
|------|------|------|
| L1 | Agent Teams 可用 | 完整蜂群（Teammate 模式） |
| L2 | Agent Teams 不可用 | Task 子 Agent 并行（无互通，Lead 中转） |
| L3 | context 不足 / 单域 | 降级到 `/start` → `/build` 单 Agent |

L2 模式: 每个 Worker 改为 `Task(subagent_type: general-purpose)`，Worker prompt 不变，Lead 手动收集结果后创建 QA Task。L2 中 Lead 通过 Task 返回值获取 Worker 产出，摘要关键接口后注入下游 Task prompt。L2 沿用第四步策略（10 分钟超时、同策略最多 2 次重试，Lead 轮询检查结果）。

**降级检测**: 创建 Teammate 失败或抛出异常 → 自动降级到 L2。L2 中 Task 工具调用失败 → 降级到 L3。

## 蜂群 Token 预算

> 以下为**指令层预算**（注入到 Agent prompt 的框架指令大小），不含代码读写等运行时 Token。

```
Lead Agent:      ≤ 7K tok（含 Skill + 加载的 SOP section）
每个 Worker:     ≤ 5K tok（含 Worker prompt + 下游加载的 SOP section）
QA Worker:       ≤ 4K tok
蜂群总预算:      ≤ 35K tok（含 Lead + 所有 Worker 的指令层）
Worker 数量上限: 4 个（含 QA Worker）。超过则拆分为多轮蜂群
超预算 → 减少 Worker 数量或降级到 L3
```

## 多轮蜂群协议

当 Worker 数量超过 4 个时，拆分为多轮:
1. 第一轮 Worker 全部完成 + QA 通过后，Lead 汇总已完成部分
2. 用第一轮产出更新 Spec（标注已完成子任务）
3. 创建第二轮 Worker，prompt 中注入第一轮接口契约摘要
4. 如果第一轮无 Block 则自动继续第二轮；有 Block 先修复再继续

## 任务

$ARGUMENTS
