# Claude-Mem v10 架构深度参考

> **加载时机**: 需要理解持久记忆架构、Hook 机制、或数据库设计时

## 1. 架构演进 (v1 → v10)

### v1-v2: 原始记录

```
PostToolUse → 存储原始工具输出 → 下次全量加载
结果: 35,000 token, 仅 1.4% 相关 → 失败
教训: 证明了跨会话记忆的价值, 但全量加载不可行
```

### v3: AI 压缩 + 后台 Worker

```
PostToolUse → 队列 → SDK Worker → AI 压缩 → 结构化存储
✅ 压缩比 10:1~100:1, 语义理解, 后台不阻塞
❌ 仍然全量加载, Session ID 混乱, 激进清理导致摘要中断
```

### v4: 决定性架构 (当前基础)

```
┌────────────────────────────────────────────────┐
│           CLAUDE CODE SESSION                   │
│  User → Claude → Tools → PostToolUse Hook       │
│                           (队列化, 不处理)       │
└──────────────────────┬─────────────────────────┘
                       ↓ SQLite 队列
┌──────────────────────┴─────────────────────────┐
│           SDK WORKER (单个流式会话)              │
│  AsyncIterable<UserMessage>                     │
│    → 从队列取 observation                        │
│    → AI 压缩 → XML 解析                         │
│    → 写入 SQLite + Chroma                       │
└──────────────────────┬─────────────────────────┘
                       ↓ 持久化
┌──────────────────────┴─────────────────────────┐
│           下一次 SESSION                         │
│  SessionStart → 查询 DB → 返回渐进索引           │
│  Agent → MCP search/timeline/get_observations   │
└────────────────────────────────────────────────┘
```

**四个关键认知:**
1. **渐进披露** — 索引先行, 按需深入 (87% token 节约)
2. **Session ID** — SDK session ID 每轮变化, 需从 init 消息捕获
3. **优雅清理** — 标记完成而非强制终止 (摘要不丢失)
4. **单会话流** — 一个 Claude Code session = 一个长流式 SDK session

### v5: 混合搜索 + Web UI

```
SQLite FTS5 (关键词) + Chroma (语义向量) → 混合排序
Web Viewer UI (localhost:37777) → SSE 实时流 + React SPA
MCP 架构简化: 9个工具 → 4个 (88% 代码减少)
```

### v6-v8: MCP 工具进化

```
MCP 工具稳定为 5 个:
  1. search     — 搜索记忆索引 (full-text + filter)
  2. timeline   — 时间线上下文 (按观察或查询)
  3. get_observations — 批量获取详情 (按 ID)
  4. save_memory — 手动存储记忆 (语义搜索可用)
  5. __IMPORTANT — 工作流文档 (Claude 始终可见)

Token 优化: 索引先行“过滤”再批量取, ~10x token 节约
```

### v9-v10: 生产级稳定 + Beta 通道

```
✅ SmartInstall pre-hook: 缓存依赖检查, 避免每次启动重装
✅ OpenClaw Gateway: 第三方 API 集成层
✅ Endless Mode (Beta): 仿生记忆架构, 延长会话提高脐化抵抗
✅ 48 贡献者, 189 releases, 1,346 commits
✅ Web Viewer UI: localhost:37777 → Settings 切换 Beta/Stable
```

## 2. Hook 生命周期 (6 阶段, v10)

### 架构概览

```
claude-code 启动
  ↓ [SmartInstall] — 缓存依赖检查 (pre-hook, 非生命周期)
    ↓ [SessionStart] — 注入上下文
      ↓ 用户输入
        ↓ [UserPromptSubmit] — 记录意图
          ↓ Claude 使用工具
            ↓ [PostToolUse] — 捕获观察 (每次工具调用后)
              ↓ ... (多轮)
                ↓ Claude 停止
                  ↓ [Stop] — 生成摘要
                    ↓ 会话结束
                      ↓ [SessionEnd] — 优雅关闭
```

### Stage 1: SessionStart

```
触发: Claude Code 启动
职责: 
  1. 查询最近 10 个会话摘要
  2. 格式化为渐进索引 (标题 + token 成本)
  3. 注入到 stdout (Claude 上下文)
  4. 包含 MCP 搜索工具说明

输出格式:
  ### Oct 26, 2025
  | ID | Time | Type | Title | Tokens |
  |#2591 | 1:15 AM | ⚖️ | Stderr messaging abandoned | ~155 |

关键: 只展示索引 (~1,000 token), 不加载详情
```

### Stage 2: UserPromptSubmit

```
触发: 用户提交 prompt (Claude 处理前)
职责:
  1. 创建/更新 session 记录
  2. 保存原始用户 prompt (stripped of <private> tags)
  3. 启动 Worker (如未运行)
  
安全: <private> 标签在此阶段剥离, 不进数据库
```

### Stage 3: PostToolUse

```
触发: 每次工具调用完成后
职责:
  1. 将 tool_name + input + response 入队列
  2. 立即返回 (不阻塞主会话)
  3. Worker 异步处理

关键变化 (v3→v4):
  v3: Hook 内直接处理 (阻塞)
  v4: 只入队, Worker 处理 (非阻塞)
```

