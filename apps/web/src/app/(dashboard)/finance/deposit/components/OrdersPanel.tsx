'use client';

import { useQuery } from '@tanstack/react-query';
import { themeColors } from '@/contexts/ThemeContext';
import { financeApi } from '@/lib/api';
import type { DepositOrderDetail } from '@/lib/api';

interface OrdersPanelProps {
  pmtNo: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  theme: string;
}

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * OrdersPanel -- Related PO details for a deposit payment batch.
 * V1 parity: deposit/history.py deposit_payment_orders_api
 *
 * For each order: PO header (poNum, supplier, date, currency, rate, deposit%)
 * Deposit payment details: depositRmb/Usd, prepayUsed, actualPaid
 * Items table: sku, qty, unitPrice, valueRmb, valueUsd
 * Footer: totalRmb, totalUsd
 */
export default function OrdersPanel({ pmtNo, t, theme }: OrdersPanelProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['depositPaymentOrders', pmtNo],
    queryFn: () => financeApi.getDepositPaymentOrders(pmtNo),
  });

  const orders = ordersData?.orders ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }}
        />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
        {t('deposit.orders.noOrders')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.poNum} order={order} colors={colors} t={t} />
      ))}
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function OrderCard({ order, colors, t }: {
  order: DepositOrderDetail;
  colors: (typeof themeColors)['dark'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
      {/* PO Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.poNum')}</span>
            <p className="text-sm font-mono font-medium" style={{ color: colors.blue }}>{order.poNum}</p>
          </div>
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.supplier')}</span>
            <p className="text-sm font-mono" style={{ color: colors.text }}>{order.supplierCode}</p>
          </div>
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.orderDate')}</span>
            <p className="text-sm" style={{ color: colors.text }}>{order.poDate}</p>
          </div>
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.currency')}</span>
            <p className="text-sm" style={{ color: colors.text }}>{order.currency}</p>
          </div>
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.rate')}</span>
            <p className="text-sm tabular-nums" style={{ color: colors.text }}>{order.exchangeRate.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.orders.depositPercent')}</span>
            <p className="text-sm tabular-nums" style={{ color: colors.text }}>{order.depositPercent}%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
            {t('deposit.orders.totalRmb')}: <span className="font-medium" style={{ color: colors.text }}>¥{fmtNum(order.totalRmb, 5)}</span>
          </p>
          <p className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
            {t('deposit.orders.totalUsd')}: <span className="font-medium" style={{ color: colors.text }}>${fmtNum(order.totalUsd, 5)}</span>
          </p>
        </div>
      </div>

      {/* Deposit Payment Details */}
      <div
        className="px-4 py-2.5 flex items-center gap-6 text-xs"
        style={{ backgroundColor: colors.bgTertiary, borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }}>{t('deposit.orders.depositRmb')}:</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: colors.text }}>¥{fmtNum(order.depositRmb, 5)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }}>{t('deposit.orders.depositUsd')}:</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: colors.text }}>${fmtNum(order.depositUsd, 5)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }}>{t('deposit.orders.prepayUsed')}:</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: colors.orange }}>¥{fmtNum(order.prepayUsedRmb, 5)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }}>{t('deposit.orders.actualPaid')}:</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: colors.green }}>¥{fmtNum(order.actualPaidRmb, 5)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: colors.textTertiary }}>{t('deposit.orders.paymentDate')}:</span>
          <span style={{ color: colors.text }}>{order.paymentDate || '—'}</span>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: colors.bgSecondary }}>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('deposit.orders.sku')}
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('deposit.orders.qty')}
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('deposit.orders.unitPrice')}
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('deposit.orders.valueRmb')}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('deposit.orders.valueUsd')}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={idx} style={{ borderTop: `1px solid ${colors.border}` }}>
              <td className="px-4 py-2 font-mono" style={{ color: colors.text }}>{item.sku}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.text }}>{item.qty}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                {item.currency} {fmtNum(item.unitPrice, 5)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                ¥{fmtNum(item.valueRmb, 5)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                ${fmtNum(item.valueUsd, 5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
