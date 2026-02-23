'use client';

import { useState, useMemo } from 'react';
import type { DepositListItem, DepositPaymentDetail } from '@/lib/api';
import { themeColors } from '@/contexts/ThemeContext';

// ── Types ────────────────────────────────────────

interface DepositTableProps {
  items: DepositListItem[];
  mode: 'unpaid' | 'paid';
  selectedPoNums: string[];
  onSelectionChange: (poNums: string[]) => void;
  onViewDetail: (item: DepositListItem, pmtNo: string) => void;
  onDeletePayment: (pmtNo: string) => void;
  onPoRowClick?: (poNum: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  theme: string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

interface SupplierGroup {
  supplierCode: string;
  supplierName: string;
  items: DepositListItem[];
}

// ── Helpers ──────────────────────────────────────

const fmtAmt = (val: number) =>
  val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });

/** Currency code → symbol */
const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';
function groupBySupplier(items: DepositListItem[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const item of items) {
    let group = map.get(item.supplierCode);
    if (!group) {
      group = { supplierCode: item.supplierCode, supplierName: item.supplierName, items: [] };
      map.set(item.supplierCode, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
}

// ── Status Badges ────────────────────────────────

function statusBadge(status: string, t: DepositTableProps['t']) {
  switch (status) {
    case 'partial':
      return {
        label: t('deposit.status.partial'),
        bg: 'rgba(100,210,255,0.12)',
        color: '#64d2ff',
        dot: '#64d2ff',
        ring: 'rgba(100,210,255,0.3)',
        pulse: false,
      };
    case 'paid':
      return {
        label: t('deposit.status.paid'),
        bg: 'rgba(48,209,88,0.12)',
        color: '#30d158',
        dot: '#30d158',
        ring: 'rgba(48,209,88,0.3)',
        pulse: false,
      };
    case 'unpaid':
    default:
      return {
        label: t('deposit.status.unpaid'),
        bg: 'rgba(255,159,10,0.12)',
        color: '#ff9f0a',
        dot: '#ff9f0a',
        ring: 'rgba(255,159,10,0.3)',
        pulse: true,
      };
  }
}

// ── Rate Source Badge ────────────────────────────

function RateSourceBadge({ code, label }: { code: string; label: string }) {
  const isAuto = code === 'AUTO';
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: isAuto ? 'rgba(10,132,255,0.14)' : 'rgba(142,142,147,0.14)',
        color: isAuto ? '#0a84ff' : '#8e8e93',
      }}
    >
      {label}
    </span>
  );
}

// ── Dual-Currency Amount Badge ───────────────────

function DualAmount({ usd, rmb }: { usd: number; rmb: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm tabular-nums" style={{ color: '#64d2ff' }}>
        ${fmtAmt(usd)}
      </span>
      <span className="font-mono text-[11px] tabular-nums" style={{ color: '#ffd60a' }}>
        ¥{fmtAmt(rmb)}
      </span>
    </span>
  );
}

// ── Static Table Header ──────────────────────────

function TH({ children, align = 'text-left', color, sortable, sorted, sortOrder, onClick }: {
  children: React.ReactNode; align?: string; color: string;
  sortable?: boolean; sorted?: boolean; sortOrder?: 'asc' | 'desc'; onClick?: () => void;
}) {
  return (
    <th
      style={{ color }}
      className={`${align} py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap ${sortable ? 'cursor-pointer select-none hover:opacity-80 transition-opacity' : ''}`}
      onClick={sortable ? onClick : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && sorted && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {sortOrder === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
        )}
      </span>
    </th>
  );
}

// ═════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════

