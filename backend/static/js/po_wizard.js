/**
 * 采购订单向导 JavaScript 逻辑
 * po_wizard.js
 */

// ============================================================
// 状态管理
// ============================================================
let poWizard = null;
let suppliersData = [];
let skuList = [];
let currentStrategy = null;
let useCustomStrategy = false;
let originalStrategy = {};
let customStrategy = {};
let modifiedFields = new Set(); // 跟踪修改的字段
let poFormData = {};
let itemsData = [];
let paramsValidated = false;
let itemsValidated = false;
let exchangeRate = null;
let needExchangeRateInput = false; // 是否需要强制输入汇率
let poInputMode = null; // 'upload' or 'manual' (Step2模式选择)
let inputMethod = null; // 兼容旧逻辑
let rowCounter = 0;
let uploadedExcelFile = null; // 上传的Excel文件
let uploadedExcelItems = []; // 解析后的Excel商品数据
let uploadedExcelErrors = null; // Excel解析错误数据（用于Step5显示修正界面）
let fileUploadInstance = null; // GlobalFileUpload实例
let customRateComponent = null; // GlobalExchangeRate组件实例

// i18n 辅助函数 - 带 fallback 的国际化调用
function _t(key, fallback, params = {}) {
    let text = (window.i18n?.t && window.i18n.t(key)) || fallback;
    // 简单模板替换：{name} -> value
    Object.keys(params).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
    });
    return text;
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    initPOWizard();
    loadSuppliers();
    loadSkuList();
    setupStep1EventListeners();
    setupStep2ModeSelect();
    setupEventListeners();
    setupCustomStrategyControls();
    setupInputMethodToggle();
    setDefaultDate();
    initTooltips();
});

function initTooltips() {
    var list = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    list.map(function (el) {
        try { return new bootstrap.Tooltip(el); } catch (e) { return null; }
    });
}

function disposeTooltips() {
    // 销毁所有现有的tooltip实例，防止卡住
    var list = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    list.forEach(function (el) {
        try {
            var tooltip = bootstrap.Tooltip.getInstance(el);
            if (tooltip) {
                tooltip.hide();
                tooltip.dispose();
            }
        } catch (e) { }
    });
    // 移除所有残留的tooltip元素
    document.querySelectorAll('.tooltip').forEach(el => el.remove());
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    // Step1的日期选择器
    const dateEl1 = document.getElementById('id_po_date_step1');
    if (dateEl1) dateEl1.value = today;
    // Step3的隐藏日期字段（兼容）
    const dateEl = document.getElementById('id_po_date');
    if (dateEl) dateEl.value = today;
}

function getCsrf() {
    const el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
}

// ============================================================
// 数据加载
// ============================================================
async function loadSuppliers() {
    try {
        const res = await fetch('/dashboard/purchase/api/po/suppliers/');
        const data = await res.json();
        if (data.success) {
            suppliersData = data.suppliers;
            // 填充Step1的供应商选择器
            const sel1 = document.getElementById('id_supplier_code_step1');
            if (sel1) {
                suppliersData.forEach(sp => {
                    const opt = document.createElement('option');
                    opt.value = sp.code;
                    opt.textContent = `${sp.code} - ${sp.name}`;
                    sel1.appendChild(opt);
                });
            }
            // 填充Step3的供应商选择器（兼容）
            const sel = document.getElementById('id_supplier_code');
            if (sel) {
                suppliersData.forEach(sp => {
                    const opt = document.createElement('option');
                    opt.value = sp.code;
                    opt.textContent = `${sp.code} - ${sp.name}`;
                    sel.appendChild(opt);
                });
            }
        }
    } catch (e) { console.error('Load suppliers failed:', e); }
}

async function loadSkuList() {
    // SKU列表用于商品录入时的自动完成（可选功能）
    // 如果API不可用，功能降级但不影响主流程
    try {
        const res = await fetch('/dashboard/products/api/sku-list/');
        if (!res.ok) {
            console.warn('[PO Wizard] SKU list API not available, autocomplete disabled');
            skuList = [];
            return;
        }
        const data = await res.json();
        if (data.success) {
            skuList = data.sku_list || [];
        }
    } catch (e) {
        console.warn('[PO Wizard] SKU list load failed, autocomplete disabled:', e.message);
        skuList = [];
    }
}

// ============================================================
// Step1: 基本信息事件监听
// ============================================================
function setupStep1EventListeners() {
    const dateEl = document.getElementById('id_po_date_step1');
    const supplierEl = document.getElementById('id_supplier_code_step1');
    const downloadBtn = document.getElementById('btn-download-prefilled-template');
    const nextBtn = document.getElementById('btn-wizard-next-1');

    // 监听日期和供应商变化
    dateEl?.addEventListener('change', updateStep1State);
    supplierEl?.addEventListener('change', updateStep1State);

    // 下载预填模板按钮
    downloadBtn?.addEventListener('click', downloadPrefilledTemplate);
}

function updateStep1State() {
    const dateEl = document.getElementById('id_po_date_step1');
    const supplierEl = document.getElementById('id_supplier_code_step1');
    const downloadCard = document.getElementById('po-download-template-card');
    const nextBtn = document.getElementById('btn-wizard-next-1');
    const previewDate = document.getElementById('template-preview-date');
    const previewSupplier = document.getElementById('template-preview-supplier');

    const date = dateEl?.value;
    const supplierCode = supplierEl?.value;

    if (date && supplierCode) {
        // 显示下载卡片
        if (downloadCard) downloadCard.style.display = 'block';
        if (previewDate) previewDate.textContent = date;

        // 获取供应商名称
        const supplier = suppliersData.find(s => s.code === supplierCode);
        if (previewSupplier) previewSupplier.textContent = supplier ? `${supplierCode} - ${supplier.name}` : supplierCode;

        // 启用下一步按钮
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.title = _t('js.enter_mode_select', 'Enter Mode Selection');
        }
    } else {
        // 隐藏下载卡片，禁用下一步
        if (downloadCard) downloadCard.style.display = 'none';
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.title = _t('js.select_date_supplier_first', 'Please select date and supplier first');
        }
    }
}

