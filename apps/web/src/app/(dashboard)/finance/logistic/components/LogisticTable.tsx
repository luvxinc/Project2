'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { LogisticListItem } from '@/lib/api';

interface Props {
  data: LogisticListItem[];
  isLoading: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  selectedItems: string[];
  onSelectionChange: (items: string[]) => void;
  onRowClick: (item: LogisticListItem) => void;
  selectable?: boolean;
}

/**
 * LogisticTable — Apple-style table for logistics cost records.
 * V1 parity: logistic.py logistic_list_api
 *
 * Design: Matches ShipmentTable patterns — semi-transparent headers,
 * uppercase tracking-wider labels, Apple-style status badges with dot + ring.
 */
export default function LogisticTable({
  data, isLoading, sortField, sortOrder,
  onSort, selectedItems, onSelectionChange, onRowClick,
  selectable = true,
}: Props) {
  const t = useTranslations('finance');
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

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('logistic.noData')}</p>
      </div>
    );
  }

  // ── Apple-style payment status badge ──
  const paymentBadge = (item: LogisticListItem) => {
    if (item.isDeleted) {
      return {
        label: t('logistic.status.deleted'),
        bg: 'rgba(142,142,147,0.14)',
        color: colors.gray,
        dot: colors.gray,
        ring: 'rgba(142,142,147,0.25)',
      };
    }
    switch (item.paymentStatus) {
      case 'paid':
        return {
          label: t('logistic.status.paid'),
          bg: 'rgba(48,209,88,0.12)',
          color: colors.green,
          dot: colors.green,
          ring: 'rgba(48,209,88,0.3)',
        };
      case 'partial':
        return {
          label: t('logistic.status.partial'),
          bg: 'rgba(100,210,255,0.12)',
          color: colors.teal,
          dot: colors.teal,
          ring: 'rgba(100,210,255,0.3)',
        };
      case 'unpaid':
      default:
        return {
          label: t('logistic.status.unpaid'),
          bg: 'rgba(255,159,10,0.12)',
          color: colors.orange,
          dot: colors.orange,
          ring: 'rgba(255,159,10,0.3)',
        };
    }
  };

  const fmtNum = (val: number, decimals = 2) =>
    val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

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

  const renderStaticHeader = (label: string, align: string = 'text-left') => (
    <th
      style={{ color: colors.textSecondary }}
      className={`${align} py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap`}
    >
      {label}
    </th>
  );

  // Selection
  const selectableNums = data
    .filter(item => !item.isPaid && !item.isDeleted && item.paymentStatus === 'unpaid')
    .map(item => item.logisticNum);
  const allSelected = selectableNums.length > 0 && selectedItems.length === selectableNums.length;

  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? selectableNums : []);
  };

  const handleSelectItem = (logisticNum: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, logisticNum]);
    } else {
      onSelectionChange(selectedItems.filter(n => n !== logisticNum));
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            {/* Select All */}
            {selectable && (
              <th className="py-3 px-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                  style={{ accentColor: colors.blue }}
                />
              </th>
            )}
            {renderSortHeader('logistic_num', t('logistic.table.logisticNum'))}
            {renderSortHeader('date_sent', t('logistic.table.dateSent'))}
            {renderStaticHeader(t('logistic.table.dateEta'))}
            {renderStaticHeader(t('logistic.table.receiveDate'))}
            {renderStaticHeader(t('logistic.table.etaDays'), 'text-center')}
            {renderStaticHeader(t('logistic.table.pallets'), 'text-center')}
            {renderStaticHeader(t('logistic.table.priceKg'), 'text-right')}
            {renderStaticHeader(t('logistic.table.totalWeight'), 'text-right')}
            {renderStaticHeader(t('logistic.table.totalPriceRmb'), 'text-right')}
            {renderStaticHeader(t('logistic.table.logisticPaid'), 'text-right')}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const badge = paymentBadge(item);
            const isSelectable = !item.isPaid && !item.isDeleted && item.paymentStatus === 'unpaid';
            const isSelected = selectedItems.includes(item.logisticNum);

            return (
              <tr
                key={item.logisticNum}
                onClick={() => onRowClick(item)}
                style={{
                  borderColor: colors.border,
                  opacity: item.isDeleted ? 0.55 : 1,
                }}
                className={`${index !== data.length - 1 ? 'border-b' : ''} cursor-pointer transition-colors hover:opacity-80`}
              >
                {/* Checkbox */}
                {selectable && (
                  <td className="py-3 px-3 text-center w-10">
                    {isSelectable && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectItem(item.logisticNum, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                        style={{ accentColor: colors.blue }}
                      />
                    )}
                  </td>
                )}

                {/* Logistic # */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {item.hasChildren && (
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: colors.textTertiary }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                      {item.logisticNum}
                    </span>
                  </div>
                </td>



                {/* Sent Date */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {item.dateSent}
                </td>

                {/* ETA */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {item.dateEta || '—'}
                </td>

                {/* Receive Date */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm whitespace-nowrap">
                  {item.receiveDate || '—'}
                </td>

                {/* ETA Days / Actual Days */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm text-center whitespace-nowrap tabular-nums">
                  {item.etaDays ?? '—'}{item.actualDays != null ? ` / ${item.actualDays}` : ''}
                </td>

                {/* Pallets */}
                <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap">
                  {item.pallets || '—'}
                </td>

                {/* Price/kg */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono text-right whitespace-nowrap tabular-nums">
                  {fmtNum(item.priceKg, 4)}
                </td>

                {/* Weight */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono text-right whitespace-nowrap tabular-nums">
                  {fmtNum(item.totalWeight)}
                </td>

                {/* Freight RMB */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.text }} className="text-sm font-mono font-medium tabular-nums">
                    ¥{fmtNum(item.totalPriceRmb)}
                  </span>
                </td>

                {/* Paid RMB */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span
                    style={{ color: item.isPaid ? colors.green : colors.textTertiary }}
                    className="text-sm font-mono tabular-nums"
                  >
                    {item.logisticPaid > 0 ? `¥${fmtNum(item.logisticPaid)}` : '—'}
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
