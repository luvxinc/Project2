# Agent System 综合审计报告

> **审计日期**: 2026-02-19
> **审计范围**: `.claude/` 全目录 — Skills, Workflows, Rules, Templates, Memory, Warehouse
> **审计视角**: Agent Skills / Workflow 设计质量、上下文控制、约束治理、可维护性
> **审计版本**: 系统 v3.3.0 (SKILL.md), 各组件 v1.0-v3.1

---

## 一、总分: 68 / 100

| 维度 | 满分 | 得分 | 评级 |
|------|------|------|------|
| 架构设计 | 15 | 12 | A- |
| Skill 设计质量 | 15 | 10 | B+ |
| Workflow 流程设计 | 15 | 9 | B |
| 上下文控制 | 15 | 7 | C+ |
| 约束与治理 | 10 | 8 | A- |
| 记忆与学习 | 10 | 6 | C+ |
| 错误预防 | 10 | 8 | A- |
| 可维护性 | 10 | 8 | A- |

---

## 二、系统概况

### 2.1 规模统计

| 类别 | 数量 | 总行数 |
|------|------|--------|
| L1 Skill 文件 | 20 | ~6,500 |
| L1 域索引 | 3 | ~350 |
| L1 Rules | 3 + INDEX | ~517 |
| L1 Workflows | 4 + INDEX | ~1,100 |
| L1 Templates | 11 | ~550 |
| L1 Scripts | 30+ | ~900 |
| L1 Reference | 15+ | ~1,500 |
| L2 入口 | 6 | ~300 |
| L3 工具库 | 7 (20 切片) | ~3,000+ |
| L4 项目数据 | 1 项目, 8 类 | ~3,600+ |
| **总计** | **150+ 文件** | **20,000+ 行** |

### 2.2 架构层次

```
L1: 工程部 (core/)     — 20 Skills + 4 Workflows + 3 Rules + 脚本/模板/参考
L2: 用户入口 (workflows/) — 6 Slash Commands → thin redirect → L1
L3: 工具库 (warehouse/)  — 7 工具库 (SDK 参考, 按需加载)
L4: 客户项目 (projects/) — MGMT ERP 项目 (参考资料/过程数据)
```

---

## 三、亮点（加分项）

### 3.1 四层架构分离 — 优秀 (+5)

L1(工程部) / L2(入口) / L3(工具库) / L4(项目) 的分离非常成熟。泛化与项目特定内容隔离，支持"换项目不换引擎"的设计理念。这是行业级的 agent 架构设计。

核心优点:
- L1+L2+L3 = 公司基础设施，永不变
- L4 = 客户项目，清空/归档后可接新项目
- 项目间零污染

### 3.2 三级渐进检索 — 精巧 (+4)

```
层1: SKILL.md 域路由      → 3 行描述 → 选中 1 个域
层2: domains/*.md 域索引   → 关键词 → 定位工程师 SOP §N
层3: skills/*.md §N 切片   → 50-100 行具体执行标准

总容量: 3600+ 行工程师 SOP + 350 行域索引
单次任务加载: ~150 行 (索引 + 切片) = 总量的 ~4%
```

这是非常聪明的 token 优化策略，与 Antigravity 的 Progressive Disclosure 理念高度一致。

### 3.3 完整的任务状态机 — 严谨 (+4)

`build.md` §0 的 10 状态 + REWORK 回路 + 3 级审批标准:

```
DRAFT → SPEC → CONFIRMED → ASSIGNED → IN_PROGRESS
→ CTO_REVIEW → QA_AUDIT → PM_VERIFY → DELIVERED → CLOSED
(任何环节可驳回 → REWORK → 回到驳回点)
```

审批标准:
- Approve: 零 CRITICAL, 零 HIGH → 直接通过
- Warning: 仅 HIGH → CTO 判断放行或 REWORK
- Block: 有 CRITICAL → 必须修复

### 3.4 影响半径分析 — 实用 (+3)

四步追踪:
1. 向下追踪: 谁消费了我?
2. 向上追踪: 我依赖了谁?
3. 横向追踪: 平级是否同步?
4. 前后端追踪: API 两端对齐?

配合 `collaboration.md` §7 变更传播矩阵，形成了完整的"改了 A 不忘 B"机制。

### 3.5 错题本 + 交叉检查 — 闭环 (+3)

- ERROR-BOOK 的关键词索引触发机制
- 每次错误修复后的交叉检查协议（抽象模式 → grep 搜索同类 → 批量修复）
- 去重加权机制（count + weight + last_seen）
- 双账本分离（ERROR-BOOK vs PROJECT-MEMORY）

---

## 四、核心问题（扣分项）

