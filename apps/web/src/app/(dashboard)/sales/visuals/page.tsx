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

const LINE_COLORS = ['#0dcaf0', '#d63384', '#ffc107', '#20c997', '#6f42c1', '#fd7e14', '#e83e8c',
  '#198754', '#dc3545', '#0d6efd', '#6610f2', '#adb5bd'];

const PIE_COLORS = ['#34d399', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'];

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

  // -- Control state --
  const [chartType, setChartType] = useState<ChartType>('line');
  const [mode, setMode] = useState<ChartMode>('Amount');
  const [startDate, setStartDate] = useState(() => formatDate(new Date(Date.now() - 30 * 86400000)));
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
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // -- Render chart when data changes --
  useEffect(() => {
    if (!chartInstance.current || !data) return;

    if (chartType === 'pie' && data.pie_data) {
      renderPie(chartInstance.current, data.pie_data, colors, theme);
    } else if (data.categories && data.series) {
      renderLine(chartInstance.current, data.categories, data.series, mode, colors, theme);
    } else {
      chartInstance.current.clear();
    }
  }, [data, chartType, mode, colors, theme]);

  // Theme change → reinit chart
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }
    if (chartRef.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
  }, [theme]);

  // -- Checkbox toggle helpers --
  const toggleItem = useCallback((list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setter(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  }, []);

  const toggleStore = useCallback((store: string) => {
    setStores(prev => prev.includes(store) ? prev.filter(s => s !== store) : [...prev, store]);
  }, []);

  const isPie = chartType === 'pie';

  // i18n helper for filter labels
  const actionLabel = (k: string) => {
    const map: Record<string, string> = {
      Sales: t('hub.visuals.sales'), Cancel: t('hub.visuals.cancel'),
      Return: t('hub.visuals.return'), Request: t('hub.visuals.request'),
      Case: t('hub.visuals.case'), Dispute: t('hub.visuals.dispute'),
    };
    return map[k] || k;
  };
  const shipLabel = (k: string) => {
    const map: Record<string, string> = {
      shipRegular: t('hub.visuals.shipRegular'), shipFine: t('hub.visuals.shipFine'),
      shipOver: t('hub.visuals.shipOver'), shipReturn: t('hub.visuals.shipReturn'),
    };
    return map[k] || k;
  };
  const feeLabel = (k: string) => {
    const map: Record<string, string> = {
      cogs: t('hub.visuals.cogs'), platformFee: t('hub.visuals.platformFee'),
    };
    return map[k] || k;
  };

  // -- Mode buttons --
  const modes: { key: ChartMode; label: string }[] = [
    { key: 'Amount', label: t('hub.visuals.modeAmount') },
    { key: 'Quantity', label: t('hub.visuals.modeQty') },
    { key: 'Order', label: t('hub.visuals.modeOrder') },
    { key: 'Percentage', label: t('hub.visuals.modePct') },
  ];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[1400px] mx-auto">
          <SalesTabSelector />
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 pt-2">
        {/* ══ Control Bar ══ */}
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="rounded-xl border p-4 mb-4"
        >
          <div className="flex flex-wrap items-center gap-6">
            {/* Mode Selector */}
            <div>
              <label className="text-xs font-semibold uppercase mb-1.5 block" style={{ color: colors.textTertiary }}>
                {t('hub.visuals.mode')}
              </label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                {modes.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    disabled={isPie}
                    className="px-3 py-1.5 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: mode === m.key ? colors.textLink : 'transparent',
                      color: mode === m.key ? '#fff' : colors.textSecondary,
                      opacity: isPie ? 0.4 : 1,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="text-xs font-semibold uppercase mb-1.5 block" style={{ color: colors.textTertiary }}>
                {t('hub.visuals.dateRange')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date" value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="rounded-lg px-2.5 py-1.5 text-xs border"
                  style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                />
                <span className="text-xs" style={{ color: colors.textTertiary }}>→</span>
                <input
                  type="date" value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="rounded-lg px-2.5 py-1.5 text-xs border"
                  style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                />
              </div>
            </div>

            {/* Stores */}
            <div>
              <label className="text-xs font-semibold uppercase mb-1.5 block" style={{ color: colors.textTertiary }}>
                {t('hub.visuals.store')}
              </label>
              <div className="flex gap-3">
                {[{ key: 'esplus', label: 'ES Plus' }, { key: '88', label: 'Parts 88' }].map(s => (
                  <label key={s.key} className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => toggleStore(s.key)}
                      className="w-10 h-5 rounded-full relative transition-all cursor-pointer"
                      style={{ backgroundColor: stores.includes(s.key) ? colors.textLink : (theme === 'dark' ? '#4a4a4a' : '#d1d5db') }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ left: stores.includes(s.key) ? 22 : 2 }}
                      />
                    </div>
                    <span className="text-xs font-mono" style={{ color: colors.text }}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Chart Type Toggle */}
            <div>
              <label className="text-xs font-semibold uppercase mb-1.5 block" style={{ color: colors.textTertiary }}>
                {t('hub.visuals.chartType')}
              </label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                {(['line', 'pie'] as ChartType[]).map(ct => (
                  <button
                    key={ct}
                    onClick={() => setChartType(ct)}
                    className="px-4 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5"
                    style={{
                      backgroundColor: chartType === ct ? colors.textLink : 'transparent',
                      color: chartType === ct ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {ct === 'line' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
                    )}
                    {t(`hub.visuals.${ct}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ Content: Filter Panel + Chart ══ */}
        <div className="flex gap-4">
          {/* Left: Filter Panel */}
          <div className="w-[220px] flex-shrink-0">
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, opacity: isPie ? 0.5 : 1 }}
              className="rounded-xl border p-4 transition-opacity"
            >
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: colors.text }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {t('hub.visuals.filters')}
              </h3>

              {/* Actions */}
              <div className="mb-4">
                <label className="text-xs font-bold mb-2 block" style={{ color: '#60a5fa' }}>
                  {t('hub.visuals.actions')}
                </label>
                <div className="flex flex-col gap-1.5">
                  {ACTION_KEYS.map(k => (
                    <FilterChip
                      key={k} label={actionLabel(k)} active={actions.includes(k)}
                      onClick={() => toggleItem(actions, setActions, k)}
                      activeColor="#3b82f6" disabled={isPie} colors={colors}
                    />
                  ))}
                </div>
              </div>

              {/* Ships */}
              <div className="mb-4">
                <label className="text-xs font-bold mb-2 block" style={{ color: '#fbbf24' }}>
                  {t('hub.visuals.shipping')}
                </label>
                <div className="flex flex-col gap-1.5">
                  {SHIP_KEYS.map(k => (
                    <FilterChip
                      key={k} label={shipLabel(k)} active={ships.includes(k)}
                      onClick={() => toggleItem(ships, setShips, k)}
                      activeColor="#eab308" disabled={isPie} colors={colors}
                    />
                  ))}
                </div>
              </div>

              {/* Fees */}
              <div>
                <label className="text-xs font-bold mb-2 block" style={{ color: '#f87171' }}>
                  {t('hub.visuals.expenses')}
                </label>
                <div className="flex flex-col gap-1.5">
                  {FEE_KEYS.map(k => (
                    <FilterChip
                      key={k} label={feeLabel(k)} active={fees.includes(k)}
                      onClick={() => toggleItem(fees, setFees, k)}
                      activeColor="#ef4444" disabled={isPie} colors={colors}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Chart Area */}
          <div className="flex-1 min-w-0">
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-xl border relative overflow-hidden"
            >
              {/* Loading overlay */}
              {(isLoading || isFetching) && (
                <div className="absolute inset-0 flex items-center justify-center z-10"
                  style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)' }}>
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
                      style={{ borderColor: colors.textLink, borderTopColor: 'transparent' }} />
                    <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                      {t('hub.visuals.loading')}
                    </span>
                  </div>
                </div>
              )}

              {/* ECharts container */}
              <div ref={chartRef} style={{ width: '100%', height: 600 }} />

              {/* No data message */}
              {!isLoading && !isFetching && data && !data.pie_data?.length && !data.series?.length && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm" style={{ color: colors.textTertiary }}>
                    {t('hub.visuals.noData')}
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
// Filter Chip Component
// ═══════════════════════════════════════════════

function FilterChip({ label, active, onClick, activeColor, disabled, colors }: {
  label: string; active: boolean; onClick: () => void;
  activeColor: string; disabled: boolean; colors: any;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all text-left"
      style={{
        backgroundColor: active ? activeColor : 'transparent',
        color: active ? '#fff' : colors.textSecondary,
        border: `1px solid ${active ? 'transparent' : colors.border}`,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════
// ECharts Render Functions
// ═══════════════════════════════════════════════

function renderLine(
  chart: echarts.ECharts,
  categories: string[],
  series: { name: string; data: number[] }[],
  mode: ChartMode,
  colors: any,
  theme: string
) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#adb5bd' : '#6c757d';
  const splitColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const yFormatter = (val: number) => {
    if (mode === 'Amount') return `$${val.toLocaleString()}`;
    if (mode === 'Quantity') return `${val}`;
    if (mode === 'Order') return `${val}`;
    if (mode === 'Percentage') return `${val}%`;
    return `${val}`;
  };

  const option: echarts.EChartsCoreOption = {
    backgroundColor: 'transparent',
    grid: { top: 50, left: 65, right: 30, bottom: 60 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
      borderColor: isDark ? '#444' : '#ddd',
      textStyle: { color: isDark ? '#fff' : '#333', fontFamily: 'ui-monospace, monospace', fontSize: 12 },
    },
    legend: {
      show: true,
      textStyle: { color: textColor, fontSize: 11 },
      top: 5, right: 10,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisLabel: { color: textColor, fontFamily: 'ui-monospace, monospace', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: textColor, fontFamily: 'ui-monospace, monospace', fontSize: 10, formatter: yFormatter },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
      { type: 'slider', xAxisIndex: 0, start: 0, end: 100, height: 20, bottom: 8,
        textStyle: { color: textColor, fontSize: 10 },
        borderColor: 'transparent', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      },
    ],
    series: series.map((s, idx) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.5, color: LINE_COLORS[idx % LINE_COLORS.length] },
      itemStyle: { color: LINE_COLORS[idx % LINE_COLORS.length] },
      areaStyle: series.length === 1 ? {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: LINE_COLORS[idx % LINE_COLORS.length] + '40' },
          { offset: 1, color: LINE_COLORS[idx % LINE_COLORS.length] + '05' },
        ]),
      } : undefined,
    })),
  };

  chart.clear();
  chart.setOption(option);
}

function renderPie(
  chart: echarts.ECharts,
  pieData: PieSlice[],
  colors: any,
  theme: string
) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#e5e7eb' : '#374151';

  const option: echarts.EChartsCoreOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
      borderColor: isDark ? '#444' : '#ddd',
      textStyle: { color: isDark ? '#fff' : '#333', fontSize: 12 },
      formatter: (params: any) => {
        const d = params.data;
        let html = `<div style="font-weight:600;margin-bottom:4px">${d.name}</div>`;
        html += `<div>$${d.value.toLocaleString()}</div>`;
        html += `<div style="opacity:0.6;font-size:11px">${d.pct}% of Sales</div>`;
        if (d.details && Object.keys(d.details).length > 0) {
          html += '<hr style="margin:6px 0;border-color:rgba(128,128,128,0.2)">';
          for (const [k, v] of Object.entries(d.details)) {
            html += `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;opacity:0.7"><span>${k}</span><span>$${(v as number).toLocaleString()}</span></div>`;
          }
        }
        return html;
      },
    },
    legend: {
      orient: 'vertical',
      right: 20,
      top: 'center',
      textStyle: { color: textColor, fontSize: 12 },
    },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['40%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: isDark ? '#1a1a2e' : '#fff', borderWidth: 3 },
      label: {
        show: true,
        formatter: '{b}\n${c}',
        color: textColor,
        fontSize: 11,
        lineHeight: 16,
      },
      labelLine: { length: 15, length2: 10 },
      emphasis: {
        label: { fontSize: 14, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.3)' },
      },
      data: pieData.map((d, i) => ({
        name: d.name,
        value: d.value,
        pct: d.percentage,
        details: d.details,
        itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
      })),
    }],
  };

  chart.clear();
  chart.setOption(option);
}
