'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { financeApi, type FlowOrderItem, type FlowDetailResponse } from '@/lib/api/finance';
import { hexToRgba } from '@/lib/status-colors';
import { animate } from 'animejs';
import FinanceTabSelector from '../components/FinanceTabSelector';

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════
type ViewMode = 'list' | 'detail';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════
const fmtNum = (v: number, d = 2) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });


/**
 * Flow Overview Page
 * V1 parity: backend/templates/finance/pages/flow.html
 *
 * Design: Apple-style 2-level slide-in navigation.
 *   Level 1: Main table (all POs with full lifecycle data)
 *   Level 2: Detail panel (slide-in: per-PO logistics block-level SKU breakdown)
 */
export default function FlowPage() {
  const t = useTranslations('finance');
  const { theme } = useTheme();
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // ═══════════ Filters ═══════════
  const [search, setSearch] = useState('');

  // ═══════════ 2-level navigation state ═══════════
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedOrder, setSelectedOrder] = useState<FlowOrderItem | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ═══════════ Sort ═══════════
  const [sortField, setSortField] = useState<string>('poNum');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setIsClient(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        // ignore
      }
    }
  }, []);

  // ═══════════ Data Fetching ═══════════
  const { data: flowData, isLoading, refetch } = useQuery({
    queryKey: ['flowList'],
    queryFn: () => financeApi.getFlowList(),
    enabled: isClient && !!currentUser,
  });

  // ═══════════ Detail Fetching ═══════════
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['flowDetail', selectedOrder?.poNum],
    queryFn: () => financeApi.getFlowDetail(selectedOrder!.poNum),
    enabled: viewMode === 'detail' && !!selectedOrder,
  });

  // Client-side search + sort
  const filteredOrders = useMemo(() => {
    const list = flowData?.data || [];
    let result = list;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.poNum.toLowerCase().includes(q) ||
          o.logisticsList.some((l) => l.toLowerCase().includes(q))
      );
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'poNum': cmp = a.poNum.localeCompare(b.poNum); break;
        case 'poDate': cmp = a.poDate.localeCompare(b.poDate); break;
        case 'totalAmount': cmp = a.totalAmount - b.totalAmount; break;
        case 'balanceRemaining': cmp = a.balanceRemaining - b.balanceRemaining; break;
        case 'orderTotalCost': cmp = a.totalCost - b.totalCost; break;
        default: cmp = a.poNum.localeCompare(b.poNum);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [flowData, search, sortField, sortOrder]);

  const totalCount = flowData?.data?.length ?? 0;

  // ═══════════ Sort Handler ═══════════
  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  // ═══════════ Slide Animation Helpers ═══════════
  const slideForward = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, {
        translateX: [0, -window.innerWidth],
        opacity: [1, 0],
        duration: 350,
        ease: 'inOut(3)',
      });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, {
            translateX: [window.innerWidth, 0],
            opacity: [0, 1],
            duration: 350,
            ease: 'inOut(3)',
          });
        }
      });
    }, 300);
  }, []);

  const slideBack = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, {
        translateX: [0, window.innerWidth],
        opacity: [1, 0],
        duration: 350,
        ease: 'inOut(3)',
      });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, {
            translateX: [-window.innerWidth, 0],
            opacity: [0, 1],
            duration: 350,
            ease: 'inOut(3)',
          });
        }
      });
    }, 300);
  }, []);

  // ═══════════ Navigation ═══════════
  const handleRowClick = useCallback(
    (order: FlowOrderItem) => {
      slideForward(() => {
        setSelectedOrder(order);
        setViewMode('detail');
      });
    },
    [slideForward]
  );

  const handleBackToList = useCallback(() => {
    slideBack(() => {
      setViewMode('list');
      setSelectedOrder(null);
    });
  }, [slideBack]);

  // ═══════════ Filter Handlers ═══════════
  const handleClearFilters = () => {
    setSearch('');
  };

  // ═══════════ Render Guards ═══════════
  if (!isClient) return null;

  return (
    <div
      style={{ backgroundColor: colors.bg }}
      className="min-h-screen pb-20 overflow-x-hidden"
      onClick={viewMode === 'detail' ? handleBackToList : undefined}
    >
      {/* FinanceTabSelector — only on list view */}
      {viewMode === 'list' && (
        <section className="pt-12 pb-6 px-6">
          <div className="max-w-[1400px] mx-auto">
            <FinanceTabSelector />
          </div>
        </section>
      )}

      {/* Count Bar */}
      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('flow.totalOrders', { count: totalCount })}
          </span>
        </section>
      )}

      {/* Filter Bar */}
      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('flow.searchPlaceholder')}
                className="w-full h-9 pl-9 pr-3 border rounded-lg text-sm focus:outline-none transition-colors"
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: colors.textTertiary }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Clear */}
            {search && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('flow.clearFilters')}
              </button>
            )}

            {/* Refresh button — right-aligned */}
            <button
              onClick={() => refetch()}
              className="ml-auto h-9 px-4 rounded-lg text-sm font-medium transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('flow.refresh')}
            </button>
          </div>
        </section>
      )}

      {/* Content Area */}
      <section className="max-w-[1400px] mx-auto px-6 relative z-20">
        <div ref={contentRef} className="relative">
          {/* ── Level 1: List View ── */}
          {viewMode === 'list' && (
            <FlowListContent
              orders={filteredOrders}
              isLoading={isLoading}
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
              onRowClick={handleRowClick}
              colors={colors}
              t={t}
            />
          )}

          {/* ── Level 2: Detail View ── */}
          {viewMode === 'detail' && selectedOrder && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div onClick={(e) => e.stopPropagation()}>
              <FlowDetailContent
                order={selectedOrder}
                detail={detailData ?? null}
                isLoading={detailLoading}
                onBack={handleBackToList}
                colors={colors}
                t={t}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════
// FLOW LIST CONTENT
// ═══════════════════════════════════════════════
function FlowListContent({
  orders,
  isLoading,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
  colors,
  t,
}: {
  orders: FlowOrderItem[];
  isLoading: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onRowClick: (o: FlowOrderItem) => void;
  colors: typeof themeColors.dark;
  t: ReturnType<typeof useTranslations<'finance'>>;
}) {
  return (
    <div className="space-y-6">
      {/* Orders Section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 style={{ color: colors.text }} className="text-sm font-semibold">
            {t('flow.title')}
          </h2>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: hexToRgba(colors.orange, 0.12), color: colors.orange }}
          >
            {orders.length}
          </span>
        </div>
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-xl border overflow-hidden"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{
                  borderColor: `${colors.blue}30`,
                  borderTopColor: colors.blue,
                }}
              />
              <span className="ml-3 text-sm" style={{ color: colors.textSecondary }}>
                {t('flow.loading')}
              </span>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20">
              <svg
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: colors.textTertiary }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm" style={{ color: colors.textTertiary }}>
                {t('flow.empty')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 1300 }}>
                <thead>
                  <tr style={{ backgroundColor: `${colors.bg}80` }}>
                    {[
                      { key: 'poNum', align: 'left', sortable: true },
                      { key: 'poDate', align: 'center', sortable: true },
                      { key: 'totalAmount', align: 'right', sortable: true },
                      { key: 'depositStatus', align: 'center', sortable: false },
                      { key: 'paidAmount', align: 'right', sortable: false },
                      { key: 'balanceRemaining', align: 'right', sortable: true },
                      { key: 'actualPayment', align: 'right', sortable: false },
                      { key: 'waiver', align: 'right', sortable: false },
                      { key: 'extraFees', align: 'right', sortable: false },
                      { key: 'logisticNums', align: 'center', sortable: false },
                      { key: 'logAllocation', align: 'right', sortable: false },
                      { key: 'orderTotalCost', align: 'right', sortable: true },
                      { key: 'paymentStatus', align: 'center', sortable: false },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                        style={{
                          color: sortField === col.key ? colors.blue : colors.textTertiary,
                          borderBottom: `1px solid ${colors.border}`,
                          textAlign: col.align as 'left' | 'center' | 'right',
                        }}
                        onClick={col.sortable ? () => onSort(col.key) : undefined}
                      >
                        {t(`flow.table.${col.key}` as Parameters<typeof t>[0])}
                        {col.sortable && sortField === col.key && (
                          <span className="ml-1 text-[8px]">{sortOrder === 'desc' ? '\u25BC' : '\u25B2'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <FlowRow
                      key={order.poNum}
                      order={order}
                      isLast={idx === orders.length - 1}
                      onClick={() => onRowClick(order)}
                      colors={colors}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TABLE ROW
// ═══════════════════════════════════════════════
function FlowRow({
  order,
  isLast,
  onClick,
  colors,
  t,
}: {
  order: FlowOrderItem;
  isLast: boolean;
  onClick: () => void;
  colors: typeof themeColors.dark;
  t: ReturnType<typeof useTranslations<'finance'>>;
}) {
  // ── USD amount display (uses backend-computed USD values) ──
  const UsdAmt = ({ value, cls, dash }: { value: number; cls?: string; dash?: boolean }) => {
    if (dash && (!value || value === 0)) {
      return <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>{'—'}</span>;
    }
    return (
      <span className={`font-mono text-[11px] tabular-nums ${cls || ''}`} style={{ color: cls ? undefined : colors.text }}>
        ${fmtNum(value)}
      </span>
    );
  };

  // ── Deposit status ──
  const DepositStatusCell = () => {
    if (order.depositStatus === 'not_required') {
      return (
        <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>
          {'\u2014'}
        </span>
      );
    }
    const depAmountUsd = order.depositRequiredUsd;
    return (
      <span className="font-mono text-[11px] tabular-nums" style={{ color: depAmountUsd > 0 ? colors.text : colors.textTertiary }}>
        {depAmountUsd > 0 ? `$${fmtNum(depAmountUsd)}` : '\u2014'}
      </span>
    );
  };

  // ── Payment status: Three-bar signal + hover tooltip (fixed position to escape overflow) ──
  const PaymentStatusIcons = () => {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
    const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Resolve statuses
    const depOk = ['paid', 'override', 'not_required'].includes(order.depositStatus);
    const depPartial = order.depositStatus === 'partial';
    const depNotRequired = order.depositStatus === 'not_required';
    const pmtOk = order.orderStatus === 'paid';
    const pmtPartial = order.orderStatus === 'partial';
    const hasLogistics = order.logisticsStatus !== 'none';
    const logArrived = order.logisticsStatus === 'arrived';
    const logPmtOk = order.logisticsPaymentStatus === 'paid';
    const logPmtPartial = order.logisticsPaymentStatus === 'partial';

    const barColor = (ok: boolean, partial: boolean, special?: string) =>
      special || (ok ? colors.green : partial ? colors.yellow : hexToRgba(colors.gray, 0.3));

    const depColor = depNotRequired ? colors.teal : barColor(depOk, depPartial);
    const pmtColor = barColor(pmtOk, pmtPartial);
    const logShipColor = !hasLogistics ? hexToRgba(colors.gray, 0.3) : logArrived ? colors.green : colors.yellow;
    const logPmtColor = !hasLogistics ? hexToRgba(colors.gray, 0.3) : barColor(logPmtOk, logPmtPartial);

    const allOk = depOk && pmtOk && (!hasLogistics || (logArrived && logPmtOk));
    const hasProblem = !depOk || !pmtOk || (hasLogistics && (!logArrived || !logPmtOk));

    const depLabel = depNotRequired
      ? t('flow.status.notRequired')
      : depOk ? t('flow.status.paid') : depPartial ? t('flow.status.partial') : t('flow.status.unpaid');
    const pmtLabel = pmtOk ? t('flow.status.paid') : pmtPartial ? t('flow.status.partial') : t('flow.status.unpaid');
    const logShipLabel = !hasLogistics ? '\u2014' : logArrived ? t('flow.status.received') : t('flow.status.sent');
    const logPmtLabel = !hasLogistics ? '\u2014' : logPmtOk ? t('flow.status.paid') : logPmtPartial ? t('flow.status.partial') : t('flow.status.unpaid');

    const BAR_W = 48;
    const BAR_H = 3;

    const Bar = ({ color }: { color: string }) => (
      <div style={{ width: BAR_W, height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: color, transition: 'background-color 0.2s' }} />
    );
    const SplitBar = () => (
      <div style={{ width: BAR_W, height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: '50%', height: '100%', backgroundColor: logShipColor }} />
        <div style={{ width: '50%', height: '100%', backgroundColor: logPmtColor }} />
      </div>
    );

    const showTooltip = () => {
      clearTimeout(hoverTimeout.current);
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setTipPos({ x: rect.left + rect.width / 2, y: rect.top });
      }
    };
    const hideTooltip = () => {
      hoverTimeout.current = setTimeout(() => setTipPos(null), 100);
    };

    return (
      <>
        <div
          ref={anchorRef}
          className="flex items-center justify-center gap-1.5"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          <div className="flex flex-col items-center gap-[2px]">
            <Bar color={depColor} />
            <Bar color={pmtColor} />
            <SplitBar />
          </div>

          {allOk ? (
            <svg className="w-3 h-3 flex-shrink-0" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : order.hasDiff ? (
            <span className="text-[7px] font-bold px-1 py-0 rounded flex-shrink-0" style={{ backgroundColor: hexToRgba(colors.orange, 0.15), color: colors.orange }}>{t('flow.diffWarning')}</span>
          ) : hasProblem ? (
            <div className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: colors.yellow }} />
          ) : null}
        </div>

        {/* Fixed-position tooltip (escapes overflow-hidden) */}
        {tipPos && (
          <div
            className="fixed z-[9999]"
            style={{ left: tipPos.x, top: tipPos.y, transform: 'translate(-50%, -100%)' }}
            onMouseEnter={() => clearTimeout(hoverTimeout.current)}
            onMouseLeave={hideTooltip}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="rounded-xl px-3.5 py-3 min-w-[200px] shadow-2xl mb-2"
              style={{
                backgroundColor: 'rgba(44,44,46,0.96)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <p className="text-[10px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {order.poNum}
              </p>

              <div className="flex items-center justify-between gap-4 mb-1.5">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('flow.status.deposit')}</span>
                <span className="text-[11px] font-semibold" style={{ color: depColor }}>{depLabel}</span>
              </div>

              <div className="flex items-center justify-between gap-4 mb-1.5">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('flow.status.payment')}</span>
                <span className="text-[11px] font-semibold" style={{ color: pmtColor }}>{pmtLabel}</span>
              </div>

              <div className="flex items-center justify-between gap-4 mb-1.5">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('flow.status.logShipment')}</span>
                <span className="text-[11px] font-semibold" style={{ color: logShipColor }}>{logShipLabel}</span>
              </div>

              {hasLogistics && (
                <div className="flex items-center justify-between gap-4 mb-1.5">
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('flow.status.logPayment')}</span>
                  <span className="text-[11px] font-semibold" style={{ color: logPmtColor }}>{logPmtLabel}</span>
                </div>
              )}

              {(order.hasDiff || order.fluctuationTriggered) && (
                <div className="flex gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {order.hasDiff && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: hexToRgba(colors.orange, 0.15), color: colors.orange }}>
                      {t('flow.diffWarning')}
                    </span>
                  )}
                  {order.fluctuationTriggered && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: hexToRgba(colors.yellow, 0.15), color: colors.yellow }}>
                      +/- {order.curExFloat}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="w-2 h-2 rotate-45 mx-auto -mt-3" style={{ backgroundColor: 'rgba(44,44,46,0.96)' }} />
          </div>
        )}
      </>
    );
  };

  return (
    <tr
      className="cursor-pointer transition-colors duration-150"
      style={{
        borderBottom: isLast ? undefined : `1px solid ${colors.border}40`,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = `${colors.blue}08`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
      }}
    >
      {/* PO Number */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span style={{ color: colors.blue }} className="font-mono text-[11px] font-semibold">
          {order.poNum}
        </span>
        {order.curExFloat > 0 && (
          <span
            className="ml-1 text-[8px] px-1 py-0.5 rounded font-medium"
            style={{
              backgroundColor: order.fluctuationTriggered ? `${colors.green}18` : `${colors.textTertiary}15`,
              color: order.fluctuationTriggered ? colors.green : colors.textTertiary,
            }}
          >
            {'\u00B1'}{order.curExFloat}%
          </span>
        )}
        {order.hasDiff && (
          <span
            className="ml-1 text-[8px] px-1 py-0.5 rounded font-medium"
            style={{ backgroundColor: hexToRgba(colors.red, 0.12), color: colors.red }}
            title={t('flow.diffWarning')}
          >
            DIFF
          </span>
        )}
      </td>

      {/* Date */}
      <td className="py-2.5 px-3 text-center whitespace-nowrap">
        <span className="font-mono text-[10px]" style={{ color: colors.textSecondary }}>
          {order.poDate}
        </span>
      </td>

      {/* Total Amount */}
      <td className="py-2.5 px-3 text-right">
        <UsdAmt value={order.totalAmountUsd} />
      </td>

      {/* Deposit Status */}
      <td className="py-2.5 px-3">
        <DepositStatusCell />
      </td>

      {/* PO Paid */}
      <td className="py-2.5 px-3 text-right">
        <UsdAmt value={order.pmtPaidUsd} dash cls={order.pmtPaidUsd > 0 ? 'text-green-400' : undefined} />
      </td>

      {/* Balance Remaining */}
      <td
        className="py-2.5 px-3 text-right"
        style={{ backgroundColor: order.orderStatus !== 'paid' && order.balanceRemainingUsd > 0 ? hexToRgba(colors.yellow, 0.06) : undefined }}
      >
        {order.orderStatus === 'paid' ? (
          <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>{'\u2014'}</span>
        ) : (
          <UsdAmt
            value={order.balanceRemainingUsd}
            dash
            cls={order.balanceRemainingUsd > 0 ? 'text-yellow-400' : undefined}
          />
        )}
      </td>

      {/* Actual Paid */}
      <td className="py-2.5 px-3 text-right">
        <UsdAmt value={order.actualPaidUsd} dash cls={order.actualPaidUsd > 0 ? 'text-green-400' : undefined} />
      </td>

      {/* Waiver (Override) */}
      <td className="py-2.5 px-3 text-right">
        {order.waiverUsd > 0 ? (
          <span className="font-mono text-[11px] tabular-nums" style={{ color: colors.red }}>
            -${fmtNum(order.waiverUsd)}
          </span>
        ) : (
          <span className="font-mono text-[11px]" style={{ color: colors.textTertiary }}>{'—'}</span>
        )}
      </td>

      {/* Extra Fees */}
      <td className="py-2.5 px-3 text-right">
        <UsdAmt value={order.totalExtraUsd} dash />
      </td>

      {/* Logistics Numbers */}
      <td className="py-2.5 px-3">
        <div className="flex flex-wrap gap-1 justify-center">
          {order.logisticsList.length > 0 ? (
            order.logisticsList.map((ln) => (
              <span
                key={ln}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                style={{
                  backgroundColor: `${colors.blue}12`,
                  color: colors.blue,
                  border: `1px solid ${colors.blue}25`,
                }}
              >
                {ln}
              </span>
            ))
          ) : (
            <span style={{ color: colors.textTertiary }}>{'\u2014'}</span>
          )}
        </div>
      </td>

      {/* Logistics Allocation */}
      <td className="py-2.5 px-3 text-right">
        <UsdAmt value={order.logisticsApportionedUsd} dash />
      </td>

      {/* Total Cost */}
      <td
        className="py-2.5 px-3 text-right"
        style={{ backgroundColor: hexToRgba(colors.green, 0.06) }}
      >
        <UsdAmt
          value={order.totalCostUsd}
          cls="text-emerald-400 font-semibold"
        />
      </td>

      {/* Payment Status */}
      <td className="py-2.5 px-3">
        <PaymentStatusIcons />
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════
// FLOW DETAIL CONTENT (Level 2 -- slide-in)
// ═══════════════════════════════════════════════
function FlowDetailContent({
  order,
  detail,
  isLoading,
  onBack,
  colors,
  t,
}: {
  order: FlowOrderItem;
  detail: FlowDetailResponse | null;
  isLoading: boolean;
  onBack: () => void;
  colors: typeof themeColors.dark;
  t: ReturnType<typeof useTranslations<'finance'>>;
}) {

  return (
    <>
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: colors.blue }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('flow.detail.backToList')}
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: colors.text }}>
            <span style={{ color: colors.blue }} className="font-mono">{order.poNum}</span>
          </h2>
          <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
            {order.poDate} {'\u00B7'} {order.curCurrency}
          </p>
        </div>
      </div>

      {/* Order Total Summary */}
      <div
        className="rounded-xl mb-5 p-4 flex items-center justify-between"
        style={{
          backgroundColor: `${colors.green}10`,
          border: `1px solid ${colors.green}30`,
        }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-bold" style={{ color: colors.text }}>
            {t('flow.detail.orderTotal')}
          </span>
          {detail && (
            <span className="text-xs" style={{ color: colors.textTertiary }}>
              ({t('flow.detail.logBlocks', { count: detail.data.length })})
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[15px] font-bold" style={{ color: colors.green }}>
            ${fmtNum(order.totalCostUsd)}
          </span>
        </div>
      </div>

      {/* Loading / Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{
              borderColor: `${colors.blue}30`,
              borderTopColor: colors.blue,
            }}
          />
          <span className="ml-3 text-sm" style={{ color: colors.textSecondary }}>
            {t('flow.loading')}
          </span>
        </div>
      ) : detail && detail.data.length > 0 ? (
        <div className="space-y-4">
          {detail.data.map((block, bIdx) => {
            const isNotShipped = block.logisticNum === 'NOT_SHIPPED';

            return (
              <div
                key={block.logisticNum + bIdx}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                }}
              >
                {/* Block Header */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${colors.border}` }}
                >
                  <div className="flex items-center gap-2">
                    {isNotShipped ? (
                      <>
                        <svg className="w-4 h-4" style={{ color: colors.yellow }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <span className="text-sm font-bold" style={{ color: colors.yellow }}>
                          {t('flow.detail.notShipped')}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                        </svg>
                        <span className="text-sm font-bold" style={{ color: colors.blue }}>
                          {block.logisticNum}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: block.isPaid ? `${colors.green}18` : hexToRgba(colors.red, 0.12),
                            color: block.isPaid ? colors.green : colors.red,
                          }}
                        >
                          {block.isPaid ? t('flow.status.paid') : t('flow.status.unpaid')}
                        </span>
                      </>
                    )}
                  </div>
                  {!isNotShipped && (
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      {t('flow.detail.logFee')}: <span style={{ color: colors.green }}>${fmtNum(block.logPriceUsd)}</span>
                    </span>
                  )}
                </div>

                {/* SKU Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: `${colors.bg}50` }}>
                        <th className="text-left py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thSku')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thTheoreticalPrice')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thActualPrice')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thFeeAlloc')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thLandedPrice')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thQty')}</th>
                        <th className="text-right py-2 px-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.border}60` }}>{t('flow.detail.thTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.skus.map((sku, sIdx) => (
                        <tr
                          key={sku.sku + sIdx}
                          style={{
                            borderBottom: sIdx !== block.skus.length - 1
                              ? `1px solid ${colors.border}30`
                              : undefined,
                          }}
                        >
                          <td className="py-2 px-4" style={{ color: colors.text }}>{sku.sku}</td>
                          <td className="py-2 px-4 text-right">
                            <PriceCell amtUsd={sku.priceUsd} colors={colors} />
                          </td>
                          <td className="py-2 px-4 text-right">
                            <PriceCell amtUsd={sku.actualPriceUsd} colors={colors} />
                          </td>
                          <td className="py-2 px-4 text-right">
                            <PriceCell amtUsd={sku.feeApportionedUsd} colors={colors} highlight={colors.yellow} />
                          </td>
                          <td className="py-2 px-4 text-right">
                            <PriceCell amtUsd={sku.landedPriceUsd} colors={colors} highlight={colors.blue} bold />
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums" style={{ color: colors.text }}>
                            {sku.qty}
                          </td>
                          <td className="py-2 px-4 text-right">
                            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: colors.green }}>
                              ${fmtNum(sku.totalUsd)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${colors.border}` }}>
                        <td colSpan={6} className="py-2 px-4 text-right text-xs" style={{ color: colors.textTertiary }}>
                          {t('flow.detail.logBlockTotal')}
                        </td>
                        <td className="py-2 px-4 text-right">
                          <span className="font-mono text-[13px] font-bold" style={{ color: colors.green }}>
                            ${fmtNum(block.skus.reduce((sum, sku) => sum + sku.totalUsd, 0))}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <svg
            className="w-10 h-10 mx-auto mb-2"
            style={{ color: colors.textTertiary }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-sm" style={{ color: colors.textTertiary }}>
            {t('flow.empty')}
          </p>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════
// PRICE CELL -- USD only
// ═══════════════════════════════════════════════
function PriceCell({
  amtUsd,
  colors,
  highlight,
  bold,
}: {
  amtUsd: number;
  colors: typeof themeColors.dark;
  highlight?: string;
  bold?: boolean;
}) {
  const fmtPrice = (v: number) => {
    if (v == null) return '\u2014';
    const s = parseFloat(String(v)).toFixed(5);
    return s.replace(/\.?0+$/, '');
  };

  return (
    <span
      className={`font-mono text-xs tabular-nums ${bold ? 'font-bold' : ''}`}
      style={{ color: highlight || colors.text }}
    >
      ${fmtPrice(amtUsd)}
    </span>
  );
}
