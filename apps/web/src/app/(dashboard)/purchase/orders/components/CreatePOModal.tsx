'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Supplier, type SupplierStrategy } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { PillNav } from '@/components/ui/pill-nav';
import * as XLSX from 'xlsx';

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

interface StepErrors {
  supplier?: string;
  date?: string;
  rate?: string;
  items?: string;
  itemRows?: Record<string, { sku?: string; quantity?: string; unitPrice?: string }>;
}

const STEP_KEYS = ['supplier', 'strategy', 'rate', 'items', 'confirm'] as const;

const PILLS = [
  { key: 'supplier', label: '' },
  { key: 'strategy', label: '' },
  { key: 'rate', label: '' },
  { key: 'items', label: '' },
  { key: 'confirm', label: '' },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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

export default function CreatePOModal({ isOpen, onClose, onSuccess }: CreatePOModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [activeStep, setActiveStep] = useState('supplier');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [orderDate, setOrderDate] = useState(formatDate(new Date()));
  const [strategy, setStrategy] = useState<SupplierStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  // V1 parity: "Use Original" vs "Use Custom" strategy choice
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
  const [errors, setErrors] = useState<StepErrors>({});
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate pill labels from i18n
  const pills = PILLS.map((p) => ({
    ...p,
    label: t(`orders.create.pill.${p.key}`),
  }));

  // --- Fetch active suppliers ---
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['activeSuppliers'],
    queryFn: () => purchaseApi.getActiveSuppliers(),
    enabled: isOpen,
  });

  // V1 parity: fetch SKU list for dropdown (from Data_COGS / products table)
  const { data: skuList = [] } = useQuery({
    queryKey: ['skuList'],
    queryFn: () => purchaseApi.getSkuList(),
    enabled: isOpen,
  });

  // --- Reset on open/close ---
  useEffect(() => {
    if (isOpen) {
      setActiveStep('supplier');
      setCompletedSteps([]);
      setSelectedSupplier(null);
      setOrderDate(formatDate(new Date()));
      setStrategy(null);
      setStrategyLoading(false);
      setExchangeRate(0);
      setRateMode('auto');
      setRateSource('');
      setRateFetching(false);
      setRateFetchFailed(false);
      setItems([{ id: generateId(), sku: '', quantity: 0, unitPrice: 0, note: '' }]);
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

  // --- Fetch strategy when supplier + date selected ---
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

    // Try source 1: fawazahmed0 currency-api
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

    // All sources failed
    setRateFetchFailed(true);
    setRateMode('manual');
    setRateFetching(false);
  }, []);

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: (secCode: string) => {
      const sv = getEffectiveStrategyValues();
      return purchaseApi.createOrder({
        supplierCode: selectedSupplier!.supplierCode,
        poDate: orderDate,
        items: items.map((i) => ({
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          currency: sv.currency,
          exchangeRate: exchangeRate,
          note: i.note || undefined,
        })),
        strategy: {
          strategyDate: orderDate,
          currency: sv.currency,
          exchangeRate: exchangeRate,
          rateMode: rateMode,
          floatEnabled: sv.floatEnabled,
          floatThreshold: sv.floatThreshold,
          requireDeposit: sv.requireDeposit,
          depositRatio: sv.depositRatio,
        },
        sec_code_l3: secCode,
      });
    },
    onSuccess: () => {
      setShowSecurityDialog(false);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
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
  const validateSupplierStep = (): boolean => {
    const newErrors: StepErrors = {};
    if (!selectedSupplier) {
      newErrors.supplier = t('orders.errors.supplierRequired');
    }
    if (!orderDate) {
      newErrors.date = t('orders.errors.dateRequired');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRateStep = (): boolean => {
    const newErrors: StepErrors = {};
    if (!exchangeRate || exchangeRate <= 0) {
      newErrors.rate = t('orders.errors.ratePositive');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItemsStep = (): boolean => {
    const newErrors: StepErrors = {};
    const rowErrors: Record<string, { sku?: string; quantity?: string; unitPrice?: string }> = {};

    if (items.length === 0) {
      newErrors.items = t('orders.errors.noItems');
      setErrors(newErrors);
      return false;
    }

    let hasError = false;
    // V1 parity: build valid SKU set for forced validation
    const validSkuSet = new Set(skuList.map((s) => s.sku.toUpperCase()));

    items.forEach((item) => {
      const err: { sku?: string; quantity?: string; unitPrice?: string } = {};
      if (!item.sku.trim()) {
        err.sku = t('orders.errors.skuRequired');
        hasError = true;
      } else if (validSkuSet.size > 0 && !validSkuSet.has(item.sku.trim().toUpperCase())) {
        // V1 parity: SKU must exist in database
        err.sku = t('orders.errors.skuNotFound');
        hasError = true;
      }
      if (!item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        err.quantity = t('orders.errors.qtyPositive');
        hasError = true;
      }
      if (!item.unitPrice || item.unitPrice <= 0) {
        err.unitPrice = t('orders.errors.pricePositive');
        hasError = true;
      }
      if (Object.keys(err).length > 0) {
        rowErrors[item.id] = err;
      }
    });

    if (hasError) {
      newErrors.itemRows = rowErrors;
    }
    setErrors(newErrors);
    return !hasError;
  };

  // --- Navigation ---
  const handleStepChange = (key: string) => {
    const currentIdx = STEP_KEYS.indexOf(activeStep as typeof STEP_KEYS[number]);
    const targetIdx = STEP_KEYS.indexOf(key as typeof STEP_KEYS[number]);

    // Going forward — validate current step
    if (targetIdx > currentIdx) {
      if (activeStep === 'supplier' && !validateSupplierStep()) return;
      if (activeStep === 'rate' && !validateRateStep()) return;
      if (activeStep === 'items' && !validateItemsStep()) return;
    }

    // Mark current as completed when moving forward
    if (targetIdx > currentIdx) {
      setCompletedSteps((prev) => {
        const updated = new Set(prev);
        for (let i = 0; i <= currentIdx; i++) {
          updated.add(STEP_KEYS[i]);
        }
        return Array.from(updated);
      });
    }

    // Trigger side effects when entering a step
    if (key === 'strategy' && selectedSupplier && orderDate) {
      fetchStrategy(selectedSupplier.supplierCode, orderDate);
    }
    if (key === 'rate' && rateMode === 'auto' && exchangeRate === 0) {
      fetchExchangeRate(orderDate);
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
  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: generateId(), sku: '', quantity: 0, unitPrice: 0, note: '' },
    ]);
  };

  const removeItemRow = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof ItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
    // Clear row-level error
    if (errors.itemRows?.[id]) {
      setErrors((prev) => {
        const updated = { ...prev };
        if (updated.itemRows) {
          const rowErr = { ...updated.itemRows[id] };
          delete rowErr[field as keyof typeof rowErr];
          if (Object.keys(rowErr).length === 0) {
            const newRowErrors = { ...updated.itemRows };
            delete newRowErrors[id];
            updated.itemRows = Object.keys(newRowErrors).length > 0 ? newRowErrors : undefined;
          } else {
            updated.itemRows = { ...updated.itemRows, [id]: rowErr };
          }
        }
        return updated;
      });
    }
  };

  /**
   * V1 parity: Excel upload with validation.
   * V1 layout: B1=header, C2=supplier, E2=date, G2=currency, data from Row 5 cols B/C/D
   * Also supports simple format: col 0=SKU, col 1=Qty, col 2=Price (header row + data)
   */
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

        // Helper: read cell by Excel reference (e.g. "B1") — avoids sheet_to_json offset issues
        const cell = (ref: string): string => {
          const c = ws[ref];
          if (!c) return '';
          if (c.t === 'n') return String(c.v); // numeric
          return String(c.v ?? '');
        };

        // Detect V1 format: B1 = "Eaglestar Purchase Order Form"
        const b1 = cell('B1').trim();
        const isV1Format = b1 === 'Eaglestar Purchase Order Form';

        if (isV1Format) {
          // V1 format: validate metadata cells by direct reference

          // C2: supplier code
          const excelSupplier = cell('C2').trim().toUpperCase();
          const expectedSupplier = selectedSupplier?.supplierCode?.toUpperCase() || '';
          if (excelSupplier && expectedSupplier && excelSupplier !== expectedSupplier) {
            setExcelParseMessage(t('orders.create.excelSupplierMismatch', {
              expected: expectedSupplier,
              actual: excelSupplier,
            }));
            setExcelParseError(true);
            return;
          }

          // E2: date
          const excelDate = cell('E2').trim();
          if (excelDate && orderDate) {
            const normalizeDate = (d: string): string => {
              if (!isNaN(Number(d))) {
                const serial = Number(d);
                if (serial > 40000 && serial < 60000) {
                  const dt = new Date((serial - 25569) * 86400 * 1000);
                  return dt.toISOString().slice(0, 10);
                }
              }
              const m = d.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
              if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
              return d;
            };
            if (normalizeDate(excelDate) !== orderDate) {
              setExcelParseMessage(t('orders.create.excelDateMismatch', {
                expected: orderDate,
                actual: excelDate,
              }));
              setExcelParseError(true);
              return;
            }
          }

          // G2: currency (template may use F2 or G2 depending on version)
          const excelCurrency = (cell('G2') || cell('F2')).trim().toUpperCase();
          const sv = getEffectiveStrategyValues();
          if (excelCurrency && sv.currency && excelCurrency !== sv.currency) {
            setExcelParseMessage(t('orders.create.excelCurrencyMismatch', {
              expected: sv.currency,
              actual: excelCurrency,
            }));
            setExcelParseError(true);
            return;
          }

          // V1: data starts at row 5, columns B(SKU)/C(Qty)/D(Price)
          const parsedItems: ItemRow[] = [];
          const parseErrors: string[] = [];

          for (let r = 5; r <= 1004; r++) {
            const sku = cell(`B${r}`).trim().toUpperCase();
            if (!sku) continue;

            const qty = Number(cell(`C${r}`));
            const price = Number(cell(`D${r}`));

            if (isNaN(qty) || qty <= 0) {
              parseErrors.push(`Row ${r}: ${sku} — ${t('orders.errors.qtyPositive')}`);
            }
            if (isNaN(price) || price <= 0) {
              parseErrors.push(`Row ${r}: ${sku} — ${t('orders.errors.pricePositive')}`);
            }

            parsedItems.push({
              id: generateId(),
              sku,
              quantity: isNaN(qty) || qty <= 0 ? 0 : Math.round(qty),
              unitPrice: isNaN(price) || price <= 0 ? 0 : parseFloat(price.toFixed(5)),
              note: '',
            });
          }

          if (parsedItems.length > 0) {
            setItems(parsedItems);
            const msg = t('orders.create.parseSuccess', { count: parsedItems.length });
            setExcelParseMessage(parseErrors.length > 0 ? `${msg}\n${parseErrors.join('\n')}` : msg);
            setExcelParseError(false);
          } else {
            setExcelParseMessage(t('orders.create.parseFailed'));
            setExcelParseError(true);
          }
        } else {
          // Simple format: use sheet_to_json, first row header, cols 0/1/2
          const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          const parsedItems: ItemRow[] = [];
          const parseErrors: string[] = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const sku = String(row[0] || '').trim().toUpperCase();
            if (!sku) continue;
            const qty = Number(row[1]);
            const price = Number(row[2]);

            if (isNaN(qty) || qty <= 0) parseErrors.push(`Row ${i + 1}: ${sku} — ${t('orders.errors.qtyPositive')}`);
            if (isNaN(price) || price <= 0) parseErrors.push(`Row ${i + 1}: ${sku} — ${t('orders.errors.pricePositive')}`);

            parsedItems.push({
              id: generateId(),
              sku,
              quantity: isNaN(qty) || qty <= 0 ? 0 : Math.round(qty),
              unitPrice: isNaN(price) || price <= 0 ? 0 : parseFloat(price.toFixed(5)),
              note: '',
            });
          }

          if (parsedItems.length > 0) {
            setItems(parsedItems);
            const msg = t('orders.create.parseSuccess', { count: parsedItems.length });
            setExcelParseMessage(parseErrors.length > 0 ? `${msg}\n${parseErrors.join('\n')}` : msg);
            setExcelParseError(false);
          } else {
            setExcelParseMessage(t('orders.create.parseFailed'));
            setExcelParseError(true);
          }
        }
      } catch {
        setExcelParseMessage(t('orders.create.parseFailed'));
        setExcelParseError(true);
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * V1 parity: download pre-filled template from backend (Apache POI).
   * Backend generates formatted Excel with cell styles, protection (password "1522"),
   * locked cells, and V1-exact layout (B1=title, C2=supplier, E2=date, G2=currency).
   */
  const downloadTemplate = () => {
    const supplierCode = selectedSupplier?.supplierCode || '';
    const sv = getEffectiveStrategyValues();
    const url = purchaseApi.getTemplateUrl(supplierCode, orderDate, sv.currency, {
      exchangeRate: exchangeRate,
      floatEnabled: sv.floatEnabled,
      floatThreshold: sv.floatThreshold,
      depositEnabled: sv.requireDeposit,
      depositRatio: sv.depositRatio,
    });

    // Download via authenticated fetch
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
        a.download = `PO_Template_${supplierCode}_${orderDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        // Fallback: client-side generation if backend unavailable
        const ws = XLSX.utils.aoa_to_sheet([]);
        XLSX.utils.sheet_add_aoa(ws, [[null, 'Eaglestar Purchase Order Form']], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(ws, [[null, null, supplierCode, null, orderDate, null, sv.currency]], { origin: 'A2' });
        XLSX.utils.sheet_add_aoa(ws, [[null, 'SKU', '数量', '单价']], { origin: 'A4' });
        ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 5 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '采购订单明细');
        XLSX.writeFile(wb, `PO_Template_${supplierCode}_${orderDate}.xlsx`);
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

  // --- Computed totals ---
  // V1 parity: use effective strategy currency (original or custom)
  const currency = useOriginalStrategy ? (strategy?.currency || 'USD') : customCurrency;
  const totalRaw = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const totalRMB =
    currency === 'USD' ? totalRaw * exchangeRate : totalRaw;
  const totalUSD =
    currency === 'USD'
      ? totalRaw
      : exchangeRate > 0
        ? totalRaw / exchangeRate
        : 0;

  // --- Early return ---
  if (!isOpen) return null;

  // --- Success state ---
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-lg rounded-2xl border shadow-2xl p-8 text-center"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${colors.green}20` }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: colors.green }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
            {t('orders.create.success')}
          </h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {selectedSupplier?.supplierCode} - {selectedSupplier?.supplierName}
          </p>
        </div>
      </div>
    );
  }

  // ================================
  // Pill Content Renderers
  // ================================

  const renderSupplierStep = () => (
    <div>
      {/* Order Date */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('orders.create.orderDate')}
        </label>
        <input
          type="date"
          value={orderDate}
          onChange={(e) => {
            setOrderDate(e.target.value);
            // Reset rate when date changes
            if (rateMode === 'auto') {
              setExchangeRate(0);
              setRateSource('');
            }
          }}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
          style={{
            backgroundColor: colors.bgTertiary,
            borderColor: errors.date ? colors.red : colors.border,
            color: colors.text,
          }}
        />
        <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
          {t('orders.create.orderDateHint')}
        </p>
        {errors.date && (
          <p className="mt-1 text-xs" style={{ color: colors.red }}>
            {errors.date}
          </p>
        )}
      </div>

      {/* Supplier Selection */}
      <div className="mb-2">
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('orders.create.selectSupplier')}
        </label>
        {errors.supplier && (
          <p className="mb-2 text-xs" style={{ color: colors.red }}>
            {errors.supplier}
          </p>
        )}
      </div>

      {suppliersLoading ? (
        <div className="flex items-center justify-center py-8">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
          />
          <span className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
            {tCommon('loading')}
          </span>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {t('orders.create.noSuppliers')}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {suppliers.map((sup) => {
            const isSelected = selectedSupplier?.id === sup.id;
            return (
              <button
                key={sup.id}
                type="button"
                onClick={() => setSelectedSupplier(sup)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left"
                style={{
                  backgroundColor: isSelected ? `${colors.blue}15` : colors.bgTertiary,
                  borderColor: isSelected ? colors.blue : colors.border,
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    backgroundColor: isSelected ? `${colors.blue}25` : `${colors.gray}20`,
                    color: isSelected ? colors.blue : colors.textSecondary,
                  }}
                >
                  {sup.supplierCode}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: colors.text }}>
                    {sup.supplierName}
                  </p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    {sup.supplierCode}
                  </p>
                </div>
                {isSelected && (
                  <svg
                    className="w-5 h-5 shrink-0"
                    style={{ color: colors.blue }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // V1 parity helper: get effective strategy values (original or custom)
  const getEffectiveStrategyValues = () => {
    if (useOriginalStrategy && strategy) {
      return {
        currency: strategy.currency,
        floatEnabled: strategy.floatCurrency,
        floatThreshold: strategy.floatThreshold,
        requireDeposit: strategy.requireDeposit,
        depositRatio: strategy.depositRatio,
      };
    }
    return {
      currency: customCurrency,
      floatEnabled: customFloatEnabled,
      floatThreshold: customFloatThreshold,
      requireDeposit: customDepositEnabled,
      depositRatio: customDepositRatio,
    };
  };

  const renderToggleField = (opts: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between mb-3">
      <label className="text-sm font-medium" style={{ color: colors.text }}>{opts.label}</label>
      <button
        type="button"
        onClick={() => opts.onChange(!opts.checked)}
        className="relative w-11 h-6 rounded-full transition-colors"
        style={{ backgroundColor: opts.checked ? colors.green : colors.bgTertiary }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: opts.checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );

  const renderStrategyStep = () => (
    <div>
      {strategyLoading ? (
        <div className="flex items-center justify-center py-8">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
          />
          <span className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
            {tCommon('loading')}
          </span>
        </div>
      ) : !strategy ? (
        <div
          className="p-4 rounded-lg border"
          style={{ backgroundColor: `${colors.orange}10`, borderColor: `${colors.orange}30` }}
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" style={{ color: colors.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-sm font-medium" style={{ color: colors.orange }}>
              {t('orders.create.noStrategy')}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {/* Current Strategy (read-only) */}
          <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
            {t('orders.create.strategyPreview')}
          </p>
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="text-sm" style={{ color: colors.textSecondary }}>{t('orders.detail.currency')}</span>
              <span className="text-sm font-medium font-mono" style={{ color: colors.blue }}>{strategy.currency}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="text-sm" style={{ color: colors.textSecondary }}>{t('orders.detail.floatEnabled')}</span>
              <span className="text-sm font-medium" style={{ color: strategy.floatCurrency ? colors.green : colors.textSecondary }}>
                {strategy.floatCurrency ? `${strategy.floatThreshold}%` : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="text-sm" style={{ color: colors.textSecondary }}>{t('orders.detail.depositEnabled')}</span>
              <span className="text-sm font-medium" style={{ color: strategy.requireDeposit ? colors.green : colors.textSecondary }}>
                {strategy.requireDeposit ? `${strategy.depositRatio}%` : '-'}
              </span>
            </div>
          </div>

          {/* V1 parity: Use Original / Use Custom toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setUseOriginalStrategy(true)}
              className="flex-1 h-10 rounded-lg text-sm font-medium border transition-all"
              style={{
                backgroundColor: useOriginalStrategy ? `${colors.green}15` : 'transparent',
                borderColor: useOriginalStrategy ? colors.green : colors.border,
                color: useOriginalStrategy ? colors.green : colors.textSecondary,
              }}
            >
              {t('orders.create.useOriginal')}
            </button>
            <button
              type="button"
              onClick={() => {
                setUseOriginalStrategy(false);
                // Initialize custom values from original
                setCustomCurrency(strategy.currency);
                setCustomFloatEnabled(strategy.floatCurrency);
                setCustomFloatThreshold(strategy.floatThreshold);
                setCustomDepositEnabled(strategy.requireDeposit);
                setCustomDepositRatio(strategy.depositRatio);
              }}
              className="flex-1 h-10 rounded-lg text-sm font-medium border transition-all"
              style={{
                backgroundColor: !useOriginalStrategy ? `${colors.orange}15` : 'transparent',
                borderColor: !useOriginalStrategy ? colors.orange : colors.border,
                color: !useOriginalStrategy ? colors.orange : colors.textSecondary,
              }}
            >
              {t('orders.create.useCustom')}
            </button>
          </div>

          {/* Custom Strategy Fields (V1 Step 3 custom panel) */}
          {!useOriginalStrategy && (
            <div className="space-y-3 pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
              {/* Currency radio */}
              <div className="mb-3">
                <label className="block text-sm font-medium mb-2" style={{ color: colors.text }}>
                  {t('orders.detail.currency')}
                </label>
                <div className="flex gap-3">
                  {['USD', 'RMB'].map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setCustomCurrency(cur)}
                      className="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                      style={{
                        backgroundColor: customCurrency === cur ? `${colors.blue}15` : 'transparent',
                        borderColor: customCurrency === cur ? colors.blue : colors.border,
                        color: customCurrency === cur ? colors.blue : colors.textSecondary,
                      }}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              {/* Float toggle */}
              {renderToggleField({
                label: t('add.field.floatCurrency'),
                checked: customFloatEnabled,
                onChange: (v) => {
                  setCustomFloatEnabled(v);
                  if (!v) setCustomFloatThreshold(0);
                },
              })}
              {customFloatEnabled && (
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('add.field.floatThreshold')}
                  </label>
                  <input
                    type="number"
                    value={customFloatThreshold || ''}
                    onChange={(e) => setCustomFloatThreshold(parseFloat(e.target.value) || 0)}
                    placeholder="1-10"
                    className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none"
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              )}

              {/* Deposit toggle */}
              {renderToggleField({
                label: t('add.field.requireDeposit'),
                checked: customDepositEnabled,
                onChange: (v) => {
                  setCustomDepositEnabled(v);
                  if (!v) setCustomDepositRatio(0);
                },
              })}
              {customDepositEnabled && (
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                    {t('add.field.depositRatio')}
                  </label>
                  <input
                    type="number"
                    value={customDepositRatio || ''}
                    onChange={(e) => setCustomDepositRatio(parseFloat(e.target.value) || 0)}
                    placeholder=">0"
                    className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none"
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderRateStep = () => {
    const future = isFutureDate(orderDate);

    return (
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('orders.create.exchangeRate')}
        </label>

        {/* Future date notice */}
        {future && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.orange}10`, borderColor: `${colors.orange}30` }}
          >
            <p className="text-xs" style={{ color: colors.orange }}>
              {t('orders.create.futureDate')}
            </p>
          </div>
        )}

        {/* Auto/Manual toggle */}
        {!future && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setRateMode('auto');
                if (exchangeRate === 0 || rateFetchFailed) {
                  fetchExchangeRate(orderDate);
                }
              }}
              className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: rateMode === 'auto' ? colors.blue : colors.bgTertiary,
                color: rateMode === 'auto' ? '#fff' : colors.text,
              }}
            >
              {t('orders.create.autoRate')}
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
              {t('orders.create.manualRate')}
            </button>
          </div>
        )}

        {/* Rate fetch status */}
        {rateMode === 'auto' && rateFetching && (
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
            />
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              {t('orders.create.fetchingRate')}
            </span>
          </div>
        )}

        {rateMode === 'auto' && rateFetchFailed && !rateFetching && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.red}10`, borderColor: `${colors.red}30` }}
          >
            <p className="text-xs" style={{ color: colors.red }}>
              {t('orders.create.rateFailed')}
            </p>
          </div>
        )}

        {rateMode === 'auto' && rateSource && !rateFetching && (
          <div
            className="mb-3 p-3 rounded-lg border"
            style={{ backgroundColor: `${colors.green}10`, borderColor: `${colors.green}30` }}
          >
            <p className="text-xs" style={{ color: colors.green }}>
              {t('orders.create.rateFetched', { source: rateSource })}
            </p>
          </div>
        )}

        {/* Rate input */}
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
          {errors.rate && (
            <p className="mt-1 text-xs" style={{ color: colors.red }}>
              {errors.rate}
            </p>
          )}
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
          {t('orders.create.itemsManual')}
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
          {t('orders.create.itemsExcel')}
        </button>
      </div>

      {errors.items && (
        <p className="mb-3 text-xs" style={{ color: colors.red }}>
          {errors.items}
        </p>
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
              {t('orders.create.uploadExcel')}
            </p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
              {t('orders.create.uploadHint')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              className="hidden"
              id="excel-upload"
            />
            <label
              htmlFor="excel-upload"
              className="inline-flex h-9 px-4 text-sm font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity items-center"
              style={{ backgroundColor: colors.blue, color: '#fff' }}
            >
              {t('orders.create.uploadExcel')}
            </label>
          </div>

          {/* Download template */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="w-full h-9 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {t('orders.create.downloadTemplate')}
          </button>

          {/* Parse result message */}
          {excelParseMessage && (
            <p
              className="mt-3 text-xs"
              style={{ color: excelParseError ? colors.red : colors.green }}
            >
              {excelParseMessage}
            </p>
          )}

          {/* Preview parsed items */}
          {items.length > 0 && items[0].sku && (
            <div className="mt-4">
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: colors.bgTertiary }}>
                      <th
                        className="text-left px-3 py-2 font-medium"
                        style={{ color: colors.textSecondary }}
                      >
                        SKU
                      </th>
                      <th
                        className="text-right px-3 py-2 font-medium"
                        style={{ color: colors.textSecondary }}
                      >
                        {t('orders.detail.qty')}
                      </th>
                      <th
                        className="text-right px-3 py-2 font-medium"
                        style={{ color: colors.textSecondary }}
                      >
                        {t('orders.detail.unitPrice')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td className="px-3 py-2" style={{ color: colors.text }}>
                          {item.sku}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: colors.text }}>
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: colors.text }}>
                          {item.unitPrice.toFixed(2)}
                        </td>
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
          {/* Manual entry table */}
          <div className="space-y-3">
            {items.map((item, idx) => {
              const rowErr = errors.itemRows?.[item.id];
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: rowErr ? colors.red : colors.border,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                      #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.id)}
                        className="text-xs hover:opacity-70 transition-opacity"
                        style={{ color: colors.red }}
                      >
                        {t('orders.create.removeRow')}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {/* SKU — V1 parity: dropdown from database, not free text */}
                    <div className="col-span-3 relative">
                      <input
                        type="text"
                        list={`sku-list-${item.id}`}
                        value={item.sku}
                        onChange={(e) => updateItem(item.id, 'sku', e.target.value.toUpperCase())}
                        placeholder={t('orders.create.skuPlaceholder')}
                        className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: rowErr?.sku ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      <datalist id={`sku-list-${item.id}`}>
                        {skuList.map((s) => (
                          <option key={s.sku} value={s.sku}>
                            {s.sku} — {s.name}
                          </option>
                        ))}
                      </datalist>
                      {rowErr?.sku && (
                        <p className="mt-0.5 text-xs" style={{ color: colors.red }}>
                          {rowErr.sku}
                        </p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div>
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateItem(item.id, 'quantity', isNaN(val) ? 0 : val);
                        }}
                        placeholder={t('orders.create.qtyPlaceholder')}
                        className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: rowErr?.quantity ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      {rowErr?.quantity && (
                        <p className="mt-0.5 text-xs" style={{ color: colors.red }}>
                          {rowErr.quantity}
                        </p>
                      )}
                    </div>

                    {/* Unit Price */}
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updateItem(item.id, 'unitPrice', isNaN(val) ? 0 : val);
                        }}
                        placeholder={t('orders.create.pricePlaceholder')}
                        className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: rowErr?.unitPrice ? colors.red : colors.border,
                          color: colors.text,
                        }}
                      />
                      {rowErr?.unitPrice && (
                        <p className="mt-0.5 text-xs" style={{ color: colors.red }}>
                          {rowErr.unitPrice}
                        </p>
                      )}
                    </div>

                    {/* Note */}
                    <div>
                      <input
                        type="text"
                        value={item.note}
                        onChange={(e) => updateItem(item.id, 'note', e.target.value)}
                        placeholder={t('orders.create.notePlaceholder')}
                        className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.border,
                          color: colors.text,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Row button */}
          <button
            type="button"
            onClick={addItemRow}
            className="mt-3 w-full h-9 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
            style={{ backgroundColor: colors.bgTertiary, color: colors.blue }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('orders.create.addRow')}
          </button>
        </div>
      )}
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
        {t('orders.create.summary')}
      </h3>

      {/* Summary fields */}
      <div className="space-y-2">
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ backgroundColor: colors.bgTertiary }}
        >
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {t('orders.create.summarySupplier')}
          </span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>
            {selectedSupplier?.supplierCode} - {selectedSupplier?.supplierName}
          </span>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ backgroundColor: colors.bgTertiary }}
        >
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {t('orders.create.summaryDate')}
          </span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>
            {orderDate}
          </span>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ backgroundColor: colors.bgTertiary }}
        >
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {t('orders.create.summaryCurrency')}
          </span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>
            {currency}
          </span>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ backgroundColor: colors.bgTertiary }}
        >
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {t('orders.create.summaryRate')}
          </span>
          <span className="text-sm font-medium" style={{ color: colors.text }}>
            {exchangeRate.toFixed(4)} ({rateMode === 'auto' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')})
          </span>
        </div>

        {/* Strategy summary — uses effective values (original or custom) */}
        {(() => {
          const sv = getEffectiveStrategyValues();
          return (
            <>
              <div
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ backgroundColor: colors.bgTertiary }}
              >
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.floatEnabled')}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: sv.floatEnabled ? colors.green : colors.textSecondary }}
                >
                  {sv.floatEnabled ? `${sv.floatThreshold}%` : '-'}
                </span>
              </div>

              <div
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ backgroundColor: colors.bgTertiary }}
              >
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.depositEnabled')}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: sv.requireDeposit ? colors.green : colors.textSecondary }}
                >
                  {sv.requireDeposit ? `${sv.depositRatio}%` : '-'}
                </span>
              </div>
            </>
          );
        })()}
      </div>

      {/* Items table */}
      <div>
        <h4 className="text-sm font-medium mb-2" style={{ color: colors.text }}>
          {t('orders.create.summaryItems')} ({items.length})
        </h4>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>
                  SKU
                </th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.qty')}
                </th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.unitPrice')}
                </th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>
                  {t('orders.detail.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                  <td className="px-3 py-2" style={{ color: colors.text }}>
                    {item.sku}
                    {item.note && (
                      <span className="block text-xs" style={{ color: colors.textSecondary }}>
                        {item.note}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: colors.text }}>
                    {item.quantity}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: colors.text }}>
                    {item.unitPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: colors.text }}>
                    {(item.quantity * item.unitPrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div
        className="p-4 rounded-lg border space-y-2"
        style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
            {t('orders.detail.totalRMB')}
          </span>
          <span className="text-base font-semibold" style={{ color: colors.text }}>
            ¥{totalRMB.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
            {t('orders.detail.totalUSD')}
          </span>
          <span className="text-base font-semibold" style={{ color: colors.text }}>
            ${totalUSD.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );

  // ================================
  // Main render
  // ================================

  return (
    <>
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
            <h2 className="text-[17px] font-semibold" style={{ color: colors.text }}>
              {t('orders.create.title')}
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke={colors.textSecondary}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Pill Nav */}
          <div className="flex justify-center px-6 pt-4 pb-2">
            <PillNav
              steps={pills}
              activeStep={activeStep}
              onStepChange={handleStepChange}
              completedSteps={completedSteps}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-4 flex-1 overflow-y-auto" style={{ maxHeight: '450px' }}>
            {activeStep === 'supplier' && renderSupplierStep()}
            {activeStep === 'strategy' && renderStrategyStep()}
            {activeStep === 'rate' && renderRateStep()}
            {activeStep === 'items' && renderItemsStep()}
            {activeStep === 'confirm' && renderConfirmStep()}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            <div>
              {activeStep !== 'supplier' && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                >
                  {tCommon('back')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {tCommon('cancel')}
              </button>

              {activeStep === 'confirm' ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: colors.blue }}
                >
                  {t('orders.create.submit')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: colors.blue }}
                >
                  {tCommon('next')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L3"
        title={t('orders.create.title')}
        description={t('orders.create.securityDescription')}
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
