'use client';

import { useState, useMemo } from 'react';
import type { POPaymentListItem, POPaymentDetail } from '@/lib/api/finance';
import { themeColors } from '@/contexts/ThemeContext';
import { paymentStatusStyle, hexToRgba } from '@/lib/status-colors';

// ── Types ────────────────────────────────────────

interface POPaymentTableProps {
  items: POPaymentListItem[];
  mode: 'unpaid' | 'paid';
  selectedPoNums: string[];
  onSelectionChange: (poNums: string[]) => void;
  onViewDetail: (item: POPaymentListItem, pmtNo: string) => void;
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
  items: POPaymentListItem[];
}

// ── Helpers ──────────────────────────────────────

const fmtAmt = (val: number) =>
  val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';

function groupBySupplier(items: POPaymentListItem[]): SupplierGroup[] {
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

function depositStatusBadge(status: string, t: POPaymentTableProps['t'], colors: (typeof themeColors)['dark']) {
  const style = paymentStatusStyle(status, colors);
  switch (status) {
    case 'paid':
      return { label: t('poPayment.status.paid'), bg: style.bg, color: style.color };
    case 'partial':
      return { label: t('poPayment.status.partial'), bg: style.bg, color: style.color };
    case 'not_required':
      return { label: t('poPayment.status.not_required'), bg: style.bg, color: style.color };
    case 'unpaid':
    default:
      return { label: t('poPayment.status.unpaid'), bg: style.bg, color: style.color };
  }
}

// ── Table Header ──────────────────────────

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

export default function POPaymentTable({
  items, mode, selectedPoNums, onSelectionChange,
  onViewDetail, onDeletePayment, onPoRowClick, t, theme,
  isLoading, error, onRetry,
  sortField, sortOrder, onSort,
}: POPaymentTableProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;
  const groups = useMemo(() => groupBySupplier(items), [items]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div
          className="w-7 h-7 border-2 rounded-full animate-spin"
          style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
        />
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          {t('poPayment.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <svg className="w-8 h-8" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          {error.message || 'Failed to load PO payment data'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="h-8 px-4 text-xs font-medium rounded-lg transition-opacity hover:opacity-80"
            style={{ backgroundColor: colors.blue, color: '#fff' }}
          >
            {t('poPayment.retry')}
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ color: colors.textSecondary }}>{t('poPayment.noData')}</p>
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
//  UNPAID VIEW
// ═════════════════════════════════════════════════

interface UnpaidViewProps {
  groups: SupplierGroup[];
  colors: (typeof themeColors)['dark'];
  selectedPoNums: string[];
  onSelectionChange: (poNums: string[]) => void;
  onPoRowClick?: (poNum: string) => void;
  t: POPaymentTableProps['t'];
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

function UnpaidView({ groups, colors, selectedPoNums, onSelectionChange, onPoRowClick, t, sortField, sortOrder, onSort }: UnpaidViewProps) {
  const selectedSupplier = useMemo(() => {
    if (selectedPoNums.length === 0) return null;
    const first = groups.find(g => g.items.some(i => selectedPoNums.includes(i.poNum)));
    return first?.supplierCode ?? null;
  }, [selectedPoNums, groups]);

  const handleTogglePo = (poNum: string, supplierCode: string) => {
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
      .filter(i => !i.isPaid && !i.paymentBlocked && (i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'))
      .map(i => i.poNum);
    if (checked) {
      onSelectionChange(selectableNums);
    } else {
      onSelectionChange([]);
    }
  };

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const selectableNums = group.items
          .filter(i => !i.isPaid && !i.paymentBlocked && (i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'))
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
            {/* Supplier Header */}
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}50` }} className="border-b">
                    <th className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={isDisabledGroup && selectedPoNums.length > 0}
                        onChange={(e) => handleSelectAllSupplier(group, e.target.checked)}
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                        style={{ accentColor: colors.blue }}
                      />
                    </th>
                    <TH color={colors.textSecondary} sortable sorted={sortField === 'po_num'} sortOrder={sortOrder} onClick={() => onSort?.('po_num')}>{t('poPayment.table.poNum')}</TH>
                    <TH color={colors.textSecondary} sortable sorted={sortField === 'po_date'} sortOrder={sortOrder} onClick={() => onSort?.('po_date')}>{t('poPayment.table.poDate')}</TH>
                    <TH color={colors.textSecondary} align="text-center">{t('poPayment.table.skuCount')}</TH>
                    <TH color={colors.textSecondary} align="text-right" sortable sorted={sortField === 'total_amount'} sortOrder={sortOrder} onClick={() => onSort?.('total_amount')}>{t('poPayment.table.totalAmount')}</TH>
                    <TH color={colors.textSecondary} align="text-center">{t('poPayment.table.depositStatus')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.depositPaid')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.poPaid')}</TH>
                    <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.balanceRemaining')}</TH>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, idx) => {
                    const isSelectable = !item.isPaid && !item.paymentBlocked && (item.paymentStatus === 'unpaid' || item.paymentStatus === 'partial');
                    const isSelected = selectedPoNums.includes(item.poNum);
                    const depBadge = depositStatusBadge(item.depositStatus, t, colors);

                    return (
                      <tr
                        key={item.poNum}
                        style={{ borderColor: colors.border, cursor: item.paymentBlocked ? 'not-allowed' : 'pointer' }}
                        className={`${idx !== group.items.length - 1 ? 'border-b' : ''} transition-colors hover:opacity-80`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                          if (!item.paymentBlocked) onPoRowClick?.(item.poNum);
                        }}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3 text-center">
                          {isSelectable ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabledGroup && !isSelected}
                              onChange={() => handleTogglePo(item.poNum, group.supplierCode)}
                              className="w-3.5 h-3.5 rounded cursor-pointer"
                              style={{ accentColor: colors.blue }}
                            />
                          ) : item.paymentBlocked ? (
                            <span title={t('poPayment.diffBlocked')} className="text-xs" style={{ color: colors.red }}>
                              !
                            </span>
                          ) : null}
                        </td>

                        {/* PO Num + Warning badges */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                              {item.poNum}
                            </span>
                            {item.hasUnresolvedDiff && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: hexToRgba(colors.red, 0.12), color: colors.red }}
                                title={t('poPayment.diffBlocked')}
                              >
                                Diff
                              </span>
                            )}
                            {item.fluctuationTriggered && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: hexToRgba(colors.yellow, 0.12), color: colors.yellow }}
                                title={`${t('poPayment.floatTriggered')}: $${fmtAmt(item.adjustedBalanceUsd)}`}
                              >
                                Float
                              </span>
                            )}
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

                        {/* Total Amount (USD) */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="font-mono text-sm tabular-nums" style={{ color: colors.teal }}>
                            ${fmtAmt(item.totalAmountUsd)}
                          </span>
                        </td>

                        {/* Deposit Status Badge */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: depBadge.bg, color: depBadge.color }}
                          >
                            {depBadge.label}
                          </span>
                        </td>

                        {/* Deposit Paid */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            style={{ color: item.depositPaidUsd > 0 ? colors.green : colors.textTertiary }}
                            className="text-sm font-mono tabular-nums"
                          >
                            {item.depositPaidUsd > 0 ? `$${fmtAmt(item.depositPaidUsd)}` : '—'}
                          </span>
                        </td>

                        {/* PO Paid */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            style={{ color: item.poPaidUsd > 0 ? colors.green : colors.textTertiary }}
                            className="text-sm font-mono tabular-nums"
                          >
                            {item.poPaidUsd > 0 ? `$${fmtAmt(item.poPaidUsd)}` : '—'}
                          </span>
                        </td>

                        {/* Balance Remaining */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            style={{ color: item.balanceRemainingUsd > 0 ? colors.orange : colors.textTertiary }}
                            className="text-sm font-mono tabular-nums"
                          >
                            {item.balanceRemainingUsd > 0 ? `$${fmtAmt(item.balanceRemainingUsd)}` : '—'}
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
//  PAID VIEW — Supplier-grouped cards (same layout as UnpaidView)
// ═════════════════════════════════════════════════

interface PaidViewProps {
  groups: SupplierGroup[];
  colors: (typeof themeColors)['dark'];
  onViewDetail: (item: POPaymentListItem, pmtNo: string) => void;
  onDeletePayment: (pmtNo: string) => void;
  onPoRowClick?: (poNum: string) => void;
  t: POPaymentTableProps['t'];
}

function PaidView({ groups, colors, onViewDetail, onDeletePayment, onPoRowClick, t }: PaidViewProps) {

  const getFirstPmtNo = (details: POPaymentDetail[]) =>
    details.length > 0 ? details[0].pmtNo : '';

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div
          key={group.supplierCode}
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-xl border overflow-hidden"
        >
          {/* Supplier Header */}
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

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}50` }} className="border-b">
                  <TH color={colors.textSecondary}>{t('poPayment.table.poNum')}</TH>
                  <TH color={colors.textSecondary}>{t('poPayment.table.poDate')}</TH>
                  <TH color={colors.textSecondary} align="text-center">{t('poPayment.table.skuCount')}</TH>
                  <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.totalAmount')}</TH>
                  <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.poPaid')}</TH>
                  <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.balanceRemaining')}</TH>
                  <TH color={colors.textSecondary}>{t('poPayment.table.latestPaymentDate')}</TH>
                  <TH color={colors.textSecondary} align="text-right">{t('poPayment.table.extraFees')}</TH>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, idx) => {
                  const pmtNo = getFirstPmtNo(item.paymentDetails);
                  const hasExtra = item.extraFeesUsd > 0 || item.extraFeesRmb > 0;

                  return (
                    <tr
                      key={item.poNum}
                      style={{ borderColor: colors.border, cursor: 'pointer' }}
                      className={`${idx !== group.items.length - 1 ? 'border-b' : ''} transition-colors hover:opacity-80`}
                      onClick={() => onPoRowClick?.(item.poNum)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span style={{ color: colors.blue }} className="font-mono text-sm font-semibold">
                          {item.poNum}
                        </span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                        {item.poDate}
                      </td>
                      <td style={{ color: colors.text }} className="py-3 px-4 text-sm text-center whitespace-nowrap tabular-nums">
                        {item.skuCount}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-mono text-sm tabular-nums" style={{ color: colors.teal }}>
                          ${fmtAmt(item.totalAmountUsd)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.green }} className="text-sm font-mono font-medium tabular-nums">
                          ${fmtAmt(item.poPaidUsd)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.textSecondary }} className="text-sm font-mono tabular-nums">
                          ${fmtAmt(item.balanceRemainingUsd)}
                        </span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-3 px-4 text-sm font-mono whitespace-nowrap">
                        {item.latestPaymentDate !== '-' ? item.latestPaymentDate : '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hasExtra ? (
                          <span className="font-mono text-sm tabular-nums" style={{ color: colors.teal }}>
                            ${fmtAmt(item.extraFeesUsd)}
                          </span>
                        ) : (
                          <span style={{ color: colors.textTertiary }} className="text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
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
