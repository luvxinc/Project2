'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type SupplierWithStrategy, type SupplierStrategy } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

interface EditStrategyModalProps {
  isOpen: boolean;
  supplier: SupplierWithStrategy;
  /** If provided, we are editing an existing strategy record (edit mode).
   *  If undefined, we are creating a new strategy (new mode). */
  editingStrategy?: SupplierStrategy;
  /** Minimum allowed effective date for new strategies (>= latest strategy date). */
  minEffectiveDate?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  supplierName: string;
  status: boolean;
  category: string;
  currency: string;
  floatCurrency: boolean;
  floatThreshold: number;
  requireDeposit: boolean;
  depositRatio: number;
  effectiveDate: string;
  note: string;
}

function getToday(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function EditStrategyModal({ isOpen, supplier, editingStrategy, minEffectiveDate, onClose, onSuccess }: EditStrategyModalProps) {
  const isEditMode = !!editingStrategy;
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // Form state
  const [form, setForm] = useState<FormData>(() => buildInitialForm(supplier));

  // Inactive supplier lockdown: all fields except status toggle are disabled
  const isFieldsLocked = !supplier.status && !form.status;

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Conflict state
  const [conflictChecking, setConflictChecking] = useState(false);
  const [hasConflict, setHasConflict] = useState<boolean | null>(null);
  const [conflictOverride, setConflictOverride] = useState(false);
  const conflictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Success state
  const [showSuccess, setShowSuccess] = useState(false);

  // ESC handled by ModalShell

  // Reset form when supplier changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(supplier));
      setErrors({});
      setHasConflict(null);
      setConflictOverride(false);
      modifySecurity.onCancel();
      setShowSuccess(false);
    }
  }, [isOpen, supplier]);

  // Debounced conflict check when effectiveDate changes (skip in edit mode — date is locked)
  useEffect(() => {
    if (!isOpen || isEditMode) return;
    if (!form.effectiveDate) {
      setHasConflict(null);
      return;
    }

    if (conflictDebounceRef.current) {
      clearTimeout(conflictDebounceRef.current);
    }

    conflictDebounceRef.current = setTimeout(() => {
      checkConflict(form.effectiveDate);
    }, 400);

    return () => {
      if (conflictDebounceRef.current) {
        clearTimeout(conflictDebounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.effectiveDate, isOpen]);

  function buildInitialForm(s: SupplierWithStrategy): FormData {
    // In edit mode, pre-fill from the specific strategy being edited
    const strat = editingStrategy ?? s.latestStrategy;
    return {
      supplierName: s.supplierName ?? '',
      status: s.status ?? true,
      category: strat?.category ?? 'E',
      currency: strat?.currency ?? 'USD',
      floatCurrency: strat?.floatCurrency ?? false,
      floatThreshold: strat?.floatThreshold ?? 0,
      requireDeposit: strat?.requireDeposit ?? false,
      depositRatio: strat?.depositRatio ?? 0,
      effectiveDate: editingStrategy?.effectiveDate ?? getToday(),
      note: editingStrategy?.note ?? '',
    };
  }

  const checkConflict = useCallback(async (date: string) => {
    setConflictChecking(true);
    setHasConflict(null);
    setConflictOverride(false);
    try {
      const result = await purchaseApi.checkConflict(supplier.supplierCode, date);
      const conflict = typeof result === 'object' && 'data' in result
        ? (result as any).data?.conflict
        : (result as any)?.conflict;
      setHasConflict(!!conflict);
    } catch {
      setHasConflict(false);
    } finally {
      setConflictChecking(false);
    }
  }, [supplier.supplierCode]);

  // Validate entire form
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (form.floatCurrency) {
      if (form.floatThreshold <= 0 || form.floatThreshold > 10) {
        newErrors.floatThreshold = t('errors.floatThresholdInvalid');
      }
    }
    if (form.requireDeposit) {
      if (form.depositRatio <= 0) {
        newErrors.depositRatio = t('errors.depositRatioInvalid');
      }
    }
    if (!form.effectiveDate) {
      newErrors.effectiveDate = t('errors.dateRequired');
    }
    // New mode: enforce minimum effective date
    if (!isEditMode && minEffectiveDate && form.effectiveDate && form.effectiveDate < minEffectiveDate) {
      newErrors.effectiveDate = t('edit.dateTooEarly', { date: minEffectiveDate });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, t, isEditMode, minEffectiveDate]);

  // Mutation
  const modifyMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.modifyStrategy({
        supplierCode: supplier.supplierCode,
        supplierName: form.supplierName,
        status: form.status,
        category: form.category,
        currency: form.currency,
        floatCurrency: form.floatCurrency,
        floatThreshold: form.floatCurrency ? form.floatThreshold : undefined,
        requireDeposit: form.requireDeposit,
        depositRatio: form.requireDeposit ? form.depositRatio : undefined,
        effectiveDate: form.effectiveDate,
        note: form.note || undefined,
        override: conflictOverride,
        sec_code_l3: secCode,
      }),
    onSuccess: () => {
      modifySecurity.onCancel();
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setTimeout(() => {
        onSuccess();
      }, 800);
    },
    onError: (err: any) => {
      if (err?.statusCode === 409 && !conflictOverride) {
        modifySecurity.onCancel();
        setHasConflict(true);
      } else {
        modifySecurity.setError(tCommon('securityCode.invalid'));
      }
    },
  });

  const modifySecurity = useSecurityAction({
    actionKey: 'btn_modify_strategy',
    level: 'L3',
    onExecute: (code) => modifyMutation.mutate(code),
  });

  const handleSubmitClick = () => {
    if (!validate()) return;
    if (hasConflict && !conflictOverride) return;
    modifySecurity.trigger();
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={isEditMode ? t('edit.titleEdit') : t('edit.title')}
        subtitle={`${supplier.supplierCode} — ${supplier.supplierName}`}
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
              disabled={(hasConflict === true && !conflictOverride) || modifyMutation.isPending || isFieldsLocked}
              style={{ backgroundColor: colors.blue }}
              className="h-9 px-5 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('edit.submit')}
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
                {t('messages.strategySuccess')}
              </p>
            </div>
          )}

          {!showSuccess && (
            <>
              {/* Single scrollable form */}
              <div className="space-y-4">
                {/* Supplier Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.supplierName')}
                  </label>
                  <input
                    type="text"
                    value={form.supplierName}
                    onChange={e => setForm(prev => ({ ...prev, supplierName: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={inputStyle}
                  />
                </div>

                {/* Status Toggle */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.statusLabel')}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, status: !prev.status }))}
                      className="relative w-11 h-6 rounded-full transition-colors"
                      style={{ backgroundColor: form.status ? colors.green : colors.bgTertiary }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: form.status ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                    <span className="text-sm" style={{ color: colors.textSecondary }}>
                      {form.status ? t('status.active') : t('status.inactive')}
                    </span>
                  </div>
                  {!form.status && (
                    <p
                      className="mt-2 text-xs px-2.5 py-1.5 rounded-lg"
                      style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}
                    >
                      {isFieldsLocked ? t('status.inactiveWarning') : t('status.inactive')}
                    </p>
                  )}
                </div>

                <div style={{ borderColor: colors.border }} className="border-b" />

                <fieldset disabled={isFieldsLocked} style={isFieldsLocked ? { opacity: 0.5 } : {}}>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.categoryLabel')}
                  </label>
                  <select
                    value={form.category}
                    onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={inputStyle}
                  >
                    <option value="E">{t('category.E')}</option>
                    <option value="A">{t('category.A')}</option>
                  </select>
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.currencyLabel')}
                  </label>
                  <select
                    value={form.currency}
                    onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={inputStyle}
                  >
                    <option value="USD">{t('currency.USD')}</option>
                    <option value="RMB">{t('currency.RMB')}</option>
                  </select>
                </div>

                {/* Float Currency Toggle */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.floatCurrency')}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, floatCurrency: !prev.floatCurrency }))}
                      className="relative w-11 h-6 rounded-full transition-colors"
                      style={{ backgroundColor: form.floatCurrency ? colors.green : colors.bgTertiary }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: form.floatCurrency ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>
                </div>

                {/* Float Threshold (shown when floatCurrency=true) */}
                {form.floatCurrency && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                      {t('edit.floatThreshold')}
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={form.floatThreshold || ''}
                      onChange={e => setForm(prev => ({ ...prev, floatThreshold: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                      style={inputStyle}
                    />
                    {errors.floatThreshold && (
                      <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.floatThreshold}</p>
                    )}
                  </div>
                )}

                {/* Require Deposit Toggle */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.requireDeposit')}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, requireDeposit: !prev.requireDeposit }))}
                      className="relative w-11 h-6 rounded-full transition-colors"
                      style={{ backgroundColor: form.requireDeposit ? colors.green : colors.bgTertiary }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: form.requireDeposit ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>
                </div>

                {/* Deposit Ratio (shown when requireDeposit=true) */}
                {form.requireDeposit && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                      {t('edit.depositRatio')}
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={form.depositRatio || ''}
                      onChange={e => setForm(prev => ({ ...prev, depositRatio: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                      style={inputStyle}
                    />
                    {errors.depositRatio && (
                      <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.depositRatio}</p>
                    )}
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderColor: colors.border }} className="border-b" />

                {/* Effective Date */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.effectiveDate')}
                  </label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={e => setForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{
                      ...inputStyle,
                      ...(isEditMode ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                    }}
                    readOnly={isEditMode}
                    min={!isEditMode ? minEffectiveDate : undefined}
                  />
                  {errors.effectiveDate && (
                    <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.effectiveDate}</p>
                  )}

                  {/* Conflict status — inline below date input */}
                  <div className="mt-2">
                    {conflictChecking && (
                      <div className="flex items-center gap-2 py-1">
                        <div
                          className="w-4 h-4 border-2 rounded-full animate-spin"
                          style={{ borderColor: colors.border, borderTopColor: colors.blue }}
                        />
                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                          ...
                        </span>
                      </div>
                    )}

                    {!conflictChecking && hasConflict === true && (
                      <div
                        className="rounded-lg p-3"
                        style={{ backgroundColor: `${colors.orange}15` }}
                      >
                        <p className="text-xs font-medium mb-2" style={{ color: colors.orange }}>
                          {t('edit.conflictWarning')}
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <button
                            type="button"
                            onClick={() => setConflictOverride(!conflictOverride)}
                            className="relative w-11 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: conflictOverride ? colors.green : colors.bgTertiary }}
                          >
                            <div
                              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                              style={{ transform: conflictOverride ? 'translateX(22px)' : 'translateX(2px)' }}
                            />
                          </button>
                          <span className="text-xs" style={{ color: colors.orange }}>
                            {t('edit.overrideConfirm')}
                          </span>
                        </label>
                      </div>
                    )}

                    {!conflictChecking && hasConflict === false && (
                      <span
                        className="text-xs"
                        style={{ color: colors.green }}
                      >
                        {t('edit.noConflict')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('edit.note')}
                  </label>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder={t('edit.notePlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none resize-none"
                    style={inputStyle}
                  />
                </div>
                </fieldset>

                {/* Submit + Cancel buttons moved to footer */}
              </div>
            </>
          )}
      </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={modifySecurity.isOpen}
        level={modifySecurity.level}
        title={t('edit.title')}
        description={t('security.requiresL3')}
        onConfirm={modifySecurity.onConfirm}
        onCancel={modifySecurity.onCancel}
        isLoading={modifyMutation.isPending}
        error={modifySecurity.error}
      />
    </>
  );
}
