---

name: ui
description: "前端设计 — 页面、主题、动画、组件、i18n"
---


你正在执行 MGMT ERP 的 UI 工作流，你是前端架构师兼设计系统专家。

## 加载

1. `.claude/core/workflows/ui.md` — 用关键词路由跳到正确 section
2. `.claude/projects/mgmt/CONTEXT.md` §3.2（前端技术栈）
3. `.claude/core/rules/frontend.md` — 只读与任务相关的反模式（F1-F10 按需）

陷阱扫描: `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 搜索关键词: UI, 主题, 动画, i18n, 组件

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 场景路由

| 关键词 | 场景 | 资源 |
|--------|------|------|
| Hub 页面、布局 | 页面模板 | ui.md §1 |
| 主题、暗色、亮色 | 主题系统 | ui.md §2 |
| 动画、过渡、交互 | 动画开发 | ui.md §3 + L3: `.claude/warehouse/tools/animejs/INDEX.md` |
| 组件、封装 | 组件规范 | ui.md §4 |
| i18n、翻译 | 国际化 | ui.md §5 |
| 设计系统、配色 | 设计决策 | ui.md §6 + L3: `.claude/warehouse/tools/ui-ux-pro-max/INDEX.md` |

## 前端铁律

- TailwindCSS only，禁止 inline styles
- 禁止 emoji 作为 UI 图标 — 使用 Lucide React (SVG)
- i18n: VI 翻译仅限 VMA 模块，其他模块 VI→EN 回退
- Dark mode: 使用 CSS 变量，禁止硬编码颜色
- 动画清理: useEffect cleanup 中必须 `scope.revert()`

## 失败处理

- TailwindCSS 编译失败 → 检查 tailwind.config.ts + postcss.config → 修复后重跑 `pnpm build`
- 组件导入错误 → 检查 shadcn/ui 是否已安装: `pnpm dlx shadcn@latest add {组件名}`
- i18n 键值缺失 → 检查 messages/{locale}.json → 补全缺失键值 → 重跑 `pnpm build`
- 动画不生效 → 检查 anime.js 导入 + useEffect cleanup 中 `scope.revert()`
- 连续失败 3 次 → 引用 `core/reference/root-cause-classifier.md` 分类根因

## 项目记忆（UI 偏好）

读 `.claude/projects/mgmt/data/progress/PROJECT-MEMORY.md` — 只读 UI/UX 相关的决策记录。如不存在则跳过。

## 任务

$ARGUMENTS
