'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { Shipment } from '@/lib/api';

interface ShipmentTableProps {
  shipments: Shipment[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (shipment: Shipment) => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export default function ShipmentTable({ shipments, isLoading, error, onRetry, onRowClick, sortField, sortOrder, onSort }: ShipmentTableProps) {
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
          {t('shipments.table.loadFailed')}
        </p>
        <button
          onClick={onRetry}
          style={{ backgroundColor: colors.blue, color: '#ffffff' }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
        >
          {t('shipments.table.retry')}
        </button>
      </div>
    );
  }

  if (shipments.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('shipments.table.noShipments')}</p>
      </div>
    );
  }

  // ── Apple-style receive status badge ─────────────────────────────────
  const receiveBadge = (shipment: Shipment) => {
    if (shipment.isDeleted) {
      return {
        label: t('shipments.status.deleted'),
        bg: 'rgba(142,142,147,0.14)',
        color: colors.gray,
        dot: colors.gray,
        ring: 'rgba(142,142,147,0.25)',
      };
    }
    switch (shipment.receiveStatus ?? 'IN_TRANSIT') {
      case 'ALL_RECEIVED':
        return {
          label: t('shipments.receiveStatus.ALL_RECEIVED'),
          bg: 'rgba(48,209,88,0.12)',
          color: colors.green,
          dot: colors.green,
          ring: 'rgba(48,209,88,0.3)',
        };
      case 'DIFF_UNRESOLVED':
        return {
          label: t('shipments.receiveStatus.DIFF_UNRESOLVED'),
          bg: 'rgba(255,69,58,0.12)',
          color: colors.red,
          dot: colors.red,
          ring: 'rgba(255,69,58,0.3)',
        };
      case 'DIFF_RESOLVED':
        return {
          label: t('shipments.receiveStatus.DIFF_RESOLVED'),
          bg: 'rgba(100,210,255,0.12)',
          color: colors.teal,
          dot: colors.teal,
          ring: 'rgba(100,210,255,0.3)',
        };
      case 'IN_TRANSIT':
      default:
        return {
          label: t('shipments.receiveStatus.IN_TRANSIT'),
          bg: 'rgba(255,159,10,0.12)',
          color: colors.orange,
          dot: colors.orange,
          ring: 'rgba(255,159,10,0.3)',
        };
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
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            {renderSortHeader('logisticNum', t('shipments.table.logisticNum'))}
            {renderSortHeader('sentDate', t('shipments.table.sentDate'))}
            {renderSortHeader('etaDate', t('shipments.table.etaDate'))}
            {renderSortHeader('pallets', t('shipments.table.pallets'), 'text-center')}
            {renderSortHeader('logisticsCost', t('shipments.table.logisticsCost'), 'text-right')}
            {renderSortHeader('totalValue', t('shipments.table.totalValue'), 'text-right')}
            {renderSortHeader('receiveStatus', t('shipments.table.status'), 'text-center')}
          </tr>
        </thead>
        <tbody>
          {shipments.map((shipment, index) => {
            const badge = receiveBadge(shipment);
            const costRmb = shipment.logisticsCost;
            const costUsd = shipment.exchangeRate > 0
              ? Math.round(shipment.logisticsCost / shipment.exchangeRate * 100000) / 100000
              : null;
            return (
              <tr
                key={shipment.id}
                onClick={() => onRowClick(shipment)}
                style={{
                  borderColor: colors.border,
                  opacity: shipment.isDeleted ? 0.55 : 1,
                }}
                className={`${index !== shipments.length - 1 ? 'border-b' : ''} cursor-pointer transition-colors hover:opacity-80`}
              >
                <td className="py-3 px-4 whitespace-nowrap">
                  <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                    {shipment.logisticNum}
                  </span>
                </td>
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {shipment.sentDate}
                </td>
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {shipment.etaDate || '-'}
                </td>
                <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap">
                  {shipment.pallets || '-'}
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.text }} className="text-sm font-mono">
                    ¥{formatAmount(costRmb)}
                  </span>
                  {costUsd != null && (
                    <span style={{ color: colors.textTertiary }} className="text-[10px] ml-1">
                      (${formatAmount(costUsd)})
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.text }} className="text-sm font-mono">
                    {shipment.totalValue != null ? `$${formatAmount(shipment.totalValue)}` : '-'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-semibold tracking-tight"
                    style={{
                      backgroundColor: badge.bg,
                      color: badge.color,
                      boxShadow: `0 0 0 1px ${badge.ring}`,
                    }}
                  >
                    {/* Pulsing dot for IN_TRANSIT, static for others */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        (shipment.receiveStatus ?? 'IN_TRANSIT') === 'IN_TRANSIT' && !shipment.isDeleted
                          ? 'animate-pulse'
                          : ''
                      }`}
                      style={{ backgroundColor: badge.dot }}
                    />
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
