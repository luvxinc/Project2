'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment } from '@/lib/api';

// ================================
// Types
// ================================

interface EditShipmentModalProps {
  isOpen: boolean;
  shipment: Shipment | null;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 'modify' | 'verify' | 'preview' | 'done';

interface FieldError {
  field: string;
  message: string;
}

interface FieldDiff {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

// ================================
// Editable field definitions (V1 parity)
// ================================
const EDITABLE_FIELDS = [
  'etaDate', 'pallets', 'totalWeight', 'priceKg', 'exchangeRate',
] as const;

// ================================
// Component
// V1 parity: 6-step wizard collapsed to 4 steps for logistics-only.
// Step1: Modify logistics (side-by-side original vs new)
// Step2: Verify parameters (field-level validation with error highlight)
// Step3: Preview diff (before/after comparison)
// Step4: Submit + result (submitting → success / error)
// ================================

export default function EditShipmentModal({ isOpen, shipment, onClose, onSuccess }: EditShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- Wizard state ---
  const [step, setStep] = useState<WizardStep>('modify');

  // --- Logistics State (editable) ---
  const [etaDate, setEtaDate] = useState('');
  const [pallets, setPallets] = useState<number>(0);
  const [totalWeight, setTotalWeight] = useState<number>(0);
  const [priceKg, setPriceKg] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [note, setNote] = useState('');

  // --- Validation state ---
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen && shipment) {
      setEtaDate(shipment.etaDate || '');
      setPallets(shipment.pallets || 0);
      setTotalWeight(shipment.totalWeight || 0);
      setPriceKg(shipment.priceKg || 0);
      setExchangeRate(shipment.exchangeRate || 0);
      setNote(shipment.note || '');
      setStep('modify');
      setFieldErrors([]);
      setSubmitError(null);
    }
  }, [isOpen, shipment]);

  // --- ESC to close ---
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'done') onClose();
    },
    [onClose, step],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const items = shipment?.items ?? [];
  const isDisabled = shipment?.isDeleted === true || shipment?.status === 'cancelled';

  // --- Format helper ---
  const fmt = (v: number | undefined | null, decimals = 2) => {
    if (v === undefined || v === null || isNaN(v)) return '-';
    return parseFloat(v.toFixed(decimals)).toString();
  };

  // --- Field label localization ---
  const fieldLabel = useCallback((key: string): string => {
    const map: Record<string, string> = {
      etaDate: t('shipments.detail.etaDate'),
      pallets: t('shipments.detail.pallets'),
      totalWeight: t('shipments.edit.totalWeight'),
      priceKg: t('shipments.edit.priceKg'),
      exchangeRate: t('shipments.detail.exchangeRate'),
      logisticsCost: t('shipments.detail.logisticsCost'),
      note: t('shipments.detail.note'),
    };
    return map[key] || key;
  }, [t]);

  // --- Diff computation ---
  const diffs: FieldDiff[] = useMemo(() => {
    if (!shipment) return [];
    const origCost = Math.round(Math.ceil(shipment.totalWeight || 0) * (shipment.priceKg || 0) * 100000) / 100000;
    return [
      {
        key: 'etaDate',
        label: fieldLabel('etaDate'),
        before: shipment.etaDate || '-',
        after: etaDate || '-',
        changed: etaDate !== (shipment.etaDate || ''),
      },
      {
        key: 'pallets',
        label: fieldLabel('pallets'),
        before: String(shipment.pallets || 0),
        after: String(pallets),
        changed: pallets !== (shipment.pallets || 0),
      },
      {
        key: 'totalWeight',
        label: fieldLabel('totalWeight'),
        before: fmt(shipment.totalWeight, 2) + ' kg',
        after: fmt(totalWeight, 2) + ' kg',
        changed: Math.abs(totalWeight - (shipment.totalWeight || 0)) > 0.01,
      },
      {
        key: 'priceKg',
        label: fieldLabel('priceKg'),
        before: '¥' + fmt(shipment.priceKg, 4),
        after: '¥' + fmt(priceKg, 4),
        changed: Math.abs(priceKg - (shipment.priceKg || 0)) > 0.0001,
      },
      {
        key: 'exchangeRate',
        label: fieldLabel('exchangeRate'),
        before: fmt(shipment.exchangeRate, 4),
        after: fmt(exchangeRate, 4),
        changed: Math.abs(exchangeRate - (shipment.exchangeRate || 0)) > 0.0001,
      },
      {
        key: 'logisticsCost',
        label: fieldLabel('logisticsCost'),
        before: '¥' + fmt(origCost, 2),
        after: '¥' + fmt(logisticsCost, 2),
        changed: Math.abs(logisticsCost - origCost) > 0.01,
      },
      {
        key: 'note',
        label: fieldLabel('note'),
        before: shipment.note || '-',
        after: note || '-',
        changed: note !== (shipment.note || ''),
      },
    ];
  }, [shipment, etaDate, pallets, totalWeight, priceKg, exchangeRate, logisticsCost, note, fieldLabel]);

  const hasRealChanges = diffs.some(d => d.key !== 'note' && d.changed);

  // --- Validation ---
  const validate = useCallback((): FieldError[] => {
    const errs: FieldError[] = [];
    if (!etaDate) {
      errs.push({ field: 'etaDate', message: t('shipments.edit.errorEtaRequired') });
    } else if (shipment?.sentDate && etaDate < shipment.sentDate) {
      errs.push({ field: 'etaDate', message: t('shipments.edit.errorEtaBeforeSent') });
    }
    if (totalWeight <= 0) {
      errs.push({ field: 'totalWeight', message: t('shipments.edit.errorWeightPositive') });
    }
    if (priceKg <= 0) {
      errs.push({ field: 'priceKg', message: t('shipments.edit.errorPricePositive') });
    }
    if (exchangeRate <= 0) {
      errs.push({ field: 'exchangeRate', message: t('shipments.edit.errorRatePositive') });
    }
    if (!note.trim()) {
      errs.push({ field: 'note', message: t('shipments.edit.noteRequiredError') });
    }
    return errs;
  }, [etaDate, totalWeight, priceKg, exchangeRate, note, shipment, t]);

  // --- Step navigation ---
  const goToVerify = () => {
    const errs = validate();
    setFieldErrors(errs);
    setStep('verify');
  };

  const goToPreview = () => {
    if (fieldErrors.length === 0 && (hasRealChanges || note.trim())) {
      setStep('preview');
    }
  };

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: () =>
      purchaseApi.updateShipment(shipment!.id, {
        etaDate: etaDate || undefined,
        pallets,
        totalWeight,
        priceKg,
        exchangeRate,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setStep('done');
      setSubmitError(null);
    },
    onError: (err: Error) => {
      setSubmitError(err.message || t('shipments.edit.submitFailed'));
    },
  });

  const handleSubmit = () => {
    setSubmitError(null);
    updateMutation.mutate();
  };

  // --- Early return ---
  if (!isOpen || !shipment) return null;

  // ================================
  // Wizard steps config
  // ================================
  const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'modify', label: t('shipments.edit.stepModify') },
    { key: 'verify', label: t('shipments.edit.stepVerify') },
    { key: 'preview', label: t('shipments.edit.stepPreview') },
    { key: 'done', label: t('shipments.edit.stepDone') },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === step);

  // ================================
  // Helper: error field set for highlight
  // ================================
  const errorFields = new Set(fieldErrors.map(e => e.field));

  // ================================
  // Render helpers
  // ================================

  const renderStepBar = () => (
    <div className="flex items-center gap-1 px-6 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
      {STEPS.map((s, i) => {
        const isActive = i === stepIdx;
        const isDone = i < stepIdx;
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300"
                style={{
                  backgroundColor: isDone ? colors.green : isActive ? colors.blue : colors.bgTertiary,
                  color: isDone || isActive ? '#fff' : colors.textTertiary,
                }}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                className="text-xs font-medium truncate transition-colors duration-300"
                style={{ color: isActive ? colors.text : isDone ? colors.green : colors.textTertiary }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-px flex-1 mx-2 transition-colors duration-300"
                style={{ backgroundColor: isDone ? colors.green : colors.border }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // --- Input field with optional error border ---
  const renderField = (
    key: string,
    label: string,
    origValue: string,
    input: React.ReactNode,
  ) => {
    const hasError = errorFields.has(key);
    return (
      <div key={key} className="grid grid-cols-2 gap-3">
        {/* Original value (left) */}
        <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bg }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
            {t('shipments.edit.original')}
          </div>
          <div className="text-sm font-medium" style={{ color: colors.textSecondary }}>{origValue}</div>
        </div>
        {/* New value (right) */}
        <div
          className="p-3 rounded-lg transition-all"
          style={{
            backgroundColor: colors.bg,
            border: hasError ? `2px solid ${colors.red}` : `1px solid ${colors.border}`,
          }}
        >
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
            {label}
          </div>
          {input}
        </div>
      </div>
    );
  };

  // ================================
  // Step 1: MODIFY
  // ================================
  const renderModifyStep = () => (
    <div className="space-y-3">
      {/* Read-only header info */}
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg" style={{ backgroundColor: `${colors.blue}08` }}>
        <div>
          <span className="text-[10px] uppercase" style={{ color: colors.textTertiary }}>{t('shipments.detail.logisticNum')}</span>
          <p className="text-sm font-mono font-medium" style={{ color: colors.blue }}>{shipment.logisticNum}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase" style={{ color: colors.textTertiary }}>{t('shipments.detail.sentDate')}</span>
          <p className="text-sm font-mono font-medium" style={{ color: colors.text }}>{shipment.sentDate}</p>
        </div>
      </div>

      {/* ETA Date */}
      {renderField('etaDate', fieldLabel('etaDate'), shipment.etaDate || '-', (
        <input
          type="date"
          value={etaDate}
          disabled={isDisabled}
          onChange={e => setEtaDate(e.target.value)}
          className="w-full h-7 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      ))}

      {/* Pallets */}
      {renderField('pallets', fieldLabel('pallets'), String(shipment.pallets || 0), (
        <input
          type="number"
          value={pallets || ''}
          disabled={isDisabled}
          onChange={e => setPallets(parseInt(e.target.value, 10) || 0)}
          className="w-full h-7 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      ))}

      {/* Total Weight */}
      {renderField('totalWeight', fieldLabel('totalWeight'), fmt(shipment.totalWeight, 2) + ' kg', (
        <input
          type="number"
          step="0.01"
          value={totalWeight || ''}
          disabled={isDisabled}
          onChange={e => setTotalWeight(parseFloat(e.target.value) || 0)}
          className="w-full h-7 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      ))}

      {/* Price per kg */}
      {renderField('priceKg', fieldLabel('priceKg'), '¥' + fmt(shipment.priceKg, 4), (
        <input
          type="number"
          step="0.0001"
          value={priceKg || ''}
          disabled={isDisabled}
          onChange={e => setPriceKg(parseFloat(e.target.value) || 0)}
          className="w-full h-7 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      ))}

      {/* Exchange Rate */}
      {renderField('exchangeRate', fieldLabel('exchangeRate'), fmt(shipment.exchangeRate, 4), (
        <input
          type="number"
          step="0.0001"
          value={exchangeRate || ''}
          disabled={isDisabled}
          onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
          className="w-full h-7 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      ))}

      {/* Auto-computed logistics cost */}
      {totalWeight > 0 && priceKg > 0 && (
        <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: `${colors.blue}10` }}>
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {fieldLabel('logisticsCost')}:{' '}
          </span>
          <span className="text-sm font-medium font-mono" style={{ color: colors.blue }}>
            ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
          </span>
          <span className="text-[10px] ml-2" style={{ color: colors.textTertiary }}>
            = ceil({totalWeight}) × {priceKg}
          </span>
        </div>
      )}

      {/* Note (required) */}
      <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.orange}40` }}>
        <label className="block text-xs mb-1 font-medium" style={{ color: colors.orange }}>
          {t('shipments.edit.noteRequired')} <span style={{ color: colors.red }}>*</span>
        </label>
        <textarea
          value={note}
          disabled={isDisabled}
          onChange={e => setNote(e.target.value)}
          placeholder={t('shipments.edit.notePlaceholder')}
          rows={2}
          className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none resize-none disabled:opacity-40"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Items (read-only) */}
      {items.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
            {t('shipments.edit.items')}
            <span className="ml-1 font-normal normal-case opacity-60">({t('shipments.edit.itemsReadOnly')})</span>
          </h3>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                    <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.quantity}</td>
                    <td className="px-3 py-2 text-right" style={{ color: colors.text }}>${item.unitPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ================================
  // Step 2: VERIFY
  // ================================
  const renderVerifyStep = () => {
    const passed = fieldErrors.length === 0;
    return (
      <div className="space-y-4">
        {/* Status card */}
        <div
          className="p-4 rounded-xl border-2 transition-colors"
          style={{
            borderColor: passed ? colors.green : colors.red,
            backgroundColor: passed ? `${colors.green}08` : `${colors.red}08`,
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: passed ? `${colors.green}20` : `${colors.red}20` }}
            >
              {passed ? (
                <svg className="w-5 h-5" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: passed ? colors.green : colors.red }}>
                {passed ? t('shipments.edit.verifyPassed') : t('shipments.edit.verifyFailed')}
              </h3>
              {!passed && (
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                  {t('shipments.edit.verifyFieldErrors')}
                </p>
              )}
            </div>
          </div>

          {/* Error list */}
          {fieldErrors.length > 0 && (
            <div className="space-y-1.5">
              {fieldErrors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: `${colors.red}10` }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.red }} />
                  <span className="font-medium" style={{ color: colors.text }}>{fieldLabel(err.field)}:</span>
                  <span style={{ color: colors.red }}>{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parameter summary cards */}
        <div className="grid grid-cols-2 gap-2">
          {diffs.filter(d => d.key !== 'note' && d.key !== 'logisticsCost').map(d => (
            <div
              key={d.key}
              className="p-3 rounded-lg transition-all"
              style={{
                backgroundColor: colors.bgTertiary,
                border: errorFields.has(d.key) ? `2px solid ${colors.red}` : d.changed ? `1px solid ${colors.orange}40` : `1px solid ${colors.border}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>{d.label}</span>
                {d.changed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                    {t('shipments.edit.changed')}
                  </span>
                )}
              </div>
              {d.changed ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] px-1 rounded" style={{ backgroundColor: `${colors.textTertiary}20`, color: colors.textTertiary }}>
                      {t('shipments.edit.previewBefore')}
                    </span>
                    <span className="text-xs line-through" style={{ color: colors.textTertiary }}>{d.before}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] px-1 rounded" style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                      {t('shipments.edit.previewAfter')}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: colors.orange }}>{d.after}</span>
                  </div>
                </div>
              ) : (
                <span className="text-sm" style={{ color: colors.textSecondary }}>{d.after}</span>
              )}
            </div>
          ))}
        </div>

        {/* No real changes warning */}
        {passed && !hasRealChanges && (
          <div className="px-4 py-3 rounded-lg" style={{ backgroundColor: `${colors.orange}10`, border: `1px solid ${colors.orange}30` }}>
            <p className="text-xs" style={{ color: colors.orange }}>
              ⚠️ {t('shipments.edit.noRealChanges')}
            </p>
          </div>
        )}
      </div>
    );
  };

  // ================================
  // Step 3: PREVIEW
  // ================================
  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{t('shipments.edit.previewTitle')}</h3>
        <p className="text-xs" style={{ color: colors.textSecondary }}>{t('shipments.edit.previewSubtitle')}</p>
      </div>

      {/* Shipment identity */}
      <div className="flex items-center justify-center gap-4 py-2">
        <span className="font-mono text-sm font-semibold" style={{ color: colors.blue }}>{shipment.logisticNum}</span>
        <span className="text-xs" style={{ color: colors.textTertiary }}>|</span>
        <span className="text-xs" style={{ color: colors.textSecondary }}>{shipment.sentDate}</span>
      </div>

      {/* Diff table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: colors.bgTertiary }}>
              <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textSecondary }}>
                {t('shipments.edit.logistics')}
              </th>
              <th className="text-right px-4 py-2 font-medium text-xs" style={{ color: colors.textSecondary }}>
                {t('shipments.edit.previewBefore')}
              </th>
              <th className="w-6" />
              <th className="text-right px-4 py-2 font-medium text-xs" style={{ color: colors.textSecondary }}>
                {t('shipments.edit.previewAfter')}
              </th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr
                key={d.key}
                style={{
                  borderTop: `1px solid ${colors.border}`,
                  backgroundColor: d.changed ? `${colors.orange}06` : 'transparent',
                }}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: colors.text }}>{d.label}</span>
                    {d.changed && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                      >
                        {t('shipments.edit.changed')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={`text-xs font-mono ${d.changed ? 'line-through' : ''}`}
                    style={{ color: d.changed ? colors.red : colors.textSecondary }}
                  >
                    {d.before}
                  </span>
                </td>
                <td className="text-center">
                  {d.changed && <span style={{ color: colors.textTertiary }}>→</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={`text-xs font-mono ${d.changed ? 'font-semibold' : ''}`}
                    style={{ color: d.changed ? colors.green : colors.textSecondary }}
                  >
                    {d.after}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ================================
  // Step 4: DONE (submitting / success / error)
  // ================================
  const renderDoneStep = () => {
    if (updateMutation.isPending) {
      return (
        <div className="text-center py-10">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"
            style={{ backgroundColor: `${colors.orange}20` }}
          >
            <svg className="w-8 h-8 animate-spin" style={{ color: colors.orange }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold" style={{ color: colors.text }}>{t('shipments.edit.submitting')}</h3>
        </div>
      );
    }

    if (submitError) {
      return (
        <div className="text-center py-10">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${colors.red}20` }}
          >
            <svg className="w-8 h-8" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: colors.text }}>{t('shipments.edit.submitFailed')}</h3>
          <p className="text-xs mb-4" style={{ color: colors.red }}>{submitError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSubmit}
              className="h-8 px-4 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: colors.orange }}
            >
              {t('shipments.edit.retry')}
            </button>
            <button
              onClick={() => { setSubmitError(null); setStep('preview'); }}
              className="h-8 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
            >
              {t('shipments.edit.backToPreview')}
            </button>
          </div>
        </div>
      );
    }

    // Success
    return (
      <div className="text-center py-10">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${colors.green}20` }}
        >
          <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold mb-1" style={{ color: colors.text }}>{t('shipments.edit.success')}</h3>
        <p className="text-sm font-mono mb-4" style={{ color: colors.textSecondary }}>{shipment.logisticNum}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => { onSuccess(); onClose(); }}
            className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: colors.blue }}
          >
            {tCommon('close')}
          </button>
        </div>
      </div>
    );
  };

  // ================================
  // Main render
  // ================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step !== 'done' ? onClose : undefined} />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="text-[17px] font-semibold" style={{ color: colors.text }}>
              {t('shipments.edit.title')}
            </h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: colors.textSecondary }}>
              {shipment.logisticNum} &mdash; {shipment.sentDate}
            </p>
          </div>
          {step !== 'done' && (
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Step Bar */}
        {renderStepBar()}

        {/* Content */}
        <div className="px-6 py-4 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {step === 'modify' && renderModifyStep()}
          {step === 'verify' && renderVerifyStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'done' && renderDoneStep()}
        </div>

        {/* Footer navigation */}
        {step !== 'done' && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            {/* Left: back button */}
            <button
              type="button"
              onClick={() => {
                if (step === 'verify') setStep('modify');
                else if (step === 'preview') setStep('verify');
                else onClose();
              }}
              className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
            >
              {step === 'modify' ? tCommon('cancel') : tCommon('back')}
            </button>

            {/* Right: next / submit */}
            {step === 'modify' && (
              <button
                type="button"
                onClick={goToVerify}
                disabled={isDisabled}
                className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: colors.blue }}
              >
                {t('shipments.edit.stepVerify')} →
              </button>
            )}
            {step === 'verify' && (
              <button
                type="button"
                onClick={goToPreview}
                disabled={fieldErrors.length > 0 || (!hasRealChanges && !note.trim())}
                className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: fieldErrors.length > 0 ? colors.bgTertiary : colors.blue }}
              >
                {t('shipments.edit.stepPreview')} →
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => { setStep('done'); handleSubmit(); }}
                disabled={isDisabled}
                className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: colors.green }}
              >
                {t('shipments.edit.submit')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
