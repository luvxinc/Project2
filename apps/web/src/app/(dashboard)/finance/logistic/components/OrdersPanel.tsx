'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';

interface Props {
  paymentNo: string;
  onClose: () => void;
}

/**
 * OrdersPanel — Related purchase orders for a logistics payment.
 * V1 parity: payment/history.py payment_orders_api
 *
 * Shows PO details with SKU breakdown, values in RMB/USD.
 */
export default function OrdersPanel({ paymentNo, onClose }: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['logisticPaymentOrders', paymentNo],
    queryFn: () => financeApi.getLogisticPaymentOrders(paymentNo),
  });

  const fmtNum = (val: number, decimals = 2) =>
    val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-full max-w-4xl max-h-[80vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: colors.border }}>
          <div>
            <h2 style={{ color: colors.text }} className="text-lg font-semibold">
              {t('logistic.orders.title')}
            </h2>
            <p style={{ color: colors.textTertiary }} className="text-xs mt-0.5 font-mono">
              {paymentNo}
              {ordersData && ordersData.logisticNums.length > 0 && (
                <span style={{ color: colors.textSecondary }}> — {ordersData.logisticNums.join(', ')}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity" style={{ backgroundColor: colors.bgTertiary }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: colors.blue }} />
            </div>
          ) : ordersData && ordersData.orders.length > 0 ? (
            <div className="space-y-4">
              {ordersData.orders.map((order) => (
                <div key={order.poNum}
                  style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border }}
                  className="rounded-lg border overflow-hidden"
                >
                  {/* PO Header */}
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.orders.poNum')}</span>
                        <p className="text-sm font-mono font-medium" style={{ color: colors.blue }}>{order.poNum}</p>
                      </div>
                      <div>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.orders.supplier')}</span>
                        <p className="text-sm font-mono" style={{ color: colors.text }}>{order.supplierCode}</p>
                      </div>
                      <div>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.orders.orderDate')}</span>
                        <p className="text-sm" style={{ color: colors.text }}>{order.orderDate}</p>
                      </div>
                      <div>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.orders.currency')}</span>
                        <p className="text-sm" style={{ color: colors.text }}>{order.currency}</p>
                      </div>
                      <div>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.orders.rate')}</span>
                        <p className="text-sm tabular-nums" style={{ color: colors.text }}>{order.exchangeRate.toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                        {t('logistic.orders.totalRmb')}: <span className="font-medium" style={{ color: colors.text }}>¥{fmtNum(order.totalRmb, 5)}</span>
                      </p>
                      <p className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                        {t('logistic.orders.totalUsd')}: <span className="font-medium" style={{ color: colors.text }}>${fmtNum(order.totalUsd, 5)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: `${colors.bgTertiary}80` }}>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('logistic.orders.sku')}</th>
                        <th className="px-3 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>{t('logistic.orders.qty')}</th>
                        <th className="px-3 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>{t('logistic.orders.unitPrice')}</th>
                        <th className="px-3 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>{t('logistic.orders.valueRmb')}</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>{t('logistic.orders.valueUsd')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, idx) => (
                        <tr key={idx} className="border-t" style={{ borderColor: colors.border }}>
                          <td className="px-4 py-1.5 font-mono" style={{ color: colors.text }}>{item.sku}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: colors.text }}>{item.qty}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                            {item.currency} {fmtNum(item.unitPrice, 5)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                            ¥{fmtNum(item.valueRmb, 5)}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                            ${fmtNum(item.valueUsd, 5)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p style={{ color: colors.textTertiary }} className="text-xs">{t('logistic.orders.noOrders')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
