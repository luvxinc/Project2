'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import InventoryTabSelector from '../components/InventoryTabSelector';
import { inventoryApi } from '@/lib/api/inventory';
import type { StocktakeListItem, StocktakeLocationDetailItem, StocktakeItemData } from '@/lib/api/inventory';

// ═══════════════════════════════════════
// Inventory History Page
// List ↔ Detail with slide transition
// ═══════════════════════════════════════

type ViewMode = 'list' | 'detail';

export default function InventoryHistoryPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('inventory.history');

  // ═══════ State ═══════
  const [batches, setBatches] = useState<StocktakeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View transition
  const [view, setView] = useState<ViewMode>('list');
  const [animating, setAnimating] = useState(false);

  // Detail data
  const [selectedBatch, setSelectedBatch] = useState<StocktakeListItem | null>(null);
  const [details, setDetails] = useState<StocktakeLocationDetailItem[]>([]);
  const [simpleItems, setSimpleItems] = useState<StocktakeItemData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const hasLocationData = details.length > 0;

  // ═══════ Load batches ═══════
  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryApi.getStocktakes();
      setBatches(data);
    } catch (err) {
      console.error('[History] Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // ═══════ Open detail with slide-in ═══════
  const openDetail = useCallback(async (batch: StocktakeListItem) => {
    setSelectedBatch(batch);
    setDetailLoading(true);

    // Start slide animation
    setAnimating(true);
    requestAnimationFrame(() => {
      setView('detail');
      setTimeout(() => setAnimating(false), 350);
    });

    try {
      // Try location details first (new format)
      const locData = await inventoryApi.getStocktakeLocations(batch.id);
      if (locData && locData.length > 0) {
        setDetails(locData);
      } else {
        // Fallback: load simple items (legacy format)
        const detail = await inventoryApi.getStocktake(batch.id);
        setSimpleItems(detail.items || []);
      }
    } catch {
      // Location endpoint failed — fallback to items
      try {
        const detail = await inventoryApi.getStocktake(batch.id);
        setSimpleItems(detail.items || []);
      } catch (err2) {
        console.error('[History] Failed to load details:', err2);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ═══════ Go back with slide-out ═══════
  const goBack = useCallback(() => {
    setAnimating(true);
    setView('list');
    setTimeout(() => {
      setAnimating(false);
      setSelectedBatch(null);
      setDetails([]);
      setSimpleItems([]);
    }, 350);
  }, []);

  // ═══════ Click outside ═══════
  const contentRef = useRef<HTMLDivElement>(null);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (view === 'detail' && contentRef.current && !contentRef.current.contains(e.target as Node)) {
      goBack();
    }
  }, [view, goBack]);

  // ═══════ Computed ═══════
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';

  const warehouseSummary = useMemo(() => {
    if (!details.length) return {};
    const map: Record<string, number> = {};
    for (const d of details) {
      map[d.warehouse] = (map[d.warehouse] || 0) + 1;
    }
    return map;
  }, [details]);

  const isDetail = view === 'detail';

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: colors.bg }} onClick={handleBackgroundClick}>
      <div className="relative" style={{ minHeight: '100vh' }}>

        {/* ═══════ LIST VIEW ═══════ */}
        <div
          style={{
            position: isDetail ? 'absolute' : 'relative',
            inset: 0,
            transform: isDetail ? 'translateX(-30%)' : 'translateX(0)',
            opacity: isDetail ? 0 : 1,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
            pointerEvents: isDetail ? 'none' : 'auto',
          }}
        >
          <div className="max-w-[1400px] mx-auto px-6 py-10">
            <div className="mb-8">
              <InventoryTabSelector />
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderRightColor: colors.controlAccent, borderBottomColor: colors.controlAccent, borderLeftColor: colors.controlAccent, borderTopColor: 'transparent' }} />
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}
                  style={{ color: colors.textTertiary }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('noBatches')}</p>
                <p className="text-xs" style={{ color: colors.textTertiary }}>{t('noBatchesDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-xl p-5 cursor-pointer transition-all duration-200"
                    style={{ background: cardBg, border: `1px solid ${borderColor}` }}
                    onClick={() => openDetail(batch)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.controlAccent;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = borderColor;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${colors.controlAccent}22, ${colors.controlAccent}08)` }}>
                          <span className="text-lg font-bold" style={{ color: colors.controlAccent }}>
                            {new Date(batch.stocktakeDate + 'T00:00:00').getDate()}
                          </span>
                          <span className="text-[9px] font-medium uppercase" style={{ color: colors.controlAccent }}>
                            {new Date(batch.stocktakeDate + 'T00:00:00').toLocaleDateString('en', { month: 'short' })}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-bold" style={{ color: colors.text }}>
                            {batch.stocktakeDate}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: colors.textTertiary }}>
                            <span>{t('skus', { count: batch.itemCount })}</span>
                            <span>ID: {batch.id}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-3 py-1.5 rounded-lg"
                          style={{ background: `${colors.controlAccent}15`, color: colors.controlAccent }}>
                          {t('viewDetails')}
                        </span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                          style={{ color: colors.textTertiary }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══════ DETAIL VIEW ═══════ */}
        {(isDetail || animating) && selectedBatch && (
          <div
            style={{
              position: !isDetail ? 'absolute' : 'relative',
              inset: 0,
              transform: isDetail ? 'translateX(0)' : 'translateX(100%)',
              opacity: isDetail ? 1 : 0,
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
              pointerEvents: isDetail ? 'auto' : 'none',
            }}
          >
            <div ref={contentRef} className="max-w-[1400px] mx-auto px-6 py-10">
              {/* Back */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={(e) => { e.stopPropagation(); goBack(); }}
                  className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: colors.controlAccent }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('title')}
                </button>
              </div>

              {/* Summary card */}
              <div className="rounded-xl mb-5"
                style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
                <div className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: `1px solid ${borderColor}` }}>
                  <div className="flex items-center gap-3">
                    <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
                      {selectedBatch.stocktakeDate}
                    </p>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: `${colors.controlAccent}12`, color: colors.controlAccent }}>
                      {t('skus', { count: selectedBatch.itemCount })}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs" style={{ color: colors.textTertiary }}>
                      {t('records', { count: hasLocationData ? details.length : simpleItems.length })}
                    </p>
                  </div>
                </div>
                {Object.keys(warehouseSummary).length > 0 && (
                  <div className="p-5 flex flex-wrap gap-4">
                    {Object.entries(warehouseSummary).map(([wh, count]) => (
                      <div key={wh} className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                          style={{ backgroundColor: `${colors.controlAccent}10`, color: colors.controlAccent }}>
                          {wh}
                        </span>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>
                          {t('records', { count })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail Table */}
              {detailLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderRightColor: colors.controlAccent, borderBottomColor: colors.controlAccent, borderLeftColor: colors.controlAccent, borderTopColor: 'transparent' }} />
                </div>
              ) : hasLocationData ? (
                /* ═══════ New format: location-level table ═══════ */
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                  <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['#', t('colSku'), t('colQtyPerBox'), t('colNumOfBox'), t('colTotal'),
                            t('colWarehouse'), t('colAisle'), t('colBay'), t('colLevel'), t('colBin'), t('colSlot')
                          ].map((col, ci) => (
                            <th key={ci}
                              className={`px-3 py-2.5 font-semibold sticky top-0 z-10 ${ci >= 2 && ci <= 4 ? 'text-right' : ci >= 5 ? 'text-center' : 'text-left'}`}
                              style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((d, i) => (
                          <tr key={d.id}
                            className="transition-colors"
                            style={{ borderTop: `1px solid ${borderColor}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = cardBg}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td className="px-3 py-2" style={{ color: colors.textTertiary }}>{i + 1}</td>
                            <td className="px-3 py-2 font-mono font-bold" style={{ color: colors.text }}>{d.sku}</td>
                            <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{d.qtyPerBox}</td>
                            <td className="px-3 py-2 text-right" style={{ color: colors.text }}>{d.numOfBox}</td>
                            <td className="px-3 py-2 text-right font-medium" style={{ color: colors.green }}>
                              {d.totalQty.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-[10px]" style={{ color: colors.textSecondary }}>{d.warehouse}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.aisle}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.bay}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.level}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.bin || '-'}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.slot || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : simpleItems.length > 0 ? (
                /* ═══════ Legacy format: SKU + qty only ═══════ */
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                  <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>#</th>
                          <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colSku')}</th>
                          <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colTotal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simpleItems.map((item, i) => (
                          <tr key={item.id}
                            className="transition-colors"
                            style={{ borderTop: `1px solid ${borderColor}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = cardBg}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td className="px-4 py-2.5" style={{ color: colors.textTertiary }}>{i + 1}</td>
                            <td className="px-4 py-2.5 font-mono font-bold" style={{ color: colors.text }}>{item.sku}</td>
                            <td className="px-4 py-2.5 text-right font-medium" style={{ color: colors.green }}>
                              {item.countedQty.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-sm" style={{ color: colors.textTertiary }}>{t('noBatches')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
