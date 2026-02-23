'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { financeApi, type SupplierBalance } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

interface Props {
  isOpen: boolean;
  supplier: SupplierBalance | null;
  onClose: () => void;
  onSuccess: () => void;
}

type RateMode = 'auto' | 'manual';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFutureDate(dateStr: string): boolean {
  return dateStr > formatDate(new Date());
}

/**
 * PrepayWizard — Single-page modal for prepayment deposits.
 * Design: matches CreatePOModal (SectionHeader + inline validation + footerLeft summary).
 */
export default function PrepayWizard({ isOpen, supplier, onClose, onSuccess }: Props) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // --- State ---
  const [tranDate, setTranDate] = useState(formatDate(new Date()));
  const [tranCurrUse, setTranCurrUse] = useState('RMB');
  const [rateMode, setRateMode] = useState<RateMode>('manual');
  const [exchangeRate, setExchangeRate] = useState<number>(7.0);
  const [rateSource, setRateSource] = useState('');
  const [rateFetching, setRateFetching] = useState(false);
  const [rateFetchFailed, setRateFetchFailed] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);

  const supplierCurrency = supplier?.currency || 'RMB';
  const showCurrencyWarning = tranCurrUse !== supplierCurrency;
  const future = isFutureDate(tranDate);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen) {
      setTranDate(formatDate(new Date()));
      setTranCurrUse('RMB');
      setRateMode('manual');
      setExchangeRate(7.0);
      setRateSource('');
      setRateFetching(false);
      setRateFetchFailed(false);
      setAmount(0);
      setNote('');
      setSuccess(false);
      createSecurity.onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // --- Auto rate from backend ---
  const { data: autoRateData } = useQuery({
    queryKey: ['exchangeRate'],
    queryFn: () => financeApi.getExchangeRate(),
    enabled: isOpen,
  });

  // --- Fetch exchange rate (multi-source with timeout, PO pattern) ---
  const fetchExchangeRate = useCallback(async (date: string) => {
    if (isFutureDate(date)) { setRateMode('manual'); setRateFetchFailed(false); setRateSource(''); return; }
    setRateFetching(true); setRateFetchFailed(false); setRateSource('');

    const fetchWithTimeout = (url: string, ms = 3000) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    };

    // Source 1: open.er-api (most reliable — latest rates, no date-specific endpoint)
    try {
      const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('open.er-api.com'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    // Source 2: fawazahmed0 (date-specific, may not have future dates)
    try {
      const res = await fetchWithTimeout(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
      if (res.ok) { const data = await res.json(); const rate = data?.usd?.cny; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('fawazahmed0/currency-api'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    // Source 3: frankfurter (date-specific)
    try {
      const res = await fetchWithTimeout(`https://api.frankfurter.app/${date}?from=USD&to=CNY`);
      if (res.ok) { const data = await res.json(); const rate = data?.rates?.CNY; if (rate && rate > 0) { setExchangeRate(parseFloat(Number(rate).toFixed(4))); setRateSource('frankfurter.app'); setRateFetching(false); return; } }
    } catch { /* fall through */ }
    // Fallback: backend auto rate
    if (autoRateData && autoRateData.rate > 0) {
      setExchangeRate(autoRateData.rate);
      setRateSource(autoRateData.source || 'backend');
      setRateFetching(false);
      return;
    }
    setRateFetchFailed(true); setRateMode('manual'); setRateFetching(false);
  }, [autoRateData]);

  // Auto-fetch rate on date change OR when switching to auto mode
  useEffect(() => {
    if (isOpen && tranDate && rateMode === 'auto') fetchExchangeRate(tranDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tranDate, rateMode]);

  // --- Real-time validation → computed canSubmit ---
  const canSubmit = useMemo(() => {
    if (!supplier) return false;
    if (!tranDate) return false;
    if (!exchangeRate || exchangeRate <= 0) return false;
    if (!amount || amount <= 0) return false;
    if (!note.trim()) return false;
    if (rateFetching) return false;
    return true;
  }, [supplier, tranDate, exchangeRate, amount, note, rateFetching]);

  // --- Converted amount preview ---
  const convertedAmount = useMemo(() => {
    if (!showCurrencyWarning || !amount || amount <= 0 || !exchangeRate || exchangeRate <= 0) return null;
    if (supplierCurrency === 'RMB') {
      return { value: amount * exchangeRate, currency: 'RMB' };
    }
    return { value: amount / exchangeRate, currency: 'USD' };
  }, [amount, exchangeRate, showCurrencyWarning, supplierCurrency]);

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: async (secCode: string) => {
      return financeApi.createPrepayment({
        supplierCode: supplier!.supplierCode,
        tranDate,
        tranCurrReq: supplierCurrency,
        tranCurrUse,
        exchangeRate: exchangeRate.toFixed(4),
        rateMode,
        amount: amount.toString(),
        note,
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
    actionKey: 'btn_prepay_submit',
    level: 'L2',
    onExecute: (code) => createMutation.mutate(code),
  });

  const handleSubmit = () => { if (!canSubmit) return; createSecurity.trigger(); };

  if (!isOpen) return null;

  // --- Success screen (matches CreatePO) ---
  if (success) {
    return (
      <ModalShell isOpen={isOpen} onClose={onClose} title={t('prepay.wizard.step4.title')} closable={false} showFooter={false}>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${colors.green}15` }}>
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('prepay.wizard.step4.title')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{supplier?.supplierCode} — {supplier?.supplierName}</p>
        </div>
      </ModalShell>
    );
  }

  // --- Shared styles (matches CreatePO) ---
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
        title={t('prepay.wizard.title')}
        subtitle={supplier ? `${supplier.supplierCode} — ${supplier.supplierName}` : undefined}
        footerLeft={
          <div className="text-xs" style={{ color: amount > 0 ? colors.blue : colors.textTertiary }}>
            {amount > 0 && (
              <>
                {tranCurrUse} {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                {convertedAmount && (
                  <span style={{ color: colors.textSecondary }}>
                    {' '}≈ {convertedAmount.currency} {convertedAmount.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </>
            )}
          </div>
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
              {t('prepay.wizard.submit')}
            </button>
          </div>
        }
      >
        {/* ===== Section 1: Basic Info ===== */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
            title={t('prepay.wizard.step1.supplier')}
          />

          {/* Supplier info banner — read-only */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
              <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('prepay.wizard.step1.supplier')}</p>
              <p className="text-sm font-medium font-mono" style={{ color: colors.blue }}>{supplier?.supplierCode}</p>
            </div>
            <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
              <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('prepay.wizard.step1.currency')}</p>
              <p className="text-sm font-medium font-mono" style={{ color: colors.blue }}>{supplierCurrency}</p>
            </div>
            <div className="px-3 py-2 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
              <p className="text-[10px] uppercase" style={{ color: colors.textSecondary }}>{t('prepay.wizard.step1.currentBalance')}</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: (supplier?.balance ?? 0) >= 0 ? colors.green : colors.red }}>
                {supplierCurrency} {supplier?.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Date + Payment Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('prepay.wizard.step2.date')}</label>
              <input type="date" value={tranDate}
                onChange={e => { setTranDate(e.target.value); if (rateMode === 'auto') { setExchangeRate(0); setRateSource(''); } }}
                className={inputCls} style={{ ...baseStyle, borderColor: tranDate ? colors.border : colors.red }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('prepay.wizard.step2.currency')}</label>
              <select value={tranCurrUse}
                onChange={e => setTranCurrUse(e.target.value)}
                className={`${inputCls} appearance-none`} style={baseStyle}>
                <option value="RMB">RMB</option>
                <option value="USD">USD</option>
              </select>
              {showCurrencyWarning && (
                <p className="mt-1.5 text-xs px-2 py-1 rounded" style={{ backgroundColor: `${colors.orange}10`, color: colors.orange }}>
                  {t('prepay.wizard.step2.currencyWarning', { from: tranCurrUse, to: supplierCurrency })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ===== Section 2: Exchange Rate (matches CreatePO exactly) ===== */}
        <div className="mb-6">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title={t('prepay.wizard.step2.exchangeRate')}
          />

          {!future && (
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => { setRateMode('auto'); fetchExchangeRate(tranDate); }}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'auto' ? colors.blue : colors.bgTertiary, color: rateMode === 'auto' ? '#fff' : colors.text }}>
                {t('prepay.wizard.step2.auto')}
              </button>
              <button type="button" onClick={() => setRateMode('manual')}
                className="flex-1 h-8 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: rateMode === 'manual' ? colors.blue : colors.bgTertiary, color: rateMode === 'manual' ? '#fff' : colors.text }}>
                {t('prepay.wizard.step2.manual')}
              </button>
            </div>
          )}

          {future && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.orange}10` }}>
              <p className="text-xs" style={{ color: colors.orange }}>Future date — manual rate required</p>
            </div>
          )}

          {rateMode === 'auto' && rateFetching && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }} />
              <span className="text-xs" style={{ color: colors.textSecondary }}>Fetching rate...</span>
            </div>
          )}
          {rateMode === 'auto' && rateSource && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.green}10` }}>
              <p className="text-xs" style={{ color: colors.green }}>Rate source: {rateSource}</p>
            </div>
          )}
          {rateMode === 'auto' && rateFetchFailed && !rateFetching && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: `${colors.red}10` }}>
              <p className="text-xs" style={{ color: colors.red }}>Auto rate unavailable — enter manually</p>
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

        {/* ===== Section 3: Payment Details ===== */}
        <div className="mb-4">
          <SectionHeader
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>}
            title={t('prepay.wizard.step2.amount')}
          />

          {/* Amount */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
              {t('prepay.wizard.step2.amount')} ({tranCurrUse})
            </label>
            <input type="number" step="0.01" value={amount || ''} placeholder="0.00"
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              className={`${inputCls} tabular-nums`}
              style={{ ...baseStyle, borderColor: amount > 0 ? colors.border : colors.red }} />
            {/* Converted preview */}
            {convertedAmount && (
              <p className="mt-1.5 text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                ≈ {convertedAmount.currency} {convertedAmount.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
              {t('prepay.wizard.step2.note')}
            </label>
            <textarea value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-colors resize-none"
              style={{ ...baseStyle, borderColor: note.trim() ? colors.border : colors.red }} />
          </div>
        </div>
      </ModalShell>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={createSecurity.isOpen}
        level={createSecurity.level}
        title={t('prepay.wizard.securityTitle')}
        description={t('prepay.wizard.securityDescription')}
        onConfirm={createSecurity.onConfirm}
        onCancel={createSecurity.onCancel}
        isLoading={createMutation.isPending}
        error={createSecurity.error}
      />
    </>
  );
}
