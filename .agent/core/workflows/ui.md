---
description: /main_ui 工作流。Use when 需要页面模板、主题系统、动画规范与 UI 交付检查。
---

# /ui — 界面

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **本文件是编排层 — 引用 L1 SOP, 不重复其内容。**
> 🔴 **Token 节约铁律:** SOP 只读命中 section; 域索引先读; L3 工具先读 INDEX; 大文件用完释放; 单次 ≤30KB。

---

## 🔴 V3 架构合规 (Architecture Reference — 强制)

> **所有 UI 开发任务, 必须以 V3 架构规范为基准:**
> - 📐 主文件: `.agent/projects/mgmt/reference/v3-architecture.md` (§3.2 前端技术栈, §9 i18n 规范)
> - 📚 参考: `.agent/projects/mgmt/reference/conventions.md` (主题/i18n 约定), `.agent/projects/mgmt/reference/accessibility.md` (WCAG 2.2)
>
> **前端技术栈: Next.js 16 + React 19 + TailwindCSS 4 + shadcn + React Query。不合规 = Block。**

---

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `Hub`, `模板`, `列表页`, `layout` | → §1 Hub 页面模板 |
| `主题`, `dark`, `light`, `切换` | → §2 主题系统 |
| `动画`, `Anime.js`, `过渡`, `交互` | → §3 动画库 |
| `组件`, `Modal`, `Table`, `表单` | → §4 组件规范 |
| `i18n`, `国际化`, `翻译` | → §5 i18n 管理 |
| `配色`, `字体`, `风格`, `设计` | → §6 设计系统 |

---

## §1 Hub 页面模板

> **加载:** `skills/frontend.md` §2 (页面与路由)

### 标准 Hub 结构

```
Hub 页面 (标准模板)
├── Header: 模块标题 + 搜索 + 操作按钮
├── Sub-nav: Pill 切换 (动画子导航栏)
├── Content: 基于当前 Pill 的内容区
│   ├── 列表视图 (Table + 分页)
│   ├── 卡片视图 (Grid)
│   └── 详情视图 (表单/只读)
└── Footer: 统计信息 + 操作
```

### Pill 切换实现 (Rule 40)

```
动画子导航规则:
1. 使用 CSS transition (不用 JS 动画)
2. 激活 Pill 有数据 Badge
3. 内容区无闪烁过渡
4. 路由同步 (URL 反映当前 Pill)
```

### L4 项目参考
- MGMT ERP Hub 实现: `projects/mgmt/playbooks/vma.md`

---

## §2 主题系统

> **加载:** `skills/frontend.md` §5 (双模式主题)

### CSS 变量体系

```css
:root {
  /* 语义化颜色 */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --accent: #007aff;
  --border: #d2d2d7;
  --hover: #f2f2f2;
  
  /* 间距 */
  --gap-xs: 4px;
  --gap-sm: 8px;
  --gap-md: 16px;
  --gap-lg: 24px;
  --gap-xl: 32px;
  
  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  
  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --bg-primary: #1c1c1e;
  --bg-secondary: #2c2c2e;
  --text-primary: #f5f5f7;
  --text-secondary: #98989d;
  --accent: #0a84ff;
  --border: #38383a;
  --hover: #3a3a3c;
}
```

### ThemeContext

```jsx
// 主题切换: 尊重系统设置 + 用户覆盖
const themes = ['light', 'dark', 'system'];
// prefers-color-scheme 监听
// localStorage 持久化
```

### Rule 44: Dynamic Baseline Synchronization
- 主题切换时所有组件动态同步
- 无闪烁 (使用 CSS 变量, 非 class 切换)

---

## §3 动画库

> **加载:** `skills/frontend.md` §3 + L3: `warehouse/tools/animejs/`

### Anime.js 4.0 集成

```javascript
import { animate, createScope, stagger, spring } from 'animejs';
```

### 标准动画模式

| 场景 | 模式 | 持续时间 |
|------|------|---------|
| 元素进入 | translateY + opacity | 400-800ms |
| 列表加载 | stagger (80-120ms 间隔) | — |
| 页面过渡 | [data-animate] + stagger | 600-1000ms |
| 悬停反馈 | scale 1.02-1.05 | 200-300ms |
| 微交互 | spring({ bounce: 0.5 }) | 自动 |

### React 集成 (createScope)
```jsx
useEffect(() => {
  scope.current = createScope({ root }).add(() => {
    animate('.item', {
      translateY: [20, 0],
      opacity: [0, 1],
      delay: stagger(80),
      ease: 'outExpo',
    });
  });
  return () => scope.current.revert(); // ⚠️ 必需清理
}, [deps]);
```

### L3 完整 API 参考
- 核心: `warehouse/tools/animejs/01-core-api.md`
- 高级: `warehouse/tools/animejs/02-advanced-patterns.md`

---

## §4 组件规范

> **加载:** `skills/frontend.md` §3 (组件封装)

### 组件分类