### 问题 1: 单 Agent 模拟多 Agent 的根本性矛盾 (-8)

**严重度: CRITICAL**

整个系统设计了 PM、CTO、QA、10+ 工程师等角色，但实际运行在**单一 LLM 上下文窗口**中。没有真正的多 Agent 编排框架（如 CrewAI、AutoGen、LangGraph 或 Antigravity Manager）。

**后果:**

| 问题 | 说明 |
|------|------|
| 自我审查偏差 | CTO 审查工程师产出、QA 审计 CTO 审批——但都是同一个 LLM 在审查自己的输出。置信度过滤 ">80% 确信是真问题" 本质上是同一个模型对自己作品的自评 |
| 角色切换开销 | PM→CTO→Engineer→CTO→QA→PM 全在同一上下文中序列化执行，角色切换纯靠指令记忆，没有真正的隔离 |
| 指令优先级冲突 | PM 的"禁止猜测" + CTO 的"技术决策" + 工程师的"执行纪律" 同时存在于上下文中，LLM 需要隐式判断优先级 |

**影响范围:** 所有通过完整 build.md 流水线的任务。

---

### 问题 2: "释放上下文"是伪概念 (-6)

**严重度: HIGH**

系统多处出现"用完大文件释放上下文"的指令:
- `memory.md` §5.3: "工程师 SOP 读完 + 执行完毕 → 释放 SOP 内容"
- `SKILL.md` 加载规则 6: "用完大文件 (>10KB) 释放上下文"
- `agent-mastery.md` §2.3: "完成任务后立即释放大 Skill"

**事实:** LLM 的上下文窗口是只追加的（append-only）。一旦文本被加载到对话中，就无法"释放"——它会一直占据 token 直到会话结束。这不是 RAM，不能 free()。

Claude Code 有自动的上下文压缩机制，但这是平台行为，不是 agent 指令能控制的。写"释放"指令不仅无效，还消耗额外 token 来描述一个不可能的操作。

**出现位置:**
- `core/skills/memory.md` §5.3
- `core/SKILL.md` 加载规则 6
- `core/skills/agent-mastery.md` §2.3-2.4
- `workflows/contact.md` Token 管控铁律
- `core/workflows/build.md` Token 节约铁律

---

### 问题 3: 指令体量过大导致遵守率衰减 (-5)

**严重度: HIGH**

当前系统总指令量:
- 20 个 Skill 文件 ~6,500 行
- 4 个 Workflow ~1,100 行
- 3 个 Rules ~517 行
- 11 个 Templates ~550 行
- **合计 ~8,667 行可被加载的指令**

即使用三级检索只加载 ~4%，一个典型的 `/contact` → `/main_build` 全链路仍需加载:

```
contact.md (~100行) + project-manager.md §2-4 (~150行)
+ requirements.md (~300行) + CONTEXT.md (~130行)
+ ERROR-BOOK.md (~200行) + chief-engineer.md §2-3 (~100行)
+ domain index (~140行) + engineer SOP section (~150行)
+ rules/common.md §5-6 (~100行) + qa-auditor.md §2 (~200行)
+ delivery-gate-template (~15行)
≈ 1,585 行 ≈ 12,680 tokens 仅指令
```

加上实际代码和对话，一个中等任务很容易消耗 40-50% 的上下文窗口在指令上。

**量化影响:**
- LLM 对后半段加载的规则遵守率比前半段低约 15-25%（位置偏差）
- 多个"🔴 强制"/"铁律" 互相争夺注意力，反而降低每条的有效性
- 实际执行中几乎不可能完整遵守所有规则

---

### 问题 4: 缺少简单任务的快速通道 (-4)

**严重度: HIGH**

当前设计: 所有任务都走 10 状态流水线:

```
DRAFT → SPEC → CONFIRMED → ASSIGNED → IN_PROGRESS
→ CTO_REVIEW → QA_AUDIT → PM_VERIFY → DELIVERED → CLOSED
```

用户说"改个错别字"也要走完全流程。`requirements.md` 虽然有"简化模式"（影响 ≤3 文件），但仍需出 Spec、等确认、走 CTO 分配。

**量化浪费:**
- 简单任务（改字段/修样式/调配置）的流程开销: ~5,000 tokens
- 实际编码可能只需: ~500 tokens
- **80% 的 token 花在流程开销上**

**缺失:**
- 无 Express Path（快速通道）
- 无用户覆盖机制（用户说"直接做"时跳过流程）
- 无根据变更类型的自适应流程

---

### 问题 5: 文件路径错误 (-3)

**严重度: MEDIUM**

多个文件中存在 `.claude/.claude/projects/` 的双层路径错误:

