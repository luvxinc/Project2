'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

interface Props {
  isOpen: boolean;
  selectedLogisticNums: string[];
  totalFreightRmb: number;
  onClose: () => void;
  onSuccess: () => void;
}

type RateOption = 'actual' | 'original' | 'paymentDate';
type RateSource = 'auto' | 'manual';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * PaymentDialog — Batch logistics payment submission.
 * V1 parity: submit.py submit_payment_api
 *
 * Fields:
 *   - Selected logistic nums (read-only list)
 *   - Payment date
 *   - Rate option: original / payment-date (auto/manual)
 *   - Extra fee (optional): amount, currency, note
 */
export default function PaymentDialog({ isOpen, selectedLogisticNums, totalFreightRmb, onClose, onSuccess }: Props) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // State
  const [paymentDate, setPaymentDate] = useState(formatDate(new Date()));
  const [rateOption, setRateOption] = useState<RateOption>('actual');
  const [rateSource, setRateSource] = useState<RateSource>('auto');
  const [settlementRate, setSettlementRate] = useState<number>(0);
  const [rateFetching, setRateFetching] = useState(false);
  const [rateFetchSource, setRateFetchSource] = useState('');
  const [rateFetchFailed, setRateFetchFailed] = useState(false);
  const [showExtraFee, setShowExtraFee] = useState(false);
  const [extraAmount, setExtraAmount] = useState<number>(0);
  const [extraCurrency, setExtraCurrency] = useState('RMB');
  const [extraNote, setExtraNote] = useState('');
  const [success, setSuccess] = useState(false);
  // Actual payment state
  const [actualCurrency, setActualCurrency] = useState('USD');
  const [actualAmount, setActualAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>('full');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPaymentDate(formatDate(new Date()));
      setRateOption('actual');
      setRateSource('auto');
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
      setPaymentType('full');
      createSecurity.onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Backend exchange rate
  const { data: autoRateData } = useQuery({
    queryKey: ['exchangeRate'],
    queryFn: () => financeApi.getExchangeRate(),
    enabled: isOpen,
  });

  // Fetch exchange rate (same multi-source pattern as PrepayWizard)
  const fetchExchangeRate = useCallback(async (date: string) => {
    setRateFetching(true); setRateFetchFailed(false); setRateFetchSource('');

    const fetchWithTimeout = (url: string, ms = 3000) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    };

    try {
      const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setSettlementRate(parseFloat(Number(rate).toFixed(4))); setRateFetchSource('open.er-api.com'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    try {
      const res = await fetchWithTimeout(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
      if (res.ok) { const data = await res.json(); const rate = data?.usd?.cny; if (rate && rate > 0) { setSettlementRate(parseFloat(Number(rate).toFixed(4))); setRateFetchSource('fawazahmed0/currency-api'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    try {
      const res = await fetchWithTimeout(`https://api.frankfurter.app/${date}?from=USD&to=CNY`);
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setSettlementRate(parseFloat(Number(rate).toFixed(4))); setRateFetchSource('frankfurter.app'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    if (autoRateData && autoRateData.rate > 0) {
      setSettlementRate(autoRateData.rate);
      setRateFetchSource(autoRateData.source || 'backend');
      setRateFetching(false);
      return;
    }
    setRateFetchFailed(true); setRateSource('manual'); setRateFetching(false);
  }, [autoRateData]);

  // Auto-fetch when switching to paymentDate + auto
  useEffect(() => {
    if (isOpen && rateOption === 'paymentDate' && rateSource === 'auto' && paymentDate) {
      fetchExchangeRate(paymentDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rateOption, rateSource, paymentDate]);

  // Auto-fetch rate for actual tab (always use payment date rate)
  useEffect(() => {
    if (isOpen && rateOption === 'actual' && paymentDate) {
      fetchExchangeRate(paymentDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rateOption, paymentDate]);

  // Compute actual payment difference (surcharge/discount) in RMB
  // Logistics freight is in RMB. Compare actual paid (converted to RMB) vs totalFreightRmb.
  const actualDiffRmb = useMemo(() => {
    if (rateOption !== 'actual' || paymentType !== 'full' || actualAmount <= 0 || totalFreightRmb <= 0 || settlementRate <= 0) return 0;
    let actualInRmb: number;
    if (actualCurrency === 'RMB') {
      actualInRmb = actualAmount;
    } else {
      // USD → RMB
      actualInRmb = actualAmount * settlementRate;
    }
    return Math.round((actualInRmb - totalFreightRmb) * 100) / 100; // positive = surcharge, negative = discount
  }, [rateOption, actualAmount, actualCurrency, totalFreightRmb, settlementRate, paymentType]);

  // Validation
  const canSubmit = useMemo(() => {
    if (selectedLogisticNums.length === 0) return false;
    if (!paymentDate) return false;
    if (rateOption === 'actual' && (rateFetching || settlementRate <= 0 || actualAmount <= 0)) return false;
    if (rateOption === 'paymentDate' && (!settlementRate || settlementRate <= 0)) return false;
    if (rateFetching && rateOption !== 'original') return false;
    if (showExtraFee && extraAmount > 0 && !extraNote.trim()) return false;
    return true;
  }, [selectedLogisticNums, paymentDate, rateOption, settlementRate, rateFetching, showExtraFee, extraAmount, extraNote, actualAmount]);

  // Mutation
  const submitMutation = useMutation({
    mutationFn: async (secCode: string) => {
      // Build extra fee: merge manual + auto diff
      let finalExtraFee: { amount: number; currency: string; note: string } | undefined;

      // Manual extra fee
      if (showExtraFee && extraAmount > 0) {
        finalExtraFee = { amount: extraAmount, currency: extraCurrency, note: extraNote };
      }

      // Auto-computed surcharge/discount from actual payment mode (only full payment)
      if (rateOption === 'actual' && paymentType === 'full' && Math.abs(actualDiffRmb) > 0.005) {
        const diffLabel = actualDiffRmb > 0
          ? `Surcharge: paid ${actualCurrency === 'RMB' ? '¥' : '$'}${actualAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} vs freight ¥${totalFreightRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, diff +¥${actualDiffRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `Discount: paid ${actualCurrency === 'RMB' ? '¥' : '$'}${actualAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} vs freight ¥${totalFreightRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, diff -¥${Math.abs(actualDiffRmb).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (finalExtraFee) {
          // Combine with manual
          if (finalExtraFee.currency === 'RMB') {
            finalExtraFee.amount = Math.round((finalExtraFee.amount + actualDiffRmb) * 100) / 100;
          } else {
            // Manual is USD, diff is RMB — convert diff to USD
            finalExtraFee.amount = Math.round((finalExtraFee.amount + actualDiffRmb / settlementRate) * 100) / 100;
          }
          finalExtraFee.note = `${finalExtraFee.note}; ${diffLabel}`;
        } else {
          finalExtraFee = { amount: actualDiffRmb, currency: 'RMB', note: diffLabel };
        }
      }

      return financeApi.submitLogisticPayment({
        logisticNums: selectedLogisticNums,
        paymentDate,
        usePaymentDateRate: rateOption !== 'original',
        settlementRate: rateOption !== 'original' ? settlementRate : undefined,
        rateSource: rateOption === 'actual' ? 'auto' : (rateOption === 'paymentDate' ? rateSource : 'original'),
        extraFee: finalExtraFee,
      }, secCode);
    },
    onSuccess: () => {
      createSecurity.onCancel();
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    },
    onError: () => {
      createSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const createSecurity = useSecurityAction({
    actionKey: 'btn_logistic_payment_submit',
    level: 'L2',
    onExecute: (code) => submitMutation.mutate(code),
  });

  const handleSubmit = () => { if (!canSubmit) return; createSecurity.trigger(); };

  if (!isOpen) return null;

  // Success screen
  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('logistic.payment.successTitle')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('logistic.payment.successTitle')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{t('logistic.payment.successDescription')}</p>
        </div>
      </ModalShell>
    );
  }

  const inputCls = "w-full h-9 px-3 border rounded-lg text-sm focus:outline-none transition-colors";
  const baseStyle = { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text };

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
        title={t('logistic.payment.title')}
        subtitle={t('logistic.payment.selectedItems', { count: selectedLogisticNums.length })}
        footerLeft={
          <span className="text-xs" style={{ color: colors.textTertiary }}>
            {selectedLogisticNums.length} shipments
          </span>
        }
        footerRight={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose}
              className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
              {tCommon('cancel')}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? colors.green : colors.textTertiary }}>
              {t('logistic.payment.submit')}
            </button>
          </div>
        }
      >
        {/* Selected shipments */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
            title={t('logistic.table.logisticNum')}
          />
          <div className="flex flex-wrap gap-1.5">
            {selectedLogisticNums.map((num) => (
              <span key={num} className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                {num}
              </span>
            ))}
          </div>
        </div>

        {/* Payment Date */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
            title={t('logistic.payment.paymentDate')}
          />
          <input type="date" value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className={inputCls}
            style={{ ...baseStyle, borderColor: paymentDate ? colors.border : colors.red, maxWidth: '240px' }} />
        </div>

        {/* Exchange Rate Option */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title={t('logistic.payment.rateOption')}
          />

          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Actual Payment */}
            <button
              type="button"
              onClick={() => setRateOption('actual')}
              className="p-3 rounded-lg border text-left transition-all"
              style={{
                borderColor: rateOption === 'actual' ? colors.blue : colors.border,
                backgroundColor: rateOption === 'actual' ? `${colors.blue}08` : colors.bgTertiary,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text }}>{t('logistic.payment.rateActual')}</p>
              <p className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>{t('logistic.payment.rateActualDesc')}</p>
            </button>

            {/* Original Rate */}
            <button
              type="button"
              onClick={() => setRateOption('original')}
              className="p-3 rounded-lg border text-left transition-all"
              style={{
                borderColor: rateOption === 'original' ? colors.blue : colors.border,
                backgroundColor: rateOption === 'original' ? `${colors.blue}08` : colors.bgTertiary,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text }}>{t('logistic.payment.rateOriginal')}</p>
              <p className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>{t('logistic.payment.rateOriginalDesc')}</p>
            </button>

            {/* Payment Date Rate */}
            <button
              type="button"
              onClick={() => setRateOption('paymentDate')}
              className="p-3 rounded-lg border text-left transition-all"
              style={{
                borderColor: rateOption === 'paymentDate' ? colors.blue : colors.border,
                backgroundColor: rateOption === 'paymentDate' ? `${colors.blue}08` : colors.bgTertiary,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text }}>{t('logistic.payment.ratePaymentDate')}</p>
              <p className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>{t('logistic.payment.ratePaymentDateDesc')}</p>
            </button>
          </div>

          {/* ── Actual Payment input ── */}
          {rateOption === 'actual' && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Currency selector */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('logistic.payment.actualCurrency')}</label>
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

                {/* Amount input — always shown */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('logistic.payment.actualAmount')}</label>
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

              {/* Full / Partial toggle */}
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setPaymentType('full')}
                  className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: paymentType === 'full' ? colors.green : colors.bgTertiary, color: paymentType === 'full' ? '#fff' : colors.text }}>
                  {t('logistic.payment.fullPayment')}
                </button>
                <button type="button" onClick={() => setPaymentType('partial')}
                  className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: paymentType === 'partial' ? colors.blue : colors.bgTertiary, color: paymentType === 'partial' ? '#fff' : colors.text }}>
                  {t('logistic.payment.partialPayment')}
                </button>
              </div>

              {/* Freight total reference */}
              <div className="p-2.5 rounded-lg mb-3" style={{ backgroundColor: colors.bgTertiary }}>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: colors.textSecondary }}>运费总额 (RMB)</span>
                  <span className="font-mono font-medium" style={{ color: colors.text }}>¥{totalFreightRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Rate fetch status */}
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

              {/* Surcharge / Discount display */}
              {actualAmount > 0 && settlementRate > 0 && Math.abs(actualDiffRmb) > 0.005 && (
                <div className="p-2.5 rounded-lg" style={{
                  backgroundColor: actualDiffRmb > 0 ? `${colors.orange}08` : `${colors.blue}08`,
                  border: `1px solid ${actualDiffRmb > 0 ? colors.orange : colors.blue}25`,
                }}>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: actualDiffRmb > 0 ? colors.orange : colors.blue }}>
                      {actualDiffRmb > 0 ? t('logistic.payment.surcharge') : t('logistic.payment.discount')}
                    </span>
                    <span className="font-mono font-semibold text-sm" style={{ color: actualDiffRmb > 0 ? colors.orange : colors.blue }}>
                      {actualDiffRmb > 0 ? '+' : ''}¥{actualDiffRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              {actualAmount > 0 && settlementRate > 0 && Math.abs(actualDiffRmb) <= 0.005 && (
                <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${colors.green}08`, border: `1px solid ${colors.green}25` }}>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: colors.green }}>✓ Exact match</span>
                    <span className="font-mono font-medium" style={{ color: colors.green }}>¥{totalFreightRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rate input — only when paymentDate rate is chosen */}
          {rateOption === 'paymentDate' && (
            <div>
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => { setRateSource('auto'); }}
                  className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: rateSource === 'auto' ? colors.blue : colors.bgTertiary, color: rateSource === 'auto' ? '#fff' : colors.text }}>
                  {t('logistic.payment.rateAuto')}
                </button>
                <button type="button" onClick={() => setRateSource('manual')}
                  className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: rateSource === 'manual' ? colors.blue : colors.bgTertiary, color: rateSource === 'manual' ? '#fff' : colors.text }}>
                  {t('logistic.payment.rateManual')}
                </button>
              </div>

              {rateSource === 'auto' && rateFetching && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Fetching rate...</span>
                </div>
              )}
              {rateSource === 'auto' && rateFetchSource && !rateFetching && (
                <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
                  <p className="text-xs" style={{ color: colors.green }}>Rate source: {rateFetchSource}</p>
                </div>
              )}
              {rateSource === 'auto' && rateFetchFailed && !rateFetching && (
                <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.red}10` }}>
                  <p className="text-xs" style={{ color: colors.red }}>Auto rate unavailable — enter manually</p>
                </div>
              )}

              <div className="relative" style={{ maxWidth: '240px' }}>
                <input type="number" step="0.0001" value={settlementRate || ''} placeholder="0.0000"
                  onChange={e => { const val = parseFloat(e.target.value); setSettlementRate(isNaN(val) ? 0 : val); }}
                  disabled={rateSource === 'auto' && rateFetching}
                  readOnly={rateSource === 'auto' && !rateFetchFailed && !rateFetching && settlementRate > 0}
                  className={`${inputCls} disabled:opacity-50`}
                  style={{ ...baseStyle, borderColor: settlementRate > 0 ? colors.border : colors.red, paddingRight: '60px' }} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-xs" style={{ color: colors.textSecondary }}>USD/CNY</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Always-visible: Actual Payment Highlight ── */}
        <div
          className="mb-6 p-4 rounded-xl"
          style={{
            backgroundColor: `${colors.green}08`,
            border: `1px solid ${colors.green}20`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.green }}>
                {t('logistic.payment.actualPayment')}
              </p>
              <p className="text-xl font-mono font-bold tabular-nums" style={{ color: colors.text }}>
                ¥{totalFreightRmb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            {settlementRate > 0 && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                  {t('logistic.payment.actualPaymentUsd')}
                </p>
                <p className="text-base font-mono font-semibold tabular-nums" style={{ color: colors.textSecondary }}>
                  ${(totalFreightRmb / settlementRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Extra Fee (optional) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader
              icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
              title={t('logistic.payment.extraFee')}
            />
            <button
              type="button"
              onClick={() => setShowExtraFee(!showExtraFee)}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: showExtraFee ? `${colors.blue}15` : colors.bgTertiary, color: showExtraFee ? colors.blue : colors.textSecondary }}
            >
              {showExtraFee ? '−' : '+'}
            </button>
          </div>

          {showExtraFee && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('logistic.payment.extraAmount')}</label>
                <input type="number" step="0.01" value={extraAmount || ''} placeholder="0.00"
                  onChange={e => setExtraAmount(parseFloat(e.target.value) || 0)}
                  className={`${inputCls} tabular-nums`} style={baseStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('logistic.payment.extraCurrency')}</label>
                <select value={extraCurrency} onChange={e => setExtraCurrency(e.target.value)}
                  className={`${inputCls} appearance-none`} style={baseStyle}>
                  <option value="RMB">RMB</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('logistic.payment.extraNote')}</label>
                <input type="text" value={extraNote} onChange={e => setExtraNote(e.target.value)}
                  className={inputCls} style={baseStyle} />
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={createSecurity.isOpen}
        level={createSecurity.level}
        title={t('logistic.payment.securityTitle')}
        description={t('logistic.payment.securityDescription')}
        onConfirm={createSecurity.onConfirm}
        onCancel={createSecurity.onCancel}
        isLoading={submitMutation.isPending}
        error={createSecurity.error}
      />
    </>
  );
}