| 类型 | 职责 | 示例 |
|------|------|------|
| **原子组件** | 最小 UI 单元 | Button, Input, Badge |
| **分子组件** | 原子组合 | SearchBar, FormField |
| **有机组件** | 业务独立 | DataTable, ModalForm |
| **模板组件** | 页面骨架 | HubLayout, DetailLayout |

### 组件编写规则

```
1. 单一职责 (一个组件做一件事)
2. Props 接口明确 (TypeScript interface)
3. 默认值合理 (减少使用成本)
4. Loading/Error/Empty 三态
5. 支持 className 覆盖
6. forwardRef (需要 DOM 访问时)
```

---

## §5 i18n 管理

> **加载:** `skills/frontend.md` §7 (next-intl)

### 规则

```
Rule 8: Sub-component i18n Injection (显式注入)
Rule 9: Dynamic Mapping of Static Configurations

模式: 
1. 每个模块有独立命名空间 (VMA/Users/Products)
2. 子组件通过 props 接收翻译
3. 避免深层嵌套 key
4. 日期/时间使用 Intl API
```

---

## §6 设计系统

> **加载:** L3: `warehouse/tools/ui-ux-pro-max/`

### 设计决策流程

```
1. 确定场景: SaaS / 电商 / 医疗 / 金融
2. 生成设计系统: 读 L3 01-design-system.md → 运行推理引擎
3. 补充风格细节: 读 L3 02-styles-palettes-typography.md
4. 交付检查: 读 L3 03-ux-rules-checklist.md → 过检查清单
```

### L3 设计参考
- Design System 生成器: `warehouse/tools/ui-ux-pro-max/01-design-system.md`
- 风格 + 配色 + 字体: `warehouse/tools/ui-ux-pro-max/02-styles-palettes-typography.md`
- 99条 UX 准则 + 交付清单: `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md`

---

## §7 L3 工具库引用

| 环节 | 推荐工具 | 路径 | 何时加载 |
|------|---------|------|---------| 
| §3 动画核心 | Anime.js Core | `warehouse/tools/animejs/01-core-api.md` | animate/缓动/关键帧 |
| §3 动画高级 | Anime.js Advanced | `warehouse/tools/animejs/02-advanced-patterns.md` | Timeline/Scope/Stagger |
| §6 设计系统 | UI UX Pro: Design System | `warehouse/tools/ui-ux-pro-max/01-design-system.md` | v2.0 推理引擎 |
| §6 风格配色 | UI UX Pro: Styles | `warehouse/tools/ui-ux-pro-max/02-styles-palettes-typography.md` | 67 风格 + 96 配色 |
| §6 UX 检查 | UI UX Pro: Rules | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` | 99 条准则 + 交付检查 |
| §4 React 审查 | ECC: Review | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | React 反模式检查 |
| 提交前 | 🔴 Rules 层 | `core/rules/frontend.md` | **必查** — 前端 10 反模式 + Checklist |

---

## §7.5 问题复盘铁律 (🔴 全链必须执行)

> **修复任何 UI 问题后, 必须执行以下两步, 不可跳过:**

```
1. 记录错题本:
   写入 `.agent/projects/{project}/data/errors/ERROR-BOOK.md` (`core/skills/memory.md` §3.2 格式)
   关键词索引更新 (便于日后检索)

2. 交叉检查 (`core/skills/memory.md` §3.5):
   a. 抽象错误模式: "在 {组件类型} 中做了 {操作} 导致 {后果}"
   b. grep 搜索同类代码: 其他组件是否有同样问题?
   c. 逐一检查 + 批量修复
   d. 记录: "交叉检查发现 N 处同类问题, 已全部修复"
```

**典型 UI 交叉检查场景:**
| 原始问题 | 交叉检查方向 |
|---------|------------|
| 某组件 dark 模式下颜色错误 | grep 同类组件是否都正确适配 dark 模式 |
| i18n key 遗漏 | grep 同模块其他页面是否也有遗漏 |
| 动画清理遗漏 (scope.revert) | grep 所有 createScope 调用是否都有清理 |
| CSS 变量硬编码 | grep 同类硬编码颜色值 |

---

## §8 交接闭环

每个 UI 任务必须以下列之一结束:

| 结果 | 交接对象 | 行动 |
|------|----------|------|
| ✅ 完成 | CTO → QA | 交付物: 页面截图 + 响应式验证 + 主题切换截图 |
| ⚠️ 部分完成 | CTO | 已完成项 + 待完成项清单 |
| ❌ 方案变更 | PM | 退回原因 + 新方案建议 |

```markdown
## UI 完成报告
任务: {新页面 / 主题修改 / 动画开发}
结果: {✅ 完成 / ⚠️ 部分}
验证: 响应式 [✅/❌] | Light [✅/❌] | Dark [✅/❌] | i18n [✅/❌]
交接: {CTO/QA}
```

---

*Version: 2.1.0 — +§8 交接闭环*
*Created: 2026-02-14 | Updated: 2026-02-15*