async function downloadPrefilledTemplate() {
    const date = document.getElementById('id_po_date_step1')?.value;
    const supplierCode = document.getElementById('id_supplier_code_step1')?.value;

    if (!date || !supplierCode) {
        GlobalModal?.showError({ title: (window.i18n?.isLoaded && window.i18n.t('js.params_incomplete')) || 'Parameters Incomplete', message: (window.i18n?.isLoaded && window.i18n.t('js.select_date_supplier')) || 'Please select date and supplier first' });
        return;
    }

    try {
        const res = await fetch('/dashboard/purchase/api/po/generate-template/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrf()
            },
            body: JSON.stringify({ po_date: date, supplier_code: supplierCode })
        });

        if (!res.ok) {
            const err = await res.json();
            GlobalModal?.showError({ title: _t('js.template_failed', 'Template Generation Failed'), message: err.message || _t('js.unknown_error', 'Unknown error') });
            return;
        }

        // 下载文件
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `采购订单模板_${supplierCode}_${date}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Download template failed:', e);
        GlobalModal?.showError({ title: (window.i18n?.isLoaded && window.i18n.t('js.download_failed')) || 'Download Failed', message: e.message });
    }
}

// ============================================================
// Step2: 模式选择
// ============================================================
function setupStep2ModeSelect() {
    // 模式卡片点击事件已在HTML的onclick中绑定到selectPOMode
    // 这里初始化Excel上传组件
    initStep2ExcelUpload();
}

// 全局函数：模式选择
window.selectPOMode = function (mode) {
    poInputMode = mode;
    inputMethod = mode; // 同步兼容

    const manualCard = document.getElementById('po-mode-manual-card');
    const excelCard = document.getElementById('po-mode-excel-card');
    const manualRadio = document.getElementById('po-mode-manual');
    const excelRadio = document.getElementById('po-mode-excel');
    const uploadSection = document.getElementById('po-excel-upload-section');
    const nextBtn = document.getElementById('btn-wizard-next-mode');

    // 更新卡片样式
    manualCard?.classList.remove('selected');
    excelCard?.classList.remove('selected');

    if (mode === 'manual') {
        manualCard?.classList.add('selected');
        if (manualRadio) manualRadio.checked = true;
        if (uploadSection) uploadSection.style.display = 'none';
        // 手动模式直接可以下一步
        if (nextBtn) nextBtn.disabled = false;
    } else if (mode === 'excel') {
        excelCard?.classList.add('selected');
        if (excelRadio) excelRadio.checked = true;
        if (uploadSection) uploadSection.style.display = 'block';
        // Excel模式需要上传文件才能下一步
        if (nextBtn) nextBtn.disabled = !(uploadedExcelItems && uploadedExcelItems.length > 0);
    }
};

function initStep2ExcelUpload() {
    const container = document.getElementById('po-excel-upload-container');
    if (!container || typeof GlobalFileUpload === 'undefined') {
        console.warn('[PO Wizard] GlobalFileUpload not available or container not found');
        return;
    }

    fileUploadInstance = new GlobalFileUpload({
        containerId: 'po-excel-upload-container',
        inputName: 'po_excel_file',
        title: (window.i18n?.isLoaded && window.i18n.t('js.upload_po_template')) || 'Upload PO Template',
        accept: '.xlsx,.xls',
        maxSizeMB: 10,
        onFileSelect: async (file) => {
            await parseExcelFile(file);
        }
    });
}


async function parseExcelFile(file) {
    const statusEl = document.getElementById('po-upload-status');
    const loadingEl = document.getElementById('po-upload-loading');
    const successEl = document.getElementById('po-upload-success');
    const errorEl = document.getElementById('po-upload-error');
    const nextBtn = document.getElementById('btn-wizard-next-mode');

    if (statusEl) statusEl.style.display = 'block';
    if (loadingEl) loadingEl.style.display = 'block';
    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    try {
        // 获取Step1选择的日期和供应商
        const poDate = document.getElementById('id_po_date_step1')?.value || '';
        const supplierCode = document.getElementById('id_supplier_code_step1')?.value || '';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('po_date', poDate);
        formData.append('supplier_code', supplierCode);

        const res = await fetch('/dashboard/purchase/api/po/parse-excel/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrf() },
            body: formData
        });

        const data = await res.json();


        if (loadingEl) loadingEl.style.display = 'none';

        if (data.success) {
            // 全部验证通过
            uploadedExcelFile = file;
            uploadedExcelItems = data.items || [];
            uploadedExcelErrors = null; // 无错误

            if (successEl) {
                successEl.style.display = 'block';
                document.getElementById('po-upload-success-message').textContent =
                    _t('js.parse_success', 'Parse successful! {count} item records', { count: uploadedExcelItems.length });
            }
            if (nextBtn) nextBtn.disabled = false;
        } else if (data.can_fix) {
            // 有需要修正的错误，但可以进入Step5修正
            uploadedExcelFile = file;
            uploadedExcelItems = data.items || [];
            uploadedExcelErrors = data; // 保存完整错误数据供Step5使用

            if (successEl) {
                successEl.style.display = 'block';
                successEl.className = 'alert alert-warning'; // 改为警告样式
                const errorCount = (data.sku_errors || []).length + (data.data_errors || []).length;
                document.getElementById('po-upload-success-message').innerHTML =
                    _t('js.parse_warning', 'Parse completed, found <strong class="text-danger">{count}</strong> errors to fix<br><small>Click Next to enter correction page</small>', { count: errorCount });
            }
            if (nextBtn) nextBtn.disabled = false;
        } else {
            // 严重错误，需要重新上传
            uploadedExcelFile = null;
            uploadedExcelItems = [];
            uploadedExcelErrors = null;

            if (errorEl) {
                errorEl.style.display = 'block';
                document.getElementById('po-upload-error-message').innerHTML =
                    _t('js.parse_failed', '<strong>Parse failed</strong><br>{message}', { message: data.message || _t('js.file_format_error', 'File format error') });
            }
            if (nextBtn) nextBtn.disabled = true;
        }
    } catch (e) {
        console.error('Parse Excel failed:', e);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            document.getElementById('po-upload-error-message').textContent = _t('js.network_error_retry', 'Network error, please retry');
        }
        if (nextBtn) nextBtn.disabled = true;
    }
}


// ============================================================
// Step3: 同步Step1数据到Step3
// ============================================================
function syncStep1ToStep3() {
    const date = document.getElementById('id_po_date_step1')?.value;
    const supplierCode = document.getElementById('id_supplier_code_step1')?.value;
    const supplier = suppliersData.find(s => s.code === supplierCode);

    // 同步到隐藏字段
    const dateHidden = document.getElementById('id_po_date');
    const supplierHidden = document.getElementById('id_supplier_code');
    if (dateHidden) dateHidden.value = date;
    if (supplierHidden) supplierHidden.value = supplierCode;

    // 显示在Step3的只读展示区
    const displayDate = document.getElementById('display_po_date');
    const displaySupplier = document.getElementById('display_supplier_code');
    if (displayDate) displayDate.textContent = date || '-';
    if (displaySupplier) displaySupplier.textContent = supplier ? `${supplierCode} - ${supplier.name}` : (supplierCode || '-');
}

async function loadSupplierStrategy() {
    const code = document.getElementById('id_supplier_code')?.value || document.getElementById('id_supplier_code_step1')?.value;
    const date = document.getElementById('id_po_date')?.value || document.getElementById('id_po_date_step1')?.value;

    if (!code || !date) return;

    // 重置状态
    document.getElementById('supplier-strategy-card').style.display = 'none';
    document.getElementById('strategy-choice-panel').style.display = 'none';
    document.getElementById('custom-strategy-panel').style.display = 'none';
    document.getElementById('btn-wizard-next-3').disabled = true;
    currentStrategy = null;
    useCustomStrategy = false;
    modifiedFields.clear();

    try {
        const res = await fetch(`/dashboard/purchase/api/po/strategy/?supplier_code=${code}&date=${date}`);
        const data = await res.json();

        if (data.success && data.strategy) {
            currentStrategy = data.strategy;
            originalStrategy = { ...data.strategy };

            // 获取汇率
            await fetchExchangeRate(date);

            // 显示策略信息
            renderStrategyDisplay(data.strategy);
            document.getElementById('strategy-effective-date').textContent = _t('js.strategy_effective_date', 'Effective Date: {date}', { date: data.strategy.effective_date });
            document.getElementById('supplier-strategy-card').style.display = 'block';
            document.getElementById('strategy-choice-panel').style.display = 'block';
        } else {
            const errorMsg = data.message || _t('js.strategy_not_found', 'Strategy not found for this supplier');
            if (typeof GlobalModal !== 'undefined') {
                GlobalModal.showError({ title: _t('js.policy_query_failed', 'Policy Query Failed'), message: errorMsg });
            }
        }
    } catch (e) {
        console.error('Fetch strategy failed:', e);
    }
}

// ============================================================
// Step5: 录入商品初始化
// ============================================================
function initStep5Items() {
    // 更新货币显示
    const currencyBadge = document.getElementById('currency-badge');
    if (currencyBadge) currencyBadge.textContent = poFormData.currency || 'RMB';

    // 显示当前模式
    const modeDisplay = document.getElementById('current-mode-display');
    if (modeDisplay) {
        modeDisplay.textContent = poInputMode === 'excel' ? _t('js.mode_excel', 'Excel Import') : _t('js.mode_manual', 'Manual Entry');
    }

    const uploadSection = document.getElementById('upload-section');
    const manualSection = document.getElementById('manual-section');

    // 始终使用手动输入表格
    if (uploadSection) uploadSection.style.display = 'none';
    if (manualSection) manualSection.style.display = 'block';


    // 初始化表格
    initManualItemsTable();

    // 如果是Excel模式，将解析的数据填入表格（包括错误数据）
    if (poInputMode === 'excel') {
        const items = uploadedExcelErrors ? uploadedExcelErrors.items : uploadedExcelItems;
        const skuErrors = uploadedExcelErrors ? uploadedExcelErrors.sku_errors : [];
        const allSkus = uploadedExcelErrors ? uploadedExcelErrors.all_skus : [];

        if (items && items.length > 0) {
            fillTableWithExcelDataAndErrors(items, skuErrors, allSkus);
        }
    }

    updateStep5NextButton();
}

// 将Excel数据填入可编辑表格（支持错误SKU高亮）
function fillTableWithExcelDataAndErrors(items, skuErrors, allSkus) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    // 清空现有行
    tbody.innerHTML = '';
    rowCounter = 0;

    // 创建SKU错误映射（row -> error info）
    const skuErrorMap = new Map();
    (skuErrors || []).forEach(err => {
        skuErrorMap.set(err.row, {
            error: err.error,
            suggestions: err.suggestions || []
        });
    });

    // 为每条Excel数据创建一行
    items.forEach(item => {
        const errorInfo = skuErrorMap.get(item.row);
        addItemRowWithDataAndError(
            item.sku || item.sku_original,
            item.qty,
            item.unit_price,
            errorInfo,
            allSkus
        );
    });

    // 更新统计和按钮状态
    updateItemsTotal();
    updateStep5NextButton();
}



// 将Excel解析的数据填入可编辑表格
function fillTableWithExcelData(items) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    // 清空现有行
    tbody.innerHTML = '';
    rowCounter = 0;

    // 为每条Excel数据创建一行
    items.forEach(item => {
        addItemRowWithData(item.sku, item.quantity, item.unit_price);
    });

    // 更新统计和按钮状态
    updateItemsTotal();
    updateStep5NextButton();
}

// 添加带数据的商品行
function addItemRowWithData(sku, qty, price) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    const currency = poFormData.currency || 'RMB';
    const skuUpper = sku ? sku.toUpperCase() : '';

    // 检查SKU是否在列表中（大小写不敏感）
    const matchedSku = skuList.find(s => s.toUpperCase() === skuUpper);
    const skuInList = !!matchedSku;
    const displaySku = matchedSku || skuUpper;

    // 构建选项：先默认选项，再SKU列表
    let skuOptions = '<option value="">-- 选择 SKU --</option>';

    // 如果SKU不在列表中，添加一个临时选项（标记为待验证）
    if (skuUpper && !skuInList) {
        skuOptions += `<option value="${skuUpper}" selected class="text-warning">${skuUpper} ⚠️</option>`;
    }

    // 添加所有系统SKU
    skuOptions += skuList.map(s =>
        `<option value="${s}"${s === displaySku ? ' selected' : ''}>${s}</option>`
    ).join('');

    const tr = document.createElement('tr');
    tr.className = 'items-row';
    tr.setAttribute('data-row-id', rowCounter++);

    const subtotal = (qty || 0) * (price || 0);

    // 如果SKU不在列表中，行背景添加警告色
    const rowWarningClass = (skuUpper && !skuInList) ? ' table-warning bg-warning bg-opacity-10' : '';

    tr.innerHTML = `
        <td>
            <select class="form-select form-select-sm bg-dark ${skuInList ? 'text-warning' : 'text-danger'} border-secondary sku-select" name="sku">
                ${skuOptions}
            </select>
            ${!skuInList && skuUpper ? '<small class="text-danger">SKU待验证</small>' : ''}
        </td>
        <td class="text-end">
            <input type="number" min="1" step="1" 
                   class="form-control form-control-sm bg-dark text-info border-secondary qty-input text-end" 
                   name="qty" placeholder="数量" value="${qty || ''}">
        </td>
        <td class="text-end">
            <div class="input-group input-group-sm">
                <span class="input-group-text currency-prefix">${currency}</span>
                <input type="number" min="0" step="0.01" 
                       class="form-control bg-dark text-info border-secondary price-input text-end" 
                       name="unit_price" placeholder="单价" value="${price || ''}">
            </div>
        </td>
        <td class="subtotal-cell text-end text-success fw-bold">
            <span class="currency-tag">${currency}</span> 
            <span class="subtotal-value">${subtotal > 0 ? subtotal.toFixed(2) : '-'}</span>
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-danger btn-remove-row">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;


    tbody.appendChild(tr);

    // 绑定事件
    tr.querySelector('.sku-select').addEventListener('change', () => {
        updateRowStatus(tr);
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });
    tr.querySelector('.qty-input').addEventListener('input', () => {
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });
    tr.querySelector('.price-input').addEventListener('input', () => {
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
        tr.remove();
        updateItemsTotal();
        updateStep5NextButton();
    });
}

