/**
 * 统一安全验证适配层 (Security Verify Adapter)
 * P0-Compliant: No frontend mapping, Fail-closed, No alerts.
 */
(function (window) {
    'use strict';

    const API_URL = '/api/sys/security_requirements/';
    const CACHE = {};

    /**
     * 发起密码验证请求
     * @param {string} actionKey - 动作标识（程序用，不显示）
     * @param {function} onSuccess - 验证通过回调
     * @param {HTMLElement} contextEl - 上下文元素（用于回填密码）
     * @param {string} actionDisplayName - 动作显示名称（UI用，例如"新增供应商"）
     * @param {function} onCancel - 取消回调（可选）
     */
    window.requestPasswordVerify = async function (actionKey, onSuccess, contextEl, actionDisplayName, onCancel) {
        console.log(`[Security] Requesting verify for: ${actionKey}`);

        let requiredSlots = [];
        if (CACHE[actionKey]) {
            console.log(`[Security] Cache hit for ${actionKey}:`, CACHE[actionKey]);
            requiredSlots = CACHE[actionKey];
        } else {
            console.log(`[Security] Cache miss, fetching from API...`);
            try {
                const res = await fetch(`${API_URL}?action=${encodeURIComponent(actionKey)}`);
                console.log(`[Security] API response status:`, res.status);
                const data = await res.json();
                console.log(`[Security] API response data:`, data);

                if (res.status === 200 && data.status === 'ok') {
                    // P0-1: Frontend uses slots directly (l0, l4...)
                    requiredSlots = data.required_slots || [];
                    CACHE[actionKey] = requiredSlots;
                    console.log(`[Security] Cached required_slots:`, requiredSlots);
                } else {
                    console.error('[Security] Check failed:', data.message);
                    // P0-4: No alerts - 不显示后端返回的可能包含actionKey的message
                    showErrorNotice(window.i18n?.t('security.policy_failed') || 'Security policy check failed');
                    if (onCancel) onCancel();
                    return;
                }
            } catch (e) {
                console.error('[Security] Network error:', e);
                showErrorNotice(window.i18n?.t('security.connection_failed') || 'Cannot connect to security service');
                if (onCancel) onCancel();
                return;
            }
        }

        // 快速通道：无安全要求
        if (!requiredSlots || requiredSlots.length === 0) {
            console.log('[Security] No restrictions, passing through.');
            if (onSuccess) onSuccess({});
            return;
        }

        console.log(`[Security] Showing password modal for slots:`, requiredSlots);
        
        if (!window.GlobalModal) {
            console.error('[Security] GlobalModal not loaded!');
            if (onCancel) onCancel();
            return;
        }

        // 构建人话描述（禁止包含actionKey）
        const displayName = actionDisplayName || (window.i18n?.t('security.this_action') || 'this action');
        const descTemplate = window.i18n?.t('modal.password.desc') || 'This operation requires identity verification';
        const desc = actionDisplayName ? `${displayName} - ${descTemplate}` : descTemplate;

        GlobalModal.showPassword({
            requiredCodes: requiredSlots, // ['l0', 'l4']
            title: window.i18n?.t('security.verify_title') || 'Identity Verification',
            desc: desc,  // 人话描述，禁止暴露actionKey
            onCancel: onCancel,  // 取消回调
            onSubmit: async (passwords) => {
                console.log('[Security] Verified. Backfilling inputs...');

                let backfillCount = 0;

                // passwords: { l0: "...", l4: "..." }
                for (const [slot, code] of Object.entries(passwords)) {
                    // Try to find inputs by slot name (l0, l1...)
                    const selectors = [
                        `#verify-sec-code-${slot}`,
                        `input[name="sec_code_${slot}"]`,
                        `#id_sec_code_${slot}`
                    ];

                    let targetInput = null;

                    if (contextEl) {
                        const form = contextEl.closest('form') || contextEl.closest('.security-zone-wrapper');
                        if (form) {
                            for (const sel of selectors) {
                                targetInput = form.querySelector(sel);
                                if (targetInput) break;
                            }
                        }
                    }

                    if (!targetInput) {
                        for (const sel of selectors) {
                            targetInput = document.querySelector(sel);
                            if (targetInput) break;
                        }
                    }

                    if (targetInput) {
                        targetInput.value = code;
                        backfillCount++;
                    }
                }

                if (onSuccess) {
                    setTimeout(() => onSuccess(passwords), 50);
                }
            }
        });
    };

    function showErrorNotice(msg) {
        if (window.GlobalModal && window.GlobalModal.showError) {
            GlobalModal.showError({
                title: window.i18n?.t('security.restricted_title') || 'Action Restricted',
                message: msg
            });
        } else if (window.createAndShowToast) {
            createAndShowToast(msg, 'danger');
        } else {
            console.error('[Security] Error:', msg);
        }
    }

})(window);
