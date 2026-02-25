'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type PurchaseOrder } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';
import SkuAutocomplete from '../../../purchase/components/SkuAutocomplete';

// ================================
// Types
// ================================

interface EditPOModalProps {
  isOpen: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditItem {
  id: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  isNew: boolean;
  removed: boolean;
}

// ================================
// Helpers
// ================================

let _editItemCounter = 0;

function buildEditItems(order: PurchaseOrder): EditItem[] {
  return (order.items ?? []).map((item) => ({
    id: `existing-${item.id}`,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    isNew: false,
    removed: false,
  }));
}

function createEmptyItem(): EditItem {
  _editItemCounter += 1;
  return {
    id: `new-${Date.now()}-${_editItemCounter}`,
    sku: '',
    quantity: 0,
    unitPrice: 0,
    isNew: true,
    removed: false,
  };
}

// ================================
// Component
// ================================

export default function EditPOModal({ isOpen, order, onClose, onSuccess }: EditPOModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // V1 parity: fetch SKU list for dropdown
  const { data: rawSkuList = [] } = useQuery({
    queryKey: ['skuList'],
    queryFn: () => purchaseApi.getSkuList(),
    enabled: isOpen,
  });

  // Deduplicate SKU list by sku value (fix: some backends return duplicates)
  const skuList = useMemo(() => {
    const seen = new Set<string>();
    return (Array.isArray(rawSkuList) ? rawSkuList : []).filter((s) => {
      const key = s.sku.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawSkuList]);

  // --- State ---
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [orderNote, setOrderNote] = useState(''); // Order-level note
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  // V1 parity: strategy editing
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editExchangeRate, setEditExchangeRate] = useState(7.0);
  const [editFloatEnabled, setEditFloatEnabled] = useState(false);
  const [editFloatThreshold, setEditFloatThreshold] = useState(0);
  const [editDepositEnabled, setEditDepositEnabled] = useState(false);
  const [editDepositRatio, setEditDepositRatio] = useState(0);

  // --- Snapshot of original state for dirty checking ---
  const [originalSnapshot, setOriginalSnapshot] = useState('');

  // --- Reset on open ---
  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (isOpen && order) {
      const items = buildEditItems(order);
      setEditItems(items);
      setOrderNote('');
      setErrors({});
      setSuccess(false);
      // Initialize strategy editing state
      const s = order.strategy;
      const initCurrency = s?.currency || 'USD';
      const initRate = s?.exchangeRate || 7.0;
      const initFloat = s?.floatEnabled || false;
      const initFloatThreshold = s?.floatThreshold || 0;
      const initDeposit = s?.requireDeposit || false;
      const initDepositRatio = s?.depositRatio || 0;
      setEditCurrency(initCurrency);
      setEditExchangeRate(initRate);
      setEditFloatEnabled(initFloat);
      setEditFloatThreshold(initFloatThreshold);
      setEditDepositEnabled(initDeposit);
      setEditDepositRatio(initDepositRatio);
      // Build snapshot for dirty checking
      setOriginalSnapshot(JSON.stringify({
        items: items.filter(i => !i.removed).map(i => ({ sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice })),
        note: '',
        currency: initCurrency,
        exchangeRate: initRate,
        floatEnabled: initFloat,
        floatThreshold: initFloatThreshold,
        depositEnabled: initDeposit,
        depositRatio: initDepositRatio,
      }));
    }
  }, [isOpen, order]);

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

  // --- Dirty check: has anything changed from original? ---
  const currentSnapshot = useMemo(() => {
    return JSON.stringify({
      items: editItems.filter(i => !i.removed).map(i => ({ sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice })),
      note: orderNote,
      currency: editCurrency,
      exchangeRate: editExchangeRate,
      floatEnabled: editFloatEnabled,
      floatThreshold: editFloatThreshold,
      depositEnabled: editDepositEnabled,
      depositRatio: editDepositRatio,
    });
  }, [editItems, orderNote, editCurrency, editExchangeRate, editFloatEnabled, editFloatThreshold, editDepositEnabled, editDepositRatio]);

