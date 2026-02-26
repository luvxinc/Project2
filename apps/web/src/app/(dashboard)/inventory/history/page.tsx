'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import InventoryTabSelector from '../components/InventoryTabSelector';
import { inventoryApi } from '@/lib/api/inventory';
import type { StocktakeListItem, StocktakeLocationDetailItem } from '@/lib/api/inventory';

// ═══════════════════════════════════════
// Inventory History Page
// ═══════════════════════════════════════

export default function InventoryHistoryPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('inventory.history');

  const [batches, setBatches] = useState<StocktakeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<StocktakeListItem | null>(null);
  const [details, setDetails] = useState<StocktakeLocationDetailItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [slideOpen, setSlideOpen] = useState(false);

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

  // ═══════ Open batch detail ═══════
  const openBatchDetail = useCallback(async (batch: StocktakeListItem) => {
    setSelectedBatch(batch);
    setSlideOpen(true);
    setDetailLoading(true);
    try {
      const data = await inventoryApi.getStocktakeLocations(batch.id);
      setDetails(data);
    } catch (err) {
      console.error('[History] Failed to load details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeSlidein = useCallback(() => {
    setSlideOpen(false);
    setTimeout(() => {
      setSelectedBatch(null);
      setDetails([]);
    }, 300);
  }, []);

  // ═══════ Computed ═══════
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';

  // Group details by warehouse
  const warehouseSummary = useMemo(() => {
    if (!details.length) return {};
    const map: Record<string, number> = {};
    for (const d of details) {
      map[d.warehouse] = (map[d.warehouse] || 0) + 1;
    }
    return map;
  }, [details]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <InventoryTabSelector />
        </div>

        {/* Batch List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: colors.controlAccent, borderTopColor: 'transparent' }} />
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
                style={{
                  background: cardBg,
                  border: `1px solid ${borderColor}`,
                }}
                onClick={() => openBatchDetail(batch)}
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
                    {/* Date badge */}
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

      {/* ═══════ Slide-in Detail Panel ═══════ */}
      {/* Backdrop */}
      {slideOpen && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={closeSlidein}
        />
      )}

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col transition-transform duration-300"
        style={{
          width: 'min(90vw, 1100px)',
          transform: slideOpen ? 'translateX(0)' : 'translateX(100%)',
          backgroundColor: colors.bg,
          borderLeft: `1px solid ${borderColor}`,
          boxShadow: slideOpen ? '-8px 0 30px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div>
            <h3 className="text-lg font-bold" style={{ color: colors.text }}>
              {t('detailTitle')}
            </h3>
            {selectedBatch && (
              <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                {t('detailSubtitle', { date: selectedBatch.stocktakeDate })}
                {' '}-- {t('records', { count: details.length })}
                {Object.keys(warehouseSummary).length > 0 && (
                  <> -- {t('warehouses')}: {Object.keys(warehouseSummary).join(', ')}</>
                )}
              </p>
            )}
          </div>
          <button
            onClick={closeSlidein}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ color: colors.textTertiary }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Panel Body — Table */}
        <div className="flex-1 overflow-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: colors.controlAccent, borderTopColor: 'transparent' }} />
            </div>
          ) : details.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm" style={{ color: colors.textTertiary }}>{t('noBatches')}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: cardBg }}>
                  <th className="px-3 py-2.5 text-left font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>#</th>
                  <th className="px-3 py-2.5 text-left font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colSku')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colQtyPerBox')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colNumOfBox')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colTotal')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colWarehouse')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colAisle')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colBay')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colLevel')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colBin')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colSlot')}</th>
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
          )}
        </div>
      </div>
    </div>
  );
}
