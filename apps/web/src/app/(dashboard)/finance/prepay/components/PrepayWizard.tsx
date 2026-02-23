'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { financeApi, type SupplierBalance } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

interface Props {
  isOpen: boolean;
  supplier: SupplierBalance | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  tranDate: string;
  tranCurrUse: string;
  rateMode: 'auto' | 'manual';
  exchangeRate: string;
  amount: string;
  note: string;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * PrepayWizard — Single-page modal for prepayment deposits.
 * Replaces the old 4-step wizard with a flat form, matching Purchase module's Modal pattern.
 *
 * Validation: inline per-field + full validation on submit click.
 */
export default function PrepayWizard({ isOpen, supplier, onClose, onSuccess }: Props) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Form state
  const [form, setForm] = useState<FormData>({
    tranDate: getToday(),
    tranCurrUse: 'RMB',
    rateMode: 'manual',
    exchangeRate: '7.0000',
    amount: '',
    note: '',
  });

  // Validation errors (inline per-field)
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Success state
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        tranDate: getToday(),
        tranCurrUse: 'RMB',
        rateMode: 'manual',
        exchangeRate: '7.0000',
        amount: '',
        note: '',
      });
      setErrors({});
      setShowSuccess(false);
      createSecurity.onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Get auto rate
  const { data: autoRate } = useQuery({
    queryKey: ['exchangeRate'],
    queryFn: () => financeApi.getExchangeRate(),
    enabled: isOpen,
  });

  const handleRateModeChange = (mode: 'auto' | 'manual') => {
    setForm(prev => ({
      ...prev,
      rateMode: mode,
      exchangeRate: mode === 'auto' && autoRate ? autoRate.rate.toFixed(4) : prev.exchangeRate,
    }));
  };

  const supplierCurrency = supplier?.currency || 'RMB';
  const showCurrencyWarning = form.tranCurrUse !== supplierCurrency;

  // Inline field change with error clearing
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear inline error for this field when user edits
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Full validation on submit
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.tranDate) {
      newErrors.tranDate = t('prepay.wizard.step2.date') + ' is required';
    }
    if (!form.exchangeRate || parseFloat(form.exchangeRate) <= 0) {
      newErrors.exchangeRate = t('prepay.wizard.step2.exchangeRate') + ' must be > 0';
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      newErrors.amount = t('prepay.wizard.step2.amount') + ' must be > 0';
    }
    if (!form.note.trim()) {
      newErrors.note = t('prepay.wizard.step2.note') + ' is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, t]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (secCode: string) => {
      const result = await financeApi.createPrepayment({
        supplierCode: supplier!.supplierCode,
        tranDate: form.tranDate,
        tranCurrReq: supplierCurrency,
        tranCurrUse: form.tranCurrUse,
        exchangeRate: form.exchangeRate,
        rateMode: form.rateMode,
        amount: form.amount,
        note: form.note,
      }, secCode);
      return result;
    },
    onSuccess: () => {
      createSecurity.onCancel();
      setShowSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    },
    onError: () => {
      createSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const createSecurity = useSecurityAction({
    actionKey: 'btn_prepay_submit',
    level: 'L2',
    onExecute: (code) => createMutation.mutate(code),
  });

  const handleSubmitClick = () => {
    if (!validate()) return;
    createSecurity.trigger();
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.border,
    color: colors.text,
  };

  const errorInputStyle: React.CSSProperties = {
    ...inputStyle,
    borderColor: colors.red,
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('prepay.wizard.title')}
        subtitle={supplier ? `${supplier.supplierCode} — ${supplier.supplierName}` : undefined}
        closable={!showSuccess}
        showFooter={!showSuccess}
        footerRight={
          <div className="flex gap-3">
            <button
              onClick={onClose}
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              className="h-9 px-4 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleSubmitClick}
              disabled={createMutation.isPending}
              style={{ backgroundColor: colors.green }}
              className="h-9 px-5 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('prepay.wizard.submit')}
            </button>
          </div>
        }
      >
        {/* Success overlay */}
        {showSuccess && (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ backgroundColor: `${colors.green}15` }}
            >
              <svg className="w-6 h-6" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: colors.green }}>
              {t('prepay.wizard.step4.title')}
            </p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {t('prepay.wizard.step4.description')}
            </p>
          </div>
        )}

        {!showSuccess && (
          <div className="space-y-4">
            {/* Supplier Info Banner */}
            <div style={{ backgroundColor: colors.bgTertiary }} className="p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: colors.textSecondary }} className="text-xs">
                    {t('prepay.wizard.step1.currency')}:
                    <span className="font-semibold ml-1" style={{ color: colors.text }}>{supplierCurrency}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p style={{ color: colors.textSecondary }} className="text-xs">
                    {t('prepay.wizard.step1.currentBalance')}:
                    <span
                      className="font-bold ml-1 tabular-nums"
                      style={{ color: (supplier?.balance ?? 0) >= 0 ? colors.green : colors.red }}
                    >
                      {supplierCurrency} {supplier?.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {t('prepay.wizard.step2.date')} *
              </label>
              <input
                type="date"
                value={form.tranDate}
                onChange={e => updateField('tranDate', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={errors.tranDate ? errorInputStyle : inputStyle}
              />
              {errors.tranDate && (
                <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.tranDate}</p>
              )}
            </div>

            {/* Payment Currency */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {t('prepay.wizard.step2.currency')} *
              </label>
              <select
                value={form.tranCurrUse}
                onChange={e => updateField('tranCurrUse', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={inputStyle}
              >
                <option value="RMB">RMB</option>
                <option value="USD">USD</option>
              </select>
              {showCurrencyWarning && (
                <p className="mt-1.5 text-xs px-2 py-1 rounded" style={{ backgroundColor: `${colors.orange}12`, color: colors.orange }}>
                  {t('prepay.wizard.step2.currencyWarning', { from: form.tranCurrUse, to: supplierCurrency })}
                </p>
              )}
            </div>

            {/* Exchange Rate */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {t('prepay.wizard.step2.exchangeRate')} *
              </label>
              <div className="flex gap-2">
                <div className="flex rounded-lg overflow-hidden border shrink-0" style={{ borderColor: colors.border }}>
                  <button
                    type="button"
                    onClick={() => handleRateModeChange('auto')}
                    className="px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: form.rateMode === 'auto' ? colors.blue : colors.bg,
                      color: form.rateMode === 'auto' ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {t('prepay.wizard.step2.auto')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRateModeChange('manual')}
                    className="px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: form.rateMode === 'manual' ? colors.blue : colors.bg,
                      color: form.rateMode === 'manual' ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {t('prepay.wizard.step2.manual')}
                  </button>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  value={form.exchangeRate}
                  onChange={e => updateField('exchangeRate', e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm border outline-none tabular-nums"
                  style={errors.exchangeRate ? errorInputStyle : inputStyle}
                  readOnly={form.rateMode === 'auto'}
                />
              </div>
              {errors.exchangeRate && (
                <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.exchangeRate}</p>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderColor: colors.border }} className="border-b" />

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {t('prepay.wizard.step2.amount')} *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={e => updateField('amount', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none tabular-nums"
                style={errors.amount ? errorInputStyle : inputStyle}
              />
              {errors.amount && (
                <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.amount}</p>
              )}
              {/* Converted amount preview */}
              {form.amount && parseFloat(form.amount) > 0 && showCurrencyWarning && parseFloat(form.exchangeRate) > 0 && (
                <p className="mt-1.5 text-xs" style={{ color: colors.textSecondary }}>
                  ≈ {supplierCurrency}{' '}
                  {supplierCurrency === 'RMB'
                    ? (parseFloat(form.amount) * parseFloat(form.exchangeRate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : (parseFloat(form.amount) / parseFloat(form.exchangeRate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
                  }
                </p>
              )}
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {t('prepay.wizard.step2.note')} *
              </label>
              <textarea
                value={form.note}
                onChange={e => updateField('note', e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none resize-none"
                style={errors.note ? errorInputStyle : inputStyle}
              />
              {errors.note && (
                <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.note}</p>
              )}
            </div>
          </div>
        )}
      </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={createSecurity.isOpen}
        level={createSecurity.level}
        title={t('prepay.wizard.securityTitle')}
        description={t('prepay.wizard.securityDescription')}
        onConfirm={createSecurity.onConfirm}
        onCancel={createSecurity.onCancel}
        isLoading={createMutation.isPending}
        error={createSecurity.error}
      />
    </>
  );
}
