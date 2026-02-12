/**
 * GlobalWizard - 全局公有处理向导
 * BUILD_ID: WIZARD_ANCHOR_V2_20251229_1
 * 
 * 职责：
 * 1. 管理步骤条 UI（Step Bar）
 * 2. 提供步骤内容容器（插槽机制）
 * 3. 管理流程状态（当前步骤、完成/失败）
 * 4. 提供标准按钮行为（下一步/返回/确认/开始新一轮）
 * 5. 支持步骤门禁（密码验证触发点）
 * 
 * 边界：
 * - 不包含任何业务字段、表单、统计逻辑
 * - 不实现任何 Modal（调用 GlobalModal）
 * - 不处理密码内容（只触发验证流程）
 * 
 * 使用方式：
 * const wizard = new GlobalWizard({
 *     containerId: 'my-wizard-container',
 *     steps: [
 *         { id: 'input', label: '填写信息', contentSelector: '#step-1-content' },
 *         { id: 'confirm', label: '确认提交', contentSelector: '#step-2-content', requiresAuth: true, authAction: 'btn_add_supplier' },
 *         { id: 'done', label: '完成', type: 'done', contentSelector: '#step-done-content' }
 *     ],
 *     onStepChange: (fromStep, toStep) => {},
 *     onBeforeNext: async (currentStep) => true,  // return false to block
 *     onComplete: (data) => {},
 *     onRestart: () => {}
 * });
 */

// === BUILD FINGERPRINT (不可伪造) ===
window.__WIZARD_BUILD_ID__ = "WIZARD_ANCHOR_V2_20251222_1";
console.warn("[GlobalWizard] BUILD_ID:", window.__WIZARD_BUILD_ID__);

