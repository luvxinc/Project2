'use client';

import { useState, useEffect, useCallback } from 'react';
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

// ================================
// Component
// V1 parity: edit.py — logistics-only modification.
// Editable: etaDate, pallets, totalWeight, priceKg, exchangeRate, note.
// Items are READ-ONLY (V1 never modifies items in edit flow).
// logisticsCost = ceil(totalWeight) * priceKg (auto-computed).
// ================================

export default function EditShipmentModal({ isOpen, shipment, onClose, onSuccess }: EditShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- Logistics State (editable) ---
  const [etaDate, setEtaDate] = useState('');
  const [pallets, setPallets] = useState<number>(0);
  const [totalWeight, setTotalWeight] = useState<number>(0);
  const [priceKg, setPriceKg] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [note, setNote] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // --- Reset on open ---
  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (isOpen && shipment) {
      setEtaDate(shipment.etaDate || '');
      setPallets(shipment.pallets || 0);
      setTotalWeight(shipment.totalWeight || 0);
      setPriceKg(shipment.priceKg || 0);
      setExchangeRate(shipment.exchangeRate || 0);
      setNote(shipment.note || '');
      setErrors({});
      setSuccess(false);
    }
  }, [isOpen, shipment]);

  // --- ESC to close ---
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
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

  // --- Mutation (logistics-only, no items) ---
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
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
  });

  // --- Submit ---
  const handleSubmit = () => {
    updateMutation.mutate();
  };

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const items = shipment?.items ?? [];
  const totalCargoValue = items.reduce((sum, i) => sum + Math.round(i.quantity * i.unitPrice * 100000) / 100000, 0);
  const isDisabled = shipment?.isDeleted === true || shipment?.status === 'cancelled';

  // --- Early return ---
  if (!isOpen || !shipment) return null;

  // --- Success state ---
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-2xl rounded-2xl border shadow-2xl p-8 text-center"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${colors.green}20` }}
          >
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
            {t('shipments.edit.success')}
          </h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {shipment.logisticNum}
          </p>
        </div>
      </div>
    );
  }

  // ================================
  // Main render
  // ================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div>
            <h2 className="text-[17px] font-semibold" style={{ color: colors.text }}>
              {t('shipments.edit.title')}
            </h2>
            <p className="text-sm font-mono mt-0.5" style={{ color: colors.textSecondary }}>
              {shipment.logisticNum} &mdash; {shipment.sentDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ backgroundColor: colors.bgTertiary }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="px-6 py-4 flex-1 overflow-y-auto" style={{ maxHeight: '500px' }}>
          {/* Logistics Parameters (editable section) */}
          <div className="mb-5 p-4 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
              {t('shipments.edit.logistics')}
            </h3>

            {/* Read-only fields: sentDate, logisticNum */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.sentDate')}</label>
                <input
                  type="text"
                  value={shipment.sentDate}
                  disabled
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-50"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.logisticNum')}</label>
                <input
                  type="text"
                  value={shipment.logisticNum}
                  disabled
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-50"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
            </div>

            {/* V1 editable fields: etaDate, pallets, totalWeight, priceKg, exchangeRate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.etaDate')}</label>
                <input
                  type="date"
                  value={etaDate}
                  disabled={isDisabled}
                  onChange={(e) => setEtaDate(e.target.value)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.pallets')}</label>
                <input
                  type="number"
                  value={pallets || ''}
                  disabled={isDisabled}
                  onChange={(e) => setPallets(parseInt(e.target.value, 10) || 0)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.edit.totalWeight')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={totalWeight || ''}
                  disabled={isDisabled}
                  onChange={(e) => setTotalWeight(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.edit.priceKg')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={priceKg || ''}
                  disabled={isDisabled}
                  onChange={(e) => setPriceKg(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.exchangeRate')}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRate || ''}
                  disabled={isDisabled}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>
            </div>

            {/* Auto-computed logistics cost */}
            {totalWeight > 0 && priceKg > 0 && (
              <div className="mt-3 px-3 py-2 rounded-lg" style={{ backgroundColor: `${colors.blue}10` }}>
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {t('shipments.detail.logisticsCost')}:{' '}
                </span>
                <span className="text-sm font-medium font-mono" style={{ color: colors.blue }}>
                  ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                </span>
                <span className="text-[10px] ml-2" style={{ color: colors.textTertiary }}>
                  = ceil({totalWeight}) × {priceKg}
                </span>
              </div>
            )}

            <div className="mt-3">
              <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('shipments.detail.note')}</label>
              <input
                type="text"
                value={note}
                disabled={isDisabled}
                onChange={(e) => setNote(e.target.value)}
                className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
              />
            </div>
          </div>

          {/* Items (READ-ONLY — V1 edit never modifies items) */}
          {items.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                {t('shipments.edit.items')}
                <span className="ml-1 font-normal normal-case">({t('shipments.edit.itemsReadOnly')})</span>
              </h3>

              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: colors.bgTertiary }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                        <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.quantity}</td>
                        <td className="px-3 py-2 text-right" style={{ color: colors.text }}>${item.unitPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: colors.text }}>
                          ${(Math.round(item.quantity * item.unitPrice * 100000) / 100000).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div
            className="mt-4 p-3 rounded-xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.bgTertiary }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                {t('shipments.detail.totalUSD')} ({items.length} {t('shipments.detail.sku')})
              </span>
              <span className="text-base font-semibold" style={{ color: colors.text }}>
                ${totalCargoValue.toFixed(2)}
              </span>
            </div>
            {exchangeRate > 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {t('shipments.detail.totalRMB')}
                </span>
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  ¥{(totalCargoValue * exchangeRate).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled || updateMutation.isPending}
            className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: colors.blue }}
          >
            {updateMutation.isPending ? '...' : t('shipments.edit.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
