'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi, OrderItem } from '@/lib/api/sales';
import { LoadingOverlay } from '../listings/loading-overlay';
import ListingTabSelector from '../components/ListingTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';

/** Format date as YYYY-MM-DD HH:MM:SS */
function formatDateTime(iso?: string): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function OrdersPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.orders');

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);

  const [filterSeller, setFilterSeller] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [availableSellers, setAvailableSellers] = useState<string[]>([]);

  const PAGE_SIZE = 50;

  // Fetch sellers
  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const baseUrl = getApiBaseUrlCached();
        const res = await fetch(`${baseUrl}/ebay/sync/listings/sellers`);
        const data = await res.json();
        if (data.sellers) setAvailableSellers(data.sellers);
      } catch { /* ignore */ }
    };
    fetchSellers();
  }, []);

  // Debounce search input → searchQuery
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load orders
  const loadOrders = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const seller = filterSeller !== 'all' ? filterSeller : undefined;
      const status = filterStatus !== 'all' ? filterStatus : undefined;
      const res = await salesApi.getOrders({
        seller, status, page: pageNum, size: PAGE_SIZE,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        search: searchQuery || undefined,
      });
      setOrders(res.content || []);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages);
      setPage(res.number);
      setDataReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load orders';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filterSeller, filterStatus, filterDateFrom, filterDateTo, searchQuery]);

  useEffect(() => { loadOrders(0); }, [loadOrders]);

  // SSE
  useEffect(() => {
    const baseUrl = getApiBaseUrlCached();
    const sse = new EventSource(`${baseUrl}/ebay/sync/offers/events?seller=${encodeURIComponent(filterSeller)}`);
    sseRef.current = sse;

    sse.addEventListener('connected', () => { setSseConnected(true); });

    sse.addEventListener('sale', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ORDER' && data.order) {
          const o = data.order;
          const newOrder: OrderItem = {
            orderId: o.orderId || `sse-${Date.now()}`,
            buyerUsername: o.buyerUsername,
            buyerFullName: o.buyerFullName,
            total: o.total || 0,
            priceCurrency: o.priceCurrency,
            orderFulfillmentStatus: o.orderFulfillmentStatus,
            cancelStatus: o.cancelStatus,
            creationDate: o.creationDate || new Date().toISOString(),
            sellerUsername: o.sellerUsername,
            items: o.items || [],
          };
          setOrders(prev => {
            const exists = prev.some(x => x.orderId === newOrder.orderId);
            return exists ? prev : [newOrder, ...prev];
          });
          setTotalElements(prev => prev + 1);
          setDataReady(true);

          const flashKey = newOrder.orderId;
          setFlashIds(prev => new Set(prev).add(flashKey));
          setTimeout(() => {
            setFlashIds(prev => {
              const next = new Set(prev);
              next.delete(flashKey);
              return next;
            });
          }, 3000);
        }
      } catch { /* ignore malformed SSE */ }
    });

    sse.onerror = () => { setSseConnected(false); };
    return () => { sse.close(); sseRef.current = null; };
  }, [filterSeller]);

  const afterSalesBadge = (type: string): { label: string; color: string } => {
    switch (type.toUpperCase()) {
      case 'RETURN': return { label: 'Return', color: colors.red };
      case 'CANCELLATION': return { label: 'Cancel', color: colors.orange };
      case 'CASE':
      case 'INQUIRY': return { label: type.charAt(0) + type.slice(1).toLowerCase(), color: '#8b5cf6' };
      default: return { label: type, color: colors.textTertiary };
    }
  };

  const fulfillmentColor = (status?: string): string => {
    switch (status?.toUpperCase()) {
      case 'FULFILLED': return colors.green;
      case 'IN_PROGRESS': return colors.orange;
      case 'NOT_STARTED': return colors.textTertiary;
      default: return colors.textSecondary;
    }
  };

  const fulfillmentLabel = (status?: string): string => {
    switch (status?.toUpperCase()) {
      case 'FULFILLED': return t('statusFulfilled');
      case 'IN_PROGRESS': return t('statusInProgress');
      case 'NOT_STARTED': return t('statusNotStarted');
      default: return status || '\u2014';
    }
  };

  const cancelLabel = (status?: string): string => {
    if (!status || status === 'NONE_REQUESTED') return t('cancelNone');
    if (status === 'CANCEL_REQUESTED') return t('cancelRequested');
    if (status === 'CANCEL_CLOSED' || status === 'CANCELLED') return t('cancelCancelled');
    return status;
  };

  const cancelColor = (status?: string): string => {
    if (!status || status === 'NONE_REQUESTED') return colors.textTertiary;
    if (status === 'CANCEL_REQUESTED') return colors.orange;
    return colors.red;
  };

  const GRID_COLS = 'minmax(120px,1fr) 100px 140px 2fr 120px 90px 110px 110px 100px 160px';

  return (
    <div
      className="min-h-screen pb-20 relative"
      style={{ backgroundColor: colors.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
    >
      {loading && (
        <LoadingOverlay accentColor={colors.controlAccent} isAllSellers={true} message={t('loading')} />
      )}

      {/* Header */}
      <section className="max-w-[1800px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <ListingTabSelector />
            <p style={{ color: colors.textSecondary }} className="text-[15px] mt-3">
              {totalElements > 0
                ? t('subtitle', { count: totalElements })
                : t('subtitleLoading')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: sseConnected ? colors.green : colors.textTertiary }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: sseConnected ? colors.green : colors.textTertiary }}
              />
              {sseConnected ? 'Live' : '...'}
            </span>

            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const seller = filterSeller !== 'all' ? filterSeller : undefined;
                  await salesApi.refreshOrders({ seller });
                  await loadOrders(0);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Refresh failed';
                  setError(msg);
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: colors.controlAccent }}
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {loading ? t('loading') : t('refresh')}
            </button>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="max-w-[1800px] mx-auto px-6 pb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[280px] max-w-[500px]">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-[13px] outline-none focus:ring-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <label style={{ color: colors.textTertiary }} className="text-[12px] whitespace-nowrap">{t('dateFrom')}</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="px-2 py-2 rounded-xl border text-[13px] outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            <label style={{ color: colors.textTertiary }} className="text-[12px] whitespace-nowrap">{t('dateTo')}</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="px-2 py-2 rounded-xl border text-[13px] outline-none cursor-pointer"
            />
          </div>

          <select
            value={filterSeller}
            onChange={(e) => setFilterSeller(e.target.value)}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              color: colors.text,
            }}
            className="px-3 py-2.5 rounded-xl border text-[13px] outline-none cursor-pointer"
          >
            <option value="all">{t('filterAllSellers')}</option>
            {availableSellers.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              color: colors.text,
            }}
            className="px-3 py-2.5 rounded-xl border text-[13px] outline-none cursor-pointer"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="FULFILLED">{t('filterFulfilled')}</option>
            <option value="NOT_STARTED">{t('filterNotStarted')}</option>
            <option value="IN_PROGRESS">{t('filterInProgress')}</option>
          </select>
        </div>
      </section>

      {/* Error modal */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-2xl p-6 w-[400px] shadow-2xl" style={{ backgroundColor: colors.bgSecondary }}>
            <h3 style={{ color: colors.text }} className="text-[16px] font-semibold mb-2">{t('errorTitle')}</h3>
            <p style={{ color: colors.textSecondary }} className="text-[13px] mb-4">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-5 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ backgroundColor: colors.controlAccent }}
            >
              {t('errorOk')}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="max-w-[1800px] mx-auto px-6">
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        >
          {/* Table Header */}
          <div
            className="grid text-[11px] uppercase tracking-wider font-medium items-center"
            style={{
              color: colors.textTertiary,
              gridTemplateColumns: GRID_COLS,
              borderBottom: `1px solid ${colors.border}`,
              backgroundColor: colors.bgTertiary,
            }}
          >
            <div className="px-3 py-3">{t('colRootSku')}</div>
            <div className="px-3 py-3">{t('colSeller')}</div>
            <div className="px-3 py-3">{t('colOrderId')}</div>
            <div className="px-3 py-3">{t('colTitle')}</div>
            <div className="px-3 py-3">{t('colBuyer')}</div>
            <div className="px-3 py-3">{t('colTotal')}</div>
            <div className="px-3 py-3">{t('colFulfillment')}</div>
            <div className="px-3 py-3">{t('colAfterSales')}</div>
            <div className="px-3 py-3">{t('colCancel')}</div>
            <div className="px-3 py-3">{t('colDate')}</div>
          </div>

          {/* Empty state */}
          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-12 h-12 mb-3" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p style={{ color: colors.textTertiary }} className="text-[14px]">
                {!dataReady
                  ? t('emptyClickRefresh')
                  : searchInput || filterStatus !== 'all' || filterDateFrom || filterDateTo
                    ? t('emptyNoMatch')
                    : t('emptyNoOrders')}
              </p>
            </div>
          )}

          {/* Table Body */}
          {orders.map((order, idx) => {
            const isFlashing = flashIds.has(order.orderId);
            const skus = (order.items || []).map(i => i.sku || '').filter(Boolean).join(', ');
            const firstTitle = (order.items || [])[0]?.title || '\u2014';
            return (
              <div
                key={order.orderId || idx}
                className="grid items-center text-[13px] transition-all hover:opacity-90"
                style={{
                  gridTemplateColumns: GRID_COLS,
                  borderBottom: `1px solid ${colors.border}`,
                  color: colors.text,
                  backgroundColor: isFlashing
                    ? `${colors.green}20`
                    : idx % 2 === 0 ? 'transparent' : `${colors.bgTertiary}40`,
                  transition: 'background-color 1s ease',
                }}
              >
                <div className="px-3 py-3 text-[12px] font-mono" title={skus}>
                  {skus || '\u2014'}
                </div>
                <div className="px-3 py-3 truncate text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {order.sellerUsername || '\u2014'}
                </div>
                <div className="px-3 py-3 font-mono text-[11px]" style={{ color: colors.textSecondary }}>
                  {order.orderId ? order.orderId.slice(-12) : '\u2014'}
                </div>
                <div className="px-3 py-3 truncate" title={firstTitle}>
                  {firstTitle}
                </div>
                <div className="px-3 py-3 truncate" style={{ color: colors.textSecondary }}>
                  {order.buyerUsername || '\u2014'}
                </div>
                <div className="px-3 py-3 font-medium">
                  {order.total != null ? `$${order.total.toFixed(2)}` : '\u2014'}
                </div>
                <div className="px-3 py-3">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      color: fulfillmentColor(order.orderFulfillmentStatus),
                      backgroundColor: `${fulfillmentColor(order.orderFulfillmentStatus)}15`,
                    }}
                  >
                    {fulfillmentLabel(order.orderFulfillmentStatus)}
                  </span>
                </div>
                <div className="px-3 py-3">
                  {(order.afterSalesTypes && order.afterSalesTypes.length > 0) ? (
                    <div className="flex flex-wrap gap-1">
                      {order.afterSalesTypes.map((type) => {
                        const badge = afterSalesBadge(type);
                        return (
                          <span
                            key={type}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ color: badge.color, backgroundColor: `${badge.color}15` }}
                          >
                            {badge.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px]" style={{ color: colors.textTertiary }}>{t('afterSalesNone')}</span>
                  )}
                </div>
                <div className="px-3 py-3">
                  <span
                    className="text-[11px]"
                    style={{ color: cancelColor(order.cancelStatus) }}
                  >
                    {cancelLabel(order.cancelStatus)}
                  </span>
                </div>
                <div className="px-3 py-3 text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {formatDateTime(order.creationDate)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span style={{ color: colors.textSecondary }} className="text-[13px]">
              {t('itemsTotal', { total: totalElements })}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadOrders(page - 1)}
                disabled={page <= 0}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all disabled:opacity-40"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {t('prev')}
              </button>
              <span style={{ color: colors.textSecondary }} className="text-[13px]">
                {t('page', { current: page + 1, total: totalPages })}
              </span>
              <button
                onClick={() => loadOrders(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all disabled:opacity-40"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}

        {/* Footer count (single page) */}
        {totalPages <= 1 && orders.length > 0 && (
          <div className="mt-3">
            <span style={{ color: colors.textSecondary }} className="text-[13px]">
              {t('itemsTotal', { total: totalElements })}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