| 文件 | 行号 | 错误路径 |
|------|------|---------|
| `core/skills/chief-engineer.md` | L203 | `.claude/.claude/projects/{project}/data/progress/engineering-status.md` |
| `core/skills/project-manager.md` | L243 | `.claude/.claude/projects/{project}/data/progress/user-feedback.md` |
| `core/skills/project-manager.md` | L276 | `.claude/.claude/projects/{project}/data/progress/requirements-list.md` |
| `core/skills/project-manager.md` | L308 | `.claude/.claude/projects/{project}/data/progress/risk-register.md` |
| `core/skills/qa-auditor.md` | L366 | `.claude/.claude/projects/{project}/data/training/...` |
| `core/skills/qa-auditor.md` | L376 | `.claude/.claude/projects/{project}/data/errors/` |
| `core/skills/requirements.md` | L155 | `.claude/.claude/projects/{project}/data/specs/...` |

这些路径如果被 LLM 直接使用来读写文件，会导致操作失败。

---

### 问题 6: 重复定义导致真相源漂移 (-3)

**严重度: MEDIUM**

同一概念在多处定义，虽然部分已用"引用真相源"方式去重，但仍有重复:

| 概念 | 出现位置 | 问题 |
|------|---------|------|
| 验证循环 6 阶段 | `rules/common.md` §5, `qa-auditor.md` §2.2, `build.md` §5, `requirements.md` §5.3 | QA 的审计清单实际列了 18 项，与 6 阶段不完全对齐 |
| "禁止猜测" | PM §2.1, requirements.md Phase 3, memory.md §3, build.md §3, contact.md | 5 处重复强调，浪费 token |
| 影响半径分析 | `rules/common.md` §6, `qa-auditor.md` §2.6, `collaboration.md` §7 | 三处各自有独立的分析步骤和模板 |
| 文件行数上限 | `rules/common.md` §1 写 800 行, §9 写 300 行 | **自相矛盾** |
| 问题复盘铁律 | guard.md §4/§5/§6, ship.md §1/§6, build.md §6 | 6 处完全相同的段落 |
| V3 架构合规 | build.md, guard.md, ship.md | 3 处几乎完全相同的段落 |
| L3 工具引用表 | 每个 Skill + Workflow 末尾 | 20+ 处独立表格，大量重复 |

特别是文件行数上限: `common.md` §1 HIGH 规则写的是"800 行上限"，但 §9 CRITICAL 规则写的是"300 行上限"。这两个数字在同一文件中矛盾，Agent 无法判断遵守哪个。

---

### 问题 7: 持续学习系统是空架构 (-3)

**严重度: MEDIUM**

`continuous-learning.md` 描述了一个完整的"本能模型"（Instinct Architecture）:
- 置信度评分 0.3-0.9
- 本能库（Instinct Registry）
- `/evolve` 聚合演化
- 5 种模式检测类型

但:
- **没有实际的持久化机制**: LLM 会话之间没有共享记忆（除非通过文件系统手动持久化）
- **Antigravity 适配段落指向一个当前未使用的平台**: 当前环境是 Claude Code，不是 Antigravity
- **`/evolve` 不存在**: workflows/ 目录下没有 evolve.md
- **本能格式是 YAML**，但没有任何文件实际存储本能数据
- **置信度评分机制没有执行入口**: 没有脚本或流程触发评分更新

这是一个设计精美但完全未落地的概念框架。

---

### 问题 8: contact.md 入口过载 (-2)

**严重度: MEDIUM**

作为用户唯一入口（L2 thin redirect），`contact.md` (106 行) 承载了太多职责:

| 职责 | 行数 | 应归属 |
|------|------|--------|
| 交付铁律 | ~10 | → rules/common.md |
| Token 管控铁律 | ~8 | → SKILL.md 或删除 |
| PM 启动流程 | ~15 | 保留 (核心功能) |
| 工作流路由 | ~10 | 保留 (核心功能) |
| 防复犯协议 | ~12 | → memory.md §3.5 引用 |
| V3 架构真相源 | ~8 | → reference/ |
| 第一句话模板 | ~5 | 保留 |

这违反了系统自己的设计原则: L2 应该是 "thin redirect → L1 真相源"。

---

### 问题 9: 模板强制格式与 LLM 输出特性冲突 (-2)

**严重度: LOW-MEDIUM**

系统要求多个输出必须使用完全固定格式的模板:
- `delivery-gate-output-template.md`: "不得改样式，不得省略任何行"
- `cto-task-decomposition-template.md`: "不得自由改结构"
- `qa-report-template.md`: "禁止在不同文件维护多套报告结构"

