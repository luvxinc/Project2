# UI UX Pro Max — 01: Design System Generator + 搜索引擎

> **加载时机**: 任何 UI/UX 设计任务的第一步 — 生成完整设计系统

## 1. Design System Generator (v2.0 旗舰)

**核心流程**:
```
┌───────────────────────────────────────────────┐
│ 1. USER REQUEST                               │
│    "Build a landing page for my beauty spa"   │
└───────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────┐
│ 2. MULTI-DOMAIN SEARCH (5 parallel searches)  │
│ • Product type matching (100 categories)      │
│ • Style recommendations (67 styles)           │
│ • Color palette selection (96 palettes)       │
│ • Landing page patterns (24 patterns)         │
│ • Typography pairing (57 font combinations)   │
└───────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────┐
│ 3. REASONING ENGINE                           │
│ • Match product → UI category rules           │
│ • Apply style priorities (BM25 ranking)       │
│ • Filter anti-patterns for industry           │
│ • Process decision rules (JSON conditions)    │
└───────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────┐
│ 4. COMPLETE DESIGN SYSTEM OUTPUT              │
│   Pattern + Style + Colors + Typography       │
│   + Effects + Anti-patterns + Checklist       │
└───────────────────────────────────────────────┘
```

## 2. 命令参考

### 生成设计系统 (必须第一步)
```bash
# 基本用法 — 自动推理最佳设计系统
python3 skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]

# 示例
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness" --design-system -p "Serenity Spa"
python3 skills/ui-ux-pro-max/scripts/search.py "fintech banking dark" --design-system -p "PayFlow"
python3 skills/ui-ux-pro-max/scripts/search.py "healthcare SaaS dashboard" --design-system -p "MedAdmin"
```

### 持久化设计系统 (Master + Overrides)
```bash
# 生成并持久化为 MASTER.md
python3 scripts/search.py "<query>" --design-system --persist -p "ProjectName"

# 添加页面级覆盖
python3 scripts/search.py "<query>" --design-system --persist -p "ProjectName" --page "dashboard"
```

**产出目录结构**:
```
design-system/
├── MASTER.md        # 全局真相源 (颜色/字体/间距/组件)
└── pages/
    └── dashboard.md # 页面级覆盖 (仅记录与 Master 的偏差)
```

**层级检索规则**:
1. 构建特定页面时, 先查 `design-system/pages/{page}.md`
2. 如果页面文件存在, 其规则**覆盖** Master
3. 如果不存在, 完全使用 `MASTER.md`

### 域搜索 (补充细节)
```bash
python3 scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

### 技术栈指南
```bash
python3 scripts/search.py "<keyword>" --stack <stack>
```

### 输出格式
```bash
# ASCII box (默认) — 适合终端
python3 scripts/search.py "fintech" --design-system

# Markdown — 适合文档
python3 scripts/search.py "fintech" --design-system -f markdown
```

## 3. 10 搜索域详解

| 域 | 用途 | 示例关键词 |
|----|------|-----------|
| `product` | 产品类型推荐 | SaaS, e-commerce, portfolio, healthcare, beauty |
| `style` | UI 风格/效果 | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | 字体配对 + Google Fonts | elegant, playful, professional, modern |
| `color` | 行业配色方案 | saas, ecommerce, healthcare, beauty, fintech |
| `landing` | 页面结构/CTA 策略 | hero, hero-centric, testimonial, pricing |
| `chart` | 图表类型推荐 | trend, comparison, timeline, funnel, pie |
| `ux` | 最佳实践/反模式 | animation, accessibility, z-index, loading |
| `react` | React/Next.js 性能 | waterfall, bundle, suspense, memo, rerender |
| `web` | Web 无障碍指南 | aria, focus, keyboard, semantic, virtualize |
| `prompt` | AI 提示词/CSS 关键词 | (style name) |

## 4. 10 技术栈

| 栈 | 焦点 |
|----|------|
| `html-tailwind` | Tailwind 工具类/响应式/a11y **(默认)** |
| `react` | State/hooks/性能/模式 |
| `nextjs` | SSR/路由/Image/API Routes |
| `vue` | Composition API/Pinia/Vue Router |
| `svelte` | Runes/stores/SvelteKit |
| `swiftui` | Views/State/Navigation/Animation |
| `react-native` | Components/Navigation/Lists |
| `flutter` | Widgets/State/Layout/Theming |
| `shadcn` | shadcn/ui 组件/主题/表单/模式 |
| `jetpack-compose` | Composables/Modifiers/State Hoisting |

## 5. 100 行业推理规则 (Reasoning Rules)

每条规则包含:
- **Recommended Pattern** — Landing page 结构
- **Style Priority** — 最佳匹配 UI 风格
- **Color Mood** — 行业适配色系
- **Typography Mood** — 字体性格匹配
- **Key Effects** — 动画和交互
- **Anti-Patterns** — 行业禁忌 (如银行不用 AI 紫/粉渐变)

**设计系统输出示例**:
```
+──────────────────────────────────────────────────+
| TARGET: Serenity Spa - RECOMMENDED DESIGN SYSTEM |
+──────────────────────────────────────────────────+
| PATTERN: Hero-Centric + Social Proof             |
| STYLE: Soft UI Evolution                         |
| COLORS:                                          |
|   Primary: #E8B4B8 (Soft Pink)                   |
|   Secondary: #A8D5BA (Sage Green)                |
|   CTA: #D4AF37 (Gold)                            |
|   Background: #FFF5F5 (Warm White)               |
| TYPOGRAPHY: Cormorant Garamond / Montserrat      |
| KEY EFFECTS: Soft shadows + 200-300ms transitions|
| AVOID: Neon colors, harsh anim, dark mode        |
+──────────────────────────────────────────────────+
```

## 6. 工作流程 (最佳实践)

```
Step 1: 分析用户请求
  → 提取: 产品类型 / 风格关键词 / 行业 / 技术栈

Step 2: 生成设计系统 (必须!)
  → python3 scripts/search.py "<query>" --design-system -p "Name"

Step 3: 补充详细搜索 (按需)
  → --domain style "glassmorphism dark"
  → --domain chart "real-time dashboard"
  → --domain ux "animation accessibility"

Step 4: 技术栈指南 (按需)
  → --stack react / --stack html-tailwind

Step 5: 交付前检查
  → 参见 03-ux-rules-checklist.md 的交付清单
```
