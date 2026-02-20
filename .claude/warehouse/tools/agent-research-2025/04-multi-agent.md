---
name: multi-agent
sources:
  - "Google: A2A Protocol — 2025-04"
  - "Google DeepMind: Intelligent Delegation Framework — 2026-02"
  - "Google: SAIF 2.0 Agent Safety — 2025"
  - "OpenAI: Agents SDK — 2025-03"
  - "Anthropic: Multi-Agent Research (2024-2025)"
---

# 多 Agent 协作模式

---

## Orchestrator-Worker 模式（主流架构）

**核心概念**:
```
Orchestrator (编排者)
  ├── 接收用户任务
  ├── 分解为子任务
  ├── 分配给 Worker Agents
  ├── 收集结果
  └── 整合交付

Worker Agents (执行者)
  ├── 专业化（每个 Worker 专注特定领域）
  ├── 独立执行（无直接通信，通过 Orchestrator 协调）
  └── 可并行运行（无依赖关系时）
```

**在我们框架中的体现**:
- Orchestrator = CTO（`chief-engineer.md`）
- Worker = 各领域工程师（backend / frontend / data / ...）
- 协调工具 = 追踪器（TRACKER.md）

**重要**: 避免 Mesh 模式（所有 Agent 互相通信），会导致协调复杂度爆炸。

---

## Google A2A Protocol（Agent-to-Agent 通信）

**来源**: Google 2025-04

**定位**: 补充 MCP（Model Context Protocol），专注 Agent 间通信。

| 协议 | 定位 | 解决问题 |
|------|------|---------|
| **MCP** | Agent ↔ 工具/资源 | 标准化工具调用接口 |
| **A2A** | Agent ↔ Agent | 标准化 Agent 间委托与通信 |

**A2A 核心能力**:
- Agent Discovery（发现可用的其他 Agent）
- Task Delegation（委托任务给专门 Agent）
- Result Aggregation（汇聚多个 Agent 的结果）
- Status Tracking（追踪委托任务的状态）

**实践意义**: 未来 Agent 可以动态组合，CTO 可以找"专家 Agent"执行特定任务。

---

## Intelligent Delegation Framework（DeepMind 2026-02）

**来源**: Google DeepMind "Trust in Delegation" 2026-02

**核心问题**: 委托任务时，如何控制 Agent 的权力边界？

**DCTs（Delegation Capability Tokens）**:
```
委托者（Delegator）                    被委托者（Delegate）
      │                                       │
      │  DCT = {                              │
      │    task_scope: "修复登录 Bug",         │
      │    allowed_files: [auth/*],            │
      │    allowed_actions: [read, edit],      │
      │    forbidden: [delete, deploy],        │
      │    expiry: "24h",                      │
      │  }                                    │
      │──────────── DCT ─────────────────────►│
      │                                       │ 只能在 DCT 范围内行动
      │◄─────────── 结果 ─────────────────────│
```

**三个委托要素**:
1. **权限 (Authority)** — 什么任务、哪些文件
2. **责任 (Responsibility)** — 执行结果由谁负责
3. **问责 (Accountability)** — 如何审计和回溯

**在我们框架中的对应**:
- DCT ≈ CTO 工单中的 Scope + DoD + 允许修改文件范围
- Orchestrator 保留的权限 ≈ `chief-engineer.md §3.1` "最小权力委托"原则

---

## SAIF 2.0 Agent 安全（Google）

**来源**: Google Secure AI Framework 2.0

**Agent 安全三原则**:

| 原则 | 含义 | 在我们框架中 |
|------|------|------------|
| **明确 Controller** | 每个 Agent 都有明确的负责人/协调者 | CTO 是 Workers 的 Controller |
| **有限权力** | Agent 只能执行其角色所需的操作 | 工单严格定义 Scope |
| **可观测操作** | 每个操作都可被监控、审计、回滚 | git commit 每步 + TRACKER.md |

**安全层次**:
```
系统层: 工具权限控制（不能访问超出范围的文件/API）
任务层: 工单 Scope 限制（工程师只改指定文件）
会话层: Context 隔离（不同任务不共享 context）
审计层: 所有操作记录在 TRACKER.md
```

---

## OpenAI Agents SDK（对比参考）

**来源**: OpenAI 2025-03

**4 个核心原语**:
1. **Agents** — 带指令和工具的 LLM
2. **Handoffs** — Agent 间任务传递
3. **Guardrails** — 输入/输出验证
4. **Tracing** — 完整执行追踪

**与我们框架对比**:
| OpenAI SDK | 我们框架 |
|-----------|---------|
| Agents | 各角色 SOP (PM/CTO/工程师/QA) |
| Handoffs | 任务状态机 + 交接协议 |
| Guardrails | Rules 层 + QA 审计 |
| Tracing | TRACKER.md + 验证循环 |

---

## Token 效率（多 Agent 代价）

> "Multi-agent systems use approximately 15x more tokens than simple chat interactions."

**实践含义**:
- 每次任务分配都有 Token 代价（读 Spec → 读 SOP → 执行 → 报告）
- 小任务不要过度拆分（1 个工程师 1 小时的工作不需要 5 个 Agent）
- 复杂任务拆分是值得的（并行省时间，但省的是挂钟时间，不是 Token）

**优化策略**:
- L1 文件路由表（轻量路由，避免读完整文件）
- JIT 加载（只在需要时加载）
- Context Budget 控制（单次 ≤ 30KB）

---

*Version: 1.0.0 — Google / OpenAI / Anthropic (2025-04 ~ 2026-02)*
