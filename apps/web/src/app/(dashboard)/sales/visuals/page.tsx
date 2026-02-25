'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { salesApi, type ChartDataResponse, type PieSlice } from '@/lib/api/sales';
import * as echarts from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import SalesTabSelector from '../components/SalesTabSelector';

echarts.use([
  LineChart, PieChart, TitleComponent, TooltipComponent,
  LegendComponent, GridComponent, DataZoomComponent, CanvasRenderer,
]);

// ═══════════════════════════════════════════════
// Types & Constants
// ═══════════════════════════════════════════════

type ChartMode = 'Amount' | 'Quantity' | 'Order' | 'Percentage';
type ChartType = 'line' | 'pie';

const ACTION_KEYS = ['Sales', 'Cancel', 'Return', 'Request', 'Case', 'Dispute'] as const;
const SHIP_KEYS = ['shipRegular', 'shipFine', 'shipOver', 'shipReturn'] as const;
const FEE_KEYS = ['cogs', 'platformFee'] as const;

const CHART_PALETTE = [
  '#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D55',
  '#5AC8FA', '#FF3B30', '#FFCC00', '#64D2FF', '#30B0C7',
  '#BF5AF2', '#AC8E68',
];
const PIE_PALETTE = ['#34C759', '#FF9500', '#007AFF', '#FF2D55', '#AF52DE'];

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function SalesVisualsPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales');
  const isDark = theme === 'dark';

  // -- Control state (default: 90 days to cover more data) --
  const [chartType, setChartType] = useState<ChartType>('line');
  const [mode, setMode] = useState<ChartMode>('Amount');
  const [startDate, setStartDate] = useState(() => formatDate(new Date(Date.now() - 90 * 86400000)));
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [stores, setStores] = useState<string[]>(['esplus', '88']);
  const [actions, setActions] = useState<string[]>(['Sales']);
  const [ships, setShips] = useState<string[]>([]);
  const [fees, setFees] = useState<string[]>([]);

  // -- Chart DOM ref --
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // -- Query --
  const queryKey = useMemo(() =>
    ['sales-visuals', startDate, endDate, stores.join(','), chartType, mode,
     actions.join(','), ships.join(','), fees.join(',')],
    [startDate, endDate, stores, chartType, mode, actions, ships, fees]
  );

  const { data, isLoading, isFetching } = useQuery<ChartDataResponse>({
    queryKey,
    queryFn: () => salesApi.getChartData({
      start: startDate, end: endDate, stores, chartType, mode, actions, ships, fees,
    }),
    enabled: stores.length > 0,
    staleTime: 30_000,
  });

  // -- ECharts init & resize --
  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  // -- Render chart when data changes --
  useEffect(() => {
    if (!chartInstance.current || !data) return;
    if (chartType === 'pie' && data.pie_data) {
      renderPie(chartInstance.current, data.pie_data, isDark);
    } else if (data.categories && data.series) {
      renderLine(chartInstance.current, data.categories, data.series, mode, isDark);
    } else {
      chartInstance.current.clear();
    }
  }, [data, chartType, mode, isDark]);

  // Theme change → reinit
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }
    if (chartRef.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
  }, [theme]);

  // -- Helpers --
  const toggleItem = useCallback((list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setter(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  }, []);

  const toggleStore = useCallback((store: string) => {
    setStores(prev => prev.includes(store) ? prev.filter(s => s !== store) : [...prev, store]);
  }, []);

  const isPie = chartType === 'pie';

  // i18n labels
  const lbl = (ns: string, k: string) => t(`hub.visuals.${k}` as any);

  const modes: { key: ChartMode; label: string }[] = [
    { key: 'Amount', label: lbl('v', 'modeAmount') },
    { key: 'Quantity', label: lbl('v', 'modeQty') },
    { key: 'Order', label: lbl('v', 'modeOrder') },
    { key: 'Percentage', label: lbl('v', 'modePct') },
  ];

  // Glass card style
  const glass = {
    backgroundColor: isDark ? 'rgba(28, 28, 30, 0.72)' : 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
    borderRadius: 14,
  };

  const glassInner = {
    ...glass,
    backgroundColor: isDark ? 'rgba(44, 44, 46, 0.65)' : 'rgba(242, 242, 247, 0.65)',
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[1400px] mx-auto">
          <SalesTabSelector />
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 pt-2">
        {/* ══ Control Bar — macOS toolbar style ══ */}
        <div style={glass} className="p-4 mb-4">
          <div className="flex flex-wrap items-center gap-6">

            {/* Mode Selector — iOS Segment Control */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block"
                style={{ color: colors.textTertiary }}>
                {lbl('v', 'mode')}
              </label>
              <div className="flex p-0.5 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)' }}>
                {modes.map(m => (
                  <button
                    key={m.key}
                    onClick={() => !isPie && setMode(m.key)}
                    className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-all relative"
                    style={{
                      backgroundColor: mode === m.key ? (isDark ? 'rgba(99,99,102,0.55)' : '#fff') : 'transparent',
                      color: mode === m.key ? colors.text : colors.textTertiary,
                      boxShadow: mode === m.key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      opacity: isPie ? 0.35 : 1,
                      cursor: isPie ? 'default' : 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block"
                style={{ color: colors.textTertiary }}>
                {lbl('v', 'dateRange')}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date" value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-mono"
                  style={{ backgroundColor: isDark ? 'rgba(118,118,128,0.18)' : 'rgba(118,118,128,0.08)',
                    color: colors.text, border: 'none', outline: 'none' }}
                />
                <span className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>→</span>
                <input
                  type="date" value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-mono"
                  style={{ backgroundColor: isDark ? 'rgba(118,118,128,0.18)' : 'rgba(118,118,128,0.08)',
                    color: colors.text, border: 'none', outline: 'none' }}
                />
              </div>
            </div>

            {/* Stores — iOS toggle */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block"
                style={{ color: colors.textTertiary }}>
                {lbl('v', 'store')}
              </label>
              <div className="flex gap-3">
                {[{ key: 'esplus', label: 'ES Plus' }, { key: '88', label: 'Parts 88' }].map(s => (
                  <label key={s.key} className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => toggleStore(s.key)}
                      className="w-[42px] h-[25px] rounded-full relative transition-colors duration-200 cursor-pointer"
                      style={{ backgroundColor: stores.includes(s.key) ? '#34C759' : (isDark ? '#39393d' : '#e9e9eb') }}
                    >
                      <div
                        className="absolute top-[2px] w-[21px] h-[21px] rounded-full bg-white transition-transform duration-200"
                        style={{
                          transform: stores.includes(s.key) ? 'translateX(19px)' : 'translateX(2px)',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: colors.text }}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Chart Type — iOS Segment */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block"
                style={{ color: colors.textTertiary }}>
                {lbl('v', 'chartType')}
              </label>
              <div className="flex p-0.5 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)' }}>
                {(['line', 'pie'] as ChartType[]).map(ct => (
                  <button
                    key={ct}
                    onClick={() => setChartType(ct)}
                    className="px-3.5 py-1.5 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5"
                    style={{
                      backgroundColor: chartType === ct ? (isDark ? 'rgba(99,99,102,0.55)' : '#fff') : 'transparent',
                      color: chartType === ct ? colors.text : colors.textTertiary,
                      boxShadow: chartType === ct ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    }}
                  >
                    {ct === 'line' ? (
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    ) : (
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
                    )}
                    {lbl('v', ct)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ Content: Filter Sidebar + Chart ══ */}
        <div className="flex gap-4">

          {/* Left: Filter Panel */}
          <div className="w-[210px] flex-shrink-0">
            <div style={{ ...glass, opacity: isPie ? 0.45 : 1 }} className="p-4 transition-opacity duration-300">
              <h3 className="text-[12px] font-semibold mb-4 flex items-center gap-2" style={{ color: colors.text }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {lbl('v', 'filters')}
              </h3>

              {/* Actions (blue accent) */}
              <FilterGroup
                title={lbl('v', 'actions')} titleColor="#007AFF"
                items={ACTION_KEYS.map(k => ({ key: k, label: lbl('v', k.toLowerCase()) }))}
                selected={actions}
                onToggle={k => toggleItem(actions, setActions, k)}
                activeColor="#007AFF" disabled={isPie} colors={colors} isDark={isDark}
              />

              {/* Shipping (amber accent) */}
              <FilterGroup
                title={lbl('v', 'shipping')} titleColor="#FF9500"
                items={SHIP_KEYS.map(k => ({
                  key: k, label: lbl('v', k),
                }))}
                selected={ships}
                onToggle={k => toggleItem(ships, setShips, k)}
                activeColor="#FF9500" disabled={isPie} colors={colors} isDark={isDark}
              />

              {/* Fees (red accent) */}
              <FilterGroup
                title={lbl('v', 'expenses')} titleColor="#FF3B30"
                items={FEE_KEYS.map(k => ({ key: k, label: lbl('v', k) }))}
                selected={fees}
                onToggle={k => toggleItem(fees, setFees, k)}
                activeColor="#FF3B30" disabled={isPie} colors={colors} isDark={isDark}
                isLast
              />
            </div>
          </div>

          {/* Right: Chart Area */}
          <div className="flex-1 min-w-0">
            <div style={glass} className="relative overflow-hidden">
              {/* Loading shimmer */}
              {(isLoading || isFetching) && (
                <div className="absolute inset-0 flex items-center justify-center z-10"
                  style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)',
                    backdropFilter: 'blur(4px)' }}>
                  <div className="text-center">
                    <div className="relative w-10 h-10 mx-auto mb-3">
                      <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                        style={{ borderTopColor: '#007AFF', borderRightColor: 'rgba(0,122,255,0.3)' }} />
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: colors.textTertiary }}>
                      {lbl('v', 'loading')}
                    </span>
                  </div>
                </div>
              )}

              {/* ECharts container */}
              <div ref={chartRef} style={{ width: '100%', height: 560 }} />

              {/* No data */}
              {!isLoading && !isFetching && data && !data.pie_data?.length && !data.series?.length && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <svg width="48" height="48" fill="none" stroke={colors.textTertiary} strokeWidth="1.2" viewBox="0 0 24 24" className="mb-3 opacity-40">
                    <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-[13px] font-medium" style={{ color: colors.textTertiary }}>
                    {lbl('v', 'noData')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Filter Group Sub-Component
// ═══════════════════════════════════════════════

function FilterGroup({ title, titleColor, items, selected, onToggle, activeColor, disabled, colors, isDark, isLast }: {
  title: string; titleColor: string;
  items: { key: string; label: string }[];
  selected: string[];
  onToggle: (k: string) => void;
  activeColor: string; disabled: boolean; colors: any; isDark: boolean; isLast?: boolean;
}) {
  return (
    <div className={isLast ? '' : 'mb-4'}>
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: titleColor }} />
        <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: titleColor }}>
          {title}
        </label>
      </div>
      <div className="flex flex-col gap-1">
        {items.map(item => {
          const isActive = selected.includes(item.key);
          return (
            <button
              key={item.key}
              onClick={disabled ? undefined : () => onToggle(item.key)}
              className="px-2.5 py-[6px] rounded-lg text-[11px] font-medium text-left transition-all"
              style={{
                backgroundColor: isActive
                  ? activeColor + (isDark ? '30' : '18')
                  : 'transparent',
                color: isActive ? activeColor : colors.textSecondary,
                border: `0.5px solid ${isActive ? activeColor + '40' : 'transparent'}`,
                opacity: disabled ? 0.35 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded flex items-center justify-center text-[9px]"
                  style={{
                    backgroundColor: isActive ? activeColor : (isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)'),
                    color: isActive ? '#fff' : 'transparent',
                  }}>
                  {isActive && '✓'}
                </span>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ECharts Render — Line (Premium)
// ═══════════════════════════════════════════════

function fmtNum(val: number, mode: ChartMode): string {
  const abs = Math.abs(val);
  if (mode === 'Amount') {
    if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  }
  if (mode === 'Percentage') return `${val.toFixed(1)}%`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return `${val}`;
}

function fmtDateLabel(raw: string): string {
  // "2025-12-01" → "Dec 1" ; "2025-12-15" → "Dec 15"
  const parts = raw.split('-');
  if (parts.length < 3) return raw;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return `${months[m] || parts[1]} ${d}`;
}

function renderLine(
  chart: echarts.ECharts,
  categories: string[],
  series: { name: string; data: number[] }[],
  mode: ChartMode,
  isDark: boolean
) {
  const textColor = isDark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const isSingle = series.length === 1;
  const sfFont = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  const monoFont = 'ui-monospace, "SF Mono", monospace';

  // Tooltip value formatter per mode
  const tooltipPrefix = mode === 'Amount' ? '$' : '';
  const tooltipSuffix = mode === 'Percentage' ? '%' : mode === 'Quantity' ? ' units' : mode === 'Order' ? ' orders' : '';

  const option: echarts.EChartsCoreOption = {
    backgroundColor: 'transparent',
    grid: { top: 50, left: 62, right: 24, bottom: 58, containLabel: false },

    // ── Crosshair tooltip with glow ──
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', width: 1, type: 'dashed' },
        crossStyle: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
        label: {
          backgroundColor: isDark ? 'rgba(50,50,52,0.9)' : 'rgba(245,245,247,0.92)',
          color: isDark ? '#fff' : '#1d1d1f',
          fontSize: 10, fontFamily: monoFont,
          borderWidth: 0,
          shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.1)',
        },
      },
      backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      borderWidth: 0.5,
      padding: [10, 14],
      textStyle: { color: isDark ? '#f5f5f7' : '#1d1d1f', fontSize: 11, fontFamily: sfFont },
      extraCssText: `border-radius: 12px; backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); box-shadow: 0 8px 32px rgba(0,0,0,${isDark ? '0.35' : '0.12'}), 0 0 0 0.5px ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};`,
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const dateStr = fmtDateLabel(params[0].axisValue);
        let html = `<div style="font-size:10px;opacity:0.45;margin-bottom:6px;font-family:${monoFont}">${dateStr}</div>`;
        params.forEach((p: any) => {
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:8px;box-shadow:0 0 6px ${p.color}60"></span>`;
          const val = typeof p.value === 'number' ? `${tooltipPrefix}${p.value.toLocaleString()}${tooltipSuffix}` : p.value;
          html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:20px;padding:2px 0">${dot}<span style="flex:1;font-size:11px">${p.seriesName}</span><span style="font-weight:600;font-family:${monoFont};font-size:12px">${val}</span></div>`;
        });
        return html;
      },
    },

    // ── Legend ──
    legend: {
      show: true,
      textStyle: { color: textColor, fontSize: 11, fontFamily: sfFont },
      top: 8, right: 12,
      itemWidth: 14, itemHeight: 3,
      itemGap: 16,
      icon: 'roundRect',
    },

    // ── X Axis — compact date labels ──
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: textColor, fontSize: 10, margin: 14,
        fontFamily: monoFont,
        formatter: (v: string) => fmtDateLabel(v),
        interval: categories.length > 30 ? Math.floor(categories.length / 12) : 'auto',
      },
      splitLine: { show: false },
    },

    // ── Y Axis ──
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: textColor, fontSize: 10, fontFamily: monoFont,
        formatter: (val: number) => fmtNum(val, mode),
      },
    },

    // ── DataZoom — Apple-style slider ──
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: 0, end: 100, minValueSpan: 3 },
      { type: 'slider', xAxisIndex: 0, start: 0, end: 100, height: 20, bottom: 4,
        textStyle: { color: textColor, fontSize: 9, fontFamily: monoFont },
        borderColor: 'transparent',
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
        fillerColor: isDark ? 'rgba(0,122,255,0.10)' : 'rgba(0,122,255,0.06)',
        handleIcon: 'M10.7,11.9H9.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4h1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
        handleSize: '60%',
        handleStyle: { color: '#007AFF', borderColor: '#007AFF', borderWidth: 1 },
        dataBackground: {
          lineStyle: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', width: 1 },
          areaStyle: { color: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
        },
        selectedDataBackground: {
          lineStyle: { color: 'rgba(0,122,255,0.3)', width: 1 },
          areaStyle: { color: 'rgba(0,122,255,0.05)' },
        },
      },
    ],

    // ── Series — gradient fills for all + glow emphasis ──
    series: series.map((s, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length];
      const fillOpacity = isSingle ? '35' : '12';
      const fillEnd = isSingle ? '05' : '02';

      return {
        name: s.name,
        type: 'line' as const,
        data: s.data,
        smooth: 0.35,
        showSymbol: false,
        symbolSize: 7,
        symbol: 'circle',
        sampling: 'lttb',
        lineStyle: { width: isSingle ? 2.5 : 2, color, cap: 'round' as const, join: 'round' as const },
        itemStyle: { color, borderWidth: 2, borderColor: isDark ? '#1c1c1e' : '#fff' },

        // Gradient area fill on every series
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + fillOpacity },
            { offset: 0.65, color: color + '08' },
            { offset: 1, color: color + fillEnd },
          ]),
        },

        // Hover: highlight self, fade others
        emphasis: {
          focus: 'series' as const,
          blurScope: 'coordinateSystem' as const,
          lineStyle: { width: 3, shadowBlur: 8, shadowColor: color + '60' },
          itemStyle: { borderWidth: 3, borderColor: '#fff', shadowBlur: 12, shadowColor: color + '50' },
        },

        // Mark points on single series
        ...(isSingle ? {
          markPoint: {
            symbol: 'circle', symbolSize: 8,
            label: {
              show: true, fontSize: 10, fontWeight: 'bold' as const,
              fontFamily: monoFont, position: 'top' as const, distance: 8,
              color: isDark ? '#f5f5f7' : '#1d1d1f',
              formatter: (p: any) => fmtNum(p.value, mode),
            },
            itemStyle: { color: '#fff', borderColor: color, borderWidth: 2,
              shadowBlur: 8, shadowColor: color + '50' },
            data: [
              { type: 'max', name: 'Max' },
              { type: 'min', name: 'Min' },
            ],
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: color + '30', type: 'dashed' as const, width: 1 },
            label: {
              show: true, position: 'insideEndTop' as const,
              fontSize: 9, fontFamily: monoFont,
              color: color + '80',
              formatter: (p: any) => `avg ${fmtNum(p.value, mode)}`,
            },
            data: [{ type: 'average', name: 'Avg' }],
          },
        } : {}),
      };
    }),

    animationDuration: 900,
    animationEasing: 'cubicInOut',
    animationDelay: (idx: number) => idx * 50,
  };

  chart.clear();
  chart.setOption(option);
}

// ═══════════════════════════════════════════════
// ECharts Render — Pie (Donut)
// ═══════════════════════════════════════════════

function renderPie(
  chart: echarts.ECharts,
  pieData: PieSlice[],
  isDark: boolean
) {
  const textColor = isDark ? 'rgba(235,235,245,0.85)' : 'rgba(28,28,30,0.85)';

  const option: echarts.EChartsCoreOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.96)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      borderWidth: 0.5,
      textStyle: { color: isDark ? '#fff' : '#1d1d1f', fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
      extraCssText: 'border-radius: 10px; backdrop-filter: blur(20px); box-shadow: 0 4px 24px rgba(0,0,0,0.15);',
      formatter: (params: any) => {
        const d = params.data;
        let html = `<div style="font-weight:600;margin-bottom:4px;font-size:13px">${d.name}</div>`;
        html += `<div style="font-size:18px;font-weight:700;margin-bottom:2px">$${d.value.toLocaleString()}</div>`;
        html += `<div style="opacity:0.5;font-size:11px">${d.pct}% of Sales</div>`;
        if (d.details && Object.keys(d.details).length > 0) {
          html += '<div style="height:1px;background:rgba(128,128,128,0.15);margin:8px 0"></div>';
          for (const [k, v] of Object.entries(d.details)) {
            html += `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;opacity:0.65;padding:1px 0"><span>${k}</span><span>$${(v as number).toLocaleString()}</span></div>`;
          }
        }
        return html;
      },
    },
    legend: {
      orient: 'vertical',
      right: 24,
      top: 'center',
      textStyle: { color: textColor, fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
      itemWidth: 10, itemHeight: 10, itemGap: 16,
    },
    series: [{
      type: 'pie',
      radius: ['40%', '68%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      padAngle: 2,
      itemStyle: {
        borderRadius: 8,
        borderColor: isDark ? 'rgba(28,28,30,0.9)' : 'rgba(255,255,255,0.9)',
        borderWidth: 3,
      },
      label: {
        show: true,
        formatter: (p: any) => `{name|${p.data.name}}\n{val|$${p.data.value.toLocaleString()}}`,
        rich: {
          name: { fontSize: 11, color: textColor, lineHeight: 18,
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
          val: { fontSize: 13, fontWeight: 'bold' as const, color: textColor, lineHeight: 20 },
        },
      },
      labelLine: { length: 16, length2: 12, smooth: true },
      emphasis: {
        scaleSize: 8,
        label: { fontSize: 14, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 24, shadowColor: 'rgba(0,0,0,0.2)' },
      },
      data: pieData.map((d, i) => ({
        name: d.name,
        value: d.value,
        pct: d.percentage,
        details: d.details,
        itemStyle: { color: PIE_PALETTE[i % PIE_PALETTE.length] },
      })),
    }],
    animationDuration: 1000,
    animationEasing: 'cubicOut',
  };

  chart.clear();
  chart.setOption(option);
}