export default function DepositTable({
  items, mode, selectedPoNums, onSelectionChange,
  onViewDetail, onDeletePayment, onPoRowClick, t, theme,
  isLoading, error, onRetry,
  sortField, sortOrder, onSort,
}: DepositTableProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;
  const groups = useMemo(() => groupBySupplier(items), [items]);

  // Loading state — match POTable skeleton pattern
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div
          className="w-7 h-7 border-2 rounded-full animate-spin"
          style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
        />
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          {t('deposit.loading')}
        </p>
      </div>
    );
  }

  // Error state — match POTable retry pattern
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <svg className="w-8 h-8" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          {error.message || 'Failed to load deposit data'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="h-8 px-4 text-xs font-medium rounded-lg transition-opacity hover:opacity-80"
            style={{ backgroundColor: colors.blue, color: '#fff' }}
          >
            {t('deposit.retry')}
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('deposit.noData')}</p>
      </div>
    );
  }

  if (mode === 'unpaid') {
    return (
      <UnpaidView
        groups={groups}
        colors={colors}
        selectedPoNums={selectedPoNums}
        onSelectionChange={onSelectionChange}
        onPoRowClick={onPoRowClick}
        t={t}
        sortField={sortField}
        sortOrder={sortOrder}
        onSort={onSort}
      />
    );
  }

  return (
    <PaidView
      groups={groups}
      colors={colors}
      onViewDetail={onViewDetail}
      onDeletePayment={onDeletePayment}
      onPoRowClick={onPoRowClick}
      t={t}
    />
  );
}

// ═════════════════════════════════════════════════
//  UNPAID VIEW — Supplier-grouped cards
// ═════════════════════════════════════════════════

