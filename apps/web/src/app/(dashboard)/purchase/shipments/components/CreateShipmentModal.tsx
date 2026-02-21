'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type ShipmentAvailablePo } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import * as XLSX from 'xlsx';
import ModalShell from '../../../purchase/components/ModalShell';

// ================================
// Types
// ================================

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SelectedItem {
  poNum: string;
  sku: string;
  orderedQty: number;
  shippedQty: number;
  remainingQty: number;
  unitPrice: number;
  sendQty: number;
  isRounded: boolean;
  note: string;
}

type RateMode = 'auto' | 'manual';
type ItemEntryMode = 'manual' | 'excel';

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
// Single-page Create Shipment form
// Sections: Logistics → Items → Note
// Validation: inline borders + submit button disabled
// ================================

export default function CreateShipmentModal({ isOpen, onClose, onSuccess }: CreateShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [sentDate, setSentDate] = useState(formatDate(new Date()));
  const [logisticNum, setLogisticNum] = useState('');
  const [etaDate, setEtaDate] = useState('');
  const [pallets, setPallets] = useState<number>(0);
  const [totalWeight, setTotalWeight] = useState<number>(0);
  const [priceKg, setPriceKg] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [rateMode, setRateMode] = useState<RateMode>('auto');
  const [rateSource, setRateSource] = useState('');
  const [rateFetching, setRateFetching] = useState(false);
  const [rateFetchFailed, setRateFetchFailed] = useState(false);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [itemEntryMode, setItemEntryMode] = useState<ItemEntryMode>('manual');
  const [excelParseMessage, setExcelParseMessage] = useState('');
  const [excelParseError, setExcelParseError] = useState(false);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Fetch available POs ---
  const { data: availablePos = [], isLoading: posLoading } = useQuery({
    queryKey: ['availablePos', sentDate],
    queryFn: () => purchaseApi.getAvailablePos(sentDate),
    enabled: isOpen && !!sentDate,
  });

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen) {
      setSentDate(formatDate(new Date()));
      setLogisticNum('');
      setEtaDate('');
      setPallets(0);
      setTotalWeight(0);
      setPriceKg(0);
      setExchangeRate(0);
      setRateMode('auto');
      setRateSource('');
      setRateFetching(false);
      setRateFetchFailed(false);

      setSelectedItems([]);
      setItemEntryMode('manual');
      setExcelParseMessage('');
      setExcelParseError(false);
      setShowSecurityDialog(false);
      setSecurityError(undefined);
      setSuccess(false);
    }
  }, [isOpen]);

  // --- Fetch exchange rate ---
  const fetchExchangeRate = useCallback(async (date: string) => {
    if (isFutureDate(date)) {
      setRateMode('manual');
      setRateFetchFailed(false);
      setRateSource('');
      return;
    }
    setRateFetching(true);
    setRateFetchFailed(false);
    setRateSource('');

    // Source 1: fawazahmed0
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.usd?.cny;
        if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('fawazahmed0/currency-api'); setRateFetching(false); return; }
      }
    } catch { /* fall through */ }

    // Source 2: frankfurter.app
    try {
      const res = await fetch(`https://api.frankfurter.app/${date}?from=USD&to=CNY`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('frankfurter.app'); setRateFetching(false); return; }
      }
    } catch { /* fall through */ }

    // Source 3: open.er-api.com
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('open.er-api.com'); setRateFetching(false); return; }
      }
    } catch { /* fall through */ }

    setRateFetchFailed(true);
    setRateMode('manual');
    setRateFetching(false);
  }, []);

  // Auto-fetch rate on sentDate change
  useEffect(() => {
    if (isOpen && sentDate && rateMode === 'auto') {
      fetchExchangeRate(sentDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sentDate]);

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const validItems = selectedItems.filter(i => i.sendQty > 0);
  const totalCargoValue = validItems.reduce((sum, i) => sum + Math.round(i.sendQty * i.unitPrice * 100000) / 100000, 0);

  // --- Real-time validation → submit button ---
  const isValid = useMemo(() => {
    if (!sentDate) return false;
    if (!logisticNum.trim()) return false;
    if (!exchangeRate || exchangeRate <= 0) return false;
    if (validItems.length === 0) return false;
    return true;
  }, [sentDate, logisticNum, exchangeRate, validItems.length]);

  const canSubmit = isValid && !rateFetching;

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: (secCode: string) => {
      const computedLogisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
      return purchaseApi.createShipment({
        logisticNum,
        sentDate,
        etaDate: etaDate || undefined,
        pallets: pallets || undefined,
        totalWeight,
        priceKg,
        logisticsCost: computedLogisticsCost,
        exchangeRate,

        items: validItems.map(i => ({
          poNum: i.poNum,
          sku: i.sku,
          quantity: i.sendQty,
          unitPrice: i.unitPrice,
          poChange: i.isRounded,
        })),
        sec_code_l3: secCode,
      });
    },
    onSuccess: () => {
      setShowSecurityDialog(false);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSecurityError(undefined);
    setShowSecurityDialog(true);
  };

  const handleSecurityConfirm = (code: string) => {
    createMutation.mutate(code);
  };

  // --- Items manipulation ---
  const updateSendQty = (poNum: string, sku: string, qty: number) => {
    setSelectedItems(prev => prev.map(i =>
      i.poNum === poNum && i.sku === sku ? { ...i, sendQty: qty } : i,
    ));
  };

  const toggleRounded = (poNum: string, sku: string) => {
    setSelectedItems(prev => prev.map(i =>
      i.poNum === poNum && i.sku === sku ? { ...i, isRounded: !i.isRounded } : i,
    ));
  };

  // Build items from available POs
  useEffect(() => {
    if (availablePos && availablePos.length > 0 && itemEntryMode === 'manual') {
      const items: SelectedItem[] = [];
      (availablePos as ShipmentAvailablePo[]).forEach(po => {
        po.items.forEach(item => {
          if (item.remainingQty > 0) {
            items.push({
              poNum: po.poNum, sku: item.sku, orderedQty: item.orderedQty,
              shippedQty: item.shippedQty, remainingQty: item.remainingQty,
              unitPrice: item.unitPrice, sendQty: 0, isRounded: false, note: '',
            });
          }
        });
      });
      setSelectedItems(items);
    }
  }, [availablePos, itemEntryMode]);

  // --- Excel upload ---
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelParseMessage('');
    setExcelParseError(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const ws = workbook.Sheets[sheetName];

        const cell = (ref: string): string => {
          const c = ws[ref];
          if (!c) return '';
          if (c.t === 'n') return String(c.v);
          return String(c.v ?? '');
        };

        // Parse logistics from header
        const excelLogisticNum = cell('C4').trim();
        const excelPallets = Number(cell('F4'));
        const excelSentDate = cell('I4').trim();
        const excelPriceKg = Number(cell('C6'));
        const excelTotalWeight = Number(cell('F6'));
        const excelEtaDate = cell('I6').trim();

        if (excelLogisticNum && !logisticNum) setLogisticNum(excelLogisticNum);
        if (!isNaN(excelPallets) && excelPallets > 0) setPallets(excelPallets);
        if (excelSentDate) setSentDate(excelSentDate);
        if (!isNaN(excelPriceKg) && excelPriceKg > 0) setPriceKg(excelPriceKg);
        if (!isNaN(excelTotalWeight) && excelTotalWeight > 0) setTotalWeight(excelTotalWeight);
        if (excelEtaDate) setEtaDate(excelEtaDate);

        // Parse items from row 9+
        const parsedItems: SelectedItem[] = [];
        let emptyCount = 0;
        for (let r = 9; r <= 5000; r++) {
          const sku = cell(`D${r}`).trim().toUpperCase();
          if (!sku) { emptyCount++; if (emptyCount >= 10) break; continue; }
          emptyCount = 0;
          const poNum = cell(`C${r}`).trim();
          const ordered = Number(cell(`E${r}`)) || 0;
          const shipped = Number(cell(`F${r}`)) || 0;
          const remaining = Number(cell(`G${r}`)) || 0;
          const sendQty = Number(cell(`H${r}`)) || 0;
          const isRoundedVal = cell(`I${r}`).trim().toUpperCase();
          const itemNote = cell(`J${r}`).trim();
          if (sendQty > 0) {
            const isRounded = isRoundedVal === '是' || isRoundedVal === 'YES' || isRoundedVal === '1' || isRoundedVal === 'TRUE';
            parsedItems.push({ poNum, sku, orderedQty: ordered, shippedQty: shipped, remainingQty: remaining, unitPrice: 0, sendQty, isRounded, note: itemNote });
          }
        }

        if (parsedItems.length > 0) {
          const filledItems = parsedItems.map(item => {
            const po = (availablePos as ShipmentAvailablePo[])?.find(p => p.poNum === item.poNum);
            const poItem = po?.items.find(i => i.sku === item.sku);
            return { ...item, unitPrice: poItem?.unitPrice ?? 0 };
          });
          setSelectedItems(filledItems);
          setExcelParseMessage(t('shipments.create.parseSuccess', { count: filledItems.length }));
          setExcelParseError(false);
        } else {
          setExcelParseMessage(t('shipments.create.parseFailed'));
          setExcelParseError(true);
        }
      } catch {
        setExcelParseMessage(t('shipments.create.parseFailed'));
        setExcelParseError(true);
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const url = purchaseApi.getShipmentTemplateUrl(sentDate);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const baseUrl = getApiBaseUrlCached();
    fetch(`${baseUrl}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Shipment_Template_${sentDate}.xlsx`; a.click(); URL.revokeObjectURL(a.href); })
      .catch(() => {});
  };

  // --- Early return ---
  if (!isOpen) return null;

  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('shipments.create.success')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('shipments.create.success')}</h3>
          <p className="text-sm font-mono" style={{ color: colors.textSecondary }}>{logisticNum}</p>
        </div>
      </ModalShell>
    );
  }

  // --- Input helpers ---
  const inputCls = "w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors";
  const baseStyle = { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text };
  const future = isFutureDate(sentDate);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('shipments.create.title')}
        footerLeft={
          <div className="text-xs" style={{ color: validItems.length > 0 ? colors.blue : colors.textTertiary }}>
            {validItems.length > 0 && `${validItems.length} ${t('shipments.create.summaryItems')} · $${totalCargoValue.toFixed(2)}`}
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
              {t('shipments.create.submit')}
            </button>
          </div>
        }
      >
        {/* ===== Section: Logistics ===== */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
            {t('shipments.create.pill.logistics')}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Sent Date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.sentDate')}</label>
              <input type="date" value={sentDate}
                onChange={e => { setSentDate(e.target.value); if (rateMode === 'auto') { setExchangeRate(0); setRateSource(''); } }}
                className={inputCls} style={{ ...baseStyle, borderColor: sentDate ? colors.border : colors.red }} />
            </div>
            {/* Logistic Number */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.logisticNum')}</label>
              <input type="text" value={logisticNum} onChange={e => setLogisticNum(e.target.value)}
                placeholder={t('shipments.create.logisticNumPlaceholder')}
                className={inputCls} style={{ ...baseStyle, borderColor: logisticNum.trim() ? colors.border : colors.red }} />
            </div>
            {/* ETA Date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.etaDate')}</label>
              <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} className={inputCls} style={baseStyle} />
            </div>
            {/* Pallets */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.pallets')}</label>
              <input type="number" value={pallets || ''} onChange={e => setPallets(parseInt(e.target.value, 10) || 0)} className={inputCls} style={baseStyle} />
            </div>
            {/* Total Weight */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.totalWeight')}</label>
              <input type="number" step="0.01" value={totalWeight || ''} onChange={e => setTotalWeight(parseFloat(e.target.value) || 0)} className={inputCls} style={baseStyle} />
            </div>
            {/* Price/kg */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('shipments.create.priceKg')}</label>
              <input type="number" step="0.01" value={priceKg || ''} onChange={e => setPriceKg(parseFloat(e.target.value) || 0)} className={inputCls} style={baseStyle} />
            </div>
          </div>

          {/* Computed logistics cost */}
          {totalWeight > 0 && priceKg > 0 && (
            <div className="mt-3 px-4 py-2.5 rounded-lg" style={{ backgroundColor: `${colors.blue}10` }}>
              <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.detail.logisticsCost')}: </span>
              <span className="text-sm font-medium font-mono" style={{ color: colors.blue }}>
                ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              </span>
            </div>
          )}
        </div>

        {/* ===== Section: Exchange Rate ===== */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('shipments.create.pill.rate')}
          </h3>

          {/* Auto/Manual toggle */}
          {!future && (
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => { setRateMode('auto'); if (exchangeRate === 0 || rateFetchFailed) fetchExchangeRate(sentDate); }}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'auto' ? colors.blue : colors.bgTertiary, color: rateMode === 'auto' ? '#fff' : colors.text }}>
                {t('shipments.create.autoRate')}
              </button>
              <button type="button" onClick={() => setRateMode('manual')}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'manual' ? colors.blue : colors.bgTertiary, color: rateMode === 'manual' ? '#fff' : colors.text }}>
                {t('shipments.create.manualRate')}
              </button>
            </div>
          )}

          {future && (
            <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: `${colors.orange}10`, borderColor: `${colors.orange}30` }}>
              <p className="text-xs" style={{ color: colors.orange }}>{t('shipments.create.futureDate')}</p>
            </div>
          )}

          {rateMode === 'auto' && rateFetching && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
              <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.fetchingRate')}</span>
            </div>
          )}
          {rateMode === 'auto' && rateSource && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
              <p className="text-xs" style={{ color: colors.green }}>{t('shipments.create.rateFetched', { source: rateSource })}</p>
            </div>
          )}
          {rateMode === 'auto' && rateFetchFailed && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.red}10` }}>
              <p className="text-xs" style={{ color: colors.red }}>{t('shipments.create.rateFailed')}</p>
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

        {/* ===== Section: Items ===== */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {t('shipments.create.pill.items')}
            {validItems.length > 0 && <span className="text-[10px] font-normal normal-case" style={{ color: colors.blue }}>({validItems.length})</span>}
          </h3>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setItemEntryMode('manual')}
              className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: itemEntryMode === 'manual' ? colors.blue : colors.bgTertiary, color: itemEntryMode === 'manual' ? '#fff' : colors.text }}>
              {t('shipments.create.itemsManual')}
            </button>
            <button type="button" onClick={() => setItemEntryMode('excel')}
              className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: itemEntryMode === 'excel' ? colors.blue : colors.bgTertiary, color: itemEntryMode === 'excel' ? '#fff' : colors.text }}>
              {t('shipments.create.itemsExcel')}
            </button>
          </div>

          {itemEntryMode === 'excel' ? (
            <div>
              <div className="border-2 border-dashed rounded-lg p-5 text-center mb-3" style={{ borderColor: colors.border }}>
                <svg className="w-7 h-7 mx-auto mb-2" style={{ color: colors.textSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm mb-1" style={{ color: colors.text }}>{t('shipments.create.uploadExcel')}</p>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>{t('shipments.create.uploadHint')}</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" id="shipment-excel-upload" />
                <label htmlFor="shipment-excel-upload" className="inline-flex h-8 px-4 text-xs font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity items-center" style={{ backgroundColor: colors.blue, color: '#fff' }}>
                  {t('shipments.create.uploadExcel')}
                </label>
              </div>
              <button type="button" onClick={downloadTemplate} className="w-full h-8 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                {t('shipments.create.downloadTemplate')}
              </button>
              {excelParseMessage && <p className="mt-2 text-xs" style={{ color: excelParseError ? colors.red : colors.green }}>{excelParseMessage}</p>}

              {/* Preview parsed items */}
              {selectedItems.length > 0 && selectedItems.some(i => i.sendQty > 0) && (
                <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: colors.bgTertiary }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.create.sendQty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.filter(i => i.sendQty > 0).map(item => (
                        <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.text }}>{item.sku}</td>
                          <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.sendQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              {posLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                </div>
              ) : selectedItems.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.noPosAvailable')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(() => {
                    const grouped = new Map<string, SelectedItem[]>();
                    selectedItems.forEach(item => {
                      const group = grouped.get(item.poNum) || [];
                      group.push(item);
                      grouped.set(item.poNum, group);
                    });
                    return Array.from(grouped.entries()).map(([poNum, items]) => (
                      <div key={poNum} className="rounded-lg border p-3" style={{ borderColor: colors.border, backgroundColor: colors.bgTertiary }}>
                        <div className="mb-2">
                          <span className="text-sm font-mono font-semibold" style={{ color: colors.blue }}>{poNum}</span>
                        </div>
                        <div className="space-y-2">
                          {items.map(item => (
                            <div key={`${item.poNum}-${item.sku}`} className="flex items-center gap-2">
                              <span className="text-xs font-mono w-32 truncate" style={{ color: colors.text }}>{item.sku}</span>
                              <span className="text-[10px] w-16 text-right" style={{ color: colors.textTertiary }}>
                                {t('shipments.create.ordered')}: {item.orderedQty}
                              </span>
                              <span className="text-[10px] w-16 text-right" style={{ color: colors.orange }}>
                                {t('shipments.create.remaining')}: {item.remainingQty}
                              </span>
                              <input type="number" min={0} value={item.sendQty || ''} placeholder={t('shipments.create.sendQty')}
                                onChange={e => updateSendQty(item.poNum, item.sku, parseInt(e.target.value, 10) || 0)}
                                className="w-20 h-7 px-2 border rounded text-xs text-right focus:outline-none"
                                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }} />
                              <label className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                <input type="checkbox" checked={item.isRounded} onChange={() => toggleRounded(item.poNum, item.sku)} className="w-3 h-3" />
                                {t('shipments.create.isRounded')}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>


      </ModalShell>

      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L3"
        title={t('shipments.create.title')}
        description={t('shipments.create.securityDescription')}
        onConfirm={handleSecurityConfirm}
        onCancel={() => { setShowSecurityDialog(false); setSecurityError(undefined); }}
        isLoading={createMutation.isPending}
        error={securityError}
      />
    </>
  );
}
