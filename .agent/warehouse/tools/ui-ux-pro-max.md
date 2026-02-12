---
name: ui-ux-pro-max
description: AI 设计智能技能 — 67 UI 风格, 96 配色方案, 57 字体配对, 99 UX 准则, 100 推理规则。
source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
version: v2.0
---

# UI UX Pro Max

> **用途**: 前端工程师 / `/main_ui` 工作流的设计参考
> **安装**: `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`

## 1. 核心能力

| 维度 | 数量 | 亮点 |
|------|------|------|
| UI 风格 | 67 | Glassmorphism, Neumorphism, Bento Grid, AI-Native, Dark Mode 等 |
| 配色方案 | 96 | SaaS/电商/医疗/金融/美容等行业专属 |
| 字体配对 | 57 | 含 Google Fonts 导入链接 |
| 图表类型 | 25 | 仪表盘/分析场景推荐 |
| 技术栈 | 13 | React, Next.js, Vue, Svelte, SwiftUI, Flutter, shadcn/ui 等 |
| UX 准则 | 99 | 含反模式检测 + 无障碍规则 |
| 推理规则 | 100 | 行业特定设计系统自动生成 (v2.0 新) |

## 2. 工作流

```
1. 用户描述需求 (产品类型、风格偏好、技术栈)
2. AI 推理引擎分析 → 生成完整设计系统
   • 页面布局模式 (Hero-Centric, Dashboard Grid 等)
   • 配色方案 (含主色、辅色、CTA、背景、文本)
   • 字体配对 (标题 + 正文)
   • 关键效果 (阴影、动画、悬停状态)
   • 避免事项 (反模式清单)
3. 代码生成 (含栈特定最佳实践)
4. 交付前自检 (Pre-Delivery Checklist)
```

## 3. 交付前自检清单 (核心)

```
[ ] 无 emoji 做图标 (用 SVG: Heroicons/Lucide)
[ ] 所有可点击元素有 cursor-pointer
[ ] 悬停有平滑过渡 (150-300ms)
[ ] 亮色模式文字对比度 ≥ 4.5:1
[ ] 键盘导航焦点状态可见
[ ] 尊重 prefers-reduced-motion
[ ] 响应式断点: 375px, 768px, 1024px, 1440px
```

## 4. 与我们系统的对接

| 我们的组件 | 对接点 |
|-----------|--------|
| `/main_ui` §1 Hub 页面 | 参考 Hub-Centric 布局模式 + 配色方案 |
| `/main_ui` §2 主题系统 | 参考 96 配色方案 + 双主题切换最佳实践 |
| `/main_ui` §3 动画库 | 参考悬停/过渡/交错入场最佳实践 |
| `frontend.md` | 参考 UX 准则 + 反模式清单 |
