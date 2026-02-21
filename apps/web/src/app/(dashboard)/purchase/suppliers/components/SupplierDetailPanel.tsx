'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { SupplierWithStrategy, SupplierStrategy } from '@/lib/api';

interface SupplierDetailPanelProps {
  supplier: SupplierWithStrategy;
  strategies: SupplierStrategy[];
  isLoading: boolean;
  onNewStrategy: () => void;
  onEditStrategy: (strategy: SupplierStrategy) => void;
  onBack: () => void;
}

export default function SupplierDetailPanel({
  supplier,
  strategies,
  isLoading,
  onNewStrategy,
  onEditStrategy,
  onBack,
}: SupplierDetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [activeTab, setActiveTab] = useState<'strategies'>('strategies');

  // Latest strategy for summary card display
  const latestStrategy = strategies.length > 0 ? strategies[0] : null;

  // ── Tab bar config (matches PO/Shipment/Receive pattern) ──
  const tabs = [
    { id: 'strategies' as const, label: t('detail.historyTitle'), count: strategies.length },
  ];

  return (
    <div className="relative">
      {/* ── Back + Actions bar ─────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('detail.historyTitle') === '策略历史' ? '返回' : 'Back'}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onNewStrategy}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 flex items-center gap-1.5"
            style={{
              backgroundColor: !supplier.status ? `${colors.orange}15` : colors.bgTertiary,
              color: !supplier.status ? colors.orange : colors.text,
            }}
          >
            {supplier.status ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('actions.updateStrategy')}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('status.reactivate')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Summary card ───────────────────────────────────── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: Supplier Code + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {supplier.supplierCode}
            </p>
            <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
              {supplier.supplierName}
            </span>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: `${supplier.status ? colors.green : colors.textTertiary}12`,
                color: supplier.status ? colors.green : colors.textTertiary,
                boxShadow: `0 0 0 1px ${supplier.status ? colors.green : colors.textTertiary}40`,
              }}
            >
              {supplier.status ? t('status.active') : t('status.inactive')}
            </span>
          </div>
          {/* Right side: latest strategy quick glance */}
          {!isLoading && latestStrategy && (
            <div className="text-right">
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('table.effectiveDate')}</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                {latestStrategy.effectiveDate}
              </p>
            </div>
          )}
        </div>

        {/* Body: field grid (matches 2 md:4 pattern from PO/Shipment) */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Category */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('table.category')}</p>
              <p className="text-sm" style={{ color: colors.text }}>
                {latestStrategy ? t(`category.${latestStrategy.category}` as any) : '—'}
              </p>
            </div>
            {/* Currency */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('table.currency')}</p>
              <p className="text-sm font-mono" style={{ color: colors.text }}>
                {latestStrategy?.currency ?? '—'}
              </p>
            </div>
            {/* Float Currency */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('table.floatCurrency')}</p>
              <p className="text-sm" style={{ color: colors.text }}>
                {latestStrategy?.floatCurrency ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                  >
                    {latestStrategy.floatThreshold}%
                  </span>
                ) : '—'}
              </p>
            </div>
            {/* Deposit */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('table.requireDeposit')}</p>
              <p className="text-sm" style={{ color: colors.text }}>
                {latestStrategy?.requireDeposit ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}
                  >
                    {latestStrategy.depositRatio}%
                  </span>
                ) : '—'}
              </p>
            </div>
            {/* Note (spans remaining cols) */}
            {latestStrategy?.note && (
              <div className="col-span-2 md:col-span-3">
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('edit.note')}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>{latestStrategy.note}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inactive lockdown warning */}
      {!supplier.status && (
        <div
          className="rounded-xl mb-5 px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: `${colors.orange}10`, border: `1px solid ${colors.orange}30` }}
        >
          <svg className="w-5 h-5 flex-shrink-0" style={{ color: colors.orange }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs font-medium" style={{ color: colors.orange }}>
            {t('status.inactiveWarning')}
          </p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-medium transition-all"
            style={{
              color: activeTab === tab.id ? colors.blue : colors.textTertiary,
              borderBottom: activeTab === tab.id ? `2px solid ${colors.blue}` : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-[-2px] align-middle"
                style={{
                  backgroundColor: activeTab === tab.id ? `${colors.blue}20` : colors.bgTertiary,
                  color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: colors.border, borderTopColor: colors.blue }}
          />
        </div>
      ) : activeTab === 'strategies' && (
        <div className="mt-4">
          {strategies.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('detail.noHistory')}
            </p>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${colors.border}` }}
            >
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('table.effectiveDate')}
                    </th>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('table.category')}
                    </th>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('table.currency')}
                    </th>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('table.floatCurrency')}
                    </th>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('table.requireDeposit')}
                    </th>
                    <th
                      style={{ color: colors.textTertiary }}
                      className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('edit.note')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((strategy, index) => {
                    const isNewest = index === 0;

                    return (
                      <tr
                        key={strategy.id}
                        onClick={supplier.status ? () => onEditStrategy(strategy) : undefined}
                        className={supplier.status ? 'hover:opacity-80 cursor-pointer' : 'opacity-60 cursor-not-allowed'}
                        style={{
                          borderTop: index > 0 ? `1px solid ${colors.border}` : undefined,
                          backgroundColor: isNewest ? `${colors.blue}0d` : 'transparent',
                          color: isNewest ? colors.text : colors.textSecondary,
                        }}
                      >
                        <td className="px-4 py-2.5 text-sm font-mono whitespace-nowrap">
                          {strategy.effectiveDate}
                          {isNewest && (
                            <span
                              className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
                            >
                              {t('detail.latestBadge')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                          {t(`category.${strategy.category}` as any)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-sm font-mono" style={{ color: isNewest ? colors.blue : colors.textSecondary }}>
                            {strategy.currency}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {strategy.floatCurrency ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                            >
                              {strategy.floatThreshold}%
                            </span>
                          ) : (
                            <span style={{ color: colors.textTertiary }} className="text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {strategy.requireDeposit ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}
                            >
                              {strategy.depositRatio}%
                            </span>
                          ) : (
                            <span style={{ color: colors.textTertiary }} className="text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm whitespace-nowrap max-w-[200px] truncate">
                          {strategy.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Footer meta ── */}
      <div
        className="mt-6 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
        style={{ borderTop: `1px solid ${colors.border}`, color: colors.textTertiary }}
      >
        <span>
          {t('table.createdAt')}: {supplier.createdAt ? new Date(supplier.createdAt).toLocaleString() : '—'}
        </span>
        {supplier.updatedAt && supplier.updatedAt !== supplier.createdAt && (
          <span>
            {t('table.updatedAt')}: {new Date(supplier.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
