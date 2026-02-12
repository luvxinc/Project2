# Knowledge Work Plugins 详细参考: 插件架构 + 示例

> **加载时机**: 需要创建领域插件 或 参考 Anthropic 插件架构时

## 1. 插件架构详解

### 目录结构
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json        # 插件清单
├── .mcp.json              # MCP 工具连接配置
├── commands/              # 斜杠命令 (显式触发)
│   └── command-name.md
└── skills/                # 领域知识 (自动激活)
    └── skill-name/
        └── SKILL.md
```

### plugin.json 示例
```json
{
  "name": "sales",
  "version": "1.0.0",
  "description": "Sales specialist plugin for Claude",
  "skills": [
    { "path": "skills/account-research" },
    { "path": "skills/call-prep" },
    { "path": "skills/deal-analysis" }
  ],
  "commands": [
    { "path": "commands/call-prep.md" },
    { "path": "commands/pipeline-review.md" }
  ]
}
```

### .mcp.json 示例 (连接器)
```json
{
  "mcpServers": {
    "crm": {
      "command": "mcp-server-salesforce",
      "args": ["--org", "production"],
      "env": { "SF_TOKEN": "${env:SALESFORCE_TOKEN}" }
    },
    "email": {
      "command": "mcp-server-gmail",
      "args": [],
      "env": { "GMAIL_TOKEN": "${env:GMAIL_TOKEN}" }
    }
  }
}
```

### 命令 vs 技能
| 组件 | 触发方式 | 用途 |
|------|---------|------|
| **Skills** | 自动 (Claude 扫描 description) | 持续性领域知识 |
| **Commands** | 显式 (`/plugin:command`) | 具体操作流程 |

## 2. Productivity 插件详解 (最佳落地参考)

### 任务管理 Skill
```
文件: productivity/skills/task-management/SKILL.md

功能:
- 维护 TASKS.md 文件 (共享, 可编辑)
- 格式: - [ ] **Task** - context, for whom, due date
- 四个 Section: Active / Waiting On / Someday / Done
- 自动提取会议中的承诺项

交互:
  "我的任务" → 读 TASKS.md, 摘要 Active + Waiting On
  "加个任务" → 添加到 Active
  "做完了 X" → 移到 Done, 加完成日期
  "等什么"   → 读 Waiting On, 标注等待时长
```

### Dashboard (HTML 可视化)
```
- 读写同一个 TASKS.md
- 自动保存
- 监听外部变更 (CLI 编辑后自动同步)
- 拖拽重排序
```

## 3. Sales 插件: Call Prep Skill

### 工作流
```
┌──────────────────────────────┐
│          CALL PREP           │
├──────────────────────────────┤
│ 必需:                        │
│  ✓ 公司/联系人名             │
│  ✓ 会议类型                  │
│  ✓ Web 搜索: 最新新闻/融资   │
│  ✓ 输出: 准备简报+议程+问题  │
├──────────────────────────────┤
│ 增强 (连接工具后):           │
│  + CRM: 账户历史            │
│  + Email: 最近往来           │
│  + Chat: 内部讨论            │
│  + Transcripts: 之前通话     │
│  + Calendar: 自动找会议      │
└──────────────────────────────┘
```

### 会议类型变体
| 类型 | 重点 |
|------|------|
| Discovery | 痛点/预算/决策流程 |
| Demo | 匹配功能到需求 |
| Negotiation | 竞品价格/底线 |
| QBR | 使用数据/续约信号 |

## 4. 11 个插件速查

| 插件 | 命令示例 | 核心 Skill |
|------|---------|-----------|
| productivity | `/productivity:start` | 任务管理, Dashboard |
| sales | `/sales:call-prep` | 客户研究, 电话准备, 竞品分析 |
| customer-support | `/cs:triage` | 工单分类, 知识库检索 |
| product-management | `/pm:write-spec` | PRD 撰写, Sprint 规划 |
| marketing | `/marketing:brief` | 内容策略, 社媒日历 |
| legal | `/legal:nda-review` | 合同审查, NDA 审核, 合规 |
| finance | `/finance:reconciliation` | 对账, 预算, 报表 |
| data | `/data:write-query` | SQL 生成, 数据分析 |
| enterprise-search | `/search:find` | 跨系统检索, 知识图谱 |
| bio-research | `/bio:literature-review` | 文献综述, 实验设计 |
| cowork-plugin-management | `/plugins:create` | 创建/安装/管理插件 |
