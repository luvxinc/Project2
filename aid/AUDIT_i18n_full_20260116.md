# i18n 国际化完整审计报告
# i18n Full Internationalization Audit Report

**生成时间 / Generated**: 2026-01-16 03:23
**总问题数 / Total Issues**: 1639
**受影响文件 / Affected Files**: 156

---

## 执行摘要 / Executive Summary

本报告列出了所有 HTML 模板中**未国际化的硬编码中文文本**。这些文本需要：
1. 添加 `data-i18n` 属性
2. 在 `zh.json` 和 `en.json` 中添加对应的翻译键

This report lists all **non-internationalized hardcoded Chinese text** in HTML templates. These texts need:
1. Add `data-i18n` attribute
2. Add corresponding translation keys in `zh.json` and `en.json`

---

## 按模块统计 / Statistics by Module

| 模块 / Module | 问题数 / Issues | 优先级 / Priority |
|---------------|-----------------|-------------------|
| purchase/ | 652 | P1 🔴 |
| finance/ | 383 | P1 🔴 |
| components/ | 104 | P1 🔴 |
| inventory/ | 85 | P2 🟡 |
| user_admin/ | 79 | P2 🟡 |
| db_admin/ | 72 | P2 🟡 |
| etl/ | 61 | P2 🟡 |
| log/ | 53 | P2 🟡 |
| products/ | 41 | P2 🟡 |
| layouts/ | 36 | P2 🟡 |
| sales/ | 29 | P3 🟢 |
| visuals/ | 24 | P3 🟢 |
| pages/ | 10 | P3 🟢 |
| reports/ | 10 | P3 🟢 |

---

## 文件详情 / File Details

以下按模块列出每个文件中的问题：
The following lists issues in each file by module:


### 📁 components/

#### `components/module_hub.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 88 | 灰色字体 | `{# ========== No Access Item - 灰色字体 + 锁图标，点击弹窗提示 ========== ...` |
| 88 | 锁图标 | `{# ========== No Access Item - 灰色字体 + 锁图标，点击弹窗提示 ========== ...` |
| 88 | 点击弹窗提示 | `{# ========== No Access Item - 灰色字体 + 锁图标，点击弹窗提示 ========== ...` |
| 110 | 真实页面跳转 | `{# Direct URL navigation - 真实页面跳转，无拦截 #}...` |
| 110 | 无拦截 | `{# Direct URL navigation - 真实页面跳转，无拦截 #}...` |

#### `components/security_error_modal.html` (16 issues)

| Line | Text | Context |
|------|------|----------|
| 2 | 操作失败 | `操作失败/错误 Modal 组件...` |
| 2 | 错误 | `操作失败/错误 Modal 组件...` |
| 2 | 组件 | `操作失败/错误 Modal 组件...` |
| 3 | 使用方法 | `使用方法: {% include "components/security_error_modal.html" %}...` |
| 5 | 需要在页面中定义的回调函数 | `需要在页面中定义的回调函数 (可选):...` |
| 5 | 可选 | `需要在页面中定义的回调函数 (可选):...` |
| 6 | 点击 | `- onErrorConfirm(): 点击"确定"按钮时调用...` |
| 6 | 确定 | `- onErrorConfirm(): 点击"确定"按钮时调用...` |
| 6 | 按钮时调用 | `- onErrorConfirm(): 点击"确定"按钮时调用...` |
| 8 | 如果不定义该函数 | `如果不定义该函数，默认行为是刷新页面 location.reload()...` |
| 8 | 默认行为是刷新页面 | `如果不定义该函数，默认行为是刷新页面 location.reload()...` |
| 10 | 提供的元素 | `提供的元素 ID:...` |
| 11 | 本身 | `- errorModal: Modal 本身...` |
| 12 | 错误消息显示区 | `- error-msg-content: 错误消息显示区...` |
| 40 | 错误 | `/* 错误Modal红色发光边框 */...` |
| 40 | 红色发光边框 | `/* 错误Modal红色发光边框 */...` |

#### `components/security_modal_scripts.html` (25 issues)

| Line | Text | Context |
|------|------|----------|
| 2 | 安全验证 | `安全验证 JavaScript 工具函数组件...` |
| 2 | 工具函数组件 | `安全验证 JavaScript 工具函数组件...` |
| 3 | 使用方法 | `使用方法: {% include "components/security_modal_scripts.html" %}...` |
| 5 | 提供的全局函数 | `提供的全局函数:...` |
| 6 | 获取或创建 | `- getModal(id): 获取或创建 Bootstrap Modal 实例...` |
| 6 | 实例 | `- getModal(id): 获取或创建 Bootstrap Modal 实例...` |
| 7 | 安全地隐藏 | `- safeHide(modalId): 安全地隐藏 Modal...` |
| 8 | 解析 | `- handleRawResponse(res): 解析 fetch 响应为 JSON 并附加状态码...` |
| 8 | 响应为 | `- handleRawResponse(res): 解析 fetch 响应为 JSON 并附加状态码...` |
| 8 | 并附加状态码 | `- handleRawResponse(res): 解析 fetch 响应为 JSON 并附加状态码...` |
| 9 | 显示成功 | `- showSuccess(msg): 显示成功 Modal...` |
| 10 | 显示错误 | `- showError(msg): 显示错误 Modal...` |
| 11 | 清空所有密码输入框 | `- clearPasswordInputs(): 清空所有密码输入框...` |
| 13 | 需要页面提前定义的全局变量 | `需要页面提前定义的全局变量:...` |
| 14 | 当前操作类型 | `- currentAction: 当前操作类型 (用于 submitWithPassword 判断)...` |
| 14 | 用于 | `- currentAction: 当前操作类型 (用于 submitWithPassword 判断)...` |
| 14 | 判断 | `- currentAction: 当前操作类型 (用于 submitWithPassword 判断)...` |
| 26 | 找不到元素 | `console.error('[getModal] 找不到元素:', id);...` |
| 89 | 处理 | `* 处理 API 响应...` |
| 89 | 响应 | `* 处理 API 响应...` |
| ... | *5 more items* | ... |

#### `components/security_password_modal.html` (14 issues)

| Line | Text | Context |
|------|------|----------|
| 2 | 密码验证 | `密码验证 Modal 组件...` |
| 2 | 组件 | `密码验证 Modal 组件...` |
| 3 | 使用方法 | `使用方法: {% include "components/security_password_modal.html" %...` |
| 5 | 依赖的 | `依赖的 JavaScript 函数 (需要在页面中定义):...` |
| 5 | 函数 | `依赖的 JavaScript 函数 (需要在页面中定义):...` |
| 5 | 需要在页面中定义 | `依赖的 JavaScript 函数 (需要在页面中定义):...` |
| 6 | 用户点击 | `- submitWithPassword(): 用户点击"验证并提交"时调用...` |
| 6 | 验证并提交 | `- submitWithPassword(): 用户点击"验证并提交"时调用...` |
| 6 | 时调用 | `- submitWithPassword(): 用户点击"验证并提交"时调用...` |
| 8 | 提供的元素 | `提供的元素 ID:...` |
| 9 | 本身 | `- passwordVerifyModal: Modal 本身...` |
| 10 | 密码输入框 | `- verify-sec-code-l0: 密码输入框...` |
| 11 | 错误信息显示区 | `- verify-error-msg: 错误信息显示区...` |
| 43 | 密码输入框聚焦效果 | `/* 密码输入框聚焦效果 */...` |

#### `components/security_success_modal.html` (23 issues)

| Line | Text | Context |
|------|------|----------|
| 2 | 操作成功 | `操作成功 Modal 组件...` |
| 2 | 组件 | `操作成功 Modal 组件...` |
| 3 | 使用方法 | `使用方法: {% include "components/security_success_modal.html" %}...` |
| 5 | 需要在页面中定义的回调函数 | `需要在页面中定义的回调函数 (可选):...` |
| 5 | 可选 | `需要在页面中定义的回调函数 (可选):...` |
| 6 | 点击 | `- onSuccessReturnHub(): 点击"返回"按钮时调用...` |
| 6 | 返回 | `- onSuccessReturnHub(): 点击"返回"按钮时调用...` |
| 6 | 按钮时调用 | `- onSuccessReturnHub(): 点击"返回"按钮时调用...` |
| 7 | 点击 | `- onSuccessContinue(): 点击"继续操作"按钮时调用...` |
| 7 | 继续操作 | `- onSuccessContinue(): 点击"继续操作"按钮时调用...` |
| 7 | 按钮时调用 | `- onSuccessContinue(): 点击"继续操作"按钮时调用...` |
| 9 | 如果不定义这些函数 | `如果不定义这些函数，默认行为是:...` |
| 9 | 默认行为是 | `如果不定义这些函数，默认行为是:...` |
| 10 | 返回 | `- 返回: location.reload()...` |
| 11 | 继续 | `- 继续: 关闭Modal...` |
| 11 | 关闭 | `- 继续: 关闭Modal...` |
| 13 | 提供的元素 | `提供的元素 ID:...` |
| 14 | 本身 | `- successModal: Modal 本身...` |
| 15 | 成功消息显示区 | `- success-msg-content: 成功消息显示区...` |
| 16 | 返回按钮 | `- success-btn-return: 返回按钮...` |
| ... | *3 more items* | ... |

#### `components/ua_modal_permissions.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 103 | 动态安全输入区域 | `{# [Fix] 动态安全输入区域 #}...` |

#### `components/ua_row_user.html` (20 issues)

| Line | Text | Context |
|------|------|----------|
| 2 | 用户名与头像 | `{# 1. 用户名与头像 #}...` |
| 21 | 角色标签 | `{# 2. 角色标签 #}...` |
| 29 | 最近登录 | `{# 3. 最近登录 #}...` |
| 38 | 失败次数 | `{# 4. 失败次数 #}...` |
| 47 | 操作按钮组 | `{# 5. 操作按钮组 #}...` |
| 51 | 职级变更按钮 | `{# [Restore] 职级变更按钮 #}...` |
| 54 | 受保护用户 | `{# 受保护用户: 显示灰色禁用箭头 #}...` |
| 54 | 显示灰色禁用箭头 | `{# 受保护用户: 显示灰色禁用箭头 #}...` |
| 62 | 普通用户 | `{# 普通用户: 显示彩色功能箭头 (Removed problematic disabled logic) #}...` |
| 62 | 显示彩色功能箭头 | `{# 普通用户: 显示彩色功能箭头 (Removed problematic disabled logic) #}...` |
| 81 | 权限配置按钮 | `{# 权限配置按钮 #}...` |
| 94 | 修改密码按钮 | `{# 修改密码按钮 #}...` |
| 102 | 锁定 | `{# 锁定/解锁按钮 #}...` |
| 102 | 解锁按钮 | `{# 锁定/解锁按钮 #}...` |
| 104 | 解锁按钮现在触发 | `{# [Fix] 解锁按钮现在触发 Modal，以便输入密码 #}...` |
| 104 | 以便输入密码 | `{# [Fix] 解锁按钮现在触发 Modal，以便输入密码 #}...` |
| 113 | 锁定按钮 | `{# 锁定按钮 #}...` |
| 123 | 删除按钮 | `{# 删除按钮 #}...` |
| 130 | 受保护用户 | `{# 受保护用户: 锁定与删除变灰 #}...` |
| 130 | 锁定与删除变灰 | `{# 受保护用户: 锁定与删除变灰 #}...` |


### 📁 db_admin/

#### `db_admin/dashboard.html` (11 issues)

| Line | Text | Context |
|------|------|----------|
| 10 | 管理系统备份 | `管理系统备份、恢复点以及数据生命周期策略。...` |
| 10 | 恢复点以及数据生命周期策略 | `管理系统备份、恢复点以及数据生命周期策略。...` |
| 241 | 个备份 | `共 <strong>{{ backups\|length }}</strong> 个备份...` |
| 307 | 无权限 | `title="无权限"><i class="fas fa-lock"></i></span>...` |
| 320 | 请前往 | `请前往「数据备份」创建您的第一个系统快照...` |
| 320 | 数据备份 | `请前往「数据备份」创建您的第一个系统快照...` |
| 320 | 创建您的第一个系统快照 | `请前往「数据备份」创建您的第一个系统快照...` |
| 441 | 必填 | `(必填)</label>...` |
| 445 | 例如 | `placeholder="例如：GDPR 请求编号 #1234 - 被遗忘权" required></textarea>...` |
| 445 | 请求编号 | `placeholder="例如：GDPR 请求编号 #1234 - 被遗忘权" required></textarea>...` |
| 445 | 被遗忘权 | `placeholder="例如：GDPR 请求编号 #1234 - 被遗忘权" required></textarea>...` |

#### `db_admin/data_change.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 9 | 库存调整 | `库存调整、成本管理和SKU维护。...` |
| 9 | 成本管理和 | `库存调整、成本管理和SKU维护。...` |
| 9 | 维护 | `库存调整、成本管理和SKU维护。...` |
| 21 | 数据修改中心 | `{% with hub_id="data-mod-hub" hub_items=hub_items module_ico...` |
| 89 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |
| 286 | 删除列 | `} else if (content.indexOf((window.i18n?.t('js.step_3') \|\| '...` |

#### `db_admin/hub.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 管理系统备份 | `管理系统备份、恢复点以及数据生命周期策略。...` |
| 15 | 恢复点以及数据生命周期策略 | `管理系统备份、恢复点以及数据生命周期策略。...` |

#### `db_admin/pages/backup.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 74 | 建议使用有意义的标签 | `建议使用有意义的标签，便于识别备份内容...` |
| 74 | 便于识别备份内容 | `建议使用有意义的标签，便于识别备份内容...` |
| 204 | 备份中 | `btn.innerHTML = '<span class="spinner-border spinner-border-...` |

#### `db_admin/pages/clean.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 127 | 验证数据 | `验证数据 <i class="fas fa-arrow-right ms-2"></i>...` |
| 330 | 日期范围 | `document.getElementById('verify-date-label').textContent = `...` |

#### `db_admin/pages/manage.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 111 | 全选 | `全选 / 取消...` |
| 111 | 取消 | `全选 / 取消...` |

#### `db_admin/pages/restore.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 67 | 正常 | `{% if backups %}正常{% else %}--{% endif %}...` |
| 201 | 恢复中 | `btn.innerHTML = '<span class="spinner-border spinner-border-...` |
| 225 | 确认恢复 | `btn.innerHTML = '<i class="fas fa-exclamation-triangle me-2"...` |

#### `db_admin/pages/rollback_restore.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 342 | 操作内容 | `const MSG_CONTENT = '{{ _("操作内容")\|escapejs }}';...` |
| 343 | 准备中 | `const MSG_PREPARING = '{{ _("准备中...")\|escapejs }}';...` |
| 344 | 执行中 | `const MSG_EXECUTING = '{{ _("执行中...")\|escapejs }}';...` |
| 345 | 校验中 | `const MSG_VERIFYING = '{{ _("校验中...")\|escapejs }}';...` |
| 346 | 完成 | `const MSG_COMPLETE = '{{ _('完成')\|escapejs }}';...` |
| 347 | 网络错误 | `const MSG_NETWORK_ERROR = '{{ _('网络错误，请重试')\|escapejs }}';...` |
| 347 | 请重试 | `const MSG_NETWORK_ERROR = '{{ _('网络错误，请重试')\|escapejs }}';...` |
| 348 | 回档执行失败 | `const MSG_EXEC_FAIL = '{{ _("回档执行失败")\|escapejs }}';...` |
| 349 | 涉及数据表 | `const MSG_AFFECTED_TABLES = '{{ _("涉及数据表")\|escapejs }}';...` |
| 500 | 执行数据回档 | `'{{ _("执行数据回档")\|escapejs }}',...` |

#### `db_admin/partials/cogs_table_create.html` (14 issues)

