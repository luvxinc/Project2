'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

// ================================
// Types
// ================================

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  supplierCode: string;
  supplierName: string;
  category: string;
  currency: string;
  floatCurrency: boolean;
  floatThreshold: number;
  requireDeposit: boolean;
  depositRatio: number;
}

const INITIAL_FORM: FormData = {
  supplierCode: '',
  supplierName: '',
  category: 'E',
  currency: 'USD',
  floatCurrency: false,
  floatThreshold: 0,
  requireDeposit: false,
  depositRatio: 0,
};

// ================================
// Component — Single-page form
// Sections: Basic Info + Strategy
// Validation: inline (borders) + submit button disabled
// ================================

export default function AddSupplierModal({ isOpen, onClose, onSuccess }: AddSupplierModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [codeExists, setCodeExists] = useState<boolean | null>(null);
  const [codeCheckLoading, setCodeCheckLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Debounce timer ref for code check
  const codeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen) {
      setFormData(INITIAL_FORM);
      setCodeExists(null);
      setCodeCheckLoading(false);
      createSecurity.onCancel();
      setSuccess(false);
    }
  }, [isOpen]);

  // --- Inline code existence check (debounced 500ms) ---
  const checkCodeInline = useCallback((code: string) => {
    if (codeCheckTimer.current) {
      clearTimeout(codeCheckTimer.current);
      codeCheckTimer.current = null;
    }
    if (code.length !== 2) {
      setCodeExists(null);
      setCodeCheckLoading(false);
      return;
    }
    setCodeCheckLoading(true);
    codeCheckTimer.current = setTimeout(async () => {
      try {
        const res = await purchaseApi.checkCodeExists(code);
        setCodeExists(res.exists);
      } catch {
        setCodeExists(null);
      } finally {
        setCodeCheckLoading(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (codeCheckTimer.current) clearTimeout(codeCheckTimer.current);
    };
  }, []);

  // --- Field updater ---
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // --- Real-time validation → drives submit button ---
  const isValid = useMemo(() => {
    // Basic info
    if (!/^[A-Z]{2}$/.test(formData.supplierCode)) return false;
    if (codeExists === true) return false;
    if (!formData.supplierName.trim()) return false;
    // Strategy
    if (formData.floatCurrency && (formData.floatThreshold <= 0 || formData.floatThreshold > 10)) return false;
    if (formData.requireDeposit && formData.depositRatio <= 0) return false;
    return true;
  }, [formData, codeExists]);

  const canSubmit = isValid && !codeCheckLoading;

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.createSupplier({
        supplierCode: formData.supplierCode,
        supplierName: formData.supplierName,
        category: formData.category,
        currency: formData.currency,
        floatCurrency: formData.floatCurrency,
        floatThreshold: formData.floatCurrency ? formData.floatThreshold : undefined,
        requireDeposit: formData.requireDeposit,
        depositRatio: formData.requireDeposit ? formData.depositRatio : undefined,
        sec_code_l3: secCode,
      }),
    onSuccess: () => {
      createSecurity.onCancel();
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
    onError: (err: any) => {
      if (err?.statusCode === 409) {
        setCodeExists(true);
        createSecurity.onCancel();
      } else {
        createSecurity.setError(tCommon('securityCode.invalid'));
      }
    },
  });

  const createSecurity = useSecurityAction({
    actionKey: 'btn_add_supplier',
    level: 'L3',
    onExecute: (code) => createMutation.mutate(code),
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    createSecurity.trigger();
  };

  // --- Early return ---
  if (!isOpen) return null;

  // --- Success state ---
  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('add.success')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('add.success')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{formData.supplierCode} - {formData.supplierName}</p>
        </div>
      </ModalShell>
    );
  }

  // --- Input helpers ---
  const inputCls = "w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50";
  const selectCls = "w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors appearance-none";
  const baseStyle = { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text };

  // --- Code border color ---
  const codeBorderColor = (() => {
    if (codeExists === true) return colors.red;
    if (formData.supplierCode.length === 2 && codeExists === false) return colors.green;
    if (formData.supplierCode.length > 0 && !/^[A-Z]{2}$/.test(formData.supplierCode)) return colors.red;
    return colors.border;
  })();

  // --- Code suffix icon ---
  const codeSuffix = (() => {
    if (formData.supplierCode.length !== 2) return null;
    if (codeCheckLoading) {
      return <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />;
    }
    if (codeExists === false) {
      return <svg className="w-4 h-4" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
    }
    if (codeExists === true) {
      return <svg className="w-4 h-4" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
    }
    return null;
  })();

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('add.title')}
        footerRight={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {tCommon('cancel')}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? colors.blue : colors.textTertiary }}>
              {t('add.submit')}
            </button>
          </div>
        }
      >
        {/* ===== Section: Basic Info ===== */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            {t('add.pill.basic')}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Supplier Code */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.supplierCode')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.supplierCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                    updateField('supplierCode', cleaned);
                    setCodeExists(null);
                    checkCodeInline(cleaned);
                  }}
                  placeholder={t('add.placeholder.code')}
                  maxLength={2}
                  className={inputCls}
                  style={{ ...baseStyle, borderColor: codeBorderColor, paddingRight: '36px' }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">{codeSuffix}</div>
              </div>
              {codeExists === true && <p className="mt-1 text-xs" style={{ color: colors.red }}>{t('add.codeUnavailable')}</p>}
              {codeExists === false && <p className="mt-1 text-xs" style={{ color: colors.green }}>{t('add.codeAvailable')}</p>}
            </div>

            {/* Supplier Name */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.supplierName')}</label>
              <input
                type="text"
                value={formData.supplierName}
                onChange={(e) => updateField('supplierName', e.target.value)}
                placeholder={t('add.placeholder.name')}
                className={inputCls}
                style={{ ...baseStyle, borderColor: formData.supplierName.trim() ? colors.border : formData.supplierName !== '' ? colors.red : colors.border }}
              />
            </div>
          </div>
        </div>

        {/* ===== Section: Strategy ===== */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('add.pill.strategy')}
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Category */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.category')}</label>
              <select value={formData.category} onChange={e => updateField('category', e.target.value)} className={selectCls} style={baseStyle}>
                <option value="E">{t('category.E')}</option>
                <option value="A">{t('category.A')}</option>
              </select>
            </div>
            {/* Currency */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.currency')}</label>
              <select value={formData.currency} onChange={e => updateField('currency', e.target.value)} className={selectCls} style={baseStyle}>
                <option value="USD">USD</option>
                <option value="RMB">RMB</option>
              </select>
            </div>
          </div>

          {/* Float Currency toggle + threshold */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium" style={{ color: colors.text }}>{t('add.field.floatCurrency')}</label>
            <button type="button" onClick={() => { updateField('floatCurrency', !formData.floatCurrency); if (formData.floatCurrency) updateField('floatThreshold', 0); }}
              className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: formData.floatCurrency ? colors.green : colors.bgTertiary }}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: formData.floatCurrency ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
          {formData.floatCurrency && (
            <div className="mb-4 pl-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.floatThreshold')} (%)</label>
              <input type="number" value={formData.floatThreshold || ''} placeholder="1-10"
                onChange={e => updateField('floatThreshold', parseFloat(e.target.value) || 0)}
                className={inputCls}
                style={{ ...baseStyle, borderColor: formData.floatThreshold > 0 && formData.floatThreshold <= 10 ? colors.border : colors.red }} />
            </div>
          )}

          {/* Deposit toggle + ratio */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium" style={{ color: colors.text }}>{t('add.field.requireDeposit')}</label>
            <button type="button" onClick={() => { updateField('requireDeposit', !formData.requireDeposit); if (formData.requireDeposit) updateField('depositRatio', 0); }}
              className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: formData.requireDeposit ? colors.green : colors.bgTertiary }}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: formData.requireDeposit ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
          {formData.requireDeposit && (
            <div className="mb-4 pl-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('add.field.depositRatio')} (%)</label>
              <input type="number" value={formData.depositRatio || ''} placeholder=">0"
                onChange={e => updateField('depositRatio', parseFloat(e.target.value) || 0)}
                className={inputCls}
                style={{ ...baseStyle, borderColor: formData.depositRatio > 0 ? colors.border : colors.red }} />
            </div>
          )}
        </div>
      </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={createSecurity.isOpen}
        level={createSecurity.level}
        title={t('add.title')}
        description={t('add.securityDescription')}
        onConfirm={createSecurity.onConfirm}
        onCancel={createSecurity.onCancel}
        isLoading={createMutation.isPending}
        error={createSecurity.error}
      />
    </>
  );
}
