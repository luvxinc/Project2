---
name: claude-mem
description: Claude Code 持久记忆插件 v10 — SQLite + Chroma 混合搜索 + 5 MCP Tools + 3 层渐进检索 + 6 Hook
source: https://github.com/thedotmack/claude-mem
docs: https://docs.claude-mem.ai
version: v10.0.7
stars: 28k+
generated_by: Skill Seekers v3.0.0
generated_from: llms-full.md (14,878 lines)
generated_date: 2026-02-15
---

# Claude-Mem — 全量参考

> **定位**: Agent 持久记忆系统的工业级参考实现 (v10, 189 releases, 1,346 commits).
> **我们如何用**: 借鉴其 3 层渐进检索、上下文工程理念、Hook 架构和 MCP 工具设计来强化我们的 `memory.md` SOP。

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------| 
| `01-architecture.md` | 核心架构: v1→v5 演进 + Hook 生命周期 + 数据流 + DB Schema | ~9KB | 需理解记忆系统架构时 |
| `02-mcp-search.md` | 3 层渐进检索 MCP 工具: search/timeline/get_observations + 使用模式 | ~6KB | 需实现搜索/检索功能时 |
| `03-context-engineering.md` | 上下文工程: 注意力预算/渐进披露/长任务策略/Anti-patterns | ~6KB | 需优化 Agent 上下文效率时 |

## 快速参考

### 核心理念

```
上下文 ≠ 越多越好
上下文 = 有限注意力预算, 信噪比决定一切

传统 RAG: 预取全部 → 35,000 token → 6% 相关
渐进披露: 索引先行 → 920 token → 100% 相关
```

### 3 层搜索 (可直接借鉴到 KI / memory.md)

```
Layer 1: search    → 索引, ~50 token/条 → "有什么?"
Layer 2: timeline  → 上下文, ~100 token/条 → "当时在做什么?"
Layer 3: get_obs   → 详情, ~500 token/条 → "告诉我全部"

每层都有决策点: 停止 / 继续 / 深入
→ 结构上让浪费变得困难
```

### 6 Hook 生命周期 (v10)

```
SessionStart       → 注入渐进索引 (非全量)
UserPromptSubmit   → 记录意图 + 建 Session
PostToolUse        → 队列入库 (不阻塞)
Stop               → AI 压缩摘要
SessionEnd         → 标记完成, 优雅收尾
SmartInstall       → 缓存依赖检查 (pre-hook)
```

### 与我们系统的映射

| claude-mem 概念 | 我们的对应 | 差异 |
|----------------|-----------|------|
| SessionStart 索引 | SKILL.md L0→L1→L2 三层路由 | 我们按角色分域, 它按时间线 |
| 3 层 MCP 搜索 | KI summary → artifact → 源码 | 同理: 索引→切片→详情 |
| TRACKER 追踪 | TRACKER-{task-id}.md | 类似, 我们按任务, 它按会话 |
| ERROR-BOOK | observation type=bugfix | 我们关键词触发, 它语义搜索 |
| 渐进披露 | memory.md §5 上下文约束 | 理念完全一致 |
| Private Tags | ACCEPTED.md | 不同: 它控制存储, 我们控制修改 |
