'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { SupplierWithStrategy } from '@/lib/api';

interface SupplierTableProps {
  suppliers: SupplierWithStrategy[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (supplier: SupplierWithStrategy) => void;
}

export default function SupplierTable({ suppliers, isLoading, error, onRetry, onRowClick }: SupplierTableProps) {
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
          {t('table.loadFailed')}
        </p>
        <button
          onClick={onRetry}
          style={{ backgroundColor: colors.blue, color: '#ffffff' }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
        >
          {t('table.retry')}
        </button>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('table.noSuppliers')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.code')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.name')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.category')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.type')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.currency')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.floatCurrency')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.requireDeposit')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.status')}
            </th>
            <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
              {t('table.effectiveDate')}
            </th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier, index) => {
            const strategy = supplier.latestStrategy;
            return (
              <tr
                key={supplier.id}
                onClick={() => onRowClick(supplier)}
                style={{ borderColor: colors.border }}
                className={`${index !== suppliers.length - 1 ? 'border-b' : ''} cursor-pointer transition-colors hover:opacity-80`}
              >
                <td style={{ color: colors.blue }} className="py-3 px-4 font-mono text-sm font-semibold whitespace-nowrap">
                  {supplier.supplierCode}
                </td>
                <td style={{ color: colors.text }} className="py-3 px-4 text-sm whitespace-nowrap">
                  {supplier.supplierName}
                </td>
                <td className="py-3 px-4">
                  <span style={{ color: colors.textSecondary }} className="text-sm">
                    {strategy ? t(`category.${strategy.category}` as any) : '-'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span style={{ color: colors.textSecondary }} className="text-sm">
                    {strategy?.type ? t(`type.${strategy.type}` as any) : '-'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span style={{ color: colors.blue }} className="text-sm font-mono">
                    {strategy?.currency ?? '-'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {strategy?.floatCurrency ? (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                    >
                      {strategy.floatThreshold}%
                    </span>
                  ) : (
                    <span style={{ color: colors.textTertiary }} className="text-sm">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {strategy?.requireDeposit ? (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}
                    >
                      {strategy.depositRatio}%
                    </span>
                  ) : (
                    <span style={{ color: colors.textTertiary }} className="text-sm">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                    style={{
                      backgroundColor: supplier.status ? `${colors.green}20` : `${colors.textTertiary}20`,
                      color: supplier.status ? colors.green : colors.textTertiary,
                    }}
                  >
                    {supplier.status ? t('status.active') : t('status.inactive')}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span style={{ color: colors.textSecondary }} className="text-sm font-mono">
                    {strategy?.effectiveDate ?? '-'}
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
