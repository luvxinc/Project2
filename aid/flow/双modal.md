# 双 Modal 连续弹出问题解决方案

> **Purpose**: 此文件提供了一个特定的前端 UI 模式（Closure Buffer），用于解决 Bootstrap 5 中双 Modal 连续弹出（如确认框后紧接密码框）导致的冲突问题。
> **AI Attention**: 在生成涉及多步骤 Modal 交互（特别是包含 `GlobalModal.showConfirm` + `requestPasswordVerify`）的前端代码时，**必须** 应用此处的 `setTimeout(..., 350)` 模式。
> **Constraints**: `SOFT` - UI 体验优化建议。
> **Related Files**: 
> - `aid/safety/密码策略.md`: 密码验证是双 Modal 最常见的触发场景。



> **最后更新**: 2026-01-09
> **适用场景**: Bootstrap 5 Modal 连续弹出（如：确认框 → 密码验证框）

---

## 问题描述

当需要连续弹出两个 Bootstrap Modal 时（例如：先显示确认对话框，用户确认后再显示密码验证框），会出现以下问题：

1. **动画冲突**：第一个 Modal 关闭动画（约 300ms）未完成，第二个 Modal 就尝试打开
2. **DOM 竞争**：Bootstrap 的 `.modal-backdrop` 状态未正确清理
3. **结果**：第二个 Modal 无法正常显示，或显示后立即关闭

---

## 解决方案：Closure Buffer（关闭缓冲）

在第一个 Modal 的 `onConfirm` 回调中，添加 **350ms 延迟** 后再弹出第二个 Modal。

### 核心代码模式

```javascript
GlobalModal.showConfirm({
    title: '确认操作',
    message: '您确定要执行此操作吗？',
    confirmText: '确认',
    confirmStyle: 'danger',
    onConfirm: () => {
        // ⚠️ 关键：添加 350ms Closure Buffer
        setTimeout(() => {
            // 在这里弹出第二个 Modal（如密码验证）
            requestPasswordVerify(
                'action_key',
                (passwords) => executeAction(passwords),
                null,
                '操作名称',
                () => console.log('用户取消')
            );
        }, 350);  // 350ms 足够等待 Bootstrap 动画完成
    }
});
```

---

## 完整示例：删除付款功能

```javascript
function deletePayment(pmtNo) {
    // Step 1: 确认对话框
    GlobalModal.showConfirm({
        title: '确认删除付款',
        message: `<div class="text-center">
            <p class="mb-3">您确定要删除付款记录吗？</p>
            <p class="text-muted small mb-2">付款号: <strong class="text-danger">${pmtNo}</strong></p>
        </div>`,
        confirmText: '确认删除',
        confirmStyle: 'danger',
        onConfirm: () => {
            // Step 2: 密码验证（添加 350ms Closure Buffer）
            setTimeout(() => {
                if (typeof requestPasswordVerify === 'function') {
                    requestPasswordVerify(
                        'logistic_payment_delete',
                        (passwords) => executeDeletePayment(pmtNo, passwords),
                        null,
                        '删除付款',
                        () => console.log('[PaymentCard] Password verification cancelled')
                    );
                } else {
                    executeDeletePayment(pmtNo, {});
                }
            }, 350);
        }
    });
}
```

---

## 技术细节

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 延迟时间 | 350ms | Bootstrap 5 Modal 默认动画时长约 300ms，350ms 提供安全余量 |
| 最小值 | 300ms | 低于此值可能仍有冲突 |
| 最大值 | 500ms | 超过此值用户体验下降 |

---

## 参考组件

已使用此模式的组件：

1. **GlobalFileViewer** (`global_file_viewer.js`)
   - `_showDeleteConfirm()` → `_executeDelete()` → `requestPasswordVerify()`
   
2. **物流付款删除** (`logistic.html`)
   - `deletePayment()` → `GlobalModal.showConfirm` → `requestPasswordVerify()`

---

## 注意事项

1. **不要在 `onCancel` 中使用延迟**：取消操作不需要弹出新 Modal
2. **延迟只加在第一个 Modal 的回调中**：第二个 Modal（如密码验证）内部不需要
3. **如果第二个 Modal 未显示**：检查控制台是否有 JavaScript 错误，可能是 action 未注册

---

## 相关文档

- [密码策略系统架构](/Users/aaron/Desktop/app/MGMT/aid/safety/密码策略.md)
- [GlobalModal 组件](/Users/aaron/Desktop/app/MGMT/backend/static/js/global-modal.js)