  const hasChanges = currentSnapshot !== originalSnapshot;

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.updateOrder(order!.id, {
        items: editItems
          .filter((i) => !i.removed)
          .map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            currency: editCurrency,
            exchangeRate: editExchangeRate,
            note: orderNote || undefined,
          })),
        strategy: {
          strategyDate: order!.poDate,
          currency: editCurrency,
          exchangeRate: editExchangeRate,
          rateMode: order!.strategy?.rateMode || 'manual',
          floatEnabled: editFloatEnabled,
          floatThreshold: editFloatThreshold,
          requireDeposit: editDepositEnabled,
          depositRatio: editDepositRatio,
          note: orderNote || undefined,
        },
        sec_code_l3: secCode,
      }),
    onSuccess: () => {
      setSuccess(true);
      editSecurity.onCancel();
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
    onError: () => {
      editSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const editSecurity = useSecurityAction({
    actionKey: 'btn_po_modify',
    level: 'L3',
    onExecute: (code) => updateMutation.mutate(code),
  });

  // --- Item operations ---
  const updateItem = (id: string, field: keyof EditItem, value: string | number | boolean) => {
    setEditItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
    // Clear field-level error
    if (errors[`${id}.${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${id}.${field}`];
        return next;
      });
    }
    // Clear global errors on any edit
    if (errors.global) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.global;
        return next;
      });
    }
  };

  const removeItem = (id: string) => {
    setEditItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      if (item.isNew) return prev.filter((i) => i.id !== id);
      return prev.map((i) => (i.id === id ? { ...i, removed: true } : i));
    });
  };

  const addItem = () => {
    setEditItems((prev) => [...prev, createEmptyItem()]);
  };

  // --- Validation ---
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const activeItems = editItems.filter((i) => !i.removed);

    if (activeItems.length === 0) {
      newErrors.global = t('orders.errors.noItems');
    }

    const validSkuSet = new Set(skuList.map((s) => s.sku.toUpperCase()));

    activeItems.forEach((item) => {
      // SKU is always required
      if (!item.sku.trim()) {
        newErrors[`${item.id}.sku`] = t('orders.errors.skuRequired');
      } else if (item.isNew && validSkuSet.size > 0 && !validSkuSet.has(item.sku.trim().toUpperCase())) {
        newErrors[`${item.id}.sku`] = t('orders.errors.skuNotFound');
      }
      // Quantity must be > 0
      if (!item.quantity || item.quantity <= 0) {
        newErrors[`${item.id}.quantity`] = t('orders.errors.qtyPositive');
      }
      // Unit price must be > 0
      if (!item.unitPrice || item.unitPrice <= 0) {
        newErrors[`${item.id}.unitPrice`] = t('orders.errors.pricePositive');
      }
    });

    // Strategy validation
    if (editExchangeRate <= 0) {
      newErrors.exchangeRate = t('orders.errors.ratePositive');
    }
    if (editFloatEnabled && (editFloatThreshold <= 0 || editFloatThreshold > 10)) {
      newErrors.floatThreshold = t('errors.floatThresholdInvalid');
    }
    if (editDepositEnabled && editDepositRatio <= 0) {
      newErrors.depositRatio = t('errors.depositRatioInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = () => {
    if (!validate()) return;
    editSecurity.trigger();
  };

  // --- Computed values ---
  const activeItems = editItems.filter((i) => !i.removed);
  const totalAmount = activeItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const currency = editCurrency;
  const exchangeRate = editExchangeRate;
  const isCancelled = order?.status === 'cancelled' || order?.isDeleted === true;

  // --- Early return ---
  if (!isOpen || !order) return null;

  // --- Success state ---
  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('orders.edit.success')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('orders.edit.success')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{order.poNum}</p>
        </div>
      </ModalShell>
    );
  }

  // ================================
  // Main render
  // ================================

  return (
    <>
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('orders.edit.title')}
      subtitle={`${order.poNum} — ${order.supplierCode}`}
      footerLeft={
        <div className="text-xs" style={{ color: hasChanges ? colors.orange : colors.textTertiary }}>
          {hasChanges ? '' : t('orders.edit.noChanges')}
        </div>
      }
      footerRight={
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
            {tCommon('cancel')}
          </button>
          <button type="button" onClick={handleSubmit} disabled={isCancelled || updateMutation.isPending || !hasChanges}
            className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: hasChanges ? colors.blue : colors.textTertiary }}>
            {updateMutation.isPending ? '...' : t('orders.edit.submit')}
          </button>
        </div>
      }
    >
        <div>
          {/* Global error */}
          {errors.global && (
            <div
              className="mb-4 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: `${colors.red}15`, color: colors.red }}
            >
              {errors.global}
            </div>
          )}

          {/* V1 parity: Strategy editing section */}
          <div className="mb-5 p-4 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
              {t('orders.detail.strategyInfo')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Currency */}
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('orders.detail.currency')}</label>
                <div className="flex gap-2">
                  {['USD', 'RMB'].map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      disabled={isCancelled}
                      onClick={() => setEditCurrency(cur)}
                      className="px-3 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-40"
                      style={{
                        backgroundColor: editCurrency === cur ? `${colors.blue}15` : 'transparent',
                        borderColor: editCurrency === cur ? colors.blue : colors.border,
                        color: editCurrency === cur ? colors.blue : colors.textSecondary,
                      }}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
              {/* Exchange Rate */}
              <div>
                <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('orders.detail.exchangeRate')}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editExchangeRate || ''}
                  disabled={isCancelled}
                  onChange={(e) => setEditExchangeRate(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: colors.bg, borderColor: errors.exchangeRate ? colors.red : colors.border, color: colors.text }}
                />
              </div>
              {/* Float */}
              <div className="flex items-center justify-between">
                <label className="text-xs" style={{ color: colors.textSecondary }}>{t('orders.detail.floatEnabled')}</label>
                <button
                  type="button"
                  disabled={isCancelled}
                  onClick={() => { setEditFloatEnabled(!editFloatEnabled); if (editFloatEnabled) setEditFloatThreshold(0); }}
                  className="relative w-9 h-5 rounded-full transition-colors disabled:opacity-40"
                  style={{ backgroundColor: editFloatEnabled ? colors.green : colors.bg }}
                >
                  <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: editFloatEnabled ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>
              {editFloatEnabled && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('orders.detail.floatThreshold')} (%)</label>
                  <input type="number" value={editFloatThreshold || ''} disabled={isCancelled} onChange={(e) => setEditFloatThreshold(parseFloat(e.target.value) || 0)} className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40" style={{ backgroundColor: colors.bg, borderColor: errors.floatThreshold ? colors.red : colors.border, color: colors.text }} />
                </div>
              )}
              {/* Deposit */}
              <div className="flex items-center justify-between">
                <label className="text-xs" style={{ color: colors.textSecondary }}>{t('orders.detail.depositEnabled')}</label>
                <button
                  type="button"
                  disabled={isCancelled}
                  onClick={() => { setEditDepositEnabled(!editDepositEnabled); if (editDepositEnabled) setEditDepositRatio(0); }}
                  className="relative w-9 h-5 rounded-full transition-colors disabled:opacity-40"
                  style={{ backgroundColor: editDepositEnabled ? colors.green : colors.bg }}
                >
                  <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: editDepositEnabled ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>
              {editDepositEnabled && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>{t('orders.detail.depositRatio')} (%)</label>
                  <input type="number" value={editDepositRatio || ''} disabled={isCancelled} onChange={(e) => setEditDepositRatio(parseFloat(e.target.value) || 0)} className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40" style={{ backgroundColor: colors.bg, borderColor: errors.depositRatio ? colors.red : colors.border, color: colors.text }} />
                </div>
              )}
            </div>
          </div>

          {/* Items header */}
          <div className="mb-3">
            <h3 className="text-sm font-medium" style={{ color: colors.text }}>
              {t('orders.edit.currentItems')}
            </h3>
          </div>

          {/* Items table */}
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  <th className="text-left px-3 py-2 font-medium text-xs" style={{ color: colors.textSecondary }}>SKU</th>
                  <th className="text-right px-3 py-2 font-medium text-xs w-24" style={{ color: colors.textSecondary }}>{t('orders.detail.qty')}</th>
                  <th className="text-right px-3 py-2 font-medium text-xs w-28" style={{ color: colors.textSecondary }}>{t('orders.detail.unitPrice')}</th>
                  <th className="text-right px-3 py-2 font-medium text-xs w-28" style={{ color: colors.textSecondary }}>{t('orders.detail.amount')}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item) => {
                  if (item.removed) return null;
                  const amt = item.quantity > 0 && item.unitPrice > 0 ? (item.quantity * item.unitPrice).toFixed(2) : '-';
                  return (
                    <tr key={item.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td className="px-3 py-1.5">
                        {item.isNew ? (
                          <SkuAutocomplete
                            value={item.sku}
                            onChange={v => updateItem(item.id, 'sku', v)}
                            options={skuList}
                            disabled={isCancelled}
                            placeholder={t('orders.create.skuPlaceholder')}
                            hasError={!!errors[`${item.id}.sku`]}
                            className="w-full h-7 px-2 border rounded text-xs font-mono focus:outline-none"
                            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
                          />
                        ) : (
                          <span className="text-xs font-mono" style={{ color: colors.text, opacity: 0.7 }}>{item.sku}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" min={1}
                          value={item.quantity || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            updateItem(item.id, 'quantity', isNaN(val) ? 0 : val);
                          }}
                          disabled={isCancelled}
                          className="w-full h-7 px-2 border rounded text-xs text-right focus:outline-none disabled:opacity-50"
                          style={{
                            backgroundColor: colors.bgSecondary,
                            borderColor: errors[`${item.id}.quantity`] ? colors.red : colors.border,
                            color: colors.text,
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" min={0.01} step={0.01}
                          value={item.unitPrice || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            updateItem(item.id, 'unitPrice', isNaN(val) ? 0 : val);
                          }}
                          disabled={isCancelled}
                          className="w-full h-7 px-2 border rounded text-xs text-right focus:outline-none disabled:opacity-50"
                          style={{
                            backgroundColor: colors.bgSecondary,
                            borderColor: errors[`${item.id}.unitPrice`] ? colors.red : colors.border,
                            color: colors.text,
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs" style={{ color: colors.text }}>
                        {amt !== '-' ? `${amt} ${currency}` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {activeItems.length > 1 && (
                          <button type="button" onClick={() => removeItem(item.id)}
                            disabled={isCancelled}
                            className="text-xs hover:opacity-70 transition-opacity disabled:opacity-30"
                            style={{ color: colors.red }}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Item button */}
          {!isCancelled && (
            <button
              type="button"
              onClick={addItem}
              className="w-full mt-3 h-8 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
              style={{ backgroundColor: colors.bgTertiary, color: colors.blue }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('orders.edit.addItem')}
            </button>
          )}

          {/* Order-level Note */}
          <div className="mt-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
              {t('orders.detail.note')}
            </label>
            <input
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              disabled={isCancelled}
              placeholder={t('orders.create.notePlaceholder')}
              className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
            />
          </div>

          {/* Totals */}
          <div
            className="mt-4 p-3 rounded-xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.bgTertiary }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                {t('orders.detail.totalAmount')} ({activeItems.length} {t('orders.detail.sku')})
              </span>
              <span className="text-base font-semibold" style={{ color: colors.text }}>
                {totalAmount.toFixed(2)} {currency}
              </span>
            </div>
            {currency === 'USD' && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.totalRMB')}
                </span>
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  {(totalAmount * exchangeRate).toFixed(2)} RMB
                </span>
              </div>
            )}
          </div>
        </div>
    </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={editSecurity.isOpen}
        level={editSecurity.level}
        title={t('orders.edit.securityTitle')}
        description={t('orders.edit.securityDescription')}
        onConfirm={editSecurity.onConfirm}
        onCancel={editSecurity.onCancel}
        isLoading={updateMutation.isPending}
        error={editSecurity.error}
      />
    </>
  );
}
