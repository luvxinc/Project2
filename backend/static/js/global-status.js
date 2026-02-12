/**
 * 全局状态栏管理器 (Global Status Manager)
 * 
 * 功能：
 * 1. 统一管理系统状态显示
 * 2. 网络状态检测
 * 3. 服务器时间同步
 * 4. 语言切换按钮
 * 
 * 硬性规则：
 * - 仅在 base.html 渲染，不允许页面覆盖
 * - 状态来源由此管理器统一管理
 */

(function (window) {
    'use strict';

    const GlobalStatus = {
        statusElement: null,
        timeElement: null,
        networkElement: null,
        langElement: null,
        syncElement: null,

        // 状态值
        isOnline: navigator.onLine,
        isSyncing: false,
        hasApiError: false,
        serverTimeOffset: 0,

        /**
         * 初始化
         */
        init() {
            this.statusElement = document.getElementById('global-status-bar');
            if (!this.statusElement) {
                console.warn('[GlobalStatus] #global-status-bar not found');
                return;
            }

            this.timeElement = this.statusElement.querySelector('#status-time');
            this.networkElement = this.statusElement.querySelector('#status-network');
            this.langElement = this.statusElement.querySelector('#status-lang');
            this.syncElement = this.statusElement.querySelector('#status-sync');

            // 绑定网络状态监听
            window.addEventListener('online', () => this.setNetworkStatus(true));
            window.addEventListener('offline', () => this.setNetworkStatus(false));

            // 绑定语言切换
            if (this.langElement) {
                this.langElement.addEventListener('click', () => this.toggleLanguage());
            }

            // 启动时间更新
            this.startTimeUpdate();

            // 初始状态
            this.setNetworkStatus(navigator.onLine);
            this.updateLangDisplay();

            console.log('[GlobalStatus] Initialized');
        },

        /**
         * 设置网络状态
         */
        setNetworkStatus(online) {
            this.isOnline = online;
            if (this.networkElement) {
                const icon = this.networkElement.querySelector('i');
                const text = this.networkElement.querySelector('span');

                if (online) {
                    icon.className = 'fas fa-wifi status-online';
                    text.textContent = window.i18n?.t('status_bar.online') || '在线';
                    text.className = 'status-online';
                } else {
                    icon.className = 'fas fa-wifi-slash status-offline';
                    text.textContent = window.i18n?.t('status_bar.offline') || '离线';
                    text.className = 'status-offline';
                }
            }
        },

        /**
         * 设置同步状态
         */
        setSyncStatus(syncing) {
            this.isSyncing = syncing;
            if (this.syncElement) {
                if (syncing) {
                    this.syncElement.classList.remove('d-none');
                    this.syncElement.querySelector('span').textContent =
                        window.i18n?.t('status_bar.sync') || '同步中';
                } else {
                    this.syncElement.classList.add('d-none');
                }
            }
        },

        /**
         * 设置 API 错误状态
         */
        setApiError(hasError) {
            this.hasApiError = hasError;
            if (this.syncElement) {
                if (hasError) {
                    this.syncElement.classList.remove('d-none');
                    this.syncElement.classList.add('status-error');
                    this.syncElement.querySelector('span').textContent =
                        window.i18n?.t('status_bar.api_error') || '接口异常';
                } else {
                    this.syncElement.classList.add('d-none');
                    this.syncElement.classList.remove('status-error');
                }
            }
        },

        /**
         * 启动时间更新
         */
        startTimeUpdate() {
            const updateTime = () => {
                if (this.timeElement) {
                    const now = new Date(Date.now() + this.serverTimeOffset);
                    const locale = window.i18n?.getLocale() === 'en' ? 'en-US' : 'zh-CN';
                    this.timeElement.querySelector('span').textContent =
                        now.toLocaleString(locale, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                }
            };

            updateTime();
            setInterval(updateTime, 1000);
        },

        /**
         * 同步服务器时间
         */
        async syncServerTime() {
            try {
                const response = await fetch('/api/sys/user_env/');
                if (response.ok) {
                    const data = await response.json();
                    if (data.server_time) {
                        const serverTime = new Date(data.server_time).getTime();
                        this.serverTimeOffset = serverTime - Date.now();
                    }
                }
            } catch (e) {
                console.warn('[GlobalStatus] Failed to sync server time:', e);
            }
        },

        /**
         * 切换语言
         */
        toggleLanguage() {
            const currentLocale = window.i18n?.getLocale() || 'zh';
            const newLocale = currentLocale === 'zh' ? 'en' : 'zh';

            if (window.i18n) {
                window.i18n.setLocale(newLocale);
            }

            this.updateLangDisplay();
            
            // [Fix] 刷新页面以应用 Django 后端模板的翻译
            window.location.reload();
        },

        /**
         * 更新语言显示
         */
        updateLangDisplay() {
            if (this.langElement) {
                const currentLocale = window.i18n?.getLocale() || 'zh';
                // [UI Fix] Icon Button Only - Do not overwrite text
                // this.langElement.textContent = currentLocale === 'zh' ? '中文' : 'EN';
                this.langElement.setAttribute('title', currentLocale === 'zh' ? 'Switch to English' : '切换到中文');

                // Active state visual
                if (currentLocale === 'zh') {
                    this.langElement.classList.remove('active-en');
                } else {
                    this.langElement.classList.add('active-en');
                }
            }
        },

        /**
         * 显示权限变更提示
         */
        showPermissionChanged() {
            const toast = document.createElement('div');
            toast.className = 'toast align-items-center text-white bg-warning border-0 show';
            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-shield-alt me-2"></i>
                        ${window.i18n?.t('status_bar.perm_changed') || '您的权限已更新，请刷新页面'}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" 
                            onclick="window.location.reload()"></button>
                </div>
            `;

            const container = document.getElementById('toast-container');
            if (container) {
                container.appendChild(toast);
            }
        }
    };

    // 挂载到 window
    window.GlobalStatus = GlobalStatus;

    // DOM Ready 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => GlobalStatus.init());
    } else {
        GlobalStatus.init();
    }

    // 监听语言变化事件
    window.addEventListener('localeChanged', () => {
        GlobalStatus.updateLangDisplay();
        GlobalStatus.setNetworkStatus(GlobalStatus.isOnline);
    });

})(window);
