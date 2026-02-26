'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { hexToRgba } from '@/lib/status-colors';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { animate, stagger } from 'animejs';
import type { StocktakeListItem, StocktakeDetail } from '@/lib/api/inventory';
import { UploadStocktakeDialog } from './components/UploadStocktakeDialog';

// ═══════════════════════════════════════════
// Pivot Table: rows=SKU, cols=Date, cells=Qty
// ═══════════════════════════════════════════

interface PivotData {
  allSkus: string[];
  allDates: string[];
  matrix: Record<string, Record<string, number | null>>;
}

function buildPivot(details: StocktakeDetail[]): PivotData {
  const dateSet = new Set<string>();
  const skuSet = new Set<string>();
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const d of details) {
    dateSet.add(d.stocktakeDate);
    for (const item of d.items) {
      skuSet.add(item.sku);
      if (!matrix[item.sku]) matrix[item.sku] = {};
      matrix[item.sku][d.stocktakeDate] = item.countedQty;
    }
  }

  const allDates = [...dateSet].sort((a, b) => b.localeCompare(a));
  const allSkus = [...skuSet].sort();

  for (const sku of allSkus) {
    if (!matrix[sku]) matrix[sku] = {};
    for (const date of allDates) {
      if (matrix[sku][date] === undefined) matrix[sku][date] = null;
    }
  }

  return { allSkus, allDates, matrix };
}

