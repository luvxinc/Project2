---
description: /main_build 工作流。Use when 新建功能/重构/API契约/数据库迁移，需要从 Spec 到 QA 的全链路执行。
---

# /build — 造

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **本文件是编排层 — 引用 L1 SOP, 不重复其内容。**
> 🔴 **Token 节约铁律:** SOP 只读命中 section; 域索引先读; L3 工具先读 INDEX; 大文件用完释放; 单次 ≤30KB。

---

## 🔴 V3 架构合规 (Architecture Gate — 强制)

> **任何 Build 任务开启前, 必须加载以下架构文件并确保代码完全合规:**

```
🏛️ 架构真相源 (Architecture Source of Truth):
├── 📐 主文件: .agent/projects/mgmt/reference/v3-architecture.md
│   → 技术栈, DDD 分层, API 规范, 数据库建模, 性能 SLA
├── 📋 审计标准: .agent/projects/mgmt/data/audits/v3-architecture-audit.md
│   → 19 GAP 审计报告, 覆盖率评级
├── 🔬 质量基准: .agent/projects/mgmt/data/audits/v3-deep-quality-audit.md
│   → Schema 审计, 索引策略, 算法效率分析
├── 📑 分阶段计划: .agent/projects/mgmt/data/specs/v3-phase-plan.md
│   → Phase 0-5 执行循环 (AUDIT→DESIGN→BUILD→VERIFY→GATE)
└── 📚 24 个参考规范: .agent/projects/mgmt/reference/*.md
    → resilience, cdc, disaster-recovery, kafka-design, testing-strategy,
      notification, conventions, business-rules, etc.
```

### 架构合规铁律

| 规则 | 不合规后果 |
|------|----------|
| **后端必须 Kotlin + Spring Boot 3.x** | Block |
| **DDD 分层: domain → application → infrastructure → api** | Block |
| **Controller 禁止写业务逻辑** (只做入参校验 + 调用 UseCase) | Block |
| **Domain 层禁止 import Spring/JPA** | Block |
| **数据库禁止 Type Erasure** (TEXT 存日期/金额/ID) | Block |
| **所有写操作必须审计日志** (traceId + userId + IP) | Block |
| **安全等级 L1-L4 四级模型** | Block |
| **统一响应格式** ({ success, data, pagination/error }) | Warning |
| **i18n 从第一行代码开始** | Warning |
| **API 命名: RESTful 资源式** (禁止 /getX, /createY) | Warning |

> **按需加载参考规范:** 涉及后端弹性 → 读 `.agent/projects/mgmt/reference/resilience.md`; 涉及 Kafka → 读 `.agent/projects/mgmt/reference/kafka-design.md`; 涉及数据库 → 读 `.agent/projects/mgmt/data/audits/v3-deep-quality-audit.md`; 涉及测试 → 读 `.agent/projects/mgmt/reference/testing-strategy.md`。

---

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `状态`, `流程`, `全局`, `闭环` | → §0 任务状态机 |
| `需求`, `spec`, `wizard`, `采集` | → §1 需求获取 |
| `分配`, `分解`, `plan`, `工单` | → §2 任务分配 |
| `执行`, `编码`, `实现`, `execute` | → §3 执行纪律 |
| `重构`, `迁移`, `等价`, `保真` | → §3.1 重构保真执行 |
| `验证`, `整合`, `review`, `CTO` | → §4 整合验证 |
| `审计`, `QA`, `audit`, `质量` | → §5 QA 审计关 |
| `交付`, `确认`, `关闭`, `deliver` | → §6 交付关闭 |
| `返工`, `驳回`, `修复`, `rework` | → §7 返工协议 |

> **📍 记忆管理:** 每个任务全程有 TRACKER 文件跟随。详见 `skills/memory.md`。

---

## §0 任务状态机

> **每个任务沿此状态机流转。任何跳转必须有退回路径。**