interface UnpaidViewProps {
  groups: SupplierGroup[];
  colors: (typeof themeColors)['dark'];
  selectedPoNums: string[];
  onSelectionChange: (poNums: string[]) => void;
  onPoRowClick?: (poNum: string) => void;
  t: DepositTableProps['t'];
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

function UnpaidView({ groups, colors, selectedPoNums, onSelectionChange, onPoRowClick, t, sortField, sortOrder, onSort }: UnpaidViewProps) {
  // Determine which supplier is currently selected (only one at a time)
  const selectedSupplier = useMemo(() => {
    if (selectedPoNums.length === 0) return null;
    const first = groups.find(g => g.items.some(i => selectedPoNums.includes(i.poNum)));
    return first?.supplierCode ?? null;
  }, [selectedPoNums, groups]);

  const handleTogglePo = (poNum: string, supplierCode: string) => {
    // If selecting from a different supplier, reset to just this PO
    if (selectedSupplier && selectedSupplier !== supplierCode) {
      onSelectionChange([poNum]);
      return;
    }
    if (selectedPoNums.includes(poNum)) {
      onSelectionChange(selectedPoNums.filter(n => n !== poNum));
    } else {
      onSelectionChange([...selectedPoNums, poNum]);
    }
  };

  const handleSelectAllSupplier = (group: SupplierGroup, checked: boolean) => {
    const selectableNums = group.items
      .filter(i => !i.isPaid && (i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'))
      .map(i => i.poNum);
    if (checked) {
      // Replace selection with all from this supplier
      onSelectionChange(selectableNums);
    } else {
      onSelectionChange([]);
    }
  };

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const selectableNums = group.items
          .filter(i => !i.isPaid && (i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'))
          .map(i => i.poNum);
        const selectedInGroup = selectableNums.filter(n => selectedPoNums.includes(n));
        const allSelected = selectableNums.length > 0 && selectedInGroup.length === selectableNums.length;
        const isDisabledGroup = selectedSupplier !== null && selectedSupplier !== group.supplierCode;

        return (
          <div
            key={group.supplierCode}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              opacity: isDisabledGroup ? 0.45 : 1,
            }}
            className="rounded-xl border overflow-hidden transition-opacity"
          >
            {/* ── Supplier Header ── */}
            <div
              style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }}
              className="flex items-center justify-between px-4 py-3 border-b"
            >
              <div className="flex items-center gap-2">
                <span style={{ color: colors.text }} className="text-sm font-semibold">
                  {group.supplierName}
                </span>
                <span
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${colors.blue}18`, color: colors.blue }}
                >
                  {group.supplierCode}
                </span>
              </div>
              <span style={{ color: colors.textTertiary }} className="text-xs">
                {group.items.length} PO{group.items.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}50` }} className="border-b">
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={isDisabledGroup && selectedPoNums.length > 0}
                        onChange={(e) => handleSelectAllSupplier(group, e.target.checked)}
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                        style={{ accentColor: colors.blue }}
                      />
                    </th>
                    <TH color={colors.textSecondary} sortable sorted={sortField === 'po_num'} sortOrder={sortOrder} onClick={() => onSort?.('po_num')}>{t('deposit.table.poNum')}</TH>
                    <TH color={colors.textSecondary} sortable sorted={sortField === 'po_date'} sortOrder={sortOrder} onClick={() => onSort?.('po_date')}>{t('deposit.table.poDate')}</TH>
                    <TH color={colors.textSecondary} align="text-center">{t('deposit.table.skuCount')}</TH>
                    <TH color={colors.textSecondary} align="text-right" sortable sorted={sortField === 'total_amount'} sortOrder={sortOrder} onClick={() => onSort?.('total_amount')}>{t('deposit.table.totalAmount')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('deposit.table.depositRate')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('deposit.table.depositAmount')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('deposit.table.paidDeposit')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('deposit.table.depositPending')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('deposit.table.balanceRemaining')}</TH>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, idx) => {
                    const isSelectable = !item.isPaid && (item.paymentStatus === 'unpaid' || item.paymentStatus === 'partial');
                    const isSelected = selectedPoNums.includes(item.poNum);

                    return (
                      <tr
                        key={item.poNum}
                        style={{ borderColor: colors.border, cursor: 'pointer' }}
                        className={`${idx !== group.items.length - 1 ? 'border-b' : ''} transition-colors hover:opacity-80`}
                        onClick={(e) => {
                          // Don't trigger row click if clicking checkbox
                          if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                          onPoRowClick?.(item.poNum);
                        }}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3 text-center w-10">
                          {isSelectable && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabledGroup && !isSelected}
                              onChange={() => handleTogglePo(item.poNum, group.supplierCode)}
                              className="w-3.5 h-3.5 rounded cursor-pointer"
                              style={{ accentColor: colors.blue }}
                            />
                          )}
                        </td>

                        {/* PO Num */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                            {item.poNum}
                          </span>
                        </td>

                        {/* PO Date */}
                        <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                          {item.poDate}
                        </td>

                        {/* SKU Count */}
                        <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap tabular-nums">
                          {item.skuCount}
                        </td>

                        {/* Total Amount (USD only) */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="font-mono text-sm tabular-nums" style={{ color: '#64d2ff' }}>
                            ${fmtAmt(item.totalAmountUsd)}
                          </span>
                        </td>



                        {/* Deposit Rate % */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span style={{ color: colors.purple }} className="text-sm font-mono font-medium tabular-nums">
                            {item.depositPar}%
                          </span>
                        </td>

                        {/* Deposit Amount */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span style={{ color: colors.text }} className="text-sm font-mono font-medium tabular-nums">
                            {curSym(item.curCurrency)}{fmtAmt(item.depositAmount)}
                          </span>
                        </td>

                        {/* Paid Deposit */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            style={{ color: item.actualPaid > 0 ? '#30d158' : colors.textTertiary }}
                            className="text-sm font-mono tabular-nums"
                          >
                            {item.actualPaid > 0 ? `$${fmtAmt(item.actualPaid)}` : '—'}
                          </span>
                        </td>

                        {/* Deposit Pending */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            style={{ color: item.depositPending > 0 ? '#ff9f0a' : colors.textTertiary }}
                            className="text-sm font-mono tabular-nums"
                          >
                            {item.depositPending > 0 ? `$${fmtAmt(item.depositPending)}` : '—'}
                          </span>
                        </td>

                        {/* Balance Remaining */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span style={{ color: colors.textSecondary }} className="text-sm font-mono tabular-nums">
                            ${fmtAmt(item.balanceRemaining)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════
//  PAID VIEW — Sidebar + Table with expandable rows
// ═════════════════════════════════════════════════

interface PaidViewProps {
  groups: SupplierGroup[];
  colors: (typeof themeColors)['dark'];
  onViewDetail: (item: DepositListItem, pmtNo: string) => void;
  onDeletePayment: (pmtNo: string) => void;
  onPoRowClick?: (poNum: string) => void;
  t: DepositTableProps['t'];
}

function PaidView({ groups, colors, onViewDetail, onDeletePayment, onPoRowClick, t }: PaidViewProps) {
  const [activeSupplier, setActiveSupplier] = useState<string>(groups[0]?.supplierCode ?? '');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const activeGroup = groups.find(g => g.supplierCode === activeSupplier);

  const toggleExpand = (poNum: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(poNum)) next.delete(poNum);
      else next.add(poNum);
      return next;
    });
  };

  // Collect unique pmtNos from a payment detail list for action routing
  const getFirstPmtNo = (details: DepositPaymentDetail[]) =>
    details.length > 0 ? details[0].pmtNo : '';

  return (
    <div className="flex gap-0 rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
      {/* ── Left Sidebar: Supplier Filter ── */}
      <div
        className="w-[20%] min-w-[200px] shrink-0 overflow-y-auto border-r"
        style={{
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
          maxHeight: '75vh',
        }}
      >
        <div
          className="px-3 py-2.5 border-b"
          style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }}
        >
          <span style={{ color: colors.textSecondary }} className="text-xs font-medium uppercase tracking-wider">
            {t('deposit.sidebar.suppliers')}
          </span>
        </div>
        {groups.map(group => {
          const isActive = group.supplierCode === activeSupplier;
          const paidCount = group.items.filter(i => i.isPaid).length;
          return (
            <button
              key={group.supplierCode}
              onClick={() => { setActiveSupplier(group.supplierCode); setExpandedRows(new Set()); }}
              className="w-full text-left px-3 py-2.5 border-b transition-colors"
              style={{
                borderColor: colors.border,
                backgroundColor: isActive ? `${colors.blue}14` : 'transparent',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: isActive ? colors.blue : colors.text }}
                  >
                    {group.supplierName}
                  </div>
                  <div className="text-[11px] font-mono" style={{ color: colors.textTertiary }}>
                    {group.supplierCode}
                  </div>
                </div>
                <span
                  className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-2 tabular-nums"
                  style={{
                    backgroundColor: isActive ? `${colors.blue}22` : `${colors.gray}18`,
                    color: isActive ? colors.blue : colors.textSecondary,
                  }}
                >
                  {paidCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Right Content: Paid PO Table ── */}
      <div className="flex-1 min-w-0 overflow-x-auto" style={{ backgroundColor: colors.bgSecondary }}>
        {!activeGroup || activeGroup.items.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p style={{ color: colors.textSecondary }}>{t('deposit.noData')}</p>
          </div>
        ) : (
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
                <TH color={colors.textSecondary}>{t('deposit.table.poNum')}</TH>
                <TH color={colors.textSecondary}>{t('deposit.table.poDate')}</TH>
                <TH color={colors.textSecondary} align="text-center">{t('deposit.table.skuCount')}</TH>
                <TH color={colors.textSecondary} align="text-right">{t('deposit.table.totalAmount')}</TH>
                <TH color={colors.textSecondary} align="text-right">{t('deposit.table.depositAmount')}</TH>
                <TH color={colors.textSecondary} align="text-right">{t('deposit.table.actualPaid')}</TH>
                <TH color={colors.textSecondary}>{t('deposit.table.latestPaymentDate')}</TH>
                <TH color={colors.textSecondary} align="text-right">{t('deposit.table.extraFees')}</TH>
                <TH color={colors.textSecondary} align="text-center">{t('deposit.table.actions')}</TH>
              </tr>
            </thead>
            <tbody>
              {activeGroup.items.map((item, idx) => {
                const isExpanded = expandedRows.has(item.poNum);
                const pmtNo = getFirstPmtNo(item.paymentDetails);

                return (
                  <PaidRow
                    key={item.poNum}
                    item={item}
                    pmtNo={pmtNo}
                    isExpanded={isExpanded}
                    isLast={idx === activeGroup.items.length - 1}
                    colors={colors}
                    t={t}
                    onToggle={() => toggleExpand(item.poNum)}
                    onViewDetail={onViewDetail}
                    onDeletePayment={onDeletePayment}
                    onPoRowClick={onPoRowClick}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Paid Row (expandable) ────────────────────────

interface PaidRowProps {
  item: DepositListItem;
  pmtNo: string;
  isExpanded: boolean;
  isLast: boolean;
  colors: (typeof themeColors)['dark'];
  t: DepositTableProps['t'];
  onToggle: () => void;
  onViewDetail: (item: DepositListItem, pmtNo: string) => void;
  onDeletePayment: (pmtNo: string) => void;
  onPoRowClick?: (poNum: string) => void;
}

function PaidRow({ item, pmtNo, isExpanded, isLast, colors, t, onToggle, onViewDetail, onDeletePayment, onPoRowClick }: PaidRowProps) {
  const hasDetails = item.paymentDetails.length > 0;
  const hasExtra = item.extraFeesUsd > 0 || item.extraFeesRmb > 0;

  return (
    <>
      <tr
        style={{ borderColor: colors.border, cursor: 'pointer' }}
        className={`${!isLast || isExpanded ? 'border-b' : ''} transition-colors hover:opacity-80`}
        onClick={() => onPoRowClick?.(item.poNum)}
      >
        {/* PO Num + Chevron */}
        <td className="py-3 px-4 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {hasDetails && (
              <svg
                className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                style={{ color: colors.textTertiary }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
              {item.poNum}
            </span>
          </div>
        </td>

        {/* PO Date */}
        <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
          {item.poDate}
        </td>

        {/* SKU Count */}
        <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap tabular-nums">
          {item.skuCount}
        </td>

        {/* Total Amount (USD only) */}
        <td className="py-3 px-4 text-right whitespace-nowrap">
          <span className="font-mono text-sm tabular-nums" style={{ color: '#64d2ff' }}>
            ${fmtAmt(item.totalAmountUsd)}
          </span>
        </td>

        {/* Deposit Amount */}
        <td className="py-3 px-4 text-right whitespace-nowrap">
          <span style={{ color: colors.text }} className="text-sm font-mono font-medium tabular-nums">
            {curSym(item.curCurrency)}{fmtAmt(item.depositAmount)}
          </span>
        </td>

        {/* Actual Paid */}
        <td className="py-3 px-4 text-right whitespace-nowrap">
          <span style={{ color: '#30d158' }} className="text-sm font-mono font-medium tabular-nums">
            ${fmtAmt(item.actualPaid)}
          </span>
        </td>

        {/* Latest Payment Date */}
        <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
          {item.latestPaymentDate !== '-' ? item.latestPaymentDate : '—'}
        </td>

        {/* Extra Fees */}
        <td className="py-3 px-4 text-right whitespace-nowrap">
          {hasExtra ? (
            <span className="font-mono text-sm tabular-nums" style={{ color: '#64d2ff' }}>
              ${fmtAmt(item.extraFeesUsd)}
            </span>
          ) : (
            <span style={{ color: colors.textTertiary }} className="text-sm">—</span>
          )}
        </td>

        {/* Actions */}
        <td className="py-3 px-4 whitespace-nowrap">
          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* History */}
            <ActionButton
              title={t('deposit.actions.history')}
              color={colors.blue}
              onClick={() => onViewDetail(item, pmtNo)}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </ActionButton>

            {/* Orders */}
            <ActionButton
              title={t('deposit.actions.orders')}
              color={colors.teal}
              onClick={() => onViewDetail(item, pmtNo)}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </ActionButton>

            {/* Files */}
            <ActionButton
              title={t('deposit.actions.files')}
              color={colors.orange}
              onClick={() => onViewDetail(item, pmtNo)}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </ActionButton>

            {/* Delete */}
            {pmtNo && (
              <ActionButton
                title={t('deposit.actions.delete')}
                color="#ff453a"
                onClick={() => onDeletePayment(pmtNo)}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </ActionButton>
            )}
          </div>
        </td>
      </tr>

      {/* ── Expanded: Payment Details ── */}
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={9} style={{ backgroundColor: `${colors.bg}60` }}>
            <div className="px-8 py-3">
              <table className="w-full">
                <thead>
                  <tr style={{ borderColor: colors.border }} className="border-b">
                    <TH color={colors.textTertiary}>{t('deposit.detail.pmtNo')}</TH>
                    <TH color={colors.textTertiary}>{t('deposit.detail.depDate')}</TH>
                    <TH color={colors.textTertiary}>{t('deposit.detail.depCur')}</TH>
                    <TH color={colors.textTertiary} align="text-right">{t('deposit.detail.depPaid')}</TH>
                    <TH color={colors.textTertiary} align="text-right">{t('deposit.detail.depPaidCur')}</TH>
                    <TH color={colors.textTertiary} align="text-right">{t('deposit.detail.depPrepayAmount')}</TH>
                    <TH color={colors.textTertiary} align="text-center">{t('deposit.detail.depOverride')}</TH>
                    <TH color={colors.textTertiary} align="text-right">{t('deposit.detail.extraAmount')}</TH>
                  </tr>
                </thead>
                <tbody>
                  {item.paymentDetails.map((det, dIdx) => (
                    <tr
                      key={det.pmtNo + '-' + dIdx}
                      style={{ borderColor: colors.border }}
                      className={dIdx !== item.paymentDetails.length - 1 ? 'border-b' : ''}
                    >
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span style={{ color: '#30d158' }} className="font-mono text-xs font-semibold">
                          {det.pmtNo}
                        </span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono whitespace-nowrap">
                        {det.depDate}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: det.depCur === 'USD' ? 'rgba(100,210,255,0.14)' : 'rgba(255,214,10,0.14)',
                            color: det.depCur === 'USD' ? '#64d2ff' : '#ffd60a',
                          }}
                        >
                          {curSym(det.depCur)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.text }} className="font-mono text-xs tabular-nums">
                          {curSym(det.depCur)}{fmtAmt(det.depPaid)}
                        </span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono text-right whitespace-nowrap tabular-nums">
                        {curSym(det.depCur)}{fmtAmt(det.depPaidCur)}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span
                          style={{ color: det.depPrepayAmount > 0 ? colors.purple : colors.textTertiary }}
                          className="font-mono text-xs tabular-nums"
                        >
                          {det.depPrepayAmount > 0 ? `$${fmtAmt(det.depPrepayAmount)}` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center whitespace-nowrap">
                        {det.depOverride === 1 ? (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}
                          >
                            Override
                          </span>
                        ) : (
                          <span style={{ color: colors.textTertiary }} className="text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        {det.extraAmount > 0 ? (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.orange }}>
                            {curSym(det.extraCur)}{fmtAmt(det.extraAmount)}
                          </span>
                        ) : (
                          <span style={{ color: colors.textTertiary }} className="text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Small Action Button ──────────────────────────

function ActionButton({
  title, color, onClick, children,
}: {
  title: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
    >
      <svg
        className="w-3.5 h-3.5"
        style={{ color }}
        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
      >
        {children}
      </svg>
    </button>
  );
}