### Stage 4: Stop

```
触发: Claude 生成完成
职责:
  1. 收集当前 session 的 observations
  2. 发送给 AI 生成结构化摘要
  3. 摘要包含: request/investigated/learned/completed/next_steps/notes
  4. 存入 session_summaries 表
  
关键: 摘要是检查点, 不是结束标记
      每个 session 可有多个摘要
```

### Stage 5: SessionEnd

```
触发: 会话结束
职责:
  1. 标记 session completed_at
  2. 让 Worker 自然完成处理
  3. 不强制终止 (避免丢失数据)

v3 教训: 激进清理导致摘要截断
v4 方案: 标记完成, Worker 自行退出
```

## 3. 数据库架构

### SQLite + WAL 模式

```
路径: ~/.claude-mem/claude-mem.db
模式: WAL (Write-Ahead Logging, 支持并发读写)
实现: bun:sqlite (原生模块)
```

### 核心表 (4 张)

```sql
-- 1. 会话追踪
sdk_sessions (
  id, sdk_session_id UNIQUE, claude_session_id,
  project, prompt_counter, status DEFAULT 'active',
  created_at, created_at_epoch,
  completed_at, completed_at_epoch,
  last_activity_at, last_activity_epoch
)

-- 2. 工具观察 (核心数据)
observations (
  id, session_id, sdk_session_id, claude_session_id,
  project, prompt_number, tool_name, correlation_id,
  -- 层次化字段
  title, subtitle, narrative, text,
  facts, concepts, type,
  files_read, files_modified,
  created_at, created_at_epoch
)
  -- type: decision|bugfix|feature|refactor|discovery|change

-- 3. AI 摘要 (每 session 可多个)
session_summaries (
  id, sdk_session_id, claude_session_id,
  project, prompt_number,
  request, investigated, learned,
  completed, next_steps, notes,
  created_at, created_at_epoch
)

-- 4. 用户 Prompt (v4.2.0+)
user_prompts (
  id, sdk_session_id, claude_session_id,
  project, prompt_number,
  prompt_text,
  created_at, created_at_epoch
)
```

### FTS5 全文搜索 (3 张虚拟表)

```sql
-- 观察全文索引
CREATE VIRTUAL TABLE observations_fts USING fts5(
  title, subtitle, narrative, text, facts, concepts,
  content='observations', content_rowid='id'
);

-- 摘要全文索引
CREATE VIRTUAL TABLE session_summaries_fts USING fts5(
  request, investigated, learned, completed, next_steps, notes,
  content='session_summaries', content_rowid='id'
);

-- Prompt 全文索引
CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
  prompt_text,
  content='user_prompts', content_rowid='id'
);

-- 自动同步: INSERT/UPDATE/DELETE 触发器保持 FTS 一致
```

### FTS5 查询语法

```
简单:     "error handling"
AND:      "error" AND "handling"
OR:       "bug" OR "fix"
NOT:      "bug" NOT "feature"
精确短语:  '"exact phrase"'
列搜索:   title:"authentication"
组合:     '"user auth" AND (JWT OR session) NOT deprecated'
```

### 混合搜索架构 (v5.0.0+)

```
用户查询
  ↓
SQLite FTS5 (关键词精确匹配)
  +
Chroma Vector DB (语义相似度)
  ↓
合并 + 重排序
  ↓
返回结果

降级: Chroma 不可用时, 退回 FTS5-only
```

## 4. Worker 服务

```
技术栈: Bun + Express
端口: 37777
进程管理: Bun (替代 PM2)

10 个 API 端点:
  GET  /             # Web Viewer HTML
  GET  /health       # 健康检查
  GET  /stream       # SSE 实时流
  GET  /api/search   # 搜索 API
  GET  /api/prompts  # 分页 prompt
  GET  /api/observations # 分页观察
  GET  /api/summaries    # 分页摘要
  GET  /api/stats        # 统计信息
  GET  /api/settings     # 设置
  POST /api/settings     # 保存设置
```

## 5. Privacy Tags (安全特性)

```
<private>
API_KEY=sk-proj-abc123
</private>

→ Claude 当前会话可见
→ 不写入数据库/搜索索引
→ Hook 层边缘过滤 (UserPromptSubmit + PostToolUse)
→ 不影响 session 摘要
```

## 6. 对我们系统的设计启发

| claude-mem 做法 | 我们可以借鉴 | 当前差距 |
|----------------|------------|---------|
| observation.type 分类 | ERROR-BOOK.md 条目分类 | 我们缺标准化分类 |
| FTS5 关键词索引 | 错题本关键词索引扩展为全文 | 目前仅手工关键词 |
| 多层索引 (~50/100/500 token) | KI summary→artifact 已是 2 层 | 可加 L0 极轻索引 |
| Hook 自动捕获 | 工作流状态机自动记录 | 依赖手工更新 TRACKER |
| 时间线视图 | TRACKER 进度日志 | 相似, 可加时间戳索引 |
| Session 优雅清理 | 验收后协议 (删 TRACKER, 留审计) | ✅ 已实现 |
