/**
 * GlobalFileViewer - 通用文件查看器组件
 * 用于订单管理、发货单管理、入库管理等模块的文件查看功能
 * 
 * 使用方式:
 * const viewer = new GlobalFileViewer({
 *     containerId: 'file-viewer-container',
 *     title: '账单文件查看',
 *     identifierLabel: '订单号',
 *     identifierValue: 'PO-001',
 *     files: [...],
 *     currentFile: 'file.pdf',
 *     getFileUrl: (filename) => `/api/serve?file=${filename}`,
 *     onUpload: () => uploadFile(),
 *     onBack: () => showListView(),
 *     // 删除功能配置
 *     deleteUrl: '/api/delete/',
 *     deletePayload: { po_num: 'PO-001' },
 *     onDeleteSuccess: () => showListView(),
 *     requireDeletePassword: true,
 *     deletePasswordActionKey: 'btn_delete_invoice'
 * });
 */
class GlobalFileViewer {
    constructor(options) {
        this.containerId = options.containerId;
        this.title = options.title || (window.i18n?.t('file.viewer_title') || 'File Viewer');
        this.identifierLabel = options.identifierLabel || (window.i18n?.t('file.identifier') || 'ID');
        this.identifierValue = options.identifierValue || '';
        this.extraInfo = options.extraInfo || ''; // 如入库日期
        this.files = options.files || [];
        this.currentFile = options.currentFile || (this.files[0]?.filename || '');
        this.getFileUrl = options.getFileUrl;
        this.onUpload = options.onUpload;
        this.onBack = options.onBack;
        this.currentZoom = 1.0;
        
        // 删除功能配置
        this.deleteUrl = options.deleteUrl || null;
        this.deletePayload = options.deletePayload || {};
        this.onDeleteSuccess = options.onDeleteSuccess || options.onBack;
        this.requireDeletePassword = options.requireDeletePassword || false;
        this.deletePasswordActionKey = options.deletePasswordActionKey || '';
        
        this.render();
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('[GlobalFileViewer] Container not found:', this.containerId);
            return;
        }
        
        // 生成版本选择器选项
        const versionOptions = this.files.map(f => {
            const verMatch = f.filename.match(/_Ver(\d+)/);
            const verNum = verMatch ? verMatch[1] : '01';
            const selected = f.filename === this.currentFile ? 'selected' : '';
            return `<option value="${f.filename}" data-year="${f.year || ''}" ${selected}>Ver${verNum} - ${f.filename}</option>`;
        }).join('');
        
        const file = this.files.find(f => f.filename === this.currentFile) || this.files[0];
        const fileUrl = this.getFileUrl(this.currentFile, file?.year);
        const ext = this.currentFile.split('.').pop().toLowerCase();
        
        const contentHtml = this._getContentHtml(this.currentFile, fileUrl, ext);
        const infoLine = this.extraInfo 
            ? `${this.identifierLabel}: ${this.identifierValue} | ${this.extraInfo}`
            : `${this.identifierLabel}: ${this.identifierValue}`;
        
        // 删除按钮（仅当配置了 deleteUrl 时显示）
        const deleteBtn = this.deleteUrl ? `
            <button class="btn btn-outline-danger btn-sm" id="${this.containerId}-delete-btn" data-bs-toggle="tooltip" title="删除当前文件">
                <i class="fas fa-trash"></i>
            </button>
        ` : '';
        
