'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { TransactionListResponse, TransactionItem } from '@/lib/api';

interface Props {
  data: TransactionListResponse | null;
  isLoading: boolean;
  supplierCurrency: string;
  datePreset: string;
  onDatePreset: (preset: string) => void;
  onDateRange: (from: string, to: string) => void;
  onAddNew: () => void;
  onDelete: (txn: TransactionItem) => void;
  onRestore: (txn: TransactionItem) => void;
  onViewHistory: (tranNum: string) => void;
}

/**
 * TransactionTable — Right panel showing transaction details.
 * V1 parity: prepay.html right column with transaction table
 *
 * Columns: Date | Tran# | Type | CurrReq | CurrUse | Rate | Amount | Converted | Balance | Actions
 */
export default function TransactionTable({
  data, isLoading, supplierCurrency, datePreset,
  onDatePreset, onDateRange, onAddNew, onDelete, onRestore, onViewHistory,
}: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const tranTypeLabels: Record<string, { label: string; color: string }> = {
    deposit: { label: t('prepay.tranType.deposit'), color: colors.green },
    usage: { label: t('prepay.tranType.usage'), color: colors.red },
    refund: { label: t('prepay.tranType.refund'), color: colors.blue },
    withdraw: { label: t('prepay.tranType.withdraw'), color: colors.orange },
    rate: { label: t('prepay.tranType.rate'), color: colors.textSecondary },
  };

  return (
    <div className="space-y-4">
      {/* Header with supplier info and filters */}
      <div
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="rounded-xl border p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 style={{ color: colors.text }} className="text-base font-semibold">
              {data?.supplierCode || '—'} — {data?.supplierName || ''}
            </h3>
            <p style={{ color: colors.textTertiary }} className="text-xs mt-0.5">
              {t('prepay.settlementCurrency')}: <span className="font-medium">{supplierCurrency}</span>
            </p>
          </div>
          <button
            onClick={onAddNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 active:scale-95"
            style={{ backgroundColor: colors.green, color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('prepay.addDeposit')}
          </button>
        </div>

        {/* Date filter pills (V1 parity: 全部 / 6个月 / 12个月 / 24个月) */}
        <div className="flex items-center gap-2">
          {[
            { key: '', label: t('prepay.filter.all') },
            { key: '6m', label: t('prepay.filter.6m') },
            { key: '1y', label: t('prepay.filter.1y') },
            { key: '2y', label: t('prepay.filter.2y') },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onDatePreset(key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: datePreset === key ? colors.blue : colors.bgTertiary,
                color: datePreset === key ? '#fff' : colors.textSecondary,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Beginning Balance */}
      {data && (
        <div className="flex items-center gap-2 px-1">
          <span style={{ color: colors.textTertiary }} className="text-xs">
            {t('prepay.beginningBalance')}:
          </span>
          <span
            style={{ color: data.beginningBalance >= 0 ? colors.green : colors.red }}
            className="text-sm font-bold tabular-nums"
          >
            {supplierCurrency} {data.beginningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Transaction Table */}
      <div
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="rounded-xl border overflow-hidden"
      >
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: colors.blue }} />
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="p-8 text-center">
            <p style={{ color: colors.textTertiary }} className="text-sm">
              {t('prepay.noTransactions')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  {[
                    t('prepay.table.date'),
                    t('prepay.table.tranNum'),
                    t('prepay.table.type'),
                    t('prepay.table.currReq'),
                    t('prepay.table.currUse'),
                    t('prepay.table.rate'),
                    t('prepay.table.amount'),
                    t('prepay.table.converted'),
                    t('prepay.table.balance'),
                    t('prepay.table.actions'),
                  ].map((header, i) => (
                    <th
                      key={i}
                      className="px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap"
                      style={{ color: colors.textTertiary }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((txn, idx) => {
                  const typeInfo = tranTypeLabels[txn.tranType] || { label: txn.tranType, color: colors.text };
                  return (
                    <tr
                      key={txn.tranNum + '-' + idx}
                      className={`border-t transition-colors ${txn.isDeleted ? 'opacity-40' : 'hover:bg-opacity-50'}`}
                      style={{
                        borderColor: colors.border,
                        backgroundColor: txn.isDeleted ? `${colors.red}08` : undefined,
                        textDecoration: txn.isDeleted ? 'line-through' : undefined,
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: colors.text }}>
                        {txn.tranDate}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          onClick={() => onViewHistory(txn.tranNum)}
                          className="text-xs font-mono hover:underline"
                          style={{ color: colors.blue }}
                        >
                          {txn.tranNum}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: `${typeInfo.color}15`, color: typeInfo.color }}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: colors.textSecondary }}>
                        {txn.tranCurrReq}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: colors.textSecondary }}>
                        {txn.tranCurrUse}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                        {txn.exchangeRate.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums font-medium" style={{ color: colors.text }}>
                        {txn.tranCurrUse} {txn.tranAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums" style={{ color: typeInfo.color }}>
                        {txn.tranType === 'usage' || txn.tranType === 'withdraw' ? '-' : '+'}
                        {txn.convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap text-xs tabular-nums font-bold"
                        style={{ color: txn.runningBalance >= 0 ? colors.green : colors.red }}
                      >
                        {txn.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* Only deposit-type (in) records can be deleted/restored */}
                          {txn.tranType === 'deposit' && !txn.isDeleted && (
                            <button
                              onClick={() => onDelete(txn)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                              title={t('prepay.actions.delete')}
                            >
                              <svg className="w-3.5 h-3.5" style={{ color: colors.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          {txn.tranType === 'deposit' && txn.isDeleted && (
                            <button
                              onClick={() => onRestore(txn)}
                              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors"
                              title={t('prepay.actions.restore')}
                            >
                              <svg className="w-3.5 h-3.5" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                              </svg>
                            </button>
                          )}
                          {txn.hasFile && (
                            <svg className="w-3.5 h-3.5" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction count */}
      {data && data.transactions.length > 0 && (
        <p style={{ color: colors.textTertiary }} className="text-xs px-1">
          {t('prepay.transactionCount', { count: data.transactions.length })}
        </p>
      )}
    </div>
  );
}
