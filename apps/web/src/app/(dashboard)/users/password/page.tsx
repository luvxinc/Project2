'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useModal } from '@/components/modal/GlobalModal';
import { api } from '@/lib/api';
import { invalidateSecurityActionCache } from '@/hooks/useSecurityAction';

/**
 * 安全等级定义 (L0-L4)
 */
const securityLevels = [
  { key: 'user', level: 'L0', levelKey: 'l0', color: '#007aff' },
  { key: 'query', level: 'L1', levelKey: 'l1', color: '#ff9f0a' },
  { key: 'modify', level: 'L2', levelKey: 'l2', color: '#ff9f0a' },
  { key: 'db', level: 'L3', levelKey: 'l3', color: '#ff3b30' },
  { key: 'system', level: 'L4', levelKey: 'l4', color: '#ff3b30' },
];

/**
 * Action 注册表结构 (只包含 key 和默认 tokens，名称从 i18n 获取)
 */
const actionRegistry = {
  modules: [
    {
      key: 'sales',
      submodules: [
        {
          key: 'transactions',
          actions: [
            { key: 'btn_commit_sku_fix', tokens: ['modify'] },
            { key: 'btn_run_transform', tokens: ['modify'] },
          ],
        },
        {
          key: 'reports',
          actions: [
            { key: 'btn_generate_report', tokens: ['query'] },
            { key: 'btn_download_report', tokens: [] },
            { key: 'btn_clear_reports', tokens: ['modify'] },
          ],
        },
        {
          key: 'visuals',
          actions: [
            { key: 'btn_unlock_visuals', tokens: ['user'] },
          ],
        },
      ],
    },
    {
      key: 'purchase',
      submodules: [
        {
          key: 'supplier',
          actions: [
            { key: 'btn_add_supplier', tokens: ['db'] },
            { key: 'btn_delete_supplier', tokens: ['db'] },
            { key: 'btn_modify_strategy', tokens: ['db'] },
          ],
        },
        {
          key: 'po_mgmt',
          actions: [
            { key: 'btn_submit_po', tokens: ['db'] },
            { key: 'btn_po_modify', tokens: ['db'] },
            { key: 'btn_delete_po', tokens: ['db'] },
            { key: 'btn_restore_po', tokens: ['modify'] },
          ],
        },
        {
          key: 'send_mgmt',
          actions: [
            { key: 'btn_submit_send', tokens: ['db'] },
            { key: 'btn_edit_send', tokens: ['db'] },
            { key: 'btn_delete_send', tokens: ['db'] },
          ],
        },
        {
          key: 'receive',
          actions: [
            { key: 'btn_receive_confirm', tokens: ['db'] },
            { key: 'btn_receive_mgmt_edit', tokens: ['db'] },
            { key: 'btn_receive_delete', tokens: ['db'] },
            { key: 'btn_receive_undelete', tokens: ['db'] },
          ],
        },
        {
          key: 'abnormal',
          actions: [
            { key: 'btn_abnormal_process', tokens: ['db'] },
            { key: 'btn_abnormal_delete', tokens: ['db'] },
          ],
        },
        {
          key: 'payment',
          actions: [
            { key: 'btn_add_payment', tokens: ['db'] },
            { key: 'btn_delete_payment', tokens: ['db'] },
          ],
        },
      ],
    },
    {
      key: 'finance',
      submodules: [
        {
          key: 'logistic',
          actions: [
            { key: 'logistic_payment_confirm', tokens: ['modify'] },
            { key: 'logistic_payment_delete', tokens: ['db'] },
            { key: 'logistic_payment_file_delete', tokens: ['modify'] },
            { key: 'logistic_payment_file_upload', tokens: [] },
          ],
        },
        {
          key: 'prepay',
          actions: [
            { key: 'btn_prepay_submit', tokens: ['modify'] },
            { key: 'btn_prepay_delete', tokens: ['db'] },
            { key: 'btn_prepay_undelete', tokens: ['modify'] },
            { key: 'btn_prepay_upload_file', tokens: [] },
            { key: 'btn_prepay_delete_file', tokens: ['modify'] },
          ],
        },
        {
          key: 'deposit',
          actions: [
            { key: 'deposit_payment_submit', tokens: ['modify'] },
            { key: 'deposit_payment_delete', tokens: ['db'] },
            { key: 'deposit_receipt_upload', tokens: [] },
            { key: 'deposit_receipt_delete', tokens: ['modify'] },
          ],
        },
        {
          key: 'po_payment',
          actions: [
            { key: 'po_payment_submit', tokens: ['modify'] },
            { key: 'po_payment_delete', tokens: ['db'] },
            { key: 'po_receipt_upload', tokens: [] },
            { key: 'po_receipt_delete', tokens: ['modify'] },
          ],
        },
      ],
    },
    {
      key: 'inventory',
      submodules: [
        {
          key: 'stocktake',
          actions: [
            { key: 'btn_sync_inventory', tokens: ['modify'] },
            { key: 'btn_update_single_inv', tokens: ['modify'] },
            { key: 'btn_drop_inv_col', tokens: ['db'] },
          ],
        },
      ],
    },
    {
      key: 'products',
      submodules: [
        {
          key: 'catalog',
          actions: [
            { key: 'btn_create_skus', tokens: ['db'] },
            { key: 'btn_update_cogs', tokens: ['modify'] },
            { key: 'btn_batch_update_cogs', tokens: ['db'] },
            { key: 'btn_delete_product', tokens: ['db'] },
          ],
        },
        {
          key: 'barcode',
          actions: [
            { key: 'btn_generate_barcode', tokens: ['db'] },
          ],
        },
      ],
    },
    {
      key: 'db_admin',
      submodules: [
        {
          key: 'backup',
          actions: [
            { key: 'btn_create_backup', tokens: ['db'] },
            { key: 'btn_restore_db', tokens: ['system'] },
            { key: 'btn_delete_backup', tokens: ['db'] },
          ],
        },
        {
          key: 'cleanup',
          actions: [
            { key: 'btn_clean_data', tokens: ['system'] },
          ],
        },
      ],
    },
    {
      key: 'user_admin',
      submodules: [
        {
          key: 'users',
          actions: [
            { key: 'btn_create_user', tokens: ['modify'] },
            { key: 'btn_update_user', tokens: ['modify'] },
            { key: 'btn_toggle_user_lock', tokens: ['modify'] },
            { key: 'btn_reset_pwd', tokens: ['db'] },
            { key: 'btn_update_perms', tokens: ['modify'] },
            { key: 'btn_delete_user', tokens: ['system'] },
          ],
        },
      ],
    },
    {
      key: 'log',
      submodules: [
        {
          key: 'dashboard',
          actions: [
            { key: 'btn_unlock_view', tokens: ['query'] },
            { key: 'btn_toggle_dev_mode', tokens: ['db'] },
            { key: 'btn_clear_dev_logs', tokens: ['system'] },
          ],
        },
      ],
    },
  ],
};