```
DRAFT → SPEC → CONFIRMED → ASSIGNED → IN_PROGRESS
                                           │
                                      完工报告
                                           ↓
                                     CTO_REVIEW ──── Approve / Warning / Block
                           CTO_REJECT ←───┤
                              ↓           ↓ ✅ (Approve 或 Warning)
                           REWORK     QA_AUDIT ──── Approve / Warning / Block
                              ↑      QA_REJECT ←──┤
                              └──────────┘        ↓ ✅ (Approve)
                              ↑              PM_VERIFY
                              └── PM_REJECT ←────┤
                                                 ↓ ✅
                                             DELIVERED
                                     USER_REJECT ←──┤
                                        ↓           ↓ ✅
                                   回到 DRAFT     CLOSED ✅
```

### 审批标准 (ECC Approval Criteria)

| 结果 | 条件 | 行为 |
|------|------|------|
| **Approve** ✅ | 零 CRITICAL, 零 HIGH | 直接通过, 流转到下一环 |
| **Warning** ⚠️ | 仅 HIGH (无 CRITICAL) | 可通过但必须记录, CTO 判断是否阻塞 |
| **Block** 🔴 | 有 CRITICAL 问题 | 必须修复, 发回 REWORK |

| 状态 | 负责人 | 进入条件 | 退出条件 |
|------|--------|---------|---------|
| DRAFT | PM | 用户提需求 | PM 完成领悟 |
| SPEC | PM | 启动 Wizard 采集 | Spec 文档生成 |
| CONFIRMED | PM | 用户说"确认" | PM 交接包交 CTO |
| ASSIGNED | CTO | 完成分解分配 | 工程师收到工单 |
| IN_PROGRESS | 工程师 | 按工单执行 | 提交完工报告 |
| CTO_REVIEW | CTO | 收到完工报告 | 通过→QA / 驳回→REWORK |
| QA_AUDIT | QA | 收到审计包 | 通过→PM / 驳回→REWORK |
| PM_VERIFY | PM | 收到交付包 | 通过→用户 / 驳回→REWORK |
| DELIVERED | PM | 展示给用户 | 用户确认→CLOSED |
| REWORK | CTO | 任何驳回 | 修复后回到驳回点 |
| CLOSED | — | 用户确认 | 归档 |

---

## §1 需求获取 (DRAFT → SPEC → CONFIRMED)

> **加载:** `skills/project-manager.md` §2-§4, `skills/requirements.md`

```
PM 领悟 (§2) → Wizard 采集 (requirements.md Phase 1)
    → 输出 Spec (requirements.md Phase 2)
    → 用户确认 (requirements.md Phase 3)
    → CONFIRMED
```

### PM → CTO 交接包

```
📦 需求交接包
├── Spec 文件: .agent/projects/{project}/data/specs/{file}.md
├── 用户确认: ✅ (原话概要)
├── PM 分类: {前端/后端/全栈/数据/安全/基建}
├── PM 预估: {S/M/L/XL}
└── 风险标注: {无 / 列出}
```

> **📍 记忆:** PM 同时创建 `TRACKER-{task-id}.md` → `core/skills/memory.md` §1

---

## §2 任务分配 (CONFIRMED → ASSIGNED)

> **加载:** `skills/chief-engineer.md` §2-§3, 然后按域加载 `skills/domains/*.md`

```
CTO 审查交接包 → 按 PM 标注的域加载域索引 (domains/*.md)
    → 域索引定位具体工程师 SOP + section
    → 分解子任务 → 分配
    → 输出任务分配单 → 存 .agent/projects/{project}/data/plans/
```

> **Plan 命名和生命周期: `core/skills/project-structure.md` §3.4 + §4**

> **📍 规划:** 如果变更 ≥ 3 个文件 → 强制执行 `core/skills/memory.md` §4 大任务规划。

### 阶段化交付原则 (ECC Sizing & Phasing)

> **大任务必须拆成可独立交付的阶段, 每阶段独立可验证:**

| 阶段 | 目标 | 说明 |
|------|------|------|
| Phase 1 | **最小可用** | 最小切片就提供价值, 能独立运行 |
| Phase 2 | **核心体验** | 完整 happy path |
| Phase 3 | **边缘处理** | 错误处理, 边界条件, 打磨 |
| Phase 4 | **优化** | 性能, 监控, 埋点 |