        container.innerHTML = `
            <div class="glass-card p-4 shadow-lg">
                <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary border-opacity-25">
                    <div>
                        <h5 class="text-white mb-1"><i class="fas fa-file-invoice me-2 text-info"></i>${this.title}</h5>
                        <p class="text-white-50 small mb-0">${infoLine}</p>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <!-- 版本选择器 -->
                        <div class="input-group input-group-sm" style="width: auto;">
                            <span class="input-group-text bg-dark border-secondary text-white-50">
                                <i class="fas fa-history me-1"></i>${window.i18n?.t('file.versions') || 'Versions'}
                            </span>
                            <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    id="${this.containerId}-version-select"
                                    style="min-width: 200px;">
                                ${versionOptions}
                            </select>
                        </div>
                        <div class="btn-group">
                            ${['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? `
                            <button class="btn btn-outline-secondary btn-sm" id="${this.containerId}-zoom-out" data-bs-toggle="tooltip" title="缩小">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="btn btn-outline-secondary btn-sm" id="${this.containerId}-zoom-reset" data-bs-toggle="tooltip" title="重置">
                                <i class="fas fa-sync"></i>
                            </button>
                            <button class="btn btn-outline-secondary btn-sm" id="${this.containerId}-zoom-in" data-bs-toggle="tooltip" title="放大">
                                <i class="fas fa-plus"></i>
                            </button>
                            ` : ''}
                            <a href="${fileUrl}" download class="btn btn-outline-info btn-sm" data-bs-toggle="tooltip" title="下载" id="${this.containerId}-download-btn">
                                <i class="fas fa-download"></i>
                            </a>
                            <button class="btn btn-outline-warning btn-sm" id="${this.containerId}-upload-btn" data-bs-toggle="tooltip" title="${window.i18n?.t('file.upload_new') || 'Upload New Version'}">
                                <i class="fas fa-upload me-1"></i>${window.i18n?.t('common.upload') || 'Upload'}
                            </button>
                            ${deleteBtn}
                            <button class="btn btn-outline-secondary btn-sm" id="${this.containerId}-back-btn" data-bs-toggle="tooltip" title="${window.i18n?.t('common.back') || 'Back'}">
                                <i class="fas fa-arrow-left me-1"></i>${window.i18n?.t('common.back') || 'Back'}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="file-content-wrapper" id="${this.containerId}-content" style="max-height: 70vh; overflow: auto; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem;">
                    ${contentHtml}
                </div>
            </div>
            
            <!-- [Fix 2026-01-03] 删除确认使用 GlobalModal 管理，已移除内置 modal -->
        `;
        
        this._bindEvents();
        
