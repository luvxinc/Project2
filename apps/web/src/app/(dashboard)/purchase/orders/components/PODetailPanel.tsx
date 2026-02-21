'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { PurchaseOrder } from '@/lib/api';

interface POEvent {
  id: number;
  eventType: string;
  eventSeq: number;
  changes: string;
  note: string | null;
  operator: string;
  createdAt: string;
}

interface PODetailPanelProps {
  order: PurchaseOrder;
  detail: PurchaseOrder | null;
  isLoading: boolean;
  history: POEvent[];
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onExport: () => void;
  onBack: () => void;
}

// Human-readable field labels (V1 parity: po_mgmt field definitions)
const STRATEGY_FIELD_KEYS = [
  'currency', 'exchangeRate', 'rateMode',
  'floatEnabled', 'floatThreshold',
  'requireDeposit', 'depositRatio', 'note',
] as const;

const ITEM_FIELD_KEYS = ['quantity', 'unitPrice'] as const;

export default function PODetailPanel({
  order,
  detail,
  isLoading,
  history,
  onEdit,
  onDelete,
  onRestore,
  onExport,
  onBack,
}: PODetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');

  const isDeleted = order.isDeleted === true;
  // V1 parity: cannot edit/delete if any items have been shipped
  const isShipped = order.shippingStatus === 'partially_shipped' || order.shippingStatus === 'fully_shipped';
  const canModify = !isDeleted && !isShipped;

  // V1 parity: shipping status badge
  const badge = (() => {
    if (isDeleted) return { color: colors.red, label: t('orders.shipping.deleted') };
    switch (order.shippingStatus) {
      case 'fully_shipped': return { color: colors.green, label: t('orders.shipping.fullyShipped') };
      case 'partially_shipped': return { color: colors.orange, label: t('orders.shipping.partiallyShipped') };
      default: return { color: colors.textTertiary, label: t('orders.shipping.notShipped') };
    }
  })();

  const items = detail?.items ?? [];
  const strategy = detail?.strategy ?? null;
  const currency = strategy?.currency ?? 'USD';
  const exchangeRate = strategy?.exchangeRate ?? 1;
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalRMB = currency === 'USD' ? totalAmount * exchangeRate : totalAmount;
  const totalUSD = currency === 'RMB' ? totalAmount / exchangeRate : totalAmount;

  // ── History helpers ──
  // V1 双栏分流:
  // 左栏「策略变更」= CREATE / UPDATE_STRATEGY / UPDATE_ITEMS_AND_STRATEGY / DELETE / RESTORE
  // 右栏「商品变更」= CREATE / UPDATE_ITEMS / UPDATE_ITEMS_AND_STRATEGY / DELETE / RESTORE
  const strategyEvents = history.filter(ev =>
    ['CREATE', 'UPDATE_STRATEGY', 'UPDATE_ITEMS_AND_STRATEGY', 'DELETE', 'RESTORE'].includes(ev.eventType)
  );
  const itemEvents = history.filter(ev =>
    ['CREATE', 'UPDATE_ITEMS', 'UPDATE_ITEMS_AND_STRATEGY', 'DELETE', 'RESTORE'].includes(ev.eventType)
  );

  const parseFieldChanges = (changesJson: string) => {
    try {
      const raw = JSON.parse(changesJson) as Record<string, { before: unknown; after: unknown } | unknown[]>;
      const result: { field: string; before: unknown; after: unknown }[] = [];
      // Strategy fields: { fieldName: { before, after } }
      for (const [key, val] of Object.entries(raw)) {
        if (key !== 'items' && val && typeof val === 'object' && !Array.isArray(val)) {
          const v = val as { before: unknown; after: unknown };
          if ('before' in v && 'after' in v) {
            result.push({ field: key, before: v.before, after: v.after });
          }
        }
      }
      return result;
    } catch { return []; }
  };

  const parseItemChanges = (changesJson: string) => {
    try {
      const raw = JSON.parse(changesJson) as {
        items?: {
          added?: { sku: string; qty: number; unitPrice: number }[];
          removed?: { sku: string }[];
          adjusted?: { sku: string; field: string; before: unknown; after: unknown }[];
        };
        added?: { sku: string; qty: number; unitPrice: number }[];
        removed?: { sku: string }[];
        adjusted?: { sku: string; field: string; before: unknown; after: unknown }[];
      };
      // Supports both nested { items: { added/removed/adjusted } } and flat { added/removed/adjusted }
      const src = raw.items ?? raw;
      return {
        added: src.added ?? [],
        removed: src.removed ?? [],
        adjusted: src.adjusted ?? [],
      };
    } catch { return { added: [], removed: [], adjusted: [] }; }
  };

  // ── Tab bar config ──
  const tabs = [
    { id: 'items' as const, label: t('orders.detail.itemsTitle'), count: items.length },
    { id: 'history' as const, label: t('orders.detail.historyTitle'), count: history.length },
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
          {t('orders.detail.edit') === '编辑' ? '返回' : 'Back'}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            onClick={onExport}
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 flex items-center gap-1.5"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('orders.detail.exportExcel')}
          </button>

          {/* Edit / Delete / Restore */}
          {isDeleted ? (
            <button
              onClick={onRestore}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
            >
              {t('orders.detail.restore')}
            </button>
          ) : canModify ? (
            <>
              <button
                onClick={onEdit}
                disabled={!canModify}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {t('orders.detail.edit')}
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: `${colors.red}15`, color: colors.red }}
              >
                {t('orders.detail.delete')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Summary card ───────────────────────────────────── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: PO # + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {order.poNum}
            </p>
            <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>{order.supplierCode}</span>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: `${badge.color}12`,
                color: badge.color,
                boxShadow: `0 0 0 1px ${badge.color}40`,
              }}
            >
              {badge.label}
            </span>
            {order.strategySeq && (
              <span
                className="px-2 py-0.5 rounded font-mono text-[11px] font-medium"
                style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
              >
                {t('orders.table.strategyVer')} {order.strategySeq}
              </span>
            )}
            {order.detailSeq && (
              <span
                className="px-2 py-0.5 rounded font-mono text-[11px] font-medium"
                style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
              >
                {t('orders.table.detailVer')} {order.detailSeq}
              </span>
            )}
          </div>
          {/* Total value quick glance */}
          {!isLoading && (
            <div className="text-right">
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('orders.detail.totalAmount')}</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                {currency === 'USD' ? '$' : '¥'}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {currency === 'USD' && exchangeRate > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                    ≈ ¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Body: field grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.table.orderDate')}</p>
              <p className="text-sm font-mono font-medium" style={{ color: colors.text }}>{order.poDate}</p>
            </div>
            {strategy && (
              <>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.exchangeRate')}</p>
                  <p className="text-sm font-mono" style={{ color: colors.text }}>
                    {strategy.exchangeRate}
                    <span className="ml-2 text-xs" style={{ color: colors.textSecondary }}>
                      ({strategy.rateMode === 'auto' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.floatEnabled')}</p>
                  <p className="text-sm" style={{ color: colors.text }}>
                    {strategy.floatEnabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                        {strategy.floatThreshold}%
                      </span>
                    ) : t('orders.detail.no')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.depositEnabled')}</p>
                  <p className="text-sm" style={{ color: colors.text }}>
                    {strategy.requireDeposit ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}>
                        {strategy.depositRatio}%
                      </span>
                    ) : t('orders.detail.no')}
                  </p>
                </div>
                {strategy.note && (
                  <div className="col-span-2 md:col-span-4 mt-1">
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.note')}</p>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>{strategy.note}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

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
      {!isLoading && (
        <div className="mt-4">

            {/* Items Tab */}
            {activeTab === 'items' && (
              <div>
                {items.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.noItems')}
                  </p>
                ) : (
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${colors.border}` }}
                  >
                    <table className="w-full">
                      <thead>
                        <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                          <th style={{ color: colors.textTertiary }} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                            {t('orders.detail.sku')}
                          </th>
                          <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                            {t('orders.detail.qty')}
                          </th>
                          <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                            {t('orders.detail.unitPrice')}
                          </th>
                          <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                            {t('orders.detail.amount')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          const amount = item.quantity * item.unitPrice;
                          return (
                            <tr
                              key={item.id}
                              style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}
                            >
                              <td style={{ color: colors.text }} className="px-4 py-2.5 text-sm font-mono whitespace-nowrap">
                                {item.sku}
                              </td>
                              <td style={{ color: colors.textSecondary }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap">
                                {item.quantity.toLocaleString()}
                              </td>
                              <td style={{ color: colors.textSecondary }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap">
                                {currency === 'USD' ? '$' : '¥'}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ color: colors.text }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap font-semibold">
                                {currency === 'USD' ? '$' : '¥'}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
                          <td colSpan={3} className="px-4 py-2.5 text-sm font-medium text-right" style={{ color: colors.textSecondary }}>
                            {t('orders.detail.totalAmount')}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>
                            {currency === 'USD' ? '$' : '¥'}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {currency === 'USD' && exchangeRate > 0 && (
                          <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                            <td colSpan={3} className="px-4 py-1.5 text-xs text-right" style={{ color: colors.textTertiary }}>
                              {t('orders.detail.totalRMB')}
                            </td>
                            <td className="px-4 py-1.5 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>
                              ¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {currency === 'RMB' && exchangeRate > 0 && (
                          <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                            <td colSpan={3} className="px-4 py-1.5 text-xs text-right" style={{ color: colors.textTertiary }}>
                              {t('orders.detail.totalUSD')}
                            </td>
                            <td className="px-4 py-1.5 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>
                              ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* History Tab — V1 双栏 */}
            {activeTab === 'history' && (() => {
              if (history.length === 0) {
                return (
                  <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.historyTitle')} — 暂无记录
                  </p>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-4">

                  {/* ── 左栏：策略变更记录 ── */}
                  <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    <div
                      className="flex items-center gap-2 px-4 py-3 shrink-0"
                      style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('orders.detail.history.panelStrategy')}</span>
                      <span
                        className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
                      >
                        {strategyEvents.length}
                      </span>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                      {strategyEvents.length === 0 ? (
                        <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noStrategyChanges')}</p>
                      ) : (
                        strategyEvents.map((ev, idx) => {
                          const isCreate = ev.eventType === 'CREATE';
                          const isDelete = ev.eventType === 'DELETE';
                          const isRestore = ev.eventType === 'RESTORE';
                          const accentColor = isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue;
                          const fieldChanges = parseFieldChanges(ev.changes);

                          return (
                            <div
                              key={ev.id}
                              className="rounded-xl p-4"
                              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                                    style={{
                                      backgroundColor: `${accentColor}15`,
                                      color: accentColor,
                                    }}
                                  >
                                    S{String(idx + 1).padStart(2, '0')}
                                  </span>
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                      backgroundColor: isCreate || isDelete || isRestore ? `${accentColor}12` : colors.bgTertiary,
                                      color: isCreate || isDelete || isRestore ? accentColor : colors.textSecondary,
                                    }}
                                  >
                                    {isCreate ? t('orders.detail.history.typeCreate') : isDelete ? t('orders.detail.history.typeDelete') : isRestore ? t('orders.detail.history.typeRestore') : t('orders.detail.history.typeUpdate')}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{new Date(ev.createdAt).toLocaleString()}</p>
                                </div>
                              </div>
                              {ev.note && <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{ev.note}</p>}
                              {fieldChanges.length > 0 ? (
                                <div className="space-y-1.5">
                                  {fieldChanges.map((ch, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                      style={{ backgroundColor: colors.bgTertiary }}
                                    >
                                      <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>
                                         {t(`orders.detail.history.fieldLabels.${ch.field}`) ?? ch.field}
                                      </span>
                                      <span className="font-mono line-through" style={{ color: colors.red }}>{String(ch.before ?? '—')}</span>
                                      <span style={{ color: colors.textTertiary }}>→</span>
                                      <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(ch.after ?? '—')}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : isCreate ? (
                                <div className="space-y-1.5">
                                  {/* V1 parity: strategy CREATE shows full initial snapshot */}
                                  {(() => {
                                    try {
                                      const raw = JSON.parse(ev.changes) as Record<string, unknown>;
                                      // Backend stores CREATE as: { items: [...], strategy: { currency, exchangeRate, ... } }
                                      const strategyData = (raw.strategy ?? raw) as Record<string, unknown>;
                                      const fields = STRATEGY_FIELD_KEYS.map(k => ({ key: k, label: t(`orders.detail.history.fieldLabels.${k}`) }));
                                      const hasData = fields.some(f => strategyData[f.key] !== undefined);
                                      if (!hasData) return <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.initialSnapshot')}</p>;
                                      return fields.map(f => {
                                        const val = strategyData[f.key];
                                        if (val === undefined || val === null) return null;
                                        let display = String(val);
                                        if (typeof val === 'boolean') display = val ? t('orders.detail.history.boolYes') : t('orders.detail.history.boolNo');
                                        if (f.key === 'rateMode') display = val === 'auto' ? t('orders.detail.history.rateModeAuto') : t('orders.detail.history.rateModeManual');
                                        if (f.key === 'floatThreshold' || f.key === 'depositRatio') display = `${val}%`;
                                        return (
                                          <div
                                            key={f.key}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                            style={{ backgroundColor: colors.bgTertiary }}
                                          >
                                            <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
                                            <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{display}</span>
                                          </div>
                                        );
                                      });
                                    } catch {
                                      return <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.initialSnapshot')}</p>;
                                    }
                                  })()}
                                </div>
                              ) : isDelete ? (
                                <p className="text-xs italic" style={{ color: colors.red }}>{t('orders.detail.history.deleted')}</p>
                              ) : isRestore ? (
                                <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.restored')}</p>
                              ) : (
                                <p className="text-xs italic" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noStrategyFieldChanges')}</p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* ── 右栏：商品变更记录 ── */}
                  <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    <div
                      className="flex items-center gap-2 px-4 py-3 shrink-0"
                      style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('orders.detail.history.panelItems')}</span>
                      <span
                        className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
                      >
                        {itemEvents.length}
                      </span>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                      {itemEvents.length === 0 ? (
                        <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noItemChanges')}</p>
                      ) : (
                        itemEvents.map((ev, idx) => {
                          const isCreate = ev.eventType === 'CREATE';
                          const isDelete = ev.eventType === 'DELETE';
                          const isRestore = ev.eventType === 'RESTORE';
                          const itemChanges = parseItemChanges(ev.changes);
                          const snapshotItems = isCreate ? items : [];
                          const hasChanges = itemChanges.added.length > 0 || itemChanges.removed.length > 0 || itemChanges.adjusted.length > 0;

                          return (
                            <div
                              key={ev.id}
                              className="rounded-xl p-4"
                              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                                    style={{
                                      backgroundColor: `${isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue}15`,
                                      color: isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue,
                                    }}
                                  >
                                    L{String(idx + 1).padStart(2, '0')}
                                  </span>
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                      backgroundColor: isCreate || isDelete || isRestore ? `${isCreate ? colors.green : isDelete ? colors.red : colors.orange}12` : colors.bgTertiary,
                                      color: isCreate || isDelete || isRestore ? (isCreate ? colors.green : isDelete ? colors.red : colors.orange) : colors.textSecondary,
                                    }}
                                  >
                                    {isCreate ? t('orders.detail.history.typeInitialItems') : isDelete ? t('orders.detail.history.typeDelete') : isRestore ? t('orders.detail.history.typeRestore') : t('orders.detail.history.typeAdjust')}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{new Date(ev.createdAt).toLocaleString()}</p>
                                </div>
                              </div>
                              {ev.note && <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{ev.note}</p>}

                              {/* CREATE: initial snapshot */}
                              {isCreate && snapshotItems.length > 0 && (
                                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                  <div
                                    className="grid grid-cols-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                                    style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}
                                  >
                                    <span>SKU</span>
                                    <span className="text-right">{t('orders.detail.history.snapshotQty')}</span>
                                    <span className="text-right">{t('orders.detail.history.snapshotPrice')}</span>
                                  </div>
                                  {snapshotItems.map((item, i) => (
                                    <div
                                      key={item.id}
                                      className="grid grid-cols-3 px-4 py-2 text-xs"
                                      style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}
                                    >
                                      <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                      <span className="text-right" style={{ color: colors.textSecondary }}>{item.quantity.toLocaleString()}</span>
                                      <span className="text-right font-mono" style={{ color: colors.textSecondary }}>{currency === 'USD' ? '$' : '¥'}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* UPDATE_ITEMS: diff changes */}
                              {!isCreate && hasChanges && (
                                <div className="space-y-1.5">
                                  {itemChanges.added.map((item, i) => (
                                    <div key={`add-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: `${colors.green}08` }}>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>{t('orders.detail.history.itemAdded')}</span>
                                      <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                      <span style={{ color: colors.textTertiary }}>{t('orders.detail.history.itemAddedDetail', { qty: item.qty, price: (item.unitPrice ?? 0).toFixed(2) })}</span>
                                    </div>
                                  ))}
                                  {itemChanges.removed.map((item, i) => (
                                    <div key={`rm-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: `${colors.red}08` }}>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.red}15`, color: colors.red }}>{t('orders.detail.history.itemRemoved')}</span>
                                      <span className="font-mono font-medium line-through" style={{ color: colors.textSecondary }}>{item.sku}</span>
                                    </div>
                                  ))}
                                  {itemChanges.adjusted.map((item, i) => (
                                    <div key={`adj-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>{t('orders.detail.history.itemAdjusted')}</span>
                                      <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                      <span className="font-mono line-through" style={{ color: colors.red }}>{String(item.before ?? '—')}</span>
                                      <span style={{ color: colors.textTertiary }}>→</span>
                                      <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(item.after ?? '—')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isDelete && <p className="text-xs italic" style={{ color: colors.red }}>{t('orders.detail.history.deletedItems')}</p>}
                              {isRestore && <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.restoredItems')}</p>}
                              {!isCreate && !isDelete && !isRestore && !hasChanges && (
                                <p className="text-xs italic" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noItemAdjust')}</p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
      )}

      {/* ── Footer meta ── */}
      {!isLoading && detail && (
        <div
          className="mt-6 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
          style={{ borderTop: `1px solid ${colors.border}`, color: colors.textTertiary }}
        >
          {detail.createdBy && <span>{t('orders.detail.operator')}: {detail.createdBy}</span>}
          <span>{t('orders.detail.createdAt')}: {new Date(detail.createdAt).toLocaleString()}</span>
          {detail.updatedBy && detail.updatedBy !== detail.createdBy && (
            <span>{t('orders.detail.lastEditor')}: {detail.updatedBy}</span>
          )}
          <span>{t('orders.detail.updatedAt')}: {new Date(detail.updatedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