// 添加带数据和错误信息的商品行（用于Excel导入）
function addItemRowWithDataAndError(sku, qty, price, errorInfo, allSkus) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    const currency = poFormData.currency || 'RMB';
    const skuUpper = sku ? sku.toUpperCase() : '';
    const hasError = !!errorInfo;
    const suggestions = errorInfo?.suggestions || [];

    // 检查SKU是否在系统列表中
    const matchedSku = skuList.find(s => s.toUpperCase() === skuUpper);
    const skuInList = !!matchedSku;

    // 构建下拉选项
    let skuOptions = '<option value="">-- 选择 SKU --</option>';

    // 如果有错误且有建议，添加建议选项组（前5个）
    if (hasError && suggestions.length > 0) {
        skuOptions += '<optgroup label="推荐匹配">';
        suggestions.slice(0, 5).forEach(s => {
            skuOptions += `<option value="${s}" class="text-info">${s}</option>`;
        });
        skuOptions += '</optgroup>';
    }

    // 如果SKU有错误，添加当前错误SKU作为选项（显示为红色）
    if (hasError && skuUpper) {
        skuOptions += `<option value="${skuUpper}" selected class="text-danger">❌ ${skuUpper}</option>`;
    }

    // 添加全部系统SKU
    skuOptions += '<optgroup label="全部SKU">';
    const skuListToUse = (allSkus && allSkus.length > 0) ? allSkus : skuList;
    skuListToUse.forEach(s => {
        const isSelected = !hasError && s.toUpperCase() === skuUpper;
        skuOptions += `<option value="${s}"${isSelected ? ' selected' : ''}>${s}</option>`;
    });
    skuOptions += '</optgroup>';

    const tr = document.createElement('tr');
    tr.className = 'items-row' + (hasError ? ' row-error bg-danger bg-opacity-10' : '');
    tr.setAttribute('data-row-id', rowCounter++);
    tr.setAttribute('data-has-sku-error', hasError ? 'true' : 'false');

    const subtotal = (qty || 0) * (price || 0);

    tr.innerHTML = `
        <td>
            <select class="form-select form-select-sm bg-dark ${hasError ? 'border-danger text-danger' : 'border-secondary text-warning'} sku-select" name="sku">
                ${skuOptions}
            </select>
            ${hasError ? `<small class="text-danger d-block mt-1"><i class="fas fa-exclamation-triangle me-1"></i>${errorInfo.error}</small>` : ''}
        </td>
        <td class="text-end">
            <input type="number" min="1" step="1" 
                   class="form-control form-control-sm bg-dark text-info border-secondary qty-input text-end" 
                   name="qty" placeholder="数量" value="${qty || ''}">
        </td>
        <td class="text-end">
            <div class="input-group input-group-sm">
                <span class="input-group-text currency-prefix">${currency}</span>
                <input type="number" min="0" step="0.01" 
                       class="form-control bg-dark text-info border-secondary price-input text-end" 
                       name="unit_price" placeholder="单价" value="${price || ''}">
            </div>
        </td>
        <td class="subtotal-cell text-end text-success fw-bold">
            <span class="currency-tag">${currency}</span> 
            <span class="subtotal-value">${subtotal > 0 ? subtotal.toFixed(2) : '-'}</span>
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-danger btn-remove-row">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;

    tbody.appendChild(tr);

    // 绑定事件
    const skuSelect = tr.querySelector('.sku-select');
    skuSelect.addEventListener('change', () => {
        // 当用户选择了正确的SKU，移除错误状态
        const selectedSku = skuSelect.value;
        const isValidSku = skuListToUse.includes(selectedSku);

        if (isValidSku) {
            tr.classList.remove('row-error', 'bg-danger', 'bg-opacity-10');
            tr.setAttribute('data-has-sku-error', 'false');
            skuSelect.classList.remove('border-danger', 'text-danger');
            skuSelect.classList.add('border-secondary', 'text-warning');
            const errorHint = tr.querySelector('small.text-danger');
            if (errorHint) errorHint.remove();
        }

        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });

    tr.querySelector('.qty-input').addEventListener('input', () => {
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });
    tr.querySelector('.price-input').addEventListener('input', () => {
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep5NextButton();
    });
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
        tr.remove();
        updateItemsTotal();
        updateStep5NextButton();
    });
}

function renderExcelItemsPreview() {
    const container = document.getElementById('excel-items-preview');
    const countBadge = document.getElementById('excel-item-count-badge');

    if (!container) return;

    if (!uploadedExcelItems || uploadedExcelItems.length === 0) {
        container.innerHTML = '<p class="text-white-50 text-center py-3">暂无解析数据</p>';
        if (countBadge) countBadge.textContent = '0 条商品';
        return;
    }

    if (countBadge) countBadge.textContent = `${uploadedExcelItems.length} 条商品`;

    // 构建预览表格
    let html = `
        <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
            <table class="table table-dark table-sm table-hover mb-0">
                <thead class="sticky-top bg-dark">
                    <tr class="text-info small">
                        <th>#</th>
                        <th>SKU</th>
                        <th class="text-end">数量</th>
                        <th class="text-end">单价</th>
                        <th class="text-end">小计</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let total = 0;
    uploadedExcelItems.forEach((item, idx) => {
        const subtotal = (item.quantity || 0) * (item.unit_price || 0);
        total += subtotal;
        html += `
            <tr>
                <td class="text-white-50">${idx + 1}</td>
                <td class="text-white">${item.sku || '-'}</td>
                <td class="text-white text-end">${item.quantity || 0}</td>
                <td class="text-white text-end">${(item.unit_price || 0).toFixed(2)}</td>
                <td class="text-info text-end">${subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot class="sticky-bottom bg-dark border-top border-secondary">
                    <tr class="text-white fw-bold">
                        <td colspan="4" class="text-end">合计:</td>
                        <td class="text-success text-end">${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function updateStep5NextButton() {
    const nextBtn = document.getElementById('btn-wizard-next-5');
    if (!nextBtn) return;

    // 检查是否有未修正的SKU错误
    const rowsWithError = document.querySelectorAll('#items-tbody tr[data-has-sku-error="true"]');
    if (rowsWithError.length > 0) {
        nextBtn.disabled = true;
        nextBtn.title = `还有 ${rowsWithError.length} 行SKU错误需要修正`;
        return;
    }

    // 检查是否有有效商品数据
    const items = collectItems();
    nextBtn.disabled = items.length === 0;
    nextBtn.title = items.length === 0 ? '请至少添加一条商品' : '验证商品数据';
}



// 初始化手动输入表格
function initManualItemsTable() {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    // 清空已有行（如果需要重新初始化）
    tbody.innerHTML = '';
    rowCounter = 0;

    // 添加初始行
    addItemRow();

    // 绑定添加行按钮事件（如果还没绑定）
    const addBtn = document.getElementById('btn-add-item');
    const batchBtn = document.getElementById('btn-add-items-batch');

    // 移除旧的监听器并重新绑定
    addBtn?.replaceWith(addBtn.cloneNode(true));
    batchBtn?.replaceWith(batchBtn.cloneNode(true));

    document.getElementById('btn-add-item')?.addEventListener('click', addItemRow);
    document.getElementById('btn-add-items-batch')?.addEventListener('click', () => {
        for (let i = 0; i < 5; i++) addItemRow();
    });

    // 更新行数统计
    updateRowCount();
    updateStep5NextButton();
}

// 更新行数统计显示
function updateRowCount() {
    const tbody = document.getElementById('items-tbody');
    const countEl = document.getElementById('row-count');
    if (tbody && countEl) {
        const validRows = collectItems().length;
        countEl.textContent = validRows;
    }
}


// ============================================================
// 事件监听器
// ============================================================
function setupEventListeners() {

    document.getElementById('id_supplier_code')?.addEventListener('change', onSelectionChange);
    document.getElementById('id_po_date')?.addEventListener('change', onSelectionChange);
    document.getElementById('btn-use-original')?.addEventListener('click', onUseOriginalStrategy);
    document.getElementById('btn-use-custom')?.addEventListener('click', onUseCustomStrategy);
    document.getElementById('btn-confirm-custom')?.addEventListener('click', onConfirmCustomStrategy);
    document.getElementById('btn-confirm-rate')?.addEventListener('click', onConfirmManualRate);

    // 汇率输入Modal关闭时检查：如果需要汇率但未填写，再次弹出
    const exchangeRateModal = document.getElementById('exchangeRateModal');
    if (exchangeRateModal) {
        exchangeRateModal.addEventListener('hidden.bs.modal', function () {
            // 如果需要强制输入汇率且汇率仍为空，再次弹出Modal
            if (needExchangeRateInput && (exchangeRate === null || exchangeRate === undefined)) {
                setTimeout(() => {
                    showExchangeRateInputModal('请输入汇率后才能继续', false);
                }, 300);
            }
        });
    }
}

// ============================================================
// 流程2: 供应商和策略选择 (兼容旧逻辑)
// ============================================================
async function onSelectionChange() {
    const code = document.getElementById('id_supplier_code')?.value || document.getElementById('id_supplier_code_step1')?.value;
    const date = document.getElementById('id_po_date')?.value || document.getElementById('id_po_date_step1')?.value;

    // 重置状态
    const strategyCard = document.getElementById('supplier-strategy-card');
    const choicePanel = document.getElementById('strategy-choice-panel');
    const customPanel = document.getElementById('custom-strategy-panel');
    const nextBtn = document.getElementById('btn-wizard-next-3');

    if (strategyCard) strategyCard.style.display = 'none';
    if (choicePanel) choicePanel.style.display = 'none';
    if (customPanel) customPanel.style.display = 'none';
    if (nextBtn) nextBtn.disabled = true;

    currentStrategy = null;
    useCustomStrategy = false;
    modifiedFields.clear();

    if (!code || !date) return;


    try {
        const res = await fetch(`/dashboard/purchase/api/po/strategy/?supplier_code=${code}&date=${date}`);
        const data = await res.json();

        if (data.success && data.strategy) {
            currentStrategy = data.strategy;
            originalStrategy = { ...data.strategy };

            // 获取汇率
            await fetchExchangeRate(date);

            // 显示策略信息
            renderStrategyDisplay(data.strategy);
            document.getElementById('strategy-effective-date').textContent = `生效日期: ${data.strategy.effective_date}`;
            document.getElementById('supplier-strategy-card').style.display = 'block';
            document.getElementById('strategy-choice-panel').style.display = 'block';
        } else {
            // 策略查询失败 - 显示详细错误信息
            const errorMsg = data.message || '未找到该供应商的策略';
            if (typeof GlobalModal !== 'undefined') {
                GlobalModal.showError({
                    title: (window.i18n?.isLoaded && window.i18n.t('js.policy_query_failed')) || 'Policy Query Failed',
                    message: errorMsg
                });
            } else {
                alert(errorMsg);
            }
        }
    } catch (e) {
        console.error('Fetch strategy failed:', e);
    }
}

// 汇率来源描述（用于显示）
let exchangeRateSource = '';
let exchangeRateDate = ''; // 汇率日期

async function fetchExchangeRate(date) {
    // 创建5秒超时的AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(`/dashboard/purchase/api/po/exchange-rate/?date=${date}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success && data.rate && !data.need_manual) {
            // 成功获取真实汇率
            exchangeRate = data.rate;
            exchangeRateSource = data.rate_desc || '自动获取';
            exchangeRateDate = data.rate_date || date;
            needExchangeRateInput = false;
            currentStrategy.exchange_rate = data.rate;
            renderStrategyDisplay(currentStrategy);
        } else if (data.need_manual) {
            // 需要手动输入
            exchangeRate = null;
            exchangeRateSource = '';
            exchangeRateDate = date;
            needExchangeRateInput = true;
            showExchangeRateInputModal(data.message, data.is_future);
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Fetch exchange rate failed:', e);
        // 超时或网络错误，需要手动输入
        exchangeRateDate = date;
        needExchangeRateInput = true;
        const message = e.name === 'AbortError'
            ? '获取汇率超时（5秒），请手动输入'
            : '网络错误，无法获取汇率，请手动输入';
        showExchangeRateInputModal(message, false);
    }
}
// 手动汇率输入组件实例（用于原策略需手动输入时）
let modalRateComponent = null;

function showExchangeRateInputModal(message, isFuture) {
    // 使用GlobalModal显示自定义内容，内嵌 GlobalExchangeRate 组件
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
                <!-- GlobalExchangeRate 组件容器 -->
                <div id="modal-exchange-rate-container"></div>
                <div id="gm_rate_error" class="text-danger small mt-2" style="display:none;">请输入有效的汇率（必须 >= 1）</div>
                <small class="text-white-50 mt-2 d-block">
                    <i class="fas fa-lightbulb me-1"></i>
                    提示：您可以从银行官网或外汇交易中心查询当日汇率
                </small>
            </div>
            <div class="modal-footer border-0 justify-content-center">
                <button type="button" class="btn btn-outline-secondary px-4" id="po-rate-modal-cancel">
                    取消
                </button>
                <button type="button" class="btn btn-warning px-4" id="po-rate-modal-confirm">
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

        // 初始化组件和绑定按钮事件
        setTimeout(function () {
            // 初始化 GlobalExchangeRate 组件
            const container = document.getElementById('modal-exchange-rate-container');
            if (container && typeof GlobalExchangeRate !== 'undefined') {
                // 销毁旧实例
                if (modalRateComponent) {
                    modalRateComponent.destroy && modalRateComponent.destroy();
                    modalRateComponent = null;
                }

                // 获取订单日期
                const getPoDate = () => {
                    return document.getElementById('id_po_date_step1')?.value ||
                        document.getElementById('id_po_date')?.value ||
                        new Date().toISOString().split('T')[0];
                };

                // 初始化组件
                modalRateComponent = new GlobalExchangeRate({
                    inputId: 'modal-rate-input',
                    container: '#modal-exchange-rate-container',
                    apiUrl: '/dashboard/purchase/api/po/exchange-rate/',
                    defaultRate: 7.25,
                    placeholder: '例如: 7.2500',
                    showStatusText: false,
                    onChange: (rate, source) => {
                        // 隐藏错误提示
                        const errEl = document.getElementById('gm_rate_error');
                        if (errEl && rate && rate >= 1) errEl.style.display = 'none';
                    }
                });
            }

            // 取消按钮
            const cancelBtn = document.getElementById('po-rate-modal-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function () {
                    // 销毁组件
                    if (modalRateComponent) {
                        modalRateComponent.destroy && modalRateComponent.destroy();
                        modalRateComponent = null;
                    }
                    GlobalModal.hide();
                    poWizard?.back();
                });
            }

            // 确认按钮
            const confirmBtn = document.getElementById('po-rate-modal-confirm');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', function () {
                    let rate = 0;
                    let rateMode = 'M';

                    // 从组件获取值
                    if (modalRateComponent) {
                        rate = modalRateComponent.getRate() || 0;  // 使用 getRate()
                        rateMode = modalRateComponent.getSource() || 'M';  // 使用 getSource()
                    }

                    if (!rate || rate < 1) {
                        const errEl = document.getElementById('gm_rate_error');
                        if (errEl) errEl.style.display = 'block';
                        return;
                    }

                    // 设置汇率
                    exchangeRate = rate;
                    exchangeRateSource = rateMode === 'A' ? '自动获取' : '手动输入';
                    needExchangeRateInput = false;
                    currentStrategy.exchange_rate = rate;

                    // 销毁组件
                    if (modalRateComponent) {
                        modalRateComponent.destroy && modalRateComponent.destroy();
                        modalRateComponent = null;
                    }

                    // 关闭modal
                    GlobalModal.hide();
                    renderStrategyDisplay(currentStrategy);
                });
            }
        }, 100);
    }
}

function renderStrategyDisplay(s) {
    const grid = document.getElementById('strategy-display-grid');
    const rate = exchangeRate || s.exchange_rate || '-';

    // 汇率来源提示标签（包含日期）
    let rateSourceBadge = '';
    if (exchangeRateSource) {
        // 手动输入显示黄色，其他（自动获取）显示绿色
        if (exchangeRateSource === '手动输入') {
            rateSourceBadge = `<span class="badge bg-warning text-dark" style="font-size: 0.7rem;">手动录入</span>`;
        } else {
            // 自动获取时显示日期
            const dateInfo = exchangeRateDate ? ` (${exchangeRateDate})` : '';
            rateSourceBadge = `<span class="badge bg-success" style="font-size: 0.7rem;" data-bs-toggle="tooltip" title="${exchangeRateSource}">自动获取${dateInfo}</span>`;
        }
    }

    // 名片布局：2个一行，共3行
    grid.innerHTML = `
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="供应商结算货币">结算货币</div>
            <div class="text-info fw-bold fs-5">${s.currency}</div>
        </div></div>
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="供应商结算汇率(USD/RMB)">结算汇率</div>
            <div class="d-flex align-items-center gap-2">
                <span class="text-white fw-bold fs-5">${rate}</span>
                ${rateSourceBadge}
            </div>
        </div></div>
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="供应商是否要求价格跟随汇率浮动">价格浮动</div>
            <div class="text-white">${s.float_currency ? '<span class="text-success">是</span>' : '<span class="text-secondary">否</span>'}</div>
        </div></div>
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="若供应商要求价格跟随汇率浮动, 汇率浮动阈值">浮动阈值</div>
            <div class="text-white">${s.float_threshold}%</div>
        </div></div>
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="供应商是否要求订单要提前支付定金">定金要求</div>
            <div class="text-white">${s.depository ? '<span class="text-success">是</span>' : '<span class="text-secondary">否</span>'}</div>
        </div></div>
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25">
            <div class="text-white-50 small mb-1" data-bs-toggle="tooltip" title="供应商要求提前支付定金百分比">定金比例</div>
            <div class="text-white">${s.deposit_par}%</div>
        </div></div>
    `;
    initTooltips();
}

