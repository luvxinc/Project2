---
name: knowledge-work-plugins
description: Anthropic 官方知识工作插件 — 11 个专业领域插件, 适配 Claude Cowork + Claude Code。
source: https://github.com/anthropics/knowledge-work-plugins
license: Apache 2.0
---

# Knowledge Work Plugins

> **用途**: 专业领域 Agent 增强, 插件架构设计参考
> **安装**: `claude plugin marketplace add anthropics/knowledge-work-plugins`

## 1. 插件清单 (11 个)

| 插件 | 领域 | 核心能力 |
|------|------|----------|
| **productivity** | 效率管理 | 任务管理 (TASKS.md), 日程, 优先级 |
| **sales** | 销售 | 电话准备, 客户研究, CRM 集成, 竞品分析 |
| **customer-support** | 客服 | 工单处理, 知识库, 升级流程 |
| **product-management** | 产品 | PRD 撰写, Sprint 规划, 用户故事 |
| **marketing** | 市场 | 内容策略, 社媒管理, 分析报告 |
| **legal** | 法务 | 合同审查, NDA 审核, 合规工作流 |
| **finance** | 财务 | 对账, 预算分析, 报表生成 |
| **data** | 数据 | SQL 查询生成, 数据分析, 可视化 |
| **enterprise-search** | 企业搜索 | 跨系统信息检索, 知识图谱 |
| **bio-research** | 生物研究 | 文献综述, 实验设计, 数据解读 |
| **cowork-plugin-management** | 插件管理 | 创建/安装/管理其他插件 |

## 2. 插件架构

```
plugin-name/
├── .claude-plugin/plugin.json    # 插件清单 (名称, 版本, 描述)
├── .mcp.json                     # 外部工具连接 (CRM, JIRA, DB)
├── commands/                     # 斜杠命令 (显式触发)
│   └── call-prep.md              # 如: /sales:call-prep
└── skills/                       # 领域知识 (自动激活)
    └── account-research/
        └── SKILL.md
```

**核心理念**: 纯文件驱动 — Markdown + JSON, 无代码, 无构建步骤。

## 3. 对我们的价值

| 维度 | 学到什么 |
|------|---------|
| **插件结构** | `plugin.json` + `.mcp.json` + `commands/` + `skills/` 四层架构 |
| **领域分离** | 每个角色一个独立插件, 非混在一起 |
| **连接器设计** | `.mcp.json` 声明外部工具依赖, 即插即用 |
| **命令命名** | `/{plugin}:{action}` 格式, 避免命名冲突 |
| **技能自动化** | Skills 自动激活 (Claude 扫描 description 判断相关性) |
| **可定制性** | 鼓励用户修改 Skill 文件适配自己团队流程 |

## 4. 落地建议

我们已有的 `core/skills/` 17 个工程师 Skill 对应了技术领域。
Knowledge Work Plugins 可以为**非技术领域**提供模板:
- 若未来需要 销售/财务/法务 等 Agent → 直接参考这些插件
- 插件架构 (plugin.json + .mcp.json) 可作为 L3 warehouse 标准化参考
