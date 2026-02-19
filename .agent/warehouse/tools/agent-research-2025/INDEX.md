---
name: agent-research-2025
description: Agent 构建最新研究精华（Anthropic/Google/OpenAI 2025 H2 — 2026 Q1）。Use when 需要了解最新 Agent 设计原则、工具优化、评估方法或多 Agent 协作模式。
sources:
  - Anthropic Engineering Blog (2025-09 ~ 2026-02)
  - Google DeepMind / Google Workspace AI (2025-04 ~ 2026-02)
  - OpenAI Agents SDK Docs (2025-03 ~ 2026-02)
---

# Agent 构建最新研究精华 (2025 H2 — 2026 Q1)

> **此工具是 ECC 的补充**, 专注 2025 H2 后的新研究成果。
> **加载规则**: 先看此 INDEX.md，确认相关后再读具体切片。

---

## 切片目录

| 文件 | 内容 | 何时加载 |
|------|------|---------|
| `01-context-engineering.md` | Context Rot / Progressive Disclosure / JIT Retrieval / Context Budget | 设计 Agent 上下文策略时 |
| `02-tool-design.md` | Tool Search Tool / Programmatic Tool Calling / 工具设计原则 | 设计工具集 / 减少 Token 消耗时 |
| `03-eval-harness.md` | pass@k / pass^k / Harness 架构 / Dual-Agent | 设计测试策略 / 评估框架时 |
| `04-multi-agent.md` | Orchestrator-Worker / A2A Protocol / Intelligent Delegation / SAIF 2.0 | 设计多 Agent 协作时 |

---

## 核心数据速查

| 指标 | 数据 | 来源 |
|------|------|------|
| Tool Search Tool 节省 | **85%** 工具调用 Token | Anthropic 2025-11 |
| Programmatic Tool Calling | **37%** Token 减少 | Anthropic 2025-11 |
| Multi-Agent vs Chat | **~15x** Token 消耗 | Anthropic 内部测试 |
| Context Rot 根因 | 注意力机制 n² 复杂度，context 越长质量越低 | Anthropic 2025-09 |
| 性能方差 | **80%** 由 Token 数量解释 | Anthropic 研究 |

---

## 关键原则速查（不需要读切片）

### Context Engineering（2025-09）
- Context = Agent 的唯一工作空间（无 RAM/文件系统）
- 最小高信号 Token 集 > 越多越好
- JIT（Just-In-Time）加载：遇到问题时才加载对应工具
- 定期 Compaction：清除完成任务的历史上下文
- Progressive Disclosure：先读摘要/路由，需要时才读完整内容

### Tool Design（2025-11）
- Tool Search Tool：暴露工具描述，Agent 按需获取完整文档
- 语义化命名：`search_documents` > `sd` > `tool_1`
- 工具是技能包而非功能包

### Eval（2026-01）
- pass@k = 至少 1 次成功（探索性）
- pass^k = 全部成功（生产稳定性）
- 每次 Eval 必须 Harness 隔离（独立环境）

### Multi-Agent（2025 ~ 2026）
- Orchestrator-Worker 是主流模式（不是 Mesh）
- A2A Protocol（Google 2025-04）：Agent 间通信标准（补充 MCP）
- Intelligent Delegation（DeepMind 2026-02）：委托时转移权限+责任+问责
- SAIF 2.0（Google）：Agent 必须有明确 Controller、有限权力、可观测操作

---

*Version: 1.0.0*
*Created: 2026-02-19*
*Sources: Anthropic / Google DeepMind / OpenAI (2025 H2 — 2026 Q1)*
