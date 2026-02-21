'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment, type ShipmentItemDetail, type ShipmentAvailablePo, type ShipmentAvailablePoItem } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
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
  /** true = new item added from available POs */
  _isNew: boolean;
  /** V1 parity: ordered qty from PO */
  orderedQty: number;
  /** V1 parity: total shipped across ALL shipments (excluding this item's current qty for existing) */
  alreadySent: number;
}

// ================================
// Component
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

  // --- Add new item state ---
  const [showAddRow, setShowAddRow] = useState(false);
  const [addPoNum, setAddPoNum] = useState('');
  const [addSku, setAddSku] = useState('');
  const [addPrice, setAddPrice] = useState<number>(0);

  // --- UI state ---
  const [success, setSuccess] = useState(false);

  // --- Fetch available POs for adding new items ---
  const { data: availablePos } = useQuery({
    queryKey: ['availablePos', shipment?.sentDate],
    queryFn: () => purchaseApi.getAvailablePos(shipment?.sentDate || undefined),
    enabled: isOpen && !!shipment,
  });

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
          _isNew: false,
          orderedQty: item.orderedQty ?? 0,
          // alreadySent = totalShipped - this item's current qty
          alreadySent: (item.totalShipped ?? 0) - item.quantity,
        }))
      );
      setSuccess(false);
      setShowAddRow(false);
      setAddPoNum('');
      setAddSku('');
      setAddPrice(0);
    }
  }, [isOpen, shipment]);

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const activeItems = editableItems.filter(i => !i._deleted);

  // --- Item edit helpers ---
  const updateItem = useCallback((index: number, field: keyof EditableItem, value: unknown) => {
    setEditableItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // V1 parity: if qty is set to 0, auto-uncheck poChange
      if (field === 'quantity' && (value as number) === 0) {
        updated.poChange = false;
      }
      return updated;
    }));
  }, []);

  const deleteItem = useCallback((index: number) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, _deleted: true } : item));
  }, []);

  const restoreItem = useCallback((index: number) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, _deleted: false } : item));
  }, []);

  const removeNewItem = useCallback((index: number) => {
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  // --- Add new item from available POs ---
  const selectedPo = useMemo(() =>
    availablePos?.find(po => po.poNum === addPoNum), [availablePos, addPoNum]);

  // Filter out SKUs already in the current items list
  const availableSkus = useMemo(() => {
    if (!selectedPo) return [];
    const existingKeys = new Set(
      editableItems.filter(i => !i._deleted && i.poNum === addPoNum)
        .map(i => `${i.sku}|${i.unitPrice}`)
    );
    return selectedPo.items.filter(item =>
      item.remainingQty > 0 && !existingKeys.has(`${item.sku}|${item.unitPrice}`)
    );
  }, [selectedPo, editableItems, addPoNum]);

  const selectedSkuItem = useMemo(() =>
    availableSkus.find(s => s.sku === addSku && (addPrice === 0 || s.unitPrice === addPrice)),
    [availableSkus, addSku, addPrice]);

  const handleAddItem = useCallback(() => {
    if (!selectedSkuItem || !addPoNum) return;
    const newItem: EditableItem = {
      id: null,
      poNum: addPoNum,
      sku: selectedSkuItem.sku,
      quantity: 0,
      unitPrice: selectedSkuItem.unitPrice,
      poChange: false,
      _deleted: false,
      _isNew: true,
      orderedQty: selectedSkuItem.orderedQty,
      alreadySent: selectedSkuItem.shippedQty,
    };
    setEditableItems(prev => [...prev, newItem]);
    setShowAddRow(false);
    setAddPoNum('');
    setAddSku('');
    setAddPrice(0);
  }, [addPoNum, selectedSkuItem]);

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
    if (editableItems.some(i => i._deleted && i.id !== null)) return true;
    if (editableItems.some(i => i._isNew && !i._deleted)) return true;
    for (const ei of editableItems) {
      if (ei._deleted || ei._isNew) continue;
      const orig = originalItems.find((o: ShipmentItemDetail) => o.id === ei.id);
      if (!orig) return true;
      if (ei.quantity !== orig.quantity || ei.poChange !== orig.poChange) return true;
    }
    return false;
  }, [shipment, editableItems]);

  const hasChanges = hasLogisticsChanges || hasItemChanges;

  // --- Validation ---
  const isValid = useMemo(() => {
    if (!etaDate) return false;
    if (shipment?.sentDate && etaDate < shipment.sentDate) return false;
    if (totalWeight <= 0) return false;
    if (priceKg <= 0) return false;
    if (exchangeRate <= 0) return false;
    if (!note.trim()) return false;
    if (activeItems.length === 0) return false;
    if (activeItems.some(i => i.quantity <= 0)) return false;
    return true;
  }, [etaDate, totalWeight, priceKg, exchangeRate, note, shipment, activeItems]);

  const canSubmit = isValid && hasChanges;

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: (secCode: string) => {
      const payload: Parameters<typeof purchaseApi.updateShipment>[1] = {
        etaDate: etaDate || undefined,
        pallets, totalWeight, priceKg, exchangeRate,
        note: note || undefined,
        sec_code_l3: secCode,
      };
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
      editSecurity.onCancel();
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
    onError: () => {
      editSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const editSecurity = useSecurityAction({
    actionKey: 'btn_edit_send',
    level: 'L3',
    onExecute: (code) => updateMutation.mutate(code),
  });

  const handleSubmit = () => {
    if (canSubmit) {
      editSecurity.trigger();
    }
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

  const inputCls = "w-full h-9 px-3 border rounded-lg text-sm focus:outline-none disabled:opacity-40";
  const inputStyle = { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text };

  return (
    <>
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
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.etaDate')}</label>
            <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)}
              className={inputCls} style={{ ...inputStyle, borderColor: etaDate && !(shipment?.sentDate && etaDate < shipment.sentDate) ? colors.border : colors.red }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.pallets')}</label>
            <input type="number" value={pallets || ''} onChange={e => setPallets(parseInt(e.target.value, 10) || 0)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.edit.totalWeight')}</label>
            <input type="number" step="0.01" value={totalWeight || ''} onChange={e => setTotalWeight(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: totalWeight > 0 ? colors.border : colors.red }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.edit.priceKg')}</label>
            <input type="number" step="0.0001" value={priceKg || ''} onChange={e => setPriceKg(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: priceKg > 0 ? colors.border : colors.red }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.exchangeRate')}</label>
            <input type="number" step="0.0001" value={exchangeRate || ''} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
              className={inputCls} style={{ ...inputStyle, borderColor: exchangeRate > 0 ? colors.border : colors.red }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.detail.logisticsCost')}</label>
            <div className="h-9 px-3 flex items-center rounded-lg text-sm font-mono" style={{ backgroundColor: colors.bgTertiary, color: colors.blue }}>
              ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Items (editable) */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {t('shipments.edit.items')}
            <span className="text-[10px] font-normal normal-case" style={{ color: colors.textTertiary }}>
              ({activeItems.length} {t('shipments.edit.activeItems')})
            </span>
          </h3>
          <button type="button" onClick={() => setShowAddRow(!showAddRow)}
            className="text-xs font-medium px-3 py-1 rounded-lg hover:opacity-80 transition-opacity flex items-center gap-1"
            style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('shipments.create.itemsManual')}
          </button>
        </div>

        {/* Add new item panel */}
        {showAddRow && (
          <div className="mb-3 p-3 rounded-lg border" style={{ borderColor: colors.green, backgroundColor: `${colors.green}08` }}>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {/* PO selector */}
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: colors.textSecondary }}>PO#</label>
                <select value={addPoNum} onChange={e => { setAddPoNum(e.target.value); setAddSku(''); setAddPrice(0); }}
                  className="w-full h-7 px-2 border rounded text-xs focus:outline-none"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}>
                  <option value="">—</option>
                  {(availablePos ?? []).map(po => (
                    <option key={po.poNum} value={po.poNum}>{po.poNum}</option>
                  ))}
                </select>
              </div>
              {/* SKU selector */}
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: colors.textSecondary }}>SKU</label>
                <select value={addSku} onChange={e => { setAddSku(e.target.value); const item = availableSkus.find(s => s.sku === e.target.value); if (item) setAddPrice(item.unitPrice); }}
                  disabled={!addPoNum}
                  className="w-full h-7 px-2 border rounded text-xs focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}>
                  <option value="">—</option>
                  {availableSkus.map(item => (
                    <option key={`${item.sku}-${item.unitPrice}`} value={item.sku}>
                      {item.sku} ({t('shipments.create.remaining')}: {item.remainingQty})
                    </option>
                  ))}
                </select>
              </div>
              {/* Confirm */}
              <div className="flex items-end">
                <button type="button" onClick={handleAddItem} disabled={!selectedSkuItem}
                  className="h-7 px-3 text-xs font-medium rounded text-white hover:opacity-90 transition-opacity disabled:opacity-30"
                  style={{ backgroundColor: colors.green }}>
                  {t('orders.create.addRow')}
                </button>
                <button type="button" onClick={() => setShowAddRow(false)}
                  className="h-7 px-2 text-xs ml-1 hover:opacity-70 transition-opacity"
                  style={{ color: colors.textTertiary }}>✕</button>
              </div>
            </div>
            {selectedSkuItem && (
              <div className="text-[10px] font-mono" style={{ color: colors.textTertiary }}>
                ${selectedSkuItem.unitPrice.toFixed(2)} · {t('shipments.detail.qty')}: {selectedSkuItem.orderedQty} · sent: {selectedSkuItem.shippedQty} · remaining: {selectedSkuItem.remainingQty}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>PO#</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>SKU</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>{t('shipments.detail.unitPrice')}</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>{t('shipments.create.ordered')}</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>{t('shipments.create.shipped')}</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap w-20" style={{ color: colors.textSecondary }}>{t('shipments.detail.qty')}</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap" style={{ color: colors.textSecondary }}>{t('shipments.create.remaining')}</th>
                  <th className="text-center px-2 py-2 font-medium whitespace-nowrap w-12" style={{ color: colors.textSecondary }}>{t('shipments.create.isRounded')}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {editableItems.map((item, idx) => {
                  const remaining = item.orderedQty - item.alreadySent - item.quantity;
                  const isNegative = remaining < 0;
                  return (
                    <tr key={item.id ?? `new-${idx}`}
                      style={{
                        borderTop: `1px solid ${colors.border}`,
                        opacity: item._deleted ? 0.35 : 1,
                        textDecoration: item._deleted ? 'line-through' : 'none',
                      }}>
                      {/* PO# */}
                      <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: colors.blue }}>{item.poNum}</td>
                      {/* SKU - read-only */}
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: colors.text }}>{item.sku}</td>
                      {/* Unit Price - read-only */}
                      <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap" style={{ color: colors.text }}>
                        ${item.unitPrice.toFixed(2)}
                      </td>
                      {/* Ordered Qty */}
                      <td className="px-2 py-1.5 text-center" style={{ color: colors.textSecondary }}>
                        {item.orderedQty || '-'}
                      </td>
                      {/* Already Sent */}
                      <td className="px-2 py-1.5 text-center" style={{ color: colors.textSecondary }}>
                        {item.alreadySent >= 0 ? item.alreadySent : '-'}
                      </td>
                      {/* Editable Qty */}
                      <td className="px-2 py-1.5 text-center">
                        {item._deleted ? (
                          <span style={{ color: colors.textTertiary }}>{item.quantity}</span>
                        ) : (
                          <input type="number" min={0} value={item.quantity || ''}
                            onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value, 10) || 0)}
                            className="w-16 h-6 px-1 border rounded text-xs text-center focus:outline-none"
                            style={{
                              backgroundColor: colors.bgSecondary,
                              borderColor: item.quantity > 0 ? colors.border : colors.red,
                              color: colors.text,
                            }} />
                        )}
                      </td>
                      {/* Remaining (dynamic) */}
                      <td className="px-2 py-1.5 text-center font-medium whitespace-nowrap"
                        style={{ color: isNegative ? colors.orange : colors.textSecondary }}>
                        {item._deleted ? '-' : remaining}
                      </td>
                      {/* Rounded (poChange) */}
                      <td className="px-2 py-1.5 text-center">
                        {item._deleted ? (
                          <span style={{ color: colors.textTertiary }}>-</span>
                        ) : (
                          <input type="checkbox" checked={item.poChange}
                            disabled={item.quantity <= 0}
                            onChange={e => updateItem(idx, 'poChange', e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-green-500 disabled:opacity-30" />
                        )}
                      </td>
                      {/* Action */}
                      <td className="px-2 py-1.5 text-center">
                        {item._deleted ? (
                          <button type="button" onClick={() => restoreItem(idx)}
                            className="text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: colors.green }}>↩</button>
                        ) : item._isNew ? (
                          <button type="button" onClick={() => removeNewItem(idx)}
                            className="text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: colors.red }}>✕</button>
                        ) : (
                          <button type="button" onClick={() => deleteItem(idx)}
                            className="text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: colors.red }}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder={t('shipments.edit.notePlaceholder')} rows={3}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none resize-none"
          style={{ backgroundColor: colors.bgSecondary, borderColor: note.trim() ? colors.border : colors.red, color: colors.text }} />
      </div>
    </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={editSecurity.isOpen}
        level={editSecurity.level}
        title={t('shipments.edit.securityTitle')}
        description={t('shipments.edit.securityDescription')}
        onConfirm={editSecurity.onConfirm}
        onCancel={editSecurity.onCancel}
        isLoading={updateMutation.isPending}
        error={editSecurity.error}
      />
    </>
  );
}
