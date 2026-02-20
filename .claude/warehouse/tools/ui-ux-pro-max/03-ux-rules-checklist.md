# UI UX Pro Max — 03: UX 准则 + 反模式 + 交付清单

> **加载时机**: UX 审查 / 交付前自检 / 代码 review 检查 UI 质量时

## 1. 99 UX 准则 (按优先级)

### 🔴 CRITICAL — Accessibility (优先级 1)

| 规则 | 要求 |
|------|------|
| `color-contrast` | 正文最低 4.5:1 对比度 |
| `focus-states` | 所有交互元素必须有可见的 focus ring |
| `alt-text` | 有意义的图片必须有描述性 alt text |
| `aria-labels` | 纯图标按钮必须有 aria-label |
| `keyboard-nav` | Tab 顺序必须匹配视觉顺序 |
| `form-labels` | 表单输入必须有 `<label for="">` |

### 🔴 CRITICAL — Touch & Interaction (优先级 2)

| 规则 | 要求 |
|------|------|
| `touch-target-size` | 触控目标最小 44×44px |
| `hover-vs-tap` | 主要交互用 click/tap, 不依赖 hover |
| `loading-buttons` | 异步操作时禁用按钮 + 显示状态 |
| `error-feedback` | 清晰的错误提示, 靠近问题位置 |
| `cursor-pointer` | 所有可点击元素加 `cursor-pointer` |

### 🟡 HIGH — Performance (优先级 3)

| 规则 | 要求 |
|------|------|
| `image-optimization` | WebP + srcset + lazy loading |
| `reduced-motion` | 检查 `prefers-reduced-motion` |
| `content-jumping` | 为异步内容预留空间 (避免 CLS) |

### 🟡 HIGH — Layout & Responsive (优先级 4)

| 规则 | 要求 |
|------|------|
| `viewport-meta` | `width=device-width, initial-scale=1` |
| `readable-font-size` | 移动端正文最小 16px |
| `horizontal-scroll` | 确保内容适配视口宽度 |
| `z-index-management` | 定义 z-index 阶梯 (10, 20, 30, 50) |

### 🟢 MEDIUM — Typography & Color (优先级 5)

| 规则 | 要求 |
|------|------|
| `line-height` | 正文行高 1.5-1.75 |
| `line-length` | 每行 65-75 个字符 |
| `font-pairing` | 标题/正文字体性格匹配 |

### 🟢 MEDIUM — Animation (优先级 6)

| 规则 | 要求 |
|------|------|
| `duration-timing` | 微交互 150-300ms |
| `transform-performance` | 只动 transform/opacity, 不动 width/height |
| `loading-states` | 骨架屏或 spinner |

### 🟢 MEDIUM — Style Selection (优先级 7)

| 规则 | 要求 |
|------|------|
| `style-match` | 风格匹配产品类型 |
| `consistency` | 全站风格统一 |
| `no-emoji-icons` | 用 SVG 图标 (Heroicons/Lucide), 不用 emoji |

## 2. 反模式 Do/Don't 表

### Icons & Visual Elements
| ✅ Do | ❌ Don't |
|-------|---------|
| SVG 图标 (Heroicons, Lucide, Simple Icons) | emoji 当 UI 图标 🎨 🚀 ⚙️ |
| color/opacity 渐变 hover | scale 变换导致布局偏移 |
| 从 Simple Icons 获取品牌 logo | 猜测或使用错误 logo |
| 统一图标尺寸 (viewBox 24×24, w-6 h-6) | 随意混用不同尺寸 |

### Interaction & Cursor
| ✅ Do | ❌ Don't |
|-------|---------|
| 所有可点击/hoverable 卡片加 `cursor-pointer` | 交互元素保持默认 cursor |
| hover 提供视觉反馈 (色/影/边框) | 无任何交互提示 |
| `transition-colors duration-200` | 瞬变 或 >500ms 过慢 |

### Light/Dark Mode Contrast
| ✅ Do | ❌ Don't |
|-------|---------|
| 浅色模式 `bg-white/80` 或更高 | `bg-white/10` (太透明) |
| 文字用 `#0F172A` (slate-900) | `#94A3B8` (slate-400) 当正文 |
| 浅色辅助文字最低 `#475569` (slate-600) | gray-400 或更浅 |
| `border-gray-200` 浅色模式 | `border-white/10` (不可见) |

### Layout & Spacing
| ✅ Do | ❌ Don't |
|-------|---------|
| 浮动导航栏 `top-4 left-4 right-4` 留边 | `top-0 left-0 right-0` 贴边 |
| 考虑固定导航高度, 内容不被遮挡 | 内容藏在固定元素后面 |
| 统一 `max-w-6xl` 或 `max-w-7xl` | 混用不同容器宽度 |

## 3. Pre-Delivery Checklist (交付前检查清单)

### Visual Quality
- [ ] 没有 emoji 当图标 (改用 SVG)
- [ ] 所有图标来自统一图标集 (Heroicons/Lucide)
- [ ] 品牌 logo 正确 (从 Simple Icons 验证)
- [ ] hover 状态不导致布局偏移
- [ ] 使用主题色直接引用 (`bg-primary`), 不用 `var()` 包装

### Interaction
- [ ] 所有可点击元素有 `cursor-pointer`
- [ ] hover 提供清晰视觉反馈
- [ ] 过渡平滑 (150-300ms)
- [ ] focus 状态对键盘导航可见

### Light/Dark Mode
- [ ] 浅色模式文字对比度 ≥ 4.5:1
- [ ] 毛玻璃/透明元素在浅色模式下可见
- [ ] 边框在两种模式下都可见
- [ ] 交付前两种模式都测试

### Layout
- [ ] 浮动元素与边缘有适当间距
- [ ] 没有内容被固定导航遮挡
- [ ] 响应式: 375px / 768px / 1024px / 1440px
- [ ] 移动端无水平滚动

### Accessibility
- [ ] 所有图片有 alt text
- [ ] 表单输入有 label
- [ ] 色彩不是唯一的信息指示
- [ ] `prefers-reduced-motion` 已适配
