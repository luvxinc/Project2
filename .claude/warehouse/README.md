# L3: 工具库 (Warehouse)

> **跨项目通用工具。与任何特定客户项目无关。**
> **每个工具采用 INDEX.md + 切片文件结构, 按需加载。**

---

## 工具清单 (7 Tools, 20 Files)

| 工具 | 类别 | INDEX | 切片 | 何时加载 |
|------|------|-------|------|---------|
| **[ECC v1.5.0](tools/everything-claude-code/)** | Agent 架构 | INDEX.md | 2 片 | 14 Agent/28 Skills/AgentShield/审查清单 |
| **[UI UX Pro](tools/ui-ux-pro-max/)** | 设计智能 | INDEX.md | 3 片 | Design System 生成/风格配色/UX 审查 |
| **[Anthropic Skills](tools/anthropic-skills/)** | 官方参考 | INDEX.md | 1 片 | 创建新 Skill |
| **[Knowledge Plugins](tools/knowledge-work-plugins/)** | 领域增强 | INDEX.md | 1 片 | 创建插件 |
| **[Claude-Mem v10](tools/claude-mem/)** | 记忆管理 | INDEX.md | 3 片 | v1→v10 架构/5 MCP 搜索/上下文工程 |
| **[Skill Seekers v3](tools/skill-seekers/)** | 自动化 | INDEX.md | 1 片 | 文档→Skill+RAG+AI Coding |
| **[Anime.js](tools/animejs/)** | 前端动画 | INDEX.md | 2 片 | 动画开发 (animate/timeline/stagger/scope) |

## 目录结构

```
warehouse/
├── README.md                          ← 你在这里
└── tools/
    ├── everything-claude-code/
    │   ├── INDEX.md                   # 快速参考 + 切片目录
    │   ├── 01-agents-review.md        # 14 Agent + AgentShield + CL v2 (~6KB)
    │   └── 02-rules-hooks.md          # 6语言 Rules + 28 Skills + 30 Commands (~5KB)
    │
    ├── ui-ux-pro-max/
    │   ├── INDEX.md                   # v2.0 快速参考 + 切片目录
    │   ├── 01-design-system.md        # Design System Generator + 推理引擎 (~8KB)
    │   ├── 02-styles-palettes-typography.md  # 67 风格 + 96 配色 + 57 字体 (~5KB)
    │   └── 03-ux-rules-checklist.md   # 99 UX 准则 + 反模式 + 交付清单 (~5KB)
    │
    ├── anthropic-skills/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-spec-template.md        # 完整规范 + 模板 (~5KB)
    │
    ├── knowledge-work-plugins/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-architecture-examples.md # 架构 + 11 插件 (~6KB)
    │
    ├── claude-mem/                     # 🔴 全量重建 (Skill Seekers, 14K行源)
    │   ├── INDEX.md                   # 快速参考 + 系统映射
    │   ├── 01-architecture.md         # v1→v10 演进 + 6 Hook + DB 全景 (~10KB)
    │   ├── 02-mcp-search.md           # 5 MCP Tools + 3层渐进搜索 + 模式 (~6KB)
    │   └── 03-context-engineering.md  # 上下文工程 + 渐进披露 (~6KB)
    │
    ├── skill-seekers/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-commands-modules.md     # 命令 + RAG集成 + AI Coding + C3 (~6KB)
    │
    └── animejs/
        ├── INDEX.md                   # 快速参考 + 安装/导入/缓动
        ├── 01-core-api.md             # animate/目标/属性/值/缓动 (~8KB)
        └── 02-advanced-patterns.md    # Timeline/Scope(React)/Stagger/SVG/Draggable (~7KB)
```

## 加载规则

| 规则 | 说明 |
|------|------|
| **先读 INDEX.md** | 每个工具从 INDEX.md 入手, 决定是否需要切片 |
| **按需读切片** | 只读与当前任务相关的切片文件 |
| **不全量加载** | 严禁一次读完工具的所有切片 |
| **单次上限** | 最多同时加载 2 个切片 (~12KB) |

---

*L3 Warehouse — 通用工具库 (7 tools, 20 files)*
*Updated: 2026-02-15 (审计校准 — ECC v1.5.0/Skill Seekers v3.0.0/Claude-Mem v10.0.7 同步)*