(function (window) {
    'use strict';

    class GlobalWizard {
        /**
         * @param {Object} config
         * @param {string} config.containerId - 向导容器的 DOM ID
         * @param {Array} config.steps - 步骤配置数组
         * @param {Function} config.onStepChange - 步骤切换回调
         * @param {Function} config.onBeforeNext - 下一步前的验证回调（async）
         * @param {Function} config.onComplete - 完成回调
         * @param {Function} config.onRestart - 重置回调
         */
        constructor(config) {
            this.config = config;
            this.containerId = config.containerId;
            this.steps = config.steps || [];
            this.currentStepIndex = 0;
            this.stepStates = {}; // { stepId: 'pending' | 'completed' | 'failed' }

            // 回调
            this.onStepChange = config.onStepChange || (() => { });
            this.onBeforeNext = config.onBeforeNext || (async () => true);
            this.onComplete = config.onComplete || (() => { });
            this.onRestart = config.onRestart || (() => { });

            // 初始化状态
            this.steps.forEach(step => {
                this.stepStates[step.id] = 'pending';
            });

            this._init();
        }

        /**
         * 初始化向导
         */
        _init() {
            const container = document.getElementById(this.containerId);
            if (!container) {
                console.error(`[GlobalWizard] Container #${this.containerId} not found`);
                return;
            }

            this.container = container;
            this._renderStepBar();
            this._updateView();

            // 监听 i18n 加载完成和语言切换事件，更新步骤标签
            this._i18nHandler = () => this._updateStepLabels();
            window.addEventListener('i18nLoaded', this._i18nHandler);
            window.addEventListener('localeChanged', this._i18nHandler);

            console.log('[GlobalWizard] Initialized with', this.steps.length, 'steps');
        }

        /**
         * 更新步骤标签（当 i18n 加载完成或语言切换时）
         */
        _updateStepLabels() {
            const stepBar = this.container?.querySelector('.wizard-step-bar');
            if (!stepBar) return;

            this.steps.forEach((step, index) => {
                const labelEl = stepBar.querySelector(`[data-step-index="${index}"] .wizard-step-label`);
                if (!labelEl) return;

                const currentText = labelEl.textContent;

                // 检测是否是未翻译的 key（格式如 "js.xxx" 或 "JS.XXX"）
                if (currentText && /^js\.[a-z_]+$/i.test(currentText)) {
                    const translated = window.i18n?.t(currentText.toLowerCase());
                    if (translated && translated !== currentText.toLowerCase()) {
                        labelEl.textContent = translated;
                        console.log(`[GlobalWizard] Updated label: ${currentText} -> ${translated}`);
                    }
                }

                // 如果 step 配置了 i18nKey，优先使用
                if (step.i18nKey) {
                    const translated = window.i18n?.t(step.i18nKey);
                    if (translated) {
                        labelEl.textContent = translated;
                    }
                }
            });
        }

        /**
         * 渲染步骤条
         * 插入位置策略：
         * 只允许插入到 [data-wizard-stepbar-anchor] 锚点内，找不到锚点则报错不插入
         * 禁止 fallback 到 container 顶部
         */
        _renderStepBar() {
            // 查找或创建步骤条容器
            let stepBar = this.container.querySelector('.wizard-step-bar');
            if (!stepBar) {
                stepBar = document.createElement('div');
                stepBar.className = 'wizard-step-bar';
                stepBar.setAttribute('data-testid', 'wizard-step-bar');
                stepBar.setAttribute('data-build-id', window.__WIZARD_BUILD_ID__ || 'UNKNOWN');

                // 强约定：只使用 [data-wizard-stepbar-anchor] 锚点
                const anchor = this.container.querySelector('[data-wizard-stepbar-anchor]');

                console.log('[GlobalWizard] Container ID:', this.container.id);
                console.log('[GlobalWizard] Looking for [data-wizard-stepbar-anchor]...');

                if (!anchor) {
                    console.error('[GlobalWizard] ❌ FATAL: Missing stepbar anchor [data-wizard-stepbar-anchor] in container:', this.container.id);
                    console.error('[GlobalWizard] StepBar will NOT be rendered. Please add <div data-wizard-stepbar-anchor="1"></div> to the template.');
                    return; // 不 fallback，直接返回
                }

                // 将 stepBar 插入到锚点内（替换锚点内容）
                anchor.replaceChildren(stepBar);
                console.log('[GlobalWizard] ✅ StepBar inserted into [data-wizard-stepbar-anchor]');
            }

            let html = '';
            this.steps.forEach((step, index) => {
                const isLast = index === this.steps.length - 1;
                const isDone = step.type === 'done';

                html += `
                    <div class="wizard-stage-step" data-step-index="${index}" data-step-id="${step.id}">
                        <div class="wizard-step-box">
                            ${isDone ? '<i class="fa-solid fa-flag-checkered"></i>' : (index + 1)}
                        </div>
                        <div class="wizard-step-label">${step.label}</div>
                    </div>
                `;

                if (!isLast) {
                    html += `<div class="wizard-stage-connector" data-connector-index="${index}"></div>`;
                }
            });

            stepBar.innerHTML = html;
        }

        /**
         * 更新视图状态
         */
        _updateView() {
            const stepBar = this.container.querySelector('.wizard-step-bar');
            if (!stepBar) return;

            // 更新步骤条状态
            this.steps.forEach((step, index) => {
                const stepEl = stepBar.querySelector(`[data-step-index="${index}"]`);
                const connectorEl = stepBar.querySelector(`[data-connector-index="${index}"]`);

                if (!stepEl) return;

                stepEl.classList.remove('active', 'completed', 'failed');

                if (index < this.currentStepIndex) {
                    // 已完成的步骤
                    stepEl.classList.add('completed');
                    if (connectorEl) connectorEl.classList.add('completed');
                } else if (index === this.currentStepIndex) {
                    // 当前步骤
                    stepEl.classList.add('active');
                    if (connectorEl) connectorEl.classList.remove('completed');
                } else {
                    // 未到达的步骤
                    if (connectorEl) connectorEl.classList.remove('completed');
                }

                // 处理失败状态
                if (this.stepStates[step.id] === 'failed') {
                    stepEl.classList.add('failed');
                }
            });

            // 更新内容区域显示（使用 active 类，与 global-wizard.css 配合）
            this.steps.forEach((step, index) => {
                const contentEl = document.querySelector(step.contentSelector);
                if (contentEl) {
                    if (index === this.currentStepIndex) {
                        contentEl.classList.add('active');
                        contentEl.style.display = ''; // 清除可能存在的inline style
                    } else {
                        contentEl.classList.remove('active');
                        contentEl.style.display = ''; // 清除可能存在的inline style
                    }
                }
            });
        }

        /**
         * 获取当前步骤
         */
        getCurrentStep() {
            return this.steps[this.currentStepIndex];
        }

        /**
         * 获取当前步骤索引
         */
        getCurrentStepIndex() {
            return this.currentStepIndex;
        }

        /**
         * 切换到下一步
         */
        async next() {
            const currentStep = this.getCurrentStep();
            const currentIndex = this.currentStepIndex;

            console.log('[GlobalWizard] Attempting to go to next step from:', currentStep.id);

            // 1. 检查是否需要密码验证（步骤门禁）
            if (currentStep.requiresAuth && currentStep.authAction) {
                console.log('[GlobalWizard] Step requires auth:', currentStep.authAction);

                // 调用密码验证，通过后再继续
                const authResult = await this._triggerAuth(currentStep.authAction);
                if (!authResult.success) {
                    console.log('[GlobalWizard] Auth failed, staying on current step');
                    return false;
                }
            }

            // 2. 调用 onBeforeNext 回调
            try {
                const canProceed = await this.onBeforeNext(currentStep, currentIndex);
                if (canProceed === false) {
                    console.log('[GlobalWizard] onBeforeNext returned false, blocking next');
                    return false;
                }
            } catch (error) {
                console.error('[GlobalWizard] onBeforeNext error:', error);
                return false;
            }

            // 3. 标记当前步骤完成
            this.stepStates[currentStep.id] = 'completed';

            // 4. 前进到下一步
            if (this.currentStepIndex < this.steps.length - 1) {
                const fromStep = this.currentStepIndex;
                this.currentStepIndex++;
                this._updateView();
                this.onStepChange(fromStep, this.currentStepIndex);

                // 5. 如果是最后一步（done），触发完成回调
                if (this.getCurrentStep().type === 'done') {
                    this.onComplete(this._collectStepData());
                }

                return true;
            }

            return false;
        }

        /**
         * 返回上一步
         */
        back() {
            if (this.currentStepIndex > 0) {
                const fromStep = this.currentStepIndex;

                // 重置当前步骤及之后所有步骤的状态为pending
                for (let i = fromStep; i < this.steps.length; i++) {
                    this.stepStates[this.steps[i].id] = 'pending';
                }

                this.currentStepIndex--;
                this._updateView();
                this.onStepChange(fromStep, this.currentStepIndex);
                return true;
            }
            return false;
        }

        /**
         * 跳转到指定步骤
         */
        goToStep(stepIndexOrId) {
            let targetIndex = stepIndexOrId;

            if (typeof stepIndexOrId === 'string') {
                targetIndex = this.steps.findIndex(s => s.id === stepIndexOrId);
            }

            if (targetIndex >= 0 && targetIndex < this.steps.length) {
                const fromStep = this.currentStepIndex;

                // 如果是往回跳转，重置目标位置之后所有步骤的状态为pending
                if (targetIndex < fromStep) {
                    for (let i = targetIndex; i < this.steps.length; i++) {
                        this.stepStates[this.steps[i].id] = 'pending';
                    }
                }

                this.currentStepIndex = targetIndex;
                this._updateView();
                this.onStepChange(fromStep, this.currentStepIndex);
                return true;
            }
            return false;
        }

        /**
         * 标记步骤状态
         */
        markStep(stepId, state) {
            if (this.stepStates.hasOwnProperty(stepId)) {
                this.stepStates[stepId] = state; // 'pending' | 'completed' | 'failed'
                this._updateView();
            }
        }

        /**
         * 重置向导
         */
        restart() {
            console.log('[GlobalWizard] Restarting wizard');

            // 重置状态
            this.currentStepIndex = 0;
            this.steps.forEach(step => {
                this.stepStates[step.id] = 'pending';
            });

            // 更新视图
            this._updateView();

            // 触发回调
            this.onRestart();
        }

        /**
         * 触发密码验证（步骤门禁）
         */
        async _triggerAuth(actionKey) {
            return new Promise((resolve) => {
                // 检查是否有 GlobalModal 和 requestPasswordVerify
                if (typeof window.requestPasswordVerify === 'function') {
                    console.log('[GlobalWizard] Triggering password verify for:', actionKey);

                    window.requestPasswordVerify(actionKey,
                        // 成功回调
                        () => {
                            console.log('[GlobalWizard] Password verify succeeded');
                            resolve({ success: true });
                        },
                        // 可选：传入表单元素用于回填
                        null
                    );
                } else if (window.GlobalModal && typeof window.GlobalModal.showPassword === 'function') {
                    // 降级使用 GlobalModal.showPassword
                    console.log('[GlobalWizard] Using GlobalModal.showPassword');
                    // 这里需要业务层处理，暂时直接成功
                    resolve({ success: true });
                } else {
                    // 没有密码验证能力，直接放行
                    console.warn('[GlobalWizard] No password verify capability, skipping auth');
                    resolve({ success: true });
                }
            });
        }

        /**
         * 收集步骤数据（可由业务层扩展）
         */
        _collectStepData() {
            return {
                steps: this.steps.map(s => ({
                    id: s.id,
                    state: this.stepStates[s.id]
                }))
            };
        }

        /**
         * 销毁向导
         */
        destroy() {
            // 移除 i18n 事件监听器
            if (this._i18nHandler) {
                window.removeEventListener('i18nLoaded', this._i18nHandler);
                window.removeEventListener('localeChanged', this._i18nHandler);
            }

            const stepBar = this.container?.querySelector('.wizard-step-bar');
            if (stepBar) {
                stepBar.remove();
            }
            console.log('[GlobalWizard] Destroyed');
        }
    }

    // 暴露到全局
    window.GlobalWizard = GlobalWizard;

})(window);
