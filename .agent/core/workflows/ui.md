---
description: 界面 — Hub 页面模板, 主题系统, 动画库
---

# /ui — 界面

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `hub`, `首页`, `模块入口`, `iPad` | → §1 Hub 页面模板 |
| `主题`, `theme`, `暗色`, `亮色`, `dark`, `light` | → §2 主题系统 |
| `动画`, `animation`, `anime.js` | → §3 动画库 |

---

## §1 Hub 页面模板 (Apple iPad 风格)

### 设计理念

每个模块的首页是一个 **Hub 页面**, 采用 Apple iPad 风格的网格布局:

```
┌──────────────────────────────────────────────┐
│  Module Hub                                   │
│                                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │  📦     │  │  📊     │  │  🔧     │      │
│  │ Sub-A   │  │ Sub-B   │  │ Sub-C   │      │
│  │ 简要描述 │  │ 简要描述 │  │ 简要描述 │      │
│  └─────────┘  └─────────┘  └─────────┘      │
│                                               │
│  ┌─────────┐  ┌─────────┐                    │
│  │  📋     │  │  ⚙️     │                    │
│  │ Sub-D   │  │ Sub-E   │                    │
│  │ 简要描述 │  │ 简要描述 │                    │
│  └─────────┘  └─────────┘                    │
└──────────────────────────────────────────────┘
```

### 代码模板

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { PageLayout } from '@/components/layout/PageLayout';

interface HubItem {
  icon: string;
  title: string;
  description: string;
  path: string;
  gradient: string;  // 渐变背景色
}

export default function ModuleHubPage() {
  const t = useTranslations('module');
  const router = useRouter();
  const { theme } = useTheme();

  const items: HubItem[] = [
    {
      icon: '📦',
      title: t('hub.subA'),
      description: t('hub.subADesc'),
      path: '/module/sub-a',
      gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
    },
    // ... more items
  ];

  return (
    <PageLayout>
      <h1 className="hub-title">{t('hub.title')}</h1>
      <div className="hub-grid">
        {items.map((item) => (
          <div
            key={item.path}
            className="hub-card"
            style={{ background: item.gradient }}
            onClick={() => router.push(item.path)}
          >
            <span className="hub-card-icon">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
```

### Hub 样式规范

| 属性 | 值 |
|------|-----|
| 网格 | `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` |
| 卡片圆角 | `border-radius: 16px` |
| 卡片阴影 | `box-shadow: 0 4px 20px rgba(0,0,0,0.1)` |
| 悬停效果 | `transform: translateY(-4px)` + 阴影增强 |
| 入场动画 | 交错淡入 (stagger fade-in) — 使用 §3 动画库 |
| 图标大小 | `font-size: 2.5rem` |

---

## §2 主题系统 (Apple Design)

### 双主题架构

```tsx
// contexts/ThemeContext.tsx
const themeColors = {
  light: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f5f5f7',
    textPrimary: '#1d1d1f',
    textSecondary: '#86868b',
    accent: '#0071e3',
    border: '#d2d2d7',
    glassBg: 'rgba(255, 255, 255, 0.72)',
    glassBlur: '20px',
  },
  dark: {
    bgPrimary: '#000000',
    bgSecondary: '#1d1d1f',
    textPrimary: '#f5f5f7',
    textSecondary: '#86868b',
    accent: '#2997ff',
    border: '#424245',
    glassBg: 'rgba(29, 29, 31, 0.72)',
    glassBlur: '20px',
  },
};
```

### CSS 变量

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --accent: #0071e3;
  --border: #d2d2d7;
  --glass-bg: rgba(255, 255, 255, 0.72);
  --glass-blur: 20px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
}

[data-theme="dark"] {
  --bg-primary: #000000;
  --bg-secondary: #1d1d1f;
  --text-primary: #f5f5f7;
  --text-secondary: #86868b;
  --accent: #2997ff;
  --border: #424245;
  --glass-bg: rgba(29, 29, 31, 0.72);
}
```

### 毛玻璃效果 (Glassmorphism)

```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
```

### 主题切换铁律

| 规则 | 说明 |
|------|------|
| **禁止硬编码颜色** | 必须使用 CSS 变量或 `themeColors[theme]` |
| **图片/图标适配** | 使用 `filter` 或提供明暗两套资源 |
| **表单控件** | 统一使用 shadcn/Radix 封装, 自动适配 |
| **第三方组件** | AG Grid 等使用自定义主题覆盖 |

---

## §3 动画库 (Anime.js 4.x)

### 引入

```bash
pnpm add animejs
```

### 常用动画模式

```typescript
import anime from 'animejs';

// 1. 交错入场 (Hub 卡片)
anime({
  targets: '.hub-card',
  translateY: [30, 0],
  opacity: [0, 1],
  delay: anime.stagger(80),
  duration: 600,
  easing: 'easeOutCubic',
});

// 2. 弹性出现 (Modal)
anime({
  targets: '.modal-content',
  scale: [0.9, 1],
  opacity: [0, 1],
  duration: 300,
  easing: 'spring(1, 80, 10, 0)',
});

// 3. 滑入 (Sidebar)
anime({
  targets: '.sidebar',
  translateX: [-280, 0],
  duration: 400,
  easing: 'easeOutExpo',
});

// 4. 数字滚动 (Dashboard 数据)
anime({
  targets: { value: 0 },
  value: targetNumber,
  round: 1,
  duration: 1000,
  easing: 'easeOutExpo',
  update: (anim) => {
    el.textContent = Math.round(anim.animations[0].currentValue).toLocaleString();
  },
});

// 5. 路径动画 (Loading)
anime({
  targets: '.loading-path',
  strokeDashoffset: [anime.setDashoffset, 0],
  duration: 1500,
  easing: 'easeInOutQuart',
  loop: true,
});
```

### React Hook 封装

```tsx
import { useEffect, useRef } from 'react';
import anime from 'animejs';

export function useStaggerAnimation(selector: string, deps: any[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const targets = containerRef.current.querySelectorAll(selector);
    if (targets.length === 0) return;

    anime({
      targets,
      translateY: [20, 0],
      opacity: [0, 1],
      delay: anime.stagger(60),
      duration: 500,
      easing: 'easeOutCubic',
    });
  }, deps);

  return containerRef;
}

// 使用
function HubPage() {
  const containerRef = useStaggerAnimation('.hub-card', [items]);
  return <div ref={containerRef}>...</div>;
}
```

### 性能规范

| 规则 | 说明 |
|------|------|
| **只动画 transform/opacity** | 避免触发 Layout (width, height, margin) |
| **用 will-change** | 提前通知浏览器 GPU 合成 |
| **Cleanup** | `useEffect` return 中 `anime.remove()` |
| **Reduce Motion** | 尊重 `prefers-reduced-motion` |

---

*Version: 1.0.0 — Generic Core*
