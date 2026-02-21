'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment } from '@/lib/api';
import EditModalShell from '../../../purchase/components/EditModalShell';

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
// Component
// V1 parity: logistics-only modification wizard.
// No step bar — full-area content with bottom navigation.
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
        key: 'etaDate', label: fieldLabel('etaDate'),
        before: shipment.etaDate || '-', after: etaDate || '-',
        changed: etaDate !== (shipment.etaDate || ''),
      },
      {
        key: 'pallets', label: fieldLabel('pallets'),
        before: String(shipment.pallets || 0), after: String(pallets),
        changed: pallets !== (shipment.pallets || 0),
      },
      {
        key: 'totalWeight', label: fieldLabel('totalWeight'),
        before: fmt(shipment.totalWeight, 2) + ' kg', after: fmt(totalWeight, 2) + ' kg',
        changed: Math.abs(totalWeight - (shipment.totalWeight || 0)) > 0.01,
      },
      {
        key: 'priceKg', label: fieldLabel('priceKg'),
        before: '¥' + fmt(shipment.priceKg, 4), after: '¥' + fmt(priceKg, 4),
        changed: Math.abs(priceKg - (shipment.priceKg || 0)) > 0.0001,
      },
      {
        key: 'exchangeRate', label: fieldLabel('exchangeRate'),
        before: fmt(shipment.exchangeRate, 4), after: fmt(exchangeRate, 4),
        changed: Math.abs(exchangeRate - (shipment.exchangeRate || 0)) > 0.0001,
      },
      {
        key: 'logisticsCost', label: fieldLabel('logisticsCost'),
        before: '¥' + fmt(origCost, 2), after: '¥' + fmt(logisticsCost, 2),
        changed: Math.abs(logisticsCost - origCost) > 0.01,
      },
      {
        key: 'note', label: fieldLabel('note'),
        before: shipment.note || '-', after: note || '-',
        changed: note !== (shipment.note || ''),
      },
    ];
  }, [shipment, etaDate, pallets, totalWeight, priceKg, exchangeRate, logisticsCost, note, fieldLabel]);

  const hasRealChanges = diffs.some(d => d.key !== 'note' && d.changed);
  const errorFields = new Set(fieldErrors.map(e => e.field));

  // --- Validation ---
  const validate = useCallback((): FieldError[] => {
    const errs: FieldError[] = [];
    if (!etaDate)
      errs.push({ field: 'etaDate', message: t('shipments.edit.errorEtaRequired') });
    else if (shipment?.sentDate && etaDate < shipment.sentDate)
      errs.push({ field: 'etaDate', message: t('shipments.edit.errorEtaBeforeSent') });
    if (totalWeight <= 0)
      errs.push({ field: 'totalWeight', message: t('shipments.edit.errorWeightPositive') });
    if (priceKg <= 0)
      errs.push({ field: 'priceKg', message: t('shipments.edit.errorPricePositive') });
    if (exchangeRate <= 0)
      errs.push({ field: 'exchangeRate', message: t('shipments.edit.errorRatePositive') });
    if (!note.trim())
      errs.push({ field: 'note', message: t('shipments.edit.noteRequiredError') });
    return errs;
  }, [etaDate, totalWeight, priceKg, exchangeRate, note, shipment, t]);

  // --- Step navigation ---
  const goToVerify = () => { setFieldErrors(validate()); setStep('verify'); };
  const goToPreview = () => { if (fieldErrors.length === 0) setStep('preview'); };

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: () =>
      purchaseApi.updateShipment(shipment!.id, {
        etaDate: etaDate || undefined,
        pallets, totalWeight, priceKg, exchangeRate,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setStep('done');
      setSubmitError(null);
    },
    onError: (err: Error) => { setSubmitError(err.message || t('shipments.edit.submitFailed')); },
  });

  const handleSubmit = () => { setSubmitError(null); updateMutation.mutate(); };

  if (!isOpen || !shipment) return null;

  // ================================
  // STEP: MODIFY — full-width 2-column layout
  // ================================
  const renderModifyStep = () => (
    <div className="space-y-5">
      {/* Identity bar */}
      <div className="flex items-center gap-6 px-4 py-3 rounded-xl" style={{ backgroundColor: `${colors.blue}06`, border: `1px solid ${colors.blue}15` }}>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('shipments.detail.logisticNum')}</span>
          <p className="text-sm font-mono font-semibold" style={{ color: colors.blue }}>{shipment.logisticNum}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('shipments.detail.sentDate')}</span>
          <p className="text-sm font-mono font-medium" style={{ color: colors.text }}>{shipment.sentDate}</p>
        </div>
      </div>

      {/* 2-column: Original | Modified */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Original values (read-only) */}
        <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: colors.textTertiary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t('shipments.edit.original')}
          </h3>
          <div className="space-y-3">
            {[
              { label: fieldLabel('etaDate'), value: shipment.etaDate || '-' },
              { label: fieldLabel('pallets'), value: String(shipment.pallets || 0) },
              { label: fieldLabel('totalWeight'), value: fmt(shipment.totalWeight, 2) + ' kg' },
              { label: fieldLabel('priceKg'), value: '¥' + fmt(shipment.priceKg, 4) },
              { label: fieldLabel('exchangeRate'), value: fmt(shipment.exchangeRate, 4) },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ backgroundColor: colors.bg }}>
                <span className="text-xs" style={{ color: colors.textTertiary }}>{f.label}</span>
                <span className="text-sm font-mono font-medium" style={{ color: colors.textSecondary }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Editable values */}
        <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: colors.blue }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {t('shipments.edit.modified')}
          </h3>
          <div className="space-y-3">
            {/* ETA Date */}
            <div>
              <label className="block text-[11px] mb-1" style={{ color: colors.textTertiary }}>{fieldLabel('etaDate')}</label>
              <input type="date" value={etaDate} disabled={isDisabled}
                onChange={e => setEtaDate(e.target.value)}
                className="w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: errorFields.has('etaDate') ? colors.red : colors.border, color: colors.text }}
              />
            </div>
            {/* Pallets */}
            <div>
              <label className="block text-[11px] mb-1" style={{ color: colors.textTertiary }}>{fieldLabel('pallets')}</label>
              <input type="number" value={pallets || ''} disabled={isDisabled}
                onChange={e => setPallets(parseInt(e.target.value, 10) || 0)}
                className="w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
              />
            </div>
            {/* Total Weight */}
            <div>
              <label className="block text-[11px] mb-1" style={{ color: colors.textTertiary }}>{fieldLabel('totalWeight')}</label>
              <input type="number" step="0.01" value={totalWeight || ''} disabled={isDisabled}
                onChange={e => setTotalWeight(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: errorFields.has('totalWeight') ? colors.red : colors.border, color: colors.text }}
              />
            </div>
            {/* Price per kg */}
            <div>
              <label className="block text-[11px] mb-1" style={{ color: colors.textTertiary }}>{fieldLabel('priceKg')}</label>
              <input type="number" step="0.0001" value={priceKg || ''} disabled={isDisabled}
                onChange={e => setPriceKg(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: errorFields.has('priceKg') ? colors.red : colors.border, color: colors.text }}
              />
            </div>
            {/* Exchange Rate */}
            <div>
              <label className="block text-[11px] mb-1" style={{ color: colors.textTertiary }}>{fieldLabel('exchangeRate')}</label>
              <input type="number" step="0.0001" value={exchangeRate || ''} disabled={isDisabled}
                onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: errorFields.has('exchangeRate') ? colors.red : colors.border, color: colors.text }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logistics cost (auto-computed, full-width) */}
      {totalWeight > 0 && priceKg > 0 && (
        <div className="px-4 py-2.5 rounded-xl flex items-center justify-between"
          style={{ backgroundColor: `${colors.blue}08`, border: `1px solid ${colors.blue}15` }}>
          <span className="text-xs" style={{ color: colors.textSecondary }}>{fieldLabel('logisticsCost')}</span>
          <div>
            <span className="text-sm font-semibold font-mono" style={{ color: colors.blue }}>
              ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
            </span>
            <span className="text-[10px] ml-2" style={{ color: colors.textTertiary }}>= ceil({totalWeight}) × {priceKg}</span>
          </div>
        </div>
      )}

      {/* Note (required, full-width) */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${errorFields.has('note') ? colors.red : colors.orange}30` }}>
        <label className="block text-xs font-medium mb-1.5" style={{ color: colors.orange }}>
          {t('shipments.edit.noteRequired')} <span style={{ color: colors.red }}>*</span>
        </label>
        <textarea value={note} disabled={isDisabled} onChange={e => setNote(e.target.value)}
          placeholder={t('shipments.edit.notePlaceholder')} rows={2}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none resize-none disabled:opacity-40"
          style={{ backgroundColor: colors.bg, borderColor: errorFields.has('note') ? colors.red : colors.border, color: colors.text }}
        />
      </div>

      {/* Items (read-only, full-width) */}
      {items.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
            {t('shipments.edit.items')}
            <span className="ml-1 font-normal normal-case opacity-60">({t('shipments.edit.itemsReadOnly')})</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: colors.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td className="px-4 py-2.5" style={{ color: colors.blue }}>{item.poNum}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: colors.text }}>{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: colors.text }}>${item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-medium" style={{ color: colors.text }}>
                      ${(Math.round(item.quantity * item.unitPrice * 100) / 100).toFixed(2)}
                    </td>
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
  // STEP: VERIFY — full-width validation display
  // ================================
  const renderVerifyStep = () => {
    const passed = fieldErrors.length === 0;
    return (
      <div className="space-y-5">
        {/* Status banner */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2"
          style={{ borderColor: passed ? colors.green : colors.red, backgroundColor: passed ? `${colors.green}06` : `${colors.red}06` }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: passed ? `${colors.green}15` : `${colors.red}15` }}>
            {passed ? (
              <svg className="w-6 h-6" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: passed ? colors.green : colors.red }}>
              {passed ? t('shipments.edit.verifyPassed') : t('shipments.edit.verifyFailed')}
            </h3>
            {!passed && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{t('shipments.edit.verifyFieldErrors')}</p>}
          </div>
        </div>

        {/* Error list */}
        {fieldErrors.length > 0 && (
          <div className="space-y-2">
            {fieldErrors.map((err, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{ backgroundColor: `${colors.red}06`, border: `1px solid ${colors.red}20` }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.red }} />
                <span className="text-xs font-medium" style={{ color: colors.text }}>{fieldLabel(err.field)}:</span>
                <span className="text-xs" style={{ color: colors.red }}>{err.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Parameter grid */}
        <div className="grid grid-cols-3 gap-3">
          {diffs.filter(d => d.key !== 'note' && d.key !== 'logisticsCost').map(d => (
            <div key={d.key} className="p-3 rounded-xl"
              style={{
                backgroundColor: colors.bgTertiary,
                border: errorFields.has(d.key) ? `2px solid ${colors.red}` : d.changed ? `1px solid ${colors.orange}40` : `1px solid ${colors.border}`,
              }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>{d.label}</span>
                {d.changed && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                    {t('shipments.edit.changed')}
                  </span>
                )}
              </div>
              {d.changed ? (
                <div className="space-y-1">
                  <div className="text-xs line-through" style={{ color: colors.textTertiary }}>{d.before}</div>
                  <div className="text-sm font-semibold" style={{ color: colors.orange }}>{d.after}</div>
                </div>
              ) : (
                <span className="text-sm" style={{ color: colors.textSecondary }}>{d.after}</span>
              )}
            </div>
          ))}
        </div>

        {/* No real changes warning */}
        {passed && !hasRealChanges && (
          <div className="px-4 py-3 rounded-xl" style={{ backgroundColor: `${colors.orange}08`, border: `1px solid ${colors.orange}25` }}>
            <p className="text-xs" style={{ color: colors.orange }}>⚠️ {t('shipments.edit.noRealChanges')}</p>
          </div>
        )}
      </div>
    );
  };

  // ================================
  // STEP: PREVIEW — diff table, full-width
  // ================================
  const renderPreviewStep = () => (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{t('shipments.edit.previewTitle')}</h3>
        <p className="text-xs" style={{ color: colors.textSecondary }}>{t('shipments.edit.previewSubtitle')}</p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: colors.bgTertiary }}>
              <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: colors.textSecondary }}>{t('shipments.edit.logistics')}</th>
              <th className="text-right px-5 py-3 font-medium text-xs" style={{ color: colors.textSecondary }}>{t('shipments.edit.previewBefore')}</th>
              <th className="w-8" />
              <th className="text-right px-5 py-3 font-medium text-xs" style={{ color: colors.textSecondary }}>{t('shipments.edit.previewAfter')}</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map(d => (
              <tr key={d.key} style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: d.changed ? `${colors.orange}04` : 'transparent' }}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: colors.text }}>{d.label}</span>
                    {d.changed && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>{t('shipments.edit.changed')}</span>}
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className={`text-xs font-mono ${d.changed ? 'line-through' : ''}`} style={{ color: d.changed ? colors.red : colors.textSecondary }}>{d.before}</span>
                </td>
                <td className="text-center">{d.changed && <span style={{ color: colors.textTertiary }}>→</span>}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`text-xs font-mono ${d.changed ? 'font-semibold' : ''}`} style={{ color: d.changed ? colors.green : colors.textSecondary }}>{d.after}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ================================
  // STEP: DONE — submitting / success / error
  // ================================
  const renderDoneStep = () => {
    if (updateMutation.isPending) {
      return (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse" style={{ backgroundColor: `${colors.orange}15` }}>
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
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.red}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: colors.text }}>{t('shipments.edit.submitFailed')}</h3>
          <p className="text-xs mb-6" style={{ color: colors.red }}>{submitError}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleSubmit} className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90" style={{ backgroundColor: colors.orange }}>{t('shipments.edit.retry')}</button>
            <button onClick={() => { setSubmitError(null); setStep('preview'); }} className="h-9 px-5 text-sm font-medium rounded-lg hover:opacity-80" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{t('shipments.edit.backToPreview')}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
          <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold mb-1" style={{ color: colors.text }}>{t('shipments.edit.success')}</h3>
        <p className="text-sm font-mono mb-6" style={{ color: colors.textSecondary }}>{shipment.logisticNum}</p>
        <button onClick={() => { onSuccess(); onClose(); }} className="h-9 px-6 text-sm font-medium rounded-lg text-white hover:opacity-90" style={{ backgroundColor: colors.blue }}>{tCommon('close')}</button>
      </div>
    );
  };

  // ================================
  // Footer navigation (per step)
  // ================================
  const footerLeft = step === 'modify' ? undefined : (
    <button onClick={() => {
      if (step === 'verify') setStep('modify');
      else if (step === 'preview') setStep('verify');
    }}
      className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
      style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
      ← {tCommon('back')}
    </button>
  );

  const footerRight = (() => {
    if (step === 'modify') return (
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{tCommon('cancel')}</button>
        <button onClick={goToVerify} disabled={isDisabled} className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: colors.blue }}>
          {t('shipments.edit.stepVerify')} →
        </button>
      </div>
    );
    if (step === 'verify') return (
      <button onClick={goToPreview} disabled={fieldErrors.length > 0 || (!hasRealChanges && !note.trim())}
        className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: fieldErrors.length > 0 ? colors.bgTertiary : colors.blue }}>
        {t('shipments.edit.stepPreview')} →
      </button>
    );
    if (step === 'preview') return (
      <button onClick={() => { setStep('done'); handleSubmit(); }} disabled={isDisabled}
        className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: colors.green }}>
        {t('shipments.edit.submit')}
      </button>
    );
    return null;
  })();

  return (
    <EditModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('shipments.edit.title')}
      subtitle={`${shipment.logisticNum} — ${shipment.sentDate}`}
      closable={step !== 'done'}
      showFooter={step !== 'done'}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {step === 'modify' && renderModifyStep()}
      {step === 'verify' && renderVerifyStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'done' && renderDoneStep()}
    </EditModalShell>
  );
}
