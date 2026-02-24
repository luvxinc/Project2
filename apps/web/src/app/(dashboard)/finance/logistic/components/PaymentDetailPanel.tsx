'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';
import type { LogisticListItem, LogisticSendVersion, LogisticPaymentVersion, FieldChange } from '@/lib/api';
import type { PaymentGroup } from './PaidPaymentCard';

interface Props {
  group: PaymentGroup;
  onBack: () => void;
  onClickShipment: (item: LogisticListItem) => void;
  onDeletePayment: (pmtNo: string) => void;
  onRestorePayment: (pmtNo: string) => void;
}

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Currency code → symbol */
const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';

/**
 * PaymentDetailPanel — Detail view for a payment batch (grouped by pmtNo).
 * Shows payment summary, shipment list, history + orders tabs.
 * Delete/Restore operates on the entire batch.
 */
export default function PaymentDetailPanel({
  group, onBack, onClickShipment, onDeletePayment, onRestorePayment,
}: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [activeTab, setActiveTab] = useState<'history' | 'orders'>('history');

  // Fetch history and orders
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['logisticPaymentHistory', group.pmtNo],
    queryFn: () => financeApi.getLogisticPaymentHistory(group.pmtNo),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['logisticPaymentOrders', group.pmtNo],
    queryFn: () => financeApi.getLogisticPaymentOrders(group.pmtNo),
  });

  const sendVersions = historyData?.sendVersions ?? [];
  const paymentVersions = historyData?.paymentVersions ?? [];
  const orders = ordersData?.orders ?? [];

  const hasExtra = group.extraPaid > 0;

  // Separate parents and children
  const parents = group.items.filter(i => !i.isChild);
  const childMap = new Map<string, LogisticListItem[]>();
  for (const item of group.items) {
    if (item.isChild) {
      const match = item.logisticNum.match(/^(.+)_delay_V\d+$/);
      const parentNum = match ? match[1] : item.logisticNum;
      if (!childMap.has(parentNum)) childMap.set(parentNum, []);
      childMap.get(parentNum)!.push(item);
    }
  }

  return (
    <div className="relative">
      {/* ── Back + Actions bar ── */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('logistic.detail.back')}
        </button>

        <div className="flex items-center gap-2">
          {group.isDeleted ? (
            <button
              onClick={() => onRestorePayment(group.pmtNo)}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: 'rgba(48,209,88,0.12)', color: colors.green }}
            >
              {t('logistic.actions.restore')}
            </button>
          ) : (
            <button
              onClick={() => onDeletePayment(group.pmtNo)}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: colors.red }}
            >
              {t('logistic.actions.delete')}
            </button>
          )}
        </div>
      </div>

      {/* ── Summary card ── */}
      <div
        className="rounded-xl mb-5"
        style={{
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${group.isDeleted ? 'rgba(142,142,147,0.3)' : colors.border}`,
          opacity: group.isDeleted ? 0.7 : 1,
        }}
      >
        {/* Top: pmtNo + status */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: group.isDeleted ? '#8e8e93' : '#30d158' }}>
              {group.pmtNo}
            </p>
            {group.isDeleted && (
              <span
                className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(142,142,147,0.14)', color: colors.gray, boxShadow: '0 0 0 1px rgba(142,142,147,0.25)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.gray }} />
                {t('logistic.status.deleted')}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.card.total')}</p>
            <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
              ¥{fmtNum(group.totalWithExtraRmb)}
              <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                ≈ ${fmtNum(group.totalWithExtraUsd)}
              </span>
            </p>
          </div>
        </div>

        {/* Amount details */}
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <FieldBlock label={t('logistic.table.paymentDate')} value={group.paymentDate || '—'} colors={colors} />
          <FieldBlock label={t('logistic.card.freight')} value={`¥${fmtNum(group.totalPaidRmb)}`} colors={colors} mono />
          <FieldBlock
            label={t('logistic.card.extraFee')}
            value={hasExtra ? `${curSym(group.extraCurrency)}${fmtNum(group.extraPaid)}` : '—'}
            colors={colors}
            mono
          />
          <FieldBlock
            label={t('logistic.card.settlementRate')}
            value={fmtNum(group.settlementRate, 4)}
            suffix={group.rateMode === 'A' || group.rateMode === 'auto'
              ? t('logistic.card.rateAuto')
              : t('logistic.card.rateManual')}
            colors={colors}
            mono
          />
        </div>

        {/* Shipment list */}
        <div className="px-5 pb-5">
          <div style={{ borderTop: `1px solid ${colors.border}` }} className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                {t('logistic.table.logisticNum')}
              </p>
              <p className="text-xs" style={{ color: colors.textTertiary }}>
                {t('logistic.card.shipmentCount', { count: group.items.length })}
              </p>
            </div>
            <div className="space-y-1">
              {parents.map((parent) => {
                const children = childMap.get(parent.logisticNum) || [];
                return (
                  <div key={parent.logisticNum}>
                    <button
                      onClick={() => onClickShipment(parent)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all hover:opacity-70"
                      style={{ backgroundColor: colors.bgTertiary }}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-3 h-3 shrink-0" style={{ color: colors.textTertiary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span className="font-mono text-xs font-semibold" style={{ color: colors.blue }}>
                          {parent.logisticNum}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs tabular-nums">
                        <span style={{ color: colors.textSecondary }}>¥{fmtNum(parent.totalPriceRmb)}</span>
                        <span style={{ color: colors.textTertiary }}>{parent.dateSent}</span>
                        <svg className="w-3 h-3" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                    {children.map((child) => (
                      <button
                        key={child.logisticNum}
                        onClick={() => onClickShipment(child)}
                        className="w-full flex items-center justify-between pl-8 pr-3 py-1.5 text-left transition-all hover:opacity-70"
                        style={{ borderLeft: `2px dashed ${colors.border}`, marginLeft: '12px' }}
                      >
                        <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>
                          {child.logisticNum}
                        </span>
                        <span className="text-[11px] tabular-nums" style={{ color: colors.textTertiary }}>
                          ¥{fmtNum(child.totalPriceRmb)}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      {(() => {
        const tabs = [
          { id: 'history' as const, label: t('logistic.detail.tab_history'), count: sendVersions.length + paymentVersions.length },
          { id: 'orders' as const, label: t('logistic.detail.tab_orders'), count: orders.length },
        ];
        return (
          <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                  borderBottom: activeTab === tab.id ? `2px solid ${colors.blue}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: activeTab === tab.id ? `${colors.blue}20` : colors.bgTertiary,
                      color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* History Tab */}
      {activeTab === 'history' && (
        <HistoryContent
          sendVersions={sendVersions}
          paymentVersions={paymentVersions}
          isLoading={historyLoading}
          colors={colors}
        />
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <OrdersContent
          orders={orders}
          isLoading={ordersLoading}
          colors={colors}
          onClickOrder={onClickShipment}
          shipmentItems={group.items}
        />
      )}
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function FieldBlock({ label, value, suffix, colors, mono }: {
  label: string; value: string; suffix?: string;
  colors: Record<string, string>; mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: colors.text }}>
        {value}
        {suffix && (
          <span
            className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: suffix === 'Auto' || suffix === '自动'
                ? 'rgba(10,132,255,0.14)' : 'rgba(142,142,147,0.14)',
              color: suffix === 'Auto' || suffix === '自动'
                ? '#0a84ff' : '#8e8e93',
            }}
          >
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function HistoryContent({ sendVersions, paymentVersions, isLoading, colors }: {
  sendVersions: LogisticSendVersion[];
  paymentVersions: LogisticPaymentVersion[];
  isLoading: boolean;
  colors: Record<string, string>;
}) {
  const t = useTranslations('finance');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
      </div>
    );
  }

  if (sendVersions.length === 0 && paymentVersions.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
        {t('logistic.history.noData')}
      </p>
    );
  }

  const fmtN = (val: number, d = 2) => val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Send Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0V9l3 3-3 4" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('logistic.history.sendColumn')}</span>
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}>{sendVersions.length}</span>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {sendVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('logistic.history.noSendVersions')}</p>
          ) : sendVersions.map((v, idx) => (
            <VersionCard key={idx} type="send" version={v} idx={idx} colors={colors} fmtNum={fmtN} />
          ))}
        </div>
      </div>

      {/* Payment Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('logistic.history.paymentColumn')}</span>
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>{paymentVersions.length}</span>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {paymentVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('logistic.history.noPaymentVersions')}</p>
          ) : paymentVersions.map((v, idx) => (
            <VersionCard key={idx} type="payment" version={v} idx={idx} colors={colors} fmtNum={fmtN} />
          ))}
        </div>
      </div>
    </div>
  );
}

function VersionCard({ type, version: v, idx, colors, fmtNum }: {
  type: 'send' | 'payment';
  version: LogisticSendVersion | LogisticPaymentVersion;
  idx: number;
  colors: Record<string, string>;
  fmtNum: (val: number, d?: number) => string;
}) {
  const t = useTranslations('finance');
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleString() : '';
  const accentColor = v.isInitial ? colors.green : colors.blue;
  const prefix = type === 'send' ? 'S' : 'P';

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
            {prefix}{String(idx + 1).padStart(2, '0')}
          </span>
          <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>{v.logisticNum}</span>
          {v.isInitial && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.green}12`, color: colors.green }}>
              {t('logistic.detail.initial')}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: colors.textTertiary }}>{v.byUser}</p>
          <p className="text-xs" style={{ color: colors.textTertiary }}>{dateStr}</p>
        </div>
      </div>

      {v.isInitial && type === 'send' && (
        <div className="space-y-1.5 mb-2">
          {[
            { label: t('logistic.table.totalPriceRmb'), value: `¥${fmtNum((v as LogisticSendVersion).data.totalPrice)}` },
            { label: t('logistic.table.totalWeight'), value: `${fmtNum((v as LogisticSendVersion).data.totalWeight)} kg` },
            { label: t('logistic.table.priceKg'), value: fmtNum((v as LogisticSendVersion).data.priceKg, 4) },
            { label: t('logistic.table.pallets'), value: String((v as LogisticSendVersion).data.pallets) },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
              <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {v.isInitial && type === 'payment' && (
        <div className="space-y-1.5 mb-2">
          {[
            { label: t('logistic.table.logisticPaid'), value: `¥${fmtNum((v as LogisticPaymentVersion).logisticPaid)}` },
            { label: t('logistic.table.usdRmb'), value: fmtNum((v as LogisticPaymentVersion).usdRmb, 4) },
            { label: t('logistic.table.paymentDate'), value: (v as LogisticPaymentVersion).paymentDate },
            ...((v as LogisticPaymentVersion).extraPaid > 0
              ? [{ label: t('logistic.table.extraPaid'), value: `${curSym((v as LogisticPaymentVersion).extraCurrency)}${fmtNum((v as LogisticPaymentVersion).extraPaid)}` }]
              : []),
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
              <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {v.changes.length > 0 && (
        <div className="space-y-1.5">
          {v.changes.map((ch: FieldChange, ci: number) => (
            <div key={ci} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{ch.field}</span>
              <span className="font-mono line-through" style={{ color: colors.red }}>{ch.old}</span>
              <span style={{ color: colors.textTertiary }}>&rarr;</span>
              <span className="font-mono font-semibold" style={{ color: colors.green }}>{ch.new}</span>
            </div>
          ))}
        </div>
      )}

      {v.note && <p className="text-xs mt-2 italic" style={{ color: colors.textTertiary }}>{v.note}</p>}
    </div>
  );
}

function OrdersContent({ orders, isLoading, colors }: {
  orders: { poNum: string; supplierCode: string; orderDate: string; currency: string; exchangeRate: number; items: { sku: string; qty: number; unitPrice: number; currency: string; valueRmb: number; valueUsd: number }[]; totalRmb: number; totalUsd: number }[];
  isLoading: boolean;
  colors: Record<string, string>;
  onClickOrder: (item: LogisticListItem) => void;
  shipmentItems: LogisticListItem[];
}) {
  const t = useTranslations('finance');
  const fmtN = (val: number, d = 2) => val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
      </div>
    );
  }

  if (orders.length === 0) {
    return <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>{t('logistic.orders.noOrders')}</p>;
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order.poNum} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
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
                {t('logistic.orders.totalRmb')}: <span className="font-medium" style={{ color: colors.text }}>¥{fmtN(order.totalRmb, 5)}</span>
              </p>
              <p className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                {t('logistic.orders.totalUsd')}: <span className="font-medium" style={{ color: colors.text }}>${fmtN(order.totalUsd, 5)}</span>
              </p>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: colors.bgSecondary }}>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('logistic.orders.sku')}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('logistic.orders.qty')}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('logistic.orders.unitPrice')}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('logistic.orders.valueRmb')}</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('logistic.orders.valueUsd')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={idx} style={{ borderTop: `1px solid ${colors.border}` }}>
                  <td className="px-4 py-2 font-mono" style={{ color: colors.text }}>{item.sku}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.text }}>{item.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>{item.currency} {fmtN(item.unitPrice, 5)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>¥{fmtN(item.valueRmb, 5)}</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>${fmtN(item.valueUsd, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
