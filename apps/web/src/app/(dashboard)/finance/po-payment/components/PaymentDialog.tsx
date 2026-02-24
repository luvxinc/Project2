'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi, type POPaymentListItem, type SubmitPOPaymentRequest, type POPaymentItemRequest } from '@/lib/api/finance';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { themeColors } from '@/contexts/ThemeContext';
import ModalShell from '../../../purchase/components/ModalShell';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  selectedItems: POPaymentListItem[];
  onSuccess: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  theme: string;
}

type RateOption = 'actual' | 'original' | 'paymentDate';
type PaymentMode = 'original' | 'custom';

interface PerOrderConfig {
  paymentMode: PaymentMode;
  customAmount: number;
  usePrepay: boolean;
  prepayAmount: number;
  coverStandard: boolean;
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

export default function PaymentDialog({ open, onClose, selectedItems, onSuccess, t, theme }: PaymentDialogProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;
  const queryClient = useQueryClient();

  const [paymentDate, setPaymentDate] = useState(formatDate(new Date()));
  const [rateOption, setRateOption] = useState<RateOption>('original');
  const [settlementRate, setSettlementRate] = useState<number>(0);
  const [rateFetching, setRateFetching] = useState(false);
  const [rateFetchSource, setRateFetchSource] = useState('');
  const [rateFetchFailed, setRateFetchFailed] = useState(false);

  const [showExtraFee, setShowExtraFee] = useState(false);
  const [extraAmount, setExtraAmount] = useState<number>(0);
  const [extraCurrency, setExtraCurrency] = useState<'USD' | 'RMB'>('RMB');
  const [extraNote, setExtraNote] = useState('');

  const [perOrderConfig, setPerOrderConfig] = useState<Record<string, PerOrderConfig>>({});
  const [success, setSuccess] = useState(false);
  const [actualCurrency, setActualCurrency] = useState('USD');
  const [actualAmount, setActualAmount] = useState<number>(0);

  const vendorCode = selectedItems[0]?.supplierCode ?? '';

  useEffect(() => {
    if (open) {
      setPaymentDate(formatDate(new Date()));
      setRateOption('actual');
      setSettlementRate(0);
      setRateFetching(false);
      setRateFetchSource('');
      setRateFetchFailed(false);
      setShowExtraFee(false);
      setExtraAmount(0);
      setExtraCurrency('RMB');
      setExtraNote('');
      setSuccess(false);
      setActualCurrency('USD');
      setActualAmount(0);
      submitSecurity.onCancel();

      const cfg: Record<string, PerOrderConfig> = {};
      selectedItems.forEach((item) => {
        cfg[item.poNum] = {
          paymentMode: 'original',
          customAmount: 0,
          usePrepay: false,
          prepayAmount: 0,
          coverStandard: false,
        };
      });
      setPerOrderConfig(cfg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: vendorBalance } = useQuery({
    queryKey: ['poPaymentVendorBalance', vendorCode, paymentDate],
    queryFn: () => financeApi.getPOPaymentVendorBalance(vendorCode, paymentDate),
    enabled: open && !!vendorCode,
  });

  const { data: autoRateData } = useQuery({
    queryKey: ['exchangeRate'],
    queryFn: () => financeApi.getExchangeRate(),
    enabled: open,
  });

  const fetchExchangeRate = useCallback(async (date: string) => {
    setRateFetching(true);
    setRateFetchFailed(false);
    setRateFetchSource('');

    const fetchWithTimeout = (url: string, ms = 3000) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    };

    try {
      const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) {
          setSettlementRate(parseFloat(Number(rate).toFixed(4)));
          setRateFetchSource('open.er-api.com');
          setRateFetching(false);
          return;
        }
      }
    } catch { /* fall through */ }

    try {
      const res = await fetchWithTimeout(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.usd?.cny;
        if (rate && rate > 0) {
          setSettlementRate(parseFloat(Number(rate).toFixed(4)));
          setRateFetchSource('fawazahmed0/currency-api');
          setRateFetching(false);
          return;
        }
      }
    } catch { /* fall through */ }

    try {
      const res = await fetchWithTimeout(`https://api.frankfurter.app/${date}?from=USD&to=CNY`);
      if (res.ok) {
        const data = await res.json();
        const rate = data?.rates?.CNY;
        if (rate && rate > 0) {
          setSettlementRate(parseFloat(Number(rate).toFixed(4)));
          setRateFetchSource('frankfurter.app');
          setRateFetching(false);
          return;
        }
      }
    } catch { /* fall through */ }

    if (autoRateData && autoRateData.rate > 0) {
      setSettlementRate(autoRateData.rate);
      setRateFetchSource(autoRateData.source || 'backend');
      setRateFetching(false);
      return;
    }

    setRateFetchFailed(true);
    setRateFetching(false);
  }, [autoRateData]);

  useEffect(() => {
    if (open && rateOption === 'paymentDate' && paymentDate) {
      fetchExchangeRate(paymentDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rateOption, paymentDate]);

  useEffect(() => {
    if (open && rateOption === 'actual' && paymentDate) {
      fetchExchangeRate(paymentDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rateOption, actualCurrency, paymentDate]);

  // Balance = totalAmount - depositPaid - poPaid
  const totalPendingUsd = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const cfg = perOrderConfig[item.poNum];
      if (!cfg) return sum;
      const remaining = cfg.paymentMode === 'custom' ? cfg.customAmount : round5(item.balanceRemainingUsd);
      return sum + remaining;
    }, 0);
  }, [selectedItems, perOrderConfig]);

  const updateOrder = useCallback((poNum: string, patch: Partial<PerOrderConfig>) => {
    setPerOrderConfig((prev) => ({
      ...prev,
      [poNum]: { ...prev[poNum], ...patch },
    }));
  }, []);

  const summary = useMemo(() => {
    let totalAmount = 0;
    let depositPaid = 0;
    let poPaid = 0;
    let prepayDeduction = 0;
    let cashPayment = 0;
    let pendingAfter = 0;

    const extraPerOrder = selectedItems.length > 0 && showExtraFee && extraAmount > 0
      ? round5(extraAmount / selectedItems.length)
      : 0;

    const actualCashPerOrder = rateOption === 'actual' && actualAmount > 0 && selectedItems.length > 0
      ? round5(actualAmount / selectedItems.length)
      : 0;

    selectedItems.forEach((item) => {
      const cfg = perOrderConfig[item.poNum];
      if (!cfg) return;

      totalAmount += item.totalAmountUsd;
      depositPaid += item.depositPaidUsd;
      poPaid += item.poPaidUsd;

      let remaining: number;
      if (cfg.paymentMode === 'custom') {
        remaining = cfg.customAmount;
      } else {
        remaining = round5(item.balanceRemainingUsd);
      }

      const prepay = cfg.usePrepay ? cfg.prepayAmount : 0;
      const cash = round5(Math.max(0, remaining - prepay));
      const extra = extraPerOrder;

      prepayDeduction += prepay;
      cashPayment += cash + (extraCurrency === 'USD' ? extra : 0);

      if (cfg.coverStandard) {
        pendingAfter += 0;
      } else {
        const cashForThisOrder = actualCashPerOrder > 0 ? actualCashPerOrder : cash;
        const orderPending = round5(item.balanceRemainingUsd - prepay - cashForThisOrder);
        pendingAfter += Math.max(0, orderPending);
      }
    });

    return { totalAmount, depositPaid, poPaid, prepayDeduction, cashPayment, pendingAfter };
  }, [selectedItems, perOrderConfig, showExtraFee, extraAmount, extraCurrency, rateOption, actualAmount]);

  const canSubmit = useMemo(() => {
    if (selectedItems.length === 0) return false;
    if (!paymentDate) return false;
    if (rateOption === 'actual' && (rateFetching || settlementRate <= 0)) return false;
    if (rateOption === 'paymentDate' && (!settlementRate || settlementRate <= 0)) return false;
    if (rateFetching && rateOption !== 'original') return false;
    if (showExtraFee && extraAmount > 0 && !extraNote.trim()) return false;
    return true;
  }, [selectedItems, paymentDate, rateOption, settlementRate, rateFetching, showExtraFee, extraAmount, extraNote]);

  const buildRequestItems = useCallback((): POPaymentItemRequest[] => {
    const extraPerOrder = selectedItems.length > 0 && showExtraFee && extraAmount > 0
      ? round5(extraAmount / selectedItems.length)
      : 0;

    return selectedItems
      .map((item) => {
        const cfg = perOrderConfig[item.poNum];
        if (!cfg) return null;

        const remaining = cfg.paymentMode === 'custom' ? cfg.customAmount : round5(item.balanceRemainingUsd);
        const prepay = cfg.usePrepay ? cfg.prepayAmount : 0;
        const cash = round5(Math.max(0, remaining - prepay));

        if (cash === 0 && prepay === 0 && extraPerOrder === 0) return null;

        const reqItem: POPaymentItemRequest = {
          poNum: item.poNum,
          paymentMode: cfg.paymentMode,
          prepayAmount: prepay > 0 ? prepay : undefined,
          coverStandard: cfg.coverStandard || undefined,
        };
        if (cfg.paymentMode === 'custom') {
          reqItem.customAmount = cfg.customAmount;
          reqItem.customCurrency = 'USD';
        }
        return reqItem;
      })
      .filter((x): x is POPaymentItemRequest => x !== null);
  }, [selectedItems, perOrderConfig, showExtraFee, extraAmount]);

  const submitMutation = useMutation({
    mutationFn: async (secCode: string) => {
      const items = buildRequestItems();
      const request: SubmitPOPaymentRequest = {
        poNums: items.map((i) => i.poNum),
        paymentDate,
        usePaymentDateRate: rateOption !== 'original',
        settlementRate: rateOption !== 'original' ? settlementRate : undefined,
        items,
        extraFee: showExtraFee && extraAmount > 0 ? extraAmount : undefined,
        extraFeeCurrency: showExtraFee && extraAmount > 0 ? extraCurrency : undefined,
        extraFeeNote: showExtraFee && extraAmount > 0 ? extraNote : undefined,
      };
      return financeApi.submitPOPayment(request, secCode);
    },
    onSuccess: () => {
      submitSecurity.onCancel();
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['poPaymentList'] });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
    onError: () => {
      submitSecurity.setError('Security code invalid or submission failed');
    },
  });