        // 初始化tooltips
        if (typeof bootstrap !== 'undefined') {
            const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
            tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
        }
    }
    
    _getContentHtml(filename, fileUrl, ext) {
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            return `<img id="${this.containerId}-image" src="${fileUrl}" alt="文件预览" style="max-width: 100%; height: auto; transition: transform 0.3s;">`;
        } else if (ext === 'pdf') {
            return `
                <embed src="${fileUrl}" type="application/pdf" style="width: 100%; height: 65vh;">
                <p class="text-white-50 mt-2 text-center small">
                    <i class="fas fa-info-circle me-1"></i>${window.i18n?.t('file.no_preview') || 'If unable to display,'}
                    <a href="${fileUrl}" target="_blank" class="text-info">${window.i18n?.t('file.open_new_window') || 'open in new window'}</a>
                    ${window.i18n?.t('file.or') || 'or'}
                    <a href="${fileUrl}" download class="text-info">${window.i18n?.t('file.download_file') || 'download file'}</a>
                </p>
            `;
        } else if (['heic', 'heif'].includes(ext)) {
            // HEIC/HEIF: 服务端自动转换为 JPEG，直接作为图片显示
            return `<img id="${this.containerId}-image" src="${fileUrl}" alt="文件预览" style="max-width: 100%; height: auto; transition: transform 0.3s;">`;
        } else {
            return `
                <div class="text-center py-5">
                    <i class="fas fa-file fa-5x text-info mb-4"></i>
                    <h5 class="text-white mb-3">${window.i18n?.t('file.file_label') || 'File'}: ${filename}</h5>
                    <p class="text-white-50 mb-4">${window.i18n?.t('file.no_online_preview') || 'This file type cannot be previewed online'}</p>
                    <a href="${fileUrl}" download class="btn btn-primary">
                        <i class="fas fa-download me-2"></i>${window.i18n?.t('file.download_file') || 'Download File'}
                    </a>
                </div>
            `;
        }
    }
    
    _bindEvents() {
        const container = document.getElementById(this.containerId);
        
        // 版本选择器
        const versionSelect = document.getElementById(`${this.containerId}-version-select`);
        if (versionSelect) {
            versionSelect.addEventListener('change', (e) => {
                const filename = e.target.value;
                const year = e.target.options[e.target.selectedIndex].dataset.year;
                this.switchVersion(filename, year);
            });
        }
        
        // 缩放按钮
        const zoomOut = document.getElementById(`${this.containerId}-zoom-out`);
        const zoomReset = document.getElementById(`${this.containerId}-zoom-reset`);
        const zoomIn = document.getElementById(`${this.containerId}-zoom-in`);
        if (zoomOut) zoomOut.addEventListener('click', () => this.zoom(0.8));
        if (zoomReset) zoomReset.addEventListener('click', () => this.zoom(1.0));
        if (zoomIn) zoomIn.addEventListener('click', () => this.zoom(1.2));
        
        // 上传按钮
        const uploadBtn = document.getElementById(`${this.containerId}-upload-btn`);
        if (uploadBtn && this.onUpload) {
            uploadBtn.addEventListener('click', () => this.onUpload());
        }
        
        // 返回按钮
        const backBtn = document.getElementById(`${this.containerId}-back-btn`);
        if (backBtn && this.onBack) {
            backBtn.addEventListener('click', () => this.onBack());
        }
        
        // 删除按钮
        const deleteBtn = document.getElementById(`${this.containerId}-delete-btn`);
        if (deleteBtn && this.deleteUrl) {
            deleteBtn.addEventListener('click', () => this._showDeleteConfirm());
        }
        
        // [Fix 2026-01-03] 删除确认按钮事件已移至 GlobalModal.showConfirm 回调，移除此处绑定
    }
    
    _showDeleteConfirm() {
        console.log('[GlobalFileViewer] _showDeleteConfirm called');
        console.log('[GlobalFileViewer] GlobalModal available:', typeof GlobalModal !== 'undefined');
        console.log('[GlobalFileViewer] GlobalModal.showConfirm available:', typeof GlobalModal !== 'undefined' && typeof GlobalModal.showConfirm === 'function');
        
        // [Fix 2026-01-03] 使用 GlobalModal.showConfirm 替代内置 modal
        if (typeof GlobalModal !== 'undefined' && GlobalModal.showConfirm) {
            console.log('[GlobalFileViewer] Using GlobalModal.showConfirm');
            GlobalModal.showConfirm({
                title: window.i18n?.t('file.confirm_delete') || 'Confirm Delete',
                message: `${window.i18n?.t('file.confirm_delete_msg')?.replace('{filename}', this.currentFile) || `Delete "${this.currentFile}"?`}<br><span class="text-white-50 small">${window.i18n?.t('modal.confirm_delete.message') || 'This action cannot be undone.'}</span>`,
                confirmLabel: window.i18n?.t('file.confirm_delete') || 'Confirm Delete',
                cancelLabel: window.i18n?.t('common.cancel') || 'Cancel',
                confirmClass: 'btn-danger',
                onConfirm: () => this._executeDelete(),
                onCancel: () => {}
            });
        } else {
            console.log('[GlobalFileViewer] Fallback to confirm()');
            // 兜底：使用 confirm 对话框
            if (confirm(i18n.t('confirm.delete_file', { filename: this.currentFile }))) {
                this._executeDelete();
            }
        }
    }
    
    _executeDelete() {
        console.log('[GlobalFileViewer] _executeDelete called');
        console.log('[GlobalFileViewer] requireDeletePassword:', this.requireDeletePassword);
        console.log('[GlobalFileViewer] deletePasswordActionKey:', this.deletePasswordActionKey);
        console.log('[GlobalFileViewer] requestPasswordVerify available:', typeof requestPasswordVerify === 'function');
        
        // 如果需要密码验证
        if (this.requireDeletePassword && typeof requestPasswordVerify === 'function') {
            console.log('[GlobalFileViewer] Calling requestPasswordVerify...');
            requestPasswordVerify(
                this.deletePasswordActionKey,
                (passwords) => this._doDelete(passwords),
                null,
                window.i18n?.t('common.delete') || 'Delete File',
                () => {}
            );
        } else {
            console.log('[GlobalFileViewer] Skipping password verification, calling _doDelete directly');
            this._doDelete({});
        }
    }
    
    _doDelete(passwords = {}) {
        const currentFile = this.files.find(f => f.filename === this.currentFile);
        const payload = {
            ...this.deletePayload,
            filename: this.currentFile,
            year: currentFile?.year || ''
        };
        
        // [Fix 2026-01-03] 添加密码参数到请求
        if (passwords && Object.keys(passwords).length > 0) {
            Object.entries(passwords).forEach(([slot, code]) => {
                payload[`sec_code_${slot}`] = code;
            });
        }
        
        fetch(this.deleteUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || ''
            },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                if (typeof createAndShowToast === 'function') {
                    createAndShowToast(data.message || (window.i18n?.t('file.delete_success') || 'File deleted successfully'), 'success');
                }
                // 成功回调
                if (this.onDeleteSuccess) {
                    this.onDeleteSuccess();
                }
            } else {
                if (typeof createAndShowToast === 'function') {
                    createAndShowToast(data.message || (window.i18n?.t('file.delete_failed') || 'Delete failed'), 'danger');
                }
            }
        })
        .catch(err => {
            if (typeof createAndShowToast === 'function') {
                createAndShowToast((window.i18n?.t('toast.network_error') || 'Network error') + ': ' + err, 'danger');
            }
        });
    }
    
    switchVersion(filename, year) {
        this.currentFile = filename;
        const file = this.files.find(f => f.filename === filename);
        const fileUrl = this.getFileUrl(filename, year || file?.year);
        const ext = filename.split('.').pop().toLowerCase();
        
        // 更新内容
        const contentWrapper = document.getElementById(`${this.containerId}-content`);
        if (contentWrapper) {
            contentWrapper.innerHTML = this._getContentHtml(filename, fileUrl, ext);
        }
        
        // 更新下载按钮
        const downloadBtn = document.getElementById(`${this.containerId}-download-btn`);
        if (downloadBtn) {
            downloadBtn.href = fileUrl;
        }
        
        // 重置缩放
        this.currentZoom = 1.0;
    }
    
    zoom(factor) {
        const img = document.getElementById(`${this.containerId}-image`);
        if (!img) return;
        
        if (factor === 1.0) {
            this.currentZoom = 1.0;
        } else if (factor > 1) {
            this.currentZoom = Math.min(this.currentZoom * factor, 3);
        } else {
            this.currentZoom = Math.max(this.currentZoom * factor, 0.3);
        }
        img.style.transform = `scale(${this.currentZoom})`;
        img.style.transformOrigin = 'top left';
    }
}

