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
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

/**
 * V1 parity: po_mgmt list table.
 * Columns: PO# (+shipping badge), Supplier, Date, Total (RMB + USD dual), Status
 * All headers are sortable.
 */
export default function POTable({ orders, isLoading, error, onRetry, onRowClick, sortField, sortOrder, onSort }: POTableProps) {
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

  const renderSortHeader = (field: string, label: string, align: string = 'text-left') => {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => onSort(field)}
        style={{ color: colors.textSecondary }}
        className={`${align} py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-opacity hover:opacity-70`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <svg
            className="w-3 h-3"
            style={{ opacity: isActive ? 1 : 0.25, color: isActive ? colors.blue : colors.textSecondary }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            {isActive && sortOrder === 'desc' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            )}
          </svg>
        </span>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            {renderSortHeader('poNum', t('orders.table.poNum'))}
            {renderSortHeader('supplierCode', t('orders.table.supplier'))}
            {renderSortHeader('poDate', t('orders.table.orderDate'))}
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.strategyVer')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.table.detailVer')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('orders.detail.currency')}
            </th>
            {renderSortHeader('totalRmb', t('orders.table.totalRmb'), 'text-right')}
            {renderSortHeader('totalUsd', t('orders.table.totalUsd'), 'text-right')}
            {renderSortHeader('shippingStatus', t('orders.table.status'), 'text-center')}
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
