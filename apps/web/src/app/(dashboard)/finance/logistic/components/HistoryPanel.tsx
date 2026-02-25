'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';
import type { LogisticSendVersion, LogisticPaymentVersion, FieldChange } from '@/lib/api';

interface Props {
  paymentNo: string;
  onClose: () => void;
}

/**
 * HistoryPanel — 2-column history view for logistics payment.
 * V1 parity: payment/history.py payment_history_api
 *
 * Left:   Shipment (send) versions — freight, weight, price changes
 * Right:  Payment versions — paid amount, rate, extra fee changes
 */
export default function HistoryPanel({ paymentNo, onClose }: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const { data: history, isLoading } = useQuery({
    queryKey: ['logisticPaymentHistory', paymentNo],
    queryFn: () => financeApi.getLogisticPaymentHistory(paymentNo),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-full max-w-5xl max-h-[80vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: colors.border }}>
          <div>
            <h2 style={{ color: colors.text }} className="text-lg font-semibold">
              {t('logistic.history.title')}
            </h2>
            <p style={{ color: colors.textTertiary }} className="text-xs mt-0.5 font-mono">
              {paymentNo}
              {history && history.logisticNums.length > 0 && (
                <span style={{ color: colors.textSecondary }}> — {history.logisticNums.join(', ')}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity" style={{ backgroundColor: colors.bgTertiary }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content — 2-column layout */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: colors.blue }} />
            </div>
          ) : history ? (
            <div className="grid grid-cols-2 gap-4">
              {/* LEFT: Shipment (Send) Versions */}
              <div>
                <h3 style={{ color: colors.text }} className="text-sm font-semibold mb-3">
                  {t('logistic.history.sendColumn')}
                </h3>
                <div className="space-y-2">
                  {history.sendVersions.map((v, i) => (
                    <SendVersionCard key={i} version={v} colors={colors} />
                  ))}
                  {history.sendVersions.length === 0 && (
                    <div className="text-center py-6">
                      <p style={{ color: colors.textTertiary }} className="text-xs">{t('logistic.history.noSendVersions')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Payment Versions */}
              <div>
                <h3 style={{ color: colors.text }} className="text-sm font-semibold mb-3">
                  {t('logistic.history.paymentColumn')}
                </h3>
                <div className="space-y-2">
                  {history.paymentVersions.map((v, i) => (
                    <PaymentVersionCard key={i} version={v} colors={colors} />
                  ))}
                  {history.paymentVersions.length === 0 && (
                    <div className="text-center py-6">
                      <p style={{ color: colors.textTertiary }} className="text-xs">{t('logistic.history.noPaymentVersions')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p style={{ color: colors.textTertiary }} className="text-xs">{t('logistic.history.noData')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function SendVersionCard({ version: v, colors }: { version: LogisticSendVersion; colors: (typeof themeColors)['dark'] }) {
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleDateString('zh-CN') : '';
  return (
    <div style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }} className="p-2.5 rounded-lg border text-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span style={{ color: colors.blue }} className="font-bold text-[11px]">{v.seq}</span>
          <span className="font-mono text-[10px]" style={{ color: colors.textSecondary }}>{v.logisticNum}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }} className="text-[10px]">{dateStr}</span>
          <span style={{ color: colors.textSecondary }} className="text-[10px] font-medium">{v.byUser}</span>
        </div>
      </div>

      {v.isInitial && (
        <div className="flex gap-2 mt-1 flex-wrap">
          <InitialBadge label="Freight" value={`¥${v.data.totalPrice.toFixed(2)}`} colors={colors} />
          <InitialBadge label="Weight" value={`${v.data.totalWeight.toFixed(2)}kg`} colors={colors} />
          <InitialBadge label="$/kg" value={v.data.priceKg.toFixed(4)} colors={colors} />
          <InitialBadge label="Pallets" value={String(v.data.pallets)} colors={colors} />
        </div>
      )}

      {v.changes.map((c, ci) => (
        <ChangeBadge key={ci} change={c} colors={colors} />
      ))}

      {v.note && (
        <p style={{ color: colors.textTertiary }} className="text-[10px] mt-1 italic">{v.note}</p>
      )}
    </div>
  );
}

function PaymentVersionCard({ version: v, colors }: { version: LogisticPaymentVersion; colors: (typeof themeColors)['dark'] }) {
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleDateString('zh-CN') : '';
  return (
    <div style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }} className="p-2.5 rounded-lg border text-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span style={{ color: colors.blue }} className="font-bold text-[11px]">{v.seq}</span>
          <span className="font-mono text-[10px]" style={{ color: colors.textSecondary }}>{v.logisticNum}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }} className="text-[10px]">{dateStr}</span>
          <span style={{ color: colors.textSecondary }} className="text-[10px] font-medium">{v.byUser}</span>
        </div>
      </div>

      {v.isInitial && (
        <div className="flex gap-2 mt-1 flex-wrap">
          <InitialBadge label="Paid" value={`¥${v.logisticPaid.toFixed(2)}`} colors={colors} />
          <InitialBadge label="Rate" value={v.usdRmb.toFixed(4)} colors={colors} />
          <InitialBadge label="Date" value={v.paymentDate} colors={colors} />
          {v.extraPaid > 0 && (
            <InitialBadge label="Extra" value={`${v.extraPaid.toFixed(2)} ${v.extraCurrency}`} colors={colors} />
          )}
        </div>
      )}

      {v.changes.map((c, ci) => (
        <ChangeBadge key={ci} change={c} colors={colors} />
      ))}

      {v.note && (
        <p style={{ color: colors.textTertiary }} className="text-[10px] mt-1 italic">{v.note}</p>
      )}
    </div>
  );
}

function InitialBadge({ label, value, colors }: { label: string; value: string; colors: (typeof themeColors)['dark'] }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] mt-1"
      style={{ backgroundColor: `${colors.blue}10`, color: colors.blue }}
    >
      {label}: <span className="font-bold">{value}</span>
    </span>
  );
}

function ChangeBadge({ change, colors }: { change: FieldChange; colors: (typeof themeColors)['dark'] }) {
  return (
    <div className="mt-1 p-1.5 rounded" style={{ backgroundColor: `${colors.orange}10` }}>
      <span style={{ color: colors.textSecondary }} className="text-[10px]">{change.field}</span>
      <div className="flex items-center gap-1 mt-0.5">
        <span style={{ color: colors.red }} className="text-[10px] line-through">{change.old}</span>
        <span style={{ color: colors.textTertiary }} className="text-[10px]">&rarr;</span>
        <span style={{ color: colors.green }} className="text-[10px] font-medium">{change.new}</span>
      </div>
    </div>
  );
}