// 渲染带编辑功能的策略卡片（左边原值，右边编辑）
function renderStrategyDisplayWithEdit(s) {
    const grid = document.getElementById('strategy-display-grid');
    const rate = exchangeRate || s.exchange_rate || '';

    // 汇率来源提示
    let rateSourceBadge = '';
    if (exchangeRateSource) {
        if (exchangeRateSource === '手动输入') {
            rateSourceBadge = `<span class="badge bg-warning text-dark" style="font-size: 0.65rem;">手动录入</span>`;
        } else {
            rateSourceBadge = `<span class="badge bg-success" style="font-size: 0.65rem;">自动获取</span>`;
        }
    }

    // 带编辑控件的名片布局：每个框体左侧原策略(50%)，右侧编辑(50%)
    grid.innerHTML = `
        <!-- 结算货币 -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">结算货币</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="text-info fw-bold">${s.currency}</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div class="btn-group btn-group-sm w-100" role="group">
                        <input type="radio" class="btn-check" name="edit_currency" id="edit_curr_rmb" value="RMB" ${s.currency === 'RMB' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm py-0" for="edit_curr_rmb">RMB</label>
                        <input type="radio" class="btn-check" name="edit_currency" id="edit_curr_usd" value="USD" ${s.currency === 'USD' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm py-0" for="edit_curr_usd">USD</label>
                    </div>
                </div>
            </div>
        </div></div>
        
        <!-- 结算汇率 (使用 GlobalExchangeRate 组件) -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">结算汇率 ${rateSourceBadge}</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="text-white fw-bold">${rate || '-'}</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div id="edit-exchange-rate-container"></div>
                    <input type="hidden" id="edit_exchange_rate" value="${rate}">
                    <input type="hidden" id="edit_exchange_rate_mode" value="${exchangeRateSource === '手动输入' ? 'M' : 'A'}">
                </div>
            </div>
        </div></div>
        
        <!-- 价格浮动 -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">价格浮动</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="${s.float_currency ? 'text-success' : 'text-secondary'}">${s.float_currency ? '是' : '否'}</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input" type="checkbox" id="edit_float_enabled" ${s.float_currency ? 'checked' : ''}>
                        <label class="form-check-label text-warning small" for="edit_float_enabled">启用</label>
                    </div>
                </div>
            </div>
        </div></div>
        
        <!-- 浮动阈值 -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">浮动阈值</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="text-white fw-bold">${s.float_threshold}%</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div class="d-flex align-items-center gap-1">
                        <input type="range" class="form-range flex-grow-1" min="0" max="10" step="0.1" style="width: 60%;"
                               id="edit_float_range" value="${s.float_threshold}" ${!s.float_currency ? 'disabled' : ''}>
                        <span class="text-warning small" id="edit_float_display">${s.float_threshold}%</span>
                    </div>
                </div>
            </div>
        </div></div>
        
        <!-- 定金要求 -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">定金要求</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="${s.depository ? 'text-success' : 'text-secondary'}">${s.depository ? '是' : '否'}</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input" type="checkbox" id="edit_deposit_enabled" ${s.depository ? 'checked' : ''}>
                        <label class="form-check-label text-warning small" for="edit_deposit_enabled">启用</label>
                    </div>
                </div>
            </div>
        </div></div>
        
        <!-- 定金比例 -->
        <div class="col-6"><div class="p-3 rounded bg-black bg-opacity-25 border border-warning border-opacity-50">
            <div class="text-white-50 small mb-2">定金比例</div>
            <div class="row g-0">
                <div class="col-6 pe-2 border-end border-secondary">
                    <span class="text-white fw-bold">${s.deposit_par}%</span>
                    <div class="text-white-50" style="font-size: 0.6rem;">原策略</div>
                </div>
                <div class="col-6 ps-2">
                    <div class="d-flex align-items-center gap-1">
                        <input type="range" class="form-range flex-grow-1" min="0" max="100" step="1" style="width: 60%;"
                               id="edit_deposit_range" value="${s.deposit_par}" ${!s.depository ? 'disabled' : ''}>
                        <span class="text-warning small" id="edit_deposit_display">${s.deposit_par}%</span>
                    </div>
                </div>
            </div>
        </div></div>
    `;

    // 绑定编辑事件
    bindEditControls();
    // 销毁旧的tooltips再初始化新的
    disposeTooltips();
    initTooltips();

    // 初始化编辑汇率组件 (在DOM更新后)
    initEditExchangeRateComponent();
}

function bindEditControls() {
    // 浮动阈值滑块
    const floatRange = document.getElementById('edit_float_range');
    const floatDisplay = document.getElementById('edit_float_display');
    floatRange?.addEventListener('input', () => {
        floatDisplay.textContent = floatRange.value + '%';
        checkEditModified();
    });

    // 定金比例滑块
    const depositRange = document.getElementById('edit_deposit_range');
    const depositDisplay = document.getElementById('edit_deposit_display');
    depositRange?.addEventListener('input', () => {
        depositDisplay.textContent = depositRange.value + '%';
        checkEditModified();
    });

    // 浮动开关
    const floatToggle = document.getElementById('edit_float_enabled');
    floatToggle?.addEventListener('change', () => {
        floatRange.disabled = !floatToggle.checked;
        checkEditModified();
    });

    // 定金开关
    const depositToggle = document.getElementById('edit_deposit_enabled');
    depositToggle?.addEventListener('change', () => {
        depositRange.disabled = !depositToggle.checked;
        checkEditModified();
    });

    // 其他输入变化
    document.querySelectorAll('#strategy-display-grid input').forEach(el => {
        el.addEventListener('change', checkEditModified);
        el.addEventListener('input', checkEditModified);
    });
}

function checkEditModified() {
    const s = originalStrategy;

    // 获取编辑后的值
    const curr = document.querySelector('input[name="edit_currency"]:checked')?.value || s.currency;
    const rate = getEditExchangeRate();  // 使用组件函数获取汇率
    const floatEn = document.getElementById('edit_float_enabled')?.checked || false;
    const floatVal = parseFloat(document.getElementById('edit_float_range')?.value) || 0;
    const depositEn = document.getElementById('edit_deposit_enabled')?.checked || false;
    const depositVal = parseFloat(document.getElementById('edit_deposit_range')?.value) || 0;

    // 跟踪修改的字段
    modifiedFields.clear();
    if (curr !== s.currency) modifiedFields.add('currency');
    if (rate !== (exchangeRate || s.exchange_rate || 0)) modifiedFields.add('exchange_rate');
    if (floatEn !== s.float_currency) modifiedFields.add('float_enabled');
    if (floatVal !== s.float_threshold) modifiedFields.add('float_threshold');
    if (depositEn !== s.depository) modifiedFields.add('deposit_enabled');
    if (depositVal !== s.deposit_par) modifiedFields.add('deposit_percentage');

    // 启用下一步按钮（编辑模式下直接可用）
    document.getElementById('btn-wizard-next-3').disabled = false;
}


function onUseOriginalStrategy() {
    useCustomStrategy = false;
    modifiedFields.clear();

    // 销毁旧的tooltips
    disposeTooltips();

    // 隐藏旧的编辑面板（保留兼容）
    const oldPanel = document.getElementById('custom-strategy-panel');
    if (oldPanel) oldPanel.style.display = 'none';

    // 按钮样式
    document.getElementById('btn-use-original').classList.remove('btn-outline-success');
    document.getElementById('btn-use-original').classList.add('btn-success');
    document.getElementById('btn-use-custom').classList.remove('btn-warning');
    document.getElementById('btn-use-custom').classList.add('btn-outline-warning');
    document.getElementById('btn-wizard-next-3').disabled = false;

    // 渲染只读版本
    renderStrategyDisplay(currentStrategy);
}

function onUseCustomStrategy() {
    useCustomStrategy = true;

    // 销毁旧的tooltips
    disposeTooltips();

    // 隐藏旧的编辑面板（不再使用）
    const oldPanel = document.getElementById('custom-strategy-panel');
    if (oldPanel) oldPanel.style.display = 'none';

    // 按钮样式
    document.getElementById('btn-use-custom').classList.remove('btn-outline-warning');
    document.getElementById('btn-use-custom').classList.add('btn-warning');
    document.getElementById('btn-use-original').classList.remove('btn-success');
    document.getElementById('btn-use-original').classList.add('btn-outline-success');
    document.getElementById('btn-wizard-next-3').disabled = false;

    // 渲染可编辑版本（内嵌编辑控件）
    renderStrategyDisplayWithEdit(currentStrategy);
}

function setupCustomStrategyControls() {
    const floatToggle = document.getElementById('custom_float_enabled');
    const depositToggle = document.getElementById('custom_deposit_enabled');

    floatToggle?.addEventListener('change', () => {
        document.getElementById('custom_float_range').disabled = !floatToggle.checked;
        document.getElementById('custom_float_value').disabled = !floatToggle.checked;
        checkCustomStrategyModified();
    });

    depositToggle?.addEventListener('change', () => {
        document.getElementById('custom_deposit_range').disabled = !depositToggle.checked;
        document.getElementById('custom_deposit_value').disabled = !depositToggle.checked;
        checkCustomStrategyModified();
    });

    // 同步range和input
    ['float', 'deposit'].forEach(type => {
        const range = document.getElementById(`custom_${type}_range`);
        const input = document.getElementById(`custom_${type}_value`);
        range?.addEventListener('input', () => { input.value = range.value; checkCustomStrategyModified(); });
        input?.addEventListener('input', () => { range.value = input.value; checkCustomStrategyModified(); });
    });

    // 监听所有变化
    document.querySelectorAll('#custom-strategy-panel input').forEach(el => {
        el.addEventListener('change', checkCustomStrategyModified);
        el.addEventListener('input', checkCustomStrategyModified);
    });
}

// 初始化自定义策略汇率组件
function initCustomExchangeRateComponent() {
    const container = document.getElementById('custom-exchange-rate-container');
    if (!container || typeof GlobalExchangeRate === 'undefined') {
        console.warn('[PO Wizard] GlobalExchangeRate not available or container not found');
        return;
    }

    // 获取订单日期用于自动获取汇率
    const getPoDate = () => {
        return document.getElementById('id_po_date_step1')?.value ||
            document.getElementById('id_po_date')?.value ||
            new Date().toISOString().split('T')[0];
    };

    // 初始化组件
    customRateComponent = new GlobalExchangeRate({
        inputId: 'custom-rate-input',
        container: '#custom-exchange-rate-container',
        apiUrl: '/dashboard/purchase/api/po/exchange-rate/',
        getDateFn: getPoDate,
        defaultRate: exchangeRate || 7.25,
        placeholder: '例如: 7.2500',
        onChange: (rate, source) => {
            // 更新隐藏字段
            const hiddenRate = document.getElementById('custom_exchange_rate');
            const hiddenMode = document.getElementById('custom_exchange_rate_mode');
            if (hiddenRate) hiddenRate.value = rate || '';
            if (hiddenMode) hiddenMode.value = source === 'A' ? 'A' : 'M';

            // 触发自定义策略修改检查
            checkCustomStrategyModified();
        }
    });

    console.log('[PO Wizard] CustomExchangeRate component initialized');
}

// 获取自定义策略汇率值
function getCustomExchangeRate() {
    if (customRateComponent) {
        return customRateComponent.getRate() || 0;  // 使用 getRate()
    }
    // 兼容：如果组件不存在，从隐藏字段读取
    return parseFloat(document.getElementById('custom_exchange_rate')?.value) || 0;
}

// 获取自定义策略汇率模式
function getCustomExchangeRateMode() {
    if (customRateComponent) {
        return customRateComponent.getSource() || 'M';  // 使用 getSource() 返回 A/M/-
    }
    return document.getElementById('custom_exchange_rate_mode')?.value || 'M';
}

// 编辑汇率组件实例
let editRateComponent = null;

// 初始化编辑汇率组件 (用于自定义策略编辑)
function initEditExchangeRateComponent() {
    const container = document.getElementById('edit-exchange-rate-container');
    if (!container || typeof GlobalExchangeRate === 'undefined') {
        console.warn('[PO Wizard] GlobalExchangeRate not available for edit or container not found');
        return;
    }

    // 销毁旧实例
    if (editRateComponent) {
        editRateComponent.destroy && editRateComponent.destroy();
        editRateComponent = null;
    }

    // 获取订单日期
    const getPoDate = () => {
        return document.getElementById('id_po_date_step1')?.value ||
            document.getElementById('id_po_date')?.value ||
            new Date().toISOString().split('T')[0];
    };

    // 从隐藏字段获取初始值
    const initialRate = parseFloat(document.getElementById('edit_exchange_rate')?.value) || exchangeRate || 7.25;

    // 初始化组件
    editRateComponent = new GlobalExchangeRate({
        inputId: 'edit-rate-input',
        container: '#edit-exchange-rate-container',
        apiUrl: '/dashboard/purchase/api/po/exchange-rate/',
        getDateFn: getPoDate,
        defaultRate: initialRate,
        placeholder: '新值',
        showStatusText: false,
        onChange: (rate, source) => {
            // 更新隐藏字段
            const hiddenRate = document.getElementById('edit_exchange_rate');
            const hiddenMode = document.getElementById('edit_exchange_rate_mode');
            if (hiddenRate) hiddenRate.value = rate || '';
            if (hiddenMode) hiddenMode.value = source === 'A' ? 'A' : 'M';

            // 触发修改检查
            checkEditModified();
        }
    });

    console.log('[PO Wizard] EditExchangeRate component initialized');
}

// 获取编辑汇率值
function getEditExchangeRate() {
    if (editRateComponent) {
        return editRateComponent.getRate() || 0;  // 使用 getRate() 而不是 getValue()
    }
    return parseFloat(document.getElementById('edit_exchange_rate')?.value) || 0;
}

// 获取编辑汇率模式
function getEditExchangeRateMode() {
    if (editRateComponent) {
        return editRateComponent.getSource() || 'M';  // 使用 getSource() 返回 A/M/-
    }
    return document.getElementById('edit_exchange_rate_mode')?.value || 'M';
}


