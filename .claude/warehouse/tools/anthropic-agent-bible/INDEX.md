---
name: anthropic-agent-bible
description: Anthropic 15 篇 Agent 核心博客精华 — 金字塔五层体系。Use when 需要 Agent 设计理论基础、框架迭代方向、或验证某个架构决策是否符合最佳实践。
sources:
  - "Anthropic Engineering Blog (2024-12 ~ 2026-02)"
version: v1.0.0
---

# Anthropic Agent Bible — 金字塔五层体系

> **15 篇核心文章的完整精华**, 按从低到高的基石关系组织。
> **加载规则**: 先看此 INDEX.md 的速查表，确认相关后再读具体切片。

---

## 金字塔结构

```
           /\
          /  \       L5: 生产部署
         / 12 \      Evals / Security / Postmortem
        /13 14 \
       /  15    \
      /----------\   L4: 长任务协作
     /  9  10  11 \  Harness / Multi-Agent / MCP
    /--------------\
   /   7       8    \ L3: 上下文工程
  /  Context   RAG   \ Context Rot / JIT / Compaction
 /--------------------\
/   3   4   5   6      \ L2: 工具能力
| Advanced / Design /   | Tool Search / Think / Skills
| Think / Skills        |
\----------------------/
|   1           2      | L1: 基础架构
| Effective    Agent   | Patterns / SDK / ACI
| Agents       SDK     |
\---------------------/
```

## 切片目录

| 文件 | 金字塔层 | 覆盖文章 | 何时加载 |
|------|---------|---------|---------|
| `01-foundation.md` | L1 基础架构 | #1 Building Effective Agents, #2 Agent SDK | 理解 Agent 基本模式 / 架构选型时 |
| `02-tool-mastery.md` | L2 工具能力 | #3 Advanced Tool Use, #4 Writing Tools, #5 Think Tool, #6 Agent Skills | 设计工具 / 优化工具描述 / 减少 Token 时 |
| `03-context-engineering.md` | L3 上下文工程 | #7 Context Engineering, #8 Contextual Retrieval | 管理注意力 / 设计加载策略 / 优化 RAG 时 |
| `04-long-task-collaboration.md` | L4 长任务协作 | #9 Long-Running Harness, #10 Multi-Agent System, #11 Code Execution MCP | 设计跨会话任务 / 多 Agent 架构 / MCP 优化时 |
| `05-production-deployment.md` | L5 生产部署 | #12 Demystifying Evals, #13 Beyond Permission Prompts, #14 Best Practices, #15 Postmortem | 建评测体系 / 安全沙箱 / 学习失败案例时 |

---

## 核心数据速查 (不需要读切片)

| 指标 | 数据 | 来源 |
|------|------|------|
| Tool Search Tool Token 节省 | **85%** | #3 Advanced Tool Use |
| Programmatic Tool Calling Token 减少 | **37%** | #3 Advanced Tool Use |
| MCP Code Execution Token 减少 | **98.7%** (150K→2K) | #11 Code Execution MCP |
| Multi-Agent vs Chat Token 消耗 | **~15x** | #10 Multi-Agent System |
| Multi-Agent vs Single-Agent 性能提升 | **90.2%** | #10 Multi-Agent System |
| Think Tool 性能提升 (航空域) | **54%** 相对提升 | #5 Think Tool |
| Contextual Retrieval 检索失败率降低 | **67%** (结合 Reranking) | #8 Contextual Retrieval |
| Tool Use Examples 准确率提升 | **72%→90%** | #3 Advanced Tool Use |
| 性能方差 80% 由 Token 数量解释 | Token = 性能 | #10 Multi-Agent System |
| Eval 起步规模 | **20-50 个真实失败任务** | #12 Demystifying Evals |

---

## 与我们框架的对齐状态

