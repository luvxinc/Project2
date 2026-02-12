/**
 * 全局国际化管理器 (i18n Manager)
 * Version: 2.1.0 - 2026-01-16
 * 
 * 功能：
 * 1. 加载中英文翻译文件
 * 2. 提供翻译函数 t(key)
 * 3. 支持语言切换与 DOM 自动更新
 * 
 * 使用方式：
 * - 在 HTML 中：<span data-i18n="modal.btn.confirm">确定</span>
 * - 在 JS 中：i18n.t('modal.btn.confirm')
 * - 切换语言：i18n.setLocale('en')
 */

(function (window) {
    'use strict';

    console.log('[i18n] Loading v2.1.0');

    const I18N_STORAGE_KEY = 'eaglestar_locale';
    const DEFAULT_LOCALE = 'zh';
    const SUPPORTED_LOCALES = ['zh', 'en'];

    const I18nManager = {
        locale: DEFAULT_LOCALE,
        messages: {
            zh: null,
            en: null
        },
        isLoaded: false,

        /**
         * 初始化 - 加载翻译文件并应用保存的语言偏好
         */
        async init() {
            // 从 localStorage 恢复语言偏好
            const savedLocale = localStorage.getItem(I18N_STORAGE_KEY);
            if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale)) {
                this.locale = savedLocale;
            }

            // 并行加载两种语言的翻译
            try {
                const [zhData, enData] = await Promise.all([
                    this._loadJSON('/static/i18n/zh.json'),
                    this._loadJSON('/static/i18n/en.json')
                ]);
                this.messages.zh = zhData;
                this.messages.en = enData;
                this.isLoaded = true;

                // 应用翻译到 DOM
                this.updateDOM();

                // 触发 i18n 加载完成事件，供向导等组件更新
                window.dispatchEvent(new CustomEvent('i18nLoaded', { detail: { locale: this.locale } }));

                console.log(`[i18n] Initialized. Locale: ${this.locale}`);
            } catch (error) {
                console.error('[i18n] Failed to load translation files:', error);
            }
        },

        /**
         * 加载 JSON 文件
         */
        async _loadJSON(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return await response.json();
        },

        /**
         * 翻译函数 - 获取当前语言的文案
         * @param {string} key - 点分隔的键路径，如 'modal.btn.confirm'
         * @param {object} params - 可选的插值参数 {name: 'value'}
         * @returns {string}
         */
        t(key, params = {}) {
            if (!this.isLoaded) {
                // 返回 null 使得 || 后的默认值生效
                return null;
            }

            const messages = this.messages[this.locale];
            if (!messages) return null;

            // 解析点分隔路径
            const value = key.split('.').reduce((obj, k) => obj?.[k], messages);

            if (value === undefined) {
                // 返回 null 使得 || 后的默认值生效
                return null;
            }

            // 简单模板替换 {placeholder}
            let result = value;
            Object.keys(params).forEach(param => {
                result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
            });

            return result;
        },

        /**
         * 切换语言
         * @param {string} newLocale - 'zh' 或 'en'
         */
        setLocale(newLocale) {
            if (!SUPPORTED_LOCALES.includes(newLocale)) {
                console.error(`[i18n] Unsupported locale: ${newLocale}`);
                return;
            }

            this.locale = newLocale;
            localStorage.setItem(I18N_STORAGE_KEY, newLocale);

            // [Fix] 同步设置 Django 语言 Cookie，使后端模板渲染正确语言
            const djangoLang = newLocale === 'zh' ? 'zh-hans' : 'en';
            document.cookie = `django_language=${djangoLang}; path=/; max-age=31536000; SameSite=Lax`;

            // 更新 DOM
            this.updateDOM();

            // 更新 HTML lang 属性
            document.documentElement.lang = newLocale === 'zh' ? 'zh-CN' : 'en';

            // 触发自定义事件，供其他组件监听
            window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale: newLocale } }));

            console.log(`[i18n] Locale changed to: ${newLocale}`);
        },

        /**
         * 更新 DOM 中所有带 data-i18n 属性的元素
         */
        updateDOM() {
            const elements = document.querySelectorAll('[data-i18n]');
            elements.forEach(el => {
                const key = el.getAttribute('data-i18n');
                const translated = this.t(key);

                // 支持 placeholder 属性 (旧逻辑兼容)
                if (el.hasAttribute('placeholder') && !el.hasAttribute('data-i18n-placeholder')) {
                    el.placeholder = translated;
                } else {
                    el.textContent = translated;
                }
            });

            // 更新带 data-i18n-placeholder 的元素 (用于 placeholder 属性)
            const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
            placeholderElements.forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                el.placeholder = this.t(key);
            });

            // 更新带 data-i18n-title 的元素 (用于 title 属性)
            const titleElements = document.querySelectorAll('[data-i18n-title]');
            titleElements.forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                el.title = this.t(key);
            });
        },

        /**
         * 获取当前语言
         */
        getLocale() {
            return this.locale;
        },

        /**
         * 获取可用语言列表
         */
        getSupportedLocales() {
            return SUPPORTED_LOCALES;
        }
    };

    // 挂载到 window
    window.i18n = I18nManager;

    // DOM Ready 时自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => I18nManager.init());
    } else {
        I18nManager.init();
    }

})(window);
