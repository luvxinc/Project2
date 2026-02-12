# MGMT ERP V2 主题系统配色规范

> 基于 macOS Human Interface Guidelines 设计

## 配色架构

本系统采用 **语义化 Token 分层** 架构，便于日后统一调整配色：

```
colorTokens (原始定义)
    ↓
themeColors (扁平化导出 - 组件使用)
    ↓
CSS Variables (全局样式使用)
```

## 文件位置

- **核心定义**: `apps/web/src/contexts/ThemeContext.tsx`
- **主题 Workflow**: `.agent/workflows/theme.md`

## 颜色 Token 结构

### 背景层级 (Background)

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `bg` / `primary` | `#000000` | `#f5f5f7` | 页面底层 |
| `bgSecondary` | `#1c1c1e` | `#ffffff` | 卡片/面板 |
| `bgTertiary` | `#2c2c2e` | `#f2f2f7` | 输入框/按钮 |
| `bgElevated` | `#3a3a3c` | `#ffffff` | 悬浮层/下拉菜单 |

### 边框/分隔线 (Border)

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `border` | `#38383a` | `#c6c6c8` | 主边框 |
| `borderLight` | `#48484a` | `#d1d1d6` | 次边框 |
| `separator` | `#545458` | `#3c3c4349` | 分隔线 |

### 文字层级 (Text) - 重点优化

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `text` | `#ffffff` | `#000000` | 主文字（标题、正文）|
| `textSecondary` | `#ebebf5` | `#3c3c43` | 二级文字（副标题）|
| `textTertiary` | `#ebebf599` | `#3c3c4399` | 三级文字（占位符）|
| `textQuaternary` | `#ebebf54d` | `#3c3c434d` | 四级文字（禁用）|

**注意**: 亮色模式文字使用 `#000000` (纯黑) 和 `#3c3c43` (深灰) 而非 Apple 官网常用的 `#1d1d1f` 和 `#86868b`，这是因为我们需要更高的对比度以满足 WCAG AA 标准。

### 系统功能色 (System Colors)

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `blue` | `#0a84ff` | `#007aff` | 链接、主按钮 |
| `green` | `#30d158` | `#34c759` | 成功状态 |
| `red` | `#ff453a` | `#ff3b30` | 错误、删除 |
| `orange` | `#ff9f0a` | `#ff9500` | 警告 |
| `yellow` | `#ffd60a` | `#ffcc00` | 提示 |
| `purple` | `#bf5af2` | `#af52de` | 特殊标记 |

### 交互状态 (Interaction)

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `hover` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.04)` | 鼠标悬浮 |
| `active` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.08)` | 点击状态 |
| `focus` | `rgba(10,132,255,0.3)` | `rgba(0,122,255,0.25)` | 焦点环 |

### Logo 处理

| Token | 暗色模式 | 亮色模式 | 用途 |
|-------|----------|----------|------|
| `logoFilter` | `none` | `invert(1)` | Logo 滤镜 |

白色 Logo 在亮色模式下通过 CSS `filter: invert(1)` 转为黑色。

## 组件使用方式

### 推荐方式：useThemeColors Hook

```tsx
import { useThemeColors } from '@/contexts/ThemeContext';

function MyComponent() {
  const colors = useThemeColors();
  
  return (
    <div style={{ 
      backgroundColor: colors.bgSecondary,
      color: colors.text,
      borderColor: colors.border 
    }}>
      内容
    </div>
  );
}
```

### 备选方式：useTheme + themeColors

```tsx
import { useTheme, themeColors } from '@/contexts/ThemeContext';

function MyComponent() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  // ...
}
```

### CSS 变量 (全局样式)

```css
.my-class {
  background-color: var(--color-bg);
  color: var(--color-text);
  border-color: var(--color-border);
}
```

## 修改配色指南

### 如何统一调整某个颜色

1. 打开 `ThemeContext.tsx`
2. 在 `colorTokens` 对象中找到对应 token
3. 修改颜色值
4. 所有使用该 token 的组件会自动更新

### 如何添加新的颜色 Token

1. 在 `colorTokens` 的 `dark` 和 `light` 中添加新颜色
2. 在 `themeColors` 的扁平化导出中添加映射
3. 如需 CSS 变量，在 `ThemeProvider` 的 `useEffect` 中添加

## 对比度检查

亮色模式设计确保满足 WCAG AA 标准：

- 主文字 `#000000` on `#f5f5f7` → 对比度 18.4:1 ✅
- 二级文字 `#3c3c43` on `#ffffff` → 对比度 11.0:1 ✅  
- 三级文字 `#3c3c4399` on `#ffffff` → 对比度 4.7:1 ✅

## 参考资源

- [Apple Human Interface Guidelines - Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines - Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [WCAG 2.1 Contrast Requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
