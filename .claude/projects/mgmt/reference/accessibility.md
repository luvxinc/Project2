---
description: 无障碍/可访问性规范 — WCAG 2.2 AA, 键盘导航, ARIA, 自动检测
---

# 无障碍/可访问性 (Accessibility — WCAG 2.2 AA)

> **合规要求**: 2026 年起, 美国公共实体必须符合 WCAG 2.2 Level AA。
> **核心原则**: 所有功能必须可通过键盘完成, 对屏幕阅读器友好。

---

## 1. 合规标准

| 标准 | 级别 | 状态 |
|------|------|------|
| WCAG 2.2 | Level AA | ✅ 强制 |
| ADA (美国残疾人法案) | 合规 | ✅ 强制 |
| Section 508 | 联邦标准 | ✅ 如服务政府客户 |

---

## 2. 四大原则 (POUR)

### 2.1 可感知 (Perceivable)

| 要求 | 实现 |
|------|------|
| **文本对比度** | 正文 ≥ 4.5:1, 大文本 ≥ 3:1 |
| **图片替代文字** | 所有 `<img>` 必须有 `alt` 属性 |
| **表单标签** | 所有 `<input>` 关联 `<label>` |
| **色彩不依赖** | 不能只用颜色传达信息 (需加图标/文字) |
| **视频字幕** | 如有视频培训内容, 必须提供字幕 |

### 2.2 可操作 (Operable)

| 要求 | 实现 |
|------|------|
| **键盘完全可操作** | Tab 键可到达所有交互元素 |
| **Focus 指示器** | 清晰可见 (2px solid + 高对比色) |
| **跳过导航** | "Skip to main content" 链接 |
| **无时间限制** | 或提供延长时间选项 |
| **无闪烁** | 不超过 3 次/秒 闪烁 |

### 2.3 可理解 (Understandable)

| 要求 | 实现 |
|------|------|
| **语言标注** | `<html lang="en">` / `<html lang="zh">` |
| **一致的导航** | 所有页面导航结构一致 |
| **错误提示** | 清晰描述错误 + 修复建议 |
| **表单验证** | 内联错误消息, 关联到字段 |

### 2.4 健壮 (Robust)

| 要求 | 实现 |
|------|------|
| **语义化 HTML** | 使用 `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>` |
| **ARIA 标签** | 复杂组件使用 `role`, `aria-label`, `aria-describedby` |
| **有效 HTML** | 无重复 ID, 正确嵌套 |

---

## 3. 组件级要求

| 组件 | 无障碍要求 |
|------|-----------|
| **DataTable** | `role="grid"`, 键盘行选择, 排序按钮 `aria-sort` |
| **Modal/Dialog** | `role="dialog"`, `aria-modal="true"`, 焦点陷阱, ESC 关闭 |
| **Toast** | `role="alert"`, `aria-live="polite"` |
| **Dropdown** | `role="listbox"`, 上下键选择, Enter 确认 |
| **Sidebar** | `<nav aria-label="Main navigation">` |
| **Tabs** | `role="tablist"`, `role="tab"`, `aria-selected` |
| **Form** | `aria-required`, `aria-invalid`, `aria-describedby` |

---

## 4. shadcn/ui 无障碍优势

shadcn/ui 基于 **Radix UI** 原语, Radix 内置了优秀的无障碍支持:
- ✅ 键盘导航
- ✅ 焦点管理
- ✅ ARIA 属性
- ✅ 屏幕阅读器支持

**但需注意**: 二次封装组件时不要破坏这些内置行为。

---

## 5. 自动化检测 (CI 集成)

### 5.1 ESLint (开发时)

```json
// .eslintrc
{
  "extends": ["plugin:jsx-a11y/recommended"]
}
```

### 5.2 Playwright axe (CI)

```typescript
import AxeBuilder from '@axe-core/playwright';

test('首页无障碍检查', async ({ page }) => {
  await page.goto('/dashboard');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toHaveLength(0);
});
```

### 5.3 Lighthouse (CI)

```yaml
- name: Lighthouse A11y Audit
  run: |
    npx lighthouse http://localhost:3000 \
      --only-categories=accessibility \
      --output=json --output-path=./a11y-report.json
    score=$(cat a11y-report.json | jq '.categories.accessibility.score')
    if (( $(echo "$score < 0.90" | bc -l) )); then exit 1; fi
```

---

## 6. 测试清单

每个新页面上线前必须检查:

- [ ] Tab 键可到达所有交互元素
- [ ] Focus 指示器清晰可见
- [ ] 所有图片有 alt 文字
- [ ] 表单字段有关联 label
- [ ] 色彩对比度达标 (Chrome DevTools Contrast Ratio)
- [ ] 屏幕阅读器可正常朗读内容 (VoiceOver 测试)
- [ ] Playwright axe 扫描零 violation
- [ ] Lighthouse a11y 评分 ≥ 90

---

*Version: 1.0.0 — 2026-02-11*