function checkCustomStrategyModified() {
    const s = originalStrategy;
    const curr = document.querySelector('input[name="custom_currency"]:checked')?.value || '';
    const rate = getCustomExchangeRate();  // 使用组件函数获取汇率
    const floatEn = document.getElementById('custom_float_enabled').checked;
    const floatVal = parseFloat(document.getElementById('custom_float_value').value) || 0;
    const depositEn = document.getElementById('custom_deposit_enabled').checked;
    const depositVal = parseFloat(document.getElementById('custom_deposit_value').value) || 0;

    // 跟踪修改的字段
    modifiedFields.clear();
    if (curr !== s.currency) modifiedFields.add('currency');
    if (rate !== (exchangeRate || 0)) modifiedFields.add('exchange_rate');
    if (floatEn !== s.float_currency) modifiedFields.add('float_enabled');
    if (floatVal !== s.float_threshold) modifiedFields.add('float_threshold');
    if (depositEn !== s.depository) modifiedFields.add('deposit_enabled');
    if (depositVal !== s.deposit_par) modifiedFields.add('deposit_percentage');

    const hasModifications = modifiedFields.size > 0;
    document.getElementById('btn-confirm-custom').disabled = !hasModifications;
}

function onConfirmCustomStrategy() {
    customStrategy = {
        currency: document.querySelector('input[name="custom_currency"]:checked')?.value || 'RMB',
        exchange_rate: getCustomExchangeRate() || exchangeRate,
        cur_mode: getCustomExchangeRateMode(),  // 汇率获取方式
        float_currency: document.getElementById('custom_float_enabled').checked,
        float_threshold: parseFloat(document.getElementById('custom_float_value').value) || 0,
        depository: document.getElementById('custom_deposit_enabled').checked,
        deposit_par: parseFloat(document.getElementById('custom_deposit_value').value) || 0
    };
    document.getElementById('btn-wizard-next-3').disabled = false;
    if (typeof GlobalModal !== 'undefined') {
        GlobalModal.showSuccess({ title: (window.i18n?.isLoaded && window.i18n.t('js.policy_confirmed')) || 'Policy Confirmed', content: '自定义策略已应用于当前订单' });
    }
}

// ============================================================
// 流程3: 参数验证
// ============================================================
function collectFormData() {
    const supplier = suppliersData.find(s => s.code === document.getElementById('id_supplier_code').value);

    // 如果使用自定义策略，从内嵌编辑控件获取值
    let strategyData;
    if (useCustomStrategy) {
        strategyData = {
            currency: document.querySelector('input[name="edit_currency"]:checked')?.value || currentStrategy.currency,
            exchange_rate: getEditExchangeRate() || exchangeRate,  // 使用组件函数获取
            float_currency: document.getElementById('edit_float_enabled')?.checked || false,
            float_threshold: parseFloat(document.getElementById('edit_float_range')?.value) || 0,
            depository: document.getElementById('edit_deposit_enabled')?.checked || false,
            deposit_par: parseFloat(document.getElementById('edit_deposit_range')?.value) || 0
        };
    } else {
        strategyData = currentStrategy;
    }

    poFormData = {
        supplier_code: document.getElementById('id_supplier_code').value,
        supplier_name: supplier?.name || '',
        po_date: document.getElementById('id_po_date').value,
        currency: strategyData.currency,
        exchange_rate: strategyData.exchange_rate || exchangeRate,
        // cur_mode: A=自动获取, M=手动输入
        // 自定义策略时使用组件返回的mode，否则使用原策略的exchangeRateSource
        cur_mode: useCustomStrategy
            ? getEditExchangeRateMode()
            : (exchangeRateSource === '手动输入' ? 'M' : 'A'),
        float_enabled: strategyData.float_currency,
        float_threshold: strategyData.float_threshold,
        deposit_required: strategyData.depository,
        deposit_percentage: strategyData.deposit_par,
        use_custom_strategy: useCustomStrategy,
        modified_fields: Array.from(modifiedFields)
    };
}

function renderVerifyParamsStep() {
    collectFormData();

    // 填充数据
    document.getElementById('verify-supplier-code').textContent = poFormData.supplier_code;
    document.getElementById('verify-supplier-name').textContent = poFormData.supplier_name;
    document.getElementById('verify-po-date').textContent = poFormData.po_date;
    document.getElementById('verify-currency').textContent = poFormData.currency;
    document.getElementById('verify-exchange-rate').textContent = poFormData.exchange_rate;
    document.getElementById('verify-float-enabled').innerHTML = poFormData.float_enabled
        ? '<span class="text-success">开</span>' : '<span class="text-secondary">关</span>';
    document.getElementById('verify-float-threshold').textContent = poFormData.float_threshold + '%';
    document.getElementById('verify-deposit-enabled').innerHTML = poFormData.deposit_required
        ? '<span class="text-success">开</span>' : '<span class="text-secondary">关</span>';
    document.getElementById('verify-deposit-percentage').textContent = poFormData.deposit_percentage + '%';

    // 策略类型标识
    const badge = document.getElementById('strategy-type-badge');
    if (useCustomStrategy) {
        badge.textContent = '订单级自定义策略';
        badge.classList.remove('d-none');
    } else {
        badge.textContent = '使用原有策略';
        badge.classList.remove('d-none');
    }

    // 显示"订单级策略"标签
    ['currency', 'exchange_rate', 'float_enabled', 'float_threshold', 'deposit_enabled', 'deposit_percentage'].forEach(field => {
        const badgeEl = document.getElementById(`badge-${field.replace('_', '-')}`);
        if (badgeEl) {
            if (modifiedFields.has(field)) {
                badgeEl.classList.remove('d-none');
            } else {
                badgeEl.classList.add('d-none');
            }
        }
    });

    // 如果使用原策略，跳过验证直接通过
    if (!useCustomStrategy) {
        showParamsValidationSuccess();
        return;
    }

    // 验证自定义策略
    runParamsValidation();
}

async function runParamsValidation() {
    const card = document.getElementById('params-validation-card');
    const icon = document.getElementById('params-validation-icon');
    const title = document.getElementById('params-validation-title');
    const nextBtn = document.getElementById('btn-wizard-next-4');
    const errorsContainer = document.getElementById('params-errors-container');
    const errorsList = document.getElementById('params-errors-list');

    card.className = 'card mb-4 state-loading';
    icon.className = 'fa-solid fa-spinner fa-spin me-2 text-warning';
    title.textContent = '正在验证...'; title.className = 'text-warning';
    if (nextBtn) nextBtn.disabled = true;

    errorsContainer.style.display = 'none';
    paramsValidated = false;

    const errors = [];

    // 【关键验证】如果选择了新策略但没有任何修改，验证失败
    if (useCustomStrategy && modifiedFields.size === 0) {
        errors.push({
            field: '策略修改',
            message: (window.i18n?.isLoaded && window.i18n.t('js.strategy_no_change')) || 'You selected "New Policy" but made no changes. Please modify at least one parameter.'
        });
    }

    // 仅验证用户修改的字段
    if (modifiedFields.has('currency')) {
        if (!['RMB', 'USD'].includes(poFormData.currency)) {
            errors.push({ field: '结算货币', message: (window.i18n?.isLoaded && window.i18n.t('js.currency_invalid')) || 'Must be RMB or USD' });
        }
    }

    if (modifiedFields.has('exchange_rate')) {
        if (typeof poFormData.exchange_rate !== 'number' || poFormData.exchange_rate < 1) {
            errors.push({ field: '结算汇率', message: (window.i18n?.isLoaded && window.i18n.t('js.rate_invalid')) || 'Must be a number >= 1' });
        }
    }

    if (modifiedFields.has('float_enabled') || modifiedFields.has('float_threshold')) {
        if (poFormData.float_enabled) {
            if (poFormData.float_threshold <= 0 || poFormData.float_threshold > 10) {
                errors.push({ field: '价格浮动阈值', message: (window.i18n?.isLoaded && window.i18n.t('js.float_on_invalid')) || 'When enabled, threshold must be 0-10' });
            }
        } else {
            if (poFormData.float_threshold !== 0 && poFormData.float_threshold !== null) {
                errors.push({ field: '价格浮动阈值', message: (window.i18n?.isLoaded && window.i18n.t('js.float_off_invalid')) || 'When disabled, threshold must be empty or 0' });
            }
        }
    }

    if (modifiedFields.has('deposit_enabled') || modifiedFields.has('deposit_percentage')) {
        if (poFormData.deposit_required) {
            if (poFormData.deposit_percentage <= 0 || poFormData.deposit_percentage > 100) {
                errors.push({ field: '定金百分比', message: (window.i18n?.isLoaded && window.i18n.t('js.deposit_on_invalid')) || 'When enabled, percentage must be 0-100' });
            }
        } else {
            if (poFormData.deposit_percentage !== 0 && poFormData.deposit_percentage !== null) {
                errors.push({ field: '定金百分比', message: (window.i18n?.isLoaded && window.i18n.t('js.deposit_off_invalid')) || 'When disabled, percentage must be empty or 0' });
            }
        }
    }

    // 模拟异步验证
    await new Promise(r => setTimeout(r, 300));

    if (errors.length > 0) {
        card.className = 'card mb-4 state-error';
        icon.className = 'fa-solid fa-circle-xmark me-2 text-danger';
        title.textContent = '验证失败'; title.className = 'text-danger';
        errorsList.innerHTML = errors.map(e => `<li><strong class="text-danger">${e.field}：</strong>${e.message}</li>`).join('');
        errorsContainer.style.display = 'block';
        paramsValidated = false;
    } else {
        showParamsValidationSuccess();
    }
}


function showParamsValidationSuccess() {
    const card = document.getElementById('params-validation-card');
    const icon = document.getElementById('params-validation-icon');
    const title = document.getElementById('params-validation-title');
    const nextBtn = document.getElementById('btn-wizard-next-4');

    card.className = 'card mb-4 state-success';
    icon.className = 'fa-solid fa-circle-check me-2 text-success';
    title.textContent = '验证通过'; title.className = 'text-success';
    document.getElementById('params-errors-container').style.display = 'none';
    if (nextBtn) nextBtn.disabled = false;
    paramsValidated = true;
}


// ============================================================
// 流程4: 录入商品信息
// ============================================================
function setupInputMethodToggle() {
    document.getElementById('method_upload')?.addEventListener('change', function () {
        if (this.checked) {
            inputMethod = 'upload';
            document.getElementById('upload-section').style.display = 'block';
            document.getElementById('manual-section').style.display = 'none';
            updateStep4NextButton();
        }
    });

    document.getElementById('method_manual')?.addEventListener('change', function () {
        if (this.checked) {
            inputMethod = 'manual';
            document.getElementById('upload-section').style.display = 'none';
            document.getElementById('manual-section').style.display = 'block';
            // 更新货币单位显示
            document.getElementById('currency-badge').textContent = poFormData.currency || 'RMB';
            // 初始化表格
            if (document.getElementById('items-tbody').children.length === 0) {
                addItemRow();
            }
            updateStep4NextButton();
        }
    });

    // 添加行按钮
    document.getElementById('btn-add-item')?.addEventListener('click', addItemRow);
    document.getElementById('btn-add-items-batch')?.addEventListener('click', () => {
        for (let i = 0; i < 5; i++) addItemRow();
    });
}

