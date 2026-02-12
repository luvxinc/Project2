/**
 * 删除操作公共工具函数
 * 
 * [P0-1 优化] 提取删除页面的公共代码
 * 
 * 依赖: 无
 */

const DeleteUtils = (function() {
    'use strict';

    /**
     * 生成结果图标 HTML
     * @param {string} type - 'loading' | 'success' | 'error' | 'warning'
     * @returns {string} HTML 字符串
     */
    function getResultIconHtml(type) {
        const config = {
            loading: {
                html: `<div class="spinner-border text-danger mb-3" style="width: 80px; height: 80px;" role="status"></div>`
            },
            success: {
                html: `<div class="d-inline-flex align-items-center justify-content-center bg-success bg-opacity-25 rounded-circle mb-3" style="width: 80px; height: 80px;">
                    <i class="fas fa-check fa-2x text-success"></i>
                </div>`
            },
            error: {
                html: `<div class="d-inline-flex align-items-center justify-content-center bg-danger bg-opacity-25 rounded-circle mb-3" style="width: 80px; height: 80px;">
                    <i class="fas fa-times fa-2x text-danger"></i>
                </div>`
            },
            warning: {
                html: `<div class="d-inline-flex align-items-center justify-content-center bg-danger bg-opacity-25 rounded-circle mb-3" style="width: 80px; height: 80px;">
                    <i class="fas fa-exclamation-triangle fa-2x text-danger"></i>
                </div>`
            }
        };
        return config[type]?.html || config.loading.html;
    }

    /**
     * 更新结果区域状态
     * @param {Object} options - 配置对象
     * @param {string} options.iconEl - 图标容器选择器
     * @param {string} options.titleEl - 标题选择器
     * @param {string} options.messageEl - 消息选择器
     * @param {string} options.type - 'loading' | 'success' | 'error'
     * @param {string} options.title - 标题文本
     * @param {string} options.message - 消息文本
     */
    function updateResultState(options) {
        const { iconEl, titleEl, messageEl, type, title, message } = options;
        
        const iconContainer = document.querySelector(iconEl);
        const titleContainer = document.querySelector(titleEl);
        const messageContainer = document.querySelector(messageEl);
        
        if (iconContainer) {
            iconContainer.innerHTML = getResultIconHtml(type);
        }
        
        if (titleContainer) {
            titleContainer.textContent = title;
            titleContainer.className = type === 'success' 
                ? 'text-success mb-3' 
                : type === 'error' || type === 'warning'
                    ? 'text-danger mb-3'
                    : 'text-white mb-3';
        }
        
        if (messageContainer) {
            messageContainer.textContent = message;
        }
    }

    /**
     * 创建备注验证函数
     * @param {string} noteInputId - 备注输入框 ID
     * @param {string} confirmBtnId - 确认按钮 ID
     * @param {string} enabledClass - 启用时的按钮类名 (默认 'btn-danger')
     * @returns {Function} 验证函数
     */
    function createNoteValidator(noteInputId, confirmBtnId, enabledClass = 'btn-danger') {
        return function validateNote() {
            const noteInput = document.getElementById(noteInputId);
            const confirmBtn = document.getElementById(confirmBtnId);
            
            if (!noteInput || !confirmBtn) return;
            
            const note = noteInput.value.trim();
            
            if (note.length > 0) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('btn-secondary');
                confirmBtn.classList.add(enabledClass);
            } else {
                confirmBtn.disabled = true;
                confirmBtn.classList.remove(enabledClass);
                confirmBtn.classList.add('btn-secondary');
            }
        };
    }

    /**
     * 创建步骤切换函数
     * @param {string} stepPrefix - 步骤 ID 前缀 (如 'delete-step-')
     * @param {number} totalSteps - 总步骤数
     * @param {Object} wizard - 可选的 GlobalWizard 实例
     * @returns {Function} 切换函数
     */
    function createStepSwitcher(stepPrefix, totalSteps, wizard = null) {
        return function showStep(stepNum) {
            // 隐藏所有步骤
            for (let i = 1; i <= totalSteps; i++) {
                const el = document.getElementById(`${stepPrefix}${i}`);
                if (el) el.style.display = 'none';
            }
            // 显示目标步骤
            const target = document.getElementById(`${stepPrefix}${stepNum}`);
            if (target) target.style.display = 'block';
            
            // 更新向导进度条
            if (wizard) {
                wizard.goToStep(stepNum - 1);
            }
        };
    }

    /**
     * 格式化金额显示
     * @param {number} amount - 金额
     * @param {string} currency - 货币符号 (默认 '$')
     * @returns {string} 格式化后的字符串
     */
    function formatAmount(amount, currency = '$') {
        if (amount == null || isNaN(amount)) return '-';
        return `${currency}${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    /**
     * 格式化数量显示
     * @param {number} quantity - 数量
     * @param {string} unit - 单位 (默认 '件')
     * @returns {string} 格式化后的字符串
     */
    function formatQuantity(quantity, unit = null) {
        if (quantity == null || isNaN(quantity)) return '-';
        const unitText = unit || (window.i18n?.t('unit.piece') || 'pcs');
        return `${quantity} ${unitText}`;
    }

    /**
     * 获取 CSRF Token
     * @returns {string} CSRF Token
     */
    function getCsrfToken() {
        const el = document.querySelector('[name=csrfmiddlewaretoken]');
        return el?.value || '';
    }

    /**
     * 发送 POST 请求
     * @param {string} url - 请求 URL
     * @param {Object} data - 请求数据
     * @returns {Promise<Object>} 响应数据
     */
    async function postJson(url, data) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(data)
        });
        return response.json();
    }

    // 导出公共接口
    return {
        getResultIconHtml,
        updateResultState,
        createNoteValidator,
        createStepSwitcher,
        formatAmount,
        formatQuantity,
        getCsrfToken,
        postJson
    };
})();

// 兼容性: 全局导出
if (typeof window !== 'undefined') {
    window.DeleteUtils = DeleteUtils;
}
