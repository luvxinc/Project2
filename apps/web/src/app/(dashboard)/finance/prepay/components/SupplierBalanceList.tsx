'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { SupplierBalance } from '@/lib/api';

interface Props {
  balances: SupplierBalance[];
  isLoading: boolean;
  selectedCode: string | null;
  onSelect: (supplier: SupplierBalance) => void;
  onAddNew: () => void;
}

/**
 * SupplierBalanceList — Left panel showing supplier prepayment balances.
 * V1 parity: prepay.html left column with supplier cards
 */
export default function SupplierBalanceList({ balances, isLoading, selectedCode, onSelect, onAddNew }: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Filter to only suppliers with balance or transactions
  const activeBalances = balances.filter(b => b.balance !== 0);
  const zeroBalances = balances.filter(b => b.balance === 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.text }} className="text-sm font-semibold">
          {t('prepay.supplierList')}
        </h2>
        <button
          onClick={onAddNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
          style={{ backgroundColor: colors.blue, color: '#fff' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('prepay.addNew')}
        </button>
      </div>

      {/* Count */}
      <p style={{ color: colors.textTertiary }} className="text-xs">
        {t('prepay.supplierCount', { active: activeBalances.length, total: balances.length })}
      </p>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i}
              style={{ backgroundColor: colors.bgSecondary }}
              className="h-16 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Active balance cards */}
      {!isLoading && activeBalances.map(supplier => (
        <button
          key={supplier.supplierCode}
          onClick={() => onSelect(supplier)}
          className={`w-full text-left p-3 rounded-xl border transition-all hover:scale-[1.01]`}
          style={{
            backgroundColor: selectedCode === supplier.supplierCode ? `${colors.blue}10` : colors.bgSecondary,
            borderColor: selectedCode === supplier.supplierCode ? colors.blue : colors.border,
            outline: selectedCode === supplier.supplierCode ? `2px solid ${colors.blue}` : 'none',
            outlineOffset: '-1px',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: colors.text }} className="text-sm font-semibold">
                {supplier.supplierCode}
              </p>
              <p style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                {supplier.supplierName}
              </p>
            </div>
            <div className="text-right">
              <p
                className="text-sm font-bold tabular-nums"
                style={{ color: supplier.balance >= 0 ? colors.green : colors.red }}
              >
                {supplier.currency} {supplier.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p style={{ color: colors.textTertiary }} className="text-[10px]">
                {t('prepay.balance')}
              </p>
            </div>
          </div>
        </button>
      ))}

      {/* Zero balance suppliers (collapsed) */}
      {!isLoading && zeroBalances.length > 0 && (
        <details className="group">
          <summary
            style={{ color: colors.textTertiary }}
            className="text-xs cursor-pointer hover:underline list-none flex items-center gap-1"
          >
            <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {t('prepay.zeroBalanceSuppliers', { count: zeroBalances.length })}
          </summary>
          <div className="mt-2 space-y-1.5">
            {zeroBalances.map(supplier => (
              <button
                key={supplier.supplierCode}
                onClick={() => onSelect(supplier)}
                className="w-full text-left p-2.5 rounded-lg border transition-all hover:scale-[1.01]"
                style={{
                  backgroundColor: selectedCode === supplier.supplierCode ? `${colors.blue}10` : colors.bgSecondary,
                  borderColor: selectedCode === supplier.supplierCode ? colors.blue : colors.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <p style={{ color: colors.textSecondary }} className="text-xs font-medium">
                    {supplier.supplierCode} — {supplier.supplierName}
                  </p>
                  <p style={{ color: colors.textTertiary }} className="text-xs tabular-nums">
                    {supplier.currency} 0.00
                  </p>
                </div>
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!isLoading && balances.length === 0 && (
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="p-6 rounded-xl border text-center"
        >
          <p style={{ color: colors.textTertiary }} className="text-sm">
            {t('prepay.noSuppliers')}
          </p>
        </div>
      )}
    </div>
  );
}