/**
 * GlobalFileUploadWizard - 通用文件上传向导组件
 * 
 * 使用方式:
 * const wizard = new GlobalFileUploadWizard({
 *     containerId: 'upload-wizard-container',
 *     title: '上传/替换账单文件',
 *     identifierLabel: '订单号',
 *     identifierValue: 'PO-001',
 *     extraInfo: '',
 *     acceptedTypes: '.pdf,.jpg,.jpeg,.png,.gif,.heic,.heif,.xls,.xlsx,.doc,.docx,.csv',
 *     maxSizeMB: 20,
 *     checkExistingUrl: '/api/check?id=xxx',
 *     uploadUrl: '/api/upload/',
 *     uploadPayload: { po_num: 'PO-001' },
 *     requirePassword: true,
 *     passwordActionKey: 'btn_po_upload_invoice',
 *     onSuccess: () => showListView(),
 *     onCancel: () => showListView()
 * });
 */
class GlobalFileUploadWizard {
    constructor(options) {
        this.containerId = options.containerId;
        this.title = options.title || (window.i18n?.t('file.upload_title') || 'Upload File');
        this.identifierLabel = options.identifierLabel || (window.i18n?.t('file.identifier') || 'ID');
        this.identifierValue = options.identifierValue || '';
        this.extraInfo = options.extraInfo || '';
        this.acceptedTypes = options.acceptedTypes || '.pdf,.jpg,.jpeg,.png,.gif,.heic,.heif,.xls,.xlsx,.doc,.docx,.csv';
        this.maxSizeMB = options.maxSizeMB || 20;
        this.checkExistingUrl = options.checkExistingUrl;
        this.uploadUrl = options.uploadUrl;
        this.uploadPayload = options.uploadPayload || {};
        this.requirePassword = options.requirePassword || false;
        this.passwordActionKey = options.passwordActionKey || '';
        this.onSuccess = options.onSuccess;
        this.onCancel = options.onCancel;
        
        this.selectedFile = null;
        this.wizard = null;
        this.uploader = null;
        
        this.render();
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('[GlobalFileUploadWizard] Container not found:', this.containerId);
            return;
        }
        
        const infoLine = this.extraInfo 
            ? `${this.identifierLabel}: ${this.identifierValue} | ${this.extraInfo}`
            : `${this.identifierLabel}: ${this.identifierValue}`;
        
