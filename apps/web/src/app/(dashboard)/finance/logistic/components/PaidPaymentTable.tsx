'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { paymentStatusStyle } from '@/lib/status-colors';
import type { PaymentGroup } from './PaidPaymentCard';

interface Props {
  groups: PaymentGroup[];
  isLoading: boolean;
  onRowClick: (group: PaymentGroup) => void;
}

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Currency code → symbol */
const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';

/**
 * PaidPaymentTable — Apple-style table listing payment groups.
 * Each row represents one pmtNo batch. Click → PaymentDetailPanel.
 */
export default function PaidPaymentTable({ groups, isLoading, onRowClick }: Props) {
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

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('logistic.noData')}</p>
      </div>
    );
  }

  const renderHeader = (label: string, align: string = 'text-left') => (
    <th
      style={{ color: colors.textSecondary }}
      className={`${align} py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap`}
    >
      {label}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
            {renderHeader(t('logistic.table.pmtNo'))}
            {renderHeader(t('logistic.table.paymentDate'))}
            {renderHeader(t('logistic.card.shipmentCount', { count: '' }).trim(), 'text-center')}
            {renderHeader(t('logistic.table.totalPriceRmb'), 'text-right')}
            {renderHeader(t('logistic.table.totalPriceUsd'), 'text-right')}
            {renderHeader(t('logistic.table.extraPaid'), 'text-right')}
            {renderHeader(t('logistic.table.usdRmb'), 'text-right')}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const statusKey = group.isDeleted ? 'deleted' : 'paid';
            const style = paymentStatusStyle(statusKey, colors);
            const badge = {
              label: t(`logistic.status.${statusKey}`),
              ...style,
            };

            return (
              <tr
                key={group.pmtNo}
                onClick={() => onRowClick(group)}
                style={{
                  borderColor: colors.border,
                  opacity: group.isDeleted ? 0.55 : 1,
                }}
                className={`${index !== groups.length - 1 ? 'border-b' : ''} cursor-pointer transition-colors hover:opacity-80`}
              >
                {/* Payment # */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span style={{ color: colors.green }} className="font-mono text-sm font-semibold">
                    {group.pmtNo}
                  </span>
                </td>

                {/* Payment Date */}
                <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                  {group.paymentDate || '—'}
                </td>

                {/* Shipment Count */}
                <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap">
                  {group.items.length}
                </td>

                {/* Total RMB */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.text }} className="text-sm font-mono font-medium tabular-nums">
                    ¥{fmtNum(group.totalPaidRmb)}
                  </span>
                </td>

                {/* Total USD */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.textTertiary }} className="text-sm font-mono tabular-nums">
                    ${fmtNum(group.totalFreightUsd)}
                  </span>
                </td>

                {/* Extra */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.textSecondary }} className="text-sm font-mono tabular-nums">
                    {group.extraPaid > 0 ? `${curSym(group.extraCurrency)}${fmtNum(group.extraPaid)}` : '—'}
                  </span>
                </td>

                {/* Rate */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <span style={{ color: colors.textSecondary }} className="text-sm font-mono tabular-nums">
                    {fmtNum(group.settlementRate, 4)}
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
