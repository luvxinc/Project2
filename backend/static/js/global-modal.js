/**
 * 全局 Modal 管理器 (Global Modal Manager) - V2.0 Context-Aware
 * 
 * 功能：
 * 1. 统一管理全站 Modal 的显示、隐藏
 * 2. 提供 5 种 Modal 类型：Password, Success, Error, Flow, Custom
 * 3. 统一行为规范：确定=清空上下文+局部刷新，返回=返回上一级
 * 4. 支持 i18n 国际化
 * 5. [V2.0] 上下文感知：支持局部刷新、范围清空、灵活返回
 * 
 * 上下文参数 (V2.0)：
 * - contextSelector: string|null  当前上下文容器selector
 * - refreshTarget: string|null    确认后刷新目标selector（默认=contextSelector）
 * - clearMode: "form"|"inputs"|"none"  清空模式（默认form）
 * - backMode: "parent"|"history"|"none"  返回模式（默认parent）
 * - backUrl: string|null          优先级最高的返回URL
 * - overrideDefault: boolean      是否完全覆盖默认行为（默认false）
 */

(function (window) {
    'use strict';

    // Modal 类型枚举
    const MODAL_TYPES = {
        PASSWORD: 'password',
        SUCCESS: 'success',
        ERROR: 'error',
        FLOW: 'flow',
        CUSTOM: 'custom'
    };

    // Modal 视觉配置
    const MODAL_CONFIG = {
        password: {
            borderColor: '#ffc107',  // 黄色
            glowEffect: 'marquee',    // 跑马灯
            icon: 'fa-lock'
        },
        success: {
            borderColor: '#28a745',  // 绿色
            glowEffect: 'steady',     // 常亮
            icon: 'fa-check-circle'
        },
        error: {
            borderColor: '#dc3545',  // 红色
            glowEffect: 'blink',      // 闪烁
            icon: 'fa-times-circle'
        },
        flow: {
            borderColor: '#007bff',  // 蓝色
            glowEffect: 'none',       // 无
            icon: 'fa-spinner'
        },
        custom: {
            borderColor: '#6c757d',  // 灰色(默认)
            glowEffect: 'none',
            icon: 'fa-cog'
        }
    };

    // 默认上下文配置
    const DEFAULT_CONTEXT = {
        contextSelector: null,
        refreshTarget: null,
        clearMode: 'form',      // 'form' | 'inputs' | 'none'
        backMode: 'none',       // 'parent' | 'history' | 'none' (Default to none for safety)
        backUrl: null,
        overrideDefault: false
    };

    const GlobalModal = {
        currentType: null,
        modalElement: null,
        bsModal: null,
        currentOptions: null,   // [V2.0] 保存当前options供行为方法使用

        // 回调钩子（页面可扩展，但不可覆盖核心行为）
        hooks: {
            beforeConfirm: null,    // 确定前
            afterConfirm: null,     // 确定后（在刷新前）
            beforeBack: null,       // 返回前
            onShow: null,           // Modal 显示时
            onHide: null            // Modal 隐藏时
        },

        /**
         * 初始化 - 绑定全局 Modal 元素
         */
        init() {
            this.modalElement = document.getElementById('globalModal');
            if (!this.modalElement) {
                console.error('[GlobalModal] #globalModal element not found');
                return;
            }
            this.bsModal = new bootstrap.Modal(this.modalElement, {
                backdrop: 'static',  // 点击背景不关闭
                keyboard: false      // ESC 不关闭
            });

            // 绑定事件
            this.modalElement.addEventListener('shown.bs.modal', () => {
                if (this.hooks.onShow) this.hooks.onShow();
            });
            this.modalElement.addEventListener('hidden.bs.modal', () => {
                if (this.hooks.onHide) this.hooks.onHide();
                this._clearModalInputs();
            });

            console.log('[GlobalModal] Initialized (V2.0 Context-Aware)');
        },

        /**
         * [内部] 解析上下文参数，合并默认值
         */
        _parseContextOptions(options) {
            // [V2.1] 清空范围优先 contextSelector，刷新范围优先 refreshTarget
            const contextSelector = options.contextSelector || DEFAULT_CONTEXT.contextSelector;
            const refreshTarget = options.refreshTarget || contextSelector || DEFAULT_CONTEXT.refreshTarget;

            return {
                contextSelector: contextSelector,
                refreshTarget: refreshTarget,
                // [V2.1] 清空范围 = contextSelector（表单所在区域）
                clearTarget: contextSelector,
                clearMode: options.clearMode || DEFAULT_CONTEXT.clearMode,
                backMode: options.backMode || DEFAULT_CONTEXT.backMode,
                backUrl: options.backUrl || DEFAULT_CONTEXT.backUrl,
                overrideDefault: options.overrideDefault || DEFAULT_CONTEXT.overrideDefault
            };
        },

        /**
         * 显示密码验证 Modal
         * @param {object} options
         *   - requiredCodes: ['l0', 'l1', 'l2', 'l3', 'l4'] 需要验证的密码列表
         *   - title: 自定义标题
         *   - desc: 自定义描述（人话，禁止包含actionKey）
         *   - onSubmit: 提交回调 (passwords) => Promise
         *   - [V2.0] contextSelector, refreshTarget, clearMode, backMode, backUrl
         */
        showPassword(options = {}) {
            if (!options.requiredCodes || options.requiredCodes.length === 0) {
                // 无需密码验证，直接执行
                if (options.onSubmit) options.onSubmit({});
                return;
            }

            this.currentType = MODAL_TYPES.PASSWORD;
            const config = MODAL_CONFIG.password;

            // 标准标题和描述（人话，不暴露内部actionKey）
            const title = options.title || window.i18n?.t('modal.password.title') || 'Identity Verification';
            const desc = options.desc || window.i18n?.t('modal.password.desc') || 'This operation requires identity verification';

            // 密码槽位标签映射（人话）
            const SLOT_LABELS = {
                'l0': window.i18n?.t('modal.password.slot_user') || 'User Password',
                'user': window.i18n?.t('modal.password.slot_user') || 'User Password',
                'l1': window.i18n?.t('modal.password.slot_l1') || 'L1 Authorization',
                'l2': window.i18n?.t('modal.password.slot_l2') || 'L2 Authorization',
                'l3': window.i18n?.t('modal.password.slot_l3') || 'L3 Authorization',
                'l4': window.i18n?.t('modal.password.slot_l4') || 'L4 Authorization'
            };

            let inputsHtml = '';
            options.requiredCodes.forEach(code => {
                const label = SLOT_LABELS[code] || (window.i18n?.t('modal.password.password') || 'Password');
                const placeholder = window.i18n?.t('modal.password.placeholder') || 'Enter password';

                inputsHtml += `
                    <div class="mb-3">
                        <label class="form-label text-white-50 small">${label}</label>
                        <input type="password" 
                               class="form-control bg-dark border-secondary text-white modal-password-input"
                               data-code="${code}"
                               placeholder="${placeholder}"
                               autocomplete="new-password">
                    </div>
                `;
            });

            // 按钮：确认 + 取消（取消只关闭modal，不做其他动作）
            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title text-white">
                        <i class="fas ${config.icon} me-2" style="color: ${config.borderColor}"></i>
                        ${title}
                    </h5>
                </div>
                <div class="modal-body">
                    <p class="text-white-50 mb-4 text-center">${desc}</p>
                    <div id="modal-password-inputs">${inputsHtml}</div>
                    <div id="modal-error-msg" class="text-danger small text-center mt-2" style="min-height: 20px;"></div>
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-cancel">
                        <i class="fas fa-times me-2"></i>${window.i18n?.t('common.cancel') || 'Cancel'}
                    </button>
                    <button type="button" class="btn btn-primary px-4" id="modal-btn-confirm">
                        <i class="fas fa-shield-alt me-2"></i>${window.i18n?.t('common.confirm') || 'Confirm'}
                    </button>
                </div>
            `;

            this._renderAndShow(html, config, options);
        },

        /**
         * 显示成功 Modal
         * @param {object} options
         *   - title: 标题
         *   - message: 消息内容
         *   - btnConfirmText: 确定按钮文本
         *   - btnBackText: 返回按钮文本
         *   - [V2.0] contextSelector, refreshTarget, clearMode, backMode, backUrl
         */
        showSuccess(options = {}) {
            this.currentType = MODAL_TYPES.SUCCESS;
            const config = MODAL_CONFIG.success;

            const title = options.title || window.i18n?.t('modal.success.title') || '操作成功';
            const message = options.message || window.i18n?.t('modal.success.default_msg') || '操作已成功完成';
            const btnConfirm = options.btnConfirmText || window.i18n?.t('modal.btn.confirm') || '确定';
            const btnBack = options.btnBackText || window.i18n?.t('modal.btn.back') || '返回';

            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title" style="color: ${config.borderColor}">
                        <i class="fas ${config.icon} me-2"></i>${title}
                    </h5>
                </div>
                <div class="modal-body text-center py-4">
                    <div class="mb-3">
                        <i class="fas ${config.icon} fa-3x" style="color: ${config.borderColor}"></i>
                    </div>
                    <p class="text-white mb-0">${message}</p>
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-back">
                        <i class="fas fa-arrow-left me-2"></i>${btnBack}
                    </button>
                    <button type="button" class="btn btn-success px-4" id="modal-btn-confirm">
                        <i class="fas fa-check me-2"></i>${btnConfirm}
                    </button>
                </div>
            `;

            this._renderAndShow(html, config, options);
        },

        /**
         * 显示错误 Modal
         * @param {object} options
         *   - title: 标题
         *   - message: 错误消息
         *   - errorDetail: 错误详情
         *   - btnResetText: 重置按钮文本
         *   - [V2.0] contextSelector, refreshTarget, clearMode, backMode, backUrl
         */
        showError(options = {}) {
            this.currentType = MODAL_TYPES.ERROR;
            const config = MODAL_CONFIG.error;

            const title = options.title || window.i18n?.t('modal.error.title') || '操作失败';
            const message = options.message || window.i18n?.t('modal.error.default_msg') || '操作失败，请确认信息后重试';
            const btnReset = options.btnResetText || window.i18n?.t('modal.btn.reset') || '重置';
            const btnBack = options.btnBackText || window.i18n?.t('modal.btn.back') || '返回';

            let errorDetailHtml = '';
            if (options.errorDetail) {
                errorDetailHtml = `
                    <div class="alert alert-danger bg-danger bg-opacity-10 border-danger mt-3 mb-0">
                        <small class="text-danger">${options.errorDetail}</small>
                    </div>
                `;
            }

            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title" style="color: ${config.borderColor}">
                        <i class="fas ${config.icon} me-2"></i>${title}
                    </h5>
                </div>
                <div class="modal-body text-center py-4">
                    <div class="mb-3">
                        <i class="fas ${config.icon} fa-3x" style="color: ${config.borderColor}"></i>
                    </div>
                    <p class="text-white mb-0">${message}</p>
                    ${errorDetailHtml}
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-back">
                        <i class="fas fa-arrow-left me-2"></i>${btnBack}
                    </button>
                    <button type="button" class="btn btn-danger px-4" id="modal-btn-confirm">
                        <i class="fas fa-redo me-2"></i>${btnReset}
                    </button>
                </div>
            `;

            this._renderAndShow(html, config, options);
        },

        /**
         * 显示流程 Modal
         * @param {object} options
         *   - title: 标题
         *   - steps: [{name, status}] 步骤列表
         *   - [V2.0] contextSelector, refreshTarget, clearMode, backMode, backUrl
         */
        showFlow(options = {}) {
            this.currentType = MODAL_TYPES.FLOW;
            const config = MODAL_CONFIG.flow;

            const title = options.title || window.i18n?.t('modal.flow.title') || '处理中';

            let stepsHtml = '';
            if (options.steps && options.steps.length > 0) {
                options.steps.forEach((step, idx) => {
                    const statusClass = step.status === 'complete' ? 'text-success' :
                        step.status === 'error' ? 'text-danger' : 'text-white-50';
                    const icon = step.status === 'complete' ? 'fa-check-circle' :
                        step.status === 'error' ? 'fa-times-circle' : 'fa-circle';
                    stepsHtml += `
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas ${icon} ${statusClass} me-3"></i>
                            <span class="text-white">${step.name}</span>
                        </div>
                    `;
                });
            }

            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title text-white">
                        <i class="fas ${config.icon} me-2 fa-spin" style="color: ${config.borderColor}"></i>
                        ${title}
                    </h5>
                </div>
                <div class="modal-body py-4">
                    <div id="modal-flow-steps">${stepsHtml}</div>
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-back">
                        <i class="fas fa-arrow-left me-2"></i>${window.i18n?.t('modal.btn.back') || '返回'}
                    </button>
                    <button type="button" class="btn btn-primary px-4" id="modal-btn-confirm">
                        <i class="fas fa-arrow-right me-2"></i>${window.i18n?.t('modal.btn.continue') || '继续'}
                    </button>
                </div>
            `;

            this._renderAndShow(html, config, options);
        },

        /**
         * 显示自定义 Modal
         * @param {object} options
         *   - html: 自定义 HTML 内容
         *   - borderColor: 边框颜色
         *   - glowEffect: 光效 (steady/blink/marquee/none)
         *   - [V2.0] contextSelector, refreshTarget, clearMode, backMode, backUrl
         */
        showCustom(options = {}) {
            this.currentType = MODAL_TYPES.CUSTOM;
            const config = {
                borderColor: options.borderColor || MODAL_CONFIG.custom.borderColor,
                glowEffect: options.glowEffect || MODAL_CONFIG.custom.glowEffect,
                icon: options.icon || MODAL_CONFIG.custom.icon
            };

            this._renderAndShow(options.html || '', config, options);
        },

        /**
         * 显示确认对话框 Modal
         * @param {object} options
         *   - title: 标题
         *   - message: 确认消息
         *   - confirmLabel: 确认按钮文本（默认"确认"）
         *   - cancelLabel: 取消按钮文本（默认"取消"）
         *   - confirmClass: 确认按钮样式（默认"btn-primary"）
         *   - onConfirm: 确认回调
         *   - onCancel: 取消回调
         */
        showConfirm(options = {}) {
            this.currentType = 'confirm';
            
            const title = options.title || window.i18n?.t('modal.confirm.title') || 'Confirm Action';
            const message = options.message || window.i18n?.t('modal.confirm.message') || 'Are you sure you want to proceed?';
            const confirmLabel = options.confirmLabel || window.i18n?.t('common.confirm') || 'Confirm';
            const cancelLabel = options.cancelLabel || window.i18n?.t('common.cancel') || 'Cancel';
            const confirmClass = options.confirmClass || 'btn-primary';
            const borderColor = confirmClass.includes('danger') ? '#dc3545' : 
                               confirmClass.includes('warning') ? '#ffc107' : '#0d6efd';
            
            const config = {
                borderColor: borderColor,
                glowEffect: 'none',
                icon: 'fa-question-circle'
            };
            
            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title text-white">
                        <i class="fas ${config.icon} me-2" style="color: ${borderColor}"></i>
                        ${title}
                    </h5>
                </div>
                <div class="modal-body text-center py-4">
                    <div class="mb-3">
                        <i class="fas ${config.icon} fa-3x" style="color: ${borderColor}"></i>
                    </div>
                    <p class="text-white mb-0">${message}</p>
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-cancel">
                        <i class="fas fa-times me-2"></i>${cancelLabel}
                    </button>
                    <button type="button" class="btn ${confirmClass} px-4" id="modal-btn-confirm">
                        <i class="fas fa-check me-2"></i>${confirmLabel}
                    </button>
                </div>
            `;
            
            // 保存回调
            this._confirmCallback = options.onConfirm;
            this._cancelCallback = options.onCancel;
            
            this._renderAndShow(html, config, {
                ...options,
                // 覆盖默认行为
                overrideDefault: true,
                onConfirmOverride: () => {
                    // [Fix 2026-01-03] 使用 setTimeout 确保回调在 modal 完全关闭后执行
                    // 延迟 350ms 以等待 Bootstrap modal 关闭动画完成（默认 300ms）
                    const callback = this._confirmCallback;
                    this._confirmCallback = null;
                    this._cancelCallback = null;
                    
                    if (callback) {
                        setTimeout(() => callback(), 350);
                    }
                }
            });
        },

        /**
         * 隐藏 Modal
         */
        hide() {
            if (this.bsModal) {
                this.bsModal.hide();
            }
        },

        /**
         * 内部方法：渲染并显示 Modal
         */
        _renderAndShow(html, config, options) {
            this.currentOptions = options;  // [V2.0] 保存options

            const content = this.modalElement.querySelector('.modal-content');
            content.innerHTML = html;

            // 应用样式
            content.style.borderColor = config.borderColor;
            content.style.borderWidth = '2px';
            content.style.borderStyle = 'solid';

            // 应用光效
            this._applyGlowEffect(content, config.glowEffect, config.borderColor);

            // 绑定按钮事件
            this._bindButtons(options);

            // 显示
            this.bsModal.show();
        },

        /**
         * 内部方法：应用光效
         */
        _applyGlowEffect(element, effect, color) {
            element.classList.remove('glow-steady', 'glow-blink', 'glow-marquee');

            switch (effect) {
                case 'steady':
                    element.classList.add('glow-steady');
                    element.style.setProperty('--glow-color', color);
                    break;
                case 'blink':
                    element.classList.add('glow-blink');
                    element.style.setProperty('--glow-color', color);
                    break;
                case 'marquee':
                    element.classList.add('glow-marquee');
                    element.style.setProperty('--glow-color', color);
                    break;
            }
        },

        /**
         * 内部方法：绑定按钮事件 (V2.0 Context-Aware)
         */
        _bindButtons(options) {
            // 1. 清理上一轮的事件控制器 (确保无残留监听器)
            if (this.listenerController) {
                this.listenerController.abort();
            }
            this.listenerController = new AbortController();
            const { signal } = this.listenerController;

            const confirmBtn = this.modalElement.querySelector('#modal-btn-confirm');
            const backBtn = this.modalElement.querySelector('#modal-btn-back');
            const cancelBtn = this.modalElement.querySelector('#modal-btn-cancel');  // 取消按钮

            // [V2.0] 解析上下文参数
            const ctx = this._parseContextOptions(options);

            if (confirmBtn) {
                confirmBtn.addEventListener('click', async () => {
                    // 防抖：立即禁用按钮
                    confirmBtn.disabled = true;
                    if (backBtn) backBtn.disabled = true;
                    if (cancelBtn) cancelBtn.disabled = true;

                    // 钩子：确定前
                    if (this.hooks.beforeConfirm) {
                        try {
                            const shouldContinue = await this.hooks.beforeConfirm();
                            if (shouldContinue === false) {
                                confirmBtn.disabled = false;
                                if (backBtn) backBtn.disabled = false;
                                if (cancelBtn) cancelBtn.disabled = false;
                                return;
                            }
                        } catch (e) {
                            console.error('[GlobalModal] beforeConfirm hook failed', e);
                            confirmBtn.disabled = false;
                            if (backBtn) backBtn.disabled = false;
                            if (cancelBtn) cancelBtn.disabled = false;
                            return;
                        }
                    }

                    // 如果是密码验证，先收集并验证密码
                    if (this.currentType === MODAL_TYPES.PASSWORD && options.onSubmit) {
                        const passwords = this._collectPasswords();
                        try {
                            await options.onSubmit(passwords);
                            // [FIX] 密码验证成功后：只关闭modal，不执行清空/刷新
                            // 让调用方自行处理后续逻辑（如wizard.goToStep）
                            console.log('[GlobalModal] Password verified - closing modal only, no refresh');
                            this.hide();
                            this._clearModalInputs();
                            return;  // 直接返回，跳过默认的清空/刷新行为
                        } catch (error) {
                            const errorMsg = this.modalElement.querySelector('#modal-error-msg');
                            if (errorMsg) errorMsg.textContent = error.message || (window.i18n?.t('modal.password.verify_failed') || 'Verification failed');
                            confirmBtn.disabled = false;
                            if (backBtn) backBtn.disabled = false;
                            if (cancelBtn) cancelBtn.disabled = false;
                            return;
                        }
                    }

                    // 钩子：确定后（刷新前）
                    if (this.hooks.afterConfirm) {
                        try {
                            await this.hooks.afterConfirm();
                        } catch (e) {
                            console.error('[GlobalModal] afterConfirm hook failed', e);
                        }
                    }

                    // [V2.0] 核心行为：关闭 → 清空上下文 → 刷新上下文（仅非密码验证类型）
                    this.hide();

                    // 检查是否允许完全覆盖
                    if (ctx.overrideDefault && options.onConfirmOverride) {
                        // 完全自定义行为
                        options.onConfirmOverride();
                        return;
                    }

                    // [V2.1] 默认行为：清空(contextSelector) + 刷新(refreshTarget)
                    this._clearContextInputs(ctx.clearTarget, ctx.clearMode);
                    this._refreshContext(ctx.refreshTarget);

                }, { signal });
            }

            // 取消按钮：只关闭modal，不做任何其他动作（保留当前页面状态）
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    console.log('[GlobalModal] Cancel clicked - closing modal only');
                    this.hide();
                    this._clearModalInputs();  // 清空modal内的密码输入
                    // [FIX] 调用取消回调（如有）
                    if (options.onCancel) {
                        options.onCancel();
                    }
                }, { signal });
            }

            // 返回按钮（兼容旧版）：关闭modal + 导航返回
            if (backBtn) {
                backBtn.addEventListener('click', async () => {
                    // 防抖
                    backBtn.disabled = true;
                    if (confirmBtn) confirmBtn.disabled = true;

                    // 钩子：返回前
                    if (this.hooks.beforeBack) {
                        try {
                            const shouldContinue = await this.hooks.beforeBack();
                            if (shouldContinue === false) {
                                backBtn.disabled = false;
                                if (confirmBtn) confirmBtn.disabled = false;
                                return;
                            }
                        } catch (e) {
                            console.error('[GlobalModal] beforeBack hook failed', e);
                            backBtn.disabled = false;
                            if (confirmBtn) confirmBtn.disabled = false;
                            return;
                        }
                    }

                    // [V2.0] 核心行为：关闭 → 返回上一级
                    this.hide();

                    // 检查是否允许完全覆盖
                    if (ctx.overrideDefault && options.onBackOverride) {
                        options.onBackOverride();
                        return;
                    }

                    this._navigateBack(ctx.backUrl, ctx.backMode);

                }, { signal });
            }
        },

        /**
         * [V2.0] 清空上下文范围内的输入控件
         * @param {string|null} selector - 上下文容器 selector
         * @param {string} mode - 清空模式: 'form' | 'inputs' | 'none'
         */
        _clearContextInputs(selector, mode) {
            if (mode === 'none') {
                console.log('[GlobalModal] clearMode=none, skip clearing');
                return;
            }

            let container = null;
            if (selector) {
                container = document.querySelector(selector);
            }

            if (!container) {
                console.log('[GlobalModal] No context container found, clearing modal inputs only');
                this._clearModalInputs();
                return;
            }

            console.log(`[GlobalModal] Clearing inputs in: ${selector}, mode: ${mode}`);

            // 根据 mode 决定清空策略
            if (mode === 'form') {
                // 清空表单：重置所有 form 元素
                const forms = container.querySelectorAll('form');
                forms.forEach(form => form.reset());

                // 也处理非 form 内的输入
                this._clearInputElements(container);
            } else if (mode === 'inputs') {
                // 仅清空输入控件
                this._clearInputElements(container);
            }
        },

        /**
         * [V2.0] 清空指定容器内的所有输入元素
         */
        _clearInputElements(container) {
            // Text inputs, password, email, number, etc.
            container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').forEach(input => {
                const type = input.type.toLowerCase();
                if (type === 'checkbox' || type === 'radio') {
                    input.checked = input.defaultChecked || false;
                } else if (type === 'file') {
                    input.value = '';
                } else {
                    input.value = input.defaultValue || '';
                }
            });

            // Textarea
            container.querySelectorAll('textarea').forEach(textarea => {
                textarea.value = textarea.defaultValue || '';
            });

            // Select
            container.querySelectorAll('select').forEach(select => {
                select.selectedIndex = 0;  // 回到第一个选项
                // 或使用 defaultSelected
                Array.from(select.options).forEach(opt => {
                    opt.selected = opt.defaultSelected;
                });
            });
        },

        /**
         * [V2.0] 刷新上下文区域
         * @param {string|null} selector - 刷新目标 selector
         */
        _refreshContext(selector) {
            // 1. 尝试使用 HTMX 局部刷新
            if (selector && window.htmx) {
                const target = document.querySelector(selector);
                if (target) {
                    // 检查目标是否有 hx-get 属性
                    const hxGet = target.getAttribute('hx-get');
                    if (hxGet) {
                        console.log(`[GlobalModal] HTMX refresh: ${selector} from ${hxGet}`);
                        htmx.ajax('GET', hxGet, { target: selector, swap: 'innerHTML' });
                        return;
                    }

                    // 检查是否可以触发 HTMX 刷新
                    const hxTrigger = target.getAttribute('hx-trigger');
                    if (hxTrigger && hxTrigger.includes('load')) {
                        console.log(`[GlobalModal] HTMX trigger refresh: ${selector}`);
                        htmx.trigger(target, 'load');
                        return;
                    }

                    // 尝试查找父级 HTMX 容器
                    const hxParent = target.closest('[hx-get]');
                    if (hxParent) {
                        const parentHxGet = hxParent.getAttribute('hx-get');
                        const parentId = hxParent.id ? `#${hxParent.id}` : null;
                        if (parentId && parentHxGet) {
                            console.log(`[GlobalModal] HTMX refresh parent: ${parentId} from ${parentHxGet}`);
                            htmx.ajax('GET', parentHxGet, { target: parentId, swap: 'innerHTML' });
                            return;
                        }
                    }
                }
            }

            // 2. 兜底：整页刷新
            console.log('[GlobalModal] Fallback to full page reload');
            window.location.reload();
        },

        /**
         * [V2.0] 导航返回
         * @param {string|null} backUrl - 优先返回 URL
         * @param {string} mode - 返回模式: 'parent' | 'history' | 'none'
         */
        _navigateBack(backUrl, mode) {
            // 1. 优先使用 backUrl
            if (backUrl) {
                console.log(`[GlobalModal] Navigate to: ${backUrl}`);
                window.location.href = backUrl;
                return;
            }

            // 2. 根据 mode 决定
            switch (mode) {
                case 'none':
                    console.log('[GlobalModal] backMode=none, no navigation');
                    break;

                case 'parent':
                case 'history':
                default:
                    // [V2.1] 统一使用 history.back() 兜底
                    // tab→hub 由页面通过 backUrl 参数显式指定
                    console.log('[GlobalModal] history.back()');
                    history.back();
                    break;
            }
        },

        /**
         * 内部方法：收集密码输入
         */
        _collectPasswords() {
            const passwords = {};
            const inputs = this.modalElement.querySelectorAll('.modal-password-input');
            inputs.forEach(input => {
                const code = input.getAttribute('data-code');
                passwords[code] = input.value;
            });
            return passwords;
        },

        /**
         * 内部方法：清空 Modal 内部输入 (原 _clearInputs)
         */
        _clearModalInputs() {
            const inputs = this.modalElement.querySelectorAll('input');
            inputs.forEach(input => {
                input.value = '';
            });
        },

        /**
         * [Deprecated] 保留旧方法名兼容
         */
        _clearInputs() {
            this._clearModalInputs();
        },

        /**
         * 设置钩子（页面可调用）
         */
        setHook(hookName, callback) {
            if (this.hooks.hasOwnProperty(hookName)) {
                this.hooks[hookName] = callback;
            }
        }
    };

    // 挂载到 window
    window.GlobalModal = GlobalModal;

    // DOM Ready 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => GlobalModal.init());
    } else {
        GlobalModal.init();
    }

})(window);