function addItemRow() {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    const currency = poFormData.currency || 'RMB';
    const skuOptions = '<option value="" selected>-- 选择 SKU --</option>' +
        skuList.map(s => `<option value="${s}">${s}</option>`).join('');

    const tr = document.createElement('tr');
    tr.className = 'items-row';
    tr.setAttribute('data-row-id', rowCounter++);

    tr.innerHTML = `
        <td>
            <select class="form-select form-select-sm bg-dark text-warning border-secondary sku-select" name="sku">
                ${skuOptions}
            </select>
        </td>
        <td class="text-end">
            <input type="number" min="1" step="1" 
                   class="form-control form-control-sm bg-dark text-info border-secondary qty-input text-end" 
                   name="qty" placeholder="数量">
        </td>
        <td class="text-end">
            <div class="input-group input-group-sm">
                <span class="input-group-text currency-prefix">${currency}</span>
                <input type="number" min="0" step="0.01" 
                       class="form-control bg-dark text-info border-secondary price-input text-end" 
                       name="unit_price" placeholder="单价">
            </div>
        </td>
        <td class="subtotal-cell text-end text-success fw-bold">
            <span class="currency-tag">${currency}</span> 
            <span class="subtotal-value">-</span>
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-danger btn-remove-row">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;


    tbody.appendChild(tr);

    // 绑定事件 - 包括小计实时计算
    tr.querySelector('.sku-select').addEventListener('change', () => {
        updateRowStatus(tr);
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep4NextButton();
    });
    tr.querySelector('.qty-input').addEventListener('input', () => {
        updateRowStatus(tr);
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep4NextButton();
    });
    tr.querySelector('.price-input').addEventListener('input', () => {
        updateRowStatus(tr);
        updateRowSubtotal(tr);
        updateItemsTotal();
        updateStep4NextButton();
    });
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
        tr.remove();
        updateRowCount();
        updateItemsTotal();
        updateStep4NextButton();
    });

    updateRowCount();
}

// 更新单行小计
function updateRowSubtotal(tr) {
    const qty = parseInt(tr.querySelector('.qty-input')?.value) || 0;
    const price = parseFloat(tr.querySelector('.price-input')?.value) || 0;
    const subtotalCell = tr.querySelector('.subtotal-cell');
    if (!subtotalCell) return;

    const currency = poFormData.currency || 'RMB';

    if (qty > 0 && price > 0) {
        const subtotal = qty * price;
        // 检查是否有currency-tag和subtotal-value结构
        const currencyTag = subtotalCell.querySelector('.currency-tag');
        const subtotalValue = subtotalCell.querySelector('.subtotal-value');

        if (currencyTag && subtotalValue) {
            currencyTag.textContent = currency;
            subtotalValue.textContent = subtotal.toFixed(2);
        } else {
            subtotalCell.innerHTML = `<span class="currency-tag">${currency}</span> <span class="subtotal-value">${subtotal.toFixed(2)}</span>`;
        }
        subtotalCell.classList.remove('text-muted');
        subtotalCell.classList.add('text-success');
    } else {
        subtotalCell.textContent = '-';
        subtotalCell.classList.remove('text-success');
        subtotalCell.classList.add('text-muted');
    }
}


// 更新总计（只计算有效行）
function updateItemsTotal() {
    const rows = document.querySelectorAll('#items-tbody tr.items-row');
    let total = 0;

    rows.forEach(tr => {
        const sku = tr.querySelector('.sku-select')?.value;
        const qty = parseInt(tr.querySelector('.qty-input')?.value) || 0;
        const price = parseFloat(tr.querySelector('.price-input')?.value) || 0;

        // 只有有效行（3项都填写）才计入总计
        if (sku && qty > 0 && price > 0) {
            total += qty * price;
        }
    });

    const currency = poFormData.currency || 'RMB';
    const totalEl = document.getElementById('items-total');
    if (totalEl) {
        totalEl.textContent = `${currency} ${total.toFixed(2)}`;
    }
}

function updateRowStatus(tr) {
    const sku = tr.querySelector('.sku-select').value;
    const qty = parseInt(tr.querySelector('.qty-input').value) || 0;
    const price = parseFloat(tr.querySelector('.price-input').value) || 0;

    tr.classList.remove('row-valid', 'row-invalid');

    if (sku && qty > 0 && price > 0) {
        tr.classList.add('row-valid');
    } else if (sku || qty || price) {
        // 有部分填写但不完整
        tr.classList.add('row-invalid');
    }
}

function updateRowCount() {
    const count = document.querySelectorAll('#items-tbody tr').length;
    const countEl = document.getElementById('row-count');
    if (countEl) countEl.textContent = count;
}

function collectItems() {
    const items = [];
    document.querySelectorAll('#items-tbody tr').forEach(tr => {
        const sku = tr.querySelector('.sku-select')?.value?.trim() || '';
        const qty = parseInt(tr.querySelector('.qty-input')?.value) || 0;
        const price = parseFloat(tr.querySelector('.price-input')?.value) || 0;

        if (sku && qty > 0 && price > 0) {
            items.push({ sku, qty, unit_price: price });
        }
    });
    return items;
}

function updateStep4NextButton() {
    // 兼容：现在录入商品是Step5，调用updateStep5NextButton
    updateStep5NextButton();
}


// ============================================================
// 向导初始化
// ============================================================
function initPOWizard() {
    poWizard = new GlobalWizard({
        containerId: 'po-add-wizard-container',
        steps: [
            { id: 'basic', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_basic')) || 'Basic Info', contentSelector: '#po-step-basic' },
            { id: 'mode-select', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_mode_select')) || 'Entry Mode', contentSelector: '#po-step-mode-select' },
            { id: 'params', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_contract')) || 'Contract Policy', contentSelector: '#po-step-params' },
            { id: 'verify-params', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_verify_contract')) || 'Verify Policy', contentSelector: '#po-step-verify-params' },
            { id: 'items', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_items')) || 'Enter Products', contentSelector: '#po-step-items' },
            { id: 'verify-items', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_verify_items')) || 'Verify Products', contentSelector: '#po-step-verify-items' },
            { id: 'preview', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_preview')) || 'Preview Order', contentSelector: '#po-step-preview' },
            { id: 'finish', label: (window.i18n?.isLoaded && window.i18n.t('wizard.po_done')) || 'Done', type: 'done', contentSelector: '#po-step-finish' }
        ],
        onStepChange: async (from, to) => {
            const step = poWizard.steps[to];
            const fromStep = poWizard.steps[from];

            // 进入Step2(模式选择)时，重置模式
            if (step.id === 'mode-select' && fromStep?.id === 'basic') {
                // 可选：重置模式选择状态
            }

            // 进入Step3(策略)时，同步Step1选择的数据
            if (step.id === 'params') {
                syncStep1ToStep3();
                loadSupplierStrategy();
            }

            // 验证策略
            if (step.id === 'verify-params') {
                renderVerifyParamsStep();
            }

            // 进入录入商品步骤
            if (step.id === 'items') {
                initStep5Items();
            }

            // 验证商品
            if (step.id === 'verify-items') {
                await runItemsValidation();
            }

            // 预览
            if (step.id === 'preview') {
                renderPreview();
            }
        },
        onRestart: () => resetForm()
    });
    bindWizardButtons();
}


function initStep4() {
    // 更新货币显示
    document.getElementById('currency-badge').textContent = poFormData.currency || 'RMB';

    // 如果使用原策略，跳过验证步骤流程3
    // 此处已由 onStepChange 处理
}

function bindWizardButtons() {
    const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);

    // Step1: 基本信息 -> Step2
    bind('btn-wizard-next-1', () => poWizard.next());

    // Step2: 模式选择
    bind('btn-wizard-back-mode', () => poWizard.back());
    bind('btn-wizard-next-mode', () => {
        if (poInputMode) {
            inputMethod = poInputMode; // 同步兼容变量
            poWizard.next();
        }
    });

    // Step3: 策略参数
    bind('btn-wizard-back-3', () => poWizard.back());
    bind('btn-wizard-next-3', () => poWizard.next());

    // Step4: 验证策略
    bind('btn-wizard-back-4', () => poWizard.back());
    bind('btn-wizard-next-4', () => {
        if (paramsValidated) poWizard.next();
    });

    // Step5: 录入商品
    bind('btn-wizard-back-5', () => poWizard.back());
    bind('btn-wizard-next-5', () => {
        // 无论Excel还是手动模式，都从可编辑表格收集数据
        const items = collectItems();
        if (items.length > 0) {
            itemsData = items;
            poWizard.next();
        }
    });


    // Step6: 验证商品
    bind('btn-wizard-back-6', () => poWizard.back());
    bind('btn-wizard-next-6', () => {
        if (itemsValidated) poWizard.next();
    });

    // Step7: 预览
    bind('btn-wizard-back-7', () => poWizard.back());
    bind('btn-wizard-submit', submitPO);

    // Step8: 完成
    bind('btn-wizard-restart', () => poWizard.restart());
}


// ============================================================
// 流程5: 验证商品
// ============================================================
async function runItemsValidation() {
    const card = document.getElementById('items-validation-card');
    const icon = document.getElementById('items-validation-icon');
    const title = document.getElementById('items-validation-title');
    const nextBtn = document.getElementById('btn-wizard-next-6');
    const errorsContainer = document.getElementById('items-errors-container');
    const errorsList = document.getElementById('items-errors-list');
    const summary = document.getElementById('items-summary-content');
    const methodBadge = document.getElementById('items-input-method-badge');
    const previewTbody = document.getElementById('items-preview-tbody');

    // 初始化UI状态
    card.className = 'card mb-4 state-loading';
    icon.className = 'fa-solid fa-spinner fa-spin me-2 text-warning';
    title.textContent = '正在验证...';
    title.className = 'text-warning';
    nextBtn.disabled = true;
    errorsContainer.style.display = 'none';
    errorsList.innerHTML = '';
    previewTbody.innerHTML = '';
    itemsValidated = false;

    // 隐藏合并容器
    const mergeContainer = document.getElementById('items-merge-container');
    if (mergeContainer) mergeContainer.style.display = 'none';

    // 显示录入方式
    methodBadge.textContent = poInputMode === 'excel' ? 'Excel导入' : '手动录入';

    let validationErrors = [];
    let displayItems = [];

    // itemsData已在Step5的next按钮点击时由collectItems()收集
    // 这里直接使用itemsData进行验证和显示
    if (!itemsData || itemsData.length === 0) {
        card.className = 'card mb-4 state-error';
        icon.className = 'fa-solid fa-circle-xmark me-2 text-danger';
        title.textContent = '验证失败';
        title.className = 'text-danger';
        summary.innerHTML = '<p class="text-danger">没有商品数据，请返回上一步添加商品</p>';
        nextBtn.disabled = true;
        return;
    }

    // 将itemsData转换为displayItems格式
    displayItems = itemsData.map((item, idx) => ({
        row: idx + 1,
        sku: item.sku,
        qty: item.qty,
        unit_price: item.unit_price,
        errors: []
    }));

    // 这里可以添加额外的服务端验证（如SKU是否存在等）
    // 目前简化为直接使用客户端数据
    validationErrors = [];



    // =============================================
    // SKU去重合并：相同SKU + 相同单价 => 合并数量
    // =============================================
    let skuMergedCount = 0;  // 合并的重复记录数量
    let skuOriginalCount = 0; // 合并前的原始数量
    let mergeDetails = [];    // 合并详情记录

    if (itemsData.length > 0) {
        // key: "SKU|unit_price" => {sku, qty, unit_price, rows: [{row, qty}]}
        const mergeMap = new Map();

        itemsData.forEach((item, idx) => {
            const key = `${item.sku}|${item.unit_price}`;
            const rowNum = displayItems[idx]?.row || (idx + 1);

            if (mergeMap.has(key)) {
                // 合并：数量相加，记录行号
                const existing = mergeMap.get(key);
                existing.rows.push({ row: rowNum, qty: item.qty });
                existing.qty += item.qty;
                skuMergedCount++;
            } else {
                mergeMap.set(key, {
                    sku: item.sku,
                    qty: item.qty,
                    unit_price: item.unit_price,
                    rows: [{ row: rowNum, qty: item.qty }]
                });
            }
        });

        // 转换回数组并收集合并详情
        skuOriginalCount = itemsData.length;
        itemsData = [];

        mergeMap.forEach((value) => {
            itemsData.push({
                sku: value.sku,
                qty: value.qty,
                unit_price: value.unit_price
            });

            // 如果有多行被合并，记录详情
            if (value.rows.length > 1) {
                mergeDetails.push({
                    sku: value.sku,
                    unit_price: value.unit_price,
                    rows: value.rows,
                    totalQty: value.qty
                });
            }
        });

        // 如果有合并，更新displayItems用于预览
        if (skuMergedCount > 0) {
            // 重建displayItems用于预览（显示合并后的结果）
            displayItems = itemsData.map((item, idx) => ({
                row: idx + 1,
                sku: item.sku,
                qty: item.qty,
                unit_price: item.unit_price,
                errors: []
            }));
            validationErrors = []; // 去重后无错误
        }
    }

    // 渲染预览表格
    renderItemsPreviewTable(displayItems, validationErrors);

    // 计算总金额
    let total = 0;
    itemsData.forEach(item => {
        total += (item.qty || 0) * (item.unit_price || 0);
    });

    // 更新摘要
    const validCount = itemsData.length;
    const invalidCount = validationErrors.length;

    if (validationErrors.length > 0) {
        card.className = 'card mb-4 state-error';
        icon.className = 'fa-solid fa-circle-xmark me-2 text-danger';
        title.textContent = '验证失败';
        title.className = 'text-danger';
        summary.innerHTML = `<p class="mb-0">共 <span class="text-info fw-bold">${displayItems.length}</span> 行数据，<span class="text-success">${validCount}</span> 行有效，<span class="text-danger fw-bold">${invalidCount}</span> 行有错误</p>`;

        // 显示错误明细
        errorsList.innerHTML = validationErrors.map(item => {
            const errMsgs = (item.errors || []).map(e => `${e.column}: ${e.message}`).join('; ');
            return `<li>第 <strong class="text-danger">${item.row}</strong> 行 [${item.sku || '-'}]: ${errMsgs}</li>`;
        }).join('');
        errorsContainer.style.display = 'block';

        nextBtn.disabled = true;
        itemsValidated = false;
    } else if (validCount === 0) {
        card.className = 'card mb-4 state-error';
        icon.className = 'fa-solid fa-circle-xmark me-2 text-danger';
        title.textContent = '无有效数据';
        title.className = 'text-danger';
        summary.innerHTML = '<p class="text-danger mb-0">未找到有效的商品数据，请返回上一步补充</p>';
        nextBtn.disabled = true;
        itemsValidated = false;
    } else {
        card.className = 'card mb-4 state-success';
        icon.className = 'fa-solid fa-circle-check me-2 text-success';
        title.textContent = '验证通过';
        title.className = 'text-success';

        // 构建摘要信息
        let summaryHtml = `<p class="mb-0">共 <span class="text-info fw-bold">${validCount}</span> 件商品，总金额 <span class="text-info fw-bold">${poFormData.currency} ${total.toFixed(2)}</span>`;

        // 如果有SKU合并，显示合并信息
        if (skuMergedCount > 0) {
            summaryHtml += `<br><small class="text-warning"><i class="fas fa-compress-alt me-1"></i>已自动合并 ${skuMergedCount} 条相同SKU+单价的记录 (${skuOriginalCount} → ${validCount})</small>`;
        }
        summaryHtml += '</p>';
        summary.innerHTML = summaryHtml;

        // 如果有合并详情，显示在合并信息容器
        const mergeContainer = document.getElementById('items-merge-container');
        const mergeList = document.getElementById('items-merge-list');

        if (mergeDetails.length > 0 && mergeContainer && mergeList) {
            let mergeHtml = mergeDetails.map(detail => {
                const rowsList = detail.rows.map(r => `第${r.row}行(${r.qty}件)`).join(' + ');
                return `<li class="mb-2">
                    <strong class="text-warning">${detail.sku}</strong> 
                    <span class="text-white-50">(单价 ${poFormData.currency} ${detail.unit_price})</span>
                    <br><small class="ps-3">
                        <i class="fas fa-arrow-right me-1 text-warning"></i>
                        ${rowsList} → 合并后 <strong class="text-success">${detail.totalQty}</strong> 件
                    </small>
                </li>`;
            }).join('');

            mergeList.innerHTML = mergeHtml;
            mergeContainer.style.display = 'block';
        } else if (mergeContainer) {
            mergeContainer.style.display = 'none';
        }

        // 隐藏错误容器
        errorsContainer.style.display = 'none';

        nextBtn.disabled = false;
        itemsValidated = true;
    }
}

function renderItemsPreviewTable(items, errorItems) {
    const tbody = document.getElementById('items-preview-tbody');
    const totalEl = document.getElementById('items-preview-total');
    const currency = poFormData.currency || 'RMB';

    // 构建错误行索引 - 兼容新旧两种数据格式
    const errorRowSet = new Set(errorItems.map(e => e.row));
    const errorMap = new Map();

    // 旧格式：errors 数组
    errorItems.forEach(item => {
        if (item.errors) {
            const columnSet = new Set(item.errors.map(e => e.column));
            errorMap.set(item.row, columnSet);
        }
    });

    let total = 0;
    tbody.innerHTML = items.map((item, idx) => {
        const rowNum = item.row || (idx + 1);

        // 检查是否有错误 - 兼容新旧格式
        const hasError = errorRowSet.has(rowNum) || item.sku_error || item.qty_error || item.price_error;

        // 获取错误列 - 兼容新旧格式
        let rowErrorColumns = errorMap.get(rowNum) || new Set();
        if (item.sku_error) rowErrorColumns.add('SKU');
        if (item.qty_error) rowErrorColumns.add('数量');
        if (item.price_error) rowErrorColumns.add('单价');

        const qty = item.qty || 0;
        const price = item.unit_price || 0;
        const subtotal = qty * price;
        if (!hasError && qty > 0 && price > 0) total += subtotal;

        const rowClass = hasError ? 'row-error' : 'row-valid';
        const skuClass = rowErrorColumns.has('SKU') ? 'cell-error' : '';
        const qtyClass = rowErrorColumns.has('数量') ? 'cell-error' : '';
        const priceClass = rowErrorColumns.has('单价') ? 'cell-error' : '';

        // 显示SKU（优先显示原始值）
        const displaySku = item.sku_original || item.sku || '-';

        // 格式化数值显示
        const qtyDisplay = qty > 0 ? qty : (item.qty_error ? `<span class="text-danger">${item.qty_error}</span>` : '-');
        const priceDisplay = price > 0 ? `${currency} ${price.toFixed(2)}` : (item.price_error ? `<span class="text-danger">${item.price_error}</span>` : '-');
        const subtotalDisplay = (qty > 0 && price > 0) ? `${currency} ${subtotal.toFixed(2)}` : '-';

        return `<tr class="${rowClass}">
            <td class="text-muted">${rowNum}</td>
            <td class="${skuClass}">${displaySku}${item.sku_error ? ` <small class="text-danger">(${item.sku_error})</small>` : ''}</td>
            <td class="${qtyClass} text-end">${qtyDisplay}</td>
            <td class="${priceClass} text-end">${priceDisplay}</td>
            <td class="text-end ${(qty > 0 && price > 0) ? 'text-success' : 'text-muted'}">${subtotalDisplay}</td>
        </tr>`;
    }).join('');

    totalEl.textContent = `${currency} ${total.toFixed(2)}`;
}

function showStep5Error(title, message) {
    const card = document.getElementById('items-validation-card');
    const icon = document.getElementById('items-validation-icon');
    const titleEl = document.getElementById('items-validation-title');
    const summary = document.getElementById('items-summary-content');
    const nextBtn = document.getElementById('btn-wizard-next-5');

    card.className = 'card mb-4 state-error';
    icon.className = 'fa-solid fa-circle-xmark me-2 text-danger';
    titleEl.textContent = title;
    titleEl.className = 'text-danger';
    summary.innerHTML = `<p class="text-danger mb-0">${message}</p><p class="text-white-50 small mt-2">请返回上一步重新${inputMethod === 'upload' ? '上传文件' : '填写数据'}</p>`;
    nextBtn.disabled = true;
    itemsValidated = false;
}

// 在线修正界面
let correctionData = null;
let allSkusList = [];

function showItemsCorrectionUI(data) {
    correctionData = data;
    allSkusList = data.all_skus || [];

    const card = document.getElementById('items-validation-card');
    const icon = document.getElementById('items-validation-icon');
    const title = document.getElementById('items-validation-title');
    const summary = document.getElementById('items-summary-content');
    const nextBtn = document.getElementById('btn-wizard-next-5');
    const errorsContainer = document.getElementById('items-errors-container');
    const previewWrapper = document.getElementById('items-preview-wrapper');

    // 更新状态
    card.className = 'card mb-4 state-warning';
    icon.className = 'fa-solid fa-edit me-2 text-warning';
    title.textContent = '需要修正';
    title.className = 'text-warning';

    const skuErrorCount = (data.sku_errors || []).length;
    const dataErrorCount = (data.data_errors || []).length;
    summary.innerHTML = `
        <p class="mb-2">发现 <span class="text-danger fw-bold">${skuErrorCount + dataErrorCount}</span> 行数据需要修正</p>
        <p class="text-white-50 small mb-0">请在下方表格中直接修改错误数据，修正后点击"应用修正"按钮</p>
    `;

    // 隐藏错误容器
    errorsContainer.style.display = 'none';

    // 渲染修正表格
    renderCorrectionTable(data);

    // 显示应用修正按钮
    nextBtn.textContent = '应用修正';
    nextBtn.disabled = false;
    nextBtn.onclick = applyCorrectionAndValidate;
}

function renderCorrectionTable(data) {
    const tbody = document.getElementById('items-preview-tbody');
    const currency = poFormData.currency || 'RMB';
    const items = data.items || [];

    let html = '';
    items.forEach((item, idx) => {
        const hasSKUError = item.sku_error;
        const hasQtyError = item.qty_error;
        const hasPriceError = item.price_error;
        const hasError = hasSKUError || hasQtyError || hasPriceError;

        const rowClass = hasError ? 'row-error' : 'row-valid';

        // SKU单元格 - 如果有错误显示下拉选择
        let skuCell;
        if (hasSKUError) {
            const suggestions = data.sku_errors?.find(e => e.row === item.row)?.suggestions || [];
            const optionsHtml = suggestions.length > 0
                ? `<optgroup label="推荐匹配">${suggestions.map(s => `<option value="${s}" class="text-info">${s}</option>`).join('')}</optgroup>`
                : '';
            skuCell = `
                <td class="cell-error">
                    <div class="mb-1"><code class="text-danger">${item.sku_original || item.sku}</code> <small class="text-danger">(${item.sku_error})</small></div>
                    <select class="form-select form-select-sm bg-dark text-warning border-warning correction-sku" data-row="${item.row}">
                        <option value="">-- 选择正确SKU --</option>
                        ${optionsHtml}
                        <optgroup label="全部SKU (${allSkusList.length})">
                            ${allSkusList.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </optgroup>
                    </select>
                </td>`;
        } else {
            skuCell = `<td class="text-warning">${item.sku}</td>`;
        }

        // 数量单元格
        let qtyCell;
        if (hasQtyError) {
            qtyCell = `
                <td class="cell-error">
                    <input type="number" min="1" step="1" class="form-control form-control-sm bg-dark text-warning border-warning correction-qty" 
                           data-row="${item.row}" value="${item.qty || ''}" placeholder="${item.qty_error}">
                </td>`;
        } else {
            qtyCell = `<td class="text-end">${item.qty}</td>`;

        }

        // 单价单元格
        let priceCell;
        if (hasPriceError) {
            priceCell = `
                <td class="cell-error">
                    <input type="number" min="0.01" step="0.01" class="form-control form-control-sm bg-dark text-warning border-warning correction-price" 
                           data-row="${item.row}" value="${item.unit_price || ''}" placeholder="${item.price_error}">
                </td>`;
        } else {
            priceCell = `<td class="text-end">${currency} ${parseFloat(item.unit_price || 0).toFixed(2)}</td>`;
        }

        // 小计
        const subtotal = (item.qty || 0) * (item.unit_price || 0);
        const subtotalCell = !hasError ? `<td class="text-end text-success">${currency} ${subtotal.toFixed(2)}</td>` : `<td class="text-muted">-</td>`;

        html += `
            <tr class="${rowClass}" data-row="${item.row}">
                <td class="text-muted">${idx + 1}</td>
                ${skuCell}
                ${qtyCell}
                ${priceCell}
                ${subtotalCell}
            </tr>`;
    });

    tbody.innerHTML = html;
}

function applyCorrectionAndValidate() {
    if (!correctionData) return;

    const items = correctionData.items;
    let hasErrors = false;

    // 收集修正后的数据
    items.forEach(item => {
        // 检查SKU修正
        const skuSelect = document.querySelector(`.correction-sku[data-row="${item.row}"]`);
        if (skuSelect) {
            const newSku = skuSelect.value;
            if (newSku) {
                item.sku = newSku;
                item.sku_error = null;
            } else {
                hasErrors = true;
            }
        }

        // 检查数量修正
        const qtyInput = document.querySelector(`.correction-qty[data-row="${item.row}"]`);
        if (qtyInput) {
            const newQty = parseInt(qtyInput.value);
            if (newQty > 0) {
                item.qty = newQty;
                item.qty_error = null;
            } else {
                hasErrors = true;
            }
        }

        // 检查单价修正
        const priceInput = document.querySelector(`.correction-price[data-row="${item.row}"]`);
        if (priceInput) {
            const newPrice = parseFloat(priceInput.value);
            if (newPrice > 0) {
                item.unit_price = parseFloat(newPrice.toFixed(2));
                item.price_error = null;
            } else {
                hasErrors = true;
            }
        }
    });

    if (hasErrors) {
        GlobalModal?.showError?.({ message: i18n.t('validation.has_errors') }) || alert(i18n.t('validation.has_errors'));
        return;
    }

    // 验证通过，收集数据
    itemsData = items.map(item => ({
        sku: item.sku,
        qty: item.qty,
        unit_price: item.unit_price
    }));

    // 更新UI为成功状态
    const card = document.getElementById('items-validation-card');
    const icon = document.getElementById('items-validation-icon');
    const title = document.getElementById('items-validation-title');
    const summary = document.getElementById('items-summary-content');
    const nextBtn = document.getElementById('btn-wizard-next-5');

    let total = 0;
    itemsData.forEach(item => { total += item.qty * item.unit_price; });

    card.className = 'card mb-4 state-success';
    icon.className = 'fa-solid fa-circle-check me-2 text-success';
    title.textContent = '修正完成';
    title.className = 'text-success';
    summary.innerHTML = `<p class="mb-0">共 <span class="text-info fw-bold">${itemsData.length}</span> 件商品，总金额 <span class="text-info fw-bold">${poFormData.currency} ${total.toFixed(2)}</span></p>`;

    // 重新渲染预览表格
    renderItemsPreviewTable(items.map(item => ({
        row: item.row,
        sku: item.sku,
        qty: item.qty,
        unit_price: item.unit_price,
        errors: []
    })), []);

    // 恢复下一步按钮
    nextBtn.textContent = '下一步：预览订单';
    nextBtn.innerHTML = '<i class="fas fa-arrow-right me-2"></i> 下一步：预览订单';
    nextBtn.onclick = null;
    nextBtn.disabled = false;
    itemsValidated = true;
    correctionData = null;
}

// ============================================================
// 流程6: 预览 (苹果风UI)
// ============================================================
function renderPreview() {
    const paramsContainer = document.getElementById('preview-params-container');
    const itemsTbody = document.getElementById('preview-items-tbody');
    const currency = poFormData.currency || 'RMB';

    // 1. 合同参数信息 - 分4行布局
    const paramsConfig = [
        // 第一行：供应商代码、供应商名称、订单日期
        [
            { label: '供应商代码', value: poFormData.supplier_code, tooltip: '供应商唯一标识代码', highlight: true },
            { label: '供应商名称', value: poFormData.supplier_name, tooltip: '供应商公司名称' },
            { label: '订单日期', value: poFormData.po_date, tooltip: '采购订单创建日期' }
        ],
        // 第二行：结算货币、结算汇率
        [
            { label: '结算货币', value: poFormData.currency, tooltip: '订单结算使用的货币', highlight: true },
            { label: '结算汇率', value: poFormData.exchange_rate, tooltip: 'USD/RMB 买入汇率' }
        ],
        // 第三行：价格浮动、浮动阈值
        [
            { label: '价格浮动', value: poFormData.float_enabled ? '启用' : '禁用', tooltip: '是否跟随汇率浮动调整价格', highlight: poFormData.float_enabled },
            { label: '浮动阈值', value: poFormData.float_threshold + '%', tooltip: '触发价格调整的汇率变动阈值' }
        ],
        // 第四行：定金需求、定金比例
        [
            { label: '定金需求', value: poFormData.deposit_required ? '需要' : '不需要', tooltip: '是否需要预付定金', highlight: poFormData.deposit_required },
            { label: '定金比例', value: poFormData.deposit_percentage + '%', tooltip: '需预付的定金占订单总额百分比' }
        ]
    ];

    let paramsHtml = '';
    paramsConfig.forEach((row, rowIndex) => {
        const colClass = row.length === 3 ? 'col-md-4' : 'col-md-6';
        paramsHtml += `<div class="row g-3 ${rowIndex > 0 ? 'mt-1' : ''}">`;
        row.forEach(param => {
            const valueClass = param.highlight ? 'text-highlight' : '';
            paramsHtml += `
                <div class="${colClass}">
                    <div class="param-item" data-bs-toggle="tooltip" title="${param.tooltip}">
                        <div class="param-label">${param.label}</div>
                        <div class="param-value ${valueClass}">${param.value}</div>
                    </div>
                </div>
            `;
        });
        paramsHtml += `</div>`;
    });

    paramsContainer.innerHTML = paramsHtml;

    // 2. 商品明细
    let itemsHtml = '';
    let total = 0;

    itemsData.forEach((item, i) => {
        const qty = item.qty || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const subtotal = qty * unitPrice;
        total += subtotal;

        itemsHtml += `
            <tr>
                <td class="ps-4 text-white-50">${i + 1}</td>
                <td class="text-warning fw-medium">${item.sku}</td>
                <td class="text-end text-info">${qty}</td>

                <td class="text-end text-white-50">${currency} ${unitPrice.toFixed(2)}</td>
                <td class="text-end pe-4 text-success fw-bold">${currency} ${subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    itemsTbody.innerHTML = itemsHtml;

    // 3. 更新统计
    document.getElementById('preview-item-count').textContent = `${itemsData.length} 件商品`;
    document.getElementById('preview-total-amount').textContent = `${currency} ${total.toFixed(2)}`;

    // 4. 初始化tooltips
    disposeTooltips();
    initTooltips();

    // 5. 初始化厂商账单上传组件
    initInvoiceUploader();
}

// 厂商账单上传实例
let invoiceUploader = null;

function initInvoiceUploader() {
    const container = document.getElementById('invoice-upload-container');
    if (!container) return;

    // 如果已初始化，不重复创建
    if (invoiceUploader) {
        invoiceUploader.reset();
        return;
    }

    // 检查GlobalFileUpload是否可用
    if (typeof GlobalFileUpload === 'undefined') {
        container.innerHTML = `
            <div class="alert alert-warning mb-0">
                <small><i class="fas fa-exclamation-triangle me-1"></i>文件上传组件未加载</small>
            </div>
        `;
        return;
    }

    // 初始化上传组件
    invoiceUploader = new GlobalFileUpload({
        containerId: 'invoice-upload-container',
        inputName: 'invoice_file',
        title: (window.i18n?.isLoaded && window.i18n.t('js.upload_vendor_bill')) || 'Upload Vendor Order Bill',
        hint: '支持 PDF、图片、Excel 格式',
        accept: '.pdf,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.doc,.docx',
        maxSizeMB: 20,
        required: false,
        onFileSelect: (file) => {
        },
        onFileRemove: () => {
        }
    });
}

// 上传厂商账单文件
async function uploadInvoiceFile(poNum, supplierCode, file) {
    try {
        const formData = new FormData();
        formData.append('po_num', poNum);
        formData.append('supplier_code', supplierCode);
        formData.append('invoice_file', file);

        const response = await fetch('/dashboard/purchase/api/po_mgmt/upload_invoice/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrf()
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
        } else {
            console.error('[PO Wizard] Invoice upload failed:', result.message);
        }
    } catch (e) {
        console.error('[PO Wizard] Invoice upload error:', e);
    }
}

// ============================================================
// 流程6: 提交 (带密码验证)
// ============================================================
function submitPO() {
    // 使用 requestPasswordVerify 触发密码验证
    if (typeof requestPasswordVerify !== 'undefined') {
        requestPasswordVerify(
            'btn_po_create',
            function (passwords) {
                // 密码验证成功，执行提交
                executeSubmitPO(passwords);
            },
            document.getElementById('po-submit-form'),
            '提交采购订单',
            function () {
                // 密码验证取消或失败，直接跳转完成页（失败状态）
                poWizard.goToStep('finish');
                renderFinish(false, null, null, '密码验证未通过或已取消');
            }
        );
    } else {
        // 如果没有 requestPasswordVerify，直接提交（用于测试）
        executeSubmitPO({});
    }
}

async function executeSubmitPO(passwords) {
    const btn = document.getElementById('btn-wizard-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>提交中...';

    try {
        const payload = {
            ...poFormData,
            items: itemsData
        };
        // 将密码转换为 sec_code_xxx 格式（后端 verify_action_request 期望此格式）
        if (passwords) {
            for (const [slot, code] of Object.entries(passwords)) {
                payload[`sec_code_${slot}`] = code;
            }
        }

        const res = await fetch('/dashboard/purchase/api/po/submit/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        poWizard.goToStep('finish');

        if (data.success) {
            // 如果有上传的厂商账单文件，上传它
            const invoiceFile = invoiceUploader ? invoiceUploader.getFile() : null;
            if (invoiceFile && data.po_num) {
                uploadInvoiceFile(data.po_num, poFormData.supplier_code, invoiceFile);
            }

            renderFinish(true, {
                poNum: data.po_num,
                itemCount: data.item_count,
                strategySeq: data.strategy_seq,
                detailSeq: data.detail_seq
            });
        } else if (data.auth_failed) {
            // 密码验证失败
            renderFinish(false, { error: data.message || '密码验证失败' });
        } else {
            renderFinish(false, { error: data.message || '提交失败' });
        }
    } catch (e) {
        console.error('[PO Wizard] Submit error:', e);
        poWizard.goToStep('finish');
        renderFinish(false, { error: '网络错误' });
    }

    // 恢复按钮状态
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> 确认创建订单';
}

// ============================================================
// 流程7: 完成
// ============================================================
function renderFinish(success, data) {
    const header = document.getElementById('finish-status-header');
    const panel = document.getElementById('finish-info-panel');
    const card = document.getElementById('finish-status-card');

    // 清除之前的状态类
    card.classList.remove('border-danger', 'border-success', 'border-warning');

    if (success) {
        const { poNum, itemCount, strategySeq, detailSeq } = data;

        card.classList.add('border-success');
        header.innerHTML = `
            <div class="display-1 text-success mb-4"><i class="fa-solid fa-circle-check"></i></div>
            <h3 class="text-white mb-2">订单创建成功</h3>
            <p class="text-white-50">采购订单已成功写入系统</p>
        `;

        panel.innerHTML = `
            <div class="card bg-black bg-opacity-50 border-success">
                <div class="card-body">
                    <div class="row g-4 text-center">
                        <div class="col-3">
                            <div class="text-white-50 small mb-1">订单号</div>
                            <div class="text-primary fw-bold fs-5">${poNum}</div>
                        </div>
                        <div class="col-3">
                            <div class="text-white-50 small mb-1">策略版本</div>
                            <div class="text-info fw-bold fs-5">${strategySeq || 'V01'}</div>
                        </div>
                        <div class="col-3">
                            <div class="text-white-50 small mb-1">明细版本</div>
                            <div class="text-info fw-bold fs-5">${detailSeq || 'L01'}</div>
                        </div>
                        <div class="col-3">
                            <div class="text-white-50 small mb-1">商品数</div>
                            <div class="text-white fw-bold fs-5">${itemCount} 条</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        const { error } = data;
        card.classList.add('border-danger');
        header.innerHTML = `
            <div class="display-1 text-danger mb-4"><i class="fa-solid fa-circle-xmark"></i></div>
            <h3 class="text-white mb-2">操作失败</h3>
        `;
        panel.innerHTML = `
            <div class="card bg-black bg-opacity-50 border-danger">
                <div class="card-body text-center">
                    <div class="text-danger mb-3"><i class="fas fa-exclamation-triangle me-2"></i>${error || '未知错误'}</div>
                    <p class="text-white-50 mb-0 small">数据未写入数据库，请检查后重试</p>
                </div>
            </div>
        `;
    }
}

function resetForm() {
    // 重置Step1元素
    const dateStep1 = document.getElementById('id_po_date_step1');
    const supplierStep1 = document.getElementById('id_supplier_code_step1');
    if (dateStep1) dateStep1.value = '';
    if (supplierStep1) supplierStep1.value = '';
    document.getElementById('po-download-template-card')?.style && (document.getElementById('po-download-template-card').style.display = 'none');
    document.getElementById('btn-wizard-next-1')?.disabled && (document.getElementById('btn-wizard-next-1').disabled = true);

    // 重置Step2模式选择
    poInputMode = null;
    document.getElementById('po-mode-manual-card')?.classList.remove('selected');
    document.getElementById('po-mode-excel-card')?.classList.remove('selected');
    const manualRadio = document.getElementById('po-mode-manual');
    const excelRadio = document.getElementById('po-mode-excel');
    if (manualRadio) manualRadio.checked = false;
    if (excelRadio) excelRadio.checked = false;
    document.getElementById('po-excel-upload-section')?.style && (document.getElementById('po-excel-upload-section').style.display = 'none');
    document.getElementById('btn-wizard-next-mode')?.disabled && (document.getElementById('btn-wizard-next-mode').disabled = true);

    // 重置Step3元素
    document.getElementById('form-po-params')?.reset();
    const supplierEl = document.getElementById('id_supplier_code');
    if (supplierEl) supplierEl.value = '';
    document.getElementById('supplier-strategy-card')?.style && (document.getElementById('supplier-strategy-card').style.display = 'none');
    document.getElementById('strategy-choice-panel')?.style && (document.getElementById('strategy-choice-panel').style.display = 'none');
    document.getElementById('custom-strategy-panel')?.style && (document.getElementById('custom-strategy-panel').style.display = 'none');
    document.getElementById('btn-wizard-next-3')?.disabled && (document.getElementById('btn-wizard-next-3').disabled = true);

    // 重置Step5商品输入
    const tbody = document.getElementById('items-tbody');
    if (tbody) tbody.innerHTML = '';
    document.getElementById('upload-section')?.style && (document.getElementById('upload-section').style.display = 'none');
    document.getElementById('manual-section')?.style && (document.getElementById('manual-section').style.display = 'none');

    // 重置录入方式选择（兼容旧ID）
    const radioUpload = document.getElementById('method_upload');
    const radioManual = document.getElementById('method_manual');
    if (radioUpload) radioUpload.checked = false;
    if (radioManual) radioManual.checked = false;

    // 重置文件上传组件
    uploadedExcelFile = null;
    uploadedExcelItems = [];
    if (fileUploadInstance && typeof fileUploadInstance.reset === 'function') {
        fileUploadInstance.reset();
    }

    // 重置状态变量
    poFormData = {};
    itemsData = [];
    currentStrategy = null;
    useCustomStrategy = false;
    modifiedFields.clear();
    paramsValidated = false;
    itemsValidated = false;
    inputMethod = null;
    rowCounter = 0;
    exchangeRate = null;
    needExchangeRateInput = false;

    setDefaultDate();
}


// ============================================================
// 文件上传初始化
// ============================================================
function initFileUpload() {
    if (typeof GlobalFileUpload !== 'undefined') {
        fileUploadInstance = new GlobalFileUpload({
            containerId: 'po-file-upload-container',
            inputName: 'po_items_file',
            title: (window.i18n?.isLoaded && window.i18n.t('js.upload_product_excel')) || 'Upload Product Excel',
            accept: '.xlsx,.xls',
            maxSizeMB: 5,
            onFileSelect: (file) => {
                // 验证文件格式
                if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                    if (typeof GlobalModal !== 'undefined') {
                        GlobalModal.showError({
                            title: (window.i18n?.isLoaded && window.i18n.t('js.file_format_error')) || 'File Format Error',
                            content: '请上传 .xlsx 或 .xls 格式的Excel文件'
                        });
                    } else {
                        alert(i18n.t('validation.excel_format_required'));
                    }
                    uploadedExcelFile = null;
                    updateStep4NextButton();
                    return;
                }

                uploadedExcelFile = file;
                updateStep4NextButton();
            },
            onFileRemove: () => {
                uploadedExcelFile = null;
                updateStep4NextButton();
            }
        });
    }
}

// 页面加载后初始化文件上传
document.addEventListener('DOMContentLoaded', initFileUpload);