**铁律: 每个 Phase 必须能独立合并。禁止"全部完成才能用"的计划。**

### CTO → 工程师 任务工单

```
🔨 工单 #{N}: {标题}
├── Spec: {路径}
├── 负责: {工程师角色}
├── 依赖: {无 / 工单 #X}
├── SOP: {skill.md} §{section}
├── L3: {如需要, 指定工具切片}
├── 验收标准:
│   - [ ] {标准 1}
│   - [ ] {标准 2}
└── 完工后: 提交完工报告 (§3 格式) → CTO
```

---

## §3 执行纪律 (ASSIGNED → IN_PROGRESS → 完工报告)

> **加载:** 对应工程师 SOP (各 SOP 已含 L3 引用)

### 3.1 执行规则（引用真相源）

> 本节只保留执行入口，不重复 Rules 正文。详细条款以下列真相源为准：
>
> - 通用规则：`core/rules/common.md`（§1 代码风格、§5 验证循环、§6 影响分析、§9 拆分复用）
> - 前端反模式：`core/rules/frontend.md`
> - 后端反模式：`core/rules/backend.md`
> - 记忆与复盘：`core/skills/memory.md`
> - 协作传播：`core/skills/collaboration.md` §7
> - 项目铁律：`projects/mgmt/reference/iron-laws.md`
>
> **执行最小清单（必须）：**
>
> 1. 严格按工单 + Spec 执行，不超范围；不确定先查证，禁止猜测。
> 2. 每步更新 TRACKER；涉及共享模块必须做消费者追溯。
> 3. 增量验证：子任务完成即执行编译/类型检查，失败立即修复。
> 4. 交付前通过验证门禁（编译/类型/lint/测试/覆盖率/安全）并完成功能性验证。
> 5. 交付前逐条对照用户原始需求，未验证项不得声称完成。

### 3.1.1 重构保真执行（🔴 强制）

当任务属于重构/迁移时，额外执行：
- 先完成“原实现像素级审计”，再开始改造。
- 同步建立“老架构弱点清单”（性能/安全/不合理设计），并映射到新架构修复项。
- 建立等价性矩阵（旧 vs 新：输入/输出/副作用/错误语义）。
- 未确认信息统一标记 `UNKNOWN`，禁止猜测实现。
- 按切片计划执行并逐片验证；每片可独立回滚。
- 交付前必须通过 `core/reference/refactor-fidelity-checklist.md`。
- 等价性验证必须使用 `core/templates/refactor-equivalence-matrix-template.md` 并附证据链。
- 必须执行自动校验：`core/scripts/refactor-equivalence-audit.sh <matrix-file>`（FAIL 阻断）。

### 3.2 完工报告 (工程师 → CTO)

必须使用：`core/templates/engineer-completion-report-template.md`（固定结构：摘要/文件清单/验证/影响半径/UNKNOWN/证据）

```
✅ 完工报告: 工单 #{N}
├── 变更清单:
│   | 文件 | 类型 | 说明 |
│   | {path} | 新增/修改/删除 | {一句话} |
├── 影响分析 (collaboration.md §7):
│   | 变更 | 下游 | 已同步? |
│   | {X} | {Y} | ✅/❌ |
├── 自测:
│   - [ ] 编译通过
│   - [ ] 核心路径手动验证
│   - [ ] git diff 无意外
└── 备注: {问题/决策/建议}
```

---

## §4 整合验证 (CTO_REVIEW)

> **加载:** `skills/chief-engineer.md` §5

```
CTO 汇总完工报告 → 执行验证清单 (CTO SOP §5.1)
    → 按审批标准判定:
      ✅ Approve (零 CRITICAL/HIGH): 打包审计包 → QA
      ⚠️ Warning (仅 HIGH): 记录 + CTO 判断是否放行 → QA 或 REWORK
      🔴 Block (有 CRITICAL): 开返工工单 (§7)
```

### 置信度过滤 (ECC Confidence-Based Filtering)