  const submitSecurity = useSecurityAction({
    actionKey: 'btn_po_payment_submit',
    level: 'L2',
    onExecute: (code) => submitMutation.mutate(code),
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitSecurity.trigger();
  };

  if (!open) return null;

  if (success) {
    return (
      <ModalShell isOpen={open} onClose={onClose} title={t('poPayment.payment.successTitle')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-[scaleIn_0.3s_ease-out]" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('poPayment.payment.successTitle')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{t('poPayment.payment.successDescription')}</p>
        </div>
      </ModalShell>
    );
  }

  const inputCls = 'w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors';
  const baseStyle = { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text };

  const SectionHeader = ({ icon, title: sTitle }: { icon: React.ReactNode; title: string }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
      {icon}{sTitle}
    </h3>
  );

  return (
    <>
      <ModalShell
        isOpen={open}
        onClose={onClose}
        wide
        title={t('poPayment.payment.title')}
        subtitle={t('poPayment.payment.selectedCount', { count: selectedItems.length })}
        footerLeft={
          <div className="flex items-center gap-4 text-[11px] tabular-nums" style={{ color: colors.textSecondary }}>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryTotal')} </span>
              <span className="font-medium" style={{ color: colors.text }}>${fmt(summary.totalAmount)}</span>
            </span>
            <span style={{ color: colors.border }}>|</span>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryDeposit')} </span>
              <span className="font-medium" style={{ color: colors.green }}>${fmt(summary.depositPaid)}</span>
            </span>
            <span style={{ color: colors.border }}>|</span>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryPoPaid')} </span>
              <span className="font-medium" style={{ color: colors.green }}>${fmt(summary.poPaid)}</span>
            </span>
            <span style={{ color: colors.border }}>|</span>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryPrepay')} </span>
              <span className="font-medium" style={{ color: colors.blue }}>-${fmt(summary.prepayDeduction)}</span>
            </span>
            <span style={{ color: colors.border }}>|</span>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryCash')} </span>
              <span className="font-semibold" style={{ color: colors.orange }}>
                {rateOption === 'actual' && actualAmount > 0
                  ? `${actualCurrency === 'USD' ? '$' : '¥'}${fmt(actualAmount)}`
                  : `$${fmt(summary.cashPayment)}`
                }
              </span>
            </span>
            <span style={{ color: colors.border }}>|</span>
            <span>
              <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryPending')} </span>
              <span className="font-medium" style={{ color: summary.pendingAfter > 0 ? colors.red : colors.green }}>${fmt(summary.pendingAfter)}</span>
            </span>
          </div>
        }
        footerRight={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose}
              className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? colors.green : colors.textTertiary }}>
              {t('poPayment.payment.submit')}
            </button>
          </div>
        }
      >
        <div className="flex gap-6" style={{ minHeight: '400px' }}>