| Line | Text | Context |
|------|------|----------|
| 9 | 将作为最新月份的初始库存值 | `Initial_Qty 将作为最新月份的初始库存值。...` |
| 372 | 必须为正数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Cost 必须为正数，最多2位小...` |
| 372 | 最多 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Cost 必须为正数，最多2位小...` |
| 372 | 位小数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Cost 必须为正数，最多2位小...` |
| 377 | 必须为正数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Freight 必须为正数，最多...` |
| 377 | 最多 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Freight 必须为正数，最多...` |
| 377 | 位小数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Freight 必须为正数，最多...` |
| 382 | 必须为大于 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Weight 必须为大于0的正整...` |
| 382 | 的正整数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Weight 必须为大于0的正整...` |
| 388 | 必须为大于等于 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Initial Qty 必须为大...` |
| 388 | 的整数 | `missingFields.push(`第 ${rowNum} 行 (${sku}): Initial Qty 必须为大...` |
| 398 | 批次内重复 | `duplicateSkus.push(`${sku} (批次内重复)`);...` |
| 433 | 重复 | `showErrorModal('SKU 重复', duplicateSkus.map(s => `SKU "${s}" ...` |
| 433 | 已存在于数据库中 | `showErrorModal('SKU 重复', duplicateSkus.map(s => `SKU "${s}" ...` |

#### `db_admin/partials/cogs_table_edit.html` (11 issues)

| Line | Text | Context |
|------|------|----------|
| 10 | 完成编辑后点击 | `完成编辑后点击「保存更改」按钮。...` |
| 10 | 保存更改 | `完成编辑后点击「保存更改」按钮。...` |
| 10 | 按钮 | `完成编辑后点击「保存更改」按钮。...` |
| 157 | 必须为正数 | `errors.push(`SKU ${sku}: Cost 必须为正数，最多2位小数`);...` |
| 157 | 最多 | `errors.push(`SKU ${sku}: Cost 必须为正数，最多2位小数`);...` |
| 157 | 位小数 | `errors.push(`SKU ${sku}: Cost 必须为正数，最多2位小数`);...` |
| 160 | 必须为正数 | `errors.push(`SKU ${sku}: Freight 必须为正数，最多2位小数`);...` |
| 160 | 最多 | `errors.push(`SKU ${sku}: Freight 必须为正数，最多2位小数`);...` |
| 160 | 位小数 | `errors.push(`SKU ${sku}: Freight 必须为正数，最多2位小数`);...` |
| 163 | 必须为大于 | `errors.push(`SKU ${sku}: Weight 必须为大于0的正整数`);...` |
| 163 | 的正整数 | `errors.push(`SKU ${sku}: Weight 必须为大于0的正整数`);...` |

#### `db_admin/partials/cogs_table_only.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 3 | 产品数据维护向导专用表格 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 3 | 仅包含纯表格编辑区 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 3 | 无按钮 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 3 | 无验证 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 3 | 用于 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 3 | 向导 | `{# 产品数据维护向导专用表格 partial 仅包含纯表格编辑区，无按钮/无验证UI 用于 products/page...` |
| 73 | 未找到产品数据 | `<i class="fas fa-exclamation-triangle me-2"></i> 未找到产品数据。...` |

#### `db_admin/partials/wizard_step_1.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 31 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |


### 📁 etl/

#### `etl/partials/inv_confirm_upload.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 29 | 已应用 | `<small>已应用 <strong>{{ corrections_applied }}</strong> 个 SKU ...` |
| 29 | 修正 | `<small>已应用 <strong>{{ corrections_applied }}</strong> 个 SKU ...` |
| 58 | 取消 | `取消...` |

#### `etl/partials/inv_done.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 7 | 已记录 | `已记录 <strong>{{ target_date }}</strong> 的盘存记录，共 <strong>{{ ro...` |
| 7 | 的盘存记录 | `已记录 <strong>{{ target_date }}</strong> 的盘存记录，共 <strong>{{ ro...` |

#### `etl/partials/inv_overwrite_confirm.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 数据库中已存在 | `数据库中已存在 <code class="text-warning fw-bold px-2">{{ target_da...` |
| 15 | 日期列 | `数据库中已存在 <code class="text-warning fw-bold px-2">{{ target_da...` |

#### `etl/partials/inv_validate_result.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 26 | 数据预览 | `数据预览 (全部 {{ row_count }} 行，可滚动查看):...` |
| 26 | 全部 | `数据预览 (全部 {{ row_count }} 行，可滚动查看):...` |
| 26 | 可滚动查看 | `数据预览 (全部 {{ row_count }} 行，可滚动查看):...` |
| 63 | 目标日期列 | `目标日期列: <code>{{ target_date }}</code>...` |
| 74 | 取消 | `取消...` |
| 199 | 下一个 | `下一个<i class="fa-solid fa-chevron-right ms-1"></i>...` |

#### `etl/partials/step_clean.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 9 | 数据清洗 | `Step 3: 数据清洗 (Clean) - 待处理: {{ pending_count }}...` |
| 9 | 待处理 | `Step 3: 数据清洗 (Clean) - 待处理: {{ pending_count }}...` |
| 25 | 异常 | `异常 SKU: <code>{{ pending_item.bad_sku }}</code>...` |

#### `etl/partials/step_done.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 221 | 未知商品 | `<i class="fa-solid fa-tag me-2"></i>{% firstof group.grouper...` |

#### `etl/partials/step_parse.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 20 | 文件已摄入数据库 | `文件已摄入数据库。点击下方按钮启动解析引擎，系统将自动提取 SKU 和数量信息。...` |
| 20 | 点击下方按钮启动解析引擎 | `文件已摄入数据库。点击下方按钮启动解析引擎，系统将自动提取 SKU 和数量信息。...` |
| 20 | 系统将自动提取 | `文件已摄入数据库。点击下方按钮启动解析引擎，系统将自动提取 SKU 和数量信息。...` |
| 20 | 和数量信息 | `文件已摄入数据库。点击下方按钮启动解析引擎，系统将自动提取 SKU 和数量信息。...` |

#### `etl/partials/step_transform.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 将清洗后的数据写入销售数据库 | `将清洗后的数据写入销售数据库，此操作会修改数据库记录。...` |
| 15 | 此操作会修改数据库记录 | `将清洗后的数据写入销售数据库，此操作会修改数据库记录。...` |
| 23 | 入库后数据将与现有数据合并 | `入库后数据将与现有数据合并，重复记录会被自动识别处理。...` |
| 23 | 重复记录会被自动识别处理 | `入库后数据将与现有数据合并，重复记录会被自动识别处理。...` |
| 34 | 确认入库 | `<i class="fas fa-database text-primary me-2"></i>Step 5: 确认入...` |

#### `etl/partials/step_upload.html` (21 issues)

| Line | Text | Context |
|------|------|----------|
| 14 | 上传 | `上传 eBay 导出的 Transaction Report 或 Order Earnings Report CSV 文...` |
| 14 | 导出的 | `上传 eBay 导出的 Transaction Report 或 Order Earnings Report CSV 文...` |
| 14 | 文件 | `上传 eBay 导出的 Transaction Report 或 Order Earnings Report CSV 文...` |
| 14 | 系统将自动识别文件类型并进行后续处理 | `上传 eBay 导出的 Transaction Report 或 Order Earnings Report CSV 文...` |
| 18 | 仅支持 | `仅支持 .csv 格式文件，可同时上传多个文件（拖拽或点击选择）。...` |
| 18 | 格式文件 | `仅支持 .csv 格式文件，可同时上传多个文件（拖拽或点击选择）。...` |
| 18 | 可同时上传多个文件 | `仅支持 .csv 格式文件，可同时上传多个文件（拖拽或点击选择）。...` |
| 18 | 拖拽或点击选择 | `仅支持 .csv 格式文件，可同时上传多个文件（拖拽或点击选择）。...` |
| 22 | 文件过大 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 22 | 格式错误 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 22 | 编码异常 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 22 | 系统会在 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 22 | 检验 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 22 | 步骤给出详细错误说明 | `文件过大/格式错误/编码异常 → 系统会在"检验"步骤给出详细错误说明。...` |
| 46 | 数据上传 | `<i class="fas fa-cloud-upload-alt text-info me-2"></i>Step 1...` |
| 86 | 设置退货 | `设置退货/取消时，实际回库的商品比例。例如 60% 表示退货商品中有 60% 可二次销售。...` |
| 86 | 取消时 | `设置退货/取消时，实际回库的商品比例。例如 60% 表示退货商品中有 60% 可二次销售。...` |
| 86 | 实际回库的商品比例 | `设置退货/取消时，实际回库的商品比例。例如 60% 表示退货商品中有 60% 可二次销售。...` |
| 86 | 例如 | `设置退货/取消时，实际回库的商品比例。例如 60% 表示退货商品中有 60% 可二次销售。...` |
| 86 | 表示退货商品中有 | `设置退货/取消时，实际回库的商品比例。例如 60% 表示退货商品中有 60% 可二次销售。...` |
| ... | *1 more items* | ... |

#### `etl/partials/step_validate.html` (14 issues)

| Line | Text | Context |
|------|------|----------|
| 14 | 系统自动检查上传文件的格式 | `系统自动检查上传文件的格式、编码、必要列是否完整，并识别文件类型（Transaction/Earning）。...` |
| 14 | 编码 | `系统自动检查上传文件的格式、编码、必要列是否完整，并识别文件类型（Transaction/Earning）。...` |
| 14 | 必要列是否完整 | `系统自动检查上传文件的格式、编码、必要列是否完整，并识别文件类型（Transaction/Earning）。...` |
| 14 | 并识别文件类型 | `系统自动检查上传文件的格式、编码、必要列是否完整，并识别文件类型（Transaction/Earning）。...` |
| 18 | 文件类型 | `文件类型 → CSV 格式 → 编码（UTF-8/GBK）→ 必要列存在 → 数据完整性...` |
| 18 | 格式 | `文件类型 → CSV 格式 → 编码（UTF-8/GBK）→ 必要列存在 → 数据完整性...` |
| 18 | 编码 | `文件类型 → CSV 格式 → 编码（UTF-8/GBK）→ 必要列存在 → 数据完整性...` |
| 18 | 必要列存在 | `文件类型 → CSV 格式 → 编码（UTF-8/GBK）→ 必要列存在 → 数据完整性...` |
| 18 | 数据完整性 | `文件类型 → CSV 格式 → 编码（UTF-8/GBK）→ 必要列存在 → 数据完整性...` |
| 22 | 检验失败时请查看下方错误详情 | `检验失败时请查看下方错误详情，修正文件后重新上传。...` |
| 22 | 修正文件后重新上传 | `检验失败时请查看下方错误详情，修正文件后重新上传。...` |
| 32 | 文件检验 | `<i class="fas fa-check-circle text-warning me-2"></i>Step 2:...` |
| 58 | 类型 | `类型: <span class="text-info">{{ file.type }}</span> \|...` |
| 59 | 行数 | `行数: <span class="text-info">{{ file.rows }}</span>...` |


### 📁 finance/

#### `finance/hub.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 财务管理与费用结算 | `财务管理与费用结算：物流费用管理、付款追踪。...` |
| 15 | 物流费用管理 | `财务管理与费用结算：物流费用管理、付款追踪。...` |
| 15 | 付款追踪 | `财务管理与费用结算：物流费用管理、付款追踪。...` |

#### `finance/pages/deposit.html` (13 issues)

| Line | Text | Context |
|------|------|----------|
| 193 | 表格容器 | `/* 表格容器 */...` |
| 209 | 表头 | `/* 表头 */...` |
| 229 | 数据行 | `/* 数据行 */...` |
| 255 | 订货单号加粗 | `/* 订货单号加粗 */...` |
| 262 | 金额样式 | `/* 金额样式 */...` |
| 283 | 付款状态标签 | `/* 付款状态标签 */...` |
| 311 | 已付款九宫格 | `/* 已付款九宫格 */...` |
| 369 | 会计风格对齐容器 | `/* 会计风格对齐容器 */...` |
| 390 | 供应商分块容器 | `/* 供应商分块容器 */...` |
| 469 | 表格行选中样式 | `/* 表格行选中样式 */...` |
| 488 | 向导容器 | `/* 向导容器 */...` |
| 790 | 当前选中的供应商代码 | `var currentSupplierCode = null;  // 当前选中的供应商代码...` |
| 791 | 当前选中的已付供应商代码 | `var activePaidSupplierCode = null; // 当前选中的已付供应商代码...` |

#### `finance/pages/flow.html` (27 issues)

| Line | Text | Context |
|------|------|----------|
| 104 | 表格容器 | `/* 表格容器 - 复用 PO 模块风格 */...` |
| 104 | 复用 | `/* 表格容器 - 复用 PO 模块风格 */...` |
| 104 | 模块风格 | `/* 表格容器 - 复用 PO 模块风格 */...` |
| 121 | 表头 | `/* 表头 */...` |
| 141 | 数据行 | `/* 数据行 */...` |
| 167 | 订单号加粗 | `/* 订单号加粗 */...` |
| 176 | 订单总成本高亮 | `/* 订单总成本高亮 */...` |
| 181 | 货款剩余高亮 | `/* 货款剩余高亮 */...` |
| 186 | 展开按钮 | `/* 展开按钮 */...` |
| 208 | 展开行 | `/* 展开行 */...` |
| 226 | 金额样式 | `/* 金额样式 */...` |
| 269 | 物流单号标签 | `/* 物流单号标签 */...` |
| 281 | 付款状态图标 | `/* 付款状态图标 */...` |
| 301 | 详情卡片 | `/* 详情卡片 */...` |
| 314 | 详情块 | `/* 详情块 - 物流SKU表格 */...` |
| 314 | 物流 | `/* 详情块 - 物流SKU表格 */...` |
| 314 | 表格 | `/* 详情块 - 物流SKU表格 */...` |
| 373 | 条订单 | `document.getElementById('flow-footer-count').textContent = (...` |
| 573 | 加载物流单详情 | `'<i class="fas fa-spinner fa-spin me-2"></i>加载物流单详情...' +...` |
| 641 | 暂无物流单详情 | `return '<div class="text-white-50 text-center py-3"><i class...` |
| ... | *7 more items* | ... |

#### `finance/pages/logistic.html` (26 issues)

| Line | Text | Context |
|------|------|----------|
| 219 | 向导容器 | `/* 向导容器 - 确保内容占满宽度 */...` |
| 219 | 确保内容占满宽度 | `/* 向导容器 - 确保内容占满宽度 */...` |
| 238 | 表格容器 | `/* 表格容器 */...` |
| 254 | 表头 | `/* 表头 */...` |
| 284 | 数据行 | `/* 数据行 */...` |
| 311 | 金额数值样式 | `/* 金额数值样式 - 与 deposit.html 完全一致 */...` |
| 311 | 完全一致 | `/* 金额数值样式 - 与 deposit.html 完全一致 */...` |
| 313 | 对齐 | `font-weight: 600; /* 对齐 deposit: 600 weight */...` |
| 315 | 继承 | `/* font-size 继承 td 的 12px */...` |
| 333 | 物流单号加粗 | `/* 物流单号加粗 */...` |
| 340 | 付款状态标签 | `/* 付款状态标签 */...` |
| 362 | 已付款行不可选 | `/* 已付款行不可选 */...` |
| 368 | 子单行样式 | `/* 子单行样式 */...` |
| 389 | 付款批次卡片样式 | `/* 付款批次卡片样式 */...` |
| 428 | 付款九宫格样式 | `/* ===== 付款九宫格样式 ===== */...` |
| 436 | 同一行卡片等高 | `align-items: stretch;  /* 同一行卡片等高 */...` |
| 539 | 填充剩余空间 | `flex: 1;  /* 填充剩余空间，使卡片等高 */...` |
| 539 | 使卡片等高 | `flex: 1;  /* 填充剩余空间，使卡片等高 */...` |
| 602 | 自动推到底部 | `margin-top: auto;  /* 自动推到底部 */...` |
| 1002 | 会计风格对齐容器 | `/* 会计风格对齐容器 */...` |
| ... | *6 more items* | ... |

#### `finance/pages/partials/deposit_file_viewer.html` (18 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 关闭文件视图 | `* 关闭文件视图...` |
| 31 | 查看付款文件 | `* 查看付款文件...` |
| 63 | 显示文件查看器 | `* 显示文件查看器...` |
| 73 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 76 | 付款回执查看 | `<h5 class="text-white mb-0"><i class="fas fa-file-invoice te...` |
| 85 | 上传文件 | `<i class="fas fa-upload me-2"></i>上传文件...` |
| 126 | 上传付款文件 | `* 上传付款文件（向导流程）...` |
| 126 | 向导流程 | `* 上传付款文件（向导流程）...` |
| 168 | 关闭上传向导 | `* 关闭上传向导...` |
| 183 | 简化的上传向导 | `* 简化的上传向导（降级方案）...` |
| 183 | 降级方案 | `* 简化的上传向导（降级方案）...` |
| 193 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 197 | 上传付款回执 | `<i class="fas fa-upload text-info me-2"></i>上传付款回执...` |
| 210 | 取消 | `取消...` |
| 213 | 上传 | `<i class="fas fa-upload me-2"></i>上传...` |
| 236 | 提交文件上传 | `* 提交文件上传...` |
| 277 | 上传中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |
| 323 | 获取 | `* 获取 CSRF Token...` |

#### `finance/pages/partials/deposit_history_view.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 63 | 查看定金历史记录 | `* 查看定金历史记录...` |
| 64 | 付款单号 | `* @param {string} pmtNo - 付款单号...` |
| 65 | 订货单号 | `* @param {string} poNum - 订货单号 (Context)...` |
| 78 | 付款单号 | `document.getElementById('deposit-history-pmt-label').innerHT...` |
| 78 | 订单 | `document.getElementById('deposit-history-pmt-label').innerHT...` |
| 107 | 网络错误 | `const errHtml = `<div class="text-center py-4 text-danger"><...` |
| 148 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |
| 233 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |

#### `finance/pages/partials/deposit_orders_view.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 35 | 查看付款批次关联的订单 | `* 查看付款批次关联的订单...` |
| 43 | 付款单号 | `document.getElementById('deposit-orders-pmt-label').textCont...` |
| 258 | 关闭订单视图 | `* 关闭订单视图...` |

#### `finance/pages/partials/deposit_step1_intro.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 224 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |

#### `finance/pages/partials/deposit_step2_rate.html` (16 issues)

| Line | Text | Context |
|------|------|----------|
| 362 | 费用内容 | `费用内容 <span class="text-danger">*</span>...` |
| 373 | 结算币种 | `结算币种 <span class="text-danger">*</span>...` |
| 383 | 费用金额 | `费用金额 <span class="text-danger">*</span>...` |
| 432 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |
| 444 | 是否按付款日结算 | `usePaymentDateRate: false,   // 是否按付款日结算...` |
| 445 | 付款日期 | `paymentDate: '',             // 付款日期...` |
| 446 | 结算汇率 | `settlementRate: 0,           // 结算汇率...` |
| 447 | 汇率来源 | `rateSource: 'original',      // 汇率来源: original(原始), auto(自动获...` |
| 447 | 原始 | `rateSource: 'original',      // 汇率来源: original(原始), auto(自动获...` |
| 447 | 自动获取 | `rateSource: 'original',      // 汇率来源: original(原始), auto(自动获...` |
| 447 | 手动填写 | `rateSource: 'original',      // 汇率来源: original(原始), auto(自动获...` |
| 448 | 原始汇率 | `originalRates: {}            // 原始汇率 { po_num: rate }...` |
| 899 | 原始 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 899 | 自动 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 997 | 定金待付全额 | `定金待付全额 ${cur === 'RMB' ? `<span class="opacity-50 ms-1">≈ $$...` |
| 1173 | 支付金额不能超过订单待付总额 | `createAndShowToast(`支付金额不能超过订单待付总额 (${cur} ${formatNumber(ma...` |

#### `finance/pages/partials/deposit_step3_confirm.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 28 | 完成交易 | `完成交易。提交后定金记录即时生效。</span>...` |
| 28 | 提交后定金记录即时生效 | `完成交易。提交后定金记录即时生效。</span>...` |
| 783 | 原始 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 783 | 自动 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 858 | 支付金额超过订单总额 | `nextBtn.innerHTML = '<i class="fas fa-ban me-2"></i>支付金额超过订单...` |
| 865 | 确认付款 | `nextBtn.innerHTML = '<i class="fas fa-check me-2"></i>确认付款';...` |
| 1018 | 处理中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |

#### `finance/pages/partials/payment_history_view.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 64 | 历史记录卡片样式 | `/* 历史记录卡片样式（与订单管理一致） */...` |
| 64 | 与订单管理一致 | `/* 历史记录卡片样式（与订单管理一致） */...` |

#### `finance/pages/partials/payment_step1_intro.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 11 | 您即将对以下选中的物流单进行运费结算 | `您即将对以下选中的物流单进行运费结算。...` |

#### `finance/pages/partials/payment_step2_preview.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 225 | 是否按付款日结算 | `usePaymentDateRate: false,   // 是否按付款日结算...` |
| 226 | 付款日期 | `paymentDate: '',              // 付款日期...` |
| 227 | 结算汇率 | `settlementRate: 0,            // 结算汇率...` |
| 228 | 汇率来源 | `rateSource: 'original',       // 汇率来源: original(原始), auto(自动...` |
| 228 | 原始 | `rateSource: 'original',       // 汇率来源: original(原始), auto(自动...` |
| 228 | 自动获取 | `rateSource: 'original',       // 汇率来源: original(原始), auto(自动...` |
| 228 | 手动填写 | `rateSource: 'original',       // 汇率来源: original(原始), auto(自动...` |
| 229 | 原始汇率 | `originalRates: {}             // 原始汇率 { logistic_num: rate }...` |
| 443 | 已将汇率 | `createAndShowToast(`已将汇率 ${rate.toFixed(4)} 应用到所有物流单`, 'succ...` |
| 443 | 应用到所有物流单 | `createAndShowToast(`已将汇率 ${rate.toFixed(4)} 应用到所有物流单`, 'succ...` |

#### `finance/pages/partials/payment_step3_confirm.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 103 | 可上传付款回执 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 103 | 银行转账凭证等文件 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 103 | 支持 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 103 | 图片 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 103 | 格式 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 103 | 最大 | `可上传付款回执/银行转账凭证等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 310 | 没有选择文件 | `if (!file) return;  // 没有选择文件，跳过...` |
| 310 | 跳过 | `if (!file) return;  // 没有选择文件，跳过...` |
| 376 | 处理中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |

#### `finance/pages/partials/po_file_viewer.html` (18 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 关闭文件视图 | `* 关闭文件视图...` |
| 26 | 查看付款文件 | `* 查看付款文件...` |
| 58 | 显示文件查看器 | `* 显示文件查看器...` |
| 68 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 71 | 付款回执查看 | `<h5 class="text-white mb-0"><i class="fas fa-file-invoice te...` |
| 80 | 上传文件 | `<i class="fas fa-upload me-2"></i>上传文件...` |
| 121 | 上传付款文件 | `* 上传付款文件（向导流程）...` |
| 121 | 向导流程 | `* 上传付款文件（向导流程）...` |
| 163 | 关闭上传向导 | `* 关闭上传向导...` |
| 173 | 简化的上传向导 | `* 简化的上传向导（降级方案）...` |
| 173 | 降级方案 | `* 简化的上传向导（降级方案）...` |
| 183 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 187 | 上传付款回执 | `<i class="fas fa-upload text-info me-2"></i>上传付款回执...` |
| 200 | 取消 | `取消...` |
| 203 | 上传 | `<i class="fas fa-upload me-2"></i>上传...` |
| 226 | 提交文件上传 | `* 提交文件上传...` |
| 267 | 上传中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |
| 313 | 获取 | `* 获取 CSRF Token...` |

#### `finance/pages/partials/po_history_view.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 63 | 查看定金历史记录 | `* 查看定金历史记录...` |
| 64 | 付款单号 | `* @param {string} pmtNo - 付款单号...` |
| 65 | 订货单号 | `* @param {string} poNum - 订货单号 (Context)...` |
| 78 | 付款单号 | `document.getElementById('deposit-history-pmt-label').innerHT...` |
| 78 | 订单 | `document.getElementById('deposit-history-pmt-label').innerHT...` |
| 107 | 网络错误 | `const errHtml = `<div class="text-center py-4 text-danger"><...` |
| 148 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |
| 233 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |

#### `finance/pages/partials/po_orders_view.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 35 | 查看付款批次关联的订单 | `* 查看付款批次关联的订单...` |
| 43 | 付款单号 | `document.getElementById('deposit-orders-pmt-label').textCont...` |
| 258 | 关闭订单视图 | `* 关闭订单视图...` |

#### `finance/pages/partials/po_payment_file_viewer.html` (21 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 关闭 | `* 关闭PO Payment文件视图...` |
| 15 | 文件视图 | `* 关闭PO Payment文件视图...` |
| 31 | 查看 | `* 查看PO付款文件...` |
| 31 | 付款文件 | `* 查看PO付款文件...` |
| 63 | 显示 | `* 显示PO Payment文件查看器...` |
| 63 | 文件查看器 | `* 显示PO Payment文件查看器...` |
| 73 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 76 | 付款回执查看 | `<h5 class="text-white mb-0"><i class="fas fa-file-invoice te...` |
| 85 | 上传文件 | `<i class="fas fa-upload me-2"></i>上传文件...` |
| 126 | 上传 | `* 上传PO付款文件...` |
| 126 | 付款文件 | `* 上传PO付款文件...` |
| 144 | 关闭上传向导 | `* 关闭上传向导...` |
| 159 | 简化的上传向导 | `* 简化的上传向导...` |
| 169 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 173 | 上传付款回执 | `<i class="fas fa-upload text-info me-2"></i>上传付款回执...` |
| 186 | 取消 | `取消...` |
| 189 | 上传 | `<i class="fas fa-upload me-2"></i>上传...` |
| 212 | 提交 | `* 提交PO文件上传...` |
| 212 | 文件上传 | `* 提交PO文件上传...` |
| 253 | 上传中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |
| ... | *1 more items* | ... |

#### `finance/pages/partials/po_payment_history_view.html` (11 issues)

| Line | Text | Context |
|------|------|----------|
| 77 | 查看 | `* 查看 PO 全流程历史记录 (3栏)...` |
| 77 | 全流程历史记录 | `* 查看 PO 全流程历史记录 (3栏)...` |
| 78 | 订单号 | `* @param {string} poNum - 订单号...` |
| 79 | 付款单号 | `* @param {string} pmtNo - 付款单号 (可选)...` |
| 79 | 可选 | `* @param {string} pmtNo - 付款单号 (可选)...` |
| 91 | 订单号 | `let labelHtml = `订单号: <span class="font-monospace text-info"...` |
| 93 | 付款单 | `labelHtml += ` <span class="mx-2">\|</span> 付款单: <span class=...` |
| 130 | 网络错误 | `const errHtml = `<div class="text-center py-4 text-danger"><...` |
| 177 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |
| 263 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |
| 366 | 操作人 | `<i class="fas fa-user-circle me-1"></i> 操作人: <span class="te...` |

#### `finance/pages/partials/po_payment_orders_view.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 35 | 查看 | `* 查看PO Payment批次关联的订单...` |
| 35 | 批次关联的订单 | `* 查看PO Payment批次关联的订单...` |
| 43 | 付款单号 | `document.getElementById('po-payment-orders-pmt-label').textC...` |
| 280 | 关闭 | `* 关闭PO Payment订单视图...` |
| 280 | 订单视图 | `* 关闭PO Payment订单视图...` |

#### `finance/pages/partials/po_step1_intro.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 224 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |

#### `finance/pages/partials/po_step2_rate.html` (26 issues)

| Line | Text | Context |
|------|------|----------|
| 362 | 费用内容 | `费用内容 <span class="text-danger">*</span>...` |
| 373 | 结算币种 | `结算币种 <span class="text-danger">*</span>...` |
| 383 | 费用金额 | `费用金额 <span class="text-danger">*</span>...` |
| 432 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |
| 444 | 必须按付款日结算 | `usePaymentDateRate: true,    // 必须按付款日结算（强制开启）...` |
| 444 | 强制开启 | `usePaymentDateRate: true,    // 必须按付款日结算（强制开启）...` |
| 445 | 付款日期 | `paymentDate: '',             // 付款日期...` |
| 446 | 结算汇率 | `settlementRate: 0,           // 结算汇率...` |
| 447 | 汇率来源 | `rateSource: 'auto',          // 汇率来源: auto(自动获取), manual(手动填...` |
| 447 | 自动获取 | `rateSource: 'auto',          // 汇率来源: auto(自动获取), manual(手动填...` |
| 447 | 手动填写 | `rateSource: 'auto',          // 汇率来源: auto(自动获取), manual(手动填...` |
| 448 | 原始汇率 | `originalRates: {}            // 原始汇率 { po_num: rate }...` |
| 493 | 默认自动获取 | `item._rateSource = 'auto'; // 默认自动获取（开关始终开启）...` |
| 493 | 开关始终开启 | `item._rateSource = 'auto'; // 默认自动获取（开关始终开启）...` |
| 724 | 订单总金额 | `totalDepositUSD += total;  // 订单总金额...` |
| 726 | 已付金额 | `totalPaidUSD += paidAmount;  // 已付金额(定金+货款)...` |
| 726 | 定金 | `totalPaidUSD += paidAmount;  // 已付金额(定金+货款)...` |
| 726 | 货款 | `totalPaidUSD += paidAmount;  // 已付金额(定金+货款)...` |
| 729 | 订单总金额 | `totalDepositRMB += total;  // 订单总金额...` |
| 731 | 已付金额 | `totalPaidRMB += paidAmount;  // 已付金额(定金+货款)...` |
| ... | *6 more items* | ... |

#### `finance/pages/partials/po_step3_confirm.html` (13 issues)

| Line | Text | Context |
|------|------|----------|
| 28 | 完成交易 | `完成交易。提交后付款记录即时生效。</span>...` |
| 28 | 提交后付款记录即时生效 | `完成交易。提交后付款记录即时生效。</span>...` |
| 593 | 订单总金额 | `totalDepositUSD += totalAmount;  // 订单总金额...` |
| 595 | 已付金额 | `totalPaidUSD += paidAmount;  // 已付金额...` |
| 616 | 订单总金额 | `totalDepositRMB += totalAmount;  // 订单总金额...` |
| 618 | 已付金额 | `totalPaidRMB += paidAmount;  // 已付金额...` |
| 794 | 原始 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 794 | 自动 | `const txt = isAuto ? '原始 (自动)' : (window.i18n?.t('js.origina...` |
| 869 | 支付金额超过订单总额 | `nextBtn.innerHTML = '<i class="fas fa-ban me-2"></i>支付金额超过订单...` |
| 876 | 确认付款 | `nextBtn.innerHTML = '<i class="fas fa-check me-2"></i>确认付款';...` |
| 1026 | 处理中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |
| 1078 | 尾款剩余 | `_payAmount: item.balance_remaining \|\| 0  // 尾款剩余 = 待支付金额...` |
| 1078 | 待支付金额 | `_payAmount: item.balance_remaining \|\| 0  // 尾款剩余 = 待支付金额...` |

#### `finance/pages/partials/po_step4_complete.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 312 | 分割线 | `/* 分割线 */...` |
| 335 | 付款明细行 | `/* 付款明细行 */...` |
| 401 | 付款信息 | `/* 付款信息 */...` |
| 432 | 付款单号追踪 | `/* 付款单号追踪 */...` |

#### `finance/pages/partials/prepay_file_view.html` (18 issues)

| Line | Text | Context |
|------|------|----------|
| 16 | 关闭文件视图 | `* 关闭文件视图...` |
| 28 | 查看付款文件 | `* 查看付款文件...` |
| 65 | 显示文件查看器 | `* 显示文件查看器...` |
| 85 | 刷新文件列表 | `onDeleteSuccess: () => viewPrepayFile(tranNum),  // 刷新文件列表...` |
| 104 | 上传付款文件 | `* 上传付款文件（向导流程）...` |
| 104 | 向导流程 | `* 上传付款文件（向导流程）...` |
| 150 | 关闭上传向导 | `* 关闭上传向导...` |
| 160 | 简化的上传向导 | `* 简化的上传向导（降级方案）...` |
| 160 | 降级方案 | `* 简化的上传向导（降级方案）...` |
| 170 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |
| 174 | 上传付款文件 | `<i class="fas fa-upload text-info me-2"></i>上传付款文件...` |
| 187 | 取消 | `取消...` |
| 190 | 上传 | `<i class="fas fa-upload me-2"></i>上传...` |
| 213 | 提交文件上传 | `* 提交文件上传...` |
| 256 | 上传中 | `btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...` |
| 303 | 获取 | `* 获取 CSRF Token...` |
| 311 | 打开文件视图 | `* 打开文件视图（兼容旧调用）...` |
| 311 | 兼容旧调用 | `* 打开文件视图（兼容旧调用）...` |

#### `finance/pages/partials/prepay_history_view.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 218 | 生效 | `html += '<div class="text-white-50 small mt-1"><i class="fas...` |
| 330 | 删除 | `badgeHtml = '<span class="badge bg-danger"><i class="fas fa-...` |
| 333 | 恢复 | `badgeHtml = '<span class="badge bg-success"><i class="fas fa...` |
| 360 | 记录已删除 | `html += '<div class="text-danger small"><i class="fas fa-exc...` |
| 362 | 记录已恢复 | `html += '<div class="text-success small"><i class="fas fa-ch...` |

#### `finance/pages/partials/prepay_step1_intro.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 11 | 供应商预付款是您预先存入供应商账户的资金 | `供应商预付款是您预先存入供应商账户的资金，用于后续与该供应商的交易结算。...` |
| 11 | 用于后续与该供应商的交易结算 | `供应商预付款是您预先存入供应商账户的资金，用于后续与该供应商的交易结算。...` |
| 31 | 若您的付款货币与供应商结算货币不同 | `若您的付款货币与供应商结算货币不同，系统会按照<strong class="text-warning"...` |
| 31 | 系统会按照 | `若您的付款货币与供应商结算货币不同，系统会按照<strong class="text-warning"...` |
| 36 | 的基准 | `USD</strong> 的基准。...` |
| 74 | 若需删除记录 | `若需删除记录，删除操作也会被记录在案，确保审计追溯的完整性。...` |
| 74 | 删除操作也会被记录在案 | `若需删除记录，删除操作也会被记录在案，确保审计追溯的完整性。...` |
| 74 | 确保审计追溯的完整性 | `若需删除记录，删除操作也会被记录在案，确保审计追溯的完整性。...` |

#### `finance/pages/partials/prepay_step2_form.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 68 | 预付款日期 | `预付款日期 <i class="fas fa-info-circle ms-1"></i> <span class="t...` |
| 81 | 预付款货币 | `预付款货币 <i class="fas fa-info-circle ms-1"></i> <span class="t...` |
| 96 | 预付款金额 | `预付款金额 <i class="fas fa-info-circle ms-1"></i> <span class="t...` |
| 114 | 结算汇率 | `结算汇率(USD/RMB) <i class="fas fa-info-circle ms-1"></i> <span ...` |
| 123 | 预付款备注 | `预付款备注 <i class="fas fa-info-circle ms-1"></i> <span class="t...` |

#### `finance/pages/partials/prepay_wizard.html` (39 issues)

| Line | Text | Context |
|------|------|----------|
| 59 | 打开预付款向导 | `* 打开预付款向导...` |
| 101 | 关闭预付款向导 | `* 关闭预付款向导...` |
| 115 | 关闭向导并刷新 | `* 关闭向导并刷新...` |
| 128 | 初始化预付款向导 | `* 初始化预付款向导...` |
| 187 | 初始化预付款汇率组件 | `* 初始化预付款汇率组件...` |
| 219 | 绑定向导按钮事件 | `* 绑定向导按钮事件...` |
| 239 | 预付款日期变更 | `* 预付款日期变更...` |
| 252 | 汇率输入变化 | `* 汇率输入变化...` |
| 259 | 自动获取汇率 | `* 自动获取汇率...` |
| 269 | 更新汇率来源标签 | `* 更新汇率来源标签...` |
| 276 | 验证预付款表单 | `* 验证预付款表单...` |
| 321 | 填充确认步骤 | `* 填充确认步骤...` |
| 344 | 付款货币 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 344 | 与结算货币 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 344 | 不同 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 344 | 系统将按汇率 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 344 | 转换为 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 344 | 计入账户 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 347 | 付款货币 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| 347 | 与结算货币 | `conversionText.textContent = `付款货币 (${data.currency}) 与结算货币 ...` |
| ... | *19 more items* | ... |

#### `finance/pages/po.html` (20 issues)

| Line | Text | Context |
|------|------|----------|
| 197 | 表格容器 | `/* 表格容器 */...` |
| 213 | 表头 | `/* 表头 */...` |
| 233 | 数据行 | `/* 数据行 */...` |
| 259 | 订货单号加粗 | `/* 订货单号加粗 */...` |
| 266 | 金额样式 | `/* 金额样式 */...` |
| 287 | 付款状态标签 | `/* 付款状态标签 */...` |
| 315 | 已付款九宫格 | `/* 已付款九宫格 */...` |
| 373 | 会计风格对齐容器 | `/* 会计风格对齐容器 */...` |
| 394 | 供应商分块容器 | `/* 供应商分块容器 */...` |
| 473 | 表格行选中样式 | `/* 表格行选中样式 */...` |
| 492 | 向导容器 | `/* 向导容器 */...` |
| 794 | 当前选中的供应商代码 | `var currentSupplierCode = null;  // 当前选中的供应商代码...` |
| 795 | 当前选中的已付供应商代码 | `var activePaidSupplierCode = null; // 当前选中的已付供应商代码...` |
| 1060 | 有差异 | `'<i class="fas fa-exclamation-triangle me-1"></i>有差异' +...` |
| 1064 | 正常 | `'<i class="fas fa-check me-1"></i>正常' +...` |
| 2104 | 汇率来源 | `_rateSource: item._rateSource \|\| 'auto',  // 汇率来源: auto/manu...` |
| 2105 | 尾款剩余 | `_payAmount: item.balance_remaining \|\| 0  // 尾款剩余 = 待支付金额...` |
| 2105 | 待支付金额 | `_payAmount: item.balance_remaining \|\| 0  // 尾款剩余 = 待支付金额...` |
| 2227 | 订单 | `订单 <span id="diffBlockedPoNum" class="text-warning fw-bold">...` |
| 2227 | 存在未解决的收发差异 | `订单 <span id="diffBlockedPoNum" class="text-warning fw-bold">...` |

#### `finance/pages/prepay.html` (34 issues)

| Line | Text | Context |
|------|------|----------|
| 108 | 结算货币 | `结算货币：<span id="txn-supplier-currency"...` |
| 224 | 供应商卡片滚动容器 | `/* ===== 供应商卡片滚动容器 ===== */...` |
| 245 | 供应商卡片 | `/* ===== 供应商卡片 ===== */...` |
| 309 | 交易表格 | `/* ===== 交易表格 ===== */...` |
| 379 | 金额样式 | `/* 金额样式 */...` |
| 402 | 货币标签 | `/* 货币标签 */...` |
| 421 | 筛选按钮 | `/* 筛选按钮 */...` |
| 433 | 操作按钮组 | `/* 操作按钮组 */...` |
| 497 | 已删除行样式 | `/* 已删除行样式 */...` |
| 506 | 删除标签 | `/* 删除标签 */...` |
| 524 | 图标 | `/* Placeholder 图标 */...` |
| 536 | 小按钮 | `/* 小按钮 */...` |
| 542 | 新增预付款按钮 | `/* 新增预付款按钮 */...` |
| 606 | 加载供应商余额列表 | `* 加载供应商余额列表...` |
| 643 | 加载供应商余额失败 | `console.error('[Prepay] 加载供应商余额失败:', err);...` |
| 649 | 创建供应商卡片 | `* 创建供应商卡片...` |
| 695 | 选择供应商 | `* 选择供应商...` |
| 715 | 加载交易明细 | `* 加载交易明细...` |
| 879 | 已删除 | `<td class="cell-tran-num">${txn.tran_num}${isDeleted ? '<spa...` |
| 886 | 条记录 | `document.getElementById('txn-count').textContent = `共 ${info...` |
| ... | *14 more items* | ... |


### 📁 inventory/

#### `inventory/hub.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 管理库存数据 | `管理库存数据：盘存上传、库存修改。...` |
| 15 | 盘存上传 | `管理库存数据：盘存上传、库存修改。...` |
| 15 | 库存修改 | `管理库存数据：盘存上传、库存修改。...` |

#### `inventory/pages/dynamic_inv.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 8 | 日期选择区域 | `/* 日期选择区域 */...` |
| 36 | 表格容器限高滚动 | `/* 表格容器限高滚动 */...` |
| 46 | 固定表头 | `/* 固定表头 */...` |
| 59 | 可排序列头 | `/* 可排序列头 */...` |
| 86 | 加载状态 | `/* 加载状态 */...` |
| 101 | 数值高亮 | `/* 数值高亮 */...` |
| 125 | 说明面板 | `/* 说明面板 */...` |
| 203 | 产品编码 | `<p class="mb-1"><strong class="text-info">SKU</strong> - 产品编...` |
| 377 | 无数据 | `tbody.innerHTML = '<tr><td colspan="10" class="text-center t...` |
| 403 | 加载失败 | `tbody.innerHTML = '<tr><td colspan="10" class="text-center t...` |

#### `inventory/pages/edit.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 104 | 下一步 | `<button type="button" class="btn btn-info rounded-pill px-4"...` |
| 170 | 这将永久移除该日期下所有 | `class="text-white" id="delete-target-col"></code>，这将永久移除该日期下...` |
| 170 | 的库存数据 | `class="text-white" id="delete-target-col"></code>，这将永久移除该日期下...` |
| 188 | 下一步 | `<button type="button" class="btn btn-info rounded-pill px-4"...` |
| 240 | 进入最终确认 | `<button type="button" class="btn btn-success rounded-pill px...` |
| 688 | 确认更新 | `var actionDisplay = editState.actionType === 'MODIFY' ? '确认更...` |

#### `inventory/pages/partials/_shelf_custom_download.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 274 | 已选中 | `<i class="fas fa-check-circle me-2"></i>已选中: ${typeLabel}...` |
| 414 | 批量下载仓库码 | `<i class="fas fa-download me-2 text-info"></i>批量下载仓库码...` |

#### `inventory/pages/partials/_shelf_scripts.html` (34 issues)

| Line | Text | Context |
|------|------|----------|
| 33 | 正确的货架方向 | `Warehouse Shelf Codes - 正确的货架方向...` |
| 35 | 俯视图 | `俯视图:...` |
| 37 | 后墙 | `│ ██████   ██████ │  ← 1跨 (后墙)...` |
| 39 | 靠入口 | `│ ██████   ██████ │  ← 3跨 (靠入口)...` |
| 40 | 走道 | `│   L   走道  R    │...` |
| 41 | 入口 | `│       入口       │...` |
| 44 | 货架 | `货架：长边朝走道(X方向大)，短边纵向排列(Z方向小)...` |
| 44 | 长边朝走道 | `货架：长边朝走道(X方向大)，短边纵向排列(Z方向小)...` |
| 44 | 方向大 | `货架：长边朝走道(X方向大)，短边纵向排列(Z方向小)...` |
| 44 | 短边纵向排列 | `货架：长边朝走道(X方向大)，短边纵向排列(Z方向小)...` |
| 44 | 方向小 | `货架：长边朝走道(X方向大)，短边纵向排列(Z方向小)...` |
| 68 | 调整视角以适应竖屏 | `camera.position.set(0, 15, 18); // 调整视角以适应竖屏...` |
| 73 | 优化高分屏清晰度 | `renderer.setPixelRatio(window.devicePixelRatio); // 优化高分屏清晰度...` |
| 101 | 方向 | `const whWidth = 10;  // X方向（短边）...` |
| 101 | 短边 | `const whWidth = 10;  // X方向（短边）...` |
| 108 | 此处 | `const shelfWidth = (whWidth - walkwayWidth) / 2 - 0.2;  // 此...` |
| 108 | 轴方向宽度 | `const shelfWidth = (whWidth - walkwayWidth) / 2 - 0.2;  // 此...` |
| 108 | 填满两侧 | `const shelfWidth = (whWidth - walkwayWidth) / 2 - 0.2;  // 此...` |
| 109 | 此处 | `const shelfDepth = 6.0;   // 此处Depth指Z轴方向长度，调整为8米 (原12米)，保持长...` |
| 109 | 轴方向长度 | `const shelfDepth = 6.0;   // 此处Depth指Z轴方向长度，调整为8米 (原12米)，保持长...` |
| ... | *14 more items* | ... |

#### `inventory/pages/partials/_shelf_styles.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 3 | 样式 | `Warehouse Shelf Codes - Three.js 3D 样式...` |
| 6 | 向导步骤 | `/* 向导步骤 */...` |
| 64 | 容器 | `/* 3D容器 */...` |
| 86 | 仓库卡片 | `/* 仓库卡片 */...` |
| 117 | 图例 | `/* 图例 */...` |
| 144 | 统计 | `/* 统计 */...` |
| 163 | 配置表单 | `/* 配置表单 */...` |
| 203 | 控制提示 | `/* 控制提示 */...` |
| 211 | 独立跨配置列表 | `/* 独立跨配置列表 */...` |

#### `inventory/pages/shelf.html` (13 issues)

| Line | Text | Context |
|------|------|----------|
| 19 | 管理仓库库位结构 | `管理仓库库位结构，查看货架3D地图，生成库位码。...` |
| 19 | 查看货架 | `管理仓库库位结构，查看货架3D地图，生成库位码。...` |
| 19 | 地图 | `管理仓库库位结构，查看货架3D地图，生成库位码。...` |
| 19 | 生成库位码 | `管理仓库库位结构，查看货架3D地图，生成库位码。...` |
| 64 | 选择仓库与库位 | `选择仓库与库位，查看详细信息。...` |
| 64 | 查看详细信息 | `选择仓库与库位，查看详细信息。...` |
| 161 | 开始设计 | `开始设计 <i class="fas fa-arrow-right ms-2"></i>...` |
| 179 | 右排货架 | `右排货架 (R)<i class="fas fa-arrow-right ms-1"></i>...` |
| 218 | 实时预览 | `<h6 class="text-white-50 mb-0"><i class="fas fa-eye me-1"></...` |
| 253 | 仓库 | `仓库 <span id="result-wh-num" class="text-info fw-bold"></span...` |
| 253 | 及其货架结构已成功生成 | `仓库 <span id="result-wh-num" class="text-info fw-bold"></span...` |
| 274 | 仓库 | `仓库 <span id="edit-result-wh-num" class="text-info fw-bold"><...` |
| 274 | 的布局已更新 | `仓库 <span id="edit-result-wh-num" class="text-info fw-bold"><...` |

#### `inventory/pages/upload.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 66 | 文件需包含 | `<li>CSV 文件需包含 <code class="text-info">SKU</code> 和 <code cla...` |
| 140 | 开始校验 | `开始校验 <i class="fas fa-arrow-right ms-2"></i>...` |
| 228 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-2"></i>...` |
| 246 | 已处理 | `已处理: <span class="text-success fw-bold" id="fix-done-count">...` |
| 289 | 应用修正并继续 | `应用修正并继续 <i class="fas fa-arrow-right ms-2"></i>...` |
| 309 | 目标日期 | `目标日期: <code class="text-info" id="review-target-date"></code...` |
| 481 | 盘存表最新记录至 | `const match = html.match(/盘存表最新记录至:\s*<span[^>]*>([^<]+)</);...` |
| 1065 | 的盘存数据 | `document.getElementById('done-subtitle').textContent = (wind...` |


### 📁 layouts/

#### `layouts/base.html` (36 issues)

| Line | Text | Context |
|------|------|----------|
| 23 | 全局样式定义 | `/* --- 全局样式定义 --- */...` |
| 33 | 背景视频层 | `/* 背景视频层 */...` |
| 62 | 侧边栏 | `/* 侧边栏 (Glass UI) */...` |
| 73 | 侧边栏收起状态 | `/* 侧边栏收起状态 */...` |
| 78 | 主内容区 | `/* 主内容区 */...` |
| 86 | 侧边栏收起时主内容全宽 | `/* 侧边栏收起时主内容全宽 */...` |
| 92 | 侧边栏切换按钮 | `/* 侧边栏切换按钮 */...` |
| 111 | 收起时按钮移动到左上角 | `/* 收起时按钮移动到左上角 */...` |
| 116 | 导航项悬停高亮效果 | `/* 导航项悬停高亮效果 */...` |
| 133 | 通用玻璃卡片 | `/* 通用玻璃卡片 */...` |
| 142 | 滚动条美化 | `/* 滚动条美化 */...` |
| 162 | 页面自定义样式 | `{# [Page-Specific] 页面自定义样式 #}...` |
| 194 | 侧边栏切换按钮 | `{# 侧边栏切换按钮 #}...` |
| 257 | 全局状态栏 | `{# [Global] 全局状态栏 - 锁死在 base.html，不允许页面覆盖 #}...` |
| 257 | 锁死在 | `{# [Global] 全局状态栏 - 锁死在 base.html，不允许页面覆盖 #}...` |
| 257 | 不允许页面覆盖 | `{# [Global] 全局状态栏 - 锁死在 base.html，不允许页面覆盖 #}...` |
| 258 | 全局状态栏 | `{# [Global] 全局状态栏 - 100% Width Glass #}...` |
| 304 | 修改自己密码 | `{# [Global] 修改自己密码 Modal #}...` |
| 305 | 修改自己密码 | `{# [Global] 修改自己密码 Modal (Apple Style) #}...` |
| 335 | 设置新密码 | `placeholder="设置新密码 (至少5位)">...` |
| ... | *16 more items* | ... |


### 📁 log/

#### `log/pages/dashboard.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 107 | 导航样式 | `/* Tab 导航样式 */...` |
| 169 | 带参数加载 | `* 带参数加载 Tab（用于分页）...` |
| 169 | 用于分页 | `* 带参数加载 Tab（用于分页）...` |
| 193 | 解锁 | `* 解锁 God Mode - 使用标准安全验证流程...` |
| 193 | 使用标准安全验证流程 | `* 解锁 God Mode - 使用标准安全验证流程...` |
| 248 | 锁定 | `* 锁定 God Mode...` |
| 279 | 切换开发模式 | `* 切换开发模式...` |
| 280 | 表示进入开发模式 | `* @param {boolean} enterDevMode - true 表示进入开发模式（需密码），false 表...` |
| 280 | 需密码 | `* @param {boolean} enterDevMode - true 表示进入开发模式（需密码），false 表...` |
| 280 | 表示退出 | `* @param {boolean} enterDevMode - true 表示进入开发模式（需密码），false 表...` |
| 280 | 无需密码 | `* @param {boolean} enterDevMode - true 表示进入开发模式（需密码），false 表...` |
| 337 | 清理开发日志 | `* 清理开发日志...` |

#### `log/tabs/access.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 114 | 表格容器 | `/* 表格容器 */...` |
| 127 | 表头 | `/* 表头 */...` |
| 143 | 数据行 | `/* 数据行 */...` |
| 174 | 方法徽章 | `/* HTTP 方法徽章 */...` |
| 207 | 状态码徽章 | `/* 状态码徽章 */...` |

#### `log/tabs/audit.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 125 | 表格容器 | `/* 表格容器 */...` |
| 138 | 表头 | `/* 表头 */...` |
| 154 | 数据行 | `/* 数据行 */...` |
| 185 | 分类徽章 | `/* 分类徽章 */...` |
| 197 | 结果徽章 | `/* 结果徽章 */...` |

#### `log/tabs/business.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 122 | 表格容器 | `/* 表格容器 */...` |
| 135 | 表头 | `/* 表头 */...` |
| 151 | 数据行 | `/* 数据行 */...` |
| 174 | 模块徽章 | `/* 模块徽章 */...` |
| 186 | 状态徽章 | `/* 状态徽章 */...` |

#### `log/tabs/error.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 121 | 表格容器 | `/* 表格容器 */...` |
| 134 | 表头 | `/* 表头 */...` |
| 150 | 数据行 | `/* 数据行 */...` |
| 173 | 严重性徽章 | `/* 严重性徽章 */...` |
| 206 | 状态徽章 | `/* 状态徽章 */...` |
| 269 | 基本信息 | `'<h6 class="text-white-50 mb-3"><i class="fas fa-info-circle...` |
| 281 | 错误信息 | `'<h6 class="text-white-50 mb-3"><i class="fas fa-bug me-2"><...` |
| 293 | 错误消息 | `'<h6 class="text-white-50 mt-4 mb-3"><i class="fas fa-exclam...` |
| 298 | 完整堆栈 | `'<h6 class="text-white-50 mt-4 mb-3"><i class="fas fa-layer-...` |
| 302 | 局部变量 | `'<h6 class="text-white-50 mt-4 mb-3"><i class="fas fa-code m...` |

#### `log/tabs/maintenance.html` (13 issues)

| Line | Text | Context |
|------|------|----------|
| 35 | 开发 | `<small class="text-white-50">开发: <span class="text-warning">...` |
| 48 | 开发 | `<small class="text-white-50">开发: <span class="text-warning">...` |
| 61 | 开发 | `<small class="text-white-50">开发: <span class="text-warning">...` |
| 74 | 开发 | `<small class="text-white-50">开发: <span class="text-warning">...` |
| 93 | 当前共有 | `当前共有 <strong class="text-warning">{{ stats.dev_total }}</str...` |
| 93 | 条开发模式日志 | `当前共有 <strong class="text-warning">{{ stats.dev_total }}</str...` |
| 94 | 如果准备发布上线 | `如果准备发布上线，建议先清理这些日志。...` |
| 94 | 建议先清理这些日志 | `如果准备发布上线，建议先清理这些日志。...` |
| 104 | 所有日志均为生产环境数据 | `所有日志均为生产环境数据，可以放心发布上线。...` |
| 104 | 可以放心发布上线 | `所有日志均为生产环境数据，可以放心发布上线。...` |
| 123 | 保留 | `<li class="mb-1"><code class="text-info">log_access</code>: ...` |
| 124 | 保留 | `<li class="mb-1"><code class="text-info">log_business</code>...` |
| 135 | 清理开发日志 | `<li class="mb-0"><code class="text-info">python manage.py cl...` |

#### `log/tabs/overview.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 55 | 本周 | `本周: {{ stats.business_week }}...` |
| 165 | 严重性徽章 | `/* 严重性徽章 */...` |
| 198 | 状态徽章 | `/* 状态徽章 */...` |


### 📁 pages/

#### `pages/etl_transaction.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 100 | 默认隐藏 | `/* HTMX Indicator 默认隐藏 */...` |

#### `pages/login.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 16 | 统一蓝紫色系 | `/* 统一蓝紫色系 - 与首页一致 */...` |
| 16 | 与首页一致 | `/* 统一蓝紫色系 - 与首页一致 */...` |
| 66 | 横向铺满 | `/* === Background Logo Layer (横向铺满，垂直居中) === */...` |
| 66 | 垂直居中 | `/* === Background Logo Layer (横向铺满，垂直居中) === */...` |
| 117 | 只有 | `/* === Brand Section (只有ERP System文字) === */...` |
| 117 | 文字 | `/* === Brand Section (只有ERP System文字) === */...` |
| 255 | 蓝色风格 | `/* === Slide to Unlock (蓝色风格) === */...` |
| 400 | 蓝色光晕 | `/* === Decorative Elements (蓝色光晕) === */...` |

#### `pages/user_admin.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 242 | 样式复用 | `/* 样式复用 */...` |


### 📁 products/

#### `products/hub.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 管理产品档案 | `管理产品档案：Product Data Maintenance、Add Product。...` |

#### `products/pages/add.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 93 | 验证数据 | `验证数据 <i class="fas fa-arrow-right ms-2"></i>...` |
| 130 | 我确认上述产品的初始库存为 | `我确认上述产品的初始库存为 0...` |
| 272 | 有效行数据 | `let validRows = [];           // 有效行数据...` |
| 273 | 校验错误 | `let validationErrors = [];    // 校验错误...` |
| 274 | 初始库存为 | `let zeroQtySkus = [];         // 初始库存为0的SKU...` |
| 275 | 是否已确认初始库存为 | `let zeroQtyConfirmed = false; // 是否已确认初始库存为0...` |
| 448 | 强制转大写 | `const sku = rawSku.toUpperCase(); // 强制转大写...` |
| 449 | 跳过空行 | `if (!sku) return; // 跳过空行...` |
| 566 | 验证通过 | `return null; // 验证通过...` |

#### `products/pages/barcode.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 55 | 模糊搜索样式 | `/* SKU 模糊搜索样式 */...` |
| 201 | 验证数据 | `验证数据 <i class="fas fa-arrow-right ms-2"></i>...` |
| 418 | 有效行数据 | `let validRows = [];           // 有效行数据...` |
| 419 | 校验错误 | `let validationErrors = [];    // 校验错误...` |
| 516 | 保存当前输入框引用 | `const currentInput = this;  // 保存当前输入框引用...` |
| 518 | 清空已选值 | `hidden.value = ''; // 清空已选值...` |
| 529 | 最多显示 | `).slice(0, 20); // 最多显示20个...` |
| 700 | 跳过无效 | `if (!sku) return; // 跳过无效 SKU 的行...` |
| 700 | 的行 | `if (!sku) return; // 跳过无效 SKU 的行...` |
| 1037 | 标记是否正在跳转到查看页面 | `let isNavigatingToViewer = false;  // 标记是否正在跳转到查看页面...` |
| 1081 | 秒后清理 | `}, 60000); // 60秒后清理（给用户足够时间返回）...` |
| 1081 | 给用户足够时间返回 | `}, 60000); // 60秒后清理（给用户足够时间返回）...` |

#### `products/pages/barcode_viewer.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 27 | 大小 | `大小: {{ file_size }} \| 条形码 PDF 预览...` |
| 27 | 条形码 | `大小: {{ file_size }} \| 条形码 PDF 预览...` |
| 27 | 预览 | `大小: {{ file_size }} \| 条形码 PDF 预览...` |

#### `products/pages/data.html` (16 issues)

| Line | Text | Context |
|------|------|----------|
| 93 | 验证数据 | `验证数据 <i class="fas fa-arrow-right ms-2"></i>...` |
| 253 | 原始数据快照 | `let baselineMap = {};       // 原始数据快照: { rowKey: { field: va...` |
| 254 | 修改追踪 | `let dirtyMap = {};          // 修改追踪: { rowKey: { changes: {f...` |
| 255 | 校验错误列表 | `let validationErrors = [];  // 校验错误列表...` |
| 536 | 安全渲染错误列表 | `* 安全渲染错误列表（纯 DOM 构建，无 innerHTML）...` |
| 536 | 构建 | `* 安全渲染错误列表（纯 DOM 构建，无 innerHTML）...` |
| 540 | 清空 | `errorList.textContent = ''; // 清空...` |
| 556 | 安全渲染差异表格 | `* 安全渲染差异表格（纯 DOM 构建，无 innerHTML）...` |
| 556 | 构建 | `* 安全渲染差异表格（纯 DOM 构建，无 innerHTML）...` |
| 560 | 清空 | `tbody.textContent = ''; // 清空...` |
| 619 | 安全渲染成功结果页 | `* 安全渲染成功结果页（纯 DOM 构建）...` |
| 619 | 构建 | `* 安全渲染成功结果页（纯 DOM 构建）...` |
| 634 | 清空 | `detailsList.textContent = ''; // 清空...` |
| 765 | 字符串中提取纯文本 | `* 从 HTML 字符串中提取纯文本（安全处理，不渲染 HTML）...` |
| 765 | 安全处理 | `* 从 HTML 字符串中提取纯文本（安全处理，不渲染 HTML）...` |
| 765 | 不渲染 | `* 从 HTML 字符串中提取纯文本（安全处理，不渲染 HTML）...` |


### 📁 purchase/

#### `purchase/hub.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 管理采购相关业务 | `管理采购相关业务：新增供应商、供应商管理等。...` |
| 15 | 新增供应商 | `管理采购相关业务：新增供应商、供应商管理等。...` |
| 15 | 供应商管理等 | `管理采购相关业务：新增供应商、供应商管理等。...` |

#### `purchase/pages/abnormal.html` (24 issues)

| Line | Text | Context |
|------|------|----------|
| 62 | 查看异常记录的完整入库信息和货物明细 | `class="fas fa-eye text-info"></i> 查看异常记录的完整入库信息和货物明细</span><...` |
| 65 | 进入异常处理向导 | `class="fas fa-tools text-warning"></i> 进入异常处理向导，选择修正策略</span...` |
| 65 | 选择修正策略 | `class="fas fa-tools text-warning"></i> 进入异常处理向导，选择修正策略</span...` |
| 68 | 查看该物流单的处理历史版本 | `class="fas fa-history text-secondary"></i> 查看该物流单的处理历史版本</sp...` |
| 235 | 风格订单表格 | `Apple风格订单表格 (复用 send_mgmt 样式)...` |
| 235 | 复用 | `Apple风格订单表格 (复用 send_mgmt 样式)...` |
| 235 | 样式 | `Apple风格订单表格 (复用 send_mgmt 样式)...` |
| 250 | 表头 | `/* 表头 */...` |
| 280 | 数据行 | `/* 数据行 */...` |
| 302 | 物流单号加粗 | `/* 物流单号加粗 */...` |
| 309 | 日期显示 | `/* 日期显示 */...` |
| 319 | 操作按钮组 | `/* 操作按钮组 */...` |
| 384 | 状态标签 | `/* 状态标签 */...` |
| 406 | 入库状态标签 | `/* 入库状态标签 (用于详情视图) */...` |
| 406 | 用于详情视图 | `/* 入库状态标签 (用于详情视图) */...` |
| 487 | 历史记录卡片样式 | `/* 历史记录卡片样式 (与发货单历史一致) */...` |
| 487 | 与发货单历史一致 | `/* 历史记录卡片样式 (与发货单历史一致) */...` |
| 620 | 条异常记录 | `countEl.textContent = `共 ${data.total \|\| 0} 条异常记录`;...` |
| 635 | 已处理 | `? '<span class="status-badge done"><i class="fas fa-check me...` |
| 636 | 待处理 | `: '<span class="status-badge pending"><i class="fas fa-clock...` |
| ... | *4 more items* | ... |

#### `purchase/pages/abnormal_process/step1_intro.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 73 | 根据实际收货数量修正发货数量使差异为 | `根据实际收货数量修正发货数量使差异为0，<strong class="text-warning"...` |
| 96 | 根据实际收货数量 | `根据实际收货数量<strong class="text-success"...` |
| 111 | 将差异数量的货物 | `将差异数量的货物<strong class="text-warning"...` |

#### `purchase/pages/abnormal_process/step2_select.html` (29 issues)

| Line | Text | Context |
|------|------|----------|
| 73 | 发货 | `< 发货)</div>...` |
| 87 | 发货量 | `<div class="mb-1"><span class="badge bg-primary me-1">1</spa...` |
| 88 | 发货 | `<div class="mb-1"><span class="badge bg-success me-1">2</spa...` |
| 88 | 订货 | `<div class="mb-1"><span class="badge bg-success me-1">2</spa...` |
| 89 | 差异 | `<div class="mb-1"><span class="badge bg-warning me-1">3</spa...` |
| 89 | 件延迟入库 | `<div class="mb-1"><span class="badge bg-warning me-1">3</spa...` |
| 90 | 缺少 | `<div><span class="badge bg-danger me-1">4</span>缺少10件按原价出库耗损...` |
| 90 | 件按原价出库耗损 | `<div><span class="badge bg-danger me-1">4</span>缺少10件按原价出库耗损...` |
| 113 | 发货量 | `<div class="mb-1"><span class="badge bg-primary me-1">1</spa...` |
| 114 | 发货 | `<div class="mb-1"><span class="badge bg-success me-1">2</spa...` |
| 114 | 订货 | `<div class="mb-1"><span class="badge bg-success me-1">2</spa...` |
| 115 | 多出 | `<div><span class="badge bg-danger me-1">4</span>多出10件以0成本入库<...` |
| 115 | 件以 | `<div><span class="badge bg-danger me-1">4</span>多出10件以0成本入库<...` |
| 115 | 成本入库 | `<div><span class="badge bg-danger me-1">4</span>多出10件以0成本入库<...` |
| 136 | 原始数据 | `原始数据：订货100, 发货100, 入库90 (少收10)</td>...` |
| 136 | 订货 | `原始数据：订货100, 发货100, 入库90 (少收10)</td>...` |
| 136 | 发货 | `原始数据：订货100, 发货100, 入库90 (少收10)</td>...` |
| 136 | 入库 | `原始数据：订货100, 发货100, 入库90 (少收10)</td>...` |
| 136 | 少收 | `原始数据：订货100, 发货100, 入库90 (少收10)</td>...` |
| 139 | 仅修正发货单 | `<td><span class="badge bg-primary">1</span> 仅修正发货单</td>...` |
| ... | *9 more items* | ... |

#### `purchase/pages/abnormal_process_wizard.html` (37 issues)

| Line | Text | Context |
|------|------|----------|
| 46 | 处理方式卡片样式 | `/* 处理方式卡片样式 */...` |
| 82 | 物流单号 | ``物流单号: ${logisticNum} \| 入库日期: ${receiveDate}`;...` |
| 82 | 入库日期 | ``物流单号: ${logisticNum} \| 入库日期: ${receiveDate}`;...` |
| 160 | 入库多于发货 | `if (diff > 0) over += diff;     // 入库多于发货=多收...` |
| 160 | 多收 | `if (diff > 0) over += diff;     // 入库多于发货=多收...` |
| 161 | 入库少于发货 | `if (diff < 0) short += Math.abs(diff);  // 入库少于发货=少收...` |
| 161 | 少收 | `if (diff < 0) short += Math.abs(diff);  // 入库少于发货=少收...` |
| 195 | 修正发货数量使差异为 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 不修正订单 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 发货数 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 订货数时无影响 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 发货数 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 订货数时差异顺延至下次订货 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 195 | 可能导致计价混乱 | `1: { name: (window.i18n?.t('js.correct_shipment_only') \|\| 'C...` |
| 196 | 根据实际收货数量同时修改发货数量和订单数量 | `2: { name: (window.i18n?.t('js.sync_correct_order') \|\| 'Sync...` |
| 196 | 使三者匹配 | `2: { name: (window.i18n?.t('js.sync_correct_order') \|\| 'Sync...` |
| 196 | 不产生误差 | `2: { name: (window.i18n?.t('js.sync_correct_order') \|\| 'Sync...` |
| 197 | 将差异数量的货物新建发货单延迟入库 | `3: { name: (window.i18n?.t('js.delayed_receive') \|\| 'Delayed...` |
| 197 | 使当前差异为 | `3: { name: (window.i18n?.t('js.delayed_receive') \|\| 'Delayed...` |
| 198 | 入库数大于发货数时 | `4: { name: (window.i18n?.t('js.vendor_error') \|\| 'Vendor Err...` |
| ... | *17 more items* | ... |

#### `purchase/pages/abnormal_view.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 176 | 少收 | `return `<span class="badge bg-warning bg-opacity-25 text-war...` |
| 178 | 超收 | `return `<span class="badge bg-info bg-opacity-25 text-info">...` |
| 193 | 物流单号 | `document.getElementById('abnormal-view-logistic-num-label')....` |

#### `purchase/pages/po_add.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 63 | 步骤内容显示控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 63 | 通过 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 63 | 类控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 71 | 导航按钮布局 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 71 | 返回左对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 71 | 下一步右对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 81 | 验证卡片状态样式 | `/* 验证卡片状态样式 */...` |

#### `purchase/pages/po_mgmt.html` (31 issues)

| Line | Text | Context |
|------|------|----------|
| 193 | 风格订单表格 | `Apple风格订单表格...` |
| 208 | 表头 | `/* 表头 */...` |
| 238 | 数据行 | `/* 数据行 */...` |
| 260 | 订单号加粗 | `/* 订单号加粗 */...` |
| 267 | 已删除订单样式 | `/* 已删除订单样式 */...` |
| 282 | 版本 | `/* 版本Badge */...` |
| 305 | 日期显示 | `/* 日期显示 */...` |
| 315 | 操作按钮组 | `/* 操作按钮组 */...` |
| 390 | 删除标签 | `/* 删除标签 */...` |
| 411 | 发货状态标签 | `/* 发货状态标签 */...` |
| 441 | 删除行不使用删除线 | `/* 删除行不使用删除线 */...` |
| 487 | 检查订单是否可以修改 | `* 检查订单是否可以修改/删除...` |
| 487 | 删除 | `* 检查订单是否可以修改/删除...` |
| 488 | 规则 | `* 规则：已删除、部分发货、全部发货的订单不可修改/删除...` |
| 488 | 已删除 | `* 规则：已删除、部分发货、全部发货的订单不可修改/删除...` |
| 488 | 部分发货 | `* 规则：已删除、部分发货、全部发货的订单不可修改/删除...` |
| 488 | 全部发货的订单不可修改 | `* 规则：已删除、部分发货、全部发货的订单不可修改/删除...` |
| 488 | 删除 | `* 规则：已删除、部分发货、全部发货的订单不可修改/删除...` |
| 498 | 获取编辑按钮的 | `* 获取编辑按钮的tooltip文本...` |
| 498 | 文本 | `* 获取编辑按钮的tooltip文本...` |
| ... | *11 more items* | ... |

#### `purchase/pages/po_mgmt/po_delete.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 156 | 正在删除订单 | `正在删除订单......` |
| 183 | 订单号 | `document.getElementById('delete-po-num-label').textContent =...` |
| 241 | 使用 | `containerId: 'delete-wizard-container',  // 使用containerId，不带...` |
| 241 | 不带 | `containerId: 'delete-wizard-container',  // 使用containerId，不带...` |
| 246 | 由按钮控制跳转 | `onStepChange: () => {} // 由按钮控制跳转...` |
| 311 | 接收密码对象 | `(passwords) => submitDeleteAsync(passwords),  // onSuccess，接...` |
| 312 | 无需回填 | `null,                    // contextEl (无需回填)...` |
| 368 | 服务器返回了非 | `throw new Error(`服务器返回了非JSON响应 (${r.status})，可能是登录失效或权限问题`);...` |
| 368 | 响应 | `throw new Error(`服务器返回了非JSON响应 (${r.status})，可能是登录失效或权限问题`);...` |
| 368 | 可能是登录失效或权限问题 | `throw new Error(`服务器返回了非JSON响应 (${r.status})，可能是登录失效或权限问题`);...` |

#### `purchase/pages/po_mgmt/po_edit.html` (75 issues)

| Line | Text | Context |
|------|------|----------|
| 85 | 请输入修改原因和备注 | `placeholder="请输入修改原因和备注..."></textarea>...` |
| 346 | 系统已自动将相同 | `系统已自动将相同SKU且相同单价的同类操作合并，以确保数据一致性...` |
| 346 | 且相同单价的同类操作合并 | `系统已自动将相同SKU且相同单价的同类操作合并，以确保数据一致性...` |
| 346 | 以确保数据一致性 | `系统已自动将相同SKU且相同单价的同类操作合并，以确保数据一致性...` |
| 467 | 订单已成功更新 | `订单已成功更新。...` |
| 482 | 编辑表格样式 | `/* 编辑表格样式 */...` |
| 499 | 原数量 | `/* 原数量 */...` |
| 506 | 新数量 | `/* 新数量 */...` |
| 513 | 原单价 | `/* 原单价 */...` |
| 520 | 新单价 | `/* 新单价 */...` |
| 527 | 小计 | `/* 小计 */...` |
| 534 | 操作 | `/* 操作 */...` |
| 536 | 输入框对齐优化 | `/* [Fix] 输入框对齐优化 */...` |
| 593 | 恢复按钮保持可点击 | `/* 恢复按钮保持可点击 */...` |
| 603 | 验证项样式 | `/* 验证项样式 */...` |
| 641 | 验证卡片状态样式 | `/* 验证卡片状态样式 */...` |
| 687 | 实例 | `let editPoWizard = null;  // GlobalWizard实例...` |
| 695 | 保存流程 | `let editCollectedStrategy = null;  // 保存流程1收集的策略数据，用于流程2验证...` |
| 695 | 收集的策略数据 | `let editCollectedStrategy = null;  // 保存流程1收集的策略数据，用于流程2验证...` |
| 695 | 用于流程 | `let editCollectedStrategy = null;  // 保存流程1收集的策略数据，用于流程2验证...` |
| ... | *55 more items* | ... |

#### `purchase/pages/po_mgmt/po_history.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 198 | 订单号 | `document.getElementById('history-po-num-label').textContent ...` |
| 313 | 删除订单 | `badgeHtml = '<span class="badge bg-danger"><i class="fas fa-...` |
| 316 | 恢复删除订单 | `badgeHtml = '<span class="badge bg-success"><i class="fas fa...` |
| 361 | 整单删除 | `html += '<div class="text-danger small"><i class="fas fa-exc...` |
| 361 | 所有商品数据已清空 | `html += '<div class="text-danger small"><i class="fas fa-exc...` |
| 363 | 订单已恢复 | `html += '<div class="text-success small"><i class="fas fa-ch...` |
| 363 | 商品数据已重新写入 | `html += '<div class="text-success small"><i class="fas fa-ch...` |

#### `purchase/pages/po_mgmt/po_view.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 180 | 保存当前订单号 | `viewCurrentPoNum = poNum;  // 保存当前订单号...` |
| 188 | 订单号 | `document.getElementById('view-po-num-label').textContent = `...` |

#### `purchase/pages/po_steps/step1_basic.html` (10 issues)

| Line | Text | Context |
|------|------|----------|
| 42 | 最终正式 | `最终正式PO将由系统生成并提供下载...` |
| 42 | 将由系统生成并提供下载 | `最终正式PO将由系统生成并提供下载...` |
| 108 | 模板已预填日期 | `模板已预填日期「<span id="template-preview-date" class="text-info fw...` |
| 108 | 和供应商 | `模板已预填日期「<span id="template-preview-date" class="text-info fw...` |
| 109 | 点击下方按钮下载模板 | `点击下方按钮下载模板，按格式填写商品明细后上传...` |
| 109 | 按格式填写商品明细后上传 | `点击下方按钮下载模板，按格式填写商品明细后上传...` |
| 120 | 若选择手动填写 | `若选择手动填写，可跳过下载直接点击"开始创建"按钮...` |
| 120 | 可跳过下载直接点击 | `若选择手动填写，可跳过下载直接点击"开始创建"按钮...` |
| 120 | 开始创建 | `若选择手动填写，可跳过下载直接点击"开始创建"按钮...` |
| 120 | 按钮 | `若选择手动填写，可跳过下载直接点击"开始创建"按钮...` |

#### `purchase/pages/po_steps/step1_intro.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 39 | 最终正式 | `最终正式PO将由系统生成并提供下载...` |
| 39 | 将由系统生成并提供下载 | `最终正式PO将由系统生成并提供下载...` |
| 47 | 页面完成创建 | `<a href="/dashboard/products/add/" class="text-info">Add Pro...` |

#### `purchase/pages/po_steps/step2_mode_select.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 41 | 逐行填写商品 | `逐行填写商品SKU、数量和单价...` |
| 41 | 数量和单价 | `逐行填写商品SKU、数量和单价...` |
| 65 | 上传填写好的采购订单模板 | `上传填写好的采购订单模板Excel文件...` |
| 65 | 文件 | `上传填写好的采购订单模板Excel文件...` |

#### `purchase/pages/po_steps/step2_params.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 10 | 订单日期 | `订单日期 <i class="fas fa-info-circle ms-1"></i> <span class="te...` |
| 22 | 选择供应商 | `选择供应商 <i class="fas fa-info-circle ms-1"></i> <span class="t...` |
| 85 | 结算货币 | `结算货币 <i class="fas fa-info-circle ms-1"></i>...` |
| 100 | 结算汇率 | `结算汇率 <i class="fas fa-info-circle ms-1"></i>...` |
| 122 | 价格浮动 | `价格浮动 <i class="fas fa-info-circle ms-1"></i>...` |
| 128 | 浮动阈值 | `浮动阈值 (0-10%)...` |
| 157 | 定金要求 | `定金要求 <i class="fas fa-info-circle ms-1"></i>...` |
| 163 | 定金比例 | `定金比例 (0-100%)...` |

#### `purchase/pages/po_steps/step3_params.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 82 | 结算货币 | `结算货币 <i class="fas fa-info-circle ms-1"></i>...` |
| 97 | 结算汇率 | `结算汇率 <i class="fas fa-info-circle ms-1"></i>...` |
| 117 | 价格浮动 | `价格浮动 <i class="fas fa-info-circle ms-1"></i>...` |
| 123 | 浮动阈值 | `浮动阈值 (0-10%)...` |
| 152 | 定金要求 | `定金要求 <i class="fas fa-info-circle ms-1"></i>...` |
| 158 | 定金比例 | `定金比例 (0-100%)...` |

#### `purchase/pages/po_steps/step3_verify_params.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 18 | 供应商代码 | `供应商代码 <i class="fas fa-info-circle ms-1"></i>...` |
| 26 | 供应商名称 | `供应商名称 <i class="fas fa-info-circle ms-1"></i>...` |
| 34 | 订单日期 | `订单日期 <i class="fas fa-info-circle ms-1"></i>...` |
| 44 | 结算货币 | `结算货币 <i class="fas fa-info-circle ms-1"></i>...` |
| 55 | 结算汇率 | `结算汇率 <i class="fas fa-info-circle ms-1"></i>...` |
| 66 | 价格浮动开关 | `价格浮动开关 <i class="fas fa-info-circle ms-1"></i>...` |
| 77 | 价格浮动阈值 | `价格浮动阈值 <i class="fas fa-info-circle ms-1"></i>...` |
| 88 | 定金要求开关 | `定金要求开关 <i class="fas fa-info-circle ms-1"></i>...` |
| 99 | 定金百分比 | `定金百分比 <i class="fas fa-info-circle ms-1"></i>...` |

#### `purchase/pages/po_steps/step4_items.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 46 | 仅支持 | `仅支持 .xlsx / .xls 格式的Excel文件...` |
| 46 | 格式的 | `仅支持 .xlsx / .xls 格式的Excel文件...` |
| 46 | 文件 | `仅支持 .xlsx / .xls 格式的Excel文件...` |
| 89 | 商品数量 | `商品数量 <span class="text-danger">*</span>...` |
| 93 | 产品单价 | `产品单价 <span class="text-danger">*</span>...` |
| 97 | 小计 | `小计...` |

#### `purchase/pages/po_steps/step4_verify_params.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 18 | 供应商代码 | `供应商代码 <i class="fas fa-info-circle ms-1"></i>...` |
| 26 | 供应商名称 | `供应商名称 <i class="fas fa-info-circle ms-1"></i>...` |
| 34 | 订单日期 | `订单日期 <i class="fas fa-info-circle ms-1"></i>...` |
| 44 | 结算货币 | `结算货币 <i class="fas fa-info-circle ms-1"></i>...` |
| 55 | 结算汇率 | `结算汇率 <i class="fas fa-info-circle ms-1"></i>...` |
| 66 | 价格浮动开关 | `价格浮动开关 <i class="fas fa-info-circle ms-1"></i>...` |
| 77 | 价格浮动阈值 | `价格浮动阈值 <i class="fas fa-info-circle ms-1"></i>...` |
| 88 | 定金要求开关 | `定金要求开关 <i class="fas fa-info-circle ms-1"></i>...` |
| 99 | 定金百分比 | `定金百分比 <i class="fas fa-info-circle ms-1"></i>...` |

#### `purchase/pages/po_steps/step5_items.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 28 | 文件已在上一步验证通过 | `Excel文件已在上一步验证通过，商品数据如下。您可以在此处进行修改。...` |
| 28 | 商品数据如下 | `Excel文件已在上一步验证通过，商品数据如下。您可以在此处进行修改。...` |
| 28 | 您可以在此处进行修改 | `Excel文件已在上一步验证通过，商品数据如下。您可以在此处进行修改。...` |
| 78 | 商品数量 | `商品数量 <span class="text-danger">*</span>...` |
| 83 | 产品单价 | `产品单价 <span class="text-danger">*</span>...` |
| 88 | 小计 | `小计...` |

#### `purchase/pages/po_steps/step5_verify_items.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 71 | 系统已自动将相同 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |
| 71 | 且相同单价的记录合并 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |
| 71 | 以确保数据一致性 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |

#### `purchase/pages/po_steps/step6_verify_items.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 71 | 系统已自动将相同 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |
| 71 | 且相同单价的记录合并 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |
| 71 | 以确保数据一致性 | `系统已自动将相同SKU且相同单价的记录合并，以确保数据一致性...` |

#### `purchase/pages/receive.html` (30 issues)

| Line | Text | Context |
|------|------|----------|
| 65 | 步骤内容显示控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 65 | 通过 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 65 | 类控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 73 | 导航按钮布局 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 73 | 返回左对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 73 | 下一步右对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 83 | 验证卡片状态样式 | `/* 验证卡片状态样式 */...` |
| 122 | 参数表单样式 | `/* 参数表单样式 */...` |
| 163 | 选择的入库日期 | `receiveDate: null,      // Step 1 选择的入库日期...` |
| 164 | 发货单列表 | `shipments: [],          // Step 2 发货单列表 [{logistic_num, sent...` |
| 165 | 当前选中的发货单号 | `selectedLogistic: null, // 当前选中的发货单号...` |
| 166 | 当前发货单的货物明细 | `currentItems: [],       // 当前发货单的货物明细 [{po_sku, sent_quantit...` |
| 167 | 已确认的入库数据 | `receiveData: {}         // 已确认的入库数据 {logistic_num: [{po_sku,...` |
| 305 | 加载失败 | `emptyEl.innerHTML = `<i class="fas fa-exclamation-triangle f...` |
| 320 | 该日期前没有待入库的发货单 | `该日期前没有待入库的发货单...` |
| 419 | 加载中 | `<span class="spinner-border spinner-border-sm me-2"></span>加...` |
| 440 | 加载失败 | `<i class="fas fa-exclamation-triangle me-2"></i>加载失败: ${erro...` |
| 555 | 清空之前的数据 | `receiveState.receiveData = {};  // 清空之前的数据...` |
| 634 | 没有选择文件 | `if (!file) return;  // 没有选择文件，跳过...` |
| 634 | 跳过 | `if (!file) return;  // 没有选择文件，跳过...` |
| ... | *10 more items* | ... |

#### `purchase/pages/receive_mgmt.html` (31 issues)

| Line | Text | Context |
|------|------|----------|
| 45 | 查看和管理所有入库记录 | `查看和管理所有入库记录，支持入库状态追踪和差异管理。</p>...` |
| 45 | 支持入库状态追踪和差异管理 | `查看和管理所有入库记录，支持入库状态追踪和差异管理。</p>...` |
| 66 | 查看入库记录完整信息和货物明细 | `查看入库记录完整信息和货物明细</span></li>...` |
| 70 | 进入修改向导 | `class="fas fa-pen text-warning"></i> 进入修改向导</span></li>...` |
| 74 | 查看入库记录所有版本的修订历史 | `class="fas fa-history text-secondary"></i> 查看入库记录所有版本的修订历史</...` |
| 78 | 删除入库记录 | `class="fas fa-trash text-danger"></i> 删除入库记录</span></li>...` |
| 86 | 查看相关文件 | `class="fas fa-file-invoice text-info"></i> 查看相关文件，<i...` |
| 87 | 上传 | `class="fas fa-upload text-warning"></i> 上传/替换文件</span></li>...` |
| 87 | 替换文件 | `class="fas fa-upload text-warning"></i> 上传/替换文件</span></li>...` |
| 134 | 入库物流单号 | `入库物流单号 <i class="fas fa-sort ms-1"></i>...` |
| 137 | 入库日期 | `入库日期 <i class="fas fa-sort ms-1"></i>...` |
| 207 | 风格订单表格 | `Apple风格订单表格 (与Shipment Management一致)...` |
| 207 | 一致 | `Apple风格订单表格 (与Shipment Management一致)...` |
| 222 | 表头 | `/* 表头 */...` |
| 252 | 数据行 | `/* 数据行 */...` |
| 274 | 物流单号加粗 | `/* 物流单号加粗 */...` |
| 281 | 版本 | `/* 版本Badge */...` |
| 298 | 日期显示 | `/* 日期显示 */...` |
| 308 | 操作按钮组 | `/* 操作按钮组 */...` |
| 373 | 入库状态标签 | `/* 入库状态标签 */...` |
| ... | *11 more items* | ... |

#### `purchase/pages/receive_mgmt/receive_delete.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 120 | 请填写删除原因 | `请填写删除原因，此信息将记录在操作日志中...` |
| 120 | 此信息将记录在操作日志中 | `请填写删除原因，此信息将记录在操作日志中...` |
| 144 | 正在删除入库单 | `正在删除入库单......` |
| 164 | 物流单号 | `document.getElementById('receive-delete-logistic-num-label')...` |
| 224 | 件货物 | `document.getElementById('receive-delete-preview-items-count'...` |
| 290 | 接收密码对象 | `(passwords) => submitReceiveDeleteAsync(passwords),     // o...` |
| 291 | 无需回填 | `null,                         // contextEl (无需回填)...` |

#### `purchase/pages/receive_mgmt/receive_edit.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 59 | 实例 | `let receiveEditWizard = null;  // GlobalWizard实例...` |
| 147 | 物流单号 | `document.getElementById('receive-edit-logistic-num-label').t...` |
| 219 | 备注不能为 | `message: '备注不能为(window.i18n?.t('js.original_receive') \|\| 'Or...` |
| 219 | 请输入具体的修改原因 | `message: '备注不能为(window.i18n?.t('js.original_receive') \|\| 'Or...` |
| 236 | 容器元素 | `document.getElementById('receive-edit-wizard-container'),  /...` |
| 237 | 显示名称 | `(window.i18n?.t('js.confirm_receiving') \|\| 'Confirm Receivin...` |

#### `purchase/pages/receive_mgmt/receive_edit_step1.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 104 | 下一步 | `下一步 <i class="fas fa-arrow-right ms-1"></i>...` |

#### `purchase/pages/receive_mgmt/receive_edit_step2.html` (16 issues)

| Line | Text | Context |
|------|------|----------|
| 12 | 请核对修改内容并填写修改原因 | `请核对修改内容并填写修改原因，确认无误后点击确认入库完成修改。...` |
| 12 | 确认无误后点击确认入库完成修改 | `请核对修改内容并填写修改原因，确认无误后点击确认入库完成修改。...` |
| 97 | 可上传入库单据 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 97 | 验收报告等文件 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 97 | 支持 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 97 | 图片 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 97 | 格式 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 97 | 最大 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 128 | 确认表格样式 | `/* 确认表格样式 */...` |
| 138 | 入库数量高亮 | `/* 入库数量高亮 */...` |
| 148 | 误差标签 | `/* 误差标签 */...` |
| 171 | 修改行高亮 | `/* 修改行高亮 */...` |
| 197 | 项修改 | `document.getElementById('receive-edit-changes-badge').textCo...` |
| 231 | 无修改项 | `<i class="fas fa-check-circle me-2 text-success"></i>无修改项...` |
| 277 | 没有选择文件 | `if (!file) return;  // 没有选择文件，跳过...` |
| 277 | 跳过 | `if (!file) return;  // 没有选择文件，跳过...` |

#### `purchase/pages/receive_mgmt/receive_edit_step3.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 20 | 入库单数据已成功更新 | `入库单数据已成功更新。...` |

#### `purchase/pages/receive_mgmt/receive_history.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 161 | 物流单号 | `document.getElementById('receive-history-logistic-num-label'...` |

#### `purchase/pages/receive_mgmt/receive_view.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 182 | 少收 | `return `<span class="badge bg-warning bg-opacity-25 text-war...` |
| 184 | 超收 | `return `<span class="badge bg-info bg-opacity-25 text-info">...` |
| 199 | 物流单号 | `document.getElementById('receive-view-logistic-num-label').t...` |

#### `purchase/pages/receive_steps/step1_date.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 47 | 入库日期决定可选发货单范围 | `入库日期决定可选发货单范围：只显示发货日期≤入库日期的发货单...` |
| 47 | 只显示发货日期 | `入库日期决定可选发货单范围：只显示发货日期≤入库日期的发货单...` |
| 47 | 入库日期的发货单 | `入库日期决定可选发货单范围：只显示发货日期≤入库日期的发货单...` |
| 69 | 入库日期 | `入库日期 <i class="fas fa-info-circle ms-1"></i> <span class="te...` |
| 82 | 入库日期用于记录货物实际到达仓库的时间 | `入库日期用于记录货物实际到达仓库的时间，并筛选该日期及之前的发货单...` |
| 82 | 并筛选该日期及之前的发货单 | `入库日期用于记录货物实际到达仓库的时间，并筛选该日期及之前的发货单...` |

#### `purchase/pages/receive_steps/step2_select.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 36 | 已入库的发货单不会出现在列表中 | `已入库的发货单不会出现在列表中，每个发货单只能入库一次...` |
| 36 | 每个发货单只能入库一次 | `已入库的发货单不会出现在列表中，每个发货单只能入库一次...` |
| 60 | 以下是截至入库日期 | `以下是截至入库日期 <strong id="receive-date-display" class="text-info...` |
| 60 | 已发货的发货单 | `以下是截至入库日期 <strong id="receive-date-display" class="text-info...` |
| 60 | 请选择需要入库的发货单 | `以下是截至入库日期 <strong id="receive-date-display" class="text-info...` |
| 68 | 等待加载发货单数据 | `等待加载发货单数据......` |
| 136 | 发货单卡片样式 | `/* 发货单卡片样式 */...` |
| 180 | 入库状态标签 | `/* 入库状态标签 */...` |
| 205 | 入库数量输入框 | `/* 入库数量输入框 */...` |

#### `purchase/pages/receive_steps/step3_confirm.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 11 | 请核对以下入库明细 | `请核对以下入库明细，确认无误后点击下一步完成入库。...` |
| 11 | 确认无误后点击下一步完成入库 | `请核对以下入库明细，确认无误后点击下一步完成入库。...` |
| 71 | 可上传入库单据 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 71 | 验收报告等文件 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 71 | 支持 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 71 | 图片 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 71 | 格式 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 71 | 最大 | `可上传入库单据/验收报告等文件。支持 PDF、图片、Excel、Word 格式，最大 10MB。...` |
| 96 | 确认表格样式 | `/* 确认表格样式 */...` |
| 106 | 发货单号分组行 | `/* 发货单号分组行 */...` |
| 122 | 入库数量高亮 | `/* 入库数量高亮 */...` |
| 132 | 误差标签 | `/* 误差标签 */...` |

#### `purchase/pages/receive_steps/step4_verify.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 13 | 系统正在验证入库数据 | `系统正在验证入库数据......` |
| 25 | 所有入库数据验证通过 | `所有入库数据验证通过，可以提交入库。...` |
| 25 | 可以提交入库 | `所有入库数据验证通过，可以提交入库。...` |
| 48 | 验证完成后显示摘要信息 | `验证完成后显示摘要信息<br>...` |

#### `purchase/pages/receive_steps/step5_finish.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 12 | 货物已成功入库 | `货物已成功入库，库存数据已更新。...` |
| 12 | 库存数据已更新 | `货物已成功入库，库存数据已更新。...` |

#### `purchase/pages/send_add.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 63 | 步骤内容显示控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 63 | 通过 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 63 | 类控制 | `/* 步骤内容显示控制 - GlobalWizard 通过 active 类控制 */...` |
| 71 | 导航按钮布局 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 71 | 返回左对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 71 | 下一步右对齐 | `/* 导航按钮布局 - 返回左对齐，下一步右对齐 */...` |
| 81 | 验证卡片状态样式 | `/* 验证卡片状态样式 */...` |
| 120 | 参数表单样式 | `/* 参数表单样式 */...` |
| 155 | 发货量超出未发量时的橙色闪光提醒 | `/* 发货量超出未发量时的橙色闪光提醒 */...` |

#### `purchase/pages/send_mgmt.html` (33 issues)

| Line | Text | Context |
|------|------|----------|
| 45 | 查看和管理所有发货单 | `查看和管理所有发货单，支持物流信息追踪和文件管理。</p>...` |
| 45 | 支持物流信息追踪和文件管理 | `查看和管理所有发货单，支持物流信息追踪和文件管理。</p>...` |
| 66 | 查看发货单完整信息 | `查看发货单完整信息，包括物流参数和货物明细</span></li>...` |
| 66 | 包括物流参数和货物明细 | `查看发货单完整信息，包括物流参数和货物明细</span></li>...` |
| 70 | 进入修改向导 | `进入修改向导，可调整物流信息和货物数量</span></li>...` |
| 70 | 可调整物流信息和货物数量 | `进入修改向导，可调整物流信息和货物数量</span></li>...` |
| 74 | 查看发货单所有版本的修订历史 | `class="fas fa-history text-secondary"></i> 查看发货单所有版本的修订历史</s...` |
| 78 | 删除发货单 | `class="fas fa-trash text-danger"></i> 删除发货单，<i...` |
| 79 | 可撤销删除 | `class="fas fa-undo text-success"></i> 可撤销删除</span></li>...` |
| 87 | 查看物流账单 | `class="fas fa-file-invoice text-info"></i> 查看物流账单，<i...` |
| 88 | 上传 | `class="fas fa-upload text-warning"></i> 上传/替换账单文件</span></li...` |
| 88 | 替换账单文件 | `class="fas fa-upload text-warning"></i> 上传/替换账单文件</span></li...` |
| 132 | 物流单号 | `物流单号 <i class="fas fa-sort ms-1"></i>...` |
| 135 | 发货日期 | `发货日期 <i class="fas fa-sort ms-1"></i>...` |
| 209 | 风格订单表格 | `Apple风格订单表格...` |
| 224 | 表头 | `/* 表头 */...` |
| 254 | 数据行 | `/* 数据行 */...` |
| 276 | 订单号加粗 | `/* 订单号加粗 */...` |
| 283 | 已删除订单样式 | `/* 已删除订单样式 */...` |
| 298 | 版本 | `/* 版本Badge */...` |
| ... | *13 more items* | ... |

#### `purchase/pages/send_mgmt/send_delete.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 167 | 请填写删除原因 | `请填写删除原因，此信息将记录在操作日志中...` |
| 167 | 此信息将记录在操作日志中 | `请填写删除原因，此信息将记录在操作日志中...` |
| 193 | 正在删除发货单 | `正在删除发货单......` |
| 220 | 物流单号 | `document.getElementById('delete-logistic-num-label').textCon...` |
| 300 | 件货物 | `document.getElementById('delete-preview-items-count').textCo...` |
| 358 | 接收密码对象 | `(passwords) => submitDeleteAsync(passwords),  // onSuccess，接...` |
| 359 | 无需回填 | `null,                      // contextEl (无需回填)...` |

#### `purchase/pages/send_mgmt/send_edit.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 68 | 实例 | `let editPoWizard = null;  // GlobalWizard实例...` |
| 72 | 发货日期 | `let editDateSent = null;  // 发货日期，用于验证...` |
| 72 | 用于验证 | `let editDateSent = null;  // 发货日期，用于验证...` |
| 75 | 是否跳过了流程 | `let editSkippedLogistics = false;   // 是否跳过了流程1（物流修改）...` |
| 75 | 物流修改 | `let editSkippedLogistics = false;   // 是否跳过了流程1（物流修改）...` |
| 76 | 是否跳过了流程 | `let editSkippedItems = false;       // 是否跳过了流程3（明细修改）...` |
| 76 | 明细修改 | `let editSkippedItems = false;       // 是否跳过了流程3（明细修改）...` |
| 178 | 物流单号 | `document.getElementById('edit-po-num-label').textContent = `...` |

#### `purchase/pages/send_mgmt/send_edit_step1.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 49 | 请输入修改原因和备注 | `placeholder="请输入修改原因和备注..."></textarea>...` |
| 161 | 手动填写 | `${logistics.mode === 'A' ? (window.i18n?.t('js.auto_fetch') ...` |
| 205 | 标记是否为手动输入 | `usd_rmb_manual: window.editRateIsManual \|\| false  // 标记是否为手动...` |
| 268 | 获取中 | `if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner...` |
| 289 | 已获取 | `statusEl.innerHTML = `<i class="fas fa-check text-success me...` |
| 289 | 买入价 | `statusEl.innerHTML = `<i class="fas fa-check text-success me...` |
| 325 | 自动获取失败 | `<i class="fas fa-exclamation-triangle me-2"></i>自动获取失败...` |
| 334 | 返回 | `<i class="fas fa-arrow-left me-2"></i>返回...` |

#### `purchase/pages/send_mgmt/send_edit_step2.html` (16 issues)

| Line | Text | Context |
|------|------|----------|
| 19 | 预计到货日期 | `预计到货日期 <i class="fas fa-info-circle ms-1"></i>...` |
| 28 | 托盘数 | `托盘数 <i class="fas fa-info-circle ms-1"></i>...` |
| 37 | 物流单价 | `物流单价(RMB/KG) <i class="fas fa-info-circle ms-1"></i>...` |
| 46 | 发货总重量 | `发货总重量(KG) <i class="fas fa-info-circle ms-1"></i>...` |
| 55 | 物流总价 | `物流总价(RMB) <i class="fas fa-info-circle ms-1"></i>...` |
| 63 | 结算汇率 | `结算汇率(RMB/USD) <i class="fas fa-info-circle ms-1"></i>...` |
| 108 | 验证卡片状态样式 | `/* 验证卡片状态样式 */...` |
| 139 | 参数框等高 | `/* 参数框等高 - 使用flex让同行高度一致 */...` |
| 139 | 使用 | `/* 参数框等高 - 使用flex让同行高度一致 */...` |
| 139 | 让同行高度一致 | `/* 参数框等高 - 使用flex让同行高度一致 */...` |
| 154 | 汇率来源 | `/* 汇率来源tag */...` |
| 217 | 修改备注不能为 | `errors.push({ field: 'note', message: '修改备注不能为(window.i18n?....` |
| 232 | 除修改备注外 | `errors.push({ field: 'general', message: '除修改备注外，至少需要修改一项内容，...` |
| 232 | 至少需要修改一项内容 | `errors.push({ field: 'general', message: '除修改备注外，至少需要修改一项内容，...` |
| 232 | 否则请点击 | `errors.push({ field: 'general', message: '除修改备注外，至少需要修改一项内容，...` |
| 232 | 跳过物流修改 | `errors.push({ field: 'general', message: '除修改备注外，至少需要修改一项内容，...` |

#### `purchase/pages/send_mgmt/send_edit_step3.html` (11 issues)

| Line | Text | Context |
|------|------|----------|
| 84 | 货物明细编辑样式 | `/* 货物明细编辑样式 */...` |
| 121 | 开关样式 | `/* UI Toggle 开关样式 */...` |
| 178 | 当前货物列表 | `let step3Items = [];            // 当前货物列表...` |
| 179 | 原始货物列表 | `let step3OriginalItems = [];    // 原始货物列表（用于Step4对比）...` |
| 179 | 用于 | `let step3OriginalItems = [];    // 原始货物列表（用于Step4对比）...` |
| 179 | 对比 | `let step3OriginalItems = [];    // 原始货物列表（用于Step4对比）...` |
| 180 | 新增行的 | `let step3NewRowId = 1000;       // 新增行的ID起始值...` |
| 180 | 起始值 | `let step3NewRowId = 1000;       // 新增行的ID起始值...` |
| 185 | 加载中 | `tbody.innerHTML = '<tr><td colspan="9" class="text-center py...` |
| 211 | 暂无货物记录 | `tbody.innerHTML = '<tr><td colspan="9" class="text-center py...` |
| 684 | 修改备注不能为 | `message: '修改备注不能为(window.i18n?.t('js.original_shipment') \|\| ...` |

#### `purchase/pages/send_mgmt/send_edit_step4.html` (13 issues)

| Line | Text | Context |
|------|------|----------|
| 144 | 是否有货物明细修改 | `let hasItemChanges = false;  // 是否有货物明细修改...` |
| 154 | 发货量必须为正整数 | `errors.push(`${item.po_sku}: 发货量必须为正整数`);...` |
| 159 | 发货量为 | `errors.push(`${item.po_sku}: 发货量为0时无法标记为规整`);...` |
| 159 | 时无法标记为规整 | `errors.push(`${item.po_sku}: 发货量为0时无法标记为规整`);...` |
| 165 | 发货量超出未发量 | `warnings.push(`${item.po_sku}: 发货量超出未发量 ${Math.abs(unshipped...` |
| 170 | 新增的行视为修改 | `hasItemChanges = true;  // 新增的行视为修改...` |
| 203 | 修改备注不能为 | `errors.push('修改备注不能为(window.i18n?.t('js.original_shipment') ...` |
| 205 | 修改备注不能为 | `errors.push('修改备注不能为(window.i18n?.t('js.original_order') \|\| ...` |
| 216 | 预计到货日期 | `logisticsChanges.push(`预计到货日期: ${orig.date_eta \|\| '-'} → ${l...` |
| 220 | 托盘数 | `logisticsChanges.push(`托盘数: ${orig.pallets \|\| 0} → ${logisti...` |
| 224 | 物流单价 | `logisticsChanges.push(`物流单价: ${orig.price_kg \|\| 0} → ${logis...` |
| 228 | 发货总重量 | `logisticsChanges.push(`发货总重量: ${orig.total_weight \|\| 0} → ${...` |
| 232 | 结算汇率 | `logisticsChanges.push(`结算汇率: ${orig.usd_rmb \|\| 0} → ${logist...` |

#### `purchase/pages/send_mgmt/send_edit_step5.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 268 | 无货物明细 | `<i class="fas fa-inbox me-2"></i>无货物明细...` |
| 309 | 无货物明细修改 | `<i class="fas fa-info-circle me-2"></i>无货物明细修改...` |
| 397 | 项变更 | `statusBadge.textContent = `${changedRows.length} 项变更`;...` |
| 445 | 按钮元素 | `btn,                     // 按钮元素...` |
| 446 | 操作描述 | `(window.i18n?.t('js.edit_shipment') \|\| 'Edit Shipment'),    ...` |

#### `purchase/pages/send_mgmt/send_edit_step6.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 20 | 发货单信息已成功更新 | `发货单信息已成功更新。...` |
| 39 | 提交过程中发生错误 | `提交过程中发生错误。...` |
| 142 | 发货单修改成功 | `let message = `发货单修改成功，新版本号: ${result.data.new_seq}`;...` |
| 142 | 新版本号 | `let message = `发货单修改成功，新版本号: ${result.data.new_seq}`;...` |

#### `purchase/pages/send_mgmt/send_history.html` (7 issues)

| Line | Text | Context |
|------|------|----------|
| 198 | 物流单号 | `document.getElementById('history-logistic-num-label').textCo...` |
| 320 | 删除发货单 | `badgeHtml = '<span class="badge bg-danger"><i class="fas fa-...` |
| 323 | 恢复发货单 | `badgeHtml = '<span class="badge bg-success"><i class="fas fa...` |
| 370 | 整单删除 | `html += '<div class="text-danger small"><i class="fas fa-exc...` |
| 370 | 所有货物数据已清空 | `html += '<div class="text-danger small"><i class="fas fa-exc...` |
| 372 | 发货单已恢复 | `html += '<div class="text-success small"><i class="fas fa-ch...` |
| 372 | 货物数据已重新写入 | `html += '<div class="text-success small"><i class="fas fa-ch...` |

#### `purchase/pages/send_mgmt/send_view.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 216 | 物流单号 | `document.getElementById('view-logistic-num-label').textConte...` |

#### `purchase/pages/send_steps/step1_intro.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 59 | 填写完成后在流程中上传 | `填写完成后在流程中上传Excel文件即可快速完成...` |
| 59 | 文件即可快速完成 | `填写完成后在流程中上传Excel文件即可快速完成...` |
| 79 | 规整 | `（规整：因实际包装可能存在余数超额或不足，发货数量可能与订货数量不完全一致，...` |
| 79 | 因实际包装可能存在余数超额或不足 | `（规整：因实际包装可能存在余数超额或不足，发货数量可能与订货数量不完全一致，...` |
| 79 | 发货数量可能与订货数量不完全一致 | `（规整：因实际包装可能存在余数超额或不足，发货数量可能与订货数量不完全一致，...` |
| 109 | 请选择发货日期 | `title="请选择发货日期">...` |
| 114 | 发货日期决定可发货的订单范围 | `发货日期决定可发货的订单范围（筛选该日期及之前的订单）...` |
| 114 | 筛选该日期及之前的订单 | `发货日期决定可发货的订单范围（筛选该日期及之前的订单）...` |
| 158 | 若选择手动填写 | `若选择手动填写，可跳过此步骤直接点击下方"开始创建"按钮...` |
| 158 | 可跳过此步骤直接点击下方 | `若选择手动填写，可跳过此步骤直接点击下方"开始创建"按钮...` |
| 158 | 开始创建 | `若选择手动填写，可跳过此步骤直接点击下方"开始创建"按钮...` |
| 158 | 按钮 | `若选择手动填写，可跳过此步骤直接点击下方"开始创建"按钮...` |

#### `purchase/pages/send_steps/step2_mode_select.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 41 | 逐步填写物流参数和发货明细 | `逐步填写物流参数和发货明细...` |
| 65 | 上传填写好的发货模板 | `上传填写好的发货模板Excel文件...` |
| 65 | 文件 | `上传填写好的发货模板Excel文件...` |

#### `purchase/pages/send_steps/step3_logistics.html` (9 issues)

| Line | Text | Context |
|------|------|----------|
| 20 | 预计到达日期 | `预计到达日期 <i class="fas fa-info-circle ms-1"></i> <span class="...` |
| 39 | 以下数据来源于您上传的发货模板 | `以下数据来源于您上传的发货模板，如需修改请点击对应输入框进行编辑...` |
| 39 | 如需修改请点击对应输入框进行编辑 | `以下数据来源于您上传的发货模板，如需修改请点击对应输入框进行编辑...` |
| 60 | 物流单号 | `物流单号 <i class="fas fa-info-circle ms-1"></i> <span class="te...` |
| 75 | 托盘数 | `托盘数 <i class="fas fa-info-circle ms-1"></i> <span class="tex...` |
| 92 | 发货总重量 | `发货总重量(KG) <i class="fas fa-info-circle ms-1"></i> <span clas...` |
| 112 | 物流单价 | `物流单价(RMB/KG) <i class="fas fa-info-circle ms-1"></i> <span c...` |
| 133 | 物流总价格 | `物流总价格(RMB) <i class="fas fa-calculator ms-1 text-success"></...` |
| 153 | 结算汇率 | `结算汇率(USD/RMB) <i class="fas fa-info-circle ms-1"></i> <span ...` |

#### `purchase/pages/send_steps/step4_verify_logistics.html` (8 issues)

| Line | Text | Context |
|------|------|----------|
| 22 | 发货日期 | `发货日期 <i class="fas fa-info-circle ms-1"></i>...` |
| 31 | 预计到达日期 | `预计到达日期 <i class="fas fa-info-circle ms-1"></i>...` |
| 40 | 物流单号 | `物流单号 <i class="fas fa-info-circle ms-1"></i>...` |
| 50 | 托盘数 | `托盘数 <i class="fas fa-info-circle ms-1"></i>...` |
| 59 | 发货总重量 | `发货总重量(KG) <i class="fas fa-info-circle ms-1"></i>...` |
| 68 | 物流单价 | `物流单价(RMB/KG) <i class="fas fa-info-circle ms-1"></i>...` |
| 78 | 物流总价格 | `物流总价格(RMB) <i class="fas fa-calculator ms-1 text-success"></...` |
| 87 | 结算汇率 | `结算汇率(USD/RMB) <i class="fas fa-info-circle ms-1"></i>...` |

#### `purchase/pages/send_steps/step5_items.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 27 | 以下数据来源于您上传的发货模板 | `以下数据来源于您上传的发货模板，如需修改请直接编辑对应输入框...` |
| 27 | 如需修改请直接编辑对应输入框 | `以下数据来源于您上传的发货模板，如需修改请直接编辑对应输入框...` |

#### `purchase/pages/send_steps/step7_preview.html` (5 issues)

| Line | Text | Context |
|------|------|----------|
| 46 | 可上传物流单据 | `可上传物流单据/提单等文件。支持 PDF、图片格式，最大 10MB。...` |
| 46 | 提单等文件 | `可上传物流单据/提单等文件。支持 PDF、图片格式，最大 10MB。...` |
| 46 | 支持 | `可上传物流单据/提单等文件。支持 PDF、图片格式，最大 10MB。...` |
| 46 | 图片格式 | `可上传物流单据/提单等文件。支持 PDF、图片格式，最大 10MB。...` |
| 46 | 最大 | `可上传物流单据/提单等文件。支持 PDF、图片格式，最大 10MB。...` |

#### `purchase/pages/strategy.html` (35 issues)

| Line | Text | Context |
|------|------|----------|
| 210 | 电商货物供应商 | `title="A类: 电商货物供应商&#10;B类: 货物依赖品供应商&#10;C类: 耗材和其他供应商">...` |
| 210 | 货物依赖品供应商 | `title="A类: 电商货物供应商&#10;B类: 货物依赖品供应商&#10;C类: 耗材和其他供应商">...` |
| 210 | 耗材和其他供应商 | `title="A类: 电商货物供应商&#10;B类: 货物依赖品供应商&#10;C类: 耗材和其他供应商">...` |
| 255 | 订单价格是否随汇率浮动阈值控制 | `title="订单价格是否随汇率浮动阈值控制">...` |
| 307 | 输入备注 | `placeholder="输入备注..."></textarea>...` |
| 375 | 该供应商在同一生效日期已存在策略记录 | `该供应商在同一生效日期已存在策略记录，是否覆盖现有策略？...` |
| 375 | 是否覆盖现有策略 | `该供应商在同一生效日期已存在策略记录，是否覆盖现有策略？...` |
| 453 | 风格策略表格 | `Apple风格策略表格...` |
| 468 | 表头 | `/* 表头 - 明显区分 */...` |
| 468 | 明显区分 | `/* 表头 - 明显区分 */...` |
| 508 | 数据行 | `/* 数据行 */...` |
| 530 | 代号列加粗 | `/* 代号列加粗 */...` |
| 537 | 名称列左对齐 | `/* 名称列左对齐 */...` |
| 546 | 状态 | `/* 状态Badge */...` |
| 568 | 弱化文案 | `/* 弱化文案 */...` |
| 575 | 功能值显示 | `/* 功能值显示 */...` |
| 594 | 编辑按钮 | `/* 编辑按钮 */...` |
| 616 | 验证卡片状态 | `Wizard 验证卡片状态...` |
| 706 | 合同上传组件实例 | `let contractUploader = null;  // 合同上传组件实例...` |
| 707 | 是否存在同日期策略冲突 | `let hasDateConflict = false;   // 是否存在同日期策略冲突...` |
| ... | *15 more items* | ... |

#### `purchase/pages/supplier_add.html` (29 issues)

| Line | Text | Context |
|------|------|----------|
| 74 | 供应商代号 | `供应商代号 <i class="fas fa-info-circle ms-1"></i>...` |
| 83 | 供应商名称 | `供应商名称 <i class="fas fa-info-circle ms-1"></i>...` |
| 94 | 供应商类别 | `供应商类别 <span class="text-danger">*</span> <i class="fas fa-in...` |
| 108 | 供应商种类 | `供应商种类 <span class="text-danger">*</span> <i class="fas fa-in...` |
| 124 | 使用货币 | `使用货币 <i class="fas fa-info-circle ms-1"></i>...` |
| 145 | 价格浮动 | `价格浮动 <i class="fas fa-info-circle ms-1"></i>...` |
| 170 | 要求定金 | `要求定金 <i class="fas fa-info-circle ms-1"></i>...` |
| 269 | 验证卡片状态样式 | `/* Step2 验证卡片状态样式 */...` |
| 274 | 正常态 | `/* 正常态 */...` |
| 289 | 校验中 | `/* 校验中 */...` |
| 304 | 错误态 | `/* 错误态 */...` |
| 320 | 通过态 | `/* 通过态 */...` |
| 347 | 按钮禁用态 | `/* 按钮禁用态 */...` |
| 516 | 启用 | `<div class="text-white">${floatOn ? '<i class="fas fa-check ...` |
| 516 | 阈值 | `<div class="text-white">${floatOn ? '<i class="fas fa-check ...` |
| 516 | 未启用 | `<div class="text-white">${floatOn ? '<i class="fas fa-check ...` |
| 522 | 启用 | `<div class="text-white">${depoOn ? '<i class="fas fa-check t...` |
| 522 | 比例 | `<div class="text-white">${depoOn ? '<i class="fas fa-check t...` |
| 522 | 未启用 | `<div class="text-white">${depoOn ? '<i class="fas fa-check t...` |
| 585 | 启用 | `current: `启用，阈值=${floatVal}%`...` |
| ... | *9 more items* | ... |


### 📁 reports/

#### `reports/dashboard.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 9 | 生成 | `生成、预览和下载商业智能分析报表。...` |
| 9 | 预览和下载商业智能分析报表 | `生成、预览和下载商业智能分析报表。...` |
| 19 | 商业智能报表 | `{% with hub_id="reports-hub" hub_items=hub_items module_icon...` |
| 126 | 秒后清理 | `}, 30000); // 30秒后清理...` |

#### `reports/partials/generator_form.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 94 | 分析周期 | `<i class="fas fa-calendar-alt text-primary me-2"></i>1. 分析周期...` |
| 114 | 业务参数 | `<i class="fas fa-sliders-h text-info me-2"></i>2. 业务参数...` |
| 123 | 纠纷 | `<label class="form-label text-muted small">Case (纠纷): <span ...` |
| 129 | 退货请求 | `<label class="form-label text-muted small">Request (退货请求): <...` |
| 135 | 退货 | `<label class="form-label text-muted small">Return (退货): <spa...` |
| 141 | 争议 | `<label class="form-label text-muted small">Dispute (争议): <sp...` |


### 📁 sales/

#### `sales/hub.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 15 | 管理销售相关数据 | `管理销售相关数据：交易上传、报表生成、数据可视化。...` |
| 15 | 交易上传 | `管理销售相关数据：交易上传、报表生成、数据可视化。...` |
| 15 | 报表生成 | `管理销售相关数据：交易上传、报表生成、数据可视化。...` |
| 15 | 数据可视化 | `管理销售相关数据：交易上传、报表生成、数据可视化。...` |

#### `sales/pages/report_builder.html` (25 issues)

| Line | Text | Context |
|------|------|----------|
| 51 | 会对指定时间范围内的销售数据进行全面分析 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 包括 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 销量统计 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 利润诊断 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 表现 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 策略 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 客户画像 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 物流效益 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 库存快照 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 51 | 预测和智能补货计算 | `Report Builder会对指定时间范围内的销售数据进行全面分析，包括 SKU 销量统计、利润诊断、Listing ...` |
| 55 | 选择分析周期 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 建议选择完整月份 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 根据业务情况调整耗损率和供应链参数 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 可保持默认 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 点击 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 启动分析引擎 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 开始计算 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 等待进度完成后前往 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 55 | 查看结果 | `1) 选择分析周期（建议选择完整月份）→ 2) 根据业务情况调整耗损率和供应链参数（可保持默认）→ 3) 点击「启动分析...` |
| 59 | 日期范围错误 | `• 日期范围错误：开始日期不能晚于结束日期<br>...` |
| ... | *5 more items* | ... |


### 📁 user_admin/

#### `user_admin/components/actions/delete_panel.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 51 | 取消 | `取消 (Cancel)...` |

#### `user_admin/components/actions/reset_pwd_panel.html` (1 issues)

| Line | Text | Context |
|------|------|----------|
| 53 | 取消 | `取消 (Cancel)...` |

#### `user_admin/components/password_policy/policy_matrix_content.html` (2 issues)

| Line | Text | Context |
|------|------|----------|
| 3 | 按子模块分组 | `{# V2: 按子模块分组，全局保存按钮 #}...` |
| 3 | 全局保存按钮 | `{# V2: 按子模块分组，全局保存按钮 #}...` |

#### `user_admin/components/permissions/permissions_panel.html` (3 issues)

| Line | Text | Context |
|------|------|----------|
| 32 | 已选 | `已选 <span id="perm-count" class="text-info fw-bold">0</span> ...` |
| 32 | 项权限 | `已选 <span id="perm-count" class="text-info fw-bold">0</span> ...` |
| 388 | 权限限制 | `html: `<div class="modal-header border-0"><h5 class="modal-t...` |

#### `user_admin/components/users/user_list_content.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 105 | 管理员可对违规用户进行临时封锁 | `<br>管理员可对违规用户进行临时封锁。...` |
| 109 | 涉及权限提权 | `<br>涉及权限提权/降级的操作将记录在审计日志中。...` |
| 109 | 降级的操作将记录在审计日志中 | `<br>涉及权限提权/降级的操作将记录在审计日志中。...` |
| 117 | 部分敏感权限修改可能需要用户重新登录后生效 | `<br>部分敏感权限修改可能需要用户重新登录后生效。...` |

#### `user_admin/components/users/user_list_panel.html` (4 issues)

| Line | Text | Context |
|------|------|----------|
| 109 | 管理员可对违规用户进行临时封锁 | `<br>管理员可对违规用户进行临时封锁。...` |
| 113 | 涉及权限提权 | `<br>涉及权限提权/降级的操作将记录在审计日志中。...` |
| 113 | 降级的操作将记录在审计日志中 | `<br>涉及权限提权/降级的操作将记录在审计日志中。...` |
| 121 | 部分敏感权限修改可能需要用户重新登录后生效 | `<br>部分敏感权限修改可能需要用户重新登录后生效。...` |

#### `user_admin/components/users/user_row.html` (39 issues)

| Line | Text | Context |
|------|------|----------|
| 38 | 已锁定 | `已锁定...` |
| 43 | 正常 | `正常...` |
| 60 | 模块权限管理 | `onclick="showActionBlockedModal('模块权限管理', '无法修改自己的权限')">...` |
| 60 | 无法修改自己的权限 | `onclick="showActionBlockedModal('模块权限管理', '无法修改自己的权限')">...` |
| 65 | 模块权限管理 | `onclick="showActionBlockedModal('模块权限管理', 'Super Admin 拥有所有权...` |
| 65 | 拥有所有权限 | `onclick="showActionBlockedModal('模块权限管理', 'Super Admin 拥有所有权...` |
| 65 | 无法修改 | `onclick="showActionBlockedModal('模块权限管理', 'Super Admin 拥有所有权...` |
| 76 | 模块权限管理 | `onclick="showActionBlockedModal('模块权限管理', '您没有权限修改该用户的模块权限')...` |
| 76 | 您没有权限修改该用户的模块权限 | `onclick="showActionBlockedModal('模块权限管理', '您没有权限修改该用户的模块权限')...` |
| 84 | 锁定 | `onclick="showActionBlockedModal('锁定/解锁', '无法对自己的账户进行锁定操作')">...` |
| 84 | 解锁 | `onclick="showActionBlockedModal('锁定/解锁', '无法对自己的账户进行锁定操作')">...` |
| 84 | 无法对自己的账户进行锁定操作 | `onclick="showActionBlockedModal('锁定/解锁', '无法对自己的账户进行锁定操作')">...` |
| 111 | 升级角色 | `onclick="showActionBlockedModal('升级角色', '无法对自己的角色进行升级')">...` |
| 111 | 无法对自己的角色进行升级 | `onclick="showActionBlockedModal('升级角色', '无法对自己的角色进行升级')">...` |
| 117 | 升级角色 | `onclick="showActionBlockedModal('升级角色', '{% if user.role_lab...` |
| 117 | 该用户已是最高级别 | `onclick="showActionBlockedModal('升级角色', '{% if user.role_lab...` |
| 117 | 该用户已是管理员 | `onclick="showActionBlockedModal('升级角色', '{% if user.role_lab...` |
| 117 | 无法再升级 | `onclick="showActionBlockedModal('升级角色', '{% if user.role_lab...` |
| 128 | 升级角色 | `onclick="showActionBlockedModal('升级角色', '您没有权限升级该用户的角色')">...` |
| 128 | 您没有权限升级该用户的角色 | `onclick="showActionBlockedModal('升级角色', '您没有权限升级该用户的角色')">...` |
| ... | *19 more items* | ... |

#### `user_admin/pages/register.html` (19 issues)

| Line | Text | Context |
|------|------|----------|
| 58 | 用户名 | `用户名 <span class="text-danger">*</span> <i class="fas fa-info...` |
| 70 | 初始密码 | `初始密码 <span class="text-danger">*</span> <i class="fas fa-inf...` |
| 78 | 确认密码 | `确认密码 <span class="text-danger">*</span> <i class="fas fa-inf...` |
| 189 | 验证卡片状态样式 | `/* Step2 验证卡片状态样式 */...` |
| 194 | 正常态 | `/* 正常态 */...` |
| 209 | 校验中 | `/* 校验中 */...` |
| 224 | 错误态 | `/* 错误态 */...` |
| 240 | 通过态 | `/* 通过态 */...` |
| 267 | 按钮禁用态 | `/* 按钮禁用态 */...` |
| 280 | 向导按钮区域 | `/* 向导按钮区域 */...` |
| 455 | 是第 | `registerWizard.goToStep(2);  // finish 是第3步（index=2）...` |
| 571 | 用户名 | `error: `用户名 "${username}" 已存在`,...` |
| 571 | 已存在 | `error: `用户名 "${username}" 已存在`,...` |
| 576 | 用户名检查失败 | `console.error('用户名检查失败:', e);...` |
| 624 | 不显示给用户 | `'btn_create_user',           // actionKey (不显示给用户)...` |
| 630 | 显示给用户 | `'Register New User',                 // displayName (显示给用户)...` |
| 648 | 使用 | `formData.set('password', password);  // 使用password_1作为密码...` |
| 648 | 作为密码 | `formData.set('password', password);  // 使用password_1作为密码...` |
| 718 | 无法确认时假定未创建 | `return false;  // 无法确认时假定未创建...` |

#### `user_admin/pages/users.html` (6 issues)

| Line | Text | Context |
|------|------|----------|
| 147 | 无法变更角色 | `message: '无法变更角色：' + (event.detail.xhr.responseText \|\| '权限不足...` |
| 147 | 权限不足或系统错误 | `message: '无法变更角色：' + (event.detail.xhr.responseText \|\| '权限不足...` |
| 236 | 操作受限 | `<i class="fas fa-exclamation-triangle me-2"></i>${actionName...` |
| 247 | 了解 | `<i class="fas fa-check me-2"></i>了解...` |
| 266 | 授权失败 | `<i class="fas fa-times-circle me-2"></i>授权失败...` |
| 278 | 了解 | `<i class="fas fa-check me-2"></i>了解...` |


### 📁 visuals/

#### `visuals/index.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 40 | 未解锁状态 | `{# 未解锁状态：使用公有 GlobalModal 机制 #}...` |
| 40 | 使用公有 | `{# 未解锁状态：使用公有 GlobalModal 机制 #}...` |
| 40 | 机制 | `{# 未解锁状态：使用公有 GlobalModal 机制 #}...` |
| 55 | 隐藏的 | `{# 隐藏的 security_inputs（供 GlobalModal 填充） #}...` |
| 55 | 填充 | `{# 隐藏的 security_inputs（供 GlobalModal 填充） #}...` |
| 58 | 移除 | `{# [Fix] 移除 security_inputs，改用 AJAX 提交 #}...` |
| 58 | 改用 | `{# [Fix] 移除 security_inputs，改用 AJAX 提交 #}...` |
| 58 | 提交 | `{# [Fix] 移除 security_inputs，改用 AJAX 提交 #}...` |
| 69 | 背景占位结构 | `{# 背景占位结构（虚化背景） #}...` |
| 69 | 虚化背景 | `{# 背景占位结构（虚化背景） #}...` |
| 85 | 已解锁状态 | `{# 已解锁状态：显示仪表板内容 #}...` |
| 85 | 显示仪表板内容 | `{# 已解锁状态：显示仪表板内容 #}...` |

#### `visuals/partials/v2/filter_panel.html` (12 issues)

| Line | Text | Context |
|------|------|----------|
| 19 | 产品销售 | `<input type="checkbox" name="action_filter" value="产品销售" che...` |
| 23 | 订单取消 | `<input type="checkbox" name="action_filter" value="订单取消" onc...` |
| 27 | 无平台介入主动退货 | `<input type="checkbox" name="action_filter" value="无平台介入主动退货...` |
| 31 | 平台介入用户退货 | `<input type="checkbox" name="action_filter" value="平台介入用户退货"...` |
| 35 | 平台介入强制退货 | `<input type="checkbox" name="action_filter" value="平台介入强制退货"...` |
| 39 | 第三方仅退款 | `<input type="checkbox" name="action_filter" value="第三方仅退款" o...` |
| 52 | 普通邮递 | `<input type="checkbox" name="ship_filter" value="普通邮递" oncha...` |
| 56 | 邮费罚款 | `<input type="checkbox" name="ship_filter" value="邮费罚款" oncha...` |
| 60 | 邮费超支 | `<input type="checkbox" name="ship_filter" value="邮费超支" oncha...` |
| 64 | 包退货邮费 | `<input type="checkbox" name="ship_filter" value="包退货邮费" onch...` |
| 77 | 产品成本 | `<input type="checkbox" name="fee_filter" value="产品成本" onchan...` |
| 81 | 平台费用 | `<input type="checkbox" name="fee_filter" value="平台费用" onchan...` |


---

## 修复指南 / Fix Guide

### 1. HTML 静态文本 / HTML Static Text

**问题 / Issue:**
```html
<span>物流单号</span>
```

**修复 / Fix:**
```html
<span data-i18n="ui.tracking_no">物流单号</span>
```

### 2. JavaScript 模板字符串 / JavaScript Template Literals

**问题 / Issue:**
```javascript
html += `共 ${count} 件货物`;
```

**修复 / Fix:**
```javascript
html += `${window.i18n?.t('js.total_items_prefix') || 'Total '} ${count} ${window.i18n?.t('js.items') || ' items'}`;
```

### 3. Toast 消息 / Toast Messages

**问题 / Issue:**
```javascript
createAndShowToast('操作成功', 'success');
```

**修复 / Fix:**
```javascript
createAndShowToast(window.i18n?.t('toast.operation_success') || 'Operation successful', 'success');
```

---

## 修复进度跟踪 / Fix Progress Tracking

- [ ] layouts/ (全局模板)
- [ ] purchase/ (采购模块)
- [ ] finance/ (财务模块)
- [ ] user_admin/ (用户管理)
- [ ] inventory/ (库存模块)
- [ ] db_admin/ (数据库管理)
- [ ] components/ (公共组件)
- [ ] etl/ (数据导入)
- [ ] log/ (日志模块)
- [ ] products/ (产品模块)
- [ ] sales/ (销售模块)
- [ ] visuals/ (可视化模块)
- [ ] reports/ (报表模块)
- [ ] pages/ (页面模块)
- [ ] errors/ (错误页面)

---

*报告由自动化脚本生成 / Report generated by automation script*