| 金字塔层 | Anthropic 核心原则 | 框架当前状态 | 差距 |
|---------|-------------------|-------------|------|
| **L1** | Workflows > Agents; 简单优先; ACI = HCI | PM→CTO→QA 层级; Express/Standard 分流 | 已对齐 |
| **L1** | Agent = 工具循环 + 环境反馈 | build.md 状态机 + 6 阶段验证循环 | 已对齐 |
| **L2** | Tool Search Tool (按需发现) | SKILL.md 三级渐进加载 | 已对齐 (框架等效实现) |
| **L2** | Think Tool (行动前链式思考) | 无显式 Think 机制 | 可评估集成 |
| **L2** | 工具描述 = 合约; Eval 驱动优化 | rules/ 层 + review checklist | 工具描述优化流程可加强 |
| **L3** | Context = 稀缺资源; JIT > 预加载 | 规则 8/9 Context Rot + Progressive Disclosure | 已对齐 |
| **L3** | Compaction 保留结论丢弃过程 | /compact 建议; memory.md 清理 | 已对齐 |
| **L4** | Dual-Agent Harness (Initializer + Coder) | CTO (分解) + 工程师 (执行); TRACKER.md | 已对齐 |
| **L4** | Orchestrator-Worker (非 Mesh) | /team 蜂群模式 + File Claim Protocol | 已对齐 |
| **L4** | MCP Code Execution (98.7% Token 减少) | 无 MCP Code Execution 层 | L4 进阶可评估 |
| **L5** | 20-50 任务起步; pass@k/pass^k | qa-auditor.md §2.8 Eval 指标 | 已集成指标, 需扩展自动化 |
| **L5** | OS 级沙箱 (bubblewrap/seatbelt) | settings.json 权限 + hook-pretool.sh | 可评估 sandbox-runtime |
| **L5** | 3 个基础设施 Bug = Eval 未捕获 | ERROR-BOOK 已有; 但无持续生产监控 | 持续 Eval 体系可加强 |

---

## 15 个关键原则 (每篇 1 条核心)

| # | 文章 | 核心原则 |
|---|------|---------|
| 1 | Building Effective Agents | **简单优先**: 从最简方案开始, 复杂度只在可度量改善时增加 |
| 2 | Agent SDK | **给 Agent 一台电脑**: 循环 = 收集上下文 → 行动 → 验证 → 重复 |
| 3 | Advanced Tool Use | **按需加载**: Tool Search Tool 节省 85% Token |
| 4 | Writing Tools | **工具是给 Agent 用的, 不是给开发者用的**: 语义化 > 技术化 |
| 5 | Think Tool | **停下来想一想**: 复杂策略性决策前用 Think, pass^k 衡量一致性 |
| 6 | Agent Skills | **渐进披露**: 元数据几十 Token → 完整技能按需加载 |
| 7 | Context Engineering | **注意力是稀缺资源**: 最小高信号 Token 集 > 越多越好 |
| 8 | Contextual Retrieval | **让 RAG 更懂上下文**: 预置解释性上下文, 检索失败率降 67% |
| 9 | Long-Running Harness | **外部制品 = Agent 记忆**: progress.txt + git history 跨会话持久化 |
| 10 | Multi-Agent System | **15x Token 代价 → 90% 性能提升**: 仅对高价值可并行任务值得 |
| 11 | Code Execution MCP | **让数据在沙箱里流动**: 150K→2K Token, 98.7% 减少 |
| 12 | Demystifying Evals | **没有 Eval 就不要上线**: 20-50 个真实失败任务起步 |
| 13 | Beyond Permission Prompts | **OS 级沙箱**: 文件系统 + 网络隔离, 不靠权限提示 |
| 14 | Claude Code Best Practices | **CLAUDE.md = Agent 的大脑**: 明确指令 + 小迭代 + 反馈循环 |
| 15 | Postmortem | **Eval 没捕获 ≠ 没问题**: 持续生产监控 + 用户反馈闭环 |

---

*Version: 1.0.0 — Anthropic 15 篇核心博客精华*
*Created: 2026-02-19*
*Sources: Anthropic Engineering Blog (2024-12 ~ 2026-02)*