export default function StocktakePage() {
  const t = useTranslations('inventory.stocktake');
  const tEdit = useTranslations('inventory.stocktake.edit');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // ─── Data state ───
  const [stocktakes, setStocktakes] = useState<StocktakeListItem[]>([]);
  const [details, setDetails] = useState<StocktakeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');

  // ─── UI state ───
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [skuSortAsc, setSkuSortAsc] = useState(true);

  // ─── Delete date confirmation ───
  const [deleteDateTarget, setDeleteDateTarget] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);



  // Refs
  const tableRef = useRef<HTMLDivElement>(null);

  // ─── Security for delete ───
  const securityDelete = useSecurityAction({
    actionKey: 'btn_delete_stocktake',
    level: 'L3',
    onExecute: async (code: string) => {
      if (!deleteDateTarget) return;
      const st = stocktakes.find(s => s.stocktakeDate === deleteDateTarget);
      if (!st) return;
      try {
        setDeleting(true);
        await inventoryApi.deleteStocktake(st.id, code);
        setDeleteConfirmOpen(false);
        setDeleteDateTarget(null);
        await loadStocktakes();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        setError(msg);
      } finally {
        setDeleting(false);
      }
    },
  });



  // ─── Load data ───
  const loadStocktakes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await inventoryApi.getStocktakes();
      setStocktakes(data);

      if (data.length > 0) {
        setLoadingDetails(true);
        const allDetails = await Promise.all(
          data.map((st: StocktakeListItem) => inventoryApi.getStocktake(st.id))
        );
        setDetails(allDetails);
        setLoadingDetails(false);
      } else {
        setDetails([]);
      }
    } catch {
      setError('Failed to load stocktake data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStocktakes();
  }, [loadStocktakes]);

  // ─── Build pivot ───
  const pivot = useMemo(() => buildPivot(details), [details]);

  // ─── Filter + Sort ───
  const filteredSkus = useMemo(() => {
    let skus = pivot.allSkus;
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase().trim();
      skus = skus.filter(sku => sku.includes(q));
    }
    return skuSortAsc ? [...skus].sort() : [...skus].sort().reverse();
  }, [pivot.allSkus, searchQuery, skuSortAsc]);

  // ─── Animation ───
  useEffect(() => {
    if (!loading && !loadingDetails && filteredSkus.length > 0 && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('[data-animate-row]');
      if (rows.length > 0) {
        animate(rows, {
          opacity: [0, 1],
          translateY: [8, 0],
          delay: stagger(15, { start: 80 }),
          duration: 350,
          easing: 'easeOutCubic',
        });
      }
    }
  }, [loading, loadingDetails, filteredSkus]);

  // ─── Delete date handler ───
  const handleDateHeaderClick = (date: string) => {
    setDeleteDateTarget(date);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteDate = () => {
    securityDelete.trigger();
  };



  // ─── Helpers ───
  const existingDates = stocktakes.map(s => s.stocktakeDate);

  const borderColor = colors.separator;
  const cardBg = colors.bgSecondary;
  const hoverBg = colors.bgTertiary;
  const stickyBg = colors.bg;
  const headerBg = colors.bgTertiary;

  const formatDateShort = (d: string) => {
    try {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  const formatYear = (d: string) => d.slice(0, 4);
  const isLoading = loading || loadingDetails;

  return (
    <div className="max-w-[1200px] mx-auto px-6 pb-6">
      {/* Action bar */}
      <div className="flex items-center justify-between mb-5">
        <div>
          {pivot.allSkus.length > 0 && (
            <span className="text-sm" style={{ color: colors.textTertiary }}>
              {pivot.allSkus.length} SKUs × {pivot.allDates.length} dates
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {/* Upload Button — only action button */}
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg, ${colors.green}, ${colors.green}dd)` }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {t('uploadBtn')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {!isLoading && pivot.allSkus.length > 0 && (
        <div className="mb-4">
          <div className="relative max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
              style={{ color: colors.textTertiary }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter SKU..."
              className="w-full h-9 pl-9 pr-3 rounded-lg text-sm outline-none transition-all"
              style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.text }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:opacity-70"
                style={{ color: colors.textTertiary }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-20">
          <div className="w-10 h-10 mx-auto mb-4 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${colors.controlAccent} transparent ${colors.controlAccent} ${colors.controlAccent}` }} />
          <p className="text-sm" style={{ color: colors.textTertiary }}>
            {loadingDetails ? 'Building pivot table...' : 'Loading...'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="text-center py-20">
          <p className="text-sm mb-4" style={{ color: colors.red }}>{error}</p>
          <button onClick={() => { setError(''); loadStocktakes(); }} className="px-4 py-2 rounded-full text-sm"
            style={{ border: `1px solid ${borderColor}`, color: colors.textSecondary }}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && stocktakes.length === 0 && (
        <div className="text-center py-20 rounded-2xl" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}
            style={{ color: colors.textTertiary }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('table.noData')}</h3>
          <p className="text-sm mb-5" style={{ color: colors.textTertiary }}>{t('table.noDataDesc')}</p>
          <button onClick={() => setUploadOpen(true)}
            className="px-5 py-2 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${colors.green}, ${colors.green}dd)` }}>
            {t('uploadBtn')}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          PIVOT TABLE: rows=SKU, cols=Date, cells=Qty
         ═══════════════════════════════════════════════ */}
      {!isLoading && !error && pivot.allSkus.length > 0 && (
        <div ref={tableRef} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="w-full text-xs" style={{ minWidth: `${180 + pivot.allDates.length * 88}px` }}>
              <thead>
                <tr style={{ background: headerBg }}>
                  {/* SKU header — sortable */}
                  <th
                    className="sticky left-0 top-0 z-20 px-4 py-2.5 text-left font-semibold text-xs cursor-pointer select-none hover:opacity-80 transition-opacity"
                    style={{
                      color: colors.textSecondary,
                      background: stickyBg,
                      borderBottom: `2px solid ${borderColor}`,
                      borderRight: `2px solid ${borderColor}`,
                      minWidth: '160px',
                      maxWidth: '200px',
                    }}
                    onClick={() => setSkuSortAsc(prev => !prev)}
                  >
                    <span className="flex items-center gap-1">
                      {t('table.sku')}
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"
                        style={{ color: colors.textTertiary, transform: skuSortAsc ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </span>
                  </th>

                  {/* Date headers — click to delete */}
                  {pivot.allDates.map(date => (
                    <th
                      key={date}
                      className="sticky top-0 z-10 px-3 py-2.5 text-center font-medium cursor-pointer select-none group transition-all hover:opacity-80"
                      style={{
                        color: colors.textSecondary,
                        background: stickyBg,
                        borderBottom: `2px solid ${borderColor}`,
                        minWidth: '80px',
                      }}
                      onClick={() => handleDateHeaderClick(date)}
                      title={`Click to delete ${date}`}
                    >
                      <div className="relative">
                        <div className="text-xs font-semibold" style={{ color: colors.text }}>
                          {formatDateShort(date)}
                        </div>
                        <div className="text-[10px] font-normal mt-0.5" style={{ color: colors.textTertiary }}>
                          {formatYear(date)}
                        </div>
                        {/* Delete indicator on hover */}
                        <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-3 h-3" fill={colors.red} viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                          </svg>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredSkus.map((sku, idx) => (
                  <tr
                    key={sku}
                    data-animate-row
                    className="transition-colors"
                    style={{
                      borderBottom: `1px solid ${borderColor}`,
                      background: idx % 2 === 0 ? 'transparent' : cardBg,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : cardBg)}
                  >
                    {/* SKU cell */}
                    <td
                      className="sticky left-0 z-10 px-4 py-2 font-mono font-medium text-xs"
                      style={{
                        color: colors.text,
                        background: stickyBg,
                        borderRight: `2px solid ${borderColor}`,
                      }}
                    >
                      <span className="truncate block max-w-[180px]" title={sku}>{sku}</span>
                    </td>

                    {/* Quantity cells — read-only */}
                    {pivot.allDates.map(date => {
                      const val = pivot.matrix[sku]?.[date];

                      return (
                        <td
                          key={date}
                          className="px-3 py-2 text-center font-mono"
                          style={{
                            color: val === null ? colors.textTertiary : colors.text,
                            fontWeight: val !== null ? 500 : 400,
                          }}
                        >
                          {val !== null ? val.toLocaleString() : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 flex items-center justify-between text-xs"
            style={{ background: headerBg, borderTop: `1px solid ${borderColor}` }}>
            <span style={{ color: colors.textTertiary }}>
              {searchQuery
                ? `${filteredSkus.length} / ${pivot.allSkus.length} SKUs`
                : `${pivot.allSkus.length} SKUs`
              }
            </span>
            <span style={{ color: colors.textTertiary }}>
              {pivot.allDates.length} {t('table.date').toLowerCase()}
              {pivot.allDates.length > 0 && (
                <span className="ml-1.5 font-mono">
                  ({pivot.allDates[pivot.allDates.length - 1]} → {pivot.allDates[0]})
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ═══ Delete Date Confirmation Dialog ═══ */}
      {deleteConfirmOpen && deleteDateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: hexToRgba('#000000', 0.5), backdropFilter: 'blur(6px)' }}
          onClick={() => setDeleteConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: colors.bgElevated }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: hexToRgba(colors.red, 0.1) }}>
                  <svg className="w-5 h-5" fill={colors.red} viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: colors.text }}>
                    {tEdit('deleteDate')}
                  </h3>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {tEdit('deleteWarning', { date: deleteDateTarget })}
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl text-center font-mono text-lg font-bold"
                style={{ background: hexToRgba(colors.red, 0.06), border: `1px solid ${hexToRgba(colors.red, 0.2)}`, color: colors.red }}>
                {deleteDateTarget}
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                Cancel
              </button>
              <button
                onClick={confirmDeleteDate}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.red }}>
                {deleting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {tEdit('confirmExecute')}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ═══ Dialogs ═══ */}
      <UploadStocktakeDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onComplete={loadStocktakes}
        existingDates={existingDates}
      />

      <SecurityCodeDialog
        isOpen={securityDelete.isOpen}
        level={securityDelete.level}
        title={tEdit('deleteDate')}
        description={tEdit('deleteWarning', { date: deleteDateTarget || '' })}
        onConfirm={securityDelete.onConfirm}
        onCancel={securityDelete.onCancel}
        error={securityDelete.error}
      />


    </div>
  );
}
