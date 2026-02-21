'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment, type ShipmentItemDetail } from '@/lib/api';
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

interface EditableItem {
  /** DB id — null for newly added items */
  id: number | null;
  poNum: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  poChange: boolean;
  /** true = marked for deletion */
  _deleted: boolean;
}

// ================================
// Component — Single-page edit form
// Sections: Logistics Info → Items (editable) → Note
// ================================

export default function EditShipmentModal({ isOpen, shipment, onClose, onSuccess }: EditShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- Editable state: logistics ---
  const [etaDate, setEtaDate] = useState('');
  const [pallets, setPallets] = useState<number>(0);
  const [totalWeight, setTotalWeight] = useState<number>(0);
  const [priceKg, setPriceKg] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [note, setNote] = useState('');

  // --- Editable state: items ---
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);

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
      setEditableItems(
        (shipment.items ?? []).map((item: ShipmentItemDetail) => ({
          id: item.id,
          poNum: item.poNum,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          poChange: item.poChange,
          _deleted: false,
        }))
      );
      setSuccess(false);
    }
  }, [isOpen, shipment]);

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const isDisabled = shipment?.isDeleted === true || shipment?.status === 'cancelled';
  const activeItems = editableItems.filter(i => !i._deleted);

  const fmt = (v: number | undefined | null, decimals = 2) => {
    if (v === undefined || v === null || isNaN(v)) return '-';
    return parseFloat(v.toFixed(decimals)).toString();
  };

  // --- Item edit helpers ---
  const updateItem = useCallback((index: number, field: keyof EditableItem, value: unknown) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }, []);

  const deleteItem = useCallback((index: number) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, _deleted: true } : item));
  }, []);

  const restoreItem = useCallback((index: number) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, _deleted: false } : item));
  }, []);

  // --- Dirty check ---
  const hasLogisticsChanges = useMemo(() => {
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

  const hasItemChanges = useMemo(() => {
    if (!shipment) return false;
    const originalItems = shipment.items ?? [];
    // Check if any items were deleted
    if (editableItems.some(i => i._deleted && i.id !== null)) return true;
    // Check if any items were added (id === null and not deleted)
    if (editableItems.some(i => i.id === null && !i._deleted)) return true;
    // Check if any existing items were modified
    for (const ei of editableItems) {
      if (ei._deleted || ei.id === null) continue;
      const orig = originalItems.find((o: ShipmentItemDetail) => o.id === ei.id);
      if (!orig) return true;
      if (ei.quantity !== orig.quantity || ei.poChange !== orig.poChange) return true;
    }
    return false;
  }, [shipment, editableItems]);

  const hasChanges = hasLogisticsChanges || hasItemChanges;

  // --- Real-time validation → drives submit button ---
  const isValid = useMemo(() => {
    if (!etaDate) return false;
    if (shipment?.sentDate && etaDate < shipment.sentDate) return false;
    if (totalWeight <= 0) return false;
    if (priceKg <= 0) return false;
    if (exchangeRate <= 0) return false;
    if (!note.trim()) return false;
    // Items: at least 1 active item with qty > 0
    if (activeItems.length === 0) return false;
    if (activeItems.some(i => i.quantity <= 0)) return false;
    return true;
  }, [etaDate, totalWeight, priceKg, exchangeRate, note, shipment, activeItems]);

  const canSubmit = isValid && hasChanges && !isDisabled;

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof purchaseApi.updateShipment>[1] = {
        etaDate: etaDate || undefined,
        pallets, totalWeight, priceKg, exchangeRate,
        note: note || undefined,
      };
      // Only send items if they changed
      if (hasItemChanges) {
        payload.items = activeItems.map(i => ({
          id: i.id ?? undefined,
          poNum: i.poNum,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          poChange: i.poChange,
        }));
      }
      return purchaseApi.updateShipment(shipment!.id, payload);
    },
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

      {/* Section: Items (editable) */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          {t('shipments.edit.items')}
          <span className="text-[10px] font-normal normal-case" style={{ color: colors.textTertiary }}>
            ({activeItems.length} {t('shipments.edit.activeItems')})
          </span>
        </h3>

        <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                <th className="text-left px-3 py-2.5 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                <th className="text-left px-3 py-2.5 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                <th className="text-right px-3 py-2.5 font-medium w-24" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                <th className="text-center px-3 py-2.5 font-medium w-16" style={{ color: colors.textSecondary }}>{t('shipments.create.isRounded')}</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {editableItems.map((item, idx) => (
                <tr key={item.id ?? `new-${idx}`}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                    opacity: item._deleted ? 0.35 : 1,
                    textDecoration: item._deleted ? 'line-through' : 'none',
                  }}>
                  <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                  <td className="px-3 py-2 text-right">
                    {item._deleted ? (
                      <span style={{ color: colors.textTertiary }}>{item.quantity}</span>
                    ) : (
                      <input type="number" min={0} value={item.quantity || ''}
                        disabled={isDisabled}
                        onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value, 10) || 0)}
                        className="w-20 h-7 px-2 border rounded text-sm text-right focus:outline-none"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: item.quantity > 0 ? colors.border : colors.red,
                          color: colors.text,
                        }} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: colors.text }}>
                    ${item.unitPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item._deleted ? (
                      <span style={{ color: colors.textTertiary }}>-</span>
                    ) : (
                      <input type="checkbox" checked={item.poChange}
                        disabled={isDisabled}
                        onChange={e => updateItem(idx, 'poChange', e.target.checked)}
                        className="w-4 h-4 rounded accent-blue-500" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item._deleted ? (
                      <button type="button" onClick={() => restoreItem(idx)} disabled={isDisabled}
                        className="text-xs font-medium px-2 py-1 rounded hover:opacity-80 transition-opacity"
                        style={{ color: colors.green }}>
                        ↩
                      </button>
                    ) : (
                      <button type="button" onClick={() => deleteItem(idx)} disabled={isDisabled}
                        className="text-xs font-medium px-2 py-1 rounded hover:opacity-80 transition-opacity"
                        style={{ color: colors.red }}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Item summary */}
        <div className="mt-2 flex items-center justify-between text-xs" style={{ color: colors.textTertiary }}>
          <span>
            {activeItems.length > 0 && (
              <>
                {activeItems.reduce((sum, i) => sum + i.quantity, 0)} pcs ·
                ${activeItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </>
            )}
          </span>
          {hasItemChanges && (
            <span style={{ color: colors.orange }}>{t('shipments.edit.itemsModified')}</span>
          )}
        </div>
      </div>

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
