'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { PurchaseOrder } from '@/lib/api';

interface POTableProps {
  orders: PurchaseOrder[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (order: PurchaseOrder) => void;
}

/**
 * V1 parity: po_mgmt list table.
 * Columns: PO# (+shipping badge), Supplier, Date, Total (RMB + USD dual), Status
 */
export default function POTable({ orders, isLoading, error, onRetry, onRowClick }: POTableProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p style={{ color: colors.red }} className="mb-4">
          {t('orders.table.loadFailed')}
        </p>
        <button
          onClick={onRetry}
          style={{ backgroundColor: colors.blue, color: '#ffffff' }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
        >
          {t('orders.table.retry')}
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('orders.table.noOrders')}</p>
      </div>
    );
  }

  // V1 shipping status badge colors
  const shippingBadge = (order: PurchaseOrder) => {
    if (order.isDeleted) {
      return { color: colors.red, label: t('orders.shipping.deleted') };
    }
    switch (order.shippingStatus) {
      case 'fully_shipped':
        return { color: colors.green, label: t('orders.shipping.fullyShipped') };
      case 'partially_shipped':
        return { color: colors.orange, label: t('orders.shipping.partiallyShipped') };
      case 'not_shipped':
      default:
        return { color: colors.textTertiary, label: t('orders.shipping.notShipped') };
    }
  };

  const formatAmount = (val?: number | null) => {
    if (val == null) return '-';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.poNum')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.supplier')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.orderDate')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              V##
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              L##
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.detail.currency')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.totalRmb')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.totalUsd')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => {
            const badge = shippingBadge(order);
            return (
              <tr
                key={order.id}
                onClick={() => onRowClick(order)}
                style={{
                  borderColor: colors.border,
                  opacity: order.isDeleted ? 0.55 : 1,
                }}
                className={`${index !== orders.length - 1 ? 'border-b' : ''} cursor-pointer transition-colors hover:opacity-80`}
              >
                <td className="py-3 px-4 whitespace-nowrap">
                  <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                    {order.poNum}
                  </span>
                </td>
                <td style={{ color: colors.text }} className="py-3 px-4 text-sm whitespace-nowrap">
                  {order.supplierCode}
                </td>
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {order.poDate}
                </td>
                {/* V1 parity: strategy version V## badge */}
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {order.strategySeq && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                      style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
                    >
                      {order.strategySeq}
                    </span>
                  )}
                </td>
                {/* V1 parity: detail version L## badge */}
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {order.detailSeq && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                      style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
                    >
                      {order.detailSeq}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  <span style={{ color: colors.blue }} className="text-sm font-mono">
                    {order.currency ?? '-'}
                  </span>
                  {order.exchangeRate != null && order.exchangeRate !== 1 && (
                    <span style={{ color: colors.textTertiary }} className="text-[10px] ml-1">
                      ({order.exchangeRate})
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.text }} className="text-sm font-mono">
                    ¥{formatAmount(order.totalRmb)}
                  </span>
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.textSecondary }} className="text-sm font-mono">
                    ${formatAmount(order.totalUsd)}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                    style={{
                      backgroundColor: `${badge.color}20`,
                      color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
