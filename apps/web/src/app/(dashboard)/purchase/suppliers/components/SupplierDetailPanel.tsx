'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { SupplierWithStrategy, SupplierStrategy } from '@/lib/api';

interface SupplierDetailPanelProps {
  supplier: SupplierWithStrategy;
  strategies: SupplierStrategy[];
  isLoading: boolean;
  onEditStrategy: (supplier: SupplierWithStrategy) => void;
}

export default function SupplierDetailPanel({
  supplier,
  strategies,
  isLoading,
  onEditStrategy,
}: SupplierDetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  return (
    <div>
      {/* Header — no back button, click outside panel to slide back */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: `1px solid ${colors.border}` }}
      >
        <h3 className="text-lg font-semibold" style={{ color: colors.text }}>
          <span style={{ color: colors.blue }} className="mr-2 font-mono">
            {supplier.supplierCode}
          </span>
          <span className="text-base font-normal" style={{ color: colors.textSecondary }}>
            {supplier.supplierName}
          </span>
          <span
            className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: supplier.status ? `${colors.green}20` : `${colors.textTertiary}20`,
              color: supplier.status ? colors.green : colors.textTertiary,
            }}
          >
            {supplier.status ? t('status.active') : t('status.inactive')}
          </span>
        </h3>
      </div>

      {/* Strategy History */}
      <div className="px-5 pt-5 pb-2">
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: colors.textSecondary }}
        >
          {t('detail.historyTitle')}
        </h4>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: colors.border, borderTopColor: colors.blue }}
          />
        </div>
      ) : strategies.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm" style={{ color: colors.textTertiary }}>
            {t('detail.noHistory')}
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
                  {t('table.effectiveDate')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  {t('table.category')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  {t('table.type')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  {t('table.currency')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  {t('table.floatCurrency')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  {t('table.requireDeposit')}
                </th>
                <th
                  style={{ color: colors.textSecondary }}
                  className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                >
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((strategy, index) => {
                const isNewest = index === 0;

                return (
                  <tr
                    key={strategy.id}
                    onClick={isNewest ? () => onEditStrategy(supplier) : undefined}
                    className={`${isNewest ? 'hover:opacity-80 cursor-pointer' : ''} ${index !== strategies.length - 1 ? 'border-b' : ''}`}
                    style={{
                      borderColor: colors.border,
                      backgroundColor: isNewest ? `${colors.blue}0d` : 'transparent',
                      color: isNewest ? colors.text : colors.textSecondary,
                    }}
                  >
                    <td className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                      {strategy.effectiveDate}
                    </td>
                    <td className="py-3 px-4 text-sm whitespace-nowrap">
                      {t(`category.${strategy.category}` as any)}
                    </td>
                    <td className="py-3 px-4 text-sm whitespace-nowrap">
                      {strategy.type ? t(`type.${strategy.type}` as any) : '-'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-sm font-mono" style={{ color: isNewest ? colors.blue : colors.textSecondary }}>
                        {strategy.currency}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {strategy.floatCurrency ? (
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
                      {strategy.requireDeposit ? (
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
                    <td className="py-3 px-4 text-sm whitespace-nowrap max-w-[200px] truncate">
                      {strategy.note || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