          {/* LEFT: Selected Orders (40%) */}
          <div className="w-[40%] shrink-0">
            <SectionHeader
              icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>}
              title={t('poPayment.payment.selectedOrders')}
            />

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {selectedItems.map((item) => {
                const cfg = perOrderConfig[item.poNum];
                if (!cfg) return null;
                const originalRemaining = round5(item.balanceRemainingUsd);
                const thisPayment = cfg.paymentMode === 'custom' ? cfg.customAmount : originalRemaining;
                const prepay = cfg.usePrepay ? cfg.prepayAmount : 0;
                const cash = round5(Math.max(0, thisPayment - prepay));
                const actualCashPerOrder = rateOption === 'actual' && actualAmount > 0
                  ? round5(actualAmount / selectedItems.length) : 0;
                const cashForDisplay = actualCashPerOrder > 0 ? actualCashPerOrder : cash;
                const pendingAfterThis = cfg.coverStandard
                  ? 0
                  : Math.max(0, round5(item.balanceRemainingUsd - prepay - cashForDisplay));
                const hasBalance = (vendorBalance?.balanceUsd ?? 0) > 0;

                return (
                  <div key={item.poNum} className="p-3 rounded-lg border" style={{ backgroundColor: `${colors.bgTertiary}80`, borderColor: colors.border }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold" style={{ color: colors.blue }}>{item.poNum}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        backgroundColor: item.isPaid ? `${colors.green}15` : `${colors.orange}15`,
                        color: item.isPaid ? colors.green : colors.orange,
                      }}>
                        {item.paymentStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryTotal')}: </span>
                        <span className="font-mono tabular-nums" style={{ color: colors.text }}>${fmt(item.totalAmountUsd)}</span>
                      </div>
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryDeposit')}: </span>
                        <span className="font-mono tabular-nums" style={{ color: colors.green }}>${fmt(item.depositPaidUsd)}</span>
                      </div>
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.summaryPoPaid')}: </span>
                        <span className="font-mono tabular-nums" style={{ color: colors.green }}>${fmt(item.poPaidUsd)}</span>
                      </div>
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.orderRemaining')}: </span>
                        <span className="font-mono tabular-nums font-medium" style={{ color: originalRemaining > 0 ? colors.orange : colors.green }}>${fmt(originalRemaining)}</span>
                      </div>
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.orderThisPay')}: </span>
                        <span className="font-mono tabular-nums font-medium" style={{ color: colors.blue }}>
                          {rateOption === 'actual' && actualAmount > 0
                            ? `${actualCurrency === 'USD' ? '$' : '¥'}${fmt(actualAmount / selectedItems.length)}`
                            : `$${fmt(cash)}`
                          }
                          {prepay > 0 ? ` (+$${fmt(prepay)} ${t('poPayment.payment.prepayLabel')})` : ''}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.orderAfter')}: </span>
                        <span className="font-mono tabular-nums font-medium" style={{
                          color: cfg.coverStandard ? colors.green : pendingAfterThis > 0 ? colors.red : colors.green
                        }}>
                          {cfg.coverStandard
                            ? `$0.00 -- ${t('poPayment.payment.markAsPaid')}`
                            : `$${fmt(pendingAfterThis)}`
                          }
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${colors.border}` }}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateOrder(item.poNum, { paymentMode: 'original' })}
                          className="text-[10px] px-2 py-0.5 rounded transition-colors"
                          style={{
                            backgroundColor: cfg.paymentMode === 'original' ? `${colors.blue}15` : 'transparent',
                            color: cfg.paymentMode === 'original' ? colors.blue : colors.textTertiary,
                          }}
                        >
                          {t('poPayment.payment.modeOriginal')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateOrder(item.poNum, { paymentMode: 'custom' })}
                          className="text-[10px] px-2 py-0.5 rounded transition-colors"
                          style={{
                            backgroundColor: cfg.paymentMode === 'custom' ? `${colors.blue}15` : 'transparent',
                            color: cfg.paymentMode === 'custom' ? colors.blue : colors.textTertiary,
                          }}
                        >
                          {t('poPayment.payment.modeCustom')}
                        </button>
                      </div>

                      {cfg.paymentMode === 'custom' && (
                        <input
                          type="number"
                          step="0.01"
                          value={cfg.customAmount || ''}
                          placeholder="0.00"
                          onChange={(e) => updateOrder(item.poNum, { customAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full h-7 px-2 border rounded text-xs font-mono tabular-nums focus:outline-none"
                          style={{ ...baseStyle, fontSize: '11px' }}
                        />
                      )}

                      <label className={`flex items-center gap-1.5 ${hasBalance ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                        <input
                          type="checkbox"
                          checked={cfg.usePrepay}
                          disabled={!hasBalance}
                          onChange={(e) => updateOrder(item.poNum, { usePrepay: e.target.checked })}
                          className="w-3 h-3 rounded"
                        />
                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>{t('poPayment.payment.usePrepay')}</span>
                      </label>
                      {cfg.usePrepay && (
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            max={vendorBalance?.balanceUsd ?? 0}
                            value={cfg.prepayAmount || ''}
                            placeholder="0.00"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const maxBal = vendorBalance?.balanceUsd ?? 0;
                              updateOrder(item.poNum, { prepayAmount: Math.min(val, maxBal) });
                            }}
                            className="w-full h-7 px-2 border rounded text-xs font-mono tabular-nums focus:outline-none"
                            style={{ ...baseStyle, fontSize: '11px' }}
                          />
                          <p className="text-[9px] mt-0.5 font-mono" style={{ color: colors.textTertiary }}>
                            max: ${fmt(vendorBalance?.balanceUsd ?? 0)}
                          </p>
                        </div>
                      )}

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cfg.coverStandard}
                          onChange={(e) => updateOrder(item.poNum, { coverStandard: e.target.checked })}
                          className="w-3 h-3 rounded"
                        />
                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>{t('poPayment.payment.markAsPaid')}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Settings (60%) */}
          <div className="flex-1 min-w-0">

            <div className="mb-6">
              <SectionHeader
                icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
                title={t('poPayment.payment.paymentDate')}
              />
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputCls}
                style={{ ...baseStyle, borderColor: paymentDate ? colors.border : colors.red, maxWidth: '240px' }}
              />
            </div>

            <div className="mb-6">
              <SectionHeader
                icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                title={t('poPayment.payment.exchangeRate')}
              />

              <div className="grid grid-cols-3 gap-2 mb-4">
                <button type="button" onClick={() => setRateOption('actual')}
                  className="p-2.5 rounded-lg border text-left transition-all"
                  style={{ borderColor: rateOption === 'actual' ? colors.blue : colors.border, backgroundColor: rateOption === 'actual' ? `${colors.blue}08` : colors.bgTertiary }}>
                  <p className="text-xs font-medium" style={{ color: colors.text }}>{t('poPayment.payment.rate.actual')}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>{t('poPayment.payment.rate.actualDesc')}</p>
                </button>
                <button type="button" onClick={() => { setRateOption('original'); setSettlementRate(0); setRateFetchSource(''); setRateFetchFailed(false); }}
                  className="p-2.5 rounded-lg border text-left transition-all"
                  style={{ borderColor: rateOption === 'original' ? colors.blue : colors.border, backgroundColor: rateOption === 'original' ? `${colors.blue}08` : colors.bgTertiary }}>
                  <p className="text-xs font-medium" style={{ color: colors.text }}>{t('poPayment.payment.rate.original')}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>{t('poPayment.payment.rate.originalDesc')}</p>
                </button>
                <button type="button" onClick={() => setRateOption('paymentDate')}
                  className="p-2.5 rounded-lg border text-left transition-all"
                  style={{ borderColor: rateOption === 'paymentDate' ? colors.blue : colors.border, backgroundColor: rateOption === 'paymentDate' ? `${colors.blue}08` : colors.bgTertiary }}>
                  <p className="text-xs font-medium" style={{ color: colors.text }}>{t('poPayment.payment.rate.paymentDate')}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>{t('poPayment.payment.rate.paymentDateDesc')}</p>
                </button>
              </div>

              {rateOption === 'actual' && (
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('poPayment.payment.rate.actualCurrency')}</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setActualCurrency('USD'); setActualAmount(0); }}
                          className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
                          style={{ backgroundColor: actualCurrency === 'USD' ? colors.blue : colors.bgTertiary, color: actualCurrency === 'USD' ? '#fff' : colors.text }}>
                          $ USD
                        </button>
                        <button type="button" onClick={() => { setActualCurrency('RMB'); setActualAmount(0); }}
                          className="flex-1 h-9 text-sm font-medium rounded-lg transition-colors"
                          style={{ backgroundColor: actualCurrency === 'RMB' ? colors.blue : colors.bgTertiary, color: actualCurrency === 'RMB' ? '#fff' : colors.text }}>
                          ¥ RMB
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('poPayment.payment.rate.actualAmount')}</label>
                      <div className="relative">
                        <input type="number" step="0.01" value={actualAmount || ''} placeholder="0.00"
                          onChange={e => { const val = parseFloat(e.target.value); setActualAmount(isNaN(val) ? 0 : val); }}
                          className={`${inputCls} tabular-nums`}
                          style={{ ...baseStyle, paddingRight: '40px' }} />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <span className="text-xs" style={{ color: colors.textSecondary }}>{actualCurrency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg mb-3" style={{ backgroundColor: colors.bgTertiary }}>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: colors.textSecondary }}>{t('poPayment.payment.pendingTotal')}</span>
                      <span className="font-mono font-medium" style={{ color: colors.text }}>${fmt(totalPendingUsd)}</span>
                    </div>
                  </div>
                  {rateFetching && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                      <span className="text-xs" style={{ color: colors.textSecondary }}>Fetching rate...</span>
                    </div>
                  )}
                  {rateFetchSource && !rateFetching && (
                    <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
                      <p className="text-xs" style={{ color: colors.green }}>Rate: {settlementRate.toFixed(4)} USD/CNY ({rateFetchSource})</p>
                    </div>
                  )}
                  {settlementRate > 0 && !rateFetching && (
                    <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${colors.blue}08`, border: `1px solid ${colors.blue}25` }}>
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: colors.textSecondary }}>{t('poPayment.payment.rate.calculatedRate')}</span>
                        <span className="font-mono font-semibold text-sm" style={{ color: colors.blue }}>
                          {settlementRate.toFixed(4)} <span className="text-[10px] font-normal" style={{ color: colors.textTertiary }}>USD/CNY</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rateOption === 'paymentDate' && (
                <div>
                  {rateFetching && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                      <span className="text-xs" style={{ color: colors.textSecondary }}>Fetching rate...</span>
                    </div>
                  )}
                  {rateFetchSource && !rateFetching && (
                    <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
                      <p className="text-xs" style={{ color: colors.green }}>Rate source: {rateFetchSource}</p>
                    </div>
                  )}
                  {rateFetchFailed && !rateFetching && (
                    <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.red}10` }}>
                      <p className="text-xs" style={{ color: colors.red }}>Auto rate unavailable -- enter manually</p>
                    </div>
                  )}
                  <div className="relative" style={{ maxWidth: '240px' }}>
                    <input type="number" step="0.0001" value={settlementRate || ''} placeholder="0.0000"
                      onChange={(e) => { const val = parseFloat(e.target.value); setSettlementRate(isNaN(val) ? 0 : val); }}
                      disabled={rateFetching}
                      readOnly={!rateFetchFailed && !rateFetching && settlementRate > 0}
                      className={`${inputCls} disabled:opacity-50`}
                      style={{ ...baseStyle, borderColor: settlementRate > 0 ? colors.border : colors.red, paddingRight: '60px' }} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <span className="text-xs" style={{ color: colors.textSecondary }}>USD/CNY</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actual Payment Highlight */}
            <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: `${colors.green}08`, border: `1px solid ${colors.green}20` }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.green }}>
                    {t('poPayment.payment.actualPayment')}
                  </p>
                  <p className="text-xl font-mono font-bold tabular-nums" style={{ color: colors.text }}>
                    ${fmt(summary.cashPayment)}
                  </p>
                </div>
                {settlementRate > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                      {t('poPayment.payment.actualPaymentRmb')}
                    </p>
                    <p className="text-base font-mono font-semibold tabular-nums" style={{ color: colors.textSecondary }}>
                      ¥{fmt(round5(summary.cashPayment * settlementRate))}
                    </p>
                  </div>
                )}
              </div>
              {summary.prepayDeduction > 0 && (
                <div className="mt-2 pt-2 flex items-center gap-4 text-xs" style={{ borderTop: `1px solid ${colors.green}15` }}>
                  <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.prepayLabel')}: <span className="font-mono font-medium" style={{ color: colors.blue }}>-${fmt(summary.prepayDeduction)}</span></span>
                  {showExtraFee && extraAmount > 0 && (
                    <span style={{ color: colors.textTertiary }}>{t('poPayment.payment.extraLabel')}: <span className="font-mono font-medium" style={{ color: colors.orange }}>{extraCurrency === 'USD' ? '$' : '¥'}{fmt(extraAmount)}</span></span>
                  )}
                </div>
              )}
            </div>

            {/* Vendor Prepay Balance */}
            {vendorBalance && (
              <div className="mb-6">
                <SectionHeader
                  icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>}
                  title={t('poPayment.payment.vendorBalance')}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{vendorBalance.supplierCode}</p>
                    <p className="text-sm font-mono font-medium" style={{ color: colors.blue }}>{vendorBalance.supplierName}</p>
                  </div>
                  <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('poPayment.payment.prepayBalance')}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: (vendorBalance.balanceUsd - summary.prepayDeduction) >= 0 ? colors.green : colors.red }}>
                      ${fmt(vendorBalance.balanceUsd - summary.prepayDeduction)}
                    </p>
                    {summary.prepayDeduction > 0 && (
                      <p className="text-[9px] font-mono mt-0.5" style={{ color: colors.textTertiary }}>
                        ({t('poPayment.payment.summaryPrepay')}: -${fmt(summary.prepayDeduction)})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Extra Fee */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <SectionHeader
                  icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                  title={t('poPayment.payment.extraFee')}
                />
                <button type="button" onClick={() => setShowExtraFee(!showExtraFee)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ backgroundColor: showExtraFee ? `${colors.blue}15` : colors.bgTertiary, color: showExtraFee ? colors.blue : colors.textSecondary }}>
                  {showExtraFee ? '\u2212' : '+'}
                </button>
              </div>
              {showExtraFee && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('poPayment.payment.extraAmount')}</label>
                    <input type="number" step="0.01" value={extraAmount || ''} placeholder="0.00"
                      onChange={(e) => setExtraAmount(parseFloat(e.target.value) || 0)}
                      className={`${inputCls} tabular-nums`} style={baseStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('poPayment.payment.extraCurrency')}</label>
                    <select value={extraCurrency} onChange={(e) => setExtraCurrency(e.target.value as 'USD' | 'RMB')}
                      className={`${inputCls} appearance-none`} style={baseStyle}>
                      <option value="USD">USD</option>
                      <option value="RMB">RMB</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('poPayment.payment.extraNote')}</label>
                    <input type="text" value={extraNote} onChange={(e) => setExtraNote(e.target.value)}
                      className={inputCls} style={baseStyle} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ModalShell>

      <SecurityCodeDialog
        isOpen={submitSecurity.isOpen}
        level={submitSecurity.level}
        title={t('poPayment.payment.securityTitle')}
        description={t('poPayment.payment.securityDescription')}
        onConfirm={submitSecurity.onConfirm}
        onCancel={submitSecurity.onCancel}
        isLoading={submitMutation.isPending}
        error={submitSecurity.error}
      />
    </>
  );
}
