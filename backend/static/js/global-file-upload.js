/**
 * GlobalFileUpload V1 - 全站公有文件上传组件
 * 
 * 功能：
 * - 单文件上传（V1最小集）
 * - 拖拽上传 + 点击选择
 * - 文件类型白名单
 * - 大小限制
 * - Apple风格UI
 * 
 * API:
 * new GlobalFileUpload({
 *   containerId: 'upload-container',   // 容器元素ID
 *   inputId: 'file-input',             // 原生input[type=file]的ID（可选，不传则自动创建）
 *   inputName: 'contract_file',        // input的name属性，用于表单提交
 *   title: '上传合同',                  // 标题
 *   accept: '.pdf,.doc,.docx',         // 允许的文件类型
 *   maxSizeMB: 10,                     // 最大文件大小（MB）
 *   required: false,                   // 是否必填
 *   disabled: false,                   // 是否禁用
 *   onFileSelect: (file) => {},        // 文件选择回调
 *   onFileRemove: () => {},            // 文件移除回调
 *   onError: (message) => {}           // 错误回调
 * })
 */

(function (window) {
    'use strict';

    class GlobalFileUpload {
        constructor(options = {}) {
            // 配置
            this.config = {
                containerId: options.containerId || null,
                inputId: options.inputId || null,
                inputName: options.inputName || 'file',
                title: options.title || (window.i18n?.t('file.upload_title') || 'Upload File'),
                accept: options.accept || '*',
                maxSizeMB: options.maxSizeMB || 50,
                required: options.required || false,
                disabled: options.disabled || false,
                onFileSelect: options.onFileSelect || null,
                onFileRemove: options.onFileRemove || null,
                onError: options.onError || null
            };

            // 状态
            this.selectedFile = null;
            this.container = null;
            this.dropzone = null;
            this.fileInput = null;
            this.errorEl = null;

            // 初始化
            this._init();
        }

        /**
         * 初始化组件
         */
        _init() {
            this.container = document.getElementById(this.config.containerId);
            if (!this.container) {
                console.error('[GlobalFileUpload] Container not found:', this.config.containerId);
                return;
            }

            this._render();
            this._bindEvents();

            if (this.config.disabled) {
                this.disable();
            }

            console.log('[GlobalFileUpload] Initialized:', this.config.containerId);
        }

        /**
         * 渲染组件
         */
        _render() {
            const acceptHint = this._formatAcceptHint();
            const maxSizeHint = `${window.i18n?.t('common.max') || 'Max'} ${this.config.maxSizeMB}MB`;

            const html = `
                <div class="gfu-dropzone" id="${this.config.containerId}-dropzone">
                    <!-- 隐藏的原生input -->
                    <input type="file" 
                           class="gfu-hidden-input" 
                           id="${this.config.containerId}-input"
                           name="${this.config.inputName}"
                           accept="${this.config.accept}">
                    
                    <!-- 空状态 -->
                    <div class="gfu-empty">
                        <div class="gfu-empty-icon">
                            <i class="fas fa-cloud-upload-alt"></i>
                        </div>
                        <div class="gfu-empty-title">${this.config.title}</div>
                        <div class="gfu-empty-hint">
                            ${window.i18n?.t('common.drag_file') || 'Drag file here, or'} <strong>${window.i18n?.t('common.click_select') || 'click to select'}</strong>
                        </div>
                        <div class="gfu-empty-hint">
                            ${acceptHint} · ${maxSizeHint}
                        </div>
                    </div>
                    
                    <!-- 已选择文件预览 -->
                    <div class="gfu-file-preview">
                        <div class="gfu-file-info">
                            <div class="gfu-file-icon">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <div class="gfu-file-details">
                                <div class="gfu-file-name" id="${this.config.containerId}-filename">-</div>
                                <div class="gfu-file-size" id="${this.config.containerId}-filesize">-</div>
                            </div>
                        </div>
                        <div class="gfu-file-actions">
                            <button type="button" class="gfu-btn-remove" id="${this.config.containerId}-remove">
                                <i class="fas fa-trash-alt me-1"></i>${window.i18n?.t('common.delete') || 'Remove'}
                            </button>
                            <button type="button" class="gfu-btn-replace" id="${this.config.containerId}-replace">
                                <i class="fas fa-sync-alt me-1"></i>${window.i18n?.t('common.replace') || 'Replace'}
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- 错误消息 -->
                <div class="gfu-error-msg" id="${this.config.containerId}-error"></div>
            `;

            this.container.innerHTML = html;

            // 缓存元素引用
            this.dropzone = document.getElementById(`${this.config.containerId}-dropzone`);
            this.fileInput = document.getElementById(`${this.config.containerId}-input`);
            this.errorEl = document.getElementById(`${this.config.containerId}-error`);
        }

        /**
         * 绑定事件
         */
        _bindEvents() {
            // 点击触发文件选择
            this.dropzone.addEventListener('click', (e) => {
                if (e.target.closest('.gfu-btn-remove') || e.target.closest('.gfu-btn-replace')) {
                    return; // 忽略按钮点击
                }
                this.fileInput.click();
            });

            // 文件选择变化
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this._handleFile(file);
                }
            });

            // 拖拽事件
            this.dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropzone.classList.add('dragover');
            });

            this.dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropzone.classList.remove('dragover');
            });

            this.dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropzone.classList.remove('dragover');

                const file = e.dataTransfer.files[0];
                if (file) {
                    this._handleFile(file);
                }
            });

            // 移除按钮
            document.getElementById(`${this.config.containerId}-remove`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile();
            });

            // 替换按钮
            document.getElementById(`${this.config.containerId}-replace`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.fileInput.click();
            });
        }

        /**
         * 处理文件
         */
        _handleFile(file) {
            this._clearError();

            // 验证文件类型
            if (!this._validateType(file)) {
                const acceptHint = this._formatAcceptHint();
                this._showError((window.i18n?.t('file.invalid_type') || 'Unsupported file type') + `, ${acceptHint}`);
                return;
            }

            // 验证文件大小
            if (!this._validateSize(file)) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                this._showError((window.i18n?.t('file.too_large') || 'File too large') + ` (${sizeMB}MB), ${window.i18n?.t('common.max') || 'max'} ${this.config.maxSizeMB}MB`);
                return;
            }

            // 设置文件
            this.selectedFile = file;
            this._updatePreview(file);
            this.dropzone.classList.add('has-file');

            // 同步到隐藏input（用于表单提交）
            const dt = new DataTransfer();
            dt.items.add(file);
            this.fileInput.files = dt.files;

            // 回调
            if (this.config.onFileSelect) {
                this.config.onFileSelect(file);
            }

            console.log('[GlobalFileUpload] File selected:', file.name, this._formatFileSize(file.size));
        }

        /**
         * 验证文件类型
         */
        _validateType(file) {
            if (this.config.accept === '*') return true;

            const acceptList = this.config.accept.split(',').map(s => s.trim().toLowerCase());
            const fileName = file.name.toLowerCase();
            const fileExt = '.' + fileName.split('.').pop();
            const mimeType = file.type.toLowerCase();

            for (const accept of acceptList) {
                // 扩展名匹配
                if (accept.startsWith('.') && fileName.endsWith(accept)) {
                    return true;
                }
                // MIME类型匹配
                if (accept.includes('/')) {
                    if (accept.endsWith('/*')) {
                        const prefix = accept.replace('/*', '');
                        if (mimeType.startsWith(prefix)) return true;
                    } else if (mimeType === accept) {
                        return true;
                    }
                }
            }

            return false;
        }

        /**
         * 验证文件大小
         */
        _validateSize(file) {
            const maxBytes = this.config.maxSizeMB * 1024 * 1024;
            return file.size <= maxBytes;
        }

        /**
         * 更新文件预览
         */
        _updatePreview(file) {
            const nameEl = document.getElementById(`${this.config.containerId}-filename`);
            const sizeEl = document.getElementById(`${this.config.containerId}-filesize`);

            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = this._formatFileSize(file.size);

            // 更新图标
            const iconEl = this.dropzone.querySelector('.gfu-file-icon i');
            if (iconEl) {
                iconEl.className = this._getFileIcon(file.name);
            }
        }

        /**
         * 获取文件图标
         */
        _getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const iconMap = {
                'pdf': 'fas fa-file-pdf',
                'doc': 'fas fa-file-word',
                'docx': 'fas fa-file-word',
                'xls': 'fas fa-file-excel',
                'xlsx': 'fas fa-file-excel',
                'ppt': 'fas fa-file-powerpoint',
                'pptx': 'fas fa-file-powerpoint',
                'jpg': 'fas fa-file-image',
                'jpeg': 'fas fa-file-image',
                'png': 'fas fa-file-image',
                'gif': 'fas fa-file-image',
                'zip': 'fas fa-file-archive',
                'rar': 'fas fa-file-archive',
                'txt': 'fas fa-file-alt'
            };
            return iconMap[ext] || 'fas fa-file';
        }

        /**
         * 格式化文件大小
         */
        _formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        /**
         * 格式化接受类型提示
         */
        _formatAcceptHint() {
            if (this.config.accept === '*') return window.i18n?.t('file.any_file') || 'Any file';

            const types = this.config.accept.split(',').map(s => {
                s = s.trim();
                if (s.startsWith('.')) return s.toUpperCase().replace('.', '');
                return s;
            });

            return `${window.i18n?.t('common.supports') || 'Supports'} ${types.join(', ')}`;
        }

        /**
         * 显示错误
         */
        _showError(message) {
            if (this.errorEl) {
                this.errorEl.textContent = message;
                this.errorEl.classList.add('visible');
            }
            this.dropzone.classList.add('has-error');

            if (this.config.onError) {
                this.config.onError(message);
            }
        }

        /**
         * 清除错误
         */
        _clearError() {
            if (this.errorEl) {
                this.errorEl.textContent = '';
                this.errorEl.classList.remove('visible');
            }
            this.dropzone.classList.remove('has-error');
        }

        // ========================================
        // 公开 API
        // ========================================

        /**
         * 移除已选择的文件
         */
        removeFile() {
            this.selectedFile = null;
            this.fileInput.value = '';
            this.dropzone.classList.remove('has-file');
            this._clearError();

            if (this.config.onFileRemove) {
                this.config.onFileRemove();
            }

            console.log('[GlobalFileUpload] File removed');
        }

        /**
         * 获取当前选择的文件
         */
        getFile() {
            return this.selectedFile;
        }

        /**
         * 获取原生input元素（用于表单提交）
         */
        getInput() {
            return this.fileInput;
        }

        /**
         * 禁用组件
         */
        disable() {
            this.dropzone.classList.add('disabled');
            this.fileInput.disabled = true;
        }

        /**
         * 启用组件
         */
        enable() {
            this.dropzone.classList.remove('disabled');
            this.fileInput.disabled = false;
        }

        /**
         * 重置组件
         */
        reset() {
            this.removeFile();
            this.enable();
        }

        /**
         * 验证（用于表单提交前）
         */
        validate() {
            if (this.config.required && !this.selectedFile) {
                this._showError(window.i18n?.t('file.select_first') || 'Please select a file');
                return false;
            }
            return true;
        }
    }

    // 导出到全局
    window.GlobalFileUpload = GlobalFileUpload;

})(window);
