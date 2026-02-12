# L3: 工具库 (Warehouse)

> **跨项目通用工具。与任何特定客户项目无关。**
> **每个工具采用 INDEX.md + 切片文件结构, 按需加载。**

---

## 工具清单 (7 Tools, 14 Files)

| 工具 | 类别 | INDEX | 切片 | 何时加载 |
|------|------|-------|------|---------|
| **[ECC](tools/everything-claude-code/)** | Agent 架构 | INDEX.md | 2 片 | 系统设计/审查清单 |
| **[UI UX Pro](tools/ui-ux-pro-max/)** | 设计智能 | INDEX.md | 2 片 | 选风格/配色/UX 审查 |
| **[Anthropic Skills](tools/anthropic-skills/)** | 官方参考 | INDEX.md | 1 片 | 创建新 Skill |
| **[Knowledge Plugins](tools/knowledge-work-plugins/)** | 领域增强 | INDEX.md | 1 片 | 创建插件 |
| **[Claude-Mem](tools/claude-mem/)** | 记忆管理 | INDEX.md | 1 片 | 理解记忆架构 |
| **[Skill Seekers](tools/skill-seekers/)** | 自动化 | INDEX.md | 1 片 | 文档→Skill |
| **[Anime.js](tools/animejs.md)** | 前端动画 | (单文件) | — | 动画开发 |

## 目录结构

```
warehouse/
├── README.md                          ← 你在这里
└── tools/
    ├── everything-claude-code/
    │   ├── INDEX.md                   # 快速参考 + 切片目录
    │   ├── 01-agents-review.md        # 12 Agent + 审查清单 (~8KB)
    │   └── 02-rules-hooks.md          # Rules + Hooks + 验证循环 (~5KB)
    │
    ├── ui-ux-pro-max/
    │   ├── INDEX.md                   # 快速参考 + 切片目录
    │   ├── 01-styles-palettes.md      # 风格/配色/字体 (~6KB)
    │   └── 02-ux-rules.md             # UX 准则 + 反模式 (~7KB)
    │
    ├── anthropic-skills/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-spec-template.md        # 完整规范 + 模板 (~5KB)
    │
    ├── knowledge-work-plugins/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-architecture-examples.md # 架构 + 11 插件 (~6KB)
    │
    ├── claude-mem/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-architecture-tools.md   # 架构 + MCP 工具 (~6KB)
    │
    ├── skill-seekers/
    │   ├── INDEX.md                   # 快速参考
    │   └── 01-commands-modules.md     # 命令 + C3 模块 (~6KB)
    │
    └── animejs.md                     # Anime.js 4.0 完整 API (~9KB)
```

## 加载规则

| 规则 | 说明 |
|------|------|
| **先读 INDEX.md** | 每个工具从 INDEX.md 入手, 决定是否需要切片 |
| **按需读切片** | 只读与当前任务相关的切片文件 |
| **不全量加载** | 严禁一次读完工具的所有切片 |
| **单次上限** | 最多同时加载 2 个切片 (~12KB) |

---

*L3 Warehouse — 通用工具库 (7 tools, 14 files)*
*Updated: 2026-02-12 (切片化升级)*
