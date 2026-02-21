'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Supplier, type SupplierStrategy } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import * as XLSX from 'xlsx';
import ModalShell from '../../../purchase/components/ModalShell';

// ================================
// Types
// ================================

interface CreatePOModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemRow {
  id: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  note: string;
}

type RateMode = 'auto' | 'manual';
type ItemEntryMode = 'manual' | 'excel';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFutureDate(dateStr: string): boolean {
  return dateStr > formatDate(new Date());
}

// ================================
// Single-page Create PO form
// Sections: Basic Info → Strategy → Exchange Rate → Items
// Validation: inline borders + submit button disabled
// ================================

export default function CreatePOModal({ isOpen, onClose, onSuccess }: CreatePOModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [orderDate, setOrderDate] = useState(formatDate(new Date()));
  const [strategy, setStrategy] = useState<SupplierStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [useOriginalStrategy, setUseOriginalStrategy] = useState(true);
  const [customCurrency, setCustomCurrency] = useState<string>('USD');
  const [customFloatEnabled, setCustomFloatEnabled] = useState(false);
  const [customFloatThreshold, setCustomFloatThreshold] = useState<number>(0);
  const [customDepositEnabled, setCustomDepositEnabled] = useState(false);
  const [customDepositRatio, setCustomDepositRatio] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [rateMode, setRateMode] = useState<RateMode>('auto');
  const [rateSource, setRateSource] = useState<string>('');
  const [rateFetching, setRateFetching] = useState(false);
  const [rateFetchFailed, setRateFetchFailed] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([
    { id: generateId(), sku: '', quantity: 0, unitPrice: 0, note: '' },
  ]);
  const [itemEntryMode, setItemEntryMode] = useState<ItemEntryMode>('manual');
  const [excelParseMessage, setExcelParseMessage] = useState<string>('');
  const [excelParseError, setExcelParseError] = useState(false);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Fetch active suppliers ---
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['activeSuppliers'],
    queryFn: () => purchaseApi.getActiveSuppliers(),
    enabled: isOpen,
  });

  // V1 parity: fetch SKU list for dropdown
  const { data: rawSkuList = [] } = useQuery({
    queryKey: ['skuList'],
    queryFn: () => purchaseApi.getSkuList(),
    enabled: isOpen,
  });

  const skuList = useMemo(() => {
    const seen = new Set<string>();
    return (Array.isArray(rawSkuList) ? rawSkuList : []).filter((s) => {
      const key = s.sku.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawSkuList]);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen) {
      setSelectedSupplier(null);
      setOrderDate(formatDate(new Date()));
      setStrategy(null);
      setStrategyLoading(false);
      setExchangeRate(0);
      setRateMode('auto');
      setRateSource('');
      setRateFetching(false);
      setRateFetchFailed(false);
      setUseOriginalStrategy(true);
      setCustomCurrency('USD');
      setCustomFloatEnabled(false);
      setCustomFloatThreshold(0);
      setCustomDepositEnabled(false);
      setCustomDepositRatio(0);
      setItems([{ id: generateId(), sku: '', quantity: 0, unitPrice: 0, note: '' }]);
      setItemEntryMode('manual');
      setExcelParseMessage('');
      setExcelParseError(false);
      setShowSecurityDialog(false);
      setSecurityError(undefined);
      setSuccess(false);
    }
  }, [isOpen]);

  // --- Auto-fetch strategy when supplier selected ---
  const fetchStrategy = useCallback(async (supplierCode: string, date: string) => {
    setStrategyLoading(true);
    try {
      const result = await purchaseApi.getEffectiveStrategy(supplierCode, date);
      setStrategy(result);
    } catch {
      setStrategy(null);
    } finally {
      setStrategyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && selectedSupplier && orderDate) {
      fetchStrategy(selectedSupplier.supplierCode, orderDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedSupplier, orderDate]);

  // --- Fetch exchange rate ---
  const fetchExchangeRate = useCallback(async (date: string) => {
    if (isFutureDate(date)) { setRateMode('manual'); setRateFetchFailed(false); setRateSource(''); return; }
    setRateFetching(true); setRateFetchFailed(false); setRateSource('');
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
      if (res.ok) { const data = await res.json(); const rate = data?.usd?.cny; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('fawazahmed0/currency-api'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    try {
      const res = await fetch(`https://api.frankfurter.app/${date}?from=USD&to=CNY`);
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('frankfurter.app'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('open.er-api.com'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    setRateFetchFailed(true); setRateMode('manual'); setRateFetching(false);
  }, []);

  // Auto-fetch rate on date change
  useEffect(() => {
    if (isOpen && orderDate && rateMode === 'auto') fetchExchangeRate(orderDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orderDate]);

  // --- Effective strategy values ---
  const getEffectiveStrategyValues = useCallback(() => {
    if (useOriginalStrategy && strategy) {
      return { currency: strategy.currency, floatEnabled: strategy.floatCurrency, floatThreshold: strategy.floatThreshold, requireDeposit: strategy.requireDeposit, depositRatio: strategy.depositRatio };
    }
    return { currency: customCurrency, floatEnabled: customFloatEnabled, floatThreshold: customFloatThreshold, requireDeposit: customDepositEnabled, depositRatio: customDepositRatio };
  }, [useOriginalStrategy, strategy, customCurrency, customFloatEnabled, customFloatThreshold, customDepositEnabled, customDepositRatio]);

  // --- Computed totals ---
  const sv = getEffectiveStrategyValues();
  const totalRaw = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const validItemCount = items.filter(i => i.sku.trim() && i.quantity > 0 && i.unitPrice > 0).length;

  // --- Real-time validation → submit button ---
  const isValid = useMemo(() => {
    if (!selectedSupplier) return false;
    if (!orderDate) return false;
    if (!exchangeRate || exchangeRate <= 0) return false;
    if (items.length === 0) return false;
    // Every item must have sku, qty > 0, price > 0
    const validSkuSet = new Set(skuList.map(s => s.sku.toUpperCase()));
    const allItemsValid = items.every(i => {
      if (!i.sku.trim()) return false;
      if (validSkuSet.size > 0 && !validSkuSet.has(i.sku.trim().toUpperCase())) return false;
      if (!i.quantity || i.quantity <= 0 || !Number.isInteger(i.quantity)) return false;
      if (!i.unitPrice || i.unitPrice <= 0) return false;
      return true;
    });
    return allItemsValid;
  }, [selectedSupplier, orderDate, exchangeRate, items, skuList]);

  const canSubmit = isValid && !rateFetching;

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: (secCode: string) => {
      const stratVals = getEffectiveStrategyValues();
      return purchaseApi.createOrder({
        supplierCode: selectedSupplier!.supplierCode,
        poDate: orderDate,
        items: items.map(i => ({
          sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice,
          currency: stratVals.currency, exchangeRate, note: i.note || undefined,
        })),
        strategy: {
          strategyDate: orderDate, currency: stratVals.currency, exchangeRate,
          rateMode, floatEnabled: stratVals.floatEnabled, floatThreshold: stratVals.floatThreshold,
          requireDeposit: stratVals.requireDeposit, depositRatio: stratVals.depositRatio,
        },
        sec_code_l3: secCode,
      });
    },
    onSuccess: () => {
      setShowSecurityDialog(false); setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
    onError: () => { setSecurityError(tCommon('securityCode.invalid')); },
  });

  const handleSubmit = () => { if (!canSubmit) return; setSecurityError(undefined); setShowSecurityDialog(true); };
  const handleSecurityConfirm = (code: string) => { createMutation.mutate(code); };

  // --- Items manipulation ---
  const addItemRow = () => { setItems(prev => [...prev, { id: generateId(), sku: '', quantity: 0, unitPrice: 0, note: '' }]); };
  const removeItemRow = (id: string) => { setItems(prev => prev.filter(i => i.id !== id)); };
  const updateItem = (id: string, field: keyof ItemRow, value: string | number) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // --- Excel upload (V1 parity) ---
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelParseMessage(''); setExcelParseError(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const ws = workbook.Sheets[sheetName];

        const cell = (ref: string): string => {
          const c = ws[ref]; if (!c) return ''; if (c.t === 'n') return String(c.v); return String(c.v ?? '');
        };

        const b1 = cell('B1').trim();
        const isV1Format = b1 === 'Eaglestar Purchase Order Form';

        if (isV1Format) {
          const excelSupplier = cell('C2').trim().toUpperCase();
          const expectedSupplier = selectedSupplier?.supplierCode?.toUpperCase() || '';
          if (excelSupplier && expectedSupplier && excelSupplier !== expectedSupplier) {
            setExcelParseMessage(t('orders.create.excelSupplierMismatch', { expected: expectedSupplier, actual: excelSupplier }));
            setExcelParseError(true); return;
          }

          const excelDate = cell('E2').trim();
          if (excelDate && orderDate) {
            const normalizeDate = (d: string): string => {
              if (!isNaN(Number(d))) { const serial = Number(d); if (serial > 40000 && serial < 60000) { const dt = new Date((serial - 25569) * 86400 * 1000); return dt.toISOString().slice(0, 10); } }
              const m = d.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
              if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
              return d;
            };
            if (normalizeDate(excelDate) !== orderDate) {
              setExcelParseMessage(t('orders.create.excelDateMismatch', { expected: orderDate, actual: excelDate }));
              setExcelParseError(true); return;
            }
          }

          const excelCurrency = (cell('G2') || cell('F2')).trim().toUpperCase();
          const effSv = getEffectiveStrategyValues();
          if (excelCurrency && effSv.currency && excelCurrency !== effSv.currency) {
            setExcelParseMessage(t('orders.create.excelCurrencyMismatch', { expected: effSv.currency, actual: excelCurrency }));
            setExcelParseError(true); return;
          }

          const parsedItems: ItemRow[] = [];
          const parseErrors: string[] = [];
          for (let r = 5; r <= 1004; r++) {
            const sku = cell(`B${r}`).trim().toUpperCase();
            if (!sku) continue;
            const qty = Number(cell(`C${r}`)); const price = Number(cell(`D${r}`));
            if (isNaN(qty) || qty <= 0) parseErrors.push(`Row ${r}: ${sku} — ${t('orders.errors.qtyPositive')}`);
            if (isNaN(price) || price <= 0) parseErrors.push(`Row ${r}: ${sku} — ${t('orders.errors.pricePositive')}`);
            parsedItems.push({ id: generateId(), sku, quantity: isNaN(qty) || qty <= 0 ? 0 : Math.round(qty), unitPrice: isNaN(price) || price <= 0 ? 0 : parseFloat(price.toFixed(5)), note: '' });
          }

          if (parsedItems.length > 0) {
            setItems(parsedItems);
            const msg = t('orders.create.parseSuccess', { count: parsedItems.length });
            setExcelParseMessage(parseErrors.length > 0 ? `${msg}\n${parseErrors.join('\n')}` : msg);
            setExcelParseError(false);
          } else { setExcelParseMessage(t('orders.create.parseFailed')); setExcelParseError(true); }
        } else {
          const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          const parsedItems: ItemRow[] = [];
          const parseErrors: string[] = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.length === 0) continue;
            const sku = String(row[0] || '').trim().toUpperCase(); if (!sku) continue;
            const qty = Number(row[1]); const price = Number(row[2]);
            if (isNaN(qty) || qty <= 0) parseErrors.push(`Row ${i + 1}: ${sku} — ${t('orders.errors.qtyPositive')}`);
            if (isNaN(price) || price <= 0) parseErrors.push(`Row ${i + 1}: ${sku} — ${t('orders.errors.pricePositive')}`);
            parsedItems.push({ id: generateId(), sku, quantity: isNaN(qty) || qty <= 0 ? 0 : Math.round(qty), unitPrice: isNaN(price) || price <= 0 ? 0 : parseFloat(price.toFixed(5)), note: '' });
          }
          if (parsedItems.length > 0) {
            setItems(parsedItems);
            const msg = t('orders.create.parseSuccess', { count: parsedItems.length });
            setExcelParseMessage(parseErrors.length > 0 ? `${msg}\n${parseErrors.join('\n')}` : msg);
            setExcelParseError(false);
          } else { setExcelParseMessage(t('orders.create.parseFailed')); setExcelParseError(true); }
        }
      } catch { setExcelParseMessage(t('orders.create.parseFailed')); setExcelParseError(true); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // V1 parity: download template
  const downloadTemplate = () => {
    const supplierCode = selectedSupplier?.supplierCode || '';
    const effSv = getEffectiveStrategyValues();
    const url = purchaseApi.getTemplateUrl(supplierCode, orderDate, effSv.currency, {
      exchangeRate, floatEnabled: effSv.floatEnabled, floatThreshold: effSv.floatThreshold,
      depositEnabled: effSv.requireDeposit, depositRatio: effSv.depositRatio,
    });
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const baseUrl = getApiBaseUrlCached();
    fetch(`${baseUrl}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PO_Template_${supplierCode}_${orderDate}.xlsx`; a.click(); URL.revokeObjectURL(a.href); })
      .catch(() => {
        const ws = XLSX.utils.aoa_to_sheet([]);
        XLSX.utils.sheet_add_aoa(ws, [[null, 'Eaglestar Purchase Order Form']], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(ws, [[null, null, supplierCode, null, orderDate, null, effSv.currency]], { origin: 'A2' });
        XLSX.utils.sheet_add_aoa(ws, [[null, 'SKU', '数量', '单价']], { origin: 'A4' });
        ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 5 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '采购订单明细');
        XLSX.writeFile(wb, `PO_Template_${supplierCode}_${orderDate}.xlsx`);
      });
  };

  // --- Early return ---
  if (!isOpen) return null;

  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('orders.create.success')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('orders.create.success')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{selectedSupplier?.supplierCode} - {selectedSupplier?.supplierName}</p>
        </div>
      </ModalShell>
    );
  }

  // --- Helpers ---
  const inputCls = "w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors";
  const baseStyle = { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text };
  const future = isFutureDate(orderDate);

  const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
      {icon}{title}
    </h3>
  );

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('orders.create.title')}
        footerLeft={
          <div className="text-xs" style={{ color: validItemCount > 0 ? colors.blue : colors.textTertiary }}>
            {validItemCount > 0 && `${validItemCount} ${t('orders.create.summaryItems')} · ${sv.currency} ${totalRaw.toFixed(2)}`}
          </div>
        }
        footerRight={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {tCommon('cancel')}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? colors.blue : colors.textTertiary }}>
              {t('orders.create.submit')}
            </button>
          </div>
        }
      >
        {/* ===== Section 1: Basic Info ===== */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
            title={t('orders.create.pill.supplier')}
          />
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Order Date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('orders.create.orderDate')}</label>
              <input type="date" value={orderDate}
                onChange={e => { setOrderDate(e.target.value); if (rateMode === 'auto') { setExchangeRate(0); setRateSource(''); } }}
                className={inputCls} style={{ ...baseStyle, borderColor: orderDate ? colors.border : colors.red }} />
            </div>
            {/* Supplier dropdown */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('orders.create.selectSupplier')}</label>
              {suppliersLoading ? (
                <div className="flex items-center h-9">
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                  <span className="ml-2 text-xs" style={{ color: colors.textSecondary }}>{tCommon('loading')}</span>
                </div>
              ) : (
                <select value={selectedSupplier?.id?.toString() || ''}
                  onChange={e => { const sup = suppliers.find((s: Supplier) => s.id.toString() === e.target.value); setSelectedSupplier(sup || null); }}
                  className={`${inputCls} appearance-none`}
                  style={{ ...baseStyle, borderColor: selectedSupplier ? colors.border : colors.red }}>
                  <option value="">{t('orders.create.selectSupplier')}</option>
                  {suppliers.map((sup: Supplier) => (
                    <option key={sup.id} value={sup.id.toString()}>{sup.supplierCode} - {sup.supplierName}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ===== Section 2: Strategy (auto-loaded, collapsible) ===== */}
        {selectedSupplier && (
          <div className="mb-6">
            <SectionHeader
              icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              title={t('orders.create.pill.strategy')}
            />
            {strategyLoading ? (
              <div className="flex items-center gap-2 py-3">
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                <span className="text-xs" style={{ color: colors.textSecondary }}>{tCommon('loading')}</span>
              </div>
            ) : !strategy ? (
              <div className="p-3 rounded-lg border" style={{ backgroundColor: `${colors.orange}10`, borderColor: `${colors.orange}30` }}>
                <p className="text-xs" style={{ color: colors.orange }}>{t('orders.create.noStrategy')}</p>
              </div>
            ) : (
              <div>
                {/* Current strategy read-only row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('orders.detail.currency')}</p>
                    <p className="text-sm font-medium font-mono" style={{ color: colors.blue }}>{strategy.currency}</p>
                  </div>
                  <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('orders.detail.floatEnabled')}</p>
                    <p className="text-sm font-medium" style={{ color: strategy.floatCurrency ? colors.green : colors.textTertiary }}>{strategy.floatCurrency ? `${strategy.floatThreshold}%` : '-'}</p>
                  </div>
                  <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('orders.detail.depositEnabled')}</p>
                    <p className="text-sm font-medium" style={{ color: strategy.requireDeposit ? colors.green : colors.textTertiary }}>{strategy.requireDeposit ? `${strategy.depositRatio}%` : '-'}</p>
                  </div>
                </div>

                {/* Use Original / Custom toggle */}
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => setUseOriginalStrategy(true)}
                    className="flex-1 h-8 rounded-lg text-xs font-medium border transition-all"
                    style={{ backgroundColor: useOriginalStrategy ? `${colors.green}15` : 'transparent', borderColor: useOriginalStrategy ? colors.green : colors.border, color: useOriginalStrategy ? colors.green : colors.textSecondary }}>
                    {t('orders.create.useOriginal')}
                  </button>
                  <button type="button" onClick={() => {
                    setUseOriginalStrategy(false);
                    setCustomCurrency(strategy.currency); setCustomFloatEnabled(strategy.floatCurrency);
                    setCustomFloatThreshold(strategy.floatThreshold); setCustomDepositEnabled(strategy.requireDeposit);
                    setCustomDepositRatio(strategy.depositRatio);
                  }}
                    className="flex-1 h-8 rounded-lg text-xs font-medium border transition-all"
                    style={{ backgroundColor: !useOriginalStrategy ? `${colors.orange}15` : 'transparent', borderColor: !useOriginalStrategy ? colors.orange : colors.border, color: !useOriginalStrategy ? colors.orange : colors.textSecondary }}>
                    {t('orders.create.useCustom')}
                  </button>
                </div>

                {/* Custom fields */}
                {!useOriginalStrategy && (
                  <div className="space-y-3 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <div className="flex gap-2">
                      {['USD', 'RMB'].map(cur => (
                        <button key={cur} type="button" onClick={() => setCustomCurrency(cur)}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium border transition-all"
                          style={{ backgroundColor: customCurrency === cur ? `${colors.blue}15` : 'transparent', borderColor: customCurrency === cur ? colors.blue : colors.border, color: customCurrency === cur ? colors.blue : colors.textSecondary }}>
                          {cur}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm" style={{ color: colors.text }}>{t('add.field.floatCurrency')}</label>
                      <button type="button" onClick={() => { setCustomFloatEnabled(!customFloatEnabled); if (customFloatEnabled) setCustomFloatThreshold(0); }}
                        className="relative w-10 h-5 rounded-full transition-colors" style={{ backgroundColor: customFloatEnabled ? colors.green : colors.bgTertiary }}>
                        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: customFloatEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                    {customFloatEnabled && (
                      <input type="number" value={customFloatThreshold || ''} placeholder="1-10" onChange={e => setCustomFloatThreshold(parseFloat(e.target.value) || 0)}
                        className={inputCls} style={{ ...baseStyle, borderColor: customFloatThreshold > 0 && customFloatThreshold <= 10 ? colors.border : colors.red }} />
                    )}
                    <div className="flex items-center justify-between">
                      <label className="text-sm" style={{ color: colors.text }}>{t('add.field.requireDeposit')}</label>
                      <button type="button" onClick={() => { setCustomDepositEnabled(!customDepositEnabled); if (customDepositEnabled) setCustomDepositRatio(0); }}
                        className="relative w-10 h-5 rounded-full transition-colors" style={{ backgroundColor: customDepositEnabled ? colors.green : colors.bgTertiary }}>
                        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: customDepositEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                    {customDepositEnabled && (
                      <input type="number" value={customDepositRatio || ''} placeholder=">0" onChange={e => setCustomDepositRatio(parseFloat(e.target.value) || 0)}
                        className={inputCls} style={{ ...baseStyle, borderColor: customDepositRatio > 0 ? colors.border : colors.red }} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Section 3: Exchange Rate ===== */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title={t('orders.create.pill.rate')}
          />

          {!future && (
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => { setRateMode('auto'); if (exchangeRate === 0 || rateFetchFailed) fetchExchangeRate(orderDate); }}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'auto' ? colors.blue : colors.bgTertiary, color: rateMode === 'auto' ? '#fff' : colors.text }}>
                {t('orders.create.autoRate')}
              </button>
              <button type="button" onClick={() => setRateMode('manual')}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'manual' ? colors.blue : colors.bgTertiary, color: rateMode === 'manual' ? '#fff' : colors.text }}>
                {t('orders.create.manualRate')}
              </button>
            </div>
          )}

          {future && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.orange}10` }}>
              <p className="text-xs" style={{ color: colors.orange }}>{t('orders.create.futureDate')}</p>
            </div>
          )}

          {rateMode === 'auto' && rateFetching && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
              <span className="text-xs" style={{ color: colors.textSecondary }}>{t('orders.create.fetchingRate')}</span>
            </div>
          )}
          {rateMode === 'auto' && rateSource && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
              <p className="text-xs" style={{ color: colors.green }}>{t('orders.create.rateFetched', { source: rateSource })}</p>
            </div>
          )}
          {rateMode === 'auto' && rateFetchFailed && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.red}10` }}>
              <p className="text-xs" style={{ color: colors.red }}>{t('orders.create.rateFailed')}</p>
            </div>
          )}

          <div className="relative">
            <input type="number" step="0.0001" value={exchangeRate || ''} placeholder="0.0000"
              onChange={e => { const val = parseFloat(e.target.value); setExchangeRate(isNaN(val) ? 0 : val); }}
              disabled={rateMode === 'auto' && !rateFetchFailed && rateFetching}
              readOnly={rateMode === 'auto' && !rateFetchFailed && !rateFetching && exchangeRate > 0}
              className={`${inputCls} disabled:opacity-50`}
              style={{ ...baseStyle, borderColor: exchangeRate > 0 ? colors.border : colors.red, paddingRight: '60px' }} />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-xs" style={{ color: colors.textSecondary }}>USD/CNY</span>
            </div>
          </div>
        </div>

        {/* ===== Section 4: Items ===== */}
        <div className="mb-4">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
            title={t('orders.create.pill.items')}
          />

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setItemEntryMode('manual')}
              className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: itemEntryMode === 'manual' ? colors.blue : colors.bgTertiary, color: itemEntryMode === 'manual' ? '#fff' : colors.text }}>
              {t('orders.create.itemsManual')}
            </button>
            <button type="button" onClick={() => setItemEntryMode('excel')}
              className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: itemEntryMode === 'excel' ? colors.blue : colors.bgTertiary, color: itemEntryMode === 'excel' ? '#fff' : colors.text }}>
              {t('orders.create.itemsExcel')}
            </button>
          </div>

          {itemEntryMode === 'excel' ? (
            <div>
              <div className="border-2 border-dashed rounded-lg p-5 text-center mb-3" style={{ borderColor: colors.border }}>
                <svg className="w-7 h-7 mx-auto mb-2" style={{ color: colors.textSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm mb-1" style={{ color: colors.text }}>{t('orders.create.uploadExcel')}</p>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>{t('orders.create.uploadHint')}</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" id="excel-upload" />
                <label htmlFor="excel-upload" className="inline-flex h-8 px-4 text-xs font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity items-center" style={{ backgroundColor: colors.blue, color: '#fff' }}>
                  {t('orders.create.uploadExcel')}
                </label>
              </div>
              <button type="button" onClick={downloadTemplate} className="w-full h-8 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                {t('orders.create.downloadTemplate')}
              </button>
              {excelParseMessage && <p className="mt-2 text-xs whitespace-pre-line" style={{ color: excelParseError ? colors.red : colors.green }}>{excelParseMessage}</p>}

              {/* Preview table */}
              {items.length > 0 && items[0].sku && (
                <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: colors.bgTertiary }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('orders.detail.qty')}</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('orders.detail.unitPrice')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                          <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.quantity}</td>
                          <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.unitPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {items.map((item, idx) => {
                  const validSkuSet = new Set(skuList.map(s => s.sku.toUpperCase()));
                  const skuInvalid = item.sku.trim() && validSkuSet.size > 0 && !validSkuSet.has(item.sku.trim().toUpperCase());
                  return (
                    <div key={item.id} className="p-3 rounded-lg border" style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>#{idx + 1}</span>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItemRow(item.id)} className="text-xs hover:opacity-70 transition-opacity" style={{ color: colors.red }}>
                            {t('orders.create.removeRow')}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {/* SKU */}
                        <div className="col-span-3 relative">
                          <input type="text" list={`sku-list-${item.id}`} value={item.sku}
                            onChange={e => updateItem(item.id, 'sku', e.target.value.toUpperCase())}
                            placeholder={t('orders.create.skuPlaceholder')}
                            className={inputCls}
                            style={{ ...baseStyle, backgroundColor: colors.bgSecondary, borderColor: skuInvalid ? colors.red : item.sku.trim() ? colors.border : colors.border }} />
                          <datalist id={`sku-list-${item.id}`}>
                            {skuList.map(s => (<option key={s.sku} value={s.sku}>{s.name}</option>))}
                          </datalist>
                          {skuInvalid && <p className="mt-0.5 text-[10px]" style={{ color: colors.red }}>{t('orders.errors.skuNotFound')}</p>}
                        </div>
                        {/* Qty */}
                        <div>
                          <input type="number" value={item.quantity || ''} placeholder={t('orders.create.qtyPlaceholder')}
                            onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value, 10) || 0)}
                            className={inputCls}
                            style={{ ...baseStyle, backgroundColor: colors.bgSecondary, borderColor: item.quantity > 0 ? colors.border : colors.border }} />
                        </div>
                        {/* Price */}
                        <div>
                          <input type="number" step="0.01" value={item.unitPrice || ''} placeholder={t('orders.create.pricePlaceholder')}
                            onChange={e => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className={inputCls}
                            style={{ ...baseStyle, backgroundColor: colors.bgSecondary }} />
                        </div>
                        {/* Note */}
                        <div>
                          <input type="text" value={item.note} placeholder={t('orders.create.notePlaceholder')}
                            onChange={e => updateItem(item.id, 'note', e.target.value)}
                            className={inputCls}
                            style={{ ...baseStyle, backgroundColor: colors.bgSecondary }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={addItemRow}
                className="mt-3 w-full h-8 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                style={{ backgroundColor: colors.bgTertiary, color: colors.blue }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t('orders.create.addRow')}
              </button>
            </div>
          )}
        </div>
      </ModalShell>

      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L3"
        title={t('orders.create.title')}
        description={t('orders.create.securityDescription')}
        onConfirm={handleSecurityConfirm}
        onCancel={() => { setShowSecurityDialog(false); setSecurityError(undefined); }}
        isLoading={createMutation.isPending}
        error={securityError}
      />
    </>
  );
}