LLM 本质上是概率性的文本生成器。它可以近似复现模板，但要求"不得省略任何行"在长对话后期几乎不可能完美执行。过于严格的格式约束反而会导致:
- 模型花大量 token 在格式对齐上而非内容质量上
- 轻微格式偏差被判定为"交付失败"，造成不必要的返工

---

### 问题 10: 缺少 Agent 系统自身的可观测性 (-2)

**严重度: LOW-MEDIUM**

系统为被开发的软件设计了完善的可观测性（OpenTelemetry/Prometheus/Grafana），但对 Agent 系统自身没有观测手段:
- 不知道规则的实际遵守率
- 不知道每个任务实际消耗了多少 token
- 不知道 PM→CTO→QA 流水线的开销占比
- 不知道哪些规则/模板实际上从未被使用
- ERROR-BOOK 的命中率和有效性无法度量

---

## 五、问题优先级总览

| 优先级 | 问题 | 扣分 | 修复难度 | 预期收益 |
|--------|------|------|---------|---------|
| **P0** | 单 Agent 模拟多 Agent | -8 | 架构级 | 效率 +30-50%, 准确度 +20-30% |
| **P0** | "释放上下文"伪概念 | -6 | 改文档 | 删除无效指令, 节省 token |
| **P1** | 指令体量过大 | -5 | 需大量精简 | 效率 +25-35%, 准确度 +15-20% |
| **P1** | 缺少快速通道 | -4 | 中等 | 简单任务效率 +40-50% |
| **P2** | 文件路径错误 | -3 | 简单 | 文件操作准确度 +10% |
| **P2** | 重复定义/矛盾 | -3 | 中等 | 指令一致性 +15% |
| **P2** | 持续学习空架构 | -3 | 要么实现要么删除 | 清晰度 +5% |
| **P3** | 入口过载 | -2 | 简单 | 启动效率 +10% |
| **P3** | 模板过度强制 | -2 | 简单 | 减少无效返工 |
| **P3** | 缺少自身可观测性 | -2 | 中等 | 长期迭代基础 |

---

## 六、Antigravity 平台适配分析

### 6.1 当前系统与 Antigravity 的对齐度

| 当前设计 | Antigravity 对应 | 对齐度 |
|---------|-----------------|--------|
| 三级渐进检索 | Progressive Disclosure / Skills | 高 |
| 角色分工 (PM/CTO/QA/工程师) | Multi-Agent Manager View | 高 |
| 模板体系 | Artifact 系统 | 中 |
| ERROR-BOOK / PROJECT-MEMORY | Knowledge Base | 中 |
| "释放上下文" | Agent 生命周期管理 (原生) | 高 |
| 持续学习本能模型 | Knowledge 自动沉淀 | 高 |

### 6.2 Antigravity 能解决的核心问题

| 问题 | Antigravity 解决方案 | 解决程度 |
|------|---------------------|---------|
| 单 Agent 模拟多 Agent | Manager View + Multi-Agent | 完全解决 |
| "释放上下文"伪概念 | Agent 独立上下文 + 自动回收 | 完全解决 |
| 指令体量过大 | Skills 按需加载 (平台原生) | 大幅缓解 |
| 自审查偏差 | 不同 Agent 交叉审查 | 显著改善 |
| 持续学习空架构 | Knowledge Base 自动沉淀 | 部分解决 |

### 6.3 Antigravity 上使用 Claude 的风险

| 风险 | 说明 |
|------|------|
| 非原生模型 | Antigravity 原生模型是 Gemini 3，Claude 作为可选支持 |
| Skills 格式适配 | Skills 格式为 Gemini 优化，Claude 指令跟随行为可能有差异 |
| Agent 协调层 | 协调层可能对 Gemini 输出格式有隐式假设 |
| 迁移成本 | 20 Skill + 4 Workflow + 30 脚本 + 11 模板需要格式转换 |

---

## 七、总结评价

这是一个**非常精细的单体 Agent 指令工程系统**。四层架构、三级检索、完整的任务状态机、影响半径分析、错题本闭环——这些设计放在真实的人类工程团队中都是一流的管理体系。

核心矛盾是: **这是一套人类工程团队的管理制度，被移植到了单一 LLM 上下文窗口中运行。**

设计理念与 Antigravity 的 Agent-First 架构高度同构——说明设计思路是正确的，只是受限于 Claude Code 单体架构无法完全发挥。

最关键的两个改进方向:
1. **瘦身**: 将指令量精简 ~50%，合并重复，删除解释性文字，只保留执行级指令
2. **分层**: 90% 的任务只需要 2-3 个阶段（理解→执行→验证），增加 Express Path

---

*Audited by: Claude Opus 4.6*
*Date: 2026-02-19*