type ActionTokens = Record<string, string[]>;

/**
 * Apple iOS 风格开关 (小尺寸)
 */
function MiniSwitch({ 
  checked, 
  onChange, 
  color = '#34c759' 
}: { 
  checked: boolean; 
  onChange: () => void;
  color?: string;
}) {
  const { theme } = useTheme();
  const inactiveColor = theme === 'dark' ? '#39393d' : '#e9e9eb';
  
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 34,
        height: 20,
        padding: 2,
        borderRadius: 10,
        backgroundColor: checked ? color : inactiveColor,
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        position: 'relative',
      }}
    >
      <span 
        style={{
          display: 'block',
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s ease',
          transform: checked ? 'translateX(14px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

export default function PasswordPolicyPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showPassword, showSuccess, showError } = useModal();
  
  // State
  const [actionTokens, setActionTokens] = useState<ActionTokens>(() => {
    const initial: ActionTokens = {};
    actionRegistry.modules.forEach(mod => {
      mod.submodules.forEach(sub => {
        sub.actions.forEach(act => {
          initial[act.key] = [...act.tokens];
        });
      });
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const savedSnapshotRef = useRef<ActionTokens>({});

  // Load existing policies from backend on mount
  useEffect(() => {
    const loadPolicies = async () => {
      try {
        const policies = await api.get<Record<string, string[]>>('/auth/security-policies');
        if (policies && Object.keys(policies).length > 0) {
          setActionTokens(prev => {
            const merged = { ...prev };
            Object.entries(policies).forEach(([key, tokens]) => {
              if (key in merged) {
                merged[key] = tokens;
              }
            });
            savedSnapshotRef.current = { ...merged };
            return merged;
          });
        } else {
          // No saved policies yet — use defaults as snapshot
          savedSnapshotRef.current = { ...actionTokens };
        }
      } catch {
        // On error (e.g. 401), just use defaults
        savedSnapshotRef.current = { ...actionTokens };
      }
    };
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track changes
  const checkChanges = useCallback((current: ActionTokens) => {
    const saved = savedSnapshotRef.current;
    for (const key of Object.keys(current)) {
      const a = [...(current[key] || [])].sort();
      const b = [...(saved[key] || [])].sort();
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
        return true;
      }
    }
    return false;
  }, []);

  // 统计操作点数
  const totalActions = useMemo(() => {
    return actionRegistry.modules.reduce((sum, mod) => 
      sum + mod.submodules.reduce((s, sub) => s + sub.actions.length, 0), 0);
  }, []);

  // 切换 token
  const toggleToken = (actionKey: string, tokenType: string) => {
    setActionTokens(prev => {
      const current = prev[actionKey] || [];
      const newTokens = current.includes(tokenType)
        ? current.filter(tk => tk !== tokenType)
        : [...current, tokenType];
      const updated = { ...prev, [actionKey]: newTokens };
      setHasChanges(checkChanges(updated));
      return updated;
    });
  };

  // Save handler
  const handleSave = () => {
    showPassword({
      title: t('password.saveAll'),
      message: t('capabilities.notice.l3Required'),
      requiredCodes: ['l0', 'l4'],
      onPasswordSubmit: async (passwords) => {
        const codeL0 = passwords.l0;
        const codeL4 = passwords.l4;
        if (!codeL0 || !codeL4) {
          throw new Error(tc('securityCode.required'));
        }
        setSaving(true);
        try {
          await api.put('/auth/security-policies', {
            policies: actionTokens,
            sec_code_l0: codeL0,
            sec_code_l4: codeL4,
          });
        } finally {
          setSaving(false);
        }
        // Update saved snapshot + invalidate frontend security action cache
        savedSnapshotRef.current = { ...actionTokens };
        invalidateSecurityActionCache();
        setHasChanges(false);
        // Success feedback after modal auto-hides
        setTimeout(() => showSuccess({
          title: tc('success'),
          message: t('password.saveAll') + ' ✓',
          showCancel: false,
          confirmText: tc('ok'),
        }), 250);
      },
    });
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1100px] mx-auto text-center">
          <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
            {t('password.title')}
          </h1>
          <p style={{ color: colors.textSecondary }} className="text-[17px] leading-relaxed">
            {t('password.description')}
          </p>
        </div>
      </section>

      {/* Two Column Layout */}
      <section className="max-w-[1100px] mx-auto px-6 pb-16">
        <div className="flex gap-8">
          
          {/* LEFT: Policy Matrix */}
          <div className="flex-1 min-w-0">
            {/* Global Config Bar */}
            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-xl border p-4 mb-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <svg style={{ color: colors.blue }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <div>
                  <span style={{ color: colors.text }} className="text-[14px] font-medium">{t('password.globalConfig')}</span>
                  <div style={{ color: colors.textSecondary }} className="text-[12px]">
                    {t('password.totalActions', { count: totalActions })}
                  </div>
                </div>
              </div>
              
              {/* Level Badges */}
              <div className="flex gap-2">
                {securityLevels.map(lv => (
                  <span 
                    key={lv.key}
                    style={{ 
                      backgroundColor: `${lv.color}15`,
                      color: lv.color 
                    }}
                    className="px-2 py-1 rounded text-[11px] font-medium"
                  >
                    {lv.level} {t(`password.levels.labels.${lv.key}`)}
                  </span>
                ))}
              </div>
            </div>

            {/* Modules */}
            <div className="space-y-6">
              {actionRegistry.modules.map(mod => (
                <div key={mod.key}>
                  {/* Module Header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <svg style={{ color: colors.blue }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                    </svg>
                    <span style={{ color: colors.text }} className="text-[15px] font-semibold">
                      {t(`password.modules.${mod.key}`)}
                    </span>
                    <span style={{ color: colors.textTertiary }} className="text-[11px]">
                      ({mod.submodules.reduce((s, sub) => s + sub.actions.length, 0)})
                    </span>
                  </div>
                  
                  {/* Submodules */}
                  {mod.submodules.map(sub => (
                    <div 
                      key={sub.key}
                      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                      className="rounded-xl border mb-4 overflow-hidden"
                    >
                      {/* Submodule Header */}
                      <div 
                        style={{ borderColor: colors.border }}
                        className="px-4 py-2.5 border-b flex items-center gap-2"
                      >
                        <svg style={{ color: colors.textSecondary }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        <span style={{ color: colors.text }} className="text-[13px] font-medium">
                          {t(`password.submodules.${sub.key}`)}
                        </span>
                        <span style={{ color: colors.textTertiary }} className="text-[11px] ml-1">
                          {sub.actions.length}
                        </span>
                      </div>
                      
                      {/* Actions Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 650 }}>
                          <thead>
                            <tr style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                              <th 
                                style={{ color: colors.textTertiary, borderColor: colors.border }} 
                                className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wider border-b w-[25%]"
                              >
                                {t('password.action')}
                              </th>
                              <th 
                                style={{ color: colors.textTertiary, borderColor: colors.border }} 
                                className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wider border-b w-[30%]"
                              >
                                {t('password.desc')}
                              </th>
                              {securityLevels.map(lv => (
                                <th 
                                  key={lv.key}
                                  style={{ color: lv.color, borderColor: colors.border }} 
                                  className="text-center px-2 py-2 text-[11px] font-semibold border-b w-[9%]"
                                >
                                  {lv.level}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sub.actions.map((action, idx) => {
                              const tokens = actionTokens[action.key] || [];
                              return (
                                <tr 
                                  key={action.key}
                                  style={{ borderColor: colors.border }}
                                  className={idx < sub.actions.length - 1 ? 'border-b' : ''}
                                >
                                  <td className="px-4 py-3">
                                    <div style={{ color: colors.text }} className="text-[13px] font-medium mb-0.5">
                                      {t(`password.actions.${action.key}.name`)}
                                    </div>
                                    <div style={{ color: colors.textTertiary }} className="text-[10px] font-mono">
                                      {action.key}
                                    </div>
                                  </td>
                                  <td style={{ color: colors.textSecondary }} className="px-4 py-3 text-[12px]">
                                    {t(`password.actions.${action.key}.desc`)}
                                  </td>
                                  {securityLevels.map(lv => (
                                    <td key={lv.key} className="px-2 py-3 text-center">
                                      <div className="flex justify-center">
                                        <MiniSwitch
                                          checked={tokens.includes(lv.key)}
                                          onChange={() => toggleToken(action.key, lv.key)}
                                          color={lv.color}
                                        />
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

          </div>

          {/* RIGHT: Notice Sidebar */}
          <div className="w-[280px] flex-shrink-0">
            {/* 保存全部按钮 */}
            <button 
              onClick={handleSave}
              disabled={saving}
              style={{ 
                backgroundColor: saving ? colors.textTertiary : colors.blue,
                opacity: saving ? 0.6 : 1,
              }}
              className="w-full h-[44px] mb-4 hover:opacity-90 text-white text-[15px] font-medium rounded-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {saving ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {saving ? tc('saving') : t('password.saveAll')}
            </button>
            {hasChanges && (
              <div style={{ color: '#ff9f0a' }} className="text-[12px] text-center mb-3 font-medium">
                {t('password.unsavedChanges')}
              </div>
            )}
            
            <div 
              style={{ 
                backgroundColor: theme === 'dark' ? 'rgba(255, 159, 10, 0.08)' : 'rgba(255, 159, 10, 0.06)',
                borderColor: theme === 'dark' ? 'rgba(255, 159, 10, 0.2)' : 'rgba(255, 159, 10, 0.15)'
              }}
              className="rounded-xl border p-5 sticky top-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <svg style={{ color: '#ff9f0a' }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span style={{ color: '#ff9f0a' }} className="text-[14px] font-semibold">
                  {t('password.securityLevels')}
                </span>
              </div>
              
              <ul style={{ color: colors.textSecondary }} className="text-[13px] leading-relaxed space-y-3">
                {securityLevels.map(lv => (
                  <li key={lv.key}>
                    <span style={{ color: lv.color }} className="font-semibold">
                      {lv.level} ({t(`password.levels.titles.${lv.levelKey}`)}):
                    </span>
                    <br />
                    <span className="text-[12px]">{t(`password.levels.${lv.levelKey}`)}</span>
                  </li>
                ))}
              </ul>
              
              <hr style={{ borderColor: colors.border }} className="my-4" />
              
              <p style={{ color: colors.textTertiary }} className="text-[12px]">
                <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                {t('password.auditNote')}
              </p>
            </div>
          </div>
          
        </div>
      </section>
    </div>
  );
}
