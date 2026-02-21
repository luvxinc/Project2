'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type ShipmentAvailablePo } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { PillNav } from '@/components/ui/pill-nav';
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

const STEP_KEYS = ['logistics', 'rate', 'items', 'confirm'] as const;

const PILLS = [
  { key: 'logistics', label: '' },
  { key: 'rate', label: '' },
  { key: 'items', label: '' },
  { key: 'confirm', label: '' },
];

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFutureDate(dateStr: string): boolean {
  const today = formatDate(new Date());
  return dateStr > today;
}

// ================================
// Component
// ================================

export default function CreateShipmentModal({ isOpen, onClose, onSuccess }: CreateShipmentModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [activeStep, setActiveStep] = useState('logistics');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
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
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [itemEntryMode, setItemEntryMode] = useState<ItemEntryMode>('manual');
  const [excelParseMessage, setExcelParseMessage] = useState('');
  const [excelParseError, setExcelParseError] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pills = PILLS.map((p) => ({
    ...p,
    label: t(`shipments.create.pill.${p.key}`),
  }));

  // --- Fetch available POs ---
  const { data: availablePos = [], isLoading: posLoading } = useQuery({
    queryKey: ['availablePos', sentDate],
    queryFn: () => purchaseApi.getAvailablePos(sentDate),
    enabled: isOpen && !!sentDate,
  });

  // --- Reset on open/close ---
  useEffect(() => {
    if (isOpen) {
      setActiveStep('logistics');
      setCompletedSteps([]);
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
      setNote('');
      setSelectedItems([]);
      setItemEntryMode('manual');
      setExcelParseMessage('');
      setExcelParseError(false);
      setErrors({});
      setShowSecurityDialog(false);
      setSecurityError(undefined);
      setSuccess(false);
    }
  }, [isOpen]);

  // --- ESC to close ---
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSecurityDialog) onClose();
    },
    [onClose, showSecurityDialog],
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

    // Try source 1: fawazahmed0
    try {
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`,
      );
      if (res.ok) {
        const data = await res.json();
        const rate = data?.usd?.cny;
        if (rate && rate > 0) {
          setExchangeRate(parseFloat(Number(rate).toFixed(4)));
          setRateSource('fawazahmed0/currency-api');
          setRateFetching(false);
          return;
        }
      }
    } catch {
      // fall through
    }

    // Try source 2: frankfurter.app
    try {
      const res = await fetch(
        `https://api.frankfurter.app/${date}?from=USD&to=CNY`,
      );
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) {
          setExchangeRate(parseFloat(Number(rate).toFixed(4)));
          setRateSource('frankfurter.app');
          setRateFetching(false);
          return;
        }
      }
    } catch {
      // fall through
    }

    // Try source 3: open.er-api.com
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) {
          setExchangeRate(parseFloat(Number(rate).toFixed(4)));
          setRateSource('open.er-api.com');
          setRateFetching(false);
          return;
        }
      }
    } catch {
      // fall through
    }

    setRateFetchFailed(true);
    setRateMode('manual');
    setRateFetching(false);
  }, []);

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
        note: note || undefined,
        items: selectedItems.filter(i => i.sendQty > 0).map(i => ({
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
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  // --- Validation ---
  const validateLogisticsStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!sentDate) newErrors.sentDate = t('shipments.errors.sentDateRequired');
    if (!logisticNum.trim()) newErrors.logisticNum = t('shipments.errors.logisticNumRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRateStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!exchangeRate || exchangeRate <= 0) newErrors.rate = t('shipments.errors.ratePositive');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItemsStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    const validItems = selectedItems.filter(i => i.sendQty > 0);
    if (validItems.length === 0) {
      newErrors.items = t('shipments.errors.noItems');
      setErrors(newErrors);
      return false;
    }
    let hasError = false;
    validItems.forEach((item) => {
      if (item.sendQty <= 0) {
        newErrors[`${item.poNum}-${item.sku}`] = t('shipments.errors.qtyPositive');
        hasError = true;
      }
    });
    setErrors(newErrors);
    return !hasError;
  };

  // --- Navigation ---
  const handleStepChange = (key: string) => {
    const currentIdx = STEP_KEYS.indexOf(activeStep as typeof STEP_KEYS[number]);
    const targetIdx = STEP_KEYS.indexOf(key as typeof STEP_KEYS[number]);

    if (targetIdx > currentIdx) {
      if (activeStep === 'logistics' && !validateLogisticsStep()) return;
      if (activeStep === 'rate' && !validateRateStep()) return;
      if (activeStep === 'items' && !validateItemsStep()) return;
    }

    if (targetIdx > currentIdx) {
      setCompletedSteps((prev) => {
        const updated = new Set(prev);
        for (let i = 0; i <= currentIdx; i++) {
          updated.add(STEP_KEYS[i]);
        }
        return Array.from(updated);
      });
    }

    if (key === 'rate' && rateMode === 'auto' && exchangeRate === 0) {
      fetchExchangeRate(sentDate);
    }

    setErrors({});
    setActiveStep(key);
  };

  const handleNext = () => {
    const currentIdx = STEP_KEYS.indexOf(activeStep as typeof STEP_KEYS[number]);
    if (currentIdx < STEP_KEYS.length - 1) {
      handleStepChange(STEP_KEYS[currentIdx + 1]);
    }
  };

  const handleBack = () => {
    const currentIdx = STEP_KEYS.indexOf(activeStep as typeof STEP_KEYS[number]);
    if (currentIdx > 0) {
      setErrors({});
      setActiveStep(STEP_KEYS[currentIdx - 1]);
    }
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
              poNum: po.poNum,
              sku: item.sku,
              orderedQty: item.orderedQty,
              shippedQty: item.shippedQty,
              remainingQty: item.remainingQty,
              unitPrice: item.unitPrice,
              sendQty: 0,
              isRounded: false,
              note: '',
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

        // Direct cell reference (avoid sheet_to_json offset trap)
        const cell = (ref: string): string => {
          const c = ws[ref];
          if (!c) return '';
          if (c.t === 'n') return String(c.v);
          return String(c.v ?? '');
        };

        // Parse logistics info from header cells
        const excelLogisticNum = cell('C4').trim();
        const excelPallets = Number(cell('F4'));
        const excelSentDate = cell('I4').trim();
        const excelPriceKg = Number(cell('C6'));
        const excelTotalWeight = Number(cell('F6'));
        const excelEtaDate = cell('I6').trim();

        // Auto-populate logistics fields
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
          if (!sku) {
            emptyCount++;
            if (emptyCount >= 10) break;
            continue;
          }
          emptyCount = 0;

          const poNum = cell(`C${r}`).trim();
          const ordered = Number(cell(`E${r}`)) || 0;
          const shipped = Number(cell(`F${r}`)) || 0;
          const remaining = Number(cell(`G${r}`)) || 0;
          const sendQty = Number(cell(`H${r}`)) || 0;
          const isRoundedVal = cell(`I${r}`).trim().toUpperCase();
          const itemNote = cell(`J${r}`).trim();

          if (sendQty > 0) {
            // V1 parity: isRounded must be "是" or "否" (Chinese)
            const isRounded = isRoundedVal === '是' || isRoundedVal === 'YES' || isRoundedVal === '1' || isRoundedVal === 'TRUE';

            parsedItems.push({
              poNum,
              sku,
              orderedQty: ordered,
              shippedQty: shipped,
              remainingQty: remaining,
              unitPrice: 0, // Filled from available PO data below
              sendQty,
              isRounded,
              note: itemNote,
            });
          }
        }

        if (parsedItems.length > 0) {
          // V1 parity: fill unitPrice from available PO data
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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const url = purchaseApi.getShipmentTemplateUrl(sentDate);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const baseUrl = getApiBaseUrlCached();

    fetch(`${baseUrl}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Shipment_Template_${sentDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        // Fallback: nothing — template must come from backend
      });
  };

  // --- Submit ---
  const handleSubmit = () => {
    setSecurityError(undefined);
    setShowSecurityDialog(true);
  };

  const handleSecurityConfirm = (code: string) => {
    createMutation.mutate(code);
  };

  // --- Computed ---
  const logisticsCost = Math.round(Math.ceil(totalWeight) * priceKg * 100000) / 100000;
  const validItems = selectedItems.filter(i => i.sendQty > 0);
  const totalCargoValue = validItems.reduce((sum, i) => sum + Math.round(i.sendQty * i.unitPrice * 100000) / 100000, 0);

  // --- Early return ---
  if (!isOpen) return null;

  // --- Success state ---
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
          <p className="text-sm" style={{ color: colors.textSecondary }}>{logisticNum}</p>
        </div>
      </ModalShell>
    );
  }

  // ================================
  // Step Renderers
  // ================================

  const renderLogisticsStep = () => (
    <div className="space-y-4">
      {/* Sent Date */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('shipments.create.sentDate')}
        </label>
        <input
          type="date"
          value={sentDate}
          onChange={(e) => {
            setSentDate(e.target.value);
            if (rateMode === 'auto') {
              setExchangeRate(0);
              setRateSource('');
            }
          }}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
          style={{
            backgroundColor: colors.bgTertiary,
            borderColor: errors.sentDate ? colors.red : colors.border,
            color: colors.text,
          }}
        />
        {errors.sentDate && <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.sentDate}</p>}
      </div>

      {/* Logistic Number */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('shipments.create.logisticNum')}
        </label>
        <input
          type="text"
          value={logisticNum}
          onChange={(e) => setLogisticNum(e.target.value)}
          placeholder={t('shipments.create.logisticNumPlaceholder')}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
          style={{
            backgroundColor: colors.bgTertiary,
            borderColor: errors.logisticNum ? colors.red : colors.border,
            color: colors.text,
          }}
        />
        {errors.logisticNum && <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.logisticNum}</p>}
      </div>

      {/* ETA Date */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('shipments.create.etaDate')}
        </label>
        <input
          type="date"
          value={etaDate}
          onChange={(e) => setEtaDate(e.target.value)}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
          style={{
            backgroundColor: colors.bgTertiary,
            borderColor: colors.border,
            color: colors.text,
          }}
        />
      </div>

      {/* Pallets */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('shipments.create.pallets')}
        </label>
        <input
          type="number"
          value={pallets || ''}
          onChange={(e) => setPallets(parseInt(e.target.value, 10) || 0)}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Total Weight + Price per kg */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
            {t('shipments.create.totalWeight')}
          </label>
          <input
            type="number"
            step="0.01"
            value={totalWeight || ''}
            onChange={(e) => setTotalWeight(parseFloat(e.target.value) || 0)}
            className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
            style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
            {t('shipments.create.priceKg')}
          </label>
          <input
            type="number"
            step="0.01"
            value={priceKg || ''}
            onChange={(e) => setPriceKg(parseFloat(e.target.value) || 0)}
            className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
            style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
          />
        </div>
      </div>

      {/* Computed logistics cost preview */}
      {totalWeight > 0 && priceKg > 0 && (
        <div className="px-4 py-2.5 rounded-lg" style={{ backgroundColor: `${colors.blue}10` }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {t('shipments.detail.logisticsCost')}:{' '}
          </span>
          <span className="text-sm font-medium font-mono" style={{ color: colors.blue }}>
            ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
          </span>
        </div>
      )}
    </div>
  );

  const renderRateStep = () => {
    const future = isFutureDate(sentDate);

    return (
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('shipments.create.exchangeRate')}
        </label>

        {future && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.orange}10`, borderColor: `${colors.orange}30` }}
          >
            <p className="text-xs" style={{ color: colors.orange }}>
              {t('shipments.create.futureDate')}
            </p>
          </div>
        )}

        {!future && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setRateMode('auto');
                if (exchangeRate === 0 || rateFetchFailed) {
                  fetchExchangeRate(sentDate);
                }
              }}
              className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: rateMode === 'auto' ? colors.blue : colors.bgTertiary,
                color: rateMode === 'auto' ? '#fff' : colors.text,
              }}
            >
              {t('shipments.create.autoRate')}
            </button>
            <button
              type="button"
              onClick={() => setRateMode('manual')}
              className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: rateMode === 'manual' ? colors.blue : colors.bgTertiary,
                color: rateMode === 'manual' ? '#fff' : colors.text,
              }}
            >
              {t('shipments.create.manualRate')}
            </button>
          </div>
        )}

        {rateMode === 'auto' && rateFetching && (
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
            />
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              {t('shipments.create.fetchingRate')}
            </span>
          </div>
        )}

        {rateMode === 'auto' && rateFetchFailed && !rateFetching && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.red}10`, borderColor: `${colors.red}30` }}
          >
            <p className="text-xs" style={{ color: colors.red }}>
              {t('shipments.create.rateFailed')}
            </p>
          </div>
        )}

        {rateMode === 'auto' && rateSource && !rateFetching && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.green}10`, borderColor: `${colors.green}30` }}
          >
            <p className="text-xs" style={{ color: colors.green }}>
              {t('shipments.create.rateFetched', { source: rateSource })}
            </p>
          </div>
        )}

        <div className="mb-4">
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              value={exchangeRate || ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setExchangeRate(isNaN(val) ? 0 : val);
              }}
              disabled={rateMode === 'auto' && !rateFetchFailed && rateFetching}
              readOnly={rateMode === 'auto' && !rateFetchFailed && !rateFetching && exchangeRate > 0}
              placeholder="0.0000"
              className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: colors.bgTertiary,
                borderColor: errors.rate ? colors.red : colors.border,
                color: colors.text,
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-xs" style={{ color: colors.textSecondary }}>
                USD/CNY
              </span>
            </div>
          </div>
          {errors.rate && <p className="mt-1 text-xs" style={{ color: colors.red }}>{errors.rate}</p>}
        </div>
      </div>
    );
  };

  const renderItemsStep = () => (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setItemEntryMode('manual')}
          className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: itemEntryMode === 'manual' ? colors.blue : colors.bgTertiary,
            color: itemEntryMode === 'manual' ? '#fff' : colors.text,
          }}
        >
          {t('shipments.create.itemsManual')}
        </button>
        <button
          type="button"
          onClick={() => setItemEntryMode('excel')}
          className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: itemEntryMode === 'excel' ? colors.blue : colors.bgTertiary,
            color: itemEntryMode === 'excel' ? '#fff' : colors.text,
          }}
        >
          {t('shipments.create.itemsExcel')}
        </button>
      </div>

      {errors.items && (
        <p className="mb-3 text-xs" style={{ color: colors.red }}>{errors.items}</p>
      )}

      {itemEntryMode === 'excel' ? (
        <div>
          {/* Upload area */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center mb-3"
            style={{ borderColor: colors.border }}
          >
            <svg
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: colors.textSecondary }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm mb-1" style={{ color: colors.text }}>
              {t('shipments.create.uploadExcel')}
            </p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
              {t('shipments.create.uploadHint')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              className="hidden"
              id="shipment-excel-upload"
            />
            <label
              htmlFor="shipment-excel-upload"
              className="inline-flex h-9 px-4 text-sm font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity items-center"
              style={{ backgroundColor: colors.blue, color: '#fff' }}
            >
              {t('shipments.create.uploadExcel')}
            </label>
          </div>

          {/* Download template */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="w-full h-9 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {t('shipments.create.downloadTemplate')}
          </button>

          {excelParseMessage && (
            <p className="mt-3 text-xs" style={{ color: excelParseError ? colors.red : colors.green }}>
              {excelParseMessage}
            </p>
          )}

          {/* Preview parsed items */}
          {selectedItems.length > 0 && selectedItems.some(i => i.sendQty > 0) && (
            <div className="mt-4">
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: colors.bgTertiary }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>PO#</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>SKU</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('shipments.create.sendQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.filter(i => i.sendQty > 0).map((item) => (
                      <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                        <td className="px-3 py-2" style={{ color: colors.text }}>{item.sku}</td>
                        <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.sendQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Manual mode: available POs */}
          <h4 className="text-sm font-medium mb-3" style={{ color: colors.text }}>
            {t('shipments.create.selectPos')}
          </h4>

          {posLoading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
              />
            </div>
          ) : selectedItems.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {t('shipments.create.noPosAvailable')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Group by PO */}
              {(() => {
                const grouped = new Map<string, SelectedItem[]>();
                selectedItems.forEach(item => {
                  const arr = grouped.get(item.poNum) || [];
                  arr.push(item);
                  grouped.set(item.poNum, arr);
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
                          <span className="text-[10px] w-16 text-right" style={{ color: colors.textTertiary }}>
                            {t('shipments.create.shipped')}: {item.shippedQty}
                          </span>
                          <span className="text-[10px] w-16 text-right" style={{ color: colors.orange }}>
                            {t('shipments.create.remaining')}: {item.remainingQty}
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={item.sendQty || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              updateSendQty(item.poNum, item.sku, isNaN(val) ? 0 : val);
                            }}
                            placeholder={t('shipments.create.sendQty')}
                            className="w-20 h-8 px-2 border rounded text-sm text-right focus:outline-none"
                            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
                          />
                          <label className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                            <input
                              type="checkbox"
                              checked={item.isRounded}
                              onChange={() => toggleRounded(item.poNum, item.sku)}
                              className="w-3 h-3"
                            />
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
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
        {t('shipments.create.summary')}
      </h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summaryLogistic')}</span>
          <span className="text-sm font-medium font-mono" style={{ color: colors.text }}>{logisticNum}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summarySentDate')}</span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>{sentDate}</span>
        </div>
        {etaDate && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
            <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summaryEta')}</span>
            <span className="text-sm font-medium" style={{ color: colors.text }}>{etaDate}</span>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summaryPallets')}</span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>{pallets || '-'}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summaryCost')}</span>
          <span className="text-sm font-medium font-mono" style={{ color: colors.text }}>
            ¥{logisticsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>{t('shipments.create.summaryRate')}</span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>{exchangeRate.toFixed(4)}</span>
        </div>
      </div>

      {/* Items table */}
      <div>
        <h4 className="text-sm font-medium mb-2" style={{ color: colors.text }}>
          {t('shipments.create.summaryItems')} ({validItems.length})
        </h4>
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
              {validItems.map((item) => (
                <tr key={`${item.poNum}-${item.sku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                  <td className="px-3 py-2" style={{ color: colors.blue }}>{item.poNum}</td>
                  <td className="px-3 py-2" style={{ color: colors.text }}>{item.sku}</td>
                  <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.sendQty}</td>
                  <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{item.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: colors.text }}>
                    {(Math.round(item.sendQty * item.unitPrice * 100000) / 100000).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total */}
      <div
        className="p-4 rounded-lg border"
        style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
            {t('shipments.create.summaryTotal')}
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
  );

  // ================================
  // Main render
  // ================================

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('shipments.create.title')}
        footerLeft={
          activeStep !== 'logistics' ? (
            <button type="button" onClick={handleBack} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {tCommon('back')}
            </button>
          ) : undefined
        }
        footerRight={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {tCommon('cancel')}
            </button>
            {activeStep === 'confirm' ? (
              <button type="button" onClick={handleSubmit} className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: colors.blue }}>
                {t('shipments.create.submit')}
              </button>
            ) : (
              <button type="button" onClick={handleNext} className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: colors.blue }}>
                {tCommon('next')}
              </button>
            )}
          </div>
        }
      >
          {/* Pill Nav */}
          <div className="flex justify-center mb-4">
            <PillNav steps={pills} activeStep={activeStep} onStepChange={handleStepChange} completedSteps={completedSteps} />
          </div>

          {/* Content */}
          {activeStep === 'logistics' && renderLogisticsStep()}
          {activeStep === 'rate' && renderRateStep()}
          {activeStep === 'items' && renderItemsStep()}
          {activeStep === 'confirm' && renderConfirmStep()}
      </ModalShell>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L3"
        title={t('shipments.create.title')}
        description={t('shipments.create.securityDescription')}
        onConfirm={handleSecurityConfirm}
        onCancel={() => {
          setShowSecurityDialog(false);
          setSecurityError(undefined);
        }}
        isLoading={createMutation.isPending}
        error={securityError}
      />
    </>
  );
}
