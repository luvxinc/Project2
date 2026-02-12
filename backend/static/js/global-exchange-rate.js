/**
 * GlobalExchangeRate - 全局汇率输入组件 V1.0
 * 
 * 功能：
 * 1. 输入框 + 自动获取按钮
 * 2. 来源标签 (A=自动获取, M=手动输入)
 * 3. 状态提示文本
 * 4. 失败时弹出 Modal 让用户手动输入
 * 5. 高度可扩展，支持多种使用场景
 * 
 * 使用示例：
 * const rateComponent = new GlobalExchangeRate({
 *     container: '#rate-container',
 *     inputId: 'my-rate-input',
 *     apiUrl: '/api/rate/',
 *     defaultRate: 7.25,
 *     readonly: false,
 *     showSourceTag: true,
 *     showStatusText: true,
 *     dateInputSelector: '#my-date-input',
 *     onChange: (rate, source) => { console.log(rate, source); }
 * });
 */

(function(window) {
    'use strict';
    
    // 来源类型
    const SOURCE_TYPE = {
        AUTO: 'A',      // 自动获取
        MANUAL: 'M',    // 手动输入
        PENDING: '-'    // 待输入
    };
    
    // 来源标签样式
    const SOURCE_BADGES = {
        'A': { text: () => window.i18n?.t('rate.auto') || 'Auto', class: 'bg-success' },
        'M': { text: () => window.i18n?.t('rate.manual') || 'Manual', class: 'bg-warning' },
        '-': { text: () => window.i18n?.t('rate.pending') || 'Pending', class: 'bg-secondary' }
    };
    
    // 默认配置
    const DEFAULT_OPTIONS = {
        container: null,            // 容器选择器或元素
        inputId: null,              // 输入框 ID（必须）
        apiUrl: null,               // 汇率 API URL
        defaultRate: 7.25,          // 默认汇率
        readonly: false,            // 是否只读
        showSourceTag: true,       // 是否显示来源标签
        showStatusText: true,       // 是否显示状态文本
        showFetchButton: true,      // 是否显示获取按钮
        dateInputSelector: null,    // 日期输入框选择器（可选）
        placeholder: () => window.i18n?.t('rate.placeholder') || 'Enter exchange rate',
        label: () => window.i18n?.t('rate.label') || 'Exchange Rate (USD/RMB)',
        tooltip: () => window.i18n?.t('rate.tooltip') || 'Fetch USD/RMB buy rate by date',
        onChange: null,             // 值变化回调 (rate, source) => {}
        onFetchStart: null,         // 开始获取回调
        onFetchSuccess: null,       // 获取成功回调 (rate)
        onFetchError: null,         // 获取失败回调 (error)
        modalFallback: true,        // 获取失败时是否弹出 Modal
        inputClass: 'form-control bg-dark border-secondary text-white',
        buttonClass: 'btn btn-outline-info',
        step: '0.0001',
        min: '0.0001'
    };
    
    class GlobalExchangeRate {
        constructor(options) {
            this.options = { ...DEFAULT_OPTIONS, ...options };
            this.source = SOURCE_TYPE.PENDING;
            this.currentRate = null;
            this.isFetching = false;
            
            // 验证必要参数
            if (!this.options.inputId) {
                console.error('[GlobalExchangeRate] inputId is required');
                return;
            }
            
            // 初始化
            this._init();
        }
        
        /**
         * 初始化
         */
        _init() {
            // 如果提供了 container，则自动渲染 UI
            if (this.options.container) {
                this._render();
            }
            
            // 延迟绑定事件，确保 DOM 已更新
            setTimeout(() => {
                this._bindEvents();
            }, 10);
            
            console.log('[GlobalExchangeRate] Initialized:', this.options.inputId);
        }
        
        /**
         * 渲染 UI（如果提供了 container）
         */
        _render() {
            const container = typeof this.options.container === 'string' 
                ? document.querySelector(this.options.container) 
                : this.options.container;
            
            if (!container) {
                console.error('[GlobalExchangeRate] Container not found');
                return;
            }
            
            // 构建 HTML
            let html = `<div class="input-group">`;
            
            // 输入框
            html += `<input type="number" 
                            class="${this.options.inputClass}" 
                            id="${this.options.inputId}"
                            step="${this.options.step}"
                            min="${this.options.min}"
                            placeholder="${this.options.placeholder}"
                            ${this.options.readonly ? 'readonly' : ''}>`;
            
            // 获取按钮
            if (this.options.showFetchButton) {
                html += `<button type="button" 
                                class="${this.options.buttonClass}" 
                                id="${this.options.inputId}-fetch-btn"
                                title="${this.options.tooltip}">
                            <i class="fas fa-sync-alt"></i>
                        </button>`;
            }
            
            // 来源标签
            if (this.options.showSourceTag) {
                const pendingText = window.i18n?.t('rate.pending') || 'Pending';
                html += `<span class="input-group-text bg-dark border-secondary" id="${this.options.inputId}-source-tag">
                            <span class="badge bg-secondary" style="font-size: 0.65rem;">${pendingText}</span>
                        </span>`;
            }
            
            html += `</div>`;
            
            // 状态文本
            if (this.options.showStatusText) {
                const selectDateText = window.i18n?.t('rate.select_date') || 'Please select a date first';
                html += `<small id="${this.options.inputId}-status" class="text-white-50 mt-1 d-block">
                            <i class="fas fa-clock me-1"></i>${selectDateText}
                        </small>`;
            }
            
            container.innerHTML = html;
        }
        
        /**
         * 绑定事件
         */
        _bindEvents() {
            // 输入框变化
            const input = this._getInput();
            if (input) {
                input.addEventListener('input', () => this._onInput());
            }
            
            // 获取按钮
            const fetchBtn = document.getElementById(`${this.options.inputId}-fetch-btn`);
            if (fetchBtn) {
                fetchBtn.addEventListener('click', () => this.fetchRate());
            }
            
            // 日期输入变化
            if (this.options.dateInputSelector) {
                const dateInput = document.querySelector(this.options.dateInputSelector);
                if (dateInput) {
                    dateInput.addEventListener('change', () => this._onDateChange());
                }
            }
        }
        
        /**
         * 输入框值变化
         */
        _onInput() {
            const input = this._getInput();
            if (!input) return;
            
            const value = parseFloat(input.value);
            
            if (value && value > 0) {
                // 用户手动输入，标记为手动来源
                this.source = SOURCE_TYPE.MANUAL;
                this._updateSourceTag();
                this.currentRate = value;
                
                // 触发回调
                if (this.options.onChange) {
                    this.options.onChange(value, this.source);
                }
            }
        }
        
        /**
         * 日期变化时自动获取汇率
         */
        _onDateChange() {
            const dateInput = document.querySelector(this.options.dateInputSelector);
            if (dateInput && dateInput.value) {
                this.fetchRate(dateInput.value);
            }
        }
        
        /**
         * 获取汇率
         */
        async fetchRate(date = null) {
            if (this.isFetching) return;
            if (!this.options.apiUrl) {
                console.warn('[GlobalExchangeRate] No API URL configured');
                return;
            }
            
            // 如果有日期输入框但没传入日期，从输入框获取
            if (!date) {
                if (this.options.getDateFn && typeof this.options.getDateFn === 'function') {
                    // 优先使用 getDateFn 函数
                    date = this.options.getDateFn();
                } else if (this.options.dateInputSelector) {
                    const dateInput = document.querySelector(this.options.dateInputSelector);
                    date = dateInput ? dateInput.value : null;
                }
            }
            
            this.isFetching = true;
            this._updateStatus('fetching', window.i18n?.t('rate.fetching') || 'Fetching rate...');
            this._setButtonLoading(true);
            
            if (this.options.onFetchStart) {
                this.options.onFetchStart();
            }
            
            try {
                let url = this.options.apiUrl;
                if (date) {
                    url += (url.includes('?') ? '&' : '?') + `date=${encodeURIComponent(date)}`;
                }
                
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.success && data.rate) {
                    this._setRate(data.rate, SOURCE_TYPE.AUTO);
                    this._updateStatus('success', data.rate_desc || `自动获取成功: ${data.rate}`);
                    
                    if (this.options.onFetchSuccess) {
                        this.options.onFetchSuccess(data.rate);
                    }
                } else {
                    // 使用 API 返回的 message
                    throw new Error(data.message || data.error || (window.i18n?.t('rate.fetch_failed') || 'Failed to fetch rate'));
                }
            } catch (error) {
                console.error('[GlobalExchangeRate] Fetch error:', error);
                this._updateStatus('error', error.message || (window.i18n?.t('rate.fetch_failed') || 'Failed to fetch rate, please enter manually'));
                
                if (this.options.onFetchError) {
                    this.options.onFetchError(error);
                }
                
                // 弹出 Modal 让用户手动输入
                if (this.options.modalFallback) {
                    this._showManualInputModal();
                }
            } finally {
                this.isFetching = false;
                this._setButtonLoading(false);
            }
        }
        
        /**
         * 弹出手动输入 Modal
         */
        _showManualInputModal() {
            // 使用 GlobalModal（如果可用）
            if (window.GlobalModal && typeof GlobalModal.showCustom === 'function') {
                const html = `
                    <div class="modal-header border-0">
                        <h5 class="modal-title text-white">
                            <i class="fas fa-exclamation-triangle text-warning me-2"></i>
                            录入汇率
                        </h5>
                    </div>
                    <div class="modal-body">
                        <p class="text-white-50 mb-3">系统无法自动获取汇率，请手动输入：</p>
                        <div class="mb-3">
                            <label class="form-label text-white-50 small">汇率 (USD/RMB)</label>
                            <input type="number" 
                                   class="form-control bg-dark border-warning text-white" 
                                   id="modal-manual-rate"
                                   step="0.0001" min="0.0001" 
                                   placeholder="请输入汇率，如 7.2500"
                                   value="${this.options.defaultRate}">
                        </div>
                    </div>
                    <div class="modal-footer border-0 justify-content-center">
                        <button type="button" class="btn btn-outline-secondary px-4" id="modal-btn-cancel">
                            <i class="fas fa-times me-2"></i>取消
                        </button>
                        <button type="button" class="btn btn-warning px-4" id="modal-btn-confirm">
                            <i class="fas fa-check me-2"></i>确认
                        </button>
                    </div>
                `;
                
                GlobalModal.showCustom({
                    html: html,
                    borderColor: '#ffc107',
                    glowEffect: 'steady',
                    overrideDefault: true,
                    onConfirmOverride: () => {
                        const modalInput = document.getElementById('modal-manual-rate');
                        if (modalInput) {
                            const rate = parseFloat(modalInput.value);
                            if (rate && rate > 0) {
                                this._setRate(rate, SOURCE_TYPE.MANUAL);
                                this._updateStatus('manual', `手动输入: ${rate}`);
                                GlobalModal.hide();
                            } else {
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'text-danger small text-center mt-2';
                                errorDiv.textContent = window.i18n?.t('rate.invalid_rate') || 'Please enter a valid exchange rate';
                                modalInput.parentElement.appendChild(errorDiv);
                            }
                        }
                    }
                });
            } else {
                // 降级：使用 prompt
                const rate = prompt(`系统无法自动获取汇率，请手动输入 (USD/RMB):`, this.options.defaultRate);
                if (rate) {
                    const parsed = parseFloat(rate);
                    if (parsed && parsed > 0) {
                        this._setRate(parsed, SOURCE_TYPE.MANUAL);
                        this._updateStatus('manual', `手动输入: ${parsed}`);
                    }
                }
            }
        }
        
        /**
         * 设置汇率
         */
        _setRate(rate, source) {
            const input = this._getInput();
            if (input) {
                input.value = rate;
            }
            
            this.currentRate = rate;
            this.source = source;
            this._updateSourceTag();
            
            // 触发回调
            if (this.options.onChange) {
                this.options.onChange(rate, source);
            }
        }
        
        /**
         * 更新来源标签
         */
        _updateSourceTag() {
            if (!this.options.showSourceTag) return;
            
            const tagContainer = document.getElementById(`${this.options.inputId}-source-tag`);
            if (!tagContainer) return;
            
            const badge = SOURCE_BADGES[this.source] || SOURCE_BADGES['-'];
            const badgeText = typeof badge.text === 'function' ? badge.text() : badge.text;
            tagContainer.innerHTML = `<span class="badge ${badge.class}" style="font-size: 0.65rem;">${badgeText}</span>`;
        }
        
        /**
         * 更新状态文本
         */
        _updateStatus(type, message) {
            if (!this.options.showStatusText) return;
            
            const statusEl = document.getElementById(`${this.options.inputId}-status`);
            if (!statusEl) return;
            
            let icon = 'fa-clock';
            let colorClass = 'text-white-50';
            
            switch (type) {
                case 'fetching':
                    icon = 'fa-spinner fa-spin';
                    colorClass = 'text-info';
                    break;
                case 'success':
                    icon = 'fa-check-circle';
                    colorClass = 'text-success';
                    break;
                case 'error':
                    icon = 'fa-exclamation-triangle';
                    colorClass = 'text-warning';
                    break;
                case 'manual':
                    icon = 'fa-edit';
                    colorClass = 'text-warning';
                    break;
            }
            
            statusEl.className = `${colorClass} mt-1 d-block`;
            statusEl.innerHTML = `<i class="fas ${icon} me-1"></i>${message}`;
        }
        
        /**
         * 设置按钮加载状态
         */
        _setButtonLoading(loading) {
            const btn = document.getElementById(`${this.options.inputId}-fetch-btn`);
            if (!btn) return;
            
            if (loading) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            } else {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            }
        }
        
        /**
         * 获取输入框元素
         */
        _getInput() {
            return document.getElementById(this.options.inputId);
        }
        
        // ============ 公共 API ============
        
        /**
         * 获取当前汇率
         */
        getRate() {
            return this.currentRate;
        }
        
        /**
         * 获取来源类型 (A/M/-)
         */
        getSource() {
            return this.source;
        }
        
        /**
         * 获取汇率和来源
         */
        getValue() {
            return {
                rate: this.currentRate,
                source: this.source
            };
        }
        
        /**
         * 手动设置汇率
         */
        setRate(rate) {
            this._setRate(rate, SOURCE_TYPE.MANUAL);
        }
        
        /**
         * 重置
         */
        reset() {
            const input = this._getInput();
            if (input) {
                input.value = '';
            }
            this.currentRate = null;
            this.source = SOURCE_TYPE.PENDING;
            this._updateSourceTag();
            this._updateStatus('pending', window.i18n?.t('rate.select_date') || 'Please select a date first');
        }
        
        /**
         * 设置只读状态
         */
        setReadonly(readonly) {
            const input = this._getInput();
            if (input) {
                input.readOnly = readonly;
            }
            this.options.readonly = readonly;
        }
    }
    
    // 暴露到全局
    window.GlobalExchangeRate = GlobalExchangeRate;
    
    // 静态方法：获取来源类型
    GlobalExchangeRate.SOURCE = SOURCE_TYPE;
    
    console.log('[GlobalExchangeRate] Component loaded');
    
})(window);
