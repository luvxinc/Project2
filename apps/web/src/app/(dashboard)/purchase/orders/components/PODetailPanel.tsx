'use client';

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
}

export default function PODetailPanel({
  order,
  detail,
  isLoading,
  history,
  onEdit,
  onDelete,
  onRestore,
  onExport,
}: PODetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const isDeleted = order.isDeleted === true;
  // V1 parity: cannot edit/delete if any items have been shipped
  const isShipped = order.shippingStatus === 'partially_shipped' || order.shippingStatus === 'fully_shipped';
  const canModify = !isDeleted && !isShipped;

  // V1 parity: shipping status badge
  const shippingBadge = () => {
    if (isDeleted) return { color: colors.red, label: t('orders.shipping.deleted') };
    switch (order.shippingStatus) {
      case 'fully_shipped': return { color: colors.green, label: t('orders.shipping.fullyShipped') };
      case 'partially_shipped': return { color: colors.orange, label: t('orders.shipping.partiallyShipped') };
      default: return { color: colors.textTertiary, label: t('orders.shipping.notShipped') };
    }
  };
  const badge = shippingBadge();

  // ── Compute totals from detail items ──
  const items = detail?.items ?? [];
  const strategy = detail?.strategy ?? null;
  const currency = strategy?.currency ?? 'USD';
  const exchangeRate = strategy?.exchangeRate ?? 1;

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalRMB = currency === 'USD' ? totalAmount * exchangeRate : totalAmount;
  const totalUSD = currency === 'RMB' ? totalAmount / exchangeRate : totalAmount;

  return (
    <div>
      {/* ── Header ── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold shrink-0" style={{ color: colors.text }}>
            <span style={{ color: colors.blue }} className="font-mono">
              {order.poNum}
            </span>
          </h3>
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            {order.supplierCode}
          </span>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{
              backgroundColor: `${badge.color}20`,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            disabled={!canModify}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: colors.blue, color: '#ffffff' }}
          >
            {t('orders.detail.edit')}
          </button>

          {isDeleted ? (
            <button
              onClick={onRestore}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: colors.green, color: colors.green }}
            >
              {t('orders.detail.restore')}
            </button>
          ) : canModify ? (
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: colors.red, color: colors.red }}
            >
              {t('orders.detail.delete')}
            </button>
          ) : null}

          <button
            onClick={onExport}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 flex items-center gap-1"
            style={{ borderColor: colors.gray3, color: colors.textSecondary }}
          >
            {/* Download icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('orders.detail.exportExcel')}
          </button>
        </div>
      </div>

      {/* ── Loading state ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: colors.border, borderTopColor: colors.blue }}
          />
        </div>
      ) : (
        <>
          {/* ── Strategy Section ── */}
          {strategy && (
            <div className="px-5 pt-5 pb-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: colors.textSecondary }}
              >
                {t('orders.detail.strategyInfo')}
              </h4>

              <div
                className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 rounded-lg"
                style={{ backgroundColor: `${colors.bg}80` }}
              >
                {/* Currency */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.currency')}
                  </span>
                  <p className="text-sm font-mono mt-0.5" style={{ color: colors.blue }}>
                    {strategy.currency}
                  </p>
                </div>

                {/* Exchange Rate */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.exchangeRate')}
                  </span>
                  <p className="text-sm font-mono mt-0.5" style={{ color: colors.text }}>
                    {strategy.exchangeRate}
                  </p>
                </div>

                {/* Rate Mode */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.rateMode')}
                  </span>
                  <p className="text-sm mt-0.5" style={{ color: colors.text }}>
                    {strategy.rateMode === 'auto' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')}
                  </p>
                </div>

                {/* Empty cell for alignment */}
                <div />

                {/* Price Float */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.floatEnabled')}
                  </span>
                  <p className="text-sm mt-0.5" style={{ color: colors.text }}>
                    {strategy.floatEnabled ? (
                      <span>
                        {t('orders.detail.yes')}
                        <span
                          className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                        >
                          {strategy.floatThreshold}%
                        </span>
                      </span>
                    ) : (
                      t('orders.detail.no')
                    )}
                  </p>
                </div>

                {/* Deposit */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                    {t('orders.detail.depositEnabled')}
                  </span>
                  <p className="text-sm mt-0.5" style={{ color: colors.text }}>
                    {strategy.requireDeposit ? (
                      <span>
                        {t('orders.detail.yes')}
                        <span
                          className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}
                        >
                          {strategy.depositRatio}%
                        </span>
                      </span>
                    ) : (
                      t('orders.detail.no')
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Items Table ── */}
          <div className="px-5 pt-5 pb-2">
            <h4
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: colors.textSecondary }}
            >
              {t('orders.detail.itemsTitle')}
              {items.length > 0 && (
                <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: colors.textTertiary }}>
                  {t('orders.detail.itemCount', { count: items.length })}
                </span>
              )}
            </h4>
          </div>

          {items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm" style={{ color: colors.textTertiary }}>
                {t('orders.detail.noItems')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: `${colors.bg}80` }}>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('orders.detail.sku')}
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('orders.detail.qty')}
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('orders.detail.unitPrice')}
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      {t('orders.detail.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const amount = item.quantity * item.unitPrice;
                    return (
                      <tr
                        key={item.id}
                        className={index !== items.length - 1 ? 'border-b' : ''}
                        style={{ borderColor: colors.border }}
                      >
                        <td style={{ color: colors.text }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono text-right whitespace-nowrap">
                          {item.quantity}
                        </td>
                        <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono text-right whitespace-nowrap">
                          {item.unitPrice.toFixed(2)}
                        </td>
                        <td style={{ color: colors.text }} className="py-3 px-4 text-sm font-mono text-right whitespace-nowrap font-medium">
                          {amount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer: totals */}
                <tfoot>
                  <tr
                    style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }}
                    className="border-t"
                  >
                    <td colSpan={3} className="py-3 px-4 text-sm font-medium text-right" style={{ color: colors.textSecondary }}>
                      {t('orders.detail.totalAmount')}
                    </td>
                    <td className="py-3 px-4 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>
                      {currency} {totalAmount.toFixed(2)}
                    </td>
                  </tr>

                  {/* Show converted amount if applicable */}
                  {currency === 'USD' && exchangeRate > 0 && (
                    <tr style={{ borderColor: colors.border }} className="border-t">
                      <td colSpan={3} className="py-2 px-4 text-xs text-right" style={{ color: colors.textTertiary }}>
                        {t('orders.detail.totalRMB')}
                      </td>
                      <td className="py-2 px-4 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>
                        RMB {totalRMB.toFixed(2)}
                      </td>
                    </tr>
                  )}

                  {currency === 'RMB' && exchangeRate > 0 && (
                    <tr style={{ borderColor: colors.border }} className="border-t">
                      <td colSpan={3} className="py-2 px-4 text-xs text-right" style={{ color: colors.textTertiary }}>
                        {t('orders.detail.totalUSD')}
                      </td>
                      <td className="py-2 px-4 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>
                        USD {totalUSD.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {/* V1 parity: Event History Timeline */}
          {history.length > 0 && (
            <div className="px-5 pt-5 pb-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: colors.textSecondary }}
              >
                {t('orders.detail.historyTitle')}
              </h4>
              <div className="space-y-2">
                {history.map((ev) => {
                  const typeColor: Record<string, string> = {
                    CREATE: colors.green, UPDATE_ITEMS: colors.blue,
                    UPDATE_STRATEGY: colors.blue, UPDATE_ITEMS_AND_STRATEGY: colors.blue,
                    UPDATE_STATUS: colors.textSecondary,
                    DELETE: colors.red, RESTORE: colors.orange,
                  };
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 px-3 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: `${colors.bg}80` }}
                    >
                      <span
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: typeColor[ev.eventType] || colors.textTertiary }}
                      >
                        {ev.eventSeq}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: typeColor[ev.eventType] || colors.text }}>
                            {ev.eventType}
                          </span>
                          <span style={{ color: colors.textTertiary }}>
                            {ev.operator} · {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {ev.note && (
                          <p className="mt-0.5 truncate" style={{ color: colors.textSecondary }}>
                            {ev.note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* V1 parity: show operator + timestamps + strategy note */}
          {detail && (
            <div className="px-5 pt-4 pb-5 space-y-2">
              {/* Strategy note (V1: C12 in detail) */}
              {strategy?.note && (
                <div className="text-xs" style={{ color: colors.textSecondary }}>
                  <span style={{ color: colors.textTertiary }}>{t('orders.detail.note')}:</span>{' '}
                  {strategy.note}
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ color: colors.textTertiary }}>
                {detail.createdBy && <span>{t('orders.detail.operator')}: {detail.createdBy}</span>}
                <span>{t('orders.detail.createdAt')}: {new Date(detail.createdAt).toLocaleString()}</span>
                {detail.updatedBy && detail.updatedBy !== detail.createdBy && (
                  <span>{t('orders.detail.lastEditor')}: {detail.updatedBy}</span>
                )}
                <span>{t('orders.detail.updatedAt')}: {new Date(detail.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
