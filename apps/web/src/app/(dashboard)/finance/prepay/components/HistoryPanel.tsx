'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';
import type { StrategyVersionItem, RateVersionItem, AmountVersionItem, FieldChange } from '@/lib/api';

interface Props {
  tranNum: string;
  onClose: () => void;
}

/**
 * HistoryPanel — 3-column history view for a prepayment record.
 * V1 parity: prepay_history_view.html
 *
 * Left:   Supplier strategy changes
 * Middle: Rate/currency changes
 * Right:  Amount changes
 */
export default function HistoryPanel({ tranNum, onClose }: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const { data: history, isLoading } = useQuery({
    queryKey: ['prepaymentHistory', tranNum],
    queryFn: () => financeApi.getHistory(tranNum),
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
              {t('prepay.history.title')}
            </h2>
            <p style={{ color: colors.textTertiary }} className="text-xs mt-0.5">
              {tranNum}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
            <svg className="w-5 h-5" style={{ color: colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content — 3-column layout */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: colors.blue }} />
            </div>
          ) : history ? (
            <div className="grid grid-cols-3 gap-4">
              {/* LEFT: Supplier Strategy */}
              <HistoryColumn
                title={t('prepay.history.strategyColumn')}
                icon="🏢"
                colors={colors}
              >
                {history.supplierStrategyVersions.map((v, i) => (
                  <VersionCard key={i} colors={colors}>
                    <VersionHeader seq={v.seq} date={v.date} by={v.by} colors={colors} />
                    {v.isInitial && v.currency && (
                      <InitialBadge label={t('prepay.history.initialCurrency')} value={v.currency} colors={colors} />
                    )}
                    {v.changes.map((c, ci) => (
                      <ChangeBadge key={ci} change={c} colors={colors} />
                    ))}
                    {v.note && (
                      <p style={{ color: colors.textTertiary }} className="text-[10px] mt-1 italic">
                        {v.note}
                      </p>
                    )}
                  </VersionCard>
                ))}
                {history.supplierStrategyVersions.length === 0 && (
                  <EmptyState label={t('prepay.history.noStrategyChanges')} colors={colors} />
                )}
              </HistoryColumn>

              {/* MIDDLE: Rate/Currency */}
              <HistoryColumn
                title={t('prepay.history.rateColumn')}
                icon="💱"
                colors={colors}
              >
                {history.rateVersions.map((v, i) => (
                  <VersionCard key={i} colors={colors}>
                    <VersionHeader seq={v.seq} date={v.date} by={v.by} colors={colors} />
                    {v.isInitial && (
                      <div className="flex gap-2 mt-1">
                        <InitialBadge label={t('prepay.history.rate')} value={v.exchangeRate.toFixed(4)} colors={colors} />
                        <InitialBadge label={t('prepay.history.currency')} value={v.tranCurrUse} colors={colors} />
                      </div>
                    )}
                    {v.changes.map((c, ci) => (
                      <ChangeBadge key={ci} change={c} colors={colors} />
                    ))}
                  </VersionCard>
                ))}
                {history.rateVersions.length === 0 && (
                  <EmptyState label={t('prepay.history.noRateChanges')} colors={colors} />
                )}
              </HistoryColumn>

              {/* RIGHT: Amount */}
              <HistoryColumn
                title={t('prepay.history.amountColumn')}
                icon="💰"
                colors={colors}
              >
                {history.amountVersions.map((v, i) => (
                  <VersionCard key={i} colors={colors}>
                    <VersionHeader seq={v.seq} date={v.date} by={v.by} colors={colors} />
                    {v.isInitial && v.amount != null && (
                      <div className="mt-1">
                        <p style={{ color: colors.text }} className="text-sm font-bold tabular-nums">
                          {v.currency} {v.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        {v.usdAmount != null && v.currency !== 'USD' && (
                          <p style={{ color: colors.textTertiary }} className="text-[10px] tabular-nums">
                            ≈ USD {v.usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    )}
                    {/* Event type badge */}
                    {!v.isInitial && (
                      <EventTypeBadge type={v.eventType} colors={colors} t={t} />
                    )}
                    {v.changes.map((c, ci) => (
                      <ChangeBadge key={ci} change={c} colors={colors} />
                    ))}
                    {v.note && (
                      <p style={{ color: colors.textTertiary }} className="text-[10px] mt-1 italic">
                        {v.note}
                      </p>
                    )}
                  </VersionCard>
                ))}
                {history.amountVersions.length === 0 && (
                  <EmptyState label={t('prepay.history.noAmountChanges')} colors={colors} />
                )}
              </HistoryColumn>
            </div>
          ) : (
            <EmptyState label={t('prepay.history.noData')} colors={colors} />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function HistoryColumn({ title, icon, colors, children }: { title: string; icon: string; colors: any; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ color: colors.text }} className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <span>{icon}</span> {title}
      </h3>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

function VersionCard({ colors, children }: { colors: any; children: React.ReactNode }) {
  return (
    <div
      style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }}
      className="p-2.5 rounded-lg border text-xs"
    >
      {children}
    </div>
  );
}

function VersionHeader({ seq, date, by, colors }: { seq: string; date: string; by: string; colors: any }) {
  const dateStr = date ? new Date(date).toLocaleDateString('zh-CN') : '';
  return (
    <div className="flex items-center justify-between mb-1">
      <span style={{ color: colors.blue }} className="font-bold text-[11px]">{seq}</span>
      <div className="flex items-center gap-1.5">
        <span style={{ color: colors.textTertiary }} className="text-[10px]">{dateStr}</span>
        <span style={{ color: colors.textSecondary }} className="text-[10px] font-medium">{by}</span>
      </div>
    </div>
  );
}

function InitialBadge({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] mt-1"
      style={{ backgroundColor: `${colors.blue}10`, color: colors.blue }}
    >
      {label}: <span className="font-bold">{value}</span>
    </span>
  );
}

function ChangeBadge({ change, colors }: { change: FieldChange; colors: any }) {
  return (
    <div className="mt-1 p-1.5 rounded" style={{ backgroundColor: `${colors.orange}10` }}>
      <span style={{ color: colors.textSecondary }} className="text-[10px]">{change.field}</span>
      <div className="flex items-center gap-1 mt-0.5">
        <span style={{ color: colors.red }} className="text-[10px] line-through">{change.old}</span>
        <span style={{ color: colors.textTertiary }} className="text-[10px]">→</span>
        <span style={{ color: colors.green }} className="text-[10px] font-medium">{change.new}</span>
      </div>
    </div>
  );
}

function EventTypeBadge({ type, colors, t }: { type: string; colors: any; t: any }) {
  const config: Record<string, { color: string; label: string }> = {
    CREATE: { color: colors.green, label: t('prepay.history.eventCreate') },
    DELETE: { color: colors.red, label: t('prepay.history.eventDelete') },
    RESTORE: { color: colors.blue, label: t('prepay.history.eventRestore') },
    RATE_CHANGE: { color: colors.orange, label: t('prepay.history.eventRateChange') },
    AMOUNT_CHANGE: { color: colors.orange, label: t('prepay.history.eventAmountChange') },
  };
  const c = config[type] || { color: colors.textSecondary, label: type };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1"
      style={{ backgroundColor: `${c.color}15`, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function EmptyState({ label, colors }: { label: string; colors: any }) {
  return (
    <div className="text-center py-6">
      <p style={{ color: colors.textTertiary }} className="text-xs">{label}</p>
    </div>
  );
}
