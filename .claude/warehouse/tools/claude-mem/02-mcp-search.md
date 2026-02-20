# Claude-Mem MCP 搜索工具参考

> **加载时机**: 需要实现搜索/检索功能, 或优化我们的 memory.md 搜索逻辑时

## 1. 3 层工作流 (核心设计)

### 设计哲学

```
传统 RAG:            渐进披露:
系统 → [猜相关性] → Agent    系统 → [展示索引] → Agent → [自主判断] → [按需获取]
       "希望有用!"                                        "你最了解!"

传统: 系统替 Agent 决定; Agent 被动接受
渐进: Agent 自主决策; 按需控制成本
```

### Layer 1: search (索引级)

```
目的: "有什么?" — 轻量扫描, 获取 ID 列表
成本: ~50-100 token/条
返回: 紧凑表格 (ID, 标题, 日期, 类型, 分数)

search(query="authentication bug", type="bugfix", limit=10)
→ [{id: 123, title: "Fixed JWT validation", score: 0.95},
   {id: 456, title: "Auth header missing", score: 0.87}]

参数:
  query      全文搜索 (支持 AND/OR/NOT/精确短语/列搜索)
  limit      最大结果数 (默认 20)
  offset     分页偏移
  type       过滤: bugfix|feature|decision|discovery|refactor|change
  obs_type   过滤: observation|session|prompt
  project    按项目过滤
  dateStart  开始日期 (YYYY-MM-DD)
  dateEnd    结束日期 (YYYY-MM-DD)
  orderBy    排序: date_desc|date_asc|relevance
```

### Layer 2: timeline (上下文级)

```
目的: "当时在做什么?" — 理解前因后果
成本: ~100-200 token/条
返回: 时间线视图 (锚点前后 N 条记录)

timeline(anchor=123, depth_before=3, depth_after=3)
→ [120: "Started auth refactor",
   121: "Found token expiry bug",
   122: "Attempted fix",
   123: "Fixed JWT validation",    ← 锚点
   124: "Added test",
   125: "Deployed fix"]

参数:
  anchor        锚点 observation ID (二选一)
  query         搜索查询自动定位锚点 (二选一)
  depth_before  锚点前 N 条 (默认 3)
  depth_after   锚点后 N 条 (默认 3)
  project       按项目过滤
```

### Layer 3: get_observations (详情级)

```
目的: "告诉我全部" — 仅获取已验证相关的条目
成本: ~500-1,000 token/条
返回: 完整内容 (narrative/facts/files/concepts)

get_observations(ids=[123, 456, 789])
→ 完整 observation 详情

参数:
  ids        ID 数组 (必需, 批量!)
  orderBy    排序: date_desc|date_asc
  limit      最大数量
  project    按项目过滤

⚠️ 永远批量请求, 不要逐条获取
```

### save_memory (手动存储)

```
目的: 手动存储重要信息
save_memory(text="API requires auth header X-API-Key", title="API Auth")

参数:
  text   内容 (必需)
  title  标题
  type   类型
  project 项目
```

### __IMPORTANT (工作流文档)

```
目的: 永远可见的工作流提醒
内容: "3-LAYER WORKFLOW (ALWAYS FOLLOW):
  1. search(query) → Get index with IDs
  2. timeline(anchor=ID) → Get context
  3. get_observations([IDs]) → Fetch details
  NEVER fetch full details without filtering first."

不需要调用, 自动展示
```

## 2. Token 效率对比

### 传统方式 vs 3 层方式

```
场景: 查找认证相关 bug fix

❌ 传统:
  get_observations(ids=[1..20])
  = 20 × 500 = 10,000-20,000 tokens
  相关率: ~10% (90% 浪费)

✅ 3 层:
  search("auth", type="bugfix", limit=20)  = ~1,000 tokens
  → 审查索引, 发现 #123, #456, #789 相关
  get_observations(ids=[123, 456, 789])     = ~1,500-3,000 tokens
  总计: 2,500-4,000 tokens (100% 相关)
  
  节约: 50-80%
```

### Token 成本表

| 操作 | Token/条 | 适用层 |
|------|---------|-------|
| search (索引) | 50-100 | L1 |
| timeline (上下文) | 100-200 | L2 |
| get_observations (详情) | 500-1,000 | L3 |

## 3. 常见使用模式

### 调试问题

```
search(query="error database connection", type="bugfix", limit=10)
→ 审查索引 → 发现 #245, #312, #489

timeline(anchor=312, depth_before=3, depth_after=3)
→ 了解修复前后的上下文

get_observations(ids=[312, 489])
→ 获取修复的完整详情
```

### 理解决策

```
search(query="authentication", type="decision", limit=5)
→ 找到决策类 observation

get_observations(ids=[<relevant>])
→ 获取决策理由、权衡、影响
```

### 代码考古

```
search(query="worker-service.ts", limit=20)
→ 所有涉及该文件的 observation

timeline(query="worker-service.ts refactor", depth_before=2, depth_after=2)
→ 重构的前因后果
```

### 上下文恢复 (离开项目后返回)

```
search(query="project-name", limit=10, orderBy="date_desc")
→ 最近工作概览

timeline(anchor=<most_recent>, depth_before=10)
→ 理解当前状态的来龙去脉

get_observations(ids=[<critical>])
→ 刷新关键决策
```

## 4. 搜索查询语法

### FTS5 查询

```
# 布尔运算
"authentication AND JWT"
"OAuth OR JWT"
"security NOT deprecated"

# 精确短语
'"database migration"'

# 列搜索
"title:authentication"
"content:database"
"concepts:security"

# 组合
'"user auth" AND (JWT OR session) NOT deprecated'
```

### 分页

```
search(query="refactor", limit=10, offset=0)   # 第 1 页
search(query="refactor", limit=10, offset=10)   # 第 2 页
search(query="refactor", limit=10, offset=20)   # 第 3 页
```

## 5. 最佳实践

1. **永远先索引, 后详情** — search → timeline → get_observations
2. **过滤后再获取** — 用 type/date/project 缩小范围
3. **批量获取 ID** — 一次 get_observations 传多个 ID
4. **Timeline 用于叙事** — 需要前因后果时才用
5. **查询要具体** — 越具体, 相关性越高
6. **小 limit 开始** — 从 3-5 条开始, 需要再扩大
7. **审查后再深入** — 看索引, 确认相关, 再拿详情

## 6. 对我们 memory.md 的具体改进建议

### 当前 memory.md §3 错题本 → 升级为结构化搜索

```
现状: 手工关键词匹配 (精确但死板)
借鉴: FTS5 全文搜索 + 类型分类

建议:
  ERR-xxx 条目加 type 字段: bugfix|pattern|config|env
  关键词索引加 FTS 风格: "Prisma AND 热加载"
  交叉检查加 timeline 概念: 查前因后果
```

### 当前 memory.md §5 上下文约束 → 借鉴渐进披露

```
现状: 按阶段规则加载/释放
借鉴: 索引→切片→详情 三层, Agent 自主决策

建议:
  Spec/Plan 加 token 成本标注
  SOP 按 section 标注预估 token
  Agent 先看索引, 再加载需要的 section
  → 与我们的 L0→L1→L2 三级检索完全吻合
```
