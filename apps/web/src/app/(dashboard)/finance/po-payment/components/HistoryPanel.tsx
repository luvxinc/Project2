'use client';

import { useQuery } from '@tanstack/react-query';
import { themeColors } from '@/contexts/ThemeContext';
import { financeApi } from '@/lib/api';
import type { DepositStrategyVersion, DepositPaymentVersion, FieldChange } from '@/lib/api';

interface HistoryPanelProps {
  pmtNo: string;
  poNum: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  theme: string;
}

/**
 * HistoryPanel -- Three-column history view for PO payments.
 *
 * Left:   Strategy versions (currency, deposit%, rate, mode changes)
 * Middle: Deposit payment versions (deposit amount, rate, override changes)
 * Right:  PO payment versions (balance payment amount, rate, extra fee changes)
 */
export default function HistoryPanel({ pmtNo, poNum, t, theme }: HistoryPanelProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;

  const { data: history, isLoading } = useQuery({
    queryKey: ['poPaymentHistory', pmtNo, poNum],
    queryFn: () => financeApi.getPOPaymentHistory(pmtNo, poNum),
  });

  const strategyVersions = history?.strategyVersions ?? [];
  const depositPaymentVersions = history?.depositPaymentVersions ?? [];
  const poPaymentVersions = history?.poPaymentVersions ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }}
        />
      </div>
    );
  }

  if (strategyVersions.length === 0 && depositPaymentVersions.length === 0 && poPaymentVersions.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
        {t('poPayment.history.noData')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Left: Strategy Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>
            {t('poPayment.history.strategyColumn')}
          </span>
          <span
            className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
          >
            {strategyVersions.length}
          </span>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {strategyVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('poPayment.history.noStrategyVersions')}
            </p>
          ) : (
            strategyVersions.map((v, idx) => (
              <StrategyVersionCard key={idx} version={v} idx={idx} colors={colors} t={t} />
            ))
          )}
        </div>
      </div>

      {/* Middle: Deposit Payment Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.orange }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>
            {t('poPayment.history.depositColumn')}
          </span>
          <span
            className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}
          >
            {depositPaymentVersions.length}
          </span>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {depositPaymentVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('poPayment.history.noDepositVersions')}
            </p>
          ) : (
            depositPaymentVersions.map((v, idx) => (
              <PaymentVersionCard key={idx} version={v} idx={idx} prefix="D" colors={colors} t={t} />
            ))
          )}
        </div>
      </div>

      {/* Right: PO Payment Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>
            {t('poPayment.history.poPaymentColumn')}
          </span>
          <span
            className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
          >
            {poPaymentVersions.length}
          </span>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {poPaymentVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('poPayment.history.noPoPaymentVersions')}
            </p>
          ) : (
            poPaymentVersions.map((v, idx) => (
              <PaymentVersionCard key={idx} version={v} idx={idx} prefix="P" colors={colors} t={t} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════ Sub-components ═══════════

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function StrategyVersionCard({ version: v, idx, colors, t }: {
  version: DepositStrategyVersion; idx: number;
  colors: (typeof themeColors)['dark'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
}) {
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleString() : '';
  const accentColor = v.isInitial ? colors.green : colors.blue;

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            S{String(idx + 1).padStart(2, '0')}
          </span>
          {v.isInitial && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.green}12`, color: colors.green }}
            >
              {t('poPayment.history.initial')}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: colors.textTertiary }}>{v.byUser}</p>
          <p className="text-xs" style={{ color: colors.textTertiary }}>{dateStr}</p>
        </div>
      </div>

      {/* Initial data */}
      {v.isInitial && v.data && (
        <div className="space-y-1.5 mb-2">
          {Object.entries(v.data).map(([key, val]) => (
            <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-28 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{key}</span>
              <span className="font-mono font-semibold tabular-nums" style={{ color: colors.textSecondary }}>
                {typeof val === 'number' ? fmtNum(val, 5) : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Changes */}
      {v.changes.length > 0 && (
        <div className="space-y-1.5">
          {v.changes.map((ch: FieldChange, ci: number) => (
            <ChangeRow key={ci} change={ch} colors={colors} />
          ))}
        </div>
      )}

      {v.note && (
        <p className="text-xs mt-2 italic" style={{ color: colors.textTertiary }}>{v.note}</p>
      )}
    </div>
  );
}

function PaymentVersionCard({ version: v, idx, prefix, colors, t }: {
  version: DepositPaymentVersion; idx: number; prefix: string;
  colors: (typeof themeColors)['dark'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
}) {
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleString() : '';
  const accentColor = v.isInitial ? colors.green : colors.blue;

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            {prefix}{String(idx + 1).padStart(2, '0')}
          </span>
          {v.isInitial && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.green}12`, color: colors.green }}
            >
              {t('poPayment.history.initial')}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: colors.textTertiary }}>{v.byUser}</p>
          <p className="text-xs" style={{ color: colors.textTertiary }}>{dateStr}</p>
        </div>
      </div>

      {/* Initial data */}
      {v.isInitial && v.data && (
        <div className="space-y-1.5 mb-2">
          {Object.entries(v.data).map(([key, val]) => (
            <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-28 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{key}</span>
              <span className="font-mono font-semibold tabular-nums" style={{ color: colors.textSecondary }}>
                {typeof val === 'number' ? fmtNum(val, 5) : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Changes */}
      {v.changes.length > 0 && (
        <div className="space-y-1.5">
          {v.changes.map((ch: FieldChange, ci: number) => (
            <ChangeRow key={ci} change={ch} colors={colors} />
          ))}
        </div>
      )}

      {v.note && (
        <p className="text-xs mt-2 italic" style={{ color: colors.textTertiary }}>{v.note}</p>
      )}
    </div>
  );
}

function ChangeRow({ change, colors }: { change: FieldChange; colors: (typeof themeColors)['dark'] }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
      <span className="w-28 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{change.field}</span>
      <span className="font-mono line-through" style={{ color: colors.red }}>{change.old}</span>
      <span style={{ color: colors.textTertiary }}>&rarr;</span>
      <span className="font-mono font-semibold" style={{ color: colors.green }}>{change.new}</span>
    </div>
  );
}
