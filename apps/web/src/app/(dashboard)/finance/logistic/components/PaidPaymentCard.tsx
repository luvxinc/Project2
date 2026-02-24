'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { rateModeStyle } from '@/lib/status-colors';
import type { LogisticListItem } from '@/lib/api';

export interface PaymentGroup {
  pmtNo: string;
  paymentDate: string | null;
  items: LogisticListItem[];
  totalFreightRmb: number;
  totalFreightUsd: number;
  totalPaidRmb: number;
  extraPaid: number;
  extraCurrency: string;
  extraPaidUsd: number;
  totalWithExtraRmb: number;
  totalWithExtraUsd: number;
  settlementRate: number;
  rateMode: string;
  isDeleted: boolean;
}

interface Props {
  group: PaymentGroup;
  onClickShipment: (item: LogisticListItem) => void;
  onDeletePayment: (pmtNo: string) => void;
  onRestorePayment: (pmtNo: string) => void;
}

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * PaidPaymentCard — Apple-style card for a payment group.
 * V1 parity: logistic.html paid grid cards grouped by pmt_no.
 */
export default function PaidPaymentCard({ group, onClickShipment, onDeletePayment, onRestorePayment }: Props) {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Separate parents and children
  const parents = group.items.filter(i => !i.isChild);
  const childMap = new Map<string, LogisticListItem[]>();
  for (const item of group.items) {
    if (item.isChild) {
      // Extract parent logistic num from child (e.g. "XX_delay_V01" → "XX")
      const match = item.logisticNum.match(/^(.+)_delay_V\d+$/);
      const parentNum = match ? match[1] : item.logisticNum;
      if (!childMap.has(parentNum)) childMap.set(parentNum, []);
      childMap.get(parentNum)!.push(item);
    }
  }

  const hasExtra = group.extraPaid > 0;

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderColor: group.isDeleted ? 'rgba(142,142,147,0.3)' : colors.border,
        opacity: group.isDeleted ? 0.6 : 1,
      }}
      className="rounded-xl border overflow-hidden transition-all hover:shadow-md"
    >
      {/* Header */}
      <div
        style={{ borderColor: colors.border }}
        className="flex items-center justify-between px-4 py-3 border-b"
      >
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-sm font-bold"
            style={{ color: group.isDeleted ? colors.gray : colors.green }}
          >
            {group.pmtNo}
          </span>
          {group.isDeleted && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(142,142,147,0.14)', color: colors.gray }}
            >
              {t('logistic.status.deleted')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Delete / Restore */}
          {group.isDeleted ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRestorePayment(group.pmtNo); }}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
              title={t('logistic.actions.restore')}
            >
              <svg className="w-3.5 h-3.5" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onDeletePayment(group.pmtNo); }}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
              title={t('logistic.actions.delete')}
            >
              <svg className="w-3.5 h-3.5" style={{ color: colors.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Shipment List */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: colors.textSecondary }} className="text-xs font-medium uppercase tracking-wider">
            {t('logistic.table.logisticNum')}
          </span>
          <span style={{ color: colors.textTertiary }} className="text-xs">
            {t('logistic.card.shipmentCount', { count: group.items.length })}
          </span>
        </div>

        <div
          className="rounded-lg overflow-y-auto space-y-0.5"
          style={{ backgroundColor: `${colors.bg}60`, maxHeight: '140px' }}
        >
          {parents.map((parent) => {
            const children = childMap.get(parent.logisticNum) || [];
            return (
              <div key={parent.logisticNum}>
                {/* Parent */}
                <button
                  onClick={() => onClickShipment(parent)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-opacity hover:opacity-70"
                >
                  <svg className="w-3 h-3 shrink-0" style={{ color: colors.textTertiary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="font-mono text-xs font-semibold" style={{ color: colors.blue }}>
                    {parent.logisticNum}
                  </span>
                </button>
                {/* Children */}
                {children.map((child) => (
                  <button
                    key={child.logisticNum}
                    onClick={() => onClickShipment(child)}
                    className="w-full flex items-center gap-2 pl-8 pr-3 py-1 text-left transition-opacity hover:opacity-70"
                    style={{ borderLeft: `2px dashed ${colors.border}`, marginLeft: '12px' }}
                  >
                    <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>
                      {child.logisticNum}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Amounts */}
      <div style={{ borderColor: colors.border }} className="px-4 py-3 border-t space-y-2">
        {/* Freight */}
        <div className="flex items-center justify-between">
          <span style={{ color: colors.textSecondary }} className="text-xs">
            {t('logistic.card.freight')}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums" style={{ color: colors.teal }}>
              ${fmtNum(group.totalFreightUsd, 2)}
            </span>
            <span className="font-mono text-xs tabular-nums" style={{ color: colors.yellow }}>
              ¥{fmtNum(group.totalFreightRmb)}
            </span>
          </div>
        </div>

        {/* Extra Fee */}
        {hasExtra && (
          <div className="flex items-center justify-between">
            <span style={{ color: colors.textSecondary }} className="text-xs">
              {t('logistic.card.extraFee')}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs tabular-nums" style={{ color: colors.teal }}>
                ${fmtNum(group.extraPaidUsd, 2)}
              </span>
              <span className="font-mono text-xs tabular-nums" style={{ color: colors.yellow }}>
                ¥{fmtNum(group.extraPaid)}
              </span>
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ borderColor: colors.border }} className="border-t" />

        {/* Total */}
        <div className="flex items-center justify-between">
          <span style={{ color: colors.text }} className="text-xs font-semibold">
            {t('logistic.card.total')}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: colors.teal }}>
              ${fmtNum(group.totalWithExtraUsd, 2)}
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: colors.yellow }}>
              ¥{fmtNum(group.totalWithExtraRmb)}
            </span>
          </div>
        </div>

        {/* Rate */}
        <div className="flex items-center justify-between">
          <span style={{ color: colors.textSecondary }} className="text-xs">
            {t('logistic.card.settlementRate')}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
              {fmtNum(group.settlementRate, 4)}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: rateModeStyle(group.rateMode === 'A' || group.rateMode === 'auto', colors).bg,
                color: rateModeStyle(group.rateMode === 'A' || group.rateMode === 'auto', colors).color,
              }}
            >
              {group.rateMode === 'A' || group.rateMode === 'auto'
                ? t('logistic.card.rateAuto')
                : t('logistic.card.rateManual')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Group paid LogisticListItems by pmtNo into PaymentGroups.
 */
export function groupByPaymentNo(items: LogisticListItem[]): PaymentGroup[] {
  const map = new Map<string, LogisticListItem[]>();

  for (const item of items) {
    const key = item.pmtNo || item.paymentDate || 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const groups: PaymentGroup[] = [];
  for (const [pmtNo, groupItems] of map) {
    // Aggregate amounts from parent items only (children are sub-shipments of parents)
    let totalFreightRmb = 0;
    let totalFreightUsd = 0;
    let totalPaidRmb = 0;
    let extraPaid = 0;
    let extraCurrency = 'RMB';
    let extraPaidUsd = 0;
    let settlementRate = 0;
    let rateMode = 'M';
    let paymentDate: string | null = null;
    let isDeleted = false;
    let rateCount = 0;

    for (const item of groupItems) {
      totalFreightRmb += item.totalPriceRmb;
      totalFreightUsd += item.totalPriceUsd;
      totalPaidRmb += item.logisticPaid;

      if (item.extraPaid > 0) {
        extraPaid += item.extraPaid;
        extraCurrency = item.extraCurrency;
        extraPaidUsd += item.extraPaidUsd;
      }
      if (item.usdRmb > 0) {
        settlementRate += item.usdRmb;
        rateCount++;
      }
      if (item.rateMode) rateMode = item.rateMode;
      if (item.paymentDate) paymentDate = item.paymentDate;
      if (item.isDeleted) isDeleted = true;
    }

    // Average rate if multiple items
    if (rateCount > 0) settlementRate = settlementRate / rateCount;

    const totalWithExtraRmb = totalPaidRmb + (extraCurrency === 'RMB' ? extraPaid : extraPaid * settlementRate);
    const totalWithExtraUsd = settlementRate > 0
      ? totalPaidRmb / settlementRate + extraPaidUsd
      : 0;

    groups.push({
      pmtNo,
      paymentDate,
      items: groupItems,
      totalFreightRmb,
      totalFreightUsd,
      totalPaidRmb,
      extraPaid,
      extraCurrency,
      extraPaidUsd,
      totalWithExtraRmb,
      totalWithExtraUsd,
      settlementRate,
      rateMode,
      isDeleted,
    });
  }

  // Sort by pmtNo descending (most recent first)
  groups.sort((a, b) => b.pmtNo.localeCompare(a.pmtNo));

  return groups;
}
