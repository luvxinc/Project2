'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi, ListingItem } from '@/lib/api/sales';
import { PromoteModal, RepriceModal } from './bulk-actions';
import { LoadingOverlay } from './loading-overlay';
import { parseCustomLabel } from './sku-parser';
import { getListingStockHealth, stockLevelColor as getStockLevelColor, StockLevel } from './stock-health';
import ListingTabSelector from '../components/ListingTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════

export default function ListingsPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.listings');

  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalEntries, setTotalEntries] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof ListingItem>('soldQuantity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [flashItems, setFlashItems] = useState<Set<string>>(new Set());
  const [sseConnected, setSseConnected] = useState(false);
  const listingsRef = useRef<ListingItem[]>([]);

  // Selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Modal state
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showRepriceModal, setShowRepriceModal] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Fetching listings from eBay...');
  const [editSkuItem, setEditSkuItem] = useState<{ itemId: string; seller: string; currentSku: string } | null>(null);
  const [editSkuValue, setEditSkuValue] = useState('');
  const [editSkuLoading, setEditSkuLoading] = useState(false);

  // Filters
  const [activeSeller, setActiveSeller] = useState('all');
  const [availableSellers, setAvailableSellers] = useState<string[]>([]);
  const [filterRootSku, setFilterRootSku] = useState('');
  const [filterStock, setFilterStock] = useState<'all' | 'out' | 'low' | 'in'>('all');
  const [filterPromoted, setFilterPromoted] = useState<'all' | 'yes' | 'no'>('all');
  const [filterSkuStatus, setFilterSkuStatus] = useState<'all' | 'valid' | 'invalid'>('all');
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Keep ref in sync
  useEffect(() => { listingsRef.current = listings; }, [listings]);

  // Fetch sellers for filter
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
    // Load stock map for stock health column
    const fetchStockMap = async () => {
      try {
        const res = await salesApi.getStockMap();
        if (res.stockMap) setStockMap(res.stockMap);
      } catch { /* ignore */ }
    };
    fetchStockMap();
    // Load automation rules
    const fetchAutomationRules = async () => {
      try {
        const baseUrl = getApiBaseUrlCached();
        const res = await fetch(`${baseUrl}/automation/rules`);
        const data = await res.json();
        const rulesArr = data.rules || [];
        const rMap: Record<string, string> = {};
        for (const r of rulesArr) rMap[`${r.module}.${r.rule_key}`] = r.rule_value;
        setAdsRules({
          aggressive_offset: parseFloat(rMap['ADS.aggressive_offset'] || '3'),
          conservative_offset: parseFloat(rMap['ADS.conservative_offset'] || '3'),
          ad_rate_max: parseFloat(rMap['ADS.ad_rate_max'] || '8'),
          ad_rate_min: parseFloat(rMap['ADS.ad_rate_min'] || '2'),
        });
      } catch { /* ignore */ }
    };
    fetchAutomationRules();
    // Load known SKUs from products DB
    const fetchKnownSkus = async () => {
      try {
        const baseUrl = getApiBaseUrlCached();
        const res = await fetch(`${baseUrl}/automation/sku-categories`);
        const data = await res.json();
        const cats = data.skuCategories || {};
        setKnownSkus(new Set(Object.keys(cats).map(s => s.toUpperCase())));
        setKnownSkusLoaded(true);
      } catch { setKnownSkusLoaded(true); /* still mark as loaded so parse-only check works */ }
    };
    fetchKnownSkus();
  }, []);

  // Warehouse stock by SKU (from FIFO layers)
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  // Automation rules loaded from DB
  const [adsRules, setAdsRules] = useState<{ aggressive_offset?: number; conservative_offset?: number; ad_rate_max?: number; ad_rate_min?: number }>({});
  // Known SKUs from products DB
  const [knownSkus, setKnownSkus] = useState<Set<string>>(new Set());
  const [knownSkusLoaded, setKnownSkusLoaded] = useState(false);

  // Stock level i18n labels
  const stockLevelLabel: Record<StockLevel, string> = {
    'critically-low': t('stockCriticallyLow'),
    'low': t('stockLow'),
    'normal': t('stockNormal'),
    'high': t('stockHigh'),
    'very-high': t('stockVeryHigh'),
    'unknown': '—',
  };

  // dataReady tracks whether any successful fetch has occurred
  const [dataReady, setDataReady] = useState(false);

  // Load cached data from database (instant, no eBay API call)
  // Always loads ALL sellers — seller filter is purely client-side
  const loadCached = useCallback(async () => {
    try {
      const res = await salesApi.getActiveListings({ seller: 'all' });
      setListings(res.items || []);
      setTotalEntries(res.totalEntries || 0);
      setFetchedAt(res.fetchedAt);
      if ((res.items || []).length > 0) setDataReady(true);
      setSelectedItems(new Set());
      if (res.stats) {
        setPageStats(res.stats);
        setGlobalStats(res.stats);
      }
    } catch { /* cache miss is fine, user can click Refresh */ }
  }, []);

  // Refresh from eBay API (slow, saves to cache)
  // Always refreshes ALL sellers
  const fetchListings = useCallback(async () => {
    setLoadingMessage(t('fetchingListings'));
    setLoading(true);
    setError(null);
    try {
      const res = await salesApi.refreshListings({ seller: 'all' });
      setListings(res.items || []);
      setTotalEntries(res.totalEntries || 0);
      setFetchedAt(res.fetchedAt);
      setDataReady(true);
      setSelectedItems(new Set());
      if (res.stats) {
        setPageStats(res.stats);
        setGlobalStats(res.stats);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch listings';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load cached data on mount only
  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // ═══ Selection helpers ═══
  const toggleSelect = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = (filteredIds: string[]) => {
    const allSelected = filteredIds.every(id => selectedItems.has(id));
    if (allSelected) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  // ═══ Partial‐refresh helper: re-fetch only specific items, merge into state ═══
  const refreshPartial = useCallback(async (affectedItemIds: string[]) => {
    if (affectedItemIds.length === 0) return;

    // Group by seller
    const sellerMap = new Map<string, string[]>();
    for (const id of affectedItemIds) {
      const item = listings.find(l => l.itemId === id);
      const seller = item?.seller || activeSeller;
      if (!sellerMap.has(seller)) sellerMap.set(seller, []);
      sellerMap.get(seller)!.push(id);
    }

    const refreshed: ListingItem[] = [];
    for (const [seller, ids] of sellerMap) {
      try {
        const res = await salesApi.partialRefresh({ seller, itemIds: ids });
        if (res.items) refreshed.push(...res.items);
      } catch { /* partial refresh failure is non-fatal */ }
    }

    if (refreshed.length > 0) {
      const refreshedMap = new Map(refreshed.map(r => [r.itemId, r]));
      setListings(prev => {
        const updated = prev.map(item =>
          refreshedMap.has(item.itemId) ? { ...item, ...refreshedMap.get(item.itemId)! } : item
        );
        // Recalculate stats from updated listings (same thresholds as backend)
        let outOfStock = 0, lowStock = 0, inStock = 0;
        let promotedActive = 0, promotedOff = 0;
        for (const item of updated) {
          const avail = item.availableQuantity ?? 0;
          if (avail <= 0) outOfStock++;
          else if (avail <= 5) lowStock++;
          else inStock++;
          if (item.promoted) promotedActive++; else promotedOff++;
        }
        setPageStats({ outOfStock, lowStock, inStock, promotedActive, promotedOff });
        setGlobalStats({ outOfStock, lowStock, inStock, promotedActive, promotedOff });
        return updated;
      });
      setFetchedAt(new Date().toISOString());

      // Flash the updated rows
      const flashSet = new Set(refreshed.map(r => r.itemId));
      setFlashItems(flashSet);
      setTimeout(() => setFlashItems(new Set()), 3000);
    }
  }, [listings, activeSeller]);

  // Parse root SKU for each listing (computed early so bulk actions can filter invalid SKUs)
  // Convert knownSkus set to array for prefix matching (same pattern as offers page)
  const knownSkuArray = Array.from(knownSkus);
  const listingsWithRootSku = listings.map(item => {
    const rootSku = parseCustomLabel(item.sku);
    // SKU is "in DB" if parser succeeded AND all extracted SKUs can be prefix-matched
    // against any product in the database (same bidirectional startsWith used in offers page)
    // Before knownSkus loads, skip DB check (treat as valid to avoid false alarms)
    const skuInDb = rootSku.valid && rootSku.skus.length > 0 &&
      (!knownSkusLoaded || rootSku.skus.every(s => {
        const upper = s.toUpperCase();
        return knownSkuArray.some(dbSku => upper.startsWith(dbSku) || dbSku.startsWith(upper));
      }));
    return { ...item, rootSku, skuInDb };
  });

  // ═══ Bulk Actions ═══
  // Filter out listings with invalid Root SKU — all automation rules skip these
  const getSelectedListings = () => {
    const withSku = listingsWithRootSku.filter(l => selectedItems.has(l.itemId));
    return withSku.filter(l => l.skuInDb);
  };
  const invalidSkuCount = listingsWithRootSku.filter(l => !l.skuInDb).length;

  const handleBulkRestock = async () => {
    const selected = getSelectedListings();
    if (selected.length === 0) return;

    // Group by seller
    const bySeller = new Map<string, typeof selected>();
    selected.forEach(item => {
      const s = item.seller || activeSeller;
      if (!bySeller.has(s)) bySeller.set(s, []);
      bySeller.get(s)!.push(item);
    });

    setLoadingMessage(`Restocking ${selected.length} listings...`);
    setLoading(true);
    try {
      const affectedIds: string[] = [];
      for (const [seller, items] of bySeller) {
        await salesApi.bulkRestock({
          seller,
          items: items.map(i => ({ itemId: i.itemId, sku: i.sku, soldQuantity: i.soldQuantity })),
        });
        affectedIds.push(...items.map(i => i.itemId));
      }
      setSelectedItems(new Set());
      // Partial refresh only the affected items
      await refreshPartial(affectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restock failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPromote = async (strategy: 'conservative' | 'balanced' | 'aggressive', cap: number) => {
    setShowPromoteModal(false);
    const selected = getSelectedListings();
    if (selected.length === 0) return;

    const bySeller = new Map<string, typeof selected>();
    selected.forEach(item => {
      const s = item.seller || activeSeller;
      if (!bySeller.has(s)) bySeller.set(s, []);
      bySeller.get(s)!.push(item);
    });

    setLoadingMessage(`Promoting ${selected.length} listings...`);
    setLoading(true);
    try {
      const affectedIds: string[] = [];
      for (const [seller, items] of bySeller) {
        const mappedItems = items.map(item => {
          const suggested = item.suggestedAdRate ?? 5;
          const aggOffset = adsRules.aggressive_offset ?? 3;
          const conOffset = adsRules.conservative_offset ?? 3;
          const rateMax = adsRules.ad_rate_max ?? 8;
          const rateMin = adsRules.ad_rate_min ?? 2;
          let rate = suggested;
          if (strategy === 'conservative') rate = suggested - conOffset;
          if (strategy === 'aggressive') rate = suggested + aggOffset;
          rate = Math.min(rate, cap);
          rate = Math.max(rateMin, rate); // respect configured minimum
          rate = Math.min(rate, rateMax); // respect configured maximum
          return { listingId: item.itemId, bidPercentage: rate.toFixed(1) };
        });
        await salesApi.bulkPromote({ seller, items: mappedItems });
        affectedIds.push(...items.map(i => i.itemId));
      }
      setSelectedItems(new Set());
      await refreshPartial(affectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReprice = async (price: number) => {
    setShowRepriceModal(false);
    const selected = getSelectedListings();
    if (selected.length === 0) return;

    const bySeller = new Map<string, typeof selected>();
    selected.forEach(item => {
      const s = item.seller || activeSeller;
      if (!bySeller.has(s)) bySeller.set(s, []);
      bySeller.get(s)!.push(item);
    });

    setLoadingMessage(`Repricing ${selected.length} listings to $${price.toFixed(2)}...`);
    setLoading(true);
    try {
      const affectedIds: string[] = [];
      for (const [seller, items] of bySeller) {
        await salesApi.bulkReprice({
          seller,
          price,
          items: items.map(i => ({ itemId: i.itemId, sku: i.sku })),
        });
        affectedIds.push(...items.map(i => i.itemId));
      }
      setSelectedItems(new Set());
      await refreshPartial(affectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprice failed');
    } finally {
      setLoading(false);
    }
  };

  // ═══ Edit Custom Label (SKU) ═══
  const handleUpdateSku = async () => {
    if (!editSkuItem || !editSkuValue.trim()) return;
    setEditSkuLoading(true);
    try {
      await salesApi.updateSku({
        seller: editSkuItem.seller,
        itemId: editSkuItem.itemId,
        newSku: editSkuValue.trim(),
      });
      // Update local state immediately (triggers re-parse + re-validate)
      setListings(prev => prev.map(item =>
        item.itemId === editSkuItem.itemId
          ? { ...item, sku: editSkuValue.trim() }
          : item
      ));
      // Flash the updated row
      setFlashItems(new Set([editSkuItem.itemId]));
      setTimeout(() => setFlashItems(new Set()), 2500);
      // Close modal
      setEditSkuItem(null);
      setEditSkuValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update SKU failed');
    } finally {
      setEditSkuLoading(false);
    }
  };

  // ═══ SSE: 实时接收销售事件，精确更新对应行 ═══
  useEffect(() => {
    const baseUrl = getApiBaseUrlCached();
    const sseUrl = `${baseUrl}/ebay/sync/listings/events?seller=${encodeURIComponent(activeSeller)}`;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource(sseUrl);

      es.addEventListener('connected', () => {
        setSseConnected(true);
      });

      es.addEventListener('sale', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'ITEM_SOLD' || !Array.isArray(payload.items)) return;

          const soldMap = new Map<string, number>();
          const flashSet = new Set<string>();

          for (const si of payload.items) {
            if (si.itemId) {
              soldMap.set(si.itemId, (soldMap.get(si.itemId) || 0) + (si.quantitySold || 1));
              flashSet.add(si.itemId);
            }
          }

          setListings(prev => {
            const updated = prev.map(item => {
              const qty = soldMap.get(item.itemId);
              if (qty === undefined) return item;
              return {
                ...item,
                soldQuantity: item.soldQuantity + qty,
                availableQuantity: Math.max(0, item.availableQuantity - qty),
              };
            });
            // Recalculate stats (same thresholds as backend)
            let outOfStock = 0, lowStock = 0, inStock = 0;
            let promotedActive = 0, promotedOff = 0;
            for (const item of updated) {
              const avail = item.availableQuantity ?? 0;
              if (avail <= 0) outOfStock++;
              else if (avail <= 5) lowStock++;
              else inStock++;
              if (item.promoted) promotedActive++; else promotedOff++;
            }
            setPageStats({ outOfStock, lowStock, inStock, promotedActive, promotedOff });
            setGlobalStats({ outOfStock, lowStock, inStock, promotedActive, promotedOff });
            return updated;
          });

          setFlashItems(prev => new Set([...prev, ...flashSet]));
          setTimeout(() => {
            setFlashItems(prev => {
              const next = new Set(prev);
              flashSet.forEach(id => next.delete(id));
              return next;
            });
          }, 2500);
        } catch (e) {
          console.warn('SSE sale event parse error:', e);
        }
      });

      es.onerror = () => {
        setSseConnected(false);
        es?.close();
        retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      setSseConnected(false);
    };
  }, [activeSeller]);

  // Sort logic
  const handleSort = (field: keyof ListingItem) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'title' || field === 'sku' ? 'asc' : 'desc');
    }
  };


  // Filter + Sort
  const filteredListings = listingsWithRootSku
    .filter(item => {
      // Seller filter (client-side)
      if (activeSeller !== 'all' && item.seller && item.seller !== activeSeller) return false;
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchSearch = (
          item.title.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.itemId.includes(q) ||
          item.rootSku.display.toLowerCase().includes(q)
        );
        if (!matchSearch) return false;
      }
      // Root SKU filter (client-side text match)
      if (filterRootSku) {
        const q = filterRootSku.toUpperCase();
        const matchRootSku = item.rootSku.skus.some(s => s.includes(q)) ||
          item.rootSku.display.toUpperCase().includes(q);
        if (!matchRootSku) return false;
      }
      // Stock filter
      if (filterStock === 'out' && item.availableQuantity > 0) return false;
      if (filterStock === 'low' && (item.availableQuantity <= 0 || item.availableQuantity > 5)) return false;
      if (filterStock === 'in' && item.availableQuantity <= 0) return false;
      // Promoted filter
      if (filterPromoted === 'yes' && !item.promoted) return false;
      if (filterPromoted === 'no' && item.promoted) return false;
      // SKU status filter (checks both parse validity AND product DB existence)
      if (filterSkuStatus === 'valid' && !item.skuInDb) return false;
      if (filterSkuStatus === 'invalid' && item.skuInDb) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

  const SortIcon = ({ field }: { field: keyof ListingItem }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3 h-3 ml-1 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        {sortDir === 'asc' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        )}
      </svg>
    );
  };

  // Active filter count for badge
  const activeFilterCount = [
    filterRootSku,
    filterStock !== 'all',
    filterPromoted !== 'all',
    filterSkuStatus !== 'all',
  ].filter(Boolean).length;

  // Stats from the main listing response (inline, no extra call)
  const [pageStats, setPageStats] = useState<{
    outOfStock: number; lowStock: number; inStock: number;
    promotedActive: number; promotedOff: number;
  } | null>(null);

  // Global stats: fetch from /stats endpoint (overrides page stats when ready)
  const [globalStats, setGlobalStats] = useState<{
    outOfStock: number; lowStock: number; inStock: number;
    promotedActive: number; promotedOff: number;
  } | null>(null);

  // Stats come directly from the main response (which now fetches all items)
  const displayStats = globalStats || pageStats;

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen relative">
      {/* Full-page loading overlay with elapsed timer */}
      {loading && (
        <LoadingOverlay accentColor={colors.controlAccent} isAllSellers={activeSeller === 'all'} message={loadingMessage} />
      )}
      {/* Header */}
      <section className="max-w-[1800px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <ListingTabSelector />
            <p style={{ color: colors.textSecondary }} className="text-[15px] mt-3">
              {totalEntries > 0
                ? t('subtitle', { count: totalEntries })
                : t('subtitleLoading')}
            </p>
          </div>

          <div className="flex items-center gap-3">

            {/* Connection status — green if data fetched, SSE as bonus */}
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: dataReady ? colors.green : colors.textTertiary }}
              title={
                sseConnected
                  ? t('statusLive')
                  : dataReady
                    ? t('statusSynced')
                    : t('statusConnecting')
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: dataReady ? colors.green : colors.textTertiary,
                  boxShadow: dataReady ? `0 0 6px ${colors.green}` : 'none',
                }}
              />
              {dataReady ? (sseConnected ? t('live') : t('synced')) : t('offline')}
            </span>

            {fetchedAt && (
              <span style={{ color: colors.textTertiary }} className="text-[11px]">
                {t('updated', { time: new Date(fetchedAt).toLocaleTimeString() })}
              </span>
            )}

            {/* Refresh button */}
            <button
              onClick={() => fetchListings()}
              disabled={loading}
              style={{
                backgroundColor: colors.controlAccent,
                color: '#fff',
                opacity: loading ? 0.6 : 1,
              }}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90 flex items-center gap-2"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {loading ? t('loading') : t('refresh')}
            </button>

            {/* Bulk Action Buttons */}
            {selectedItems.size > 0 && (
              <>
                <div className="w-px h-6" style={{ backgroundColor: colors.border }} />

                <button
                  onClick={handleBulkRestock}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, border: `1px solid ${colors.border}` }}
                >
                  {t('restock')}
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ backgroundColor: `${colors.controlAccent}20`, color: colors.controlAccent }}>
                    {selectedItems.size}
                  </span>
                </button>

                <button
                  onClick={() => setShowPromoteModal(true)}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, border: `1px solid ${colors.border}` }}
                >
                  {t('ads')}
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ backgroundColor: `${colors.controlAccent}20`, color: colors.controlAccent }}>
                    {selectedItems.size}
                  </span>
                </button>

                <button
                  onClick={() => setShowRepriceModal(true)}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, border: `1px solid ${colors.border}` }}
                >
                  {t('reprice')}
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ backgroundColor: `${colors.controlAccent}20`, color: colors.controlAccent }}>
                    {selectedItems.size}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Search Bar + Filter Toggle */}
      <section className="max-w-[1800px] mx-auto px-6 pb-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
            }}
            className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border"
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              style={{ color: colors.textTertiary }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                color: colors.text,
                backgroundColor: 'transparent',
              }}
              className="flex-1 text-[14px] outline-none placeholder:opacity-40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ color: colors.textTertiary }}
                className="text-[12px] hover:opacity-70"
              >
                {t('clear')}
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              backgroundColor: showFilters || activeFilterCount > 0 ? `${colors.controlAccent}15` : colors.bgSecondary,
              borderColor: showFilters || activeFilterCount > 0 ? colors.controlAccent : colors.border,
              color: showFilters || activeFilterCount > 0 ? colors.controlAccent : colors.textSecondary,
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-all hover:opacity-80"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            {t('filters')}
            {activeFilterCount > 0 && (
              <span
                className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: colors.controlAccent }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* Stats Bar */}
      {displayStats && (
        <section className="max-w-[1800px] mx-auto px-6 pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Stock Stats */}
            <div className="flex items-center gap-3">
              <span style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">{t('stockLabel')}</span>
              <button
                onClick={() => { setShowFilters(true); setFilterStock('out'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.red }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.red }} />
                {displayStats.outOfStock} {t('statsOut')}
              </button>
              <button
                onClick={() => { setShowFilters(true); setFilterStock('low'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.orange }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.orange }} />
                {displayStats.lowStock} {t('statsLow')}
              </button>
              <button
                onClick={() => { setShowFilters(true); setFilterStock('in'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.green }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.green }} />
                {displayStats.inStock} {t('statsIn')}
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

            {/* Promoted Stats */}
            <div className="flex items-center gap-3">
              <span style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">{t('promotedLabel')}</span>
              <button
                onClick={() => { setShowFilters(true); setFilterPromoted('yes'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.green }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.green }} />
                {displayStats.promotedActive} {t('promoActive')}
              </button>
              <button
                onClick={() => { setShowFilters(true); setFilterPromoted('no'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.textTertiary }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.textTertiary }} />
                {displayStats.promotedOff} {t('promoOff')}
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

            {/* SKU Status Stats */}
            <div className="flex items-center gap-3">
              <span style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">SKU</span>
              {invalidSkuCount > 0 && (
                <button
                  onClick={() => { setShowFilters(true); setFilterSkuStatus('invalid'); }}
                  className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ color: colors.red }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.red }} />
                  {invalidSkuCount} {t('skuInvalid')}
                </button>
              )}
              <button
                onClick={() => { setShowFilters(true); setFilterSkuStatus('valid'); }}
                className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: colors.green }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.green }} />
                {listingsWithRootSku.length - invalidSkuCount} {t('skuValid')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <section className="max-w-[1800px] mx-auto px-6 pb-4">
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
            }}
            className="rounded-xl border p-4"
          >
            <div className="flex items-center flex-wrap gap-4">
              {/* Seller Filter */}
              <div className="flex flex-col gap-1">
                <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">
                  {t('filterSeller')}
                </label>
                <select
                  value={activeSeller}
                  onChange={(e) => {
                    setActiveSeller(e.target.value);
                    setFilterSeller(e.target.value);
                  }}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: colors.border,
                    color: colors.text,
                  }}
                  className="px-3 py-1.5 rounded-lg border text-[13px] outline-none cursor-pointer min-w-[160px]"
                >
                  <option value="all">{t('filterAllSellers')}</option>
                  {(availableSellers.length > 0 ? availableSellers : []).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Root SKU Filter */}
              <div className="flex flex-col gap-1">
                <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">
                  {t('filterRootSku')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. NU1C8E51K"
                  value={filterRootSku}
                  onChange={(e) => setFilterRootSku(e.target.value)}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: colors.border,
                    color: colors.text,
                  }}
                  className="px-3 py-1.5 rounded-lg border text-[13px] w-[180px] outline-none font-mono"
                />
              </div>

              {/* Stock Filter — 4 states */}
              <div className="flex flex-col gap-1">
                <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">
                  {t('filterStock')}
                </label>
                <div className="flex items-center gap-1">
                  {([['all', t('filterAll')], ['out', t('filterOutOfStock')], ['low', t('filterLowStock')], ['in', t('filterInStock')]] as [string, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setFilterStock(val as 'all' | 'out' | 'low' | 'in'); }}
                      style={{
                        backgroundColor: filterStock === val
                          ? val === 'out' ? `${colors.red}15`
                            : val === 'low' ? `${colors.orange}15`
                            : val === 'in' ? `${colors.green}15`
                            : `${colors.controlAccent}15`
                          : colors.bgTertiary,
                        borderColor: filterStock === val
                          ? val === 'out' ? colors.red
                            : val === 'low' ? colors.orange
                            : val === 'in' ? colors.green
                            : colors.controlAccent
                          : colors.border,
                        color: filterStock === val
                          ? val === 'out' ? colors.red
                            : val === 'low' ? colors.orange
                            : val === 'in' ? colors.green
                            : colors.controlAccent
                          : colors.textSecondary,
                      }}
                      className="px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-all whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Promoted Filter */}
              <div className="flex flex-col gap-1">
                <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">
                  {t('filterPromoted')}
                </label>
                <div className="flex items-center gap-1">
                  {(['all', 'yes', 'no'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => { setFilterPromoted(opt); }}
                      style={{
                        backgroundColor: filterPromoted === opt
                          ? `${colors.controlAccent}15`
                          : colors.bgTertiary,
                        borderColor: filterPromoted === opt
                          ? colors.controlAccent
                          : colors.border,
                        color: filterPromoted === opt
                          ? colors.controlAccent
                          : colors.textSecondary,
                      }}
                      className="px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-all"
                    >
                      {opt === 'all' ? t('filterAll') : opt === 'yes' ? t('filterActive') : t('filterOff')}
                    </button>
                  ))}
                </div>
              </div>

              {/* SKU Status Filter */}
              <div className="flex flex-col gap-1">
                <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium">
                  {t('filterSkuStatus')}
                </label>
                <div className="flex items-center gap-1">
                  {([['all', t('filterAll')], ['valid', t('skuValid')], ['invalid', t('skuInvalid')]] as [string, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setFilterSkuStatus(val as 'all' | 'valid' | 'invalid'); }}
                      style={{
                        backgroundColor: filterSkuStatus === val
                          ? val === 'invalid' ? `${colors.red}15`
                            : val === 'valid' ? `${colors.green}15`
                            : `${colors.controlAccent}15`
                          : colors.bgTertiary,
                        borderColor: filterSkuStatus === val
                          ? val === 'invalid' ? colors.red
                            : val === 'valid' ? colors.green
                            : colors.controlAccent
                          : colors.border,
                        color: filterSkuStatus === val
                          ? val === 'invalid' ? colors.red
                            : val === 'valid' ? colors.green
                            : colors.controlAccent
                          : colors.textSecondary,
                      }}
                      className="px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-all whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear All Filters */}
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilterRootSku('');
                    setFilterStock('all');
                    setFilterPromoted('all');
                    setFilterSkuStatus('all');
                  }}
                  style={{ color: colors.red }}
                  className="text-[12px] font-medium hover:opacity-70 self-end pb-1.5"
                >
                   {t('clearAll')}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Error Modal */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="rounded-2xl p-6 w-[420px] shadow-2xl"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${colors.red}15` }}>
                <svg className="w-5 h-5" style={{ color: colors.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 style={{ color: colors.text }} className="text-[16px] font-semibold">
                {t('errorTitle')}
              </h3>
            </div>
            <p style={{ color: colors.textSecondary }} className="text-[13px] leading-relaxed mb-5 pl-[52px]">
              {error}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setError(null)}
                className="px-5 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: colors.controlAccent }}
              >
                {t('errorOk')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="max-w-[1800px] mx-auto px-6 pb-10">
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          {/* Table Header */}
          <div
            style={{ borderColor: colors.border }}
            className="grid grid-cols-[36px_minmax(0,1.5fr)_90px_minmax(0,2.5fr)_minmax(0,1.2fr)_100px_90px_90px_110px_110px] border-b"
          >
            {/* Select All Checkbox */}
            <div className="flex items-center justify-center px-1 py-3">
              <input
                type="checkbox"
                checked={filteredListings.length > 0 && filteredListings.every(l => selectedItems.has(l.itemId))}
                onChange={() => toggleSelectAll(filteredListings.map(l => l.itemId))}
                className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500"
              />
            </div>
            {[
              { key: 'sku' as keyof ListingItem, label: t('colRootSku') },
              { key: '__stockHealth' as any, label: t('colStockLevel'), noSort: true },
              { key: 'title' as keyof ListingItem, label: t('colTitle') },
              { key: 'sku' as keyof ListingItem, label: t('colCustomLabel') },
              { key: 'currentPrice' as keyof ListingItem, label: t('colPrice') },
              { key: 'availableQuantity' as keyof ListingItem, label: t('colAvail') },
              { key: 'soldQuantity' as keyof ListingItem, label: t('colSold') },
              { key: 'promoted' as keyof ListingItem, label: t('colCurrentPromo') },
              { key: 'suggestedAdRate' as keyof ListingItem, label: t('colSuggestedPromo') },
            ].map((col, colIdx) => (
              <button
                key={`${col.key}-${colIdx}`}
                onClick={() => !(col as any).noSort && handleSort(col.key)}
                style={{ color: colors.textSecondary, cursor: (col as any).noSort ? 'default' : 'pointer' }}
                className="flex items-center px-4 py-3 text-[11px] uppercase tracking-wider font-medium hover:opacity-70 transition-opacity text-left"
              >
                {col.label}
                {!(col as any).noSort && <SortIcon field={col.key} />}
              </button>
            ))}
          </div>

          {/* Empty State */}
          {!loading && filteredListings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg
                className="w-12 h-12 mb-3"
                style={{ color: colors.textTertiary }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={0.8}
              >
                {!dataReady ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                )}
              </svg>
              <p style={{ color: colors.textTertiary }} className="text-[14px]">
                {!dataReady
                  ? t('emptyClickRefresh')
                  : searchQuery || activeFilterCount > 0
                    ? t('emptyNoMatch')
                    : t('emptyNoListings')}
              </p>
            </div>
          )}

          {/* Table Body */}
          <div className="divide-y" style={{ borderColor: `${colors.border}80` }}>
            {filteredListings.map((item, idx) => {
              const isFlashing = flashItems.has(item.itemId);
              return (
              <div
                key={item.itemId || idx}
                className={`grid grid-cols-[36px_minmax(0,1.5fr)_90px_minmax(0,2.5fr)_minmax(0,1.2fr)_100px_90px_90px_110px_110px] items-center hover:bg-opacity-50 ${isFlashing ? 'listing-row-flash' : ''}`}
                style={{
                  backgroundColor: isFlashing
                    ? `${colors.green}12`
                    : idx % 2 === 0 ? 'transparent' : `${colors.bgTertiary}30`,
                  transition: 'background-color 0.6s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isFlashing) e.currentTarget.style.backgroundColor = `${colors.controlAccent}08`;
                }}
                onMouseLeave={(e) => {
                  if (!isFlashing) e.currentTarget.style.backgroundColor =
                    idx % 2 === 0 ? 'transparent' : `${colors.bgTertiary}30`;
                }}
              >
                {/* Row Checkbox */}
                <div className="flex items-center justify-center px-1">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.itemId)}
                    onChange={() => toggleSelect(item.itemId)}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500"
                  />
                </div>
                {/* Root SKU */}
                <div className="px-4 py-3 min-w-0">
                  {(() => {
                    const parseFail = !item.rootSku.valid;
                    const dbMiss = item.rootSku.valid && !item.skuInDb;
                    const isAbnormal = parseFail || dbMiss;
                    const bgColor = parseFail ? colors.red : dbMiss ? colors.orange : 'transparent';
                    const tooltip = parseFail
                      ? t('invalidSkuTooltip')
                      : dbMiss
                        ? `⚠ ${item.rootSku.skus.join(', ')} — ${t('skuNotInDb')}`
                        : item.rootSku.display;
                    return (
                      <span
                        style={{
                          color: isAbnormal ? '#fff' : colors.text,
                          backgroundColor: bgColor,
                        }}
                        className={`text-[12px] font-mono truncate block ${isAbnormal ? 'px-2 py-1 rounded-md font-semibold' : ''}`}
                        title={tooltip}
                      >
                        {isAbnormal && <span className="mr-1">⚠</span>}
                        {item.rootSku.display}
                      </span>
                    );
                  })()}
                </div>

                {/* Stock Health */}
                {(() => {
                  const level = getListingStockHealth(item.rootSku.skus, item.soldQuantity, stockMap);
                  const clr = getStockLevelColor(level, colors);
                  return (
                    <div className="px-2 py-3 flex items-center justify-center">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full truncate"
                        style={{ color: clr, backgroundColor: `${clr}15`, border: `1px solid ${clr}30` }}
                        title={`Stock: ${item.rootSku.skus.map(s => `${s}: ${stockMap[s.toUpperCase()] ?? stockMap[s] ?? 0}`).join(', ')}`}
                      >
                        {stockLevelLabel[level]}
                      </span>
                    </div>
                  );
                })()}

                {/* Title */}
                <div className="px-4 py-3 min-w-0">
                  <div className="flex items-center gap-3">
                    {/* Thumbnail */}
                    {item.galleryUrl ? (
                      <img
                        src={item.galleryUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        style={{ border: `1px solid ${colors.border}` }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: colors.bgTertiary }}
                      >
                        <svg className="w-5 h-5" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      {item.viewItemUrl ? (
                        <a
                          href={item.viewItemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: colors.blue }}
                          className="text-[13px] font-medium truncate block hover:underline"
                          title={item.title}
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span
                          style={{ color: colors.text }}
                          className="text-[13px] font-medium truncate block"
                          title={item.title}
                        >
                          {item.title}
                        </span>
                      )}
                      <span style={{ color: colors.textTertiary }} className="text-[11px]">
                        #{item.itemId}
                        {item.hasVariations && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                            style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
                          >
                            {t('multiVariation')}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Custom Label (SKU) — clickable to edit */}
                <div className="px-4 py-3 min-w-0">
                  <button
                    onClick={() => {
                      setEditSkuItem({ itemId: item.itemId, seller: item.seller || activeSeller, currentSku: item.sku });
                      setEditSkuValue(item.sku || '');
                    }}
                    style={{ color: colors.blue }}
                    className="text-[12px] font-mono truncate block hover:underline cursor-pointer text-left w-full"
                    title={`${item.sku || '—'} — ${t('clickToEdit')}`}
                  >
                    {item.sku || '—'}
                    <svg className="inline-block w-3 h-3 ml-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                </div>

                {/* Price */}
                <div className="px-4 py-3">
                  <span style={{ color: colors.text }} className="text-[13px] font-medium">
                    ${item.currentPrice.toFixed(2)}
                  </span>
                </div>

                {/* Available Qty */}
                <div className="px-4 py-3">
                  <span
                    style={{
                      color: item.availableQuantity <= 0 ? colors.red
                        : item.availableQuantity <= 5 ? colors.orange
                        : colors.text,
                    }}
                    className="text-[13px] font-medium"
                  >
                    {item.availableQuantity}
                  </span>
                </div>

                {/* Sold Qty */}
                <div className="px-4 py-3">
                  <span style={{ color: colors.text }} className="text-[13px]">
                    {item.soldQuantity}
                  </span>
                </div>

                {/* Current Promo */}
                <div className="px-4 py-3">
                  {item.promoted ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: `${colors.green}15`,
                        color: colors.green,
                      }}
                    >
                      {item.adRate
                        ? `${item.adRate.toFixed(1)}%`
                        : t('promoActive')}
                    </span>
                  ) : (
                    <span style={{ color: colors.textTertiary }} className="text-[11px]">
                      {t('promoOff')}
                    </span>
                  )}
                </div>

                {/* Suggested Promo */}
                <div className="px-4 py-3">
                  {item.suggestedAdRate != null && item.suggestedAdRate > 0 ? (
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: colors.blue }}
                    >
                      {item.suggestedAdRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ color: colors.textTertiary }} className="text-[11px]">
                      --
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Item count */}
        {filteredListings.length > 0 && (
          <div className="mt-3">
            <span style={{ color: colors.textSecondary }} className="text-[13px]">
              {t('itemsTotal', { total: totalEntries })}
              {filteredListings.length !== listings.length && t('itemsShown', { shown: filteredListings.length })}
            </span>
          </div>
        )}
      </section>

      {/* Flash animation */}
      <style>{`
        @keyframes listingFlash {
          0% { box-shadow: inset 0 0 0 2px rgba(48, 209, 88, 0.5); }
          50% { box-shadow: inset 0 0 0 2px rgba(48, 209, 88, 0.15); }
          100% { box-shadow: inset 0 0 0 2px rgba(48, 209, 88, 0.5); }
        }
        .listing-row-flash {
          animation: listingFlash 1s ease-in-out 2;
        }
      `}</style>

      {/* Modals */}
      {showPromoteModal && (
        <PromoteModal
          colors={colors}
          selectedCount={selectedItems.size}
          adsRules={adsRules}
          onConfirm={handleBulkPromote}
          onClose={() => setShowPromoteModal(false)}
        />
      )}
      {showRepriceModal && (
        <RepriceModal
          colors={colors}
          selectedCount={selectedItems.size}
          onConfirm={handleBulkReprice}
          onClose={() => setShowRepriceModal(false)}
        />
      )}

      {/* Edit SKU Modal */}
      {editSkuItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="rounded-2xl p-6 w-[480px] shadow-2xl"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${colors.blue}15` }}>
                <svg className="w-5 h-5" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </div>
              <div>
                <h3 style={{ color: colors.text }} className="text-[16px] font-semibold">{t('editSkuTitle')}</h3>
                <p style={{ color: colors.textTertiary }} className="text-[12px]">#{editSkuItem.itemId}</p>
              </div>
            </div>

            <div className="mb-2">
              <label style={{ color: colors.textSecondary }} className="text-[12px] font-medium block mb-1">
                {t('editSkuCurrent')}
              </label>
              <div
                className="px-3 py-2 rounded-lg text-[13px] font-mono"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
              >
                {editSkuItem.currentSku || '—'}
              </div>
            </div>

            <div className="mb-5">
              <label style={{ color: colors.textSecondary }} className="text-[12px] font-medium block mb-1">
                {t('editSkuNew')}
              </label>
              <input
                type="text"
                value={editSkuValue}
                onChange={(e) => setEditSkuValue(e.target.value)}
                placeholder={t('editSkuPlaceholder')}
                className="w-full px-3 py-2 rounded-lg text-[13px] font-mono outline-none"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editSkuValue.trim() && !editSkuLoading) {
                    handleUpdateSku();
                  }
                }}
              />
            </div>

            {(() => {
              const preview = parseCustomLabel(editSkuValue);
              const previewValid = preview.valid && preview.skus.length > 0 && preview.skus.every(s => {
                const upper = s.toUpperCase();
                return knownSkuArray.some(dbSku => upper.startsWith(dbSku) || dbSku.startsWith(upper));
              });
              return editSkuValue.trim() ? (
                <div className="mb-4 px-3 py-2 rounded-lg text-[12px]" style={{
                  backgroundColor: previewValid ? `${colors.green}10` : `${colors.orange}10`,
                  border: `1px solid ${previewValid ? colors.green : colors.orange}30`,
                  color: previewValid ? colors.green : colors.orange,
                }}>
                  {previewValid ? '✅' : '⚠'} Root SKU: {preview.display}
                  {!preview.valid && ` — ${t('invalidSkuTooltip')}`}
                  {preview.valid && !previewValid && ` — ${t('skuNotInDb')}`}
                </div>
              ) : null;
            })()}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setEditSkuItem(null); setEditSkuValue(''); }}
                disabled={editSkuLoading}
                className="px-5 py-2 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleUpdateSku}
                disabled={!editSkuValue.trim() || editSkuValue.trim() === editSkuItem.currentSku || editSkuLoading}
                className="px-5 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90 flex items-center gap-2"
                style={{ backgroundColor: colors.controlAccent, opacity: !editSkuValue.trim() || editSkuValue.trim() === editSkuItem.currentSku || editSkuLoading ? 0.5 : 1 }}
              >
                {editSkuLoading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {t('editSkuSave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
