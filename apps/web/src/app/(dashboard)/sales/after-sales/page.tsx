'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi, AfterSalesEvent } from '@/lib/api/sales';
import { LoadingOverlay } from '../listings/loading-overlay';
import ListingTabSelector from '../components/ListingTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';

/** Check if cancellation status indicates it's been resolved/closed */
function isCancelClosed(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s.includes('CLOSED') || s.includes('SUCCESS') || s === 'CANCEL_CLOSED';
}

/** Check if cancellation is pending buyer-initiated request */
function isCancelPending(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'CANCEL_REQUESTED' || s === 'CANCEL_PENDING';
}

/** Format date as YYYY-MM-DD HH:MM:SS */
function formatDateTime(iso?: string): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function AfterSalesPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.afterSales');

  const [events, setEvents] = useState<AfterSalesEvent[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const sseRef = useRef<EventSource | null>(null);

  const [filterSeller, setFilterSeller] = useState('all');
  const [filterType, setFilterType] = useState('all');
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

  // Load events
  const loadEvents = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const seller = filterSeller !== 'all' ? filterSeller : undefined;
      const type = filterType !== 'all' ? filterType : undefined;
      const res = await salesApi.getAfterSales({ seller, type, page: pageNum, size: PAGE_SIZE });
      setEvents(res.content || []);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages);
      setPage(res.number);
      setDataReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load events';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filterSeller, filterType]);

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  // SSE
  useEffect(() => {
    const baseUrl = getApiBaseUrlCached();
    const sse = new EventSource(`${baseUrl}/ebay/sync/offers/events?seller=${encodeURIComponent(filterSeller)}`);
    sseRef.current = sse;

    sse.addEventListener('connected', () => { setSseConnected(true); });

    sse.addEventListener('after-sales', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event) {
          const e = data.event;
          const newEvent: AfterSalesEvent = {
            id: e.id || Date.now(),
            eventType: e.eventType || '',
            eventId: e.eventId || '',
            orderId: e.orderId,
            sellerUsername: e.sellerUsername,
            buyerUsername: e.buyerUsername,
            itemId: e.itemId,
            sku: e.sku,
            title: e.title,
            quantity: e.quantity,
            reason: e.reason,
            status: e.status,
            amount: e.amount,
            currency: e.currency,
            createdAt: e.createdAt || new Date().toISOString(),
          };
          setEvents(prev => {
            const exists = prev.some(x => x.id === newEvent.id);
            return exists ? prev : [newEvent, ...prev];
          });
          setTotalElements(prev => prev + 1);
          setDataReady(true);

          setFlashIds(prev => new Set(prev).add(newEvent.id));
          setTimeout(() => {
            setFlashIds(prev => {
              const next = new Set(prev);
              next.delete(newEvent.id);
              return next;
            });
          }, 3000);
        }
      } catch { /* ignore */ }
    });

    sse.onerror = () => { setSseConnected(false); };
    return () => { sse.close(); sseRef.current = null; };
  }, [filterSeller]);

  // Client-side search filter
  const filteredEvents = events.filter(event => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      event.eventId?.toLowerCase().includes(q) ||
      event.orderId?.toLowerCase().includes(q) ||
      event.sku?.toLowerCase().includes(q) ||
      event.title?.toLowerCase().includes(q)
    );
  });

  const typeColor = (type?: string): string => {
    switch (type?.toUpperCase()) {
      case 'CANCELLATION':
      case 'CANCEL': return colors.orange;
      case 'RETURN': return colors.red;
      case 'CASE': return colors.purple;
      case 'INQUIRY': return colors.purple;
      default: return colors.textSecondary;
    }
  };

  const typeLabel = (type?: string): string => {
    switch (type?.toUpperCase()) {
      case 'CANCELLATION':
      case 'CANCEL': return t('typeCancellation');
      case 'RETURN': return t('typeReturn');
      case 'CASE': return t('typeCase');
      case 'INQUIRY': return t('typeInquiry');
      default: return type || '\u2014';
    }
  };

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleApproveCancel = async (event: AfterSalesEvent) => {
    if (!event.sellerUsername || !event.eventId) return;
    if (!confirm(t('confirmApproveCancel'))) return;

    setApprovingId(event.eventId);
    try {
      const baseUrl = getApiBaseUrlCached();
      const res = await fetch(`${baseUrl}/ebay/sync/after-sales/approve-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller: event.sellerUsername, cancelId: event.eventId }),
      });
      const data = await res.json();
      if (data.success) {
        setEvents(prev => prev.map(e =>
          e.eventId === event.eventId ? { ...e, status: 'CANCEL_CLOSED' } : e
        ));
      } else {
        setError(data.error || 'Failed to approve cancellation');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setError(msg);
    } finally {
      setApprovingId(null);
    }
  };

  const GRID_COLS = '100px 100px 120px 120px 100px 2fr 120px 120px 90px 160px';

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
                  await salesApi.refreshAfterSales({ seller });
                  await loadEvents(0);
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-[13px] outline-none focus:ring-1"
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
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              color: colors.text,
            }}
            className="px-3 py-2.5 rounded-xl border text-[13px] outline-none cursor-pointer"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="CANCELLATION">{t('filterCancellation')}</option>
            <option value="RETURN">{t('filterReturn')}</option>
            <option value="CASE">{t('filterCase')}</option>
            <option value="INQUIRY">{t('filterInquiry')}</option>
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
            <div className="px-3 py-3">{t('colSeller')}</div>
            <div className="px-3 py-3">{t('colType')}</div>
            <div className="px-3 py-3">{t('colEventId')}</div>
            <div className="px-3 py-3">{t('colOrderId')}</div>
            <div className="px-3 py-3">{t('colSku')}</div>
            <div className="px-3 py-3">{t('colTitle')}</div>
            <div className="px-3 py-3">{t('colBuyer')}</div>
            <div className="px-3 py-3">{t('colStatus')}</div>
            <div className="px-3 py-3">{t('colAmount')}</div>
            <div className="px-3 py-3">{t('colDate')}</div>
          </div>

          {/* Empty state */}
          {filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-12 h-12 mb-3" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <p style={{ color: colors.textTertiary }} className="text-[14px]">
                {!dataReady
                  ? t('emptyClickRefresh')
                  : searchQuery || filterType !== 'all'
                    ? t('emptyNoMatch')
                    : t('emptyNoEvents')}
              </p>
            </div>
          )}

          {/* Table Body */}
          {filteredEvents.map((event, idx) => {
            const isFlashing = flashIds.has(event.id);
            return (
              <div
                key={event.id || idx}
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
                <div className="px-3 py-3 truncate text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {event.sellerUsername || '\u2014'}
                </div>
                <div className="px-3 py-3">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      color: typeColor(event.eventType),
                      backgroundColor: `${typeColor(event.eventType)}15`,
                    }}
                  >
                    {typeLabel(event.eventType)}
                  </span>
                </div>
                <div className="px-3 py-3 font-mono text-[11px] truncate" style={{ color: colors.textSecondary }}>
                  {event.eventId ? event.eventId.slice(-10) : '\u2014'}
                </div>
                <div className="px-3 py-3 font-mono text-[11px] truncate" style={{ color: colors.textSecondary }}>
                  {event.orderId ? event.orderId.slice(-12) : '\u2014'}
                </div>
                <div className="px-3 py-3 truncate text-[12px] font-mono" title={event.sku || ''}>
                  {event.sku || '\u2014'}
                </div>
                <div className="px-3 py-3 truncate" title={event.title || ''}>
                  {event.title || '\u2014'}
                </div>
                <div className="px-3 py-3 truncate" style={{ color: colors.textSecondary }}>
                  {event.buyerUsername || '\u2014'}
                </div>
                <div className="px-3 py-3 flex items-center gap-1.5">
                  {event.eventType?.toUpperCase() === 'CANCELLATION' && isCancelClosed(event.status) ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ color: colors.green, backgroundColor: `${colors.green}15` }}>
                      {t('statusCancelled')}
                    </span>
                  ) : event.eventType?.toUpperCase() === 'CANCELLATION' && isCancelPending(event.status) ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ color: colors.orange, backgroundColor: `${colors.orange}15` }}>
                        {t('statusPending')}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproveCancel(event); }}
                        disabled={approvingId === event.eventId}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md text-white transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: colors.green }}
                      >
                        {approvingId === event.eventId ? '...' : t('btnApproveCancel')}
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: colors.textSecondary }}>
                      {event.status || '\u2014'}
                    </span>
                  )}
                </div>
                <div className="px-3 py-3 font-medium">
                  {event.amount != null ? `${event.currency || '$'}${event.amount.toFixed(2)}` : '\u2014'}
                </div>
                <div className="px-3 py-3 text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {formatDateTime(event.createdAt)}
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
                onClick={() => loadEvents(page - 1)}
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
                onClick={() => loadEvents(page + 1)}
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
        {totalPages <= 1 && filteredEvents.length > 0 && (
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
