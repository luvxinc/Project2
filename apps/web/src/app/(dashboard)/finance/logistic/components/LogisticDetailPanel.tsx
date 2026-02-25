'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '@/lib/api';
import { paymentStatusStyle, hexToRgba } from '@/lib/status-colors';
import type { LogisticListItem, LogisticSendVersion, LogisticPaymentVersion, FieldChange } from '@/lib/api';

interface LogisticDetailPanelProps {
  item: LogisticListItem;
  onBack: () => void;
  onDeletePayment: (pmtNo: string) => void;
  onRestorePayment: (pmtNo: string) => void;
  readOnly?: boolean;
}



export default function LogisticDetailPanel({
  item, onBack, onDeletePayment, onRestorePayment, readOnly = false,
}: LogisticDetailPanelProps) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [activeTab, setActiveTab] = useState<'history' | 'orders'>('history');

  const statusStyle = paymentStatusStyle(item.paymentStatus, colors);

  // Fetch history and orders:
  // - With pmtNo: payment-level query (readOnly filters to single logistic)
  // - Without pmtNo: shipment-level query by logisticNum (for unpaid items)
  const filterLogisticNum = readOnly ? item.logisticNum : undefined;
  const hasPmtNo = !!item.pmtNo;

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: hasPmtNo
      ? ['logisticPaymentHistory', item.pmtNo, filterLogisticNum]
      : ['logisticShipmentHistory', item.logisticNum],
    queryFn: () => hasPmtNo
      ? financeApi.getLogisticPaymentHistory(item.pmtNo!, filterLogisticNum)
      : financeApi.getLogisticShipmentHistory(item.logisticNum),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: hasPmtNo
      ? ['logisticPaymentOrders', item.pmtNo, filterLogisticNum]
      : ['logisticShipmentOrders', item.logisticNum],
    queryFn: () => hasPmtNo
      ? financeApi.getLogisticPaymentOrders(item.pmtNo!, filterLogisticNum)
      : financeApi.getLogisticShipmentOrders(item.logisticNum),
  });

  const fmtNum = (val: number, decimals = 2) =>
    val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  /** Currency code → symbol */
  const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';

  const sendVersions = historyData?.sendVersions ?? [];
  const paymentVersions = historyData?.paymentVersions ?? [];
  const orders = ordersData?.orders ?? [];

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

        {!readOnly && (
          <div className="flex items-center gap-2">
            {item.isDeleted && item.pmtNo && (
              <button
                onClick={() => onRestorePayment(item.pmtNo!)}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
              >
                {t('logistic.actions.restore')}
              </button>
            )}
            {item.isPaid && !item.isDeleted && item.pmtNo && (
              <button
                onClick={() => onDeletePayment(item.pmtNo!)}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: `${colors.red}15`, color: colors.red }}
              >
                {t('logistic.actions.delete')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Summary card ── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: logisticNum + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {item.logisticNum}
            </p>
            <span
              className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
                boxShadow: `0 0 0 1px ${statusStyle.ring}`,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.paymentStatus === 'unpaid' ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: statusStyle.dot }}
              />
              {t(`logistic.status.${item.paymentStatus}`)}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('logistic.table.totalPriceRmb')}</p>
            <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
              ¥{fmtNum(item.totalPriceRmb)}
              <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                ≈ ${fmtNum(item.totalPriceUsd, 5)}
              </span>
            </p>
          </div>
        </div>

        {/* Field grid */}
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <DetailField label={t('logistic.table.dateSent')} value={item.dateSent} colors={colors} />
          <DetailField label={t('logistic.table.dateEta')} value={item.dateEta || '—'} colors={colors} />
          <DetailField label={t('logistic.table.receiveDate')} value={item.receiveDate || '—'} colors={colors} />
          <DetailField
            label={t('logistic.detail.etaActualDays')}
            value={item.etaDays != null ? `${item.etaDays} / ${item.actualDays ?? '—'}` : '—'}
            colors={colors}
          />
          <DetailField label={t('logistic.table.pallets')} value={String(item.pallets)} colors={colors} />
          <DetailField label={t('logistic.table.priceKg')} value={fmtNum(item.priceKg, 4)} colors={colors} mono />
          <DetailField label={t('logistic.table.totalWeight')} value={`${fmtNum(item.totalWeight)} kg`} colors={colors} mono />
          <DetailField
            label={t('logistic.table.usdRmb')}
            value={`${fmtNum(item.usdRmb, 4)}`}
            suffix={`(${item.rateMode === 'A' ? t('logistic.payment.rateAuto') : t('logistic.payment.rateManual')})`}
            colors={colors}
            mono
          />
          <DetailField
            label={t('logistic.table.logisticPaid')}
            value={item.logisticPaid > 0 ? `¥${fmtNum(item.logisticPaid)}` : '—'}
            colors={colors}
            mono
          />
          <DetailField label={t('logistic.table.paymentDate')} value={item.paymentDate || '—'} colors={colors} />
          <DetailField label={t('logistic.table.pmtNo')} value={item.pmtNo || '—'} colors={colors} mono />
          <DetailField
            label={t('logistic.table.extraPaid')}
            value={item.extraPaid > 0 ? `${curSym(item.extraCurrency)}${fmtNum(item.extraPaid)}` : '—'}
            colors={colors}
            mono
          />
        </div>

        {/* Children (delay sub-shipments) */}
        {item.hasChildren && item.children.length > 0 && (
          <div className="px-5 pb-5">
            <div style={{ borderTop: `1px solid ${colors.border}` }} className="pt-3">
              <p className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>
                {t('logistic.detail.delayShipments')}
              </p>
              <div className="space-y-2">
                {item.children.map((child) => (
                  <div
                    key={child.logisticNum}
                    className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs"
                    style={{ backgroundColor: colors.bgTertiary }}
                  >
                    <span className="font-mono font-medium" style={{ color: colors.text }}>{child.logisticNum}</span>
                    <span className="tabular-nums" style={{ color: colors.textSecondary }}>¥{fmtNum(child.totalPriceRmb)}</span>
                    <span style={{ color: colors.textTertiary }}>{child.dateSent}</span>
                    {child.isPaid && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: hexToRgba(colors.green, 0.12), color: colors.green }}>
                        {t('logistic.status.paid')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
        <HistoryTabContent
          sendVersions={sendVersions}
          paymentVersions={paymentVersions}
          isLoading={historyLoading}
          colors={colors}
        />
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <OrdersTabContent
          orders={orders}
          isLoading={ordersLoading}
          colors={colors}
        />
      )}
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function DetailField({ label, value, suffix, colors, mono }: {
  label: string; value: string; suffix?: string;
  colors: (typeof themeColors)['dark']; mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: colors.text }}>
        {value}
        {suffix && <span className="ml-2 text-xs" style={{ color: colors.textSecondary }}>{suffix}</span>}
      </p>
    </div>
  );
}

// ── History Tab — V1 parity: 2-column layout ──

function HistoryTabContent({ sendVersions, paymentVersions, isLoading, colors }: {
  sendVersions: LogisticSendVersion[];
  paymentVersions: LogisticPaymentVersion[];
  isLoading: boolean;
  colors: (typeof themeColors)['dark'];
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

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left: Shipment (Send) Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0V9l3 3-3 4" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>
            {t('logistic.history.sendColumn')}
          </span>
          <span
            className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
          >
            {sendVersions.length}
          </span>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {sendVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('logistic.history.noSendVersions')}
            </p>
          ) : (
            sendVersions.map((v, idx) => (
              <SendVersionCard key={idx} version={v} idx={idx} colors={colors} />
            ))
          )}
        </div>
      </div>

      {/* Right: Payment Versions */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: colors.text }}>
            {t('logistic.history.paymentColumn')}
          </span>
          <span
            className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
          >
            {paymentVersions.length}
          </span>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
          {paymentVersions.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('logistic.history.noPaymentVersions')}
            </p>
          ) : (
            paymentVersions.map((v, idx) => (
              <PaymentVersionCard key={idx} version={v} idx={idx} colors={colors} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SendVersionCard({ version: v, idx, colors }: {
  version: LogisticSendVersion; idx: number; colors: (typeof themeColors)['dark'];
}) {
  const t = useTranslations('finance');
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleString() : '';
  const accentColor = v.isInitial ? colors.green : colors.blue;
  const fmtNum = (val: number, d = 2) => val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            S{String(idx + 1).padStart(2, '0')}
          </span>
          <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>
            {v.logisticNum}
          </span>
          {v.isInitial && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.green}12`, color: colors.green }}
            >
              {t('logistic.detail.initial')}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: colors.textTertiary }}>{v.byUser}</p>
          <p className="text-xs" style={{ color: colors.textTertiary }}>{dateStr}</p>
        </div>
      </div>

      {/* Initial data */}
      {v.isInitial && (
        <div className="space-y-1.5 mb-2">
          {[
            { label: t('logistic.table.totalPriceRmb'), value: `¥${fmtNum(v.data.totalPrice)}` },
            { label: t('logistic.table.totalWeight'), value: `${fmtNum(v.data.totalWeight)} kg` },
            { label: t('logistic.table.priceKg'), value: fmtNum(v.data.priceKg, 4) },
            { label: t('logistic.table.pallets'), value: String(v.data.pallets) },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
              <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Changes */}
      {v.changes.length > 0 && (
        <div className="space-y-1.5">
          {v.changes.map((ch, ci) => (
            <ChangeRow key={ci} change={ch} colors={colors} />
          ))}
        </div>
      )}

      {v.note && (
        <p className="text-xs mt-2 italic" style={{ color: colors.textTertiary }}>{v.note}</p>
      )}
    </div>
  );
}

function PaymentVersionCard({ version: v, idx, colors }: {
  version: LogisticPaymentVersion; idx: number; colors: (typeof themeColors)['dark'];
}) {
  const t = useTranslations('finance');
  const dateStr = v.dateRecord ? new Date(v.dateRecord).toLocaleString() : '';
  const accentColor = v.isInitial ? colors.green : colors.blue;
  const fmtNum = (val: number, d = 2) => val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            P{String(idx + 1).padStart(2, '0')}
          </span>
          <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>
            {v.logisticNum}
          </span>
          {v.isInitial && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.green}12`, color: colors.green }}
            >
              {t('logistic.detail.initial')}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: colors.textTertiary }}>{v.byUser}</p>
          <p className="text-xs" style={{ color: colors.textTertiary }}>{dateStr}</p>
        </div>
      </div>

      {/* Initial data */}
      {v.isInitial && (
        <div className="space-y-1.5 mb-2">
          {[
            { label: t('logistic.table.logisticPaid'), value: `¥${fmtNum(v.logisticPaid)}` },
            { label: t('logistic.table.usdRmb'), value: fmtNum(v.usdRmb, 4) },
            { label: t('logistic.table.paymentDate'), value: v.paymentDate },
            ...(v.extraPaid > 0 ? [{ label: t('logistic.table.extraPaid'), value: `${((c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$')(v.extraCurrency)}${fmtNum(v.extraPaid)}` }] : []),
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
              <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Changes */}
      {v.changes.length > 0 && (
        <div className="space-y-1.5">
          {v.changes.map((ch, ci) => (
            <ChangeRow key={ci} change={ch} colors={colors} />
          ))}
        </div>
      )}

      {v.note && (
        <p className="text-xs mt-2 italic" style={{ color: colors.textTertiary }}>{v.note}</p>
      )}
    </div>
  );
}

function ChangeRow({ change, colors }: { change: FieldChange; colors: (typeof themeColors)['dark'] }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
      <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{change.field}</span>
      <span className="font-mono line-through" style={{ color: colors.red }}>{change.old}</span>
      <span style={{ color: colors.textTertiary }}>&rarr;</span>
      <span className="font-mono font-semibold" style={{ color: colors.green }}>{change.new}</span>
    </div>
  );
}

// ── Orders Tab ──

function OrdersTabContent({ orders, isLoading, colors }: {
  orders: { poNum: string; supplierCode: string; orderDate: string; currency: string; exchangeRate: number; items: { sku: string; qty: number; unitPrice: number; currency: string; valueRmb: number; valueUsd: number }[]; totalRmb: number; totalUsd: number }[];
  isLoading: boolean;
  colors: (typeof themeColors)['dark'];
}) {
  const t = useTranslations('finance');
  const fmtNum = (val: number, d = 2) => val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
        {t('logistic.orders.noOrders')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div
          key={order.poNum}
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${colors.border}` }}
        >
          {/* PO Header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
          >
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
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                    {((c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$')(item.currency)}{fmtNum(item.unitPrice, 5)}
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
      ))}
    </div>
  );
}
