'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type PurchaseOrder } from '@/lib/api';

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
  note: string;
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
    note: item.note ?? '',
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
    note: '',
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
  const { data: skuList = [] } = useQuery({
    queryKey: ['skuList'],
    queryFn: () => purchaseApi.getSkuList(),
    enabled: isOpen,
  });

  // --- State ---
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  // V1 parity: strategy editing
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editExchangeRate, setEditExchangeRate] = useState(7.0);
  const [editFloatEnabled, setEditFloatEnabled] = useState(false);
  const [editFloatThreshold, setEditFloatThreshold] = useState(0);
  const [editDepositEnabled, setEditDepositEnabled] = useState(false);
  const [editDepositRatio, setEditDepositRatio] = useState(0);

  // --- Reset on open (same pattern as AddSupplierModal) ---
  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (isOpen && order) {
      setEditItems(buildEditItems(order));
      setErrors({});
      setSuccess(false);
      // Initialize strategy editing state
      const s = order.strategy;
      setEditCurrency(s?.currency || 'USD');
      setEditExchangeRate(s?.exchangeRate || 7.0);
      setEditFloatEnabled(s?.floatEnabled || false);
      setEditFloatThreshold(s?.floatThreshold || 0);
      setEditDepositEnabled(s?.requireDeposit || false);
      setEditDepositRatio(s?.depositRatio || 0);
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

  // --- Mutation ---
  const updateMutation = useMutation({
    mutationFn: () =>
      purchaseApi.updateOrder(order!.id, {
        items: editItems
          .filter((i) => !i.removed)
          .map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            currency: editCurrency,
            exchangeRate: editExchangeRate,
            note: i.note || undefined,
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
        },
      }),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
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
      // If it's a new item, just filter it out
      if (item.isNew) return prev.filter((i) => i.id !== id);
      // Otherwise mark as removed
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
      if (!item.sku.trim()) {
        newErrors[`${item.id}.sku`] = t('orders.errors.skuRequired');
      } else if (item.isNew && validSkuSet.size > 0 && !validSkuSet.has(item.sku.trim().toUpperCase())) {
        newErrors[`${item.id}.sku`] = t('orders.errors.skuNotFound');
      }
      if (item.quantity <= 0) {
        newErrors[`${item.id}.quantity`] = t('orders.errors.qtyPositive');
      }
      if (item.unitPrice <= 0) {
        newErrors[`${item.id}.unitPrice`] = t('orders.errors.pricePositive');
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = () => {
    if (!validate()) return;
    updateMutation.mutate();
  };

  // --- Computed values ---
  const activeItems = editItems.filter((i) => !i.removed);
  const totalAmount = activeItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  // V1 parity: use editable strategy values for totals calculation
  const currency = editCurrency;
  const exchangeRate = editExchangeRate;
  const isCancelled = order?.status === 'cancelled' || order?.isDeleted === true;

  // --- Early return ---
  if (!isOpen || !order) return null;

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
            {t('orders.edit.success')}
          </h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {order.poNum}
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
              {t('orders.edit.title')}
            </h2>
            <p className="text-sm font-mono mt-0.5" style={{ color: colors.textSecondary }}>
              {order.poNum} &mdash; {order.supplierCode}
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
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
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
                  <input type="number" value={editFloatThreshold || ''} disabled={isCancelled} onChange={(e) => setEditFloatThreshold(parseFloat(e.target.value) || 0)} className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
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
                  <input type="number" value={editDepositRatio || ''} disabled={isCancelled} onChange={(e) => setEditDepositRatio(parseFloat(e.target.value) || 0)} className="w-full h-8 px-2 border rounded text-sm focus:outline-none disabled:opacity-40" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
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
          <div className="space-y-3">
            {editItems.map((item) => {
              if (item.removed) return null;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border p-3"
                  style={{ borderColor: colors.border, backgroundColor: colors.bgTertiary }}
                >
                  {/* Row 1: SKU + Remove */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        {t('orders.detail.sku')}
                      </label>
                      <input
                        type="text"
                        list={item.isNew ? `edit-sku-list-${item.id}` : undefined}
                        value={item.sku}
                        onChange={(e) => updateItem(item.id, 'sku', e.target.value.toUpperCase())}
                        disabled={isCancelled || !item.isNew}
                        placeholder={t('orders.create.skuPlaceholder')}
                        className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
                        style={{
                          backgroundColor: !item.isNew ? `${colors.bgTertiary}80` : colors.bgSecondary,
                          borderColor: errors[`${item.id}.sku`] ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      {item.isNew && (
                        <datalist id={`edit-sku-list-${item.id}`}>
                          {skuList.map((s) => (
                            <option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>
                          ))}
                        </datalist>
                      )}
                      {errors[`${item.id}.sku`] && (
                        <p className="mt-1 text-xs" style={{ color: colors.red }}>
                          {errors[`${item.id}.sku`]}
                        </p>
                      )}
                    </div>

                    {/* Remove button */}
                    <div className="pt-5">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={isCancelled || activeItems.length <= 1}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-30"
                        style={{ backgroundColor: `${colors.red}15` }}
                        title={t('orders.edit.remove')}
                      >
                        <svg className="w-4 h-4" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Quantity + Unit Price */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        {t('orders.detail.qty')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateItem(item.id, 'quantity', isNaN(val) ? 0 : val);
                        }}
                        disabled={isCancelled}
                        placeholder={t('orders.create.qtyPlaceholder')}
                        className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: errors[`${item.id}.quantity`] ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      {errors[`${item.id}.quantity`] && (
                        <p className="mt-1 text-xs" style={{ color: colors.red }}>
                          {errors[`${item.id}.quantity`]}
                        </p>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        {t('orders.detail.unitPrice')}
                      </label>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={item.unitPrice || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updateItem(item.id, 'unitPrice', isNaN(val) ? 0 : val);
                        }}
                        disabled={isCancelled}
                        placeholder={t('orders.create.pricePlaceholder')}
                        className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: errors[`${item.id}.unitPrice`] ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      {errors[`${item.id}.unitPrice`] && (
                        <p className="mt-1 text-xs" style={{ color: colors.red }}>
                          {errors[`${item.id}.unitPrice`]}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Note */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      {t('orders.detail.note')}
                    </label>
                    <input
                      type="text"
                      value={item.note}
                      onChange={(e) => updateItem(item.id, 'note', e.target.value)}
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

                  {/* Line amount */}
                  {item.quantity > 0 && item.unitPrice > 0 && (
                    <div className="mt-2 text-right">
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {t('orders.detail.amount')}:{' '}
                      </span>
                      <span className="text-sm font-medium" style={{ color: colors.text }}>
                        {(item.quantity * item.unitPrice).toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Item button */}
          {!isCancelled && (
            <button
              type="button"
              onClick={addItem}
              className="w-full mt-3 h-10 border-2 border-dashed rounded-xl text-sm font-medium hover:opacity-70 transition-opacity"
              style={{ borderColor: colors.border, color: colors.textSecondary }}
            >
              + {t('orders.edit.addItem')}
            </button>
          )}

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
            disabled={isCancelled || updateMutation.isPending}
            className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: colors.blue }}
          >
            {updateMutation.isPending ? '...' : t('orders.edit.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
