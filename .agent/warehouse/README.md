# L3: 工具库 (Warehouse)

> **跨项目通用工具。与任何特定客户项目无关。**
> **客户项目数据在 L4 (`projects/{project}/`)。**

---

## 工具清单

| 文件 | 名称 | 类别 | 用途 |
|------|------|------|------|
| `animejs.md` | Anime.js 4.0 | 前端动画 | 动画库 API 参考 |
| `everything-claude-code.md` | ECC | Agent 架构 | 42K⭐ Agent 最佳实践集 |
| `ui-ux-pro-max.md` | UI UX Pro Max | 设计智能 | 67 风格 + 96 配色 + 99 UX 准则 |
| `anthropic-skills.md` | Anthropic Skills | 官方参考 | Skill 规范 + 模板 + 示例 |
| `knowledge-work-plugins.md` | Knowledge Work | 领域增强 | 11 个专业领域插件 |
| `claude-mem.md` | Claude-Mem | 记忆管理 | 持久记忆 + 语义搜索 |
| `skill-seekers.md` | Skill Seekers | 自动化 | 文档→Skill 转换工具 |

## 目录结构

```
warehouse/
├── README.md                        ← 你在这里
└── tools/
    ├── animejs.md                   # Anime.js 4.0 动画库参考
    ├── everything-claude-code.md    # ECC — Agent 架构最佳实践
    ├── ui-ux-pro-max.md             # UI/UX 设计智能
    ├── anthropic-skills.md          # Anthropic 官方 Skills 规范
    ├── knowledge-work-plugins.md    # 11 个专业领域插件
    ├── claude-mem.md                # 持久记忆管理
    └── skill-seekers.md             # 文档→Skill 自动化工具
```

## 使用规则

| 规则 | 说明 |
|------|------|
| **只放泛化工具** | 可被任何项目复用的 SDK 参考、模板、脚本 |
| **不放项目数据** | 审计报告、进度、需求文档 → L4 `projects/{project}/data/` |
| **按需加载** | 用到某工具时才读对应文件 |
| **篇幅控制** | 每个工具文件 ≤ 3KB, 详细内容链接到 GitHub 源 |

---

*L3 Warehouse — 通用工具库 (7 tools)*
