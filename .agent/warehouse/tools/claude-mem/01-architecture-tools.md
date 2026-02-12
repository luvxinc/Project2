# Claude-Mem 详细参考: 架构 + MCP 工具用法

> **加载时机**: 需要理解 claude-mem 记忆架构 或 MCP 搜索工具时

## 1. 架构详解

### 5 Lifecycle Hooks
```
SessionStart       → 查询相关上下文 → 注入到会话开头
                     (自动, ~2,250 tokens)

UserPromptSubmit   → 记录用户意图
                     (后台, 不影响响应)

PostToolUse        → 观察工具操作结果
                     (每次工具调用后, 自动捕获)

Stop               → 生成会话摘要
                     (AI 压缩, 保留关键决策)

SessionEnd         → 持久化到 SQLite + Chroma
                     (同步写入, 确保不丢失)
```

### 存储层
```
SQLite  → 结构化数据 (会话/观察/摘要)
           路径: ~/.claude-mem/memory.db
           表: sessions, observations, summaries

Chroma  → 向量搜索 (语义相似度)
           路径: ~/.claude-mem/chroma/
           混合: 语义 + 关键词搜索

Worker  → Bun HTTP API (端口 37777)
           - Web Viewer UI
           - 10 搜索端点
           - 实时记忆流
```

### 数据流
```
[工具调用] → PostToolUse Hook → 观察记录 → SQLite
                                         → Chroma (向量化)

[新会话]   → SessionStart Hook → 查询 Chroma (语义)
                                → 查询 SQLite (时间线)
                                → 注入 Top-N 相关记忆
```

## 2. MCP 工具详解 (5 个)

### 3 层搜索模式 (核心设计)
```
第 1 层: search (索引)
  输入: query="authentication bug", type="bugfix", limit=10
  输出: [{id: 123, title: "...", date: "...", score: 0.9}, ...]
  Token: ~50-100/结果 (紧凑)

第 2 层: timeline (上下文)
  输入: observation_id=123, window=5
  输出: 该观察前后 5 条记录的时间线
  Token: ~100-200/结果

第 3 层: get_observations (详情)
  输入: ids=[123, 456]
  输出: 完整观察内容 (代码片段/决策/结果)
  Token: ~500-1000/结果
```

### 使用示例
```javascript
// Step 1: 搜索索引
search(query="authentication bug", type="bugfix", limit=10)
// → [{id: 123, title: "Fixed JWT validation", score: 0.95},
//    {id: 456, title: "Auth header missing", score: 0.87}]

// Step 2: 查看时间线
timeline(observation_id=123, window=3)
// → [120: "Started auth refactor", 121: "Found token expiry bug",
//    122: "Attempted fix", 123: "Fixed JWT validation", 124: "Added test"]

// Step 3: 获取详情 (只取相关的)
get_observations(ids=[123, 456])
// → 完整内容, 含代码差异/决策理由/修复方案

// 手动保存重要信息
save_memory(text="API requires auth header X-API-Key", title="API Auth")
```

### 工具参数参考

| 工具 | 必需参数 | 可选参数 |
|------|---------|---------|
| search | query | type, date_from, date_to, project, limit |
| timeline | observation_id OR query | window (默认 5) |
| get_observations | ids (数组) | — |
| save_memory | text | title, type, project |

## 3. Endless Mode (Beta)

### 仿生记忆架构
```
感知层  → 捕获所有工具调用 (raw)
编码层  → AI 压缩为语义摘要 (summary)
整合层  → 跨会话关联 (links)
召回层  → 按需渐进加载 (progressive disclosure)
```

**效果**: 减少上下文耗尽, 延长会话 2-3x

### 启用方式
Web Viewer → http://localhost:37777 → Settings → Switch to Beta

## 4. 与我们系统的详细对比

| 能力 | Antigravity KI | Claude-Mem | 评估 |
|------|---------------|------------|------|
| 跨会话持久 | ✅ KI + 对话日志 | ✅ SQLite + Chroma | 等效 |
| 语义搜索 | ❌ 手动查 | ✅ 向量搜索 | Mem 更强 |
| 自动捕获 | ❌ 需 Agent 生成 | ✅ Hook 自动 | Mem 更强 |
| Token 效率 | ⚠️ 需手动纪律 | ✅ 3 层渐进 | Mem 更强 |
| 内容质量 | ✅ 经 Agent 精炼 | ⚠️ 原始捕获 | KI 更强 |
| 组织结构 | ✅ 主题+artifact | ⚠️ 扁平时间线 | KI 更强 |
| 可控性 | ✅ 完全可控 | ⚠️ 自动化, 较难控制 | KI 更强 |

**结论**: 两者互补。KI 适合精炼知识, claude-mem 适合原始活动记录。
**可借鉴**: 3 层搜索模式 (索引→时间线→详情) 可用于优化 KI 检索。
