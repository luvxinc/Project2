'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { dynamicInventoryApi } from '@/lib/api/inventory';
import { hexToRgba } from '@/lib/status-colors';
import { animate, stagger } from 'animejs';
import type { DynamicInvRow } from '@/lib/api/inventory';

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString('en-US');
}

function formatCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined || num === 0) return '—';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCost(num: number | null | undefined): string {
  if (num === null || num === undefined || num === 0) return '—';
  return '$' + num.toFixed(4);
}

// ═══════════════════════════════════════════
// Sort state
// ═══════════════════════════════════════════
type SortField = 'sku' | 'avgCost' | 'currentCost' | 'actualQty' | 'theoryQty' | 'invValue' | 'orderQty' | 'orderValue' | 'transitQty' | 'transitValue';

export default function DynamicInventoryPage() {
  const t = useTranslations('inventory.dynamic');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // ─── State ───
  const [data, setData] = useState<DynamicInvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [matchedDate, setMatchedDate] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [sortField, setSortField] = useState<SortField>('sku');
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  // ─── Data loading ───
  const loadData = useCallback(async (dateStr: string) => {
    setLoading(true);
    setError('');
    try {
      const resp = await dynamicInventoryApi.getDynamicInventory(dateStr);
      setData(resp.data);
      setMatchedDate(resp.matchedStocktakeDate);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(targetDate);
  }, [targetDate, loadData]);

  // Animate rows on data load
  useEffect(() => {
    if (!loading && data.length > 0 && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr');
      if (rows.length > 0) {
        animate(rows, {
          opacity: [0, 1], translateY: [4, 0],
          duration: 250, delay: stagger(12, { start: 100 }), easing: 'easeOutCubic',
        });
      }
    }
  }, [loading, data]);

  // ─── Stats ───
  const stats = useMemo(() => {
    let totalValue = 0, totalOrder = 0, totalTransit = 0;
    data.forEach(r => {
      totalValue += r.invValue || 0;
      totalOrder += r.orderQty || 0;
      totalTransit += r.transitQty || 0;
    });
    return { skuCount: data.length, totalValue, totalOrder, totalTransit };
  }, [data]);

  // ─── Filter & Sort ───
  const sortedData = useMemo(() => {
    let filtered = data;
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase();
      filtered = data.filter(r => r.sku.toUpperCase().includes(q));
    }
    return [...filtered].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string') {
        return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortField, sortAsc, searchQuery]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // ─── Download CSV ───
  const handleDownload = () => {
    if (data.length === 0) return;
    const headers = ['SKU', 'Avg Cost', 'Current Cost', 'Actual Qty', 'Theory Qty'];
    const csvContent = headers.join(',') + '\n' + data.map(r =>
      [`"${r.sku}"`, r.avgCost, r.currentCost, r.actualQty, r.theoryQty].join(',')
    ).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_${targetDate}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── Apple-style helpers ───
  const cardBg = colors.bgSecondary;
  const borderColor = colors.separator;

  const SortHeader = ({ field, children, align = 'right', minW = '80px' }: { field: SortField; children: React.ReactNode; align?: string; minW?: string }) => (
    <th
      className={`px-3 py-2.5 text-xs font-medium cursor-pointer select-none transition-opacity hover:opacity-70 ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: colors.textSecondary, minWidth: minW }}
      title={t(`${field}Tip` as never)}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {children}
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"
          style={{
            color: sortField === field ? colors.controlAccent : colors.textTertiary,
            transform: sortField === field && !sortAsc ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            opacity: sortField === field ? 1 : 0.4,
          }}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </span>
    </th>
  );

  // Apple Stocks-style: only green/red for directional qty, everything else neutral
  const qtyColor = (val: number) => {
    if (val > 0) return colors.green;
    if (val < 0) return colors.red;
    return colors.textTertiary;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 pb-6">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('cutoffDate')}</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-sm bg-transparent outline-none"
              style={{ color: colors.text }}
            />
          </div>
          <button
            onClick={() => setTargetDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
            style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.textSecondary }}
          >
            {t('today')}
          </button>
          <button
            onClick={handleDownload}
            disabled={data.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-30"
            style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.textSecondary }}
          >
            ↓ {t('download')}
          </button>
      </div>

      {/* Summary strip — single neutral bar, Apple Numbers style */}
      {data.length > 0 && (
        <div className="flex items-center gap-6 mb-4 px-4 py-3 rounded-xl"
          style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
          {[
            { label: t('skuCount'), value: formatNumber(stats.skuCount), accent: false },
            { label: t('totalValue'), value: formatCurrency(stats.totalValue), accent: true },
            { label: t('orderTotal'), value: formatNumber(stats.totalOrder), accent: false },
            { label: t('transitTotal'), value: formatNumber(stats.totalTransit), accent: false },
          ].map((s, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-xs" style={{ color: colors.textTertiary }}>{s.label}</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: s.accent ? colors.green : colors.text }}>{s.value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-baseline gap-1.5">
            <span className="text-xs" style={{ color: colors.textTertiary }}>{t('invSource')}</span>
            <span className="text-xs font-medium tabular-nums" style={{ color: colors.textSecondary }}>
              {matchedDate || '—'}
            </span>
          </div>
        </div>
      )}

      {/* Search + Help */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
            style={{ color: colors.textTertiary }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Filter SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg text-sm outline-none transition-all"
            style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.text }}
          />
        </div>
        <button
          onClick={() => setHelpOpen(!helpOpen)}
          className="h-9 px-3 rounded-lg text-xs transition-opacity hover:opacity-70 flex items-center gap-1.5"
          style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.textTertiary }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
          {t('helpTitle')}
        </button>
      </div>

      {/* Help Panel — neutral, restrained */}
      {helpOpen && (
        <div className="mb-4 px-4 py-3 rounded-xl text-xs leading-relaxed"
          style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.textSecondary }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <p><strong style={{ color: colors.text }}>SKU</strong> — {t('avgCostTip')}</p>
            <p><strong style={{ color: colors.text }}>{t('currentCost')}</strong> — {t('currentCostTip')}</p>
            <p><strong style={{ color: colors.text }}>{t('actualQty')}</strong> — {t('actualQtyTip')}</p>
            <p><strong style={{ color: colors.text }}>{t('theoryQty')}</strong> — {t('theoryQtyTip')}</p>
            <p><strong style={{ color: colors.text }}>{t('orderQty')}</strong> — {t('orderQtyTip')}</p>
            <p><strong style={{ color: colors.text }}>{t('transitQty')}</strong> — {t('transitQtyTip')}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        ref={tableRef}
        className="rounded-2xl overflow-hidden relative"
        style={{ border: `1px solid ${borderColor}` }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ backgroundColor: hexToRgba(colors.bg, 0.7), backdropFilter: 'blur(4px)' }}>
            <div className="text-center">
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-2"
                style={{ borderColor: `${colors.controlAccent} transparent ${colors.controlAccent} ${colors.controlAccent}` }} />
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('loading')}</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: colors.red }}>{t('loadFailed')}: {error}</p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1100px' }}>
              <thead>
                <tr style={{ background: colors.bgTertiary }}>
                  <SortHeader field="sku" align="left" minW="150px">{t('sku')}</SortHeader>
                  <SortHeader field="avgCost">{t('avgCost')}</SortHeader>
                  <SortHeader field="currentCost">{t('currentCost')}</SortHeader>
                  <SortHeader field="actualQty">{t('actualQty')}</SortHeader>
                  <SortHeader field="theoryQty">{t('theoryQty')}</SortHeader>
                  <SortHeader field="invValue" minW="100px">{t('invValue')}</SortHeader>
                  <SortHeader field="orderQty">{t('orderQty')}</SortHeader>
                  <SortHeader field="orderValue" minW="100px">{t('orderValue')}</SortHeader>
                  <SortHeader field="transitQty">{t('transitQty')}</SortHeader>
                  <SortHeader field="transitValue" minW="100px">{t('transitValue')}</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sortedData.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm" style={{ color: colors.textTertiary }}>
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  sortedData.map((row, i) => (
                    <tr
                      key={row.sku}
                      className="transition-colors"
                      style={{
                        borderTop: i > 0 ? `1px solid ${borderColor}` : undefined,
                        backgroundColor: i % 2 === 0 ? 'transparent' : cardBg,
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-semibold" style={{ color: colors.controlAccent }}>{row.sku}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                        {formatCost(row.avgCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                        {formatCost(row.currentCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: colors.text }}>
                        {formatNumber(row.actualQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: colors.text }}>
                        {formatNumber(row.theoryQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                        {formatCurrency(row.invValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: qtyColor(row.orderQty) }}>
                        {formatNumber(row.orderQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                        {formatCurrency(row.orderValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: qtyColor(row.transitQty) }}>
                        {formatNumber(row.transitQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: colors.textSecondary }}>
                        {formatCurrency(row.transitValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end items-center mt-3">
        <p className="text-xs" style={{ color: colors.textTertiary }}>
          {t('lastUpdate')}: <span style={{ color: colors.textSecondary }}>{lastUpdate || '—'}</span>
        </p>
      </div>
    </div>
  );
}
