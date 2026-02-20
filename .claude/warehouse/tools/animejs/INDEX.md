---
name: animejs
description: Anime.js 4.0 JavaScript 动画引擎 — 完整 API 参考 (animate/timeline/stagger/scope/SVG/draggable)
source: https://animejs.com/documentation
version: v4.0.0
npm: animejs
---

# Anime.js 4.0

> **用途**: 前端动画开发的完整 API 参考
> **状态**: ✅ 已安装 (`npm install animejs`)

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-core-api.md` | animate() + Timer/Animation 基础 + 属性/目标/关键帧/缓动 | ~5KB | 基础动画开发 |
| `02-advanced-patterns.md` | Timeline + createScope (React) + Stagger + SVG + Draggable + Scroll | ~8KB | 复杂动画/React 集成 |

## 快速参考 (不需要读切片)

### 安装
```bash
npm install animejs
```

### 核心导入
```javascript
import { animate, timeline, stagger, createScope, spring, createDraggable } from 'animejs';
```

### 最常用模式
```javascript
// 基础动画
animate('.element', { translateX: 250, opacity: 0.5, duration: 800, ease: 'outExpo' });

// 时间线
timeline()
  .add('.el1', { translateX: 250 })
  .add('.el2', { translateY: 100 }, '-=200');

// Stagger (交错)
animate('.items', { translateY: -40, delay: stagger(100) });

// React (createScope 模式)
const scope = createScope({ root: rootRef });
scope.add(self => { animate('.logo', { scale: 1.2, loop: true }); });
return () => scope.current.revert(); // cleanup
```

### 缓动速查
```
linear | inQuad | outQuad | inOutQuad
inCubic | outCubic | inOutCubic
inExpo | outExpo | inOutExpo
inElastic | outElastic | inOutElastic
inBounce | outBounce | inOutBounce
spring({ stiffness, damping, mass, velocity })
```
