'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment } from '@/lib/api';
import ModalShell from '../../../purchase/components/ModalShell';

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
// Component — Single-page edit form
// Pre-fills with existing values. Validates on submit.
// Sections: Logistics Info → Items (read-only) → Note
// ================================

export default function EditShipmentModal({ isOpen, shipment, onClose, onSuccess }: EditShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- Editable state ---
  const [etaDate, setEtaDate] = useState('');
  const [pallets, setPallets] = useState<number>(0);
  const [totalWeight, setTotalWeight] = useState<number>(0);
  const [priceKg, setPriceKg] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [note, setNote] = useState('');

  // --- UI state ---
  const [success, setSuccess] = useState(false);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen && shipment) {
      setEtaDate(shipment.etaDate || '');
      setPallets(shipment.pallets || 0);
      setTotalWeight(shipment.totalWeight || 0);
      setPriceKg(shipment.priceKg || 0);
      setExchangeRate(shipment.exchangeRate || 0);
      setNote(shipment.note || '');
      setSuccess(false);
    }
  }, [isOpen, shipment]);

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const items = shipment?.items ?? [];
  const isDisabled = shipment?.isDeleted === true || shipment?.status === 'cancelled';

  const fmt = (v: number | undefined | null, decimals = 2) => {
    if (v === undefined || v === null || isNaN(v)) return '-';
    return parseFloat(v.toFixed(decimals)).toString();
  };

  // --- Dirty check ---
  const hasChanges = useMemo(() => {
    if (!shipment) return false;
    return (
      etaDate !== (shipment.etaDate || '') ||
      pallets !== (shipment.pallets || 0) ||
      Math.abs(totalWeight - (shipment.totalWeight || 0)) > 0.01 ||
      Math.abs(priceKg - (shipment.priceKg || 0)) > 0.0001 ||
      Math.abs(exchangeRate - (shipment.exchangeRate || 0)) > 0.0001 ||
      note !== (shipment.note || '')
    );
  }, [shipment, etaDate, pallets, totalWeight, priceKg, exchangeRate, note]);

  // --- Real-time validation → drives submit button ---
  const isValid = useMemo(() => {
    if (!etaDate) return false;
    if (shipment?.sentDate && etaDate < shipment.sentDate) return false;
    if (totalWeight <= 0) return false;
    if (priceKg <= 0) return false;
    if (exchangeRate <= 0) return false;
    if (!note.trim()) return false;
    return true;
  }, [etaDate, totalWeight, priceKg, exchangeRate, note, shipment]);

  const canSubmit = isValid && hasChanges && !isDisabled;

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
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    updateMutation.mutate();
  };

  if (!isOpen || !shipment) return null;

  // --- Success overlay ---
  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('shipments.edit.success')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('shipments.edit.success')}</h3>
          <p className="text-sm font-mono" style={{ color: colors.textSecondary }}>{shipment.logisticNum}</p>
        </div>
      </ModalShell>
    );
  }

  // --- Input helper ---
  const inputCls = "w-full h-9 px-3 border rounded-lg text-sm focus:outline-none disabled:opacity-40";
  const inputStyle = {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('shipments.edit.title')}
      subtitle={`${shipment.logisticNum} — ${shipment.sentDate}`}
      footerLeft={
        <div className="text-xs" style={{ color: hasChanges ? colors.orange : colors.textTertiary }}>
          {hasChanges ? '' : t('shipments.edit.noChanges')}
        </div>
      }
      footerRight={
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
            {tCommon('cancel')}
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit || updateMutation.isPending}
            className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: canSubmit ? colors.blue : colors.textTertiary }}>
            {updateMutation.isPending ? '...' : t('shipments.edit.submit')}
          </button>
        </div>
      }
    >
      {/* Section: Logistics Info */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
          {t('shipments.edit.logistics')}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {/* ETA Date */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.etaDate')}</label>
            <input type="date" value={etaDate} disabled={isDisabled} onChange={e => setEtaDate(e.target.value)}
              className={inputCls} style={{ ...inputStyle, borderColor: etaDate && !(shipment?.sentDate && etaDate < shipment.sentDate) ? colors.border : colors.red }} />
          </div>
          {/* Pallets */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.pallets')}</label>
            <input type="number" value={pallets || ''} disabled={isDisabled} onChange={e => setPallets(parseInt(e.target.value, 10) || 0)}
              className={inputCls} style={inputStyle} />
          </div>
          {/* Total Weight */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.edit.totalWeight')}</label>
            <input type="number" step="0.01" value={totalWeight || ''} disabled={isDisabled} onChange={e => setTotalWeight(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: totalWeight > 0 ? colors.border : colors.red }} />
          </div>
          {/* Price/kg */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.edit.priceKg')}</label>
            <input type="number" step="0.0001" value={priceKg || ''} disabled={isDisabled} onChange={e => setPriceKg(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: priceKg > 0 ? colors.border : colors.red }} />
          </div>
          {/* Exchange Rate */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.exchangeRate')}</label>
            <input type="number" step="0.0001" value={exchangeRate || ''} disabled={isDisabled} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: exchangeRate > 0 ? colors.border : colors.red }} />
          </div>
          {/* Auto-computed logistics cost (read-only) */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.logisticsCost')}</label>
            <div className="h-9 px-3 flex items-center rounded-lg text-sm font-mono" style={{ backgroundColor: colors.bgTertiary, color: colors.blue }}>
              ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              <span className="text-[10px] ml-2" style={{ color: colors.textTertiary }}>= ceil({fmt(totalWeight)}) × {fmt(priceKg, 4)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Items (read-only) */}
      {items.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {t('shipments.edit.items')}
            <span className="text-[10px] font-normal normal-case opacity-60">({t('shipments.edit.itemsReadOnly')})</span>
          </h3>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td className="px-4 py-2.5" style={{ color: colors.blue }}>{item.poNum}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: colors.text }}>{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: colors.text }}>${item.unitPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section: Note (required) */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {t('shipments.edit.noteRequired')} <span style={{ color: colors.red }}>*</span>
        </h3>
        <textarea
          value={note}
          disabled={isDisabled}
          onChange={e => setNote(e.target.value)}
          placeholder={t('shipments.edit.notePlaceholder')}
          rows={3}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none resize-none disabled:opacity-40"
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: note.trim() ? colors.border : colors.red,
            color: colors.text,
          }}
        />
      </div>
    </ModalShell>
  );
}
