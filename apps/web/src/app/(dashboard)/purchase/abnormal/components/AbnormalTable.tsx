'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { AbnormalListItem } from '@/lib/api';

interface AbnormalTableProps {
  items: AbnormalListItem[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (item: AbnormalListItem) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending:  { bg: 'rgba(255,169,64,0.12)',  text: '#f5a623', dot: '#f5a623' },
  resolved: { bg: 'rgba(48,209,88,0.12)',   text: '#30d158', dot: '#30d158' },
  deleted:  { bg: 'rgba(99,99,102,0.10)',   text: '#636366', dot: '#636366' },
};

export default function AbnormalTable({ items, isLoading, error, onRetry, onRowClick }: AbnormalTableProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          <p style={{ color: colors.textSecondary }} className="text-sm">{t('abnormal.table.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <p style={{ color: colors.red }} className="text-sm">{t('abnormal.table.loadFailed')}</p>
          <button onClick={onRetry} className="px-4 py-2 text-sm rounded-lg" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
            {t('abnormal.table.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p style={{ color: colors.textTertiary }} className="text-sm">{t('abnormal.noRecords')}</p>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          {['logisticNum', 'receiveDate', 'status', 'skuCount', 'totalDiff', 'note'].map((col) => (
            <th
              key={col}
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.textTertiary, backgroundColor: colors.bgSecondary }}
            >
              {t(`abnormal.${col}` as 'abnormal.logisticNum')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.pending;
          return (
            <tr
              key={`${item.logisticNum}-${item.receiveDate}`}
              onClick={() => onRowClick(item)}
              className="cursor-pointer transition-colors hover:opacity-80"
              style={{
                borderBottom: idx < items.length - 1 ? `1px solid ${colors.border}` : undefined,
                backgroundColor: item.status === 'deleted' ? `${colors.bgTertiary}80` : 'transparent',
              }}
            >
              <td className="px-4 py-3">
                <span style={{ color: colors.text }} className="text-sm font-mono font-medium">
                  {item.logisticNum}
                </span>
              </td>
              <td className="px-4 py-3">
                <span style={{ color: colors.textSecondary }} className="text-sm">
                  {item.receiveDate || '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                  {t(`abnormal.status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}` as 'abnormal.statusPending')}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
                  {item.skuCount}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-sm font-semibold ${item.totalDiff > 0 ? 'text-red-400' : item.totalDiff < 0 ? 'text-green-400' : ''}`} style={item.totalDiff === 0 ? { color: colors.textTertiary } : undefined}>
                  {item.totalDiff > 0 ? `+${item.totalDiff}` : item.totalDiff}
                </span>
              </td>
              <td className="px-4 py-3">
                <span style={{ color: colors.textTertiary }} className="text-xs truncate max-w-[200px] inline-block">
                  {item.note ? (item.note.length > 30 ? `${item.note.substring(0, 30)}...` : item.note) : '—'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