> CTO 审查时只报告 **>80% 确信是真问题** 的发现:

| 动作 | 条件 |
|------|------|
| **报告** | >80% 确信是真正的 bug/安全/数据风险 |
| **跳过** | 纯风格偏好 (除非违反 Rules 层) |
| **跳过** | 未变更代码中的问题 (除非是 CRITICAL 安全) |
| **合并** | 同类问题 ("5 个函数缺错误处理" 而非 5 条) |
| **优先** | 可能导致 bug / 安全漏洞 / 数据丢失 的问题 |

### CTO → QA 审计包

结论格式必须使用：`core/templates/cto-integration-verdict-template.md`

```
📦 审计包
├── Spec: {路径}
├── CTO 验证: ✅ 通过
├── 变更总览: {N} 个工单, {N} 文件变更
├── 验证记录:
│   编译 ✅ | 类型 ✅ | 接口 ✅ | 影响链 ✅
└── QA 关注点: {特别说明}
```

---

## §5 QA 审计关 (QA_AUDIT)

> **加载:** `skills/qa-auditor.md` §2 (含分场景模板 §2.5 + 影响半径 §2.6)

```
QA 读 Spec → 选审计模板 (§2.5) → 执行审计清单 (§2.2)
    → 影响半径分析 (§2.6) → 输出审计报告 (§2.3)
    → 按审批标准判定:
      ✅ Approve (零 CRITICAL/HIGH): 交 PM
      ⚠️ Warning: 仅 HIGH → 记录建议, 可交 PM 但标注风险
      🔴 Block (有 CRITICAL): 开返工工单 (§7), 必须修复
```

### QA → PM 交付包

结论格式必须使用：`core/templates/qa-verdict-report-template.md`

```
📦 交付包
├── Spec: {路径}
├── QA 审计: ✅ 通过
├── 摘要: 编译✅ 功能✅ 回归✅ 安全✅ i18n✅
├── 完整审计报告: .agent/projects/{project}/data/audits/{file}.md
└── QA 建议: {如有}
```

---

## §6 交付关闭 (PM_VERIFY → DELIVERED → CLOSED)

> **加载:** `skills/project-manager.md` §5.3-§5.4

```
PM 交付物完整性检查 (§5.3)
    → 🔴 功能性验证 (非编译验证):
        前端: 启动 dev server + 检查 UI 渲染 / 数据绑定 / 交互行为
        后端: curl / httpie 发真实请求验证响应
        集成: 前端调用后端 API → 验证数据 E2E 流通
    → 🔴 用户需求对照表 (逐条打勾)
    → 通过 → 交付给用户
    → 用户确认 → PM 回归检查 (§5.4) → 关闭
```

### 🔴 交付前自检清单 (Delivery Gate Checklist)

> 输出给用户时，必须复用固定模板：`core/templates/delivery-gate-output-template.md`（不得改样式，不得省略“功能验证”项）。

> 若“功能验证”为 ❌，必须显式写明“未完成真实运行验证，不可宣称已交付完成”。

### 关闭记录

```
✅ 任务关闭
├── 任务: {名称}
├── Spec: {路径} — 状态标为 CLOSED
├── 用户确认: ✅
├── 关闭时间: {YYYY-MM-DD HH:MM}
└── 后续: {无 / 记录到 requirements-list}
```

**关闭后操作 (按 `core/skills/project-structure.md` §6.2 删除规则):**
- 更新 `.agent/projects/{project}/data/progress/requirements-list.md`
- Spec 文件 §9 标记 CLOSED
- 🔴 **错题本归档** → 本次任务中所有修复的问题归档到 `.agent/projects/{project}/data/errors/ERROR-BOOK.md` (`core/skills/memory.md` §3`)
- 🔴 **交叉检查确认** → 确认所有错题本条目的交叉检查已完成 (`core/skills/memory.md` §3.5`)
- 📘 **项目复用记忆沉淀** → 将本次可复用需求写入 `.agent/projects/{project}/data/progress/PROJECT-MEMORY.md` (`core/skills/memory.md` §3.6)
- ✅ 执行 `core/skills/memory.md` §2 验收后协议:
  - 产出文件写入 ACCEPTED.md
  - 删除 Spec 文件 (`data/specs/`)
  - 删除 Plan 文件 (`data/plans/`)
  - 删除 TRACKER-{task-id}.md
  - 删除相关 Checkpoint
  - 审计报告: 问题全修复 → 删除; 未修复 → 保留
