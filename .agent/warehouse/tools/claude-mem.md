---
name: claude-mem
description: Claude 持久记忆插件 — 跨会话上下文保留, 语义搜索, Token 节省 95%。
source: https://github.com/thedotmack/claude-mem
version: latest (186+ releases)
---

# Claude-Mem (持久记忆)

> **用途**: 跨会话记忆管理, 上下文持续性, Token 优化
> **安装**: `/plugin marketplace add thedotmack/claude-mem`

## 1. 核心能力

| 功能 | 描述 |
|------|------|
| 🧠 持久记忆 | 自动捕获会话工具操作 → 压缩 → 注入未来会话 |
| 📊 渐进披露 | 分层召回: 索引 (~50 token) → 时间线 → 详情 (~500 token) |
| 🔍 语义搜索 | 5 个 MCP 工具, 支持自然语言查询历史 |
| 🖥️ Web Viewer | `http://localhost:37777` 实时记忆流可视化 |
| 🔒 隐私控制 | `<private>` 标签排除敏感内容 |
| 🧪 Endless Mode | 仿生记忆架构, 延长会话 (Beta) |

## 2. 架构

```
5 Lifecycle Hooks:
  SessionStart    → 注入相关上下文
  UserPromptSubmit → 记录用户意图
  PostToolUse     → 观察工具操作结果
  Stop            → 生成会话摘要
  SessionEnd      → 持久化到 SQLite

存储: SQLite (本地) + Chroma 向量库 (语义搜索)
运行时: Bun Worker Service (端口 37777)
```

## 3. MCP 工具 (3 层搜索)

```
第 1 层: search      → 索引 (~50-100 tokens/结果)
第 2 层: timeline    → 时间上下文
第 3 层: get_observations → 完整详情 (按需加载)
附加:   save_memory  → 手动存储重要信息
```

**关键设计**: 先过滤再加载, 比全量注入节省 ~10x Token。

## 4. 与我们系统的关系

| 维度 | 我们 (Antigravity) | Claude-Mem |
|------|-------------------|------------|
| 记忆存储 | Knowledge Items (KI) | SQLite + Chroma |
| 会话恢复 | KI Summaries + 对话日志 | 自动注入上下文 |
| 搜索方式 | 手动读 KI artifacts | MCP 语义搜索 |
| Token 管理 | 手动加载纪律 (≤2 Skill/次) | 自动渐进披露 |

**结论**: Antigravity 的 KI 系统已覆盖 claude-mem 核心功能。
claude-mem 的**渐进披露搜索模式 (3 层)** 值得参考用于优化我们的检索策略。