        container.innerHTML = `
            <div class="glass-card p-4 shadow-lg" id="${this.containerId}-wizard">
                <div class="wizard-header d-flex flex-column mb-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-warning bg-opacity-25 rounded-circle me-3 d-flex align-items-center justify-content-center" style="width: 56px; height: 56px;">
                            <i class="fas fa-file-upload fa-2x text-warning"></i>
                        </div>
                        <div>
                            <h5 class="text-white mb-1">${this.title}</h5>
                            <p class="text-white-50 small mb-0">${infoLine}</p>
                        </div>
                    </div>
                    <hr class="border-secondary border-opacity-25 my-4 w-100">
                </div>
                <div class="wizard-stepbar-anchor" data-wizard-stepbar-anchor="1"></div>
                
                <!-- Step 1: 选择文件 -->
                <div id="${this.containerId}-step-1" class="wizard-step-content">
                    <div class="alert alert-info mb-4">
                        <div class="d-flex align-items-start">
                            <i class="fas fa-info-circle me-3 mt-1 text-info"></i>
                            <div>
                                <strong class="text-info">操作须知</strong>
                                <ul class="mb-0 mt-2 ps-3">
                                    <li>支持上传 PDF、图片（JPG/PNG/HEIC）、Excel、Word 等格式</li>
                                    <li>文件大小限制为 ${this.maxSizeMB}MB</li>
                                    <li>上传后将自动生成新版本号（Ver01, Ver02...）</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div id="${this.containerId}-dropzone"></div>
                    <div class="d-flex justify-content-end gap-3 mt-4">
                        <button class="btn btn-outline-secondary btn-lg px-4 rounded-pill" id="${this.containerId}-cancel-btn">
                            <i class="fas fa-times me-2"></i>${window.i18n?.t('common.cancel') || 'Cancel'}
                        </button>
                        <button class="btn btn-warning btn-lg px-4 rounded-pill" id="${this.containerId}-next-btn">
                            <i class="fas fa-arrow-right me-2"></i>${window.i18n?.t('common.next') || 'Next'}
                        </button>
                    </div>
                </div>
                
                <!-- Step 2: 确认上传 -->
                <div id="${this.containerId}-step-2" class="wizard-step-content" style="display: none;">
                    <div class="alert alert-warning mb-4">
                        <div class="d-flex align-items-start">
                            <i class="fas fa-exclamation-triangle me-3 mt-1 text-warning"></i>
                            <div>
                                <strong class="text-warning">操作须知</strong>
                                <ul class="mb-0 mt-2 ps-3">
                                    <li>请确认文件信息无误后点击「确认上传」</li>
                                    <li id="${this.containerId}-existing-warning" style="display: none;">已存在文件，上传后将生成新版本</li>
                                    ${this.requirePassword ? '<li>上传需要密码验证</li>' : ''}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="card bg-dark border-secondary mb-4">
                        <div class="card-header bg-warning bg-opacity-10 border-secondary">
                            <i class="fas fa-file me-2 text-warning"></i>
                            <span class="text-white">待上传文件</span>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-6"><span class="text-white-50">文件名:</span></div>
                                <div class="col-6"><span class="text-white" id="${this.containerId}-confirm-filename">-</span></div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-6"><span class="text-white-50">文件大小:</span></div>
                                <div class="col-6"><span class="text-white" id="${this.containerId}-confirm-size">-</span></div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-6"><span class="text-white-50">目标版本:</span></div>
                                <div class="col-6"><span class="text-success fw-bold" id="${this.containerId}-confirm-version">-</span></div>
                            </div>
                        </div>
                    </div>
                    <div class="d-flex justify-content-end gap-3 mt-4">
                        <button class="btn btn-outline-secondary btn-lg px-4 rounded-pill" id="${this.containerId}-back-btn">
                            <i class="fas fa-arrow-left me-2"></i>${window.i18n?.t('common.prev') || 'Previous'}
                        </button>
                        <button class="btn btn-success btn-lg px-4 rounded-pill" id="${this.containerId}-confirm-btn">
                            <i class="fas fa-upload me-2"></i>${window.i18n?.t('common.confirm_upload') || 'Confirm Upload'}
                        </button>
                    </div>
                </div>
                
                <!-- Step 3: 完成 -->
                <div id="${this.containerId}-step-3" class="wizard-step-content" style="display: none;">
                    <div class="text-center py-5" id="${this.containerId}-result">
                        <!-- 动态填充 -->
                    </div>
                </div>
            </div>
        `;
        
