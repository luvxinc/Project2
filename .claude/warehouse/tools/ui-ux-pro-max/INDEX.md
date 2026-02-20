---
name: ui-ux-pro-max
description: AI 驱动 UI/UX 设计智能引擎 v2.0 — 67 风格 + 96 配色 + 57 字体 + 99 UX 准则 + 100 行业推理规则 + Design System Generator
source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
website: https://uupm.cc
version: v2.0
license: MIT
stars: 31k+
cli: uipro-cli (npm)
generated_by: Skill Seekers v2.7.2 + 手动深度学习
generated_date: 2026-02-15
---

# UI UX Pro Max v2.0

> **用途**: 前端设计决策的 AI 推理引擎 — 自动生成完整设计系统
> **状态**: ✅ 参考资料 + CLI 可安装 (`npm install -g uipro-cli`)

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-design-system.md` | v2.0 旗舰: Design System Generator + 推理引擎 + 搜索域 + 技术栈 + 持久化 | ~7KB | 任何 UI/UX 设计任务 (必读) |
| `02-styles-palettes-typography.md` | 67 风格速查 + 96 行业配色 (HEX) + 57 字体配对 (Google Fonts) | ~5KB | 选风格/配色/字体时 |
| `03-ux-rules-checklist.md` | 99 条 UX 准则 (按优先级) + 反模式 Do/Don't + 交付前检查清单 | ~5KB | UX 审查/交付前自检时 |

## v2.0 新特性 (旗舰功能)

**Design System Generator** — 分析项目需求, 自动生成完整设计系统:
```
用户请求 → 5 域并行搜索 (product/style/color/landing/typography)
         → 推理引擎 (100 行业规则 + BM25 排名)
         → 输出: Pattern + Style + Colors + Typography + Effects + Anti-patterns
```

## 快速参考 (不需要读切片)

**规则优先级**:
| 优先级 | 类别 | 影响 |
|--------|------|------|
| 1 | Accessibility | 🔴 CRITICAL |
| 2 | Touch & Interaction | 🔴 CRITICAL |
| 3 | Performance | 🟡 HIGH |
| 4 | Layout & Responsive | 🟡 HIGH |
| 5 | Typography & Color | 🟢 MEDIUM |
| 6 | Animation | 🟢 MEDIUM |
| 7 | Style Selection | 🟢 MEDIUM |
| 8 | Charts & Data | ⚪ LOW |

**10 搜索域**: product / style / typography / color / landing / chart / ux / react / web / prompt

**10 技术栈**: html-tailwind (默认) / react / nextjs / vue / svelte / swiftui / react-native / flutter / shadcn / jetpack-compose

**安装方式**:
```bash
npm install -g uipro-cli
uipro init --ai antigravity   # 我们的 Agent
uipro init --ai claude        # Claude Code
```