- ✅ 执行 `core/skills/project-structure.md` §6.3 健康检查
- ✅ 执行记忆去重审计：`core/scripts/memory-dedupe-audit.sh .agent/projects/{project}`
- ✅ 执行产物生命周期审计：`core/scripts/artifact-lifecycle-audit.sh .agent/projects/{project}`
- ✅ 修复完成后清理审计报告：`core/scripts/artifact-lifecycle-audit.sh .agent/projects/{project} --cleanup-audits`
- ✅ 审计报告空目录强校验：`core/scripts/artifact-lifecycle-audit.sh .agent/projects/{project} --enforce-no-audits`
- ✅ 清理任务临时目录（两阶段删除）：`core/scripts/artifact-lifecycle-audit.sh .agent/projects/{project} --cleanup-task {task-id}`
- ✅ 清理过期临时回收站：`core/scripts/artifact-trash-purge.sh .agent/projects/{project} 24`
- 🔴 **自动 Git 提交+推送:**
  ```bash
  git add -A
  git commit -m "✅ {任务名称} — CLOSED"
  git push
  ```
  > 用户确认后自动执行, 无需额外询问。commit message 包含任务名称。
  > ⚠️ push 失败时: 提示用户 "commit 已完成, 但 push 失败 (原因: {错误}), 请手动 `git push`"。

---

## §7 返工协议

> **任何驳回都走此流程。口头驳回 = 无效。**

### 7.1 返工工单

必须使用：`core/templates/rework-ticket-template.md`

```
🔄 返工 #RW-{NNN}
├── 来源: {CTO_REVIEW / QA_AUDIT / PM_VERIFY}
├── 驳回人: {角色}
├── 驳回项:
│   | # | 问题 | 严重级 | 位置 | 修复方向 |
│   | 1 | {描述} | 🔴/🟡 | {file:line} | {建议} |
├── 分配: {工程师角色}
├── 复审: {只审驳回项 / 全量}
└── 追踪:
    | 项 | 修复 | 复审 |
    | #1 | ⬜ | ⬜ |
```

### 7.2 流转

```
驳回 → CTO 开返工工单 → 分配工程师
    → 修复 → 🔴 问题复盘铁律 (记录错题本 + 交叉检查同类)
    → 完工报告 (§3.2)
    → 回到驳回点复审 (默认只审驳回项)
    → 通过 → 继续流转
    → 不通过 → 再次返工
```

### 7.3 升级

| 返工次数 | 处理 |
|---------|------|
| 1 次 | 正常修复 |
| 2 次 | CTO 亲自审查修复方案 |
| 3+ 次 | PM 介入, 可能需和用户重新确认需求 |

---

## §8 L3 工具库引用

| 环节 | 推荐工具 | 路径 | 何时加载 |
|------|---------|------|---------|
| §2 任务分解 | ECC: Planner | `warehouse/tools/everything-claude-code/01-agents-review.md` §2 | 大型任务分解参考 |
| §4 整合验证 | ECC: Reviewer | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | 需要深度审查清单时 |
| §3 提交前 | 🔴 Rules 层 | `core/rules/common.md` + `core/skills/frontend.md` / `core/skills/backend.md` | **必查** — 反模式 + 自检 Checklist |
| 各 §3 执行 | 各工程师 SOP 已含 L3 引用 | — | 自动跟随 |
| 各 §5 审计 | QA SOP 已含 L3 引用 | — | 自动跟随 |

---

*Version: 3.0.0 — 闭环强化 (ECC 整合: Approval Criteria + Phased Delivery + PostToolUse + Confidence Filter)*
*Created: 2026-02-12 | Updated: 2026-02-15*
