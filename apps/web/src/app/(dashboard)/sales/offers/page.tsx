'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi, OfferItem, RespondToOffersRequest } from '@/lib/api/sales';
import { parseCustomLabel } from '../listings/sku-parser';
import { LoadingOverlay } from '../listings/loading-overlay';
import ListingTabSelector from '../components/ListingTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

/** Format date as YYYY-MM-DD HH:MM:SS */
function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Elapsed time since a date — e.g. "16h 28m 45s" */
function elapsedSince(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return '—';
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ═══════════════════════════════════════════════════

export default function OffersPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.offers');

  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());



  // SKU lookup map: itemId → customLabel
  const [skuMap, setSkuMap] = useState<Record<string, string>>({});

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeller, setFilterSeller] = useState('all');
  const [availableSellers, setAvailableSellers] = useState<string[]>([]);

  // Automation data for auto-reply
  const [autoTree, setAutoTree] = useState<{ category_group: string; decision_key: string; enabled: boolean }[]>([]);
  const [autoStrategies, setAutoStrategies] = useState<{ category_group: string; path_key: string; qty_min: number; qty_max: number | null; discount_type: string; discount_value: number }[]>([]);
  const [skuCategoryMap, setSkuCategoryMap] = useState<Record<string, string>>({});
  const [autoPriceRanges, setAutoPriceRanges] = useState<string[]>([]);
  const [autoPieceCounts, setAutoPieceCounts] = useState<string[]>([]);

  // Fetch sellers + listings (for SKU map)
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const baseUrl = getApiBaseUrlCached();
        const res = await fetch(`${baseUrl}/ebay/sync/listings/sellers`);
        const data = await res.json();
        if (data.sellers) setAvailableSellers(data.sellers);
      } catch { /* ignore */ }

      // Build SKU lookup from cached listings
      try {
        const listingsRes = await salesApi.getActiveListings({ seller: 'all' });
        const map: Record<string, string> = {};
        for (const item of listingsRes.items || []) {
          if (item.itemId && item.sku) {
            map[item.itemId] = item.sku;
          }
        }
        setSkuMap(map);
      } catch { /* ignore */ }
    };
    fetchMeta();
    // Load automation rules for auto-reply
    const fetchAutoRules = async () => {
      try {
        const baseUrl = getApiBaseUrlCached();
        const [rulesRes, catRes] = await Promise.all([
          fetch(`${baseUrl}/automation/rules`).then(r => r.json()),
          fetch(`${baseUrl}/automation/sku-categories`).then(r => r.json()),
        ]);
        setAutoTree((rulesRes.tree || []).map((t: Record<string, unknown>) => ({
          category_group: t.category_group as string,
          decision_key: t.decision_key as string,
          enabled: t.enabled as boolean,
        })));
        setAutoStrategies((rulesRes.strategies || []).map((s: Record<string, unknown>) => ({
          category_group: s.category_group as string,
          path_key: s.path_key as string,
          qty_min: Number(s.qty_min),
          qty_max: s.qty_max != null ? Number(s.qty_max) : null,
          discount_type: s.discount_type as string,
          discount_value: Number(s.discount_value),
        })));
        setSkuCategoryMap(catRes.skuCategories || {});
        // Load price ranges from rules
        const rulesArr = rulesRes.rules || [];
        const prMap: Record<string, string> = {};
        for (const r of rulesArr) prMap[`${r.module}.${r.rule_key}`] = r.rule_value;
        const prStr = prMap['OFFER.price_ranges'];
        if (prStr) setAutoPriceRanges(prStr.split(',').filter(Boolean));
        const pcStr = prMap['OFFER.piece_counts'];
        if (pcStr) setAutoPieceCounts(pcStr.split(',').filter(Boolean));
      } catch { /* ignore */ }
    };
    fetchAutoRules();
  }, []);

  // Load offers (from cache, no eBay fetch)
  const loadOffers = useCallback(async () => {
    try {
      const res = await salesApi.getOffers({ seller: 'all' });
      setOffers(res.items || []);
      setFetchedAt(res.fetchedAt);
      if ((res.items || []).length > 0) setDataReady(true);
    } catch { /* no cached data is fine */ }
  }, []);

  // Refresh from eBay (manual or server-startup triggered)
  const refreshOffers = useCallback(async () => {
    setLoading(true);
    setLoadingMessage(t('fetchingOffers'));
    setError(null);
    try {
      const res = await salesApi.refreshOffers({ seller: 'all' });
      setOffers(res.items || []);
      setFetchedAt(res.fetchedAt);
      setDataReady(true);

      // Auto-reply runs asynchronously on the backend (scheduler, 0s delay).
      // Re-fetch after a short delay so auto-replied offers disappear from the list.
      setTimeout(async () => {
        try {
          const updated = await salesApi.getOffers({ seller: 'all' });
          setOffers(updated.items || []);
          setFetchedAt(updated.fetchedAt);
        } catch { /* ignore */ }
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch offers';
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [t]);

  // Auto-load cached data on mount (no eBay fetch)
  useEffect(() => { loadOffers(); }, [loadOffers]);

  // ═══ SSE: Real-time Best Offer push from Webhook ═══
  useEffect(() => {
    const baseUrl = getApiBaseUrlCached();
    const sse = new EventSource(`${baseUrl}/ebay/sync/offers/events?seller=${encodeURIComponent(filterSeller)}`);
    sseRef.current = sse;

    sse.addEventListener('connected', () => {
      setSseConnected(true);
    });

    sse.addEventListener('offer', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'BEST_OFFER' && data.offer) {
          const o = data.offer;
          const status = (o.status || 'Pending').toLowerCase();
          const offerId = o.bestOfferId || '';

          // If status is not pending/active, remove this offer from list
          if (status !== 'pending' && status !== 'active') {
            setOffers(prev => prev.filter(x => x.bestOfferId !== offerId));
            return;
          }

          // New pending offer — add to top
          const newOffer: OfferItem = {
            bestOfferId: offerId || `sse-${Date.now()}`,
            itemId: o.itemId,
            itemTitle: o.itemTitle,
            buyerUserId: o.buyerUserId,
            offerPrice: o.offerPrice,
            offerCurrency: o.offerCurrency,
            quantity: o.quantity,
            status: o.status || 'Pending',
            creationTime: new Date().toISOString(),
            buyerMessage: o.message,
            seller: o.seller,
            buyItNowPrice: o.buyItNowPrice,
          };

          // Avoid duplicates
          setOffers(prev => {
            const exists = prev.some(x => x.bestOfferId === offerId);
            return exists ? prev : [newOffer, ...prev];
          });
          setDataReady(true);

          const flashKey = newOffer.bestOfferId || '';
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

    sse.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [filterSeller]);

  // ═══ Selection helpers ═══
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const allIds = filteredOffers.map(o => o.bestOfferId || '').filter(Boolean);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  // ═══ Auto-reply computation ═══
  const computeAutoAction = (offer: OfferItem): { action: string; counterPrice?: number } => {
    const customLabel = skuMap[offer.itemId || ''] || '';
    // Extract root SKU (first SKU before any delimiter)
    const rootSku = customLabel.split(/[,;|\s]/)[0]?.toUpperCase()?.replace(/\.[0-9]+$/, '') || '';
    if (!rootSku) return { action: 'Skip' }; // No SKU found — skip, never decline

    // Determine category group
    let categoryGroup = 'OTHER';
    for (const [sku, group] of Object.entries(skuCategoryMap)) {
      if (rootSku.startsWith(sku) || sku.startsWith(rootSku)) {
        categoryGroup = group;
        break;
      }
    }

    // Parse SKU to extract dimension values
    const lug = rootSku.charAt(0);          // first digit = lug count
    const thickness = rootSku.slice(-2);     // last 2 chars = thickness in mm
    // Detect piece count from custom label suffix (e.g. .2 = 2pcs, .4 = 4pcs)
    const packMatch = customLabel.match(/\.([0-9]+)$/);
    const pieceCount = packMatch ? packMatch[1] : '4'; // default to 4

    // Get enabled tree dimensions for this category
    const enabledDims = autoTree.filter(t => t.category_group === categoryGroup && t.enabled);

    // Build path_key matching enabled dimensions
    const pathParts: string[] = [];
    for (const dim of enabledDims) {
      switch (dim.decision_key) {
        case 'by_lug': pathParts.push(`lug:${lug}`); break;
        case 'by_thickness': pathParts.push(`thickness:${thickness}`); break;
        case 'by_piece_count': {
          // For OTHER products, match piece count against configured ranges
          const matchedPc = autoPieceCounts.length > 0
            ? autoPieceCounts.find(r => {
                const [lo, hi] = r.split('-').map(Number);
                return Number(pieceCount) >= lo && Number(pieceCount) <= hi;
              })
            : pieceCount; // fallback for ADAPTER/SPACER with fixed values
          if (matchedPc) pathParts.push(`piece_count:${matchedPc}`);
          break;
        }
        case 'by_price_range': {
          const buyNow = offer.buyItNowPrice || 0;
          const matched = autoPriceRanges.find(r => {
            const [lo, hi] = r.split('-').map(Number);
            return buyNow >= lo && buyNow <= hi;
          });
          if (matched) pathParts.push(`price_range:${matched}`);
          break;
        }
      }
    }
    const pathKey = pathParts.length > 0 ? pathParts.join('|') : '*';

    // Find matching strategy by path_key and quantity
    const qty = offer.quantity || 1;
    const matchingStrategies = autoStrategies
      .filter(s => s.category_group === categoryGroup && s.path_key === pathKey)
      .filter(s => qty >= s.qty_min && (s.qty_max == null || qty <= s.qty_max));

    if (matchingStrategies.length === 0) {
      // No strategy configured — fall back to universal (*)
      const universalStrategies = autoStrategies
        .filter(s => s.category_group === categoryGroup && s.path_key === '*')
        .filter(s => qty >= s.qty_min && (s.qty_max == null || qty <= s.qty_max));
      if (universalStrategies.length === 0) return { action: 'Skip' }; // No strategy — skip, never decline
      return computeAction(offer, universalStrategies[0]);
    }

    return computeAction(offer, matchingStrategies[0]);
  };

  const computeAction = (
    offer: OfferItem,
    strategy: { discount_type: string; discount_value: number },
  ): { action: string; counterPrice?: number } => {
    const buyNow = offer.buyItNowPrice || 0;
    const offerPrice = offer.offerPrice || 0;
    if (buyNow <= 0) return { action: 'Skip' }; // No price data — skip, never decline

    let counterPrice: number;
    if (strategy.discount_type === 'PERCENT') {
      counterPrice = buyNow * (1 - strategy.discount_value / 100);
    } else {
      counterPrice = buyNow - strategy.discount_value;
    }
    counterPrice = Math.max(0, Math.round(counterPrice * 100) / 100);

    if (offerPrice >= counterPrice) return { action: 'Accept' };
    // Normalize counter offer to .99 pricing (e.g. $31.48 → $30.99)
    const normalizedCounter = Math.max(0.99, Math.floor(counterPrice) - 0.01);
    return { action: 'Counter', counterPrice: normalizedCounter };
  };

  const handleAutoReply = async () => {
    const selectedOffers = offers.filter(o => selectedIds.has(o.bestOfferId || ''));
    console.log('[AutoReply] Selected offers:', selectedOffers.length, selectedOffers.map(o => o.bestOfferId));
    if (selectedOffers.length === 0) {
      console.warn('[AutoReply] No offers selected, aborting');
      return;
    }

    setLoading(true);
    let completed = 0;
    let successCount = 0;
    const total = selectedOffers.length;
    setLoadingMessage(t('replying', { count: `0/${total}` }));

    // Process one offer at a time to avoid eBay API issues
    for (const offer of selectedOffers) {
      completed++;
      setLoadingMessage(t('replying', { count: `${completed}/${total}` }));

      const auto = computeAutoAction(offer);
      const seller = offer.seller || 'espartsplus';

      // Skip offers that can't be auto-replied (missing data / no matching rule)
      if (auto.action === 'Skip') {
        console.log(`[AutoReply] [${completed}/${total}] bestOfferId=${offer.bestOfferId} → SKIP (no matching rule or missing data)`);
        continue;
      }

      console.log(`[AutoReply] [${completed}/${total}] bestOfferId=${offer.bestOfferId} → action=${auto.action}${auto.counterPrice != null ? ` counterPrice=${auto.counterPrice}` : ''}`);

      try {
        const request: RespondToOffersRequest = {
          seller,
          offers: [{
            bestOfferId: offer.bestOfferId || '',
            itemId: offer.itemId || '',
            action: auto.action,
            ...(auto.counterPrice != null ? { counterPrice: auto.counterPrice } : {}),
            ...(offer.quantity ? { quantity: offer.quantity } : {}),
          }],
        };
        console.log(`[AutoReply] [${completed}/${total}] Sending request...`, JSON.stringify(request));
        const res = await salesApi.respondToOffers(request);
        console.log(`[AutoReply] [${completed}/${total}] Response:`, JSON.stringify(res));
        if (res.successCount > 0) {
          successCount++;
          // Immediately remove successful offer from UI
          const offerId = offer.bestOfferId || '';
          setOffers(prev => prev.filter(o => o.bestOfferId !== offerId));
          setSelectedIds(prev => { const n = new Set(prev); n.delete(offerId); return n; });
        }
      } catch (err) {
        console.error(`[AutoReply] [${completed}/${total}] Error:`, err);
        // Continue to next offer on failure
      }
    }

    console.log(`[AutoReply] Done. Success: ${successCount}/${total}`);
    setLoading(false);
    setLoadingMessage('');
  };

  // Status color helper
  const statusColor = (status?: string): string => {
    switch (status) {
      case 'Active':
      case 'Pending': return colors.orange;
      case 'Accepted': return colors.green;
      case 'Declined':
      case 'AdminEnded': return colors.red;
      case 'Expired': return colors.textTertiary;
      case 'Retracted': return colors.purple;
      default: return colors.textSecondary;
    }
  };

  const statusLabel = (status?: string): string => {
    switch (status) {
      case 'Active':
      case 'Pending': return t('statusPending');
      case 'Accepted': return t('statusAccepted');
      case 'Declined':
      case 'AdminEnded': return t('statusDeclined');
      case 'Expired': return t('statusExpired');
      case 'Countered': return t('statusCountered');
      case 'Retracted': return t('statusRetracted');
      default: return status || '—';
    }
  };

  // Filtering
  const filteredOffers = offers.filter(offer => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = (offer.itemTitle?.toLowerCase().includes(q)) ||
        (offer.itemId?.toLowerCase().includes(q)) ||
        (offer.buyerUserId?.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filterStatus !== 'all') {
      const s = offer.status?.toLowerCase();
      if (filterStatus === 'pending' && s !== 'active' && s !== 'pending') return false;
      if (filterStatus === 'accepted' && s !== 'accepted') return false;
      if (filterStatus === 'declined' && s !== 'declined' && s !== 'adminended') return false;
      if (filterStatus === 'expired' && s !== 'expired') return false;
    }
    if (filterSeller !== 'all' && offer.seller !== filterSeller) return false;
    return true;
  });

  const GRID_COLS = '40px 120px 130px 2fr 120px 140px 100px 100px 60px 160px 120px';

  return (
    <div
      className="min-h-screen pb-20 relative"
      style={{ backgroundColor: colors.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
    >
      {/* Loading overlay */}
      {loading && (
        <LoadingOverlay accentColor={colors.controlAccent} isAllSellers={true} message={loadingMessage} />
      )}

      {/* Header */}
      <section className="max-w-[1800px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <ListingTabSelector />
            <p style={{ color: colors.textSecondary }} className="text-[15px] mt-3">
              {offers.length > 0
                ? t('subtitle', { count: offers.length })
                : t('subtitleLoading')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto Reply button — uses automation rules to decide Accept/Counter/Decline */}
            <button
              onClick={() => {
                if (selectedIds.size === 0) return;
                handleAutoReply();
              }}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: selectedIds.size > 0 ? colors.green : colors.textTertiary }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('replyAuto')} {selectedIds.size > 0 && `(${selectedIds.size})`}
            </button>

            {/* SSE status */}
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: sseConnected ? colors.green : colors.textTertiary }}
              title={sseConnected ? 'Real-time connected' : 'Connecting...'}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: sseConnected ? colors.green : colors.textTertiary }}
              />
              {sseConnected ? 'Live' : '...'}
            </span>

            {fetchedAt && (
              <span style={{ color: colors.textTertiary }} className="text-[11px]">
                {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}

            <button
              onClick={refreshOffers}
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
            {/* Checkbox */}
            <div className="px-3 py-3 flex justify-center">
              <input
                type="checkbox"
                checked={filteredOffers.length > 0 && filteredOffers.every(o => selectedIds.has(o.bestOfferId || ''))}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500"
              />
            </div>
            {/* Seller */}
            <div className="px-3 py-3">{t('colSeller')}</div>
            {/* Root SKU */}
            <div className="px-3 py-3">{t('colRootSku')}</div>
            {/* Item Title */}
            <div className="px-3 py-3">{t('colItemTitle')}</div>
            {/* Item ID */}
            <div className="px-3 py-3">{t('colItemId')}</div>
            {/* Buyer */}
            <div className="px-3 py-3">{t('colBuyer')}</div>
            {/* Original Price */}
            <div className="px-3 py-3">{t('colOriginalPrice')}</div>
            {/* Offer Price */}
            <div className="px-3 py-3">{t('colOfferPrice')}</div>
            {/* Qty */}
            <div className="px-3 py-3">{t('colQuantity')}</div>
            {/* Sent At */}
            <div className="px-3 py-3">{t('colSentAt')}</div>
            {/* Expires */}
            <div className="px-3 py-3">{t('colExpiry')}</div>
          </div>

          {/* Empty state */}
          {filteredOffers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-12 h-12 mb-3" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <p style={{ color: colors.textTertiary }} className="text-[14px]">
                {!dataReady
                  ? t('emptyClickRefresh')
                  : searchQuery || filterStatus !== 'all'
                    ? t('emptyNoMatch')
                    : t('emptyNoOffers')}
              </p>
            </div>
          )}

          {/* Table Body */}
          {filteredOffers.map((offer, idx) => {
            const isFlashing = flashIds.has(offer.bestOfferId || '');
            const isSelected = selectedIds.has(offer.bestOfferId || '');
            return (
              <div
                key={offer.bestOfferId || idx}
                className="grid items-center text-[13px] transition-all hover:opacity-90"
                style={{
                  gridTemplateColumns: GRID_COLS,
                  borderBottom: `1px solid ${colors.border}`,
                  color: colors.text,
                  backgroundColor: isFlashing
                    ? `${colors.green}20`
                    : isSelected
                      ? `${colors.controlAccent}08`
                      : idx % 2 === 0 ? 'transparent' : `${colors.bgTertiary}40`,
                  transition: 'background-color 1s ease',
                }}
              >
                {/* Checkbox */}
                <div className="px-3 py-3 flex justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(offer.bestOfferId || '')}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Seller */}
                <div className="px-3 py-3 truncate text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {offer.seller || '—'}
                </div>

                {/* Root SKU */}
                {(() => {
                  const customLabel = skuMap[offer.itemId || ''];
                  const parsed = parseCustomLabel(customLabel);
                  return (
                    <div className="px-3 py-3" title={customLabel || ''}>
                      <span
                        style={{
                          color: parsed.valid ? colors.text : colors.red,
                          backgroundColor: !parsed.valid ? `${colors.red}10` : 'transparent',
                        }}
                        className={`text-[12px] font-mono truncate block ${!parsed.valid ? 'px-1.5 py-0.5 rounded' : ''}`}
                      >
                        {parsed.display}
                      </span>
                    </div>
                  );
                })()}

                {/* Item Title */}
                <div className="px-3 py-3 truncate" title={offer.itemTitle || ''}>
                  {offer.itemTitle || '—'}
                </div>

                {/* Item ID */}
                <div className="px-3 py-3 font-mono text-[11px]" style={{ color: colors.textSecondary }}>
                  {offer.itemId || '—'}
                </div>

                {/* Buyer */}
                <div className="px-3 py-3 truncate" style={{ color: colors.textSecondary }}>
                  {offer.buyerUserId || '—'}
                </div>

                {/* Original Price */}
                <div className="px-3 py-3" style={{ color: colors.textSecondary }}>
                  {offer.buyItNowPrice != null ? `$${offer.buyItNowPrice.toFixed(2)}` : '—'}
                </div>

                {/* Offer Price */}
                <div className="px-3 py-3 font-medium">
                  {offer.offerPrice != null ? `$${offer.offerPrice.toFixed(2)}` : '—'}
                </div>

                {/* Quantity */}
                <div className="px-3 py-3 text-center" style={{ color: colors.textSecondary }}>
                  {offer.quantity ?? 1}
                </div>

                {/* Sent At — YYYY-MM-DD HH:MM:SS */}
                <div className="px-3 py-3 text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {formatDateTime(offer.creationTime)}
                </div>

                {/* Elapsed — how long since offer was sent */}
                <div className="px-3 py-3 text-[11px] font-mono" style={{ color: colors.textSecondary }}>
                  {elapsedSince(offer.creationTime)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer count */}
        {filteredOffers.length > 0 && (
          <div className="mt-3">
            <span style={{ color: colors.textSecondary }} className="text-[13px]">
              {t('itemsTotal', { total: filteredOffers.length })}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
