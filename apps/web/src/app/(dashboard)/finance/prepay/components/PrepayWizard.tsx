'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { financeApi, type SupplierBalance } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';

interface Props {
  isOpen: boolean;
  supplier: SupplierBalance | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * PrepayWizard — Multi-step prepayment creation wizard.
 * V1 parity: prepay_wizard.html (4 steps: Intro → Form → Confirm → Done)
 */
export default function PrepayWizard({ isOpen, supplier, onClose, onSuccess }: Props) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [step, setStep] = useState(1);

  // Form state
  const [tranDate, setTranDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tranCurrUse, setTranCurrUse] = useState('RMB');
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>('manual');
  const [exchangeRate, setExchangeRate] = useState('7.0000');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Get auto rate
  const { data: autoRate } = useQuery({
    queryKey: ['exchangeRate'],
    queryFn: () => financeApi.getExchangeRate(),
    enabled: isOpen,
  });

  // When rate mode changes to auto, set the rate
  const handleRateModeChange = (mode: 'auto' | 'manual') => {
    setRateMode(mode);
    if (mode === 'auto' && autoRate) {
      setExchangeRate(autoRate.rate.toFixed(4));
    }
  };

  const supplierCurrency = supplier?.currency || 'RMB';
  const showCurrencyConversion = tranCurrUse !== supplierCurrency;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (secCode: string) => {
      const result = await financeApi.createPrepayment({
        supplierCode: supplier!.supplierCode,
        tranDate,
        tranCurrReq: supplierCurrency,
        tranCurrUse,
        exchangeRate,
        rateMode,
        amount,
        note,
      }, secCode || undefined);
      return result;
    },
    onSuccess: (result) => {
      createSecurity.onCancel();
      setStep(4); // Done step
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

  const handleSubmit = () => {
    createSecurity.trigger();
  };

  const isFormValid = amount && parseFloat(amount) > 0 && note.trim() && parseFloat(exchangeRate) > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: colors.border }}>
            <h2 style={{ color: colors.text }} className="text-lg font-semibold">
              {t('prepay.wizard.title')}
            </h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
              <svg className="w-5 h-5" style={{ color: colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderColor: colors.border }}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    backgroundColor: s <= step ? colors.blue : colors.bgTertiary,
                    color: s <= step ? '#fff' : colors.textTertiary,
                  }}
                >
                  {s < step ? '✓' : s}
                </div>
                {s < 4 && (
                  <div className="w-8 h-0.5 rounded" style={{ backgroundColor: s < step ? colors.blue : colors.bgTertiary }} />
                )}
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="p-4 min-h-[300px]">
            {/* Step 1: Info */}
            {step === 1 && (
              <div className="space-y-4">
                <p style={{ color: colors.text }} className="text-sm">
                  {t('prepay.wizard.step1.description')}
                </p>
                <div style={{ backgroundColor: colors.bgTertiary }} className="p-3 rounded-lg">
                  <p style={{ color: colors.textSecondary }} className="text-xs">
                    {t('prepay.wizard.step1.supplier')}:
                    <span className="font-semibold ml-1" style={{ color: colors.text }}>
                      {supplier?.supplierCode} — {supplier?.supplierName}
                    </span>
                  </p>
                  <p style={{ color: colors.textSecondary }} className="text-xs mt-1">
                    {t('prepay.wizard.step1.currency')}:
                    <span className="font-semibold ml-1" style={{ color: colors.text }}>
                      {supplierCurrency}
                    </span>
                  </p>
                  <p style={{ color: colors.textSecondary }} className="text-xs mt-1">
                    {t('prepay.wizard.step1.currentBalance')}:
                    <span className="font-bold ml-1" style={{ color: (supplier?.balance ?? 0) >= 0 ? colors.green : colors.red }}>
                      {supplierCurrency} {supplier?.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Form */}
            {step === 2 && (
              <div className="space-y-3">
                {/* Date */}
                <div>
                  <label style={{ color: colors.textSecondary }} className="text-xs font-medium mb-1 block">
                    {t('prepay.wizard.step2.date')} *
                  </label>
                  <input
                    type="date"
                    value={tranDate}
                    onChange={(e) => setTranDate(e.target.value)}
                    className="w-full h-9 px-3 border rounded-lg text-sm"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>

                {/* Currency */}
                <div>
                  <label style={{ color: colors.textSecondary }} className="text-xs font-medium mb-1 block">
                    {t('prepay.wizard.step2.currency')} *
                  </label>
                  <select
                    value={tranCurrUse}
                    onChange={(e) => setTranCurrUse(e.target.value)}
                    className="w-full h-9 px-3 border rounded-lg text-sm"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  >
                    <option value="RMB">RMB</option>
                    <option value="USD">USD</option>
                  </select>
                  {showCurrencyConversion && (
                    <p style={{ color: colors.orange }} className="text-[10px] mt-1">
                      {t('prepay.wizard.step2.currencyWarning', { from: tranCurrUse, to: supplierCurrency })}
                    </p>
                  )}
                </div>

                {/* Exchange Rate */}
                <div>
                  <label style={{ color: colors.textSecondary }} className="text-xs font-medium mb-1 block">
                    {t('prepay.wizard.step2.exchangeRate')} *
                  </label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                      <button
                        onClick={() => handleRateModeChange('auto')}
                        className="px-3 py-1.5 text-xs font-medium"
                        style={{
                          backgroundColor: rateMode === 'auto' ? colors.blue : colors.bg,
                          color: rateMode === 'auto' ? '#fff' : colors.textSecondary,
                        }}
                      >
                        {t('prepay.wizard.step2.auto')}
                      </button>
                      <button
                        onClick={() => handleRateModeChange('manual')}
                        className="px-3 py-1.5 text-xs font-medium"
                        style={{
                          backgroundColor: rateMode === 'manual' ? colors.blue : colors.bg,
                          color: rateMode === 'manual' ? '#fff' : colors.textSecondary,
                        }}
                      >
                        {t('prepay.wizard.step2.manual')}
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.0001"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      className="flex-1 h-9 px-3 border rounded-lg text-sm tabular-nums"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                      readOnly={rateMode === 'auto'}
                    />
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label style={{ color: colors.textSecondary }} className="text-xs font-medium mb-1 block">
                    {t('prepay.wizard.step2.amount')} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 border rounded-lg text-sm tabular-nums"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>

                {/* Note */}
                <div>
                  <label style={{ color: colors.textSecondary }} className="text-xs font-medium mb-1 block">
                    {t('prepay.wizard.step2.note')} *
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div className="space-y-3">
                <p style={{ color: colors.text }} className="text-sm font-medium">
                  {t('prepay.wizard.step3.title')}
                </p>
                <div style={{ backgroundColor: colors.bgTertiary }} className="p-3 rounded-lg space-y-2">
                  {[
                    [t('prepay.wizard.step2.date'), tranDate],
                    [t('prepay.wizard.step2.currency'), tranCurrUse],
                    [t('prepay.wizard.step2.exchangeRate'), `${exchangeRate} (${rateMode})`],
                    [t('prepay.wizard.step2.amount'), `${tranCurrUse} ${parseFloat(amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
                    [t('prepay.wizard.step2.note'), note],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between">
                      <span style={{ color: colors.textTertiary }} className="text-xs">{label}</span>
                      <span style={{ color: colors.text }} className="text-xs font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Done */}
            {step === 4 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors.green}20` }}>
                  <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p style={{ color: colors.text }} className="text-lg font-semibold">
                  {t('prepay.wizard.step4.title')}
                </p>
                <p style={{ color: colors.textSecondary }} className="text-sm mt-1">
                  {t('prepay.wizard.step4.description')}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: colors.border }}>
            {step < 4 ? (
              <>
                <button
                  onClick={() => step === 1 ? onClose() : setStep(step - 1)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
                >
                  {step === 1 ? tCommon('cancel') : tCommon('back')}
                </button>
                <button
                  onClick={() => step === 3 ? handleSubmit() : setStep(step + 1)}
                  disabled={step === 2 && !isFormValid}
                  className="px-6 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: step === 3 ? colors.green : colors.blue, color: '#fff' }}
                >
                  {step === 3 ? t('prepay.wizard.submit') : tCommon('next')}
                </button>
              </>
            ) : (
              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="ml-auto px-6 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: colors.blue, color: '#fff' }}
              >
                {tCommon('done')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Security Dialog */}
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
