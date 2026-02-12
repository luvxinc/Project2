/**
 * 发货单向导 JavaScript
 * File: backend/static/js/send_wizard.js
 * 
 * 基于 GlobalWizard 公有类实现
 */

(function () {
    'use strict';

    // =========================================================================
    // i18n 辅助函数
    // =========================================================================
    function _t(key, fallback, params = {}) {
        let text = (window.i18n?.t && window.i18n.t(key)) || fallback;
        Object.keys(params).forEach(k => {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
        });
        return text;
    }

    // =========================================================================
    // 状态数据
    // =========================================================================
    let wizardData = {
        logistics: {},
        items: [],
        isManualRate: false,  // 标记汇率是否为手动输入
        inputMode: null,      // 'manual' or 'excel'
        uploadedExcelData: null  // 上传Excel解析后的数据
    };

    // 流程1生成的模板数据（用于流程2验证）
    let templateData = null;

    // 物流单文件上传组件实例
    let logisticFileUploader = null;

    let wizard = null;

    // =========================================================================
    // DOM Ready
    // =========================================================================
    document.addEventListener('DOMContentLoaded', function () {
        initWizard();
        bindFormEvents();
        bindNavigationButtons();
    });

    // =========================================================================
    // 初始化 GlobalWizard
    // =========================================================================
    function initWizard() {
        wizard = new GlobalWizard({
            containerId: 'send-add-wizard-container',
            steps: [
                { id: 'intro', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_intro')) || 'Instructions', contentSelector: '#send-step-intro' },
                { id: 'mode-select', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_mode_select')) || 'Entry Mode', contentSelector: '#send-step-mode-select' },
                { id: 'logistics', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_logistics')) || 'Logistics', contentSelector: '#send-step-logistics' },
                { id: 'verify-logistics', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_verify_logistics')) || 'Verify Logistics', contentSelector: '#send-step-verify-logistics' },
                { id: 'items', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_items')) || 'Shipment Items', contentSelector: '#send-step-items' },
                { id: 'verify-items', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_verify_items')) || 'Verify Items', contentSelector: '#send-step-verify-items' },
                { id: 'preview', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_preview')) || 'Preview', contentSelector: '#send-step-preview', requiresAuth: true, authAction: 'btn_submit_send' },
                { id: 'finish', label: (window.i18n?.isLoaded && window.i18n.t('wizard.send_done')) || 'Done', type: 'done', contentSelector: '#send-step-finish' }
            ],
            onStepChange: (fromStepIndex, toStepIndex) => {
                const toStep = wizard.steps[toStepIndex];
                const fromStep = wizard.steps[fromStepIndex];

                // 离开发货信息步骤时，先收集数据（用于返回时恢复）
                if (fromStep?.id === 'items') {
                    collectItemsData(true);  // true = 恢复模式，收集所有有输入的行
                }

                // 从流程1进入流程2（模式选择）时，重置上传状态
                if (toStep?.id === 'mode-select' && fromStep?.id === 'intro') {
                    resetModeSelection();
                }

                // 进入物流参数步骤时，同步发货日期显示，获取汇率，填充Excel数据
                if (toStep?.id === 'logistics') {
                    fillLogisticsFromExcel();
                    // 同步发货日期显示（从流程1复制到流程3的只读框）
                    const dateSentInput = document.getElementById('send_date_sent');
                    const dateSentDisplay = document.getElementById('send_date_sent_display');
                    if (dateSentDisplay && dateSentInput) dateSentDisplay.value = dateSentInput.value;
                    // 获取汇率
                    fetchExchangeRate();
                }

                // 进入验证物流步骤时执行验证
                if (toStep?.id === 'verify-logistics') {
                    collectLogisticsData();
                    runLogisticsVerification();
                }

                // 进入发货信息步骤时初始化表格
                if (toStep?.id === 'items') {
                    initItemsTable();
                }

                // 进入验证发货数据步骤时执行验证
                if (toStep?.id === 'verify-items') {
                    collectItemsData();
                    runItemsVerification();
                }

                // 进入预览步骤时渲染预览
                if (toStep?.id === 'preview') {
                    renderPreview();
                }
            },
            onBeforeNext: async (currentStep) => {
                // 模式选择验证
                if (currentStep?.id === 'mode-select') {
                    return wizardData.inputMode !== null;
                }
                // Step 3: 验证物流参数填写完整性
                if (currentStep?.id === 'logistics') {
                    return validateLogisticsForm();
                }
                return true;
            },
            onComplete: (data) => {
                submitSendOrder();
            },
            onRestart: () => {
                wizardData = { logistics: {}, items: [], isManualRate: false, inputMode: null };
                resetForms();
                resetModeSelection();
            }
        });

        // 初始化 tooltips
        initTooltips();

        // 检查是否有可发货的订单
        checkSendAvailability();
    }

    function initTooltips() {
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(el => {
            // 销毁已有的tooltip再重建
            const existing = bootstrap.Tooltip.getInstance(el);
            if (existing) existing.dispose();
            new bootstrap.Tooltip(el);
        });
    }

    // =========================================================================
    // 绑定导航按钮
    // =========================================================================
    function bindNavigationButtons() {
        // Step 1: 下载模板按钮
        document.getElementById('btn-download-template')?.addEventListener('click', () => {
            downloadSendTemplate();
        });

        // Step 1: 发货日期选择变更监听
        document.getElementById('send_date_sent')?.addEventListener('change', function () {
            const dateSent = this.value;
            // 刷新templateData（根据发货日期筛选订单）
            generateTemplateData(dateSent);
            updateStep1NextButton();
        });

        // Step 1: 确认并开始
        document.getElementById('btn-wizard-next-1')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 2 (模式选择): 返回 & 下一步
        document.getElementById('btn-wizard-back-mode')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-mode')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 3 (物流参数): 返回 & 下一步
        document.getElementById('btn-wizard-back-2')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-2')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 4 (验证物流): 返回 & 下一步
        document.getElementById('btn-wizard-back-3')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-3')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 5 (发货信息): 返回 & 下一步
        document.getElementById('btn-wizard-back-4')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-4')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 6 (验证发货): 返回 & 下一步
        document.getElementById('btn-wizard-back-5')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-5')?.addEventListener('click', () => {
            wizard?.next();
        });

        // Step 7 (预览): 返回 & 确认提交
        document.getElementById('btn-wizard-back-6')?.addEventListener('click', () => {
            wizard?.back();
        });
        document.getElementById('btn-wizard-next-6')?.addEventListener('click', () => {
            // 点击确认提交时触发密码验证
            handleConfirmSubmit();
        });

        // Step 8: 新建按钮
        document.getElementById('btn-create-another')?.addEventListener('click', () => {
            wizard?.restart();
        });
    }

    // =========================================================================
    // 表单事件绑定
    // =========================================================================
    function bindFormEvents() {
        // Step 2: 物流参数输入监听
        const fields = ['send_date_sent', 'send_date_eta', 'send_logistic_num',
            'send_pallets', 'send_total_weight', 'send_price_kg', 'send_usd_rmb'];

        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateNextButtonState);
                el.addEventListener('change', updateNextButtonState);
            }
        });

        // 自动计算总价
        ['send_total_weight', 'send_price_kg'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', calculateTotalPrice);
        });

        // 刷新汇率按钮
        document.getElementById('btn-refresh-rate')?.addEventListener('click', fetchExchangeRate);

        // 模态框确认按钮
        document.getElementById('btn-confirm-rate')?.addEventListener('click', onConfirmManualRate);
    }

    // =========================================================================
    // Step 2: 物流参数表单逻辑
    // =========================================================================
    function validateLogisticsForm() {
        const dateSent = document.getElementById('send_date_sent')?.value;
        const dateEta = document.getElementById('send_date_eta')?.value;
        const logisticNum = document.getElementById('send_logistic_num')?.value?.trim();
        const pallets = document.getElementById('send_pallets')?.value;
        const totalWeight = document.getElementById('send_total_weight')?.value;
        const priceKg = document.getElementById('send_price_kg')?.value;
        const usdRmb = document.getElementById('send_usd_rmb')?.value;

        const isValid = dateSent && dateEta && logisticNum &&
            pallets !== '' && parseInt(pallets) >= 0 &&
            parseFloat(totalWeight) > 0 &&
            parseFloat(priceKg) > 0 && parseFloat(usdRmb) >= 1;

        return isValid;
    }

    // 标记是否正在显示modal（防止重复验证）
    let isShowingRateModal = false;

    function updateNextButtonState() {
        if (isShowingRateModal) return;  // Modal显示时不更新
        const isValid = validateLogisticsForm();
        const nextBtn = document.getElementById('btn-wizard-next-2');
        if (nextBtn) {
            nextBtn.disabled = !isValid;
        }
    }

    function calculateTotalPrice() {
        const weight = parseFloat(document.getElementById('send_total_weight')?.value) || 0;
        const price = parseFloat(document.getElementById('send_price_kg')?.value) || 0;
        const ceilWeight = Math.ceil(weight); // 进一法取整
        const total = (ceilWeight * price).toFixed(2);

        const totalEl = document.getElementById('send_total_price');
        if (totalEl) {
            totalEl.value = total;
        }

        // 更新按钮状态
        updateNextButtonState();
    }

    async function fetchExchangeRate() {
        const dateSent = document.getElementById('send_date_sent')?.value;
        if (!dateSent) return;

        const statusEl = document.getElementById('rate-status');
        const rateInput = document.getElementById('send_usd_rmb');

        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>正在获取汇率...';
            statusEl.className = 'text-info mt-1 d-block';
        }

        try {
            const res = await fetch(`/dashboard/purchase/api/po/exchange-rate/?date=${dateSent}`);
            const data = await res.json();
            if (data.success && data.rate && !data.need_manual) {
                // 成功获取真实汇率
                if (rateInput) {
                    rateInput.value = data.rate;
                    rateInput.readOnly = true;
                }
                wizardData.isManualRate = false;
                wizardData.exchangeRateSource = data.rate_desc || '自动获取';
                wizardData.exchangeRateDate = data.rate_date || dateSent;
                if (statusEl) {
                    const rateDesc = data.rate_desc ? ` (${data.rate_desc})` : '';
                    statusEl.innerHTML = `<i class="fas fa-check-circle me-1"></i>汇率已自动获取${rateDesc}`;
                    statusEl.className = 'text-success mt-1 d-block small';
                }
                updateNextButtonState();
            } else if (data.need_manual) {
                // 需要手动输入
                wizardData.exchangeRateDate = dateSent;
                showExchangeRateInputModal(data.message, data.is_future);
            } else {
                // 未知响应
                wizardData.exchangeRateDate = dateSent;
                showExchangeRateInputModal('无法获取汇率，请手动输入', false);
            }
        } catch (err) {
            console.error('[SendWizard] Exchange rate fetch error:', err);
            // 网络错误，需要手动输入
            wizardData.exchangeRateDate = dateSent;
            showExchangeRateInputModal('网络错误，无法获取汇率，请手动输入', false);
        }
    }

    function showExchangeRateInputModal(message, isFuture) {
        const statusEl = document.getElementById('rate-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>需要手动输入汇率';
            statusEl.className = 'text-warning mt-1 d-block small';
        }

        // 使用GlobalModal显示自定义内容
        if (window.GlobalModal) {
            const alertClass = isFuture ? 'alert-warning' : 'alert-info';
            const alertIcon = isFuture ? 'fa-calendar-alt' : 'fa-info-circle';

            const html = `
                <div class="modal-header border-0">
                    <h5 class="modal-title text-warning">
                        <i class="fas fa-exchange-alt me-2"></i>请输入汇率
                    </h5>
                </div>
                <div class="modal-body">
                    <div class="alert ${alertClass} mb-3">
                        <i class="fas ${alertIcon} me-2"></i>
                        <small>${message}</small>
                    </div>
                    <label class="form-label text-white-50 small">USD/RMB 买入价 <span class="text-danger">*</span></label>
                    <input type="number" 
                           class="form-control bg-dark border-secondary text-white" 
                           id="gm_exchange_rate" 
                           step="0.0001" 
                           min="1" 
                           placeholder="例如: 7.2500">
                    <div id="gm_rate_error" class="text-danger small mt-2" style="display:none;">请输入有效的汇率（必须 >= 1）</div>
                </div>
                <div class="modal-footer border-0 justify-content-center">
                    <button type="button" class="btn btn-outline-secondary px-4" id="rate-modal-cancel">
                        取消
                    </button>
                    <button type="button" class="btn btn-warning px-4" id="rate-modal-confirm">
                        <i class="fas fa-check me-2"></i>确认
                    </button>
                </div>
            `;

            GlobalModal.showCustom({
                html: html,
                borderColor: '#ffc107',
                glowEffect: 'none',
                backMode: 'none',
                clearMode: 'none'
            });

            // 绑定自定义按钮事件（使用不同的ID避开GlobalModal自动绑定）
            setTimeout(function () {
                // 取消按钮
                const cancelBtn = document.getElementById('rate-modal-cancel');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function () {
                        GlobalModal.hide();
                        wizard?.back();
                    });
                }

                // 确认按钮
                const confirmBtn = document.getElementById('rate-modal-confirm');
                if (confirmBtn) {
                    confirmBtn.addEventListener('click', function () {
                        const input = document.getElementById('gm_exchange_rate');
                        const rate = parseFloat(input?.value);

                        if (!rate || rate < 1) {
                            const errEl = document.getElementById('gm_rate_error');
                            if (errEl) errEl.style.display = 'block';
                            input?.focus();
                            return;
                        }

                        // 设置汇率
                        const rateInput = document.getElementById('send_usd_rmb');
                        if (rateInput) {
                            rateInput.value = rate;
                            rateInput.readOnly = false;
                        }

                        wizardData.isManualRate = true;
                        wizardData.exchangeRateSource = '手动输入';

                        const statusEl = document.getElementById('rate-status');
                        if (statusEl) {
                            statusEl.innerHTML = '<i class="fas fa-user-edit me-1"></i>汇率已手动输入';
                            statusEl.className = 'text-info mt-1 d-block small';
                        }

                        // 关闭modal
                        GlobalModal.hide();
                        updateNextButtonState();
                    });
                }
            }, 100);
        }
    }


    function collectLogisticsData() {
        wizardData.logistics = {
            date_sent: document.getElementById('send_date_sent')?.value,
            date_eta: document.getElementById('send_date_eta')?.value,
            logistic_num: document.getElementById('send_logistic_num')?.value?.trim(),
            pallets: parseInt(document.getElementById('send_pallets')?.value) || 0,
            total_weight: Math.ceil(parseFloat(document.getElementById('send_total_weight')?.value) || 0),
            price_kg: parseFloat(document.getElementById('send_price_kg')?.value) || 0,
            total_price: parseFloat(document.getElementById('send_total_price')?.value) || 0,
            usd_rmb: parseFloat(document.getElementById('send_usd_rmb')?.value) || 1,

            is_manual_rate: wizardData.isManualRate
        };
    }

    // =========================================================================
    // Step 3: 验证物流参数
    // =========================================================================
    function runLogisticsVerification() {
        const card = document.getElementById('logistics-verify-card');
        const statusEl = document.getElementById('logistics-verify-status');
        const errorPanel = document.getElementById('logistics-error-panel');
        const errorList = document.getElementById('logistics-error-list');
        const modifiedPanel = document.getElementById('logistics-modified-panel');
        const modifiedList = document.getElementById('logistics-modified-list');
        const nextBtn = document.getElementById('btn-wizard-next-3');

        // 设置加载状态
        card.className = 'card state-loading mb-4';
        statusEl.innerHTML = '<span class="badge bg-warning text-dark"><i class="fas fa-spinner fa-spin me-1"></i>验证中...</span>';
        nextBtn.disabled = true;
        modifiedPanel.style.display = 'none';
        errorPanel.style.display = 'none';

        // 显示数据
        document.getElementById('verify-date-sent').textContent = wizardData.logistics.date_sent || '-';
        document.getElementById('verify-date-eta').textContent = wizardData.logistics.date_eta || '-';
        document.getElementById('verify-logistic-num').textContent = wizardData.logistics.logistic_num || '-';
        document.getElementById('verify-pallets').textContent = wizardData.logistics.pallets || '0';
        document.getElementById('verify-total-weight').textContent = wizardData.logistics.total_weight + ' KG';
        document.getElementById('verify-price-kg').textContent = '¥' + wizardData.logistics.price_kg.toFixed(4);
        document.getElementById('verify-total-price').textContent = '¥' + wizardData.logistics.total_price.toFixed(2);
        document.getElementById('verify-usd-rmb').textContent = wizardData.logistics.usd_rmb;

        // 检测物流数据修改（Excel模式）
        const modifications = checkLogisticsModifications();
        if (modifications.length > 0) {
            modifiedPanel.style.display = 'block';
            modifiedList.innerHTML = modifications.map(m => `<li>${m}</li>`).join('');
        }

        // 调用验证API - 附带最晚订单日期用于验证
        const verifyData = {
            ...wizardData.logistics,
            latest_order_date: getLatestOrderDate()
        };

        fetch('/dashboard/purchase/api/send/validate_logistics/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify(verifyData)
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    card.className = 'card mb-4 state-success';
                    statusEl.innerHTML = '<span class="badge bg-success"><i class="fas fa-check me-1"></i>验证通过</span>';
                    errorPanel.style.display = 'none';
                    nextBtn.disabled = false;
                    wizard?.markStep('verify-logistics', 'completed');
                } else {
                    card.className = 'card mb-4 state-error';
                    statusEl.innerHTML = '<span class="badge bg-danger"><i class="fas fa-times me-1"></i>验证失败</span>';
                    errorPanel.style.display = 'block';
                    // 字段名中文映射（避免暴露数据库字段名）
                    const fieldLabels = {
                        'date_sent': '发货日期',
                        'date_eta': '预计到达日期',
                        'logistic_num': '物流单号',
                        'pallets': '托盘数',
                        'total_weight': '发货重量',
                        'price_kg': '物流单价',
                        'total_price': '物流总价',
                        'usd_rmb': '美元汇率'
                    };
                    errorList.innerHTML = data.errors.map(e => {
                        const label = fieldLabels[e.field] || e.field;
                        return `<li><strong>${label}</strong>: ${e.message}</li>`;
                    }).join('');
                    nextBtn.disabled = true;
                    wizard?.markStep('verify-logistics', 'failed');
                }
            })
            .catch(err => {
                console.error('[SendWizard] Verify error:', err);
                card.className = 'card mb-4 state-error';
                statusEl.innerHTML = '<span class="badge bg-danger"><i class="fas fa-times me-1"></i>验证错误</span>';
                errorPanel.style.display = 'block';
                errorList.innerHTML = '<li>网络请求失败，请重试</li>';
                nextBtn.disabled = true;
                wizard?.markStep('verify-logistics', 'failed');
            });
    }

    // =========================================================================
    // 流程5: 录入发货信息
    // =========================================================================

    // 订单号颜色列表（用于区分同一供应商内不同订单）
    const ORDER_COLORS = [
        '#17a2b8', // cyan
        '#ffc107', // yellow
        '#28a745', // green
        '#e83e8c', // pink
        '#fd7e14', // orange
        '#6f42c1', // purple
        '#20c997', // teal
        '#dc3545', // red
    ];

    // 初始化发货信息表格
    function initItemsTable() {
        const container = document.getElementById('items-container');
        const excelNotice = document.getElementById('items-excel-notice');
        const countBadge = document.getElementById('items-count-badge');
        const nextBtn = document.getElementById('btn-wizard-next-4');

        if (!container) return;

        // 清空容器
        container.innerHTML = '';

        // 显示/隐藏Excel提示
        if (excelNotice) {
            excelNotice.style.display = wizardData.inputMode === 'excel' ? 'block' : 'none';
        }

        // 获取基础数据（从templateData）
        if (!templateData || !templateData.items || templateData.items.length === 0) {
            container.innerHTML = '<div class="text-center text-white-50 py-4">暂无待发订单数据</div>';
            if (countBadge) countBadge.textContent = '共 0 条待发记录';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }

        // 获取Excel上传的数据（如果是Excel模式）
        const excelItems = wizardData.inputMode === 'excel' && wizardData.uploadedExcelData?.items
            ? wizardData.uploadedExcelData.items
            : [];

        // 按供应商（订单号前2位）分组
        const supplierGroups = {};
        templateData.items.forEach((item, index) => {
            const poNum = item.C || '';
            const supplierCode = poNum.substring(0, 2).toUpperCase() || 'XX';

            if (!supplierGroups[supplierCode]) {
                supplierGroups[supplierCode] = [];
            }
            supplierGroups[supplierCode].push({ ...item, originalIndex: index });
        });

        // 为每个供应商创建卡片
        Object.keys(supplierGroups).sort().forEach(supplierCode => {
            const items = supplierGroups[supplierCode];

            // 收集该供应商下的所有订单号并分配颜色
            const orderNumbers = [...new Set(items.map(i => i.C))];
            const orderColorMap = {};
            orderNumbers.forEach((orderNum, idx) => {
                orderColorMap[orderNum] = ORDER_COLORS[idx % ORDER_COLORS.length];
            });

            // 创建供应商卡片
            const card = document.createElement('div');
            card.className = 'card bg-dark border-secondary border-opacity-25 mb-3';
            card.innerHTML = `
                <div class="card-header bg-secondary bg-opacity-10 border-0 d-flex justify-content-between align-items-center py-2">
                    <div>
                        <i class="fas fa-industry me-2 text-info"></i>
                        <span class="text-white fw-bold">供应商: ${supplierCode}</span>
                    </div>
                    <span class="badge bg-secondary bg-opacity-50 text-white">${items.length} 条记录</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-dark table-hover table-striped mb-0 table-sm">
                            <thead>
                                <tr>
                                    <th class="text-white-50 small" style="min-width: 90px;">订单日期</th>
                                    <th class="text-white-50 small" style="min-width: 130px;">订单号</th>
                                    <th class="text-white-50 small" style="min-width: 110px;">SKU</th>
                                    <th class="text-white-50 small text-end" style="min-width: 70px;">订货量</th>
                                    <th class="text-white-50 small text-end" style="min-width: 70px;">已发量</th>
                                    <th class="text-white-50 small text-end" style="min-width: 70px;">未发量</th>
                                    <th class="text-white-50 small text-center" style="min-width: 90px;"><span class="text-warning">发货量</span></th>
                                    <th class="text-white-50 small text-center" style="min-width: 70px;"><span class="text-warning">规整</span></th>
                                    <th class="text-white-50 small" style="min-width: 90px;">备注</th>
                                </tr>
                            </thead>
                            <tbody class="supplier-tbody" data-supplier="${supplierCode}">
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.appendChild(card);

            // 填充表格行
            const tbody = card.querySelector('.supplier-tbody');
            items.forEach(item => {
                const index = item.originalIndex;
                const templateRow = item.row;
                const excelItem = excelItems.find(e => e.row === templateRow);

                // 优先从 wizardData.items 恢复数据（用于返回时保留状态）
                const savedItem = wizardData.items.find(w =>
                    w.po_num === item.C && w.po_sku === item.D
                );

                let defaultSendQty = '';
                let defaultRounded = false;

                if (savedItem) {
                    // 从之前保存的数据恢复
                    defaultSendQty = savedItem.send_quantity > 0 ? savedItem.send_quantity : '';
                    defaultRounded = savedItem.is_rounded === true;
                } else if (excelItem && excelItem.send_quantity > 0) {
                    // 从Excel数据恢复
                    defaultSendQty = excelItem.send_quantity;
                    defaultRounded = excelItem.is_rounded === true;
                }

                const originalRemaining = parseInt(item.G) || 0;
                const adjustedRemaining = defaultSendQty ? Math.max(0, originalRemaining - defaultSendQty) : originalRemaining;

                const orderColor = orderColorMap[item.C] || '#17a2b8';

                const tr = document.createElement('tr');
                tr.dataset.index = index;
                tr.innerHTML = `
                    <td class="text-white small">${item.B || '-'}</td>
                    <td class="small fw-bold" style="color: ${orderColor}">${item.C || '-'}</td>
                    <td class="text-white small">${item.D || '-'}</td>
                    <td class="text-white small text-end">${item.E || 0}</td>
                    <td class="text-white small text-end">${item.F || 0}</td>
                    <td class="text-white small text-end remaining-cell ${defaultSendQty ? 'text-warning' : ''}" data-original="${originalRemaining}">${adjustedRemaining}</td>
                    <td class="text-center">
                        <input type="number" 
                               class="form-control form-control-sm bg-dark border-warning text-warning text-center send-qty-input" 
                               data-index="${index}"
                               value="${defaultSendQty}"
                               min="1"
                               step="1"
                               placeholder="-"
                               style="width: 70px; margin: 0 auto;">
                    </td>
                    <td class="text-center">
                        <label class="ui-toggle ui-toggle-sm">
                            <input type="checkbox" class="rounded-toggle-input" data-index="${index}" ${defaultRounded ? 'checked' : ''}>
                            <span class="ui-toggle-track"></span>
                        </label>
                    </td>
                    <td class="text-white-50 small">${item.J || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        });

        // 更新记录数
        if (countBadge) countBadge.textContent = `共 ${templateData.items.length} 条待发记录`;

        // 绑定事件
        bindItemsEvents();

        // 更新按钮状态
        updateItemsNextButton();
    }

    // 绑定发货信息表格事件
    function bindItemsEvents() {
        const container = document.getElementById('items-container');
        if (!container) return;

        // 发货量输入事件
        container.querySelectorAll('.send-qty-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                const value = e.target.value.trim();

                // 验证：只接受正整数或空
                if (value !== '') {
                    const num = parseInt(value);
                    if (isNaN(num) || num <= 0) {
                        e.target.value = '';
                    } else {
                        e.target.value = num;
                    }
                }

                // 更新未发量
                updateRemainingQuantity(index);

                // 更新按钮状态
                updateItemsNextButton();
            });

            // 防止输入非数字
            input.addEventListener('keypress', (e) => {
                if (!/[0-9]/.test(e.key)) {
                    e.preventDefault();
                }
            });
        });

        // checkbox的change事件（规整开关）
        container.querySelectorAll('.rounded-toggle-input').forEach(cb => {
            cb.addEventListener('change', () => {
                const index = parseInt(cb.dataset.index);
                onRoundedToggleChange(index);  // 更新闪光状态
                updateItemsNextButton();
            });
        });
    }

    // 更新未发量（实时计算）
    function updateRemainingQuantity(index) {
        const row = document.querySelector(`#items-container tr[data-index="${index}"]`);
        if (!row) return;

        const remainingCell = row.querySelector('.remaining-cell');
        const sendQtyInput = row.querySelector('.send-qty-input');
        const checkbox = row.querySelector('.rounded-toggle-input');

        if (!remainingCell || !sendQtyInput) return;

        const originalRemaining = parseInt(remainingCell.dataset.original) || 0;
        const sendQty = parseInt(sendQtyInput.value) || 0;

        // 允许负数（发货量超过未发量）
        const newRemaining = originalRemaining - sendQty;
        remainingCell.textContent = newRemaining;

        // 高亮显示变化
        if (sendQty > 0) {
            remainingCell.classList.add('text-warning');
        } else {
            remainingCell.classList.remove('text-warning');
        }

        // 未发量为0时：禁用规整checkbox并取消勾选
        if (checkbox) {
            if (newRemaining === 0) {
                checkbox.checked = false;
                checkbox.disabled = true;
                checkbox.closest('.ui-toggle')?.setAttribute('title', '未发量为0时无法规整');
            } else {
                checkbox.disabled = false;
                checkbox.closest('.ui-toggle')?.removeAttribute('title');
            }
        }

        // 负数处理：如果未发量变成负数且规整按钮关闭，发货量输入框闪橙色光
        if (newRemaining < 0) {
            remainingCell.classList.add('text-danger');
            remainingCell.classList.remove('text-warning');

            // 检查规整按钮状态
            if (checkbox && !checkbox.checked) {
                // 规整关闭，添加橙色闪光提醒
                sendQtyInput.classList.add('rounded-warning-flash');
            } else {
                // 规整打开，移除橙色闪光
                sendQtyInput.classList.remove('rounded-warning-flash');
            }
        } else {
            remainingCell.classList.remove('text-danger');
            sendQtyInput.classList.remove('rounded-warning-flash');
        }
    }

    // 规整开关变化时更新闪光状态
    function onRoundedToggleChange(index) {
        updateRemainingQuantity(index);
    }

    // 更新下一步按钮状态
    function updateItemsNextButton() {
        const nextBtn = document.getElementById('btn-wizard-next-4');
        if (!nextBtn) return;

        // 检查是否至少有一行填写了发货量
        const inputs = document.querySelectorAll('#items-container .send-qty-input');
        let hasValidData = false;

        for (const input of inputs) {
            const value = parseInt(input.value);
            if (value && value > 0) {
                hasValidData = true;
                break;
            }
        }

        nextBtn.disabled = !hasValidData;
    }

    // 收集发货信息数据
    // forRestore: true = 收集所有有输入的行（用于返回时恢复状态）
    //             false = 只收集有发货量或规整的行（用于提交验证）
    function collectItemsData(forRestore = false) {
        wizardData.items = [];

        const rows = document.querySelectorAll('#items-container tr[data-index]');
        rows.forEach(row => {
            const index = parseInt(row.dataset.index);
            const sendQtyInput = row.querySelector('.send-qty-input');
            const checkbox = row.querySelector('.rounded-toggle-input');

            const sendQty = parseInt(sendQtyInput?.value) || 0;
            const isRounded = checkbox?.checked || false;

            // 收集条件
            let shouldCollect = false;
            if (forRestore) {
                // 恢复模式：收集所有有任何用户输入的行
                shouldCollect = sendQty > 0 || isRounded;
            } else {
                // 提交模式：有发货量 或 规整开关被勾选
                shouldCollect = sendQty > 0 || isRounded;
            }

            if (shouldCollect && templateData?.items?.[index]) {
                const item = templateData.items[index];
                wizardData.items.push({
                    po_date: item.B,
                    po_num: item.C,
                    po_sku: item.D,
                    po_quantity: parseInt(item.E) || 0,
                    sent_quantity: parseInt(item.F) || 0,
                    remaining_quantity: parseInt(item.G) || 0,
                    send_quantity: sendQty,
                    is_rounded: isRounded,
                    sku_note: item.J || ''
                });
            }
        });
    }

    // =========================================================================
    // 流程6: 检验发货数据
    // =========================================================================

    function runItemsVerification() {
        const container = document.getElementById('items-verify-container');
        const card = document.getElementById('items-verify-card');
        const icon = document.getElementById('items-verify-icon');
        const title = document.getElementById('items-verify-title');
        const status = document.getElementById('items-verify-status');
        const errorPanel = document.getElementById('items-error-panel');
        const errorList = document.getElementById('items-error-list');
        const warningPanel = document.getElementById('items-warning-panel');
        const warningList = document.getElementById('items-warning-list');
        const modifiedPanel = document.getElementById('items-modified-panel');
        const modifiedList = document.getElementById('items-modified-list');
        const nextBtn = document.getElementById('btn-wizard-next-5');

        if (!container) return;

        // 重置状态
        card.className = 'card bg-dark border-secondary border-opacity-25 mb-4';
        icon.className = 'fas fa-spinner fa-spin me-2 text-warning';
        title.textContent = '正在验证发货数据...';
        title.className = 'text-warning';
        status.textContent = '验证中';
        status.className = 'badge bg-secondary bg-opacity-50 text-white';
        errorPanel.style.display = 'none';
        warningPanel.style.display = 'none';
        modifiedPanel.style.display = 'none';
        nextBtn.disabled = true;

        // 收集所有行数据进行验证
        const allRowsData = [];
        const rows = document.querySelectorAll('#items-container tr[data-index]');
        rows.forEach(row => {
            const index = parseInt(row.dataset.index);
            const sendQtyInput = row.querySelector('.send-qty-input');
            const checkbox = row.querySelector('.rounded-toggle-input');

            if (templateData?.items?.[index]) {
                const item = templateData.items[index];
                const sendQtyValue = sendQtyInput?.value?.trim() || '';
                const sendQty = sendQtyValue === '' ? 0 : parseInt(sendQtyValue);
                const isRounded = checkbox?.checked || false;
                const originalRemaining = parseInt(item.G) || 0;

                allRowsData.push({
                    index: index,
                    row: item.row,
                    po_num: item.C,
                    po_sku: item.D,
                    send_quantity: sendQty,
                    send_quantity_raw: sendQtyValue,
                    is_rounded: isRounded,
                    original_remaining: originalRemaining,
                    new_remaining: originalRemaining - sendQty,
                    sku_note: item.J || ''  // 价格备注
                });
            }
        });

        // 验证逻辑
        const errors = [];
        const warnings = [];
        const modifications = [];

        // 获取Excel上传的原始数据（如果是Excel模式）
        const excelItems = wizardData.inputMode === 'excel' && wizardData.uploadedExcelData?.items
            ? wizardData.uploadedExcelData.items
            : [];

        allRowsData.forEach(data => {
            const { po_num, po_sku, send_quantity, send_quantity_raw, is_rounded, original_remaining, new_remaining, row } = data;

            // 验证1: 发货量必须是正整数或0（不接受空值以外的非数字）
            if (send_quantity_raw !== '' && (isNaN(send_quantity) || send_quantity < 0 || !Number.isInteger(send_quantity))) {
                errors.push(`${po_num} - ${po_sku}: 发货量必须是正整数或0`);
            }

            // 只对有发货量的行进行后续验证
            if (send_quantity > 0) {
                // 错误：发货量恰好等于未发量时，规整没有意义（订单已完结，不需要规整）
                // 但如果发货量超过未发量，规整是正确的（需要调整订货量，不报错）
                if (send_quantity === original_remaining && is_rounded) {
                    errors.push(`${po_num} - ${po_sku}: 发货量等于未发量时无需规整`);
                }

                // 警告1: 发货量大于未发量且未开启规整，提醒用户
                if (send_quantity > original_remaining && !is_rounded) {
                    warnings.push(`${po_num} - ${po_sku}: 发货量(${send_quantity})超过未发量(${original_remaining})，是否忘记开启规整开关？`);
                }

                // 警告2: 未发量 < 发货量的20% 且规整开关未开启
                if (new_remaining > 0 && new_remaining < send_quantity * 0.2 && !is_rounded) {
                    warnings.push(`${po_num} - ${po_sku}: 未发量(${new_remaining})小于发货量的20%，是否忘记开启规整开关？`);
                }
            }

            // 检测Excel数据修改（仅Excel模式）
            if (wizardData.inputMode === 'excel' && excelItems.length > 0) {
                const excelItem = excelItems.find(e => e.row === row);
                if (excelItem) {
                    const excelSendQty = excelItem.send_quantity || 0;
                    const excelIsRounded = excelItem.is_rounded || false;

                    if (send_quantity !== excelSendQty) {
                        modifications.push(`${po_num} - ${po_sku}: 发货量从 ${excelSendQty} 改为 ${send_quantity}`);
                    }
                    if (is_rounded !== excelIsRounded) {
                        modifications.push(`${po_num} - ${po_sku}: 规整开关从 ${excelIsRounded ? '开' : '关'} 改为 ${is_rounded ? '开' : '关'}`);
                    }
                }
            }
        });

        // 渲染验证数据列表
        renderVerifyItemsList(container, allRowsData, errors);

        // 延迟显示结果（模拟验证过程）
        setTimeout(() => {
            if (errors.length > 0) {
                // 验证失败
                card.className = 'card bg-dark border-danger border-opacity-50 mb-4';
                icon.className = 'fas fa-times-circle me-2 text-danger';
                title.textContent = '验证失败';
                title.className = 'text-danger';
                status.textContent = '失败';
                status.className = 'badge bg-danger';
                errorPanel.style.display = 'block';
                errorList.innerHTML = errors.map(e => `<li class="text-danger">${e}</li>`).join('');
                nextBtn.disabled = true;
            } else {
                // 验证通过
                card.className = 'card bg-dark border-success border-opacity-50 mb-4';
                icon.className = 'fas fa-check-circle me-2 text-success';
                title.textContent = '验证通过';
                title.className = 'text-success';
                status.textContent = '通过';
                status.className = 'badge bg-success';
                nextBtn.disabled = false;
            }

            // 显示警告（不影响通过）
            if (warnings.length > 0) {
                warningPanel.style.display = 'block';
                warningList.innerHTML = warnings.map(w => `<li class="text-warning">${w}</li>`).join('');
            }

            // 显示修改提示（不影响通过）
            if (modifications.length > 0) {
                modifiedPanel.style.display = 'block';
                modifiedList.innerHTML = modifications.map(m => `<li>${m}</li>`).join('');
            }
        }, 300);
    }

    // 渲染验证数据列表
    function renderVerifyItemsList(container, allRowsData, errors) {
        if (!container) return;

        // 按供应商分组
        const supplierGroups = {};
        allRowsData.forEach(data => {
            const poNum = data.po_num || '';
            const supplierCode = poNum.substring(0, 2).toUpperCase() || 'XX';

            if (!supplierGroups[supplierCode]) {
                supplierGroups[supplierCode] = [];
            }
            supplierGroups[supplierCode].push(data);
        });

        container.innerHTML = '';

        Object.keys(supplierGroups).sort().forEach(supplierCode => {
            const items = supplierGroups[supplierCode];

            // 为订单号分配颜色
            const orderNumbers = [...new Set(items.map(i => i.po_num))];
            const orderColorMap = {};
            orderNumbers.forEach((orderNum, idx) => {
                orderColorMap[orderNum] = ORDER_COLORS[idx % ORDER_COLORS.length];
            });

            const tableHtml = `
                <div class="px-3 py-2 bg-secondary bg-opacity-10 border-bottom border-secondary border-opacity-25">
                    <i class="fas fa-industry me-2 text-info"></i>
                    <span class="text-white fw-bold">供应商: ${supplierCode}</span>
                    <span class="badge bg-secondary bg-opacity-50 text-white ms-2">${items.length} 条</span>
                </div>
                <table class="table table-dark table-sm table-striped mb-0">
                    <thead>
                        <tr>
                            <th class="text-white-50 small">订单号</th>
                            <th class="text-white-50 small">SKU</th>
                            <th class="text-white-50 small text-end">未发量</th>
                            <th class="text-white-50 small text-end">发货量</th>
                            <th class="text-white-50 small text-end">新未发</th>
                            <th class="text-white-50 small text-center">规整</th>
                            <th class="text-white-50 small">备注</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => {
                const orderColor = orderColorMap[item.po_num] || '#17a2b8';
                const hasError = errors.some(e => e.includes(item.po_num) && e.includes(item.po_sku));
                const rowClass = hasError ? 'table-danger' : '';
                // 错误行使用深色文字以便在浅粉色背景上易读
                const textClass = hasError ? 'text-dark' : 'text-white';

                return `
                                <tr class="${rowClass}">
                                    <td class="small fw-bold" style="color: ${hasError ? '#721c24' : orderColor}">${item.po_num}</td>
                                    <td class="${textClass} small">${item.po_sku}</td>
                                    <td class="${textClass} small text-end">${item.original_remaining}</td>
                                    <td class="small text-end ${hasError ? 'text-danger fw-bold' : 'text-warning'}">${item.send_quantity || '-'}</td>
                                    <td class="${hasError ? 'text-dark' : (item.new_remaining < 0 ? 'text-danger' : 'text-white-50')} small text-end">${item.send_quantity > 0 ? item.new_remaining : '-'}</td>
                                    <td class="text-center">${item.is_rounded ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-minus text-secondary"></i>'}</td>
                                    <td class="text-white-50 small">${item.sku_note || '-'}</td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            `;

            container.insertAdjacentHTML('beforeend', tableHtml);
        });
    }

    // =========================================================================
    // 流程4: 物流数据修改检测（增强）
    // =========================================================================

    function checkLogisticsModifications() {
        if (wizardData.inputMode !== 'excel' || !wizardData.uploadedExcelData?.logistics) {
            return [];
        }

        const excelLogistics = wizardData.uploadedExcelData.logistics;
        const currentLogistics = wizardData.logistics;
        const modifications = [];

        const fieldNames = {
            date_sent: '发货日期',
            date_eta: '预计到达日期',
            logistic_num: '物流单号',
            pallets: '托盘数',
            total_weight: '总重量',
            price_kg: '物流单价',
            usd_rmb: '汇率'
        };

        // 日期规整函数（将各种格式转换为YYYY-MM-DD）
        function normalizeDate(dateStr) {
            if (!dateStr) return '';
            // 已经是YYYY-MM-DD格式
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
            // 尝试解析其他格式
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
            return String(dateStr).trim();
        }

        Object.keys(fieldNames).forEach(field => {
            const excelVal = excelLogistics[field];
            const currentVal = currentLogistics[field];

            // 只比较有值的字段
            if (excelVal !== undefined && excelVal !== null && excelVal !== '') {
                let excelNormalized = String(excelVal).trim();
                let currentNormalized = String(currentVal).trim();

                // 物流单号：大写化是系统默认，忽略大小写比较
                if (field === 'logistic_num') {
                    excelNormalized = excelNormalized.toUpperCase();
                    currentNormalized = currentNormalized.toUpperCase();
                }

                // 日期字段：格式规整是系统默认，规整后再比较
                if (field === 'date_sent' || field === 'date_eta') {
                    excelNormalized = normalizeDate(excelNormalized);
                    currentNormalized = normalizeDate(currentNormalized);
                }

                if (excelNormalized !== currentNormalized) {
                    modifications.push(`${fieldNames[field]}: ${excelVal} → ${currentVal}`);
                }
            }
        });

        return modifications;
    }

    // =========================================================================
    // 流程7: 录入前预览
    // =========================================================================

    function renderPreview() {
        const logisticsGrid = document.getElementById('preview-logistics-grid');
        const itemsContainer = document.getElementById('preview-items-container');

        if (!logisticsGrid || !itemsContainer) return;

        // 渲染物流参数
        const L = wizardData.logistics;
        logisticsGrid.innerHTML = `
            <div class="col-4">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">发货日期</div>
                    <div class="text-white fw-bold">${L.date_sent || '-'}</div>
                </div>
            </div>
            <div class="col-4">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">预计到达</div>
                    <div class="text-white">${L.date_eta || '-'}</div>
                </div>
            </div>
            <div class="col-4">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">物流单号</div>
                    <div class="text-info fw-bold">${L.logistic_num || '-'}</div>
                </div>
            </div>
            <div class="col-3">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">托盘数</div>
                    <div class="text-white">${L.pallets || '0'}</div>
                </div>
            </div>
            <div class="col-3">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">总重量</div>
                    <div class="text-white">${L.total_weight || '0'} KG</div>
                </div>
            </div>
            <div class="col-3">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">物流单价</div>
                    <div class="text-white">¥${(L.price_kg || 0).toFixed(4)}</div>
                </div>
            </div>
            <div class="col-3">
                <div class="p-2 rounded bg-black bg-opacity-25">
                    <div class="text-white-50 small">物流总费用</div>
                    <div class="text-success fw-bold">¥${(L.total_price || 0).toFixed(2)}</div>
                </div>
            </div>
        `;

        // 渲染发货明细（使用供应商分组）
        const items = wizardData.items || [];

        // 按供应商分组
        const supplierGroups = {};
        items.forEach(item => {
            const poNum = item.po_num || '';
            const supplierCode = poNum.substring(0, 2).toUpperCase() || 'XX';

            if (!supplierGroups[supplierCode]) {
                supplierGroups[supplierCode] = [];
            }
            supplierGroups[supplierCode].push(item);
        });

        itemsContainer.innerHTML = '';

        if (items.length === 0) {
            itemsContainer.innerHTML = `
                <div class="text-center py-4 text-white-50">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p>暂无发货商品</p>
                </div>
            `;
        } else {
            Object.keys(supplierGroups).sort().forEach(supplierCode => {
                const groupItems = supplierGroups[supplierCode];

                // 为订单号分配颜色
                const orderNumbers = [...new Set(groupItems.map(i => i.po_num))];
                const orderColorMap = {};
                orderNumbers.forEach((orderNum, idx) => {
                    orderColorMap[orderNum] = ORDER_COLORS[idx % ORDER_COLORS.length];
                });

                const tableHtml = `
                    <div class="px-3 py-2 bg-secondary bg-opacity-10 border-bottom border-secondary border-opacity-25">
                        <i class="fas fa-industry me-2 text-info"></i>
                        <span class="text-white fw-bold">供应商: ${supplierCode}</span>
                        <span class="badge bg-secondary bg-opacity-50 text-white ms-2">${groupItems.length} 条</span>
                    </div>
                    <table class="table table-dark table-sm table-striped mb-0">
                        <thead>
                            <tr>
                                <th class="text-white-50 small">订单号</th>
                                <th class="text-white-50 small">SKU</th>
                                <th class="text-white-50 small text-end">发货量</th>
                                <th class="text-white-50 small text-center">规整</th>
                                <th class="text-white-50 small">备注</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupItems.map(item => {
                    const orderColor = orderColorMap[item.po_num] || '#17a2b8';
                    return `
                                    <tr>
                                        <td class="small fw-bold" style="color: ${orderColor}">${item.po_num}</td>
                                        <td class="text-white small">${item.po_sku}</td>
                                        <td class="text-warning small text-end fw-bold">${item.send_quantity}</td>
                                        <td class="text-center">${item.is_rounded ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-minus text-secondary"></i>'}</td>
                                        <td class="text-white-50 small">${item.sku_note || '-'}</td>
                                    </tr>
                                `;
                }).join('')}
                        </tbody>
                    </table>
                `;

                itemsContainer.insertAdjacentHTML('beforeend', tableHtml);
            });
        }

        // 更新统计信息
        const totalQty = items.reduce((sum, item) => sum + (item.send_quantity || 0), 0);
        document.getElementById('preview-item-count').textContent = items.length;
        document.getElementById('preview-total-quantity').textContent = totalQty;
        document.getElementById('preview-total-price').textContent = '¥' + (L.total_price || 0).toFixed(2);

        // 初始化物流单文件上传组件
        initLogisticFileUploader();
    }

    /**
     * 初始化物流单文件上传组件
     */
    function initLogisticFileUploader() {
        const container = document.getElementById('logistic-file-upload-container');
        if (!container) return;

        // 如果已存在实例，先销毁
        if (logisticFileUploader) {
            logisticFileUploader.destroy?.();
            logisticFileUploader = null;
        }

        // 清空容器
        container.innerHTML = '';

        // 创建上传组件
        logisticFileUploader = new GlobalFileUpload({
            containerId: 'logistic-file-upload-container',
            inputName: 'logistic_invoice_file',
            title: (window.i18n?.isLoaded && window.i18n.t('js.upload_logistics_file')) || 'Upload Logistics File',
            accept: '.pdf,.jpg,.jpeg,.png,.gif,.heic,.heif,.xls,.xlsx,.doc,.docx,.csv',
            maxSizeMB: 10,
            required: false,
            onFileSelect: (file) => {
                // 文件选择回调
            },
            onFileRemove: () => {
                // 文件移除回调
            },
            onError: (msg) => {
                // 错误回调 - 可使用GlobalToast通知
                if (window.GlobalToast) {
                    GlobalToast.show({ message: msg, type: 'warning' });
                }
            }
        });
    }

    // 确认提交按钮点击处理
    function handleConfirmSubmit() {
        // 使用密码验证
        if (window.requestPasswordVerify) {
            requestPasswordVerify(
                'send_order_create',  // actionKey
                function (passwords) {
                    // 密码验证通过，执行提交，传递密码
                    submitSendOrder(passwords);
                },
                document.getElementById('send-step-preview'),  // contextEl
                '提交发货单',  // actionDisplayName
                function () {
                    // 取消或验证失败，留在当前步骤
                }
            );
        } else {
            // 没有密码验证模块，直接提交（降级处理）
            console.warn('[SendWizard] requestPasswordVerify not available, submitting directly');
            submitSendOrder({});
        }
    }

    // =========================================================================
    // 提交发货单
    // =========================================================================
    function submitSendOrder(passwords) {
        // 跳转到完成页并显示处理中状态
        wizard?.goToStep('finish');

        // 准备提交数据
        const submitData = {
            logistics: wizardData.logistics,
            items: wizardData.items,
            passwords: passwords || {}  // 包含密码
        };

        // 调用提交API
        fetch('/dashboard/purchase/api/send/submit/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(submitData)
        })
            .then(res => res.json())
            .then(async data => {
                if (data.success) {
                    const logisticNum = data.logistic_num;

                    // 检查是否有物流单文件需要上传
                    if (logisticFileUploader && logisticFileUploader.getFile()) {
                        try {
                            await uploadLogisticInvoiceFile(logisticNum, logisticFileUploader.getFile());
                            renderFinish(true, logisticNum, wizardData.items.length, null, true);
                        } catch (uploadErr) {
                            // 发货单创建成功，但文件上传失败
                            renderFinish(true, logisticNum, wizardData.items.length, null, false, '物流单文件上传失败，可稍后在管理页面补传');
                        }
                    } else {
                        renderFinish(true, logisticNum, wizardData.items.length, null, false);
                    }
                } else {
                    renderFinish(false, null, null, data.message || '提交失败');
                }
            })
            .catch(err => {
                console.error('[SendWizard] Submit error:', err);
                renderFinish(false, null, null, '网络请求失败，请重试');
            });
    }

    /**
     * 上传物流单文件
     * @param {string} logisticNum - 物流单号
     * @param {File} file - 文件对象
     * @returns {Promise}
     */
    async function uploadLogisticInvoiceFile(logisticNum, file) {
        const formData = new FormData();
        formData.append('logistic_num', logisticNum);
        formData.append('invoice_file', file);

        const res = await fetch('/dashboard/purchase/api/send_mgmt/upload_invoice/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCSRFToken() },
            body: formData
        });

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.message || '上传失败');
        }
        return data;
    }

    // 渲染完成页面
    function renderFinish(success, logisticNum, itemCount, errorMessage, fileUploaded = false, fileWarning = null) {
        const statusCard = document.getElementById('send-finish-status-card');
        const statusHeader = document.getElementById('send-finish-status-header');
        const infoPanel = document.getElementById('send-finish-info-panel');

        if (!statusCard || !statusHeader || !infoPanel) return;

        if (success) {
            // 成功状态
            statusCard.className = 'card bg-dark border-success';

            // 文件上传状态提示
            let fileStatusHtml = '';
            if (fileUploaded) {
                fileStatusHtml = '<span class="badge bg-success ms-2"><i class="fas fa-file-check me-1"></i>物流单已上传</span>';
            } else if (fileWarning) {
                fileStatusHtml = `<div class="alert alert-warning bg-warning bg-opacity-10 border-warning text-center mt-3 small"><i class="fas fa-exclamation-triangle me-1"></i>${fileWarning}</div>`;
            }

            statusHeader.innerHTML = `
                <div class="display-1 text-success mb-4">
                    <i class="fa-solid fa-check-circle"></i>
                </div>
                <h3 class="text-white mb-3">发货单创建成功${fileUploaded ? fileStatusHtml : ''}</h3>
            `;
            infoPanel.innerHTML = `
                <div class="d-flex justify-content-center gap-4">
                    <div class="text-center">
                        <div class="text-white-50 small">物流单号</div>
                        <div class="text-info fw-bold fs-5">${logisticNum || '-'}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-white-50 small">发货商品数</div>
                        <div class="text-warning fw-bold fs-5">${itemCount || 0} 件</div>
                    </div>
                    <div class="text-center">
                        <div class="text-white-50 small">物流总费用</div>
                        <div class="text-success fw-bold fs-5">¥${(wizardData.logistics?.total_price || 0).toFixed(2)}</div>
                    </div>
                </div>
                ${fileWarning && !fileUploaded ? `<div class="alert alert-warning bg-warning bg-opacity-10 border-warning text-center mt-3 small"><i class="fas fa-exclamation-triangle me-1"></i>${fileWarning}</div>` : ''}
            `;
        } else {
            // 失败状态
            statusCard.className = 'card bg-dark border-danger';
            statusHeader.innerHTML = `
                <div class="display-1 text-danger mb-4">
                    <i class="fa-solid fa-times-circle"></i>
                </div>
                <h3 class="text-white mb-3">发货单创建失败</h3>
            `;
            infoPanel.innerHTML = `
                <div class="alert alert-danger bg-danger bg-opacity-10 border-danger text-center">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${errorMessage || '未知错误'}
                </div>
                <p class="text-white-50 text-center small mb-3">
                    请检查数据并重试，或联系系统管理员
                </p>
                <div class="text-center">
                    <button type="button" class="btn btn-outline-warning rounded-pill px-4" id="btn-retry-submit">
                        <i class="fas fa-redo me-2"></i>返回重试
                    </button>
                </div>
            `;

            // 绑定返回重试按钮事件
            setTimeout(() => {
                const retryBtn = document.getElementById('btn-retry-submit');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        wizard?.goToStep('preview');
                    });
                }
            }, 100);
        }
    }

    // =========================================================================
    // 工具函数
    // =========================================================================
    function resetForms() {
        ['send_date_sent', 'send_date_eta', 'send_logistic_num',
            'send_pallets', 'send_total_weight', 'send_price_kg', 'send_usd_rmb'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        const totalEl = document.getElementById('send_total_price');
        if (totalEl) totalEl.value = '0.00';

        const rateStatus = document.getElementById('rate-status');
        if (rateStatus) {
            rateStatus.innerHTML = '<i class="fas fa-clock me-1"></i>请先选择发货日期';
            rateStatus.className = 'text-white-50 mt-1 d-block';
        }
    }

    function getCSRFToken() {
        const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
        return cookie ? cookie.split('=')[1] : '';
    }

    function downloadSendTemplate() {
        const btn = document.getElementById('btn-download-template');
        const originalHtml = btn?.innerHTML;

        // 获取发货日期
        const dateSent = document.getElementById('send_date_sent')?.value;
        if (!dateSent) {
            alert(i18n.t('validation.select_send_date'));
            return;
        }

        // 检查是否有templateData
        if (!templateData || !templateData.items || templateData.items.length === 0) {
            alert(i18n.t('validation.no_orders_for_date'));
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>正在生成...';
        }

        // POST请求，发送templateData
        fetch('/dashboard/purchase/api/send/download_template/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                date_sent: dateSent,
                items: templateData.items
            })
        })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(data => {
                        throw new Error(data.message || '下载失败');
                    });
                }
                return res.blob();
            })
            .then(blob => {
                // 创建下载链接
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `shipping_form_${dateSent}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            })
            .catch(err => {
                console.error('[SendWizard] Download template error:', err);
                alert(i18n.t('error.download_template_failed') + ': ' + err.message);

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            });
    }

    function checkSendAvailability() {
        const loadingEl = document.getElementById('template-loading');
        const errorEl = document.getElementById('template-error');
        const normalEl = document.getElementById('template-normal');
        const errorMsgEl = document.getElementById('template-error-message');
        const statusBadge = document.getElementById('template-status-badge');
        const nextBtn = document.getElementById('btn-wizard-next-1');
        const downloadBtn = document.getElementById('btn-download-template');
        const card = document.getElementById('download-template-card');

        // 显示加载状态
        loadingEl?.classList.remove('d-none');
        normalEl?.classList.add('d-none');
        errorEl?.classList.add('d-none');
        statusBadge?.classList.remove('d-none');
        if (nextBtn) nextBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;

        fetch('/dashboard/purchase/api/send/check_availability/')
            .then(res => res.json())
            .then(data => {
                loadingEl?.classList.add('d-none');
                statusBadge?.classList.add('d-none');

                if (data.success && data.can_send) {
                    // 可以发货
                    normalEl?.classList.remove('d-none');
                    errorEl?.classList.add('d-none');
                    if (nextBtn) nextBtn.disabled = false;
                    if (downloadBtn) downloadBtn.disabled = false;
                    card?.classList.remove('border-danger');
                    card?.classList.add('border-success');

                    // 同时生成模板数据并保存到内存
                    generateTemplateData();
                } else if (data.success && !data.can_send) {
                    // 不能发货
                    normalEl?.classList.add('d-none');
                    errorEl?.classList.remove('d-none');
                    errorMsgEl.textContent = data.message;
                    if (nextBtn) nextBtn.disabled = true;
                    if (downloadBtn) downloadBtn.disabled = true;
                    card?.classList.remove('border-success');
                    card?.classList.add('border-danger');
                } else {
                    // API错误
                    normalEl?.classList.add('d-none');
                    errorEl?.classList.remove('d-none');
                    errorMsgEl.textContent = data.message || '检查订单状态失败';
                    if (nextBtn) nextBtn.disabled = true;
                    if (downloadBtn) downloadBtn.disabled = true;
                }
            })
            .catch(err => {
                console.error('[SendWizard] Check availability error:', err);
                loadingEl?.classList.add('d-none');
                statusBadge?.classList.add('d-none');
                normalEl?.classList.remove('d-none');
                errorEl?.classList.add('d-none');
                // 网络错误时允许继续（降级处理）
                if (nextBtn) nextBtn.disabled = false;
                if (downloadBtn) downloadBtn.disabled = false;
            });
    }

    // 生成模板数据并保存到内存（需要传入发货日期）
    function generateTemplateData(dateSent) {
        // 显示加载状态
        showTemplateLoading();

        if (!dateSent) {
            showTemplateError('请先选择发货日期');
            templateData = null;
            updateStep1NextButton();
            return;
        }

        fetch(`/dashboard/purchase/api/send/generate_template_data/?date_sent=${encodeURIComponent(dateSent)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    templateData = data.data;
                    showTemplateNormal();
                    updateStep1NextButton();
                } else {
                    console.error('[SendWizard] Failed to generate template data:', data.message);
                    templateData = null;
                    showTemplateError(data.message || '生成模板数据失败');
                    updateStep1NextButton();
                }
            })
            .catch(err => {
                console.error('[SendWizard] Generate template data error:', err);
                templateData = null;
                showTemplateError('网络请求失败，请重试');
                updateStep1NextButton();
            });
    }

    // 显示模板加载中状态
    function showTemplateLoading() {
        const loading = document.getElementById('template-loading');
        const error = document.getElementById('template-error');
        const normal = document.getElementById('template-normal');
        if (loading) loading.classList.remove('d-none');
        if (error) error.classList.add('d-none');
        if (normal) normal.classList.add('d-none');
    }

    // 显示模板错误状态
    function showTemplateError(message) {
        const loading = document.getElementById('template-loading');
        const error = document.getElementById('template-error');
        const normal = document.getElementById('template-normal');
        const errorMsg = document.getElementById('template-error-message');
        if (loading) loading.classList.add('d-none');
        if (error) error.classList.remove('d-none');
        if (normal) normal.classList.add('d-none');
        if (errorMsg) errorMsg.textContent = message;
    }

    // 显示模板正常状态
    function showTemplateNormal() {
        const loading = document.getElementById('template-loading');
        const error = document.getElementById('template-error');
        const normal = document.getElementById('template-normal');
        if (loading) loading.classList.add('d-none');
        if (error) error.classList.add('d-none');
        if (normal) normal.classList.remove('d-none');
    }

    // 从已上传Excel数据中获取最晚订单日期（只考虑发货量>0的行）
    function getLatestOrderDate() {
        // 优先从已上传的Excel解析数据中获取（因为那里有H列发货量）
        if (wizardData.uploadedExcelData && wizardData.uploadedExcelData.items) {
            let latestDate = '';
            for (const item of wizardData.uploadedExcelData.items) {
                // 只考虑发货量(send_quantity)大于0的行
                if (item.send_quantity && item.send_quantity > 0) {
                    const orderDate = item.po_date || '';
                    if (orderDate && orderDate > latestDate) {
                        latestDate = orderDate;
                    }
                }
            }
            return latestDate;
        }

        // 备用：从templateData获取（但没有H列信息，所以取所有行的最大日期）
        if (templateData && templateData.items && templateData.items.length > 0) {
            let latestDate = '';
            for (const item of templateData.items) {
                const orderDate = item.B || '';  // B列是订单日期
                if (orderDate && orderDate > latestDate) {
                    latestDate = orderDate;
                }
            }
            return latestDate;
        }

        return '';
    }

    // =========================================================================
    // 模式选择相关函数
    // =========================================================================
    let sendFileUploadInstance = null;
    let uploadedSendFile = null;

    // 初始化模式选择
    function initModeSelection() {
        // 初始化模式选择单选按钮事件
        document.getElementById('mode-manual')?.addEventListener('change', () => selectMode('manual'));
        document.getElementById('mode-excel')?.addEventListener('change', () => selectMode('excel'));

        // 初始化文件上传组件
        if (typeof GlobalFileUpload !== 'undefined') {
            sendFileUploadInstance = new GlobalFileUpload({
                containerId: 'send-excel-upload-container',
                inputName: 'send_excel_file',
                title: (window.i18n?.isLoaded && window.i18n.t('js.upload_send_template')) || 'Upload Shipment Template Excel',
                accept: '.xlsx,.xls',
                maxSizeMB: 5,
                onFileSelect: async (file) => {
                    uploadedSendFile = file;
                    await validateUploadedExcel(file);
                },
                onFileRemove: () => {
                    uploadedSendFile = null;
                    wizardData.uploadedExcelData = null;
                    updateModeNextButton();
                    hideUploadStatus();
                }
            });
        }
    }

    // 选择模式
    window.selectMode = function (mode) {
        wizardData.inputMode = mode;

        // 更新UI
        const manualCard = document.getElementById('mode-manual-card');
        const excelCard = document.getElementById('mode-excel-card');
        const manualRadio = document.getElementById('mode-manual');
        const excelRadio = document.getElementById('mode-excel');
        const uploadSection = document.getElementById('excel-upload-section');

        manualCard?.classList.remove('selected');
        excelCard?.classList.remove('selected');

        if (mode === 'manual') {
            manualCard?.classList.add('selected');
            if (manualRadio) manualRadio.checked = true;
            if (uploadSection) uploadSection.style.display = 'none';
            updateModeNextButton();
        } else if (mode === 'excel') {
            excelCard?.classList.add('selected');
            if (excelRadio) excelRadio.checked = true;
            if (uploadSection) uploadSection.style.display = 'block';
            updateModeNextButton();
        }
    }

    // 更新流程1下一步按钮状态
    function updateStep1NextButton() {
        const nextBtn = document.getElementById('btn-wizard-next-1');
        if (!nextBtn) return;

        // 检查发货日期是否已选择
        const dateSent = document.getElementById('send_date_sent')?.value;

        // 检查是否有有效的模板数据（发货日期对应有订单）
        const hasTemplateData = templateData && templateData.items && templateData.items.length > 0;

        if (dateSent && hasTemplateData) {
            nextBtn.disabled = false;
            nextBtn.title = '确认须知并开始创建发货单';
        } else if (!dateSent) {
            nextBtn.disabled = true;
            nextBtn.title = '请先选择发货日期';
        } else if (!hasTemplateData) {
            nextBtn.disabled = true;
            nextBtn.title = '该发货日期前没有可发货的订单';
        } else {
            nextBtn.disabled = true;
            nextBtn.title = '请完成必填项';
        }
    }

    // 更新模式选择下一步按钮状态
    function updateModeNextButton() {
        const nextBtn = document.getElementById('btn-wizard-next-mode');
        if (!nextBtn) return;

        if (wizardData.inputMode === 'manual') {
            // 手动模式：可点击
            nextBtn.disabled = false;
            nextBtn.title = '进入物流参数录入';
        } else if (wizardData.inputMode === 'excel') {
            // Excel模式：需要上传并验证成功
            if (wizardData.uploadedExcelData) {
                nextBtn.disabled = false;
                nextBtn.title = '使用上传的数据进入下一步';
            } else {
                nextBtn.disabled = true;
                nextBtn.title = '请上传并验证发货模板Excel文件';
            }
        } else {
            nextBtn.disabled = true;
            nextBtn.title = '请先选择录入模式';
        }
    }

    // 验证上传的Excel文件
    async function validateUploadedExcel(file) {
        showUploadLoading();

        try {
            const formData = new FormData();
            formData.append('file', file);
            // 将流程1生成的模板数据传给后端用于比对
            if (templateData) {
                formData.append('template_data', JSON.stringify(templateData));
            } else {
                console.warn('[SendWizard] WARNING: templateData is null/undefined!');
            }

            const res = await fetch('/dashboard/purchase/api/send/validate_excel/', {
                method: 'POST',
                headers: { 'X-CSRFToken': getCSRFToken() },
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                wizardData.uploadedExcelData = data.data;
                showUploadSuccess(data.message || '文件验证成功！');
                updateModeNextButton();
            } else {
                wizardData.uploadedExcelData = null;
                // 检查是否有详细错误信息（支持incomplete和mismatch类型）
                if ((data.error_type === 'incomplete' || data.error_type === 'mismatch') && data.details) {
                    showUploadErrorDetailed(data.title, data.message, data.details);
                } else {
                    showUploadError(data.message || '文件验证失败');
                }
                updateModeNextButton();
            }
        } catch (err) {
            console.error('[SendWizard] Validate Excel error:', err);
            wizardData.uploadedExcelData = null;
            showUploadError('验证请求失败: ' + err.message);
            updateModeNextButton();
        }
    }

    // 上传状态显示函数
    function showUploadLoading() {
        document.getElementById('upload-status').style.display = 'block';
        document.getElementById('upload-loading').style.display = 'block';
        document.getElementById('upload-success').style.display = 'none';
        document.getElementById('upload-error').style.display = 'none';
    }

    function showUploadSuccess(message) {
        document.getElementById('upload-status').style.display = 'block';
        document.getElementById('upload-loading').style.display = 'none';
        document.getElementById('upload-success').style.display = 'block';
        document.getElementById('upload-success-message').textContent = message;
        document.getElementById('upload-error').style.display = 'none';
    }

    function showUploadError(message) {
        document.getElementById('upload-status').style.display = 'block';
        document.getElementById('upload-loading').style.display = 'none';
        document.getElementById('upload-success').style.display = 'none';
        document.getElementById('upload-error').style.display = 'block';
        document.getElementById('upload-error-message').innerHTML = `<span>${message}</span>`;
    }

    function showUploadErrorDetailed(title, message, details) {
        document.getElementById('upload-status').style.display = 'block';
        document.getElementById('upload-loading').style.display = 'none';
        document.getElementById('upload-success').style.display = 'none';
        document.getElementById('upload-error').style.display = 'block';

        // 构建详细错误HTML（限高可滚动）
        let detailsHtml = `
            <div class="mb-2">
                <strong class="text-danger"><i class="fas fa-exclamation-triangle me-2"></i>${title}</strong>
            </div>
            <div class="text-white-50 small mb-2">${message}</div>
            <div style="max-height: 150px; overflow-y: auto;">
                <ul class="mb-0 ps-3 small">
                    ${details.map(d => `<li class="text-white">${d}</li>`).join('')}
                </ul>
            </div>
        `;

        document.getElementById('upload-error-message').innerHTML = detailsHtml;
    }

    function hideUploadStatus() {
        document.getElementById('upload-status').style.display = 'none';
    }

    // 重置模式选择
    function resetModeSelection() {
        wizardData.inputMode = null;
        wizardData.uploadedExcelData = null;
        uploadedSendFile = null;

        document.getElementById('mode-manual-card')?.classList.remove('selected');
        document.getElementById('mode-excel-card')?.classList.remove('selected');
        document.getElementById('mode-manual').checked = false;
        document.getElementById('mode-excel').checked = false;
        document.getElementById('excel-upload-section').style.display = 'none';
        hideUploadStatus();

        if (sendFileUploadInstance?.reset) {
            sendFileUploadInstance.reset();
        }

        updateModeNextButton();
    }

    // 在DOMContentLoaded后初始化模式选择
    document.addEventListener('DOMContentLoaded', initModeSelection);

    // =========================================================================
    // 从Excel自动填充物流参数
    // =========================================================================
    function fillLogisticsFromExcel() {
        const noticeEl = document.getElementById('excel-data-notice');

        // 如果是手动模式，隐藏提示框
        if (wizardData.inputMode !== 'excel' || !wizardData.uploadedExcelData) {
            if (noticeEl) noticeEl.style.display = 'none';
            return;
        }

        // 显示Excel数据来源提示
        if (noticeEl) noticeEl.style.display = 'block';

        const logistics = wizardData.uploadedExcelData.logistics;
        if (!logistics) return;
        // 填充发货日期
        if (logistics.date_sent) {
            const dateSentEl = document.getElementById('send_date_sent');
            if (dateSentEl) {
                // 处理日期格式
                let dateStr = logistics.date_sent;
                // 尝试转换为YYYY-MM-DD格式
                if (dateStr && !dateStr.includes('-')) {
                    // 可能是其他格式，尝试解析
                    try {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toISOString().split('T')[0];
                        }
                    } catch (e) { }
                }
                dateSentEl.value = dateStr;
                // 触发change事件以获取汇率
                dateSentEl.dispatchEvent(new Event('change'));
            }
        }

        // 填充预计到达日期
        if (logistics.date_eta) {
            const dateEtaEl = document.getElementById('send_date_eta');
            if (dateEtaEl) {
                let dateStr = logistics.date_eta;
                if (dateStr && !dateStr.includes('-')) {
                    try {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toISOString().split('T')[0];
                        }
                    } catch (e) { }
                }
                dateEtaEl.value = dateStr;
            }
        }

        // 填充物流单号（自动转大写）
        if (logistics.logistic_num) {
            const logisticNumEl = document.getElementById('send_logistic_num');
            if (logisticNumEl) logisticNumEl.value = logistics.logistic_num.toUpperCase();
        }

        // 填充托盘数
        if (logistics.pallet_count !== undefined) {
            const palletsEl = document.getElementById('send_pallets');
            if (palletsEl) palletsEl.value = logistics.pallet_count;
        }

        // 填充发货总重量
        if (logistics.total_weight) {
            const totalWeightEl = document.getElementById('send_total_weight');
            if (totalWeightEl) {
                totalWeightEl.value = logistics.total_weight;
                // 触发change事件以计算总价
                totalWeightEl.dispatchEvent(new Event('input'));
            }
        }

        // 填充物流单价
        if (logistics.price_kg) {
            const priceKgEl = document.getElementById('send_price_kg');
            if (priceKgEl) {
                priceKgEl.value = logistics.price_kg;
                // 触发change事件以计算总价
                priceKgEl.dispatchEvent(new Event('input'));
            }
        }

        // 更新下一步按钮状态
        updateNextButtonState();
    }

})();