        this._initWizard();
        this._initUploader();
        this._bindEvents();
    }
    
    _initWizard() {
        if (typeof GlobalWizard !== 'undefined') {
            this.wizard = new GlobalWizard({
                containerId: `${this.containerId}-wizard`,
                steps: [
                    { id: 'select', label: window.i18n?.t('file.select_file') || 'Select File', contentSelector: `#${this.containerId}-step-1` },
                    { id: 'confirm', label: window.i18n?.t('file.confirm_file') || 'Confirm File', contentSelector: `#${this.containerId}-step-2` },
                    { id: 'done', label: window.i18n?.t('wizard.done') || 'Done', type: 'done', contentSelector: `#${this.containerId}-step-3` }
                ],
                onStepChange: (from, to) => {
                    for (let i = 1; i <= 3; i++) {
                        const step = document.getElementById(`${this.containerId}-step-${i}`);
                        if (step) step.style.display = i === to + 1 ? 'block' : 'none';
                    }
                }
            });
        }
    }
    
    _initUploader() {
        setTimeout(() => {
            if (typeof GlobalFileUpload !== 'undefined') {
                this.uploader = new GlobalFileUpload({
                    containerId: `${this.containerId}-dropzone`,
                    inputName: 'upload_file',
                    title: window.i18n?.t('file.upload_title') || 'Upload File',
                    accept: this.acceptedTypes,
                    maxSizeMB: this.maxSizeMB,
                    required: true,
                    onFileSelect: (file) => {
                        this.selectedFile = file;
                    }
                });
            }
        }, 100);
    }
    
    _bindEvents() {
        // 取消按钮
        const cancelBtn = document.getElementById(`${this.containerId}-cancel-btn`);
        if (cancelBtn && this.onCancel) {
            cancelBtn.addEventListener('click', () => this.onCancel());
        }
        
        // 下一步按钮
        const nextBtn = document.getElementById(`${this.containerId}-next-btn`);
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this._goToStep2());
        }
        
        // 上一步按钮
        const backBtn = document.getElementById(`${this.containerId}-back-btn`);
        if (backBtn) {
            backBtn.addEventListener('click', () => this._goToStep1());
        }
        
        // 确认按钮
        const confirmBtn = document.getElementById(`${this.containerId}-confirm-btn`);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this._confirmUpload());
        }
    }
    
    _goToStep1() {
        document.getElementById(`${this.containerId}-step-1`).style.display = 'block';
        document.getElementById(`${this.containerId}-step-2`).style.display = 'none';
        if (this.wizard) this.wizard.goToStep('select');
    }
    
    _goToStep2() {
        if (!this.selectedFile) {
            if (typeof createAndShowToast === 'function') {
                createAndShowToast(window.i18n?.t('file.select_first') || 'Please select a file first', 'warning');
            }
            return;
        }
        
        document.getElementById(`${this.containerId}-step-1`).style.display = 'none';
        document.getElementById(`${this.containerId}-step-2`).style.display = 'block';
        if (this.wizard) this.wizard.goToStep('confirm');
        
        // 填充确认信息
        document.getElementById(`${this.containerId}-confirm-filename`).textContent = this.selectedFile.name;
        document.getElementById(`${this.containerId}-confirm-size`).textContent = (this.selectedFile.size / 1024 / 1024).toFixed(2) + ' MB';
        
        // 检查是否已存在文件
        if (this.checkExistingUrl) {
            fetch(this.checkExistingUrl)
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.data.has_file) {
                        document.getElementById(`${this.containerId}-existing-warning`).style.display = 'list-item';
                        const files = data.data.files || [];
                        let maxVer = 0;
                        files.forEach(f => {
                            const match = f.filename.match(/_Ver(\d+)/);
                            if (match) maxVer = Math.max(maxVer, parseInt(match[1]));
                        });
                        document.getElementById(`${this.containerId}-confirm-version`).textContent = `Ver${String(maxVer + 1).padStart(2, '0')}`;
                    } else {
                        document.getElementById(`${this.containerId}-confirm-version`).textContent = 'Ver01';
                    }
                })
                .catch(() => {
                    document.getElementById(`${this.containerId}-confirm-version`).textContent = 'Ver01';
                });
        } else {
            document.getElementById(`${this.containerId}-confirm-version`).textContent = 'Ver01';
        }
    }
    
    _confirmUpload() {
        if (this.requirePassword && typeof requestPasswordVerify === 'function') {
            requestPasswordVerify(
                this.passwordActionKey,
                (passwords) => this._executeUpload(passwords),  // 接收密码
                null,
                this.title,
                () => {}
            );
        } else {
            this._executeUpload({});
        }
    }
    
    _executeUpload(passwords = {}) {
        if (!this.selectedFile) return;
        
        const formData = new FormData();
        
        // 添加配置的payload
        for (const [key, value] of Object.entries(this.uploadPayload)) {
            formData.append(key, value);
        }
        
        // 添加密码（sec_code_user 等）
        if (passwords) {
            for (const [slot, code] of Object.entries(passwords)) {
                formData.append(`sec_code_${slot}`, code);
            }
        }
        
        // 添加文件
        formData.append('file', this.selectedFile);
        
        fetch(this.uploadUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || ''
            },
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            document.getElementById(`${this.containerId}-step-2`).style.display = 'none';
            document.getElementById(`${this.containerId}-step-3`).style.display = 'block';
            if (this.wizard) this.wizard.goToStep('done');
            
            const resultContainer = document.getElementById(`${this.containerId}-result`);
            if (data.success) {
                // 上传成功：立即调用 onSuccess 刷新数据
                if (this.onSuccess) {
                    this.onSuccess();
                }
                
                resultContainer.innerHTML = `
                    <div class="bg-success bg-opacity-25 rounded-circle d-inline-flex p-4 mb-4">
                        <i class="fas fa-check-circle fa-4x text-success"></i>
                    </div>
                    <h4 class="text-white mb-2">${window.i18n?.t('toast.upload_success') || 'Upload Successful'}</h4>
                    <p class="text-white-50 mb-4">${window.i18n?.t('file.saved_as') || 'File saved as'} ${data.filename || (window.i18n?.t('file.new_file') || 'new file')}</p>
                    <button class="btn btn-outline-secondary btn-lg px-4 rounded-pill" id="${this.containerId}-done-btn">
                        <i class="fas fa-arrow-left me-2"></i>${window.i18n?.t('common.back_to_list') || 'Back to List'}
                    </button>
                `;
            } else {
                resultContainer.innerHTML = `
                    <div class="bg-danger bg-opacity-25 rounded-circle d-inline-flex p-4 mb-4">
                        <i class="fas fa-times-circle fa-4x text-danger"></i>
                    </div>
                    <h4 class="text-white mb-2">${window.i18n?.t('toast.upload_failed') || 'Upload Failed'}</h4>
                    <p class="text-danger mb-4">${data.error || data.message || (window.i18n?.t('error.unknown') || 'Unknown error')}</p>
                    <button class="btn btn-outline-secondary btn-lg px-4 rounded-pill" id="${this.containerId}-done-btn">
                        <i class="fas fa-arrow-left me-2"></i>${window.i18n?.t('common.back_to_list') || 'Back to List'}
                    </button>
                `;
            }
            
            // 绑定完成按钮 - 调用 onCancel 关闭界面
            const doneBtn = document.getElementById(`${this.containerId}-done-btn`);
            if (doneBtn && this.onCancel) {
                doneBtn.addEventListener('click', () => this.onCancel());
            }
        })
        .catch(err => {
            document.getElementById(`${this.containerId}-step-2`).style.display = 'none';
            document.getElementById(`${this.containerId}-step-3`).style.display = 'block';
            document.getElementById(`${this.containerId}-result`).innerHTML = `
                <div class="bg-danger bg-opacity-25 rounded-circle d-inline-flex p-4 mb-4">
                    <i class="fas fa-times-circle fa-4x text-danger"></i>
                </div>
                <h4 class="text-white mb-2">${window.i18n?.t('toast.upload_failed') || 'Upload Failed'}</h4>
                <p class="text-danger mb-4">${window.i18n?.t('toast.network_error') || 'Network error'}: ${err}</p>
                <button class="btn btn-outline-secondary btn-lg px-4 rounded-pill" id="${this.containerId}-done-btn">
                    <i class="fas fa-arrow-left me-2"></i>${window.i18n?.t('common.back_to_list') || 'Back to List'}
                </button>
            `;
            
            const doneBtn = document.getElementById(`${this.containerId}-done-btn`);
            if (doneBtn && this.onCancel) {
                doneBtn.addEventListener('click', () => this.onCancel());
            }
        });
    }
}

// 导出到全局
window.GlobalFileViewer = GlobalFileViewer;
window.GlobalFileUploadWizard = GlobalFileUploadWizard;
