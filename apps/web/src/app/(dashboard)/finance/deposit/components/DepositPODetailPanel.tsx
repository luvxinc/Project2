'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import type { PurchaseOrder, Shipment, ShipmentEvent } from '@/lib/api/purchase';
import { purchaseApi } from '@/lib/api/purchase';
import type { DepositPaymentDetail, POPaymentDetail } from '@/lib/api/finance';

// ── Types ────────────────────────────────────────
interface POEvent {
  id: number;
  eventType: string;
  eventSeq: number;
  changes: string;
  note: string | null;
  operator: string;
  createdAt: string;
}

interface DepositPODetailPanelProps {
  order: PurchaseOrder;
  detail: PurchaseOrder | null;
  isLoading: boolean;
  history: POEvent[];
  onBack: () => void;
  onDeletePayment?: () => void;
  depositDetails?: DepositPaymentDetail[];
  paymentDetails?: POPaymentDetail[];
}

// ── History field labels for PO strategy ────────────
const STRATEGY_FIELD_KEYS = [
  'currency', 'exchangeRate', 'rateMode',
  'floatEnabled', 'floatThreshold',
  'requireDeposit', 'depositRatio', 'note',
] as const;

// ── Shipment status color map ────────────
const SHIP_STATUS: Record<string, { bg: string; color: string }> = {
  IN_TRANSIT:      { bg: 'rgba(255,159,10,0.12)', color: '#ff9f0a' },
  ALL_RECEIVED:    { bg: 'rgba(48,209,88,0.12)',  color: '#30d158' },
  DIFF_UNRESOLVED: { bg: 'rgba(255,69,58,0.12)',  color: '#ff453a' },
  DIFF_RESOLVED:   { bg: 'rgba(100,210,255,0.12)', color: '#64d2ff' },
};

