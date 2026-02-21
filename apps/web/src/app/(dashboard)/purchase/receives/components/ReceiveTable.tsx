'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { ReceiveManagementItem } from '@/lib/api';

interface ReceiveTableProps {
  items: ReceiveManagementItem[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (item: ReceiveManagementItem) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  IN_TRANSIT:      { bg: 'rgba(255,169,64,0.12)', text: '#f5a623', dot: '#f5a623' },
  ALL_RECEIVED:    { bg: 'rgba(48,209,88,0.12)',  text: '#30d158', dot: '#30d158' },
  DIFF_UNRESOLVED: { bg: 'rgba(255,69,58,0.12)',  text: '#ff453a', dot: '#ff453a' },
  DIFF_RESOLVED:   { bg: 'rgba(99,99,102,0.12)',  text: '#8e8e93', dot: '#8e8e93' },
  DELETED:         { bg: 'rgba(99,99,102,0.10)',  text: '#636366', dot: '#636366' },
};

export default function ReceiveTable({ items, isLoading, error, onRetry, onRowClick }: ReceiveTableProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          <p style={{ color: colors.textSecondary }} className="text-sm">{t('receives.table.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <p style={{ color: colors.red }} className="text-sm">{t('receives.table.loadFailed')}</p>
          <button onClick={onRetry} className="px-4 py-2 text-sm rounded-lg" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
            {t('receives.table.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p style={{ color: colors.textTertiary }} className="text-sm">{t('receives.table.noItems')}</p>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          {['logisticNum', 'sentDate', 'receiveDate', 'status', 'detailSeq', 'updateDate'].map((col) => (
            <th
              key={col}
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.textTertiary, backgroundColor: colors.bgSecondary }}
            >
              {t(`receives.table.${col}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.IN_TRANSIT;
          return (
            <tr
              key={item.logisticNum}
              onClick={() => onRowClick(item)}
              className="cursor-pointer transition-colors hover:opacity-80"
              style={{
                borderBottom: idx < items.length - 1 ? `1px solid ${colors.border}` : undefined,
                backgroundColor: item.isDeleted ? `${colors.bgTertiary}80` : 'transparent',
              }}
            >
              <td className="px-4 py-3">
                <span style={{ color: item.isDeleted ? colors.textTertiary : colors.text }} className="text-sm font-mono font-medium">
                  {item.logisticNum}
                </span>
              </td>
              {/* 发货日期 */}
              <td className="px-4 py-3">
                <span style={{ color: colors.textSecondary }} className="text-sm">
                  {item.sentDate === '-' ? '—' : item.sentDate}
                </span>
              </td>
              {/* 入库日期 */}
              <td className="px-4 py-3">
                <span style={{ color: colors.textSecondary }} className="text-sm">
                  {item.receiveDate === '-' ? '—' : item.receiveDate}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                  {t(`receives.status.${item.status.toLowerCase()}`)}
                </span>
              </td>
              {/* V1 parity P1-1: detail_seq column */}
              <td className="px-4 py-3">
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
                  {item.detailSeq}
                </span>
              </td>
              {/* V1 parity P1-1: update_date column */}
              <td className="px-4 py-3">
                <span className="text-xs" style={{ color: colors.textTertiary }}>
                  {item.updateDate ? item.updateDate.substring(0, 10) : '—'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

