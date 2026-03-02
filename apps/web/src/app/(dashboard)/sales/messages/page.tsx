'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi, MessageItem, MessageStatsResponse } from '@/lib/api/sales';
import { LoadingOverlay } from '../listings/loading-overlay';
import ListingTabSelector from '../components/ListingTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { parseCustomLabel } from '../listings/sku-parser';
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

/** Format seconds to human readable time */
function formatResponseTime(seconds: number | null | undefined): string {
  if (seconds == null) return '\u2014';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/** Get color for response time */
function responseTimeColor(seconds: number | null | undefined, colors: { green: string; orange: string; red: string; textTertiary: string }): string {
  if (seconds == null) return colors.textTertiary;
  if (seconds < 3600) return colors.green;      // < 1h
  if (seconds < 14400) return colors.orange;     // 1-4h
  return colors.red;                              // > 4h
}

/** Strip HTML tags from message body */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export default function MessagesPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.messages');

  const [messages, setMessages] = useState<MessageItem[]>([]);
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
  const [stats, setStats] = useState<MessageStatsResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [hideSystem, setHideSystem] = useState(true);

  const [filterSeller, setFilterSeller] = useState('all');
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

  // Load messages
  const loadMessages = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const seller = filterSeller !== 'all' ? filterSeller : undefined;
      const [msgResult, statsResult] = await Promise.allSettled([
        salesApi.getMessages({ seller, page: pageNum, size: PAGE_SIZE }),
        salesApi.getMessageStats({ seller }),
      ]);

      if (msgResult.status === 'fulfilled') {
        const msgRes = msgResult.value;
        setMessages(msgRes.content || []);
        setTotalElements(msgRes.totalElements);
        setTotalPages(msgRes.totalPages);
        setPage(msgRes.number);
        setDataReady(true);
      } else {
        const msg = msgResult.reason instanceof Error ? msgResult.reason.message : 'Failed to load messages';
        setError(msg);
      }

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        setStats({ avgResponseSeconds: null, maxResponseSeconds: null, totalMessages: 0 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filterSeller]);

  useEffect(() => { loadMessages(0); }, [loadMessages]);

  // SSE
  useEffect(() => {
    const baseUrl = getApiBaseUrlCached();
    const sse = new EventSource(`${baseUrl}/ebay/sync/offers/events?seller=${encodeURIComponent(filterSeller)}`);
    sseRef.current = sse;

    sse.addEventListener('connected', () => { setSseConnected(true); });

    sse.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          const m = data.message;
          const newMsg: MessageItem = {
            id: m.id || Date.now(),
            messageId: m.messageId || '',
            sender: m.sender || '',
            senderUsername: m.senderUsername,
            recipientUsername: m.recipientUsername,
            sellerUsername: m.sellerUsername,
            itemId: m.itemId,
            itemTitle: m.itemTitle,
            sku: m.sku,
            subject: m.subject,
            body: m.body,
            messageType: m.messageType,
            isRead: m.isRead || false,
            flagged: m.flagged || false,
            replied: m.replied || false,
            responseTimeSeconds: m.responseTimeSeconds,
            receivedAt: m.receivedAt || new Date().toISOString(),
          };
          setMessages(prev => {
            const exists = prev.some(x => x.id === newMsg.id);
            return exists ? prev : [newMsg, ...prev];
          });
          setTotalElements(prev => prev + 1);
          setDataReady(true);

          setFlashIds(prev => new Set(prev).add(newMsg.id));
          setTimeout(() => {
            setFlashIds(prev => {
              const next = new Set(prev);
              next.delete(newMsg.id);
              return next;
            });
          }, 3000);
        }
      } catch { /* ignore */ }
    });

    sse.onerror = () => { setSseConnected(false); };
    return () => { sse.close(); sseRef.current = null; };
  }, [filterSeller]);

  // Client-side filters: search + hide eBay system messages
  const filteredMessages = messages.filter(msg => {
    // Filter out eBay system messages
    if (hideSystem && msg.senderUsername?.toLowerCase() === 'ebay') return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      msg.subject?.toLowerCase().includes(q) ||
      msg.senderUsername?.toLowerCase().includes(q) ||
      msg.sender?.toLowerCase().includes(q) ||
      msg.itemTitle?.toLowerCase().includes(q) ||
      msg.itemId?.toLowerCase().includes(q) ||
      msg.sku?.toLowerCase().includes(q) ||
      parseCustomLabel(msg.sku).skus.some(s => s.toLowerCase().includes(q))
    );
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusLabel = (msg: MessageItem): string => {
    if (msg.replied) return t('statusReplied');
    if (msg.isRead) return t('statusRead');
    return t('statusUnread');
  };

  const statusColor = (msg: MessageItem): string => {
    if (msg.replied) return colors.green;
    if (msg.isRead) return colors.textSecondary;
    return colors.orange;
  };

  const GRID_COLS = 'minmax(100px, 1fr) 100px 120px 1.5fr 1.5fr 80px 80px 150px';

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
                  await salesApi.refreshMessages({ seller });
                  await loadMessages(0);
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

      {/* Stats Panel */}
      {stats && (
        <section className="max-w-[1800px] mx-auto px-6 pb-4">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-3 px-5 py-3 rounded-xl border"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                  {t('statsAvgResponse')}
                </div>
                <div
                  className="text-[18px] font-semibold tabular-nums"
                  style={{ color: stats.avgResponseSeconds != null ? responseTimeColor(stats.avgResponseSeconds, colors) : colors.textTertiary }}
                >
                  {stats.avgResponseSeconds != null ? formatResponseTime(stats.avgResponseSeconds) : t('statsNoData')}
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-3 px-5 py-3 rounded-xl border"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                  {t('statsMaxResponse')}
                </div>
                <div
                  className="text-[18px] font-semibold tabular-nums"
                  style={{ color: stats.maxResponseSeconds != null ? responseTimeColor(stats.maxResponseSeconds, colors) : colors.textTertiary }}
                >
                  {stats.maxResponseSeconds != null ? formatResponseTime(stats.maxResponseSeconds) : t('statsNoData')}
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-3 px-5 py-3 rounded-xl border"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                  {t('statsTotalMessages')}
                </div>
                <div className="text-[18px] font-semibold tabular-nums" style={{ color: colors.text }}>
                  {stats.totalMessages}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

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

          {/* Hide eBay System Messages Toggle */}
          <button
            onClick={() => setHideSystem(prev => !prev)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-all cursor-pointer"
            style={{
              backgroundColor: hideSystem ? `${colors.controlAccent}15` : colors.bgSecondary,
              borderColor: hideSystem ? colors.controlAccent : colors.border,
              color: hideSystem ? colors.controlAccent : colors.textSecondary,
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              {hideSystem ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              )}
            </svg>
            {t('filterHideSystem')}
          </button>
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
            <div className="px-3 py-3">{t('colSku')}</div>
            <div className="px-3 py-3">{t('colSeller')}</div>
            <div className="px-3 py-3">{t('colSender')}</div>
            <div className="px-3 py-3">{t('colSubject')}</div>
            <div className="px-3 py-3">{t('colItem')}</div>
            <div className="px-3 py-3">{t('colStatus')}</div>
            <div className="px-3 py-3">{t('colResponseTime')}</div>
            <div className="px-3 py-3">{t('colDate')}</div>
          </div>

          {/* Empty state */}
          {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-12 h-12 mb-3" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
              <p style={{ color: colors.textTertiary }} className="text-[14px]">
                {!dataReady
                  ? t('emptyClickRefresh')
                  : searchQuery
                    ? t('emptyNoMatch')
                    : t('emptyNoMessages')}
              </p>
            </div>
          )}

          {/* Table Body */}
          {filteredMessages.map((msg, idx) => {
            const isFlashing = flashIds.has(msg.id);
            const isExpanded = expandedIds.has(msg.id);
            const rowBg = isFlashing
              ? `${colors.green}20`
              : idx % 2 === 0 ? 'transparent' : `${colors.bgTertiary}40`;
            const bodyText = msg.body ? stripHtml(msg.body) : '';

            return (
              <div key={msg.id || idx}>
                {/* Row */}
                <div
                  className="grid items-center text-[13px] transition-all cursor-pointer hover:opacity-90"
                  onClick={() => toggleExpand(msg.id)}
                  style={{
                    gridTemplateColumns: GRID_COLS,
                    borderBottom: isExpanded ? 'none' : `1px solid ${colors.border}`,
                    color: colors.text,
                    backgroundColor: rowBg,
                    transition: 'background-color 1s ease',
                  }}
                >
                  <div className="px-3 py-3 text-[11px] font-mono" style={{ color: colors.text, wordBreak: 'break-all' }}>
                    {(() => {
                      const parsed = parseCustomLabel(msg.sku);
                      if (!parsed.valid) return <span style={{ color: colors.red }} title={msg.sku || ''}>{msg.sku || '\u2014'}</span>;
                      return parsed.display;
                    })()}
                  </div>
                  <div className="px-3 py-3 truncate text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                    {msg.sellerUsername || '\u2014'}
                  </div>
                  <div className="px-3 py-3 truncate" style={{ color: colors.textSecondary }}>
                    {msg.senderUsername || msg.sender || '\u2014'}
                  </div>
                  <div className="px-3 py-3 truncate" title={msg.subject || ''}>
                    {msg.subject || '\u2014'}
                  </div>
                  <div className="px-3 py-3 truncate text-[11px]" style={{ color: colors.textSecondary }} title={msg.itemTitle || ''}>
                    {msg.itemTitle || '\u2014'}
                  </div>
                  <div className="px-3 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: statusColor(msg),
                        backgroundColor: `${statusColor(msg)}15`,
                      }}
                    >
                      {statusLabel(msg)}
                    </span>
                  </div>
                  <div className="px-3 py-3 text-[11px] font-mono tabular-nums"
                    style={{ color: responseTimeColor(msg.responseTimeSeconds, colors) }}
                  >
                    {formatResponseTime(msg.responseTimeSeconds)}
                  </div>
                  <div className="px-3 py-3 flex items-center gap-1.5">
                    <span className="text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                      {formatDateTime(msg.receivedAt)}
                    </span>
                    <svg
                      className="w-3 h-3 flex-shrink-0 transition-transform"
                      style={{
                        color: colors.textTertiary,
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      backgroundColor: `${colors.bgTertiary}60`,
                    }}
                    className="px-6 py-4"
                  >
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 max-w-[900px]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                          {t('detailSender')}
                        </div>
                        <div className="text-[13px]" style={{ color: colors.text }}>
                          {msg.senderUsername || msg.sender || '\u2014'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                          {t('detailRecipient')}
                        </div>
                        <div className="text-[13px]" style={{ color: colors.text }}>
                          {msg.recipientUsername || '\u2014'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                          {t('detailMessageId')}
                        </div>
                        <div className="text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                          {msg.messageId || '\u2014'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                          {t('detailItem')}
                        </div>
                        <div className="text-[13px]" style={{ color: colors.text }}>
                          {msg.itemId ? `${msg.itemTitle || ''} (${msg.itemId})` : '\u2014'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.textTertiary }}>
                        {t('detailBody')}
                      </div>
                      <div
                        className="text-[13px] leading-relaxed rounded-lg p-3 border whitespace-pre-wrap"
                        style={{
                          color: colors.text,
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.border,
                          maxHeight: '300px',
                          overflowY: 'auto',
                        }}
                      >
                        {bodyText || t('detailNoBody')}
                      </div>
                    </div>
                  </div>
                )}
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
                onClick={() => loadMessages(page - 1)}
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
                onClick={() => loadMessages(page + 1)}
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
        {totalPages <= 1 && filteredMessages.length > 0 && (
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