export default function DepositPODetailPanel({
  order, detail, isLoading, history, onBack, onDeletePayment,
  depositDetails, paymentDetails,
}: DepositPODetailPanelProps) {
  const t = useTranslations('purchase');
  const tF = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;

  const [activeTab, setActiveTab] = useState<'items' | 'history' | 'shipments'>('items');

  const items = detail?.items ?? [];
  const strategy = detail?.strategy ?? null;
  const currency = strategy?.currency ?? 'USD';
  const exchangeRate = strategy?.exchangeRate ?? 1;
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalRMB = currency === 'USD' ? totalAmount * exchangeRate : totalAmount;
  const totalUSD = currency === 'RMB' ? totalAmount / exchangeRate : totalAmount;

  // ── Related shipments for this PO ────────────
  const { data: shipmentsData } = useQuery({
    queryKey: ['deposit-po-shipments', order.poNum],
    queryFn: async () => {
      // Search shipments by PO number, then filter to only those containing this PO
      const result = await purchaseApi.getShipments({ search: order.poNum, limit: 100 });
      const allShipments = (result && typeof result === 'object' && 'data' in result)
        ? (result as { data: Shipment[] }).data : [];
      // Fetch detail for each to check items
      const detailed: Shipment[] = [];
      for (const s of allShipments) {
        try {
          const d = await purchaseApi.getShipment(s.id);
          const hasPoItems = d.items?.some(item => item.poNum === order.poNum);
          if (hasPoItems) detailed.push(d);
        } catch { /* skip */ }
      }
      return detailed;
    },
    enabled: !!order.poNum,
  });

  const shipments = shipmentsData ?? [];

  // ── Shipment histories for the history tab ────────────
  const { data: shipmentHistories } = useQuery({
    queryKey: ['deposit-po-shipment-histories', order.poNum, shipments.map(s => s.id).join(',')],
    queryFn: async () => {
      const map: Record<number, ShipmentEvent[]> = {};
      for (const s of shipments) {
        try {
          map[s.id] = await purchaseApi.getShipmentHistory(s.id);
        } catch { map[s.id] = []; }
      }
      return map;
    },
    enabled: shipments.length > 0,
  });

  // Flatten all shipment events with logisticNum for display
  const allShipmentEvents = useMemo(() => {
    if (!shipmentHistories) return [];
    const events: (ShipmentEvent & { logisticNum: string })[] = [];
    for (const s of shipments) {
      const evts = shipmentHistories[s.id] ?? [];
      for (const ev of evts) {
        events.push({ ...ev, logisticNum: s.logisticNum });
      }
    }
    // Sort by date descending
    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return events;
  }, [shipmentHistories, shipments]);

  // ── Shipping status badge ────────────
  const isDeleted = order.isDeleted === true;
  const badge = (() => {
    if (isDeleted) return { color: colors.red, label: t('orders.shipping.deleted') };
    switch (order.shippingStatus) {
      case 'fully_shipped': return { color: colors.green, label: t('orders.shipping.fullyShipped') };
      case 'partially_shipped': return { color: colors.orange, label: t('orders.shipping.partiallyShipped') };
      default: return { color: colors.textTertiary, label: t('orders.shipping.notShipped') };
    }
  })();

  // ── History helpers ────────────
  const strategyEvents = history.filter(ev =>
    ['CREATE', 'UPDATE_STRATEGY', 'UPDATE_ITEMS_AND_STRATEGY', 'DELETE', 'RESTORE'].includes(ev.eventType)
  );
  const itemEvents = history.filter(ev =>
    ['CREATE', 'UPDATE_ITEMS', 'UPDATE_ITEMS_AND_STRATEGY', 'DELETE', 'RESTORE'].includes(ev.eventType)
  );

  const parseFieldChanges = (changesJson: string) => {
    try {
      const raw = JSON.parse(changesJson) as Record<string, { before: unknown; after: unknown } | unknown[]>;
      const result: { field: string; before: unknown; after: unknown }[] = [];
      for (const [key, val] of Object.entries(raw)) {
        if (key !== 'items' && val && typeof val === 'object' && !Array.isArray(val)) {
          const v = val as { before: unknown; after: unknown };
          if ('before' in v && 'after' in v) {
            result.push({ field: key, before: v.before, after: v.after });
          }
        }
      }
      return result;
    } catch { return []; }
  };

  const parseItemChanges = (changesJson: string) => {
    try {
      const raw = JSON.parse(changesJson) as {
        items?: { added?: { sku: string; qty: number; unitPrice: number }[]; removed?: { sku: string }[]; adjusted?: { sku: string; field: string; before: unknown; after: unknown }[] };
        added?: { sku: string; qty: number; unitPrice: number }[];
        removed?: { sku: string }[];
        adjusted?: { sku: string; field: string; before: unknown; after: unknown }[];
      };
      const src = raw.items ?? raw;
      return { added: src.added ?? [], removed: src.removed ?? [], adjusted: src.adjusted ?? [] };
    } catch { return { added: [], removed: [], adjusted: [] }; }
  };

  // Shipment history field labels
  const SHIP_FIELD_LABELS: Record<string, string> = {
    etaDate: t('shipments.history.fieldLabels.etaDate'),
    pallets: t('shipments.history.fieldLabels.pallets'),
    totalWeight: t('shipments.history.fieldLabels.totalWeight'),
    priceKg: t('shipments.history.fieldLabels.priceKg'),
    logisticsCost: t('shipments.history.fieldLabels.logisticsCost'),
    exchangeRate: t('shipments.history.fieldLabels.exchangeRate'),
    note: t('shipments.history.fieldLabels.note'),
    sentDate: t('shipments.history.fieldLabels.sentDate'),
  };

  const parseShipLogisticsChanges = (changesJson: string) => {
    try {
      const raw = JSON.parse(changesJson) as Record<string, { before: unknown; after: unknown }>;
      return Object.entries(raw)
        .filter(([, v]) => v && typeof v === 'object' && 'before' in v && 'after' in v)
        .map(([field, vals]) => ({ field, before: vals.before, after: vals.after }));
    } catch { return []; }
  };

  // ── Tab config ────────────
  const tabs = [
    { id: 'items' as const, label: t('orders.detail.itemsTitle'), count: items.length },
    { id: 'history' as const, label: t('orders.detail.historyTitle'), count: history.length },
    { id: 'shipments' as const, label: t('hub.shipments.navTitle'), count: shipments.length },
  ];

  return (
    <div className="relative">
      {/* ── Back bar + Delete ───────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {tF('deposit.detail.back')}
        </button>

        {onDeletePayment && (
          <button
            onClick={onDeletePayment}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}
          >
            {tF('deposit.actions.delete')}
          </button>
        )}
      </div>

      {/* ── Summary card ───────────────────────────────────── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {order.poNum}
            </p>
            <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>{order.supplierCode}</span>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: `${badge.color}12`,
                color: badge.color,
                boxShadow: `0 0 0 1px ${badge.color}40`,
              }}
            >
              {badge.label}
            </span>
            {order.strategySeq && (
              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-medium"
                style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}>
                {t('orders.table.strategyVer')} {order.strategySeq}
              </span>
            )}
            {order.detailSeq && (
              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-medium"
                style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>
                {t('orders.table.detailVer')} {order.detailSeq}
              </span>
            )}
          </div>
          {!isLoading && (
            <div className="text-right">
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('orders.detail.totalAmount')}</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                {currency === 'USD' ? '$' : '¥'}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {currency === 'USD' && exchangeRate > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                    ≈ ¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Field grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.table.orderDate')}</p>
              <p className="text-sm font-mono font-medium" style={{ color: colors.text }}>{order.poDate}</p>
            </div>
            {strategy && (
              <>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.exchangeRate')}</p>
                  <p className="text-sm font-mono" style={{ color: colors.text }}>
                    {strategy.exchangeRate}
                    <span className="ml-2 text-xs" style={{ color: colors.textSecondary }}>
                      ({strategy.rateMode === 'auto' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.floatEnabled')}</p>
                  <p className="text-sm" style={{ color: colors.text }}>
                    {strategy.floatEnabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                        {strategy.floatThreshold}%
                      </span>
                    ) : t('orders.detail.no')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.depositEnabled')}</p>
                  <p className="text-sm" style={{ color: colors.text }}>
                    {strategy.requireDeposit ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${colors.purple}20`, color: colors.purple }}>
                        {strategy.depositRatio}%
                      </span>
                    ) : t('orders.detail.no')}
                  </p>
                </div>
                {strategy.note && (
                  <div className="col-span-2 md:col-span-4 mt-1">
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('orders.detail.note')}</p>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>{strategy.note}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Deposit Payment Details (定金明细) ── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: '#30d158' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
              {tF('poPayment.detail.depositDetailsTitle')}
            </h3>
            {depositDetails && depositDetails.length > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
              >
                {depositDetails.length}
              </span>
            )}
          </div>
        </div>
        {(!depositDetails || depositDetails.length === 0) ? (
          <div className="px-5 py-4">
            <p className="text-xs" style={{ color: colors.textTertiary }}>
              {strategy?.requireDeposit === false
                ? tF('poPayment.detail.noDepositRequired')
                : tF('poPayment.detail.noDeposit')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: `${colors.bg}50` }}>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.pmtNo')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtDate')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtPaid')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtPaidCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtPrepayAmount')}</th>
                  <th className="text-center py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.depPmtOverride')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.extraAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {depositDetails.map((det, idx) => {
                  const cs = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';
                  const fmtN = (v: number, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
                  return (
                    <tr
                      key={det.pmtNo + '-' + idx}
                      style={{ borderColor: colors.border }}
                      className={idx !== depositDetails.length - 1 ? 'border-b' : ''}
                    >
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span style={{ color: '#30d158' }} className="font-mono text-xs font-semibold">{det.pmtNo}</span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono whitespace-nowrap">{det.depDate}</td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: det.depCur === 'USD' ? 'rgba(100,210,255,0.14)' : 'rgba(255,214,10,0.14)', color: det.depCur === 'USD' ? '#64d2ff' : '#ffd60a' }}>
                          {cs(det.depCur)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.text }} className="font-mono text-xs tabular-nums">{cs(det.depCur)}{fmtN(det.depPaid)}</span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono text-right whitespace-nowrap tabular-nums">
                        {cs(det.depCur)}{fmtN(det.depPaidCur, 4)}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: det.depPrepayAmount > 0 ? colors.purple : colors.textTertiary }} className="font-mono text-xs tabular-nums">
                          {det.depPrepayAmount > 0 ? `$${fmtN(det.depPrepayAmount)}` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center whitespace-nowrap">
                        {det.depOverride === 1 ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}>{tF('deposit.detail.depOverride')}</span>
                        ) : <span style={{ color: colors.textTertiary }} className="text-xs">—</span>}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        {det.extraAmount > 0 ? (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.orange }}>{cs(det.extraCur)}{fmtN(det.extraAmount)}</span>
                        ) : <span style={{ color: colors.textTertiary }} className="text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PO Payment Details (尾款明细) ── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: '#64d2ff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
              {tF('poPayment.detail.paymentDetailsTitle')}
            </h3>
            {paymentDetails && paymentDetails.length > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
              >
                {paymentDetails.length}
              </span>
            )}
          </div>
        </div>
        {(!paymentDetails || paymentDetails.length === 0) ? (
          <div className="px-5 py-4">
            <p className="text-xs" style={{ color: colors.textTertiary }}>
              {tF('poPayment.detail.noPayment')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: `${colors.bg}50` }}>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.pmtNo')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtDate')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtPaid')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtPaidCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtPrepayAmount')}</th>
                  <th className="text-center py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.poPmtOverride')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{tF('poPayment.detail.extraAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentDetails.map((det, idx) => {
                  const cs = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';
                  const fmtN = (v: number, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
                  return (
                    <tr
                      key={det.pmtNo + '-' + idx}
                      style={{ borderColor: colors.border }}
                      className={idx !== paymentDetails.length - 1 ? 'border-b' : ''}
                    >
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span style={{ color: '#30d158' }} className="font-mono text-xs font-semibold">{det.pmtNo}</span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono whitespace-nowrap">{det.poDate}</td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: det.poCur === 'USD' ? 'rgba(100,210,255,0.14)' : 'rgba(255,214,10,0.14)', color: det.poCur === 'USD' ? '#64d2ff' : '#ffd60a' }}>
                          {cs(det.poCur)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.text }} className="font-mono text-xs tabular-nums">{cs(det.poCur)}{fmtN(det.poPaid)}</span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono text-right whitespace-nowrap tabular-nums">
                        {cs(det.poCur)}{fmtN(det.poPaidCur, 4)}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: det.poPrepayAmount > 0 ? colors.purple : colors.textTertiary }} className="font-mono text-xs tabular-nums">
                          {det.poPrepayAmount > 0 ? `$${fmtN(det.poPrepayAmount)}` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center whitespace-nowrap">
                        {det.poOverride === 1 ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}>{tF('po.detail.poPmtOverride')}</span>
                        ) : <span style={{ color: colors.textTertiary }} className="text-xs">—</span>}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        {det.extraAmount > 0 ? (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.orange }}>{cs(det.extraCur)}{fmtN(det.extraAmount)}</span>
                        ) : <span style={{ color: colors.textTertiary }} className="text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
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
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-[-2px] align-middle"
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

      {/* ═══ TAB 1: Items ═══ */}
      {!isLoading && activeTab === 'items' && (
        <div className="mt-4">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('orders.detail.noItems')}
            </p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ color: colors.textTertiary }} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{t('orders.detail.sku')}</th>
                    <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{t('orders.detail.qty')}</th>
                    <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{t('orders.detail.unitPrice')}</th>
                    <th style={{ color: colors.textTertiary }} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{t('orders.detail.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const amount = item.quantity * item.unitPrice;
                    return (
                      <tr key={item.id} style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}>
                        <td style={{ color: colors.text }} className="px-4 py-2.5 text-sm font-mono whitespace-nowrap">{item.sku}</td>
                        <td style={{ color: colors.textSecondary }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap">{item.quantity.toLocaleString()}</td>
                        <td style={{ color: colors.textSecondary }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap">{currency === 'USD' ? '$' : '¥'}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ color: colors.text }} className="px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap font-semibold">{currency === 'USD' ? '$' : '¥'}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
                    <td colSpan={3} className="px-4 py-2.5 text-sm font-medium text-right" style={{ color: colors.textSecondary }}>{t('orders.detail.totalAmount')}</td>
                    <td className="px-4 py-2.5 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>
                      {currency === 'USD' ? '$' : '¥'}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  {currency === 'USD' && exchangeRate > 0 && (
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td colSpan={3} className="px-4 py-1.5 text-xs text-right" style={{ color: colors.textTertiary }}>{t('orders.detail.totalRMB')}</td>
                      <td className="px-4 py-1.5 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                  {currency === 'RMB' && exchangeRate > 0 && (
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td colSpan={3} className="px-4 py-1.5 text-xs text-right" style={{ color: colors.textTertiary }}>{t('orders.detail.totalUSD')}</td>
                      <td className="px-4 py-1.5 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 2: History — 三栏: 策略变更 | 商品变更 | 物流单历史 ═══ */}
      {!isLoading && activeTab === 'history' && (() => {
        if (history.length === 0 && allShipmentEvents.length === 0) {
          return (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('orders.detail.historyTitle')} — 暂无记录
            </p>
          );
        }

        // Filter shipment logistics events (物流单信息变更)
        const shipLogEvents = allShipmentEvents.filter(ev =>
          ['CREATE', 'UPDATE_LOGISTICS', 'DELETE', 'RESTORE'].includes(ev.eventType)
        );

        return (
          <div className="grid grid-cols-3 gap-4">

            {/* ── 左栏：策略变更 ── */}
            <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('orders.detail.history.panelStrategy')}</span>
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}>
                  {strategyEvents.length}
                </span>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                {strategyEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noStrategyChanges')}</p>
                ) : (
                  strategyEvents.map((ev, idx) => {
                    const isCreate = ev.eventType === 'CREATE';
                    const isDelete = ev.eventType === 'DELETE';
                    const isRestore = ev.eventType === 'RESTORE';
                    const accentColor = isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue;
                    const fieldChanges = parseFieldChanges(ev.changes);

                    return (
                      <div key={ev.id} className="rounded-xl p-4"
                        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                              style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                              S{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isCreate || isDelete || isRestore ? `${accentColor}12` : colors.bgTertiary,
                                color: isCreate || isDelete || isRestore ? accentColor : colors.textSecondary,
                              }}>
                              {isCreate ? t('orders.detail.history.typeCreate') : isDelete ? t('orders.detail.history.typeDelete') : isRestore ? t('orders.detail.history.typeRestore') : t('orders.detail.history.typeUpdate')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{new Date(ev.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        {fieldChanges.length > 0 ? (
                          <div className="space-y-1.5">
                            {fieldChanges.map((ch, i) => (
                              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>
                                  {t(`orders.detail.history.fieldLabels.${ch.field}`) ?? ch.field}
                                </span>
                                <span className="font-mono line-through" style={{ color: colors.red }}>{String(ch.before ?? '—')}</span>
                                <span style={{ color: colors.textTertiary }}>→</span>
                                <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(ch.after ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        ) : isCreate ? (
                          <div className="space-y-1.5">
                            {(() => {
                              try {
                                const raw = JSON.parse(ev.changes) as Record<string, unknown>;
                                const strategyData = (raw.strategy ?? raw) as Record<string, unknown>;
                                const fields = STRATEGY_FIELD_KEYS.map(k => ({ key: k, label: t(`orders.detail.history.fieldLabels.${k}`) }));
                                const hasData = fields.some(f => strategyData[f.key] !== undefined);
                                if (!hasData) return <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.initialSnapshot')}</p>;
                                return fields.map(f => {
                                  const val = strategyData[f.key];
                                  if (val === undefined || val === null) return null;
                                  let display = String(val);
                                  if (typeof val === 'boolean') display = val ? t('orders.detail.history.boolYes') : t('orders.detail.history.boolNo');
                                  if (f.key === 'rateMode') display = val === 'auto' ? t('orders.detail.history.rateModeAuto') : t('orders.detail.history.rateModeManual');
                                  if (f.key === 'floatThreshold' || f.key === 'depositRatio') display = `${val}%`;
                                  return (
                                    <div key={f.key} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                      <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{f.label}</span>
                                      <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{display}</span>
                                    </div>
                                  );
                                });
                              } catch {
                                return <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.initialSnapshot')}</p>;
                              }
                            })()}
                          </div>
                        ) : isDelete ? (
                          <p className="text-xs italic" style={{ color: colors.red }}>{t('orders.detail.history.deleted')}</p>
                        ) : isRestore ? (
                          <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.restored')}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── 中栏：商品变更 ── */}
            <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('orders.detail.history.panelItems')}</span>
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>
                  {itemEvents.length}
                </span>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                {itemEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noItemChanges')}</p>
                ) : (
                  itemEvents.map((ev, idx) => {
                    const isCreate = ev.eventType === 'CREATE';
                    const isDelete = ev.eventType === 'DELETE';
                    const isRestore = ev.eventType === 'RESTORE';
                    const itemChanges = parseItemChanges(ev.changes);
                    const snapshotItems = isCreate ? items : [];
                    const hasChanges = itemChanges.added.length > 0 || itemChanges.removed.length > 0 || itemChanges.adjusted.length > 0;

                    return (
                      <div key={ev.id} className="rounded-xl p-4"
                        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: `${isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue}15`,
                                color: isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue,
                              }}>
                              L{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isCreate || isDelete || isRestore ? `${isCreate ? colors.green : isDelete ? colors.red : colors.orange}12` : colors.bgTertiary,
                                color: isCreate || isDelete || isRestore ? (isCreate ? colors.green : isDelete ? colors.red : colors.orange) : colors.textSecondary,
                              }}>
                              {isCreate ? t('orders.detail.history.typeInitialItems') : isDelete ? t('orders.detail.history.typeDelete') : isRestore ? t('orders.detail.history.typeRestore') : t('orders.detail.history.typeAdjust')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{new Date(ev.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        {/* CREATE: initial snapshot */}
                        {isCreate && snapshotItems.length > 0 && (
                          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                            <div className="grid grid-cols-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                              style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}>
                              <span>SKU</span>
                              <span className="text-right">{t('orders.detail.history.snapshotQty') ?? 'Qty'}</span>
                              <span className="text-right">{t('orders.detail.history.snapshotPrice') ?? 'Price'}</span>
                            </div>
                            {snapshotItems.map((item, i) => (
                              <div key={item.id} className="grid grid-cols-3 px-4 py-2 text-xs"
                                style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span className="text-right" style={{ color: colors.textSecondary }}>{item.quantity.toLocaleString()}</span>
                                <span className="text-right font-mono" style={{ color: colors.textSecondary }}>{currency === 'USD' ? '$' : '¥'}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* UPDATE_ITEMS diff */}
                        {!isCreate && hasChanges && (
                          <div className="space-y-1.5">
                            {itemChanges.added.map((item, i) => (
                              <div key={`add-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: `${colors.green}08` }}>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>{t('orders.detail.history.itemAdded')}</span>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span style={{ color: colors.textTertiary }}>{t('orders.detail.history.itemAddedDetail', { qty: item.qty, price: (item.unitPrice ?? 0).toFixed(2) })}</span>
                              </div>
                            ))}
                            {itemChanges.removed.map((item, i) => (
                              <div key={`rm-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: `${colors.red}08` }}>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.red}15`, color: colors.red }}>{t('orders.detail.history.itemRemoved')}</span>
                                <span className="font-mono font-medium line-through" style={{ color: colors.textSecondary }}>{item.sku}</span>
                              </div>
                            ))}
                            {itemChanges.adjusted.map((item, i) => (
                              <div key={`adj-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>{t('orders.detail.history.itemAdjusted')}</span>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span className="font-mono line-through" style={{ color: colors.red }}>{String(item.before ?? '—')}</span>
                                <span style={{ color: colors.textTertiary }}>→</span>
                                <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(item.after ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {isDelete && <p className="text-xs italic" style={{ color: colors.red }}>{t('orders.detail.history.deletedItems')}</p>}
                        {isRestore && <p className="text-xs italic" style={{ color: colors.green }}>{t('orders.detail.history.restoredItems')}</p>}
                        {!isCreate && !isDelete && !isRestore && !hasChanges && (
                          <p className="text-xs italic" style={{ color: colors.textTertiary }}>{t('orders.detail.history.noItemAdjust')}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── 右栏：物流单历史记录 ── */}
            <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.orange }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0V9l3 3-3 4" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: colors.text }}>{t('shipments.history.panelLogistics')}</span>
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}>
                  {shipLogEvents.length}
                </span>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                {shipLogEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
                    {t('shipments.detail.noHistory') ?? '暂无物流单历史'}
                  </p>
                ) : (
                  shipLogEvents.map((ev, idx) => {
                    const isCreate = ev.eventType === 'CREATE';
                    const isDelete = ev.eventType === 'DELETE';
                    const isRestore = ev.eventType === 'RESTORE';
                    const accentColor = isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue;
                    const parsedChanges = parseShipLogisticsChanges(ev.changes);

                    return (
                      <div key={`${ev.id}-${idx}`} className="rounded-xl p-4"
                        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                              style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                              T{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs font-mono" style={{ color: colors.blue }}>
                              {ev.logisticNum}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isCreate || isDelete || isRestore ? `${accentColor}12` : colors.bgTertiary,
                                color: isCreate || isDelete || isRestore ? accentColor : colors.textSecondary,
                              }}>
                              {isCreate ? t('shipments.history.typeCreate') :
                               isDelete ? t('shipments.history.typeDelete') :
                               isRestore ? t('shipments.history.typeRestore') :
                               t('shipments.history.typeUpdate')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{new Date(ev.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        {parsedChanges.length > 0 ? (
                          <div className="space-y-1.5">
                            {parsedChanges.map((ch, i) => (
                              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{SHIP_FIELD_LABELS[ch.field] ?? ch.field}</span>
                                <span className="font-mono line-through" style={{ color: colors.red }}>{String(ch.before ?? '—')}</span>
                                <span style={{ color: colors.textTertiary }}>→</span>
                                <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(ch.after ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        ) : isDelete ? (
                          <p className="text-xs italic" style={{ color: colors.red }}>{t('shipments.history.deleted')}</p>
                        ) : isRestore ? (
                          <p className="text-xs italic" style={{ color: colors.green }}>{t('shipments.history.restored')}</p>
                        ) : isCreate ? (() => {
                          // Snapshot rendering for CREATE events (matching shipments module)
                          const SNAPSHOT_LABELS: Record<string, string> = {
                            logisticNum: t('shipments.history.fieldLabels.logisticNum'),
                            sentDate: t('shipments.history.fieldLabels.sentDate'),
                            etaDate: t('shipments.history.fieldLabels.etaDate'),
                            pallets: t('shipments.history.fieldLabels.pallets'),
                            logisticsCost: t('shipments.history.fieldLabels.logisticsCost'),
                            exchangeRate: t('shipments.history.fieldLabels.exchangeRate'),
                            rateMode: t('shipments.history.fieldLabels.rateMode'),
                            totalWeight: t('shipments.history.fieldLabels.totalWeight'),
                          };
                          let snapshotData: Record<string, unknown> = {};
                          try {
                            const raw = JSON.parse(ev.changes) as Record<string, unknown>;
                            const fields = Object.keys(SNAPSHOT_LABELS);
                            if (fields.some(f => raw[f] !== undefined)) snapshotData = raw;
                          } catch { /* empty */ }

                          // Fallback to the matching shipment detail object
                          if (Object.keys(snapshotData).length === 0) {
                            const matchShip = shipments.find(s => s.logisticNum === ev.logisticNum);
                            if (matchShip) {
                              snapshotData = {
                                logisticNum: matchShip.logisticNum,
                                sentDate: matchShip.sentDate,
                                etaDate: matchShip.etaDate ?? null,
                                pallets: matchShip.pallets ?? 0,
                                totalWeight: matchShip.totalWeight ?? 0,
                                logisticsCost: matchShip.logisticsCost ?? 0,
                                exchangeRate: matchShip.exchangeRate ?? 1,
                                rateMode: matchShip.rateMode ?? 'M',
                              };
                            }
                          }

                          const snapshotFields = Object.keys(SNAPSHOT_LABELS);
                          const hasSnapshotData = snapshotFields.some(f => snapshotData[f] !== undefined && snapshotData[f] !== null && snapshotData[f] !== '');

                          return hasSnapshotData ? (
                            <div className="space-y-1.5">
                              {snapshotFields.map(f => {
                                const val = snapshotData[f];
                                if (val === undefined || val === null || val === '') return null;
                                let display = String(val);
                                if (f === 'rateMode') display = val === 'A' ? t('shipments.history.rateModeAuto') : t('shipments.history.rateModeManual');
                                if (f === 'logisticsCost') display = `¥${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                if (f === 'totalWeight') display = `${Number(val).toLocaleString()} kg`;
                                return (
                                  <div key={f} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: colors.bgTertiary }}>
                                    <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{SNAPSHOT_LABELS[f]}</span>
                                    <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{display}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs italic" style={{ color: colors.green }}>{t('shipments.history.typeCreate')}</p>
                          );
                        })() : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ TAB 3: Shipments — 发货记录 ═══ */}
      {!isLoading && activeTab === 'shipments' && (
        <div className="mt-4 space-y-4">
          {shipments.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              暂无关联发货记录
            </p>
          ) : (
            shipments.map((s) => {
              const rs = s.isDeleted ? 'deleted' : (s.receiveStatus ?? 'IN_TRANSIT');
              const sc = SHIP_STATUS[rs] ?? SHIP_STATUS['IN_TRANSIT'];
              const poItems = s.items?.filter(i => i.poNum === order.poNum) ?? [];
              const shipTotalUSD = poItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
              const shipExRate = s.exchangeRate ?? 1;

              return (
                <div key={s.id} className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
                  {/* Shipment header */}
                  <div className="flex items-center justify-between px-5 py-3"
                    style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-bold" style={{ color: colors.text }}>{s.logisticNum}</span>
                      <span
                        className="inline-flex items-center gap-1.5 pl-2 pr-3 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: sc.bg, color: sc.color }}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rs === 'IN_TRANSIT' ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: sc.color }} />
                        {s.isDeleted ? t('shipments.status.deleted') : t(`shipments.receiveStatus.${rs}`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: colors.textTertiary }}>
                      <span>{t('shipments.detail.sentDate')}: {s.sentDate}</span>
                      {s.etaDate && <span>ETA: {s.etaDate}</span>}
                      {s.pallets > 0 && <span>{s.pallets} {t('shipments.detail.pallets')}</span>}
                    </div>
                  </div>

                  {/* Shipment overview grid */}
                  <div className="px-5 py-3 grid grid-cols-4 gap-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: colors.textTertiary }}>{t('shipments.detail.exchangeRate')}</p>
                      <p className="text-sm font-mono" style={{ color: colors.text }}>
                        {shipExRate}
                        <span className="ml-1 text-xs" style={{ color: colors.textSecondary }}>
                          ({(s.rateMode) === 'A' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: colors.textTertiary }}>{t('shipments.detail.logisticsCost')}</p>
                      <p className="text-sm font-mono" style={{ color: colors.text }}>¥{(s.logisticsCost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: colors.textTertiary }}>{t('shipments.edit.totalWeight')}</p>
                      <p className="text-sm font-mono" style={{ color: colors.text }}>{(s.totalWeight ?? 0).toLocaleString()} kg</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: colors.textTertiary }}>{t('shipments.detail.totalUSD')}</p>
                      <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                        ${shipTotalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* PO-related items from this shipment */}
                  {poItems.length > 0 && (
                    <table className="w-full">
                      <thead>
                        <tr style={{ backgroundColor: `${colors.bg}50`, borderBottom: `1px solid ${colors.border}` }}>
                          <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>SKU</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('shipments.detail.qty')}</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('shipments.detail.unitPrice')}</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('shipments.detail.amount')}</th>
                          <th className="text-center px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>{t('shipments.detail.poChange')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poItems.map((item, i) => (
                          <tr key={i} style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}>
                            <td className="px-4 py-2 text-sm font-mono font-medium" style={{ color: colors.text }}>{item.sku}</td>
                            <td className="px-4 py-2 text-sm font-mono text-right" style={{ color: colors.textSecondary }}>{item.quantity.toLocaleString()}</td>
                            <td className="px-4 py-2 text-sm font-mono text-right" style={{ color: colors.textSecondary }}>${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2 text-center">
                              {item.poChange && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>✓</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Footer meta ── */}
      {!isLoading && detail && (
        <div
          className="mt-6 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
          style={{ borderTop: `1px solid ${colors.border}`, color: colors.textTertiary }}
        >
          {detail.createdBy && <span>{t('orders.detail.operator')}: {detail.createdBy}</span>}
          <span>{t('orders.detail.createdAt')}: {new Date(detail.createdAt).toLocaleString()}</span>
          {detail.updatedBy && detail.updatedBy !== detail.createdBy && (
            <span>{t('orders.detail.lastEditor')}: {detail.updatedBy}</span>
          )}
          <span>{t('orders.detail.updatedAt')}: {new Date(detail.updatedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
