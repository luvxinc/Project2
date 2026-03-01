'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import ListingTabSelector from '../components/ListingTabSelector';
import { autoOpsApi } from '@/lib/api/sales';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { animate } from 'animejs';

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════
interface TreeNode { id: number; category_group: string; level: number; decision_key: string; enabled: boolean }
interface SkuMeta { adapterThicknesses: string[]; adapterLugs: string[]; spacerThicknesses: string[] }
interface Strategy { id?: number; category_group: string; path_key: string; qty_min: number; qty_max: number | null; discount_type: 'AMOUNT' | 'PERCENT'; discount_value: number; enabled: boolean }

type ViewMode = 'hub' | 'restock' | 'reprice' | 'ads' | 'offerReply' | 'autoOps';

// ═══════════════════════════════════════════════════
// Decision Tree Config
// ═══════════════════════════════════════════════════
interface DecisionLevel { key: string; labelKey: string; descKey: string; valuesFrom?: keyof SkuMeta | 'priceRanges' | 'otherPieceCounts' | string[]; valueSuffix?: string }

const ADAPTER_LEVELS: DecisionLevel[] = [
  { key: 'by_lug', labelKey: 'offerByLug', descKey: 'offerByLugDesc', valuesFrom: 'adapterLugs', valueSuffix: '-lug' },
  { key: 'by_thickness', labelKey: 'offerByThickness', descKey: 'offerByThicknessDesc', valuesFrom: 'adapterThicknesses', valueSuffix: 'mm' },
  { key: 'by_piece_count', labelKey: 'offerByPieceCount', descKey: 'offerByPieceCountDesc', valuesFrom: ['2', '4'], valueSuffix: ' pcs' },
];
const SPACER_LEVELS: DecisionLevel[] = [
  { key: 'by_thickness', labelKey: 'offerByThickness', descKey: 'offerByThicknessDesc', valuesFrom: 'spacerThicknesses', valueSuffix: 'mm' },
  { key: 'by_piece_count', labelKey: 'offerByPieceCount', descKey: 'offerByPieceCountDesc', valuesFrom: ['2', '4'], valueSuffix: ' pcs' },
];
const OTHER_LEVELS: DecisionLevel[] = [
  { key: 'by_price_range', labelKey: 'offerByPriceRange', descKey: 'offerByPriceRangeDesc', valuesFrom: 'priceRanges', valueSuffix: '' },
  { key: 'by_piece_count', labelKey: 'offerByPieceCount', descKey: 'offerByPieceCountDesc', valuesFrom: 'otherPieceCounts', valueSuffix: ' pcs' },
];
const CATEGORIES = [
  { group: 'WHEEL_ADAPTER', titleKey: 'offerCategoryAdapter' as const, colorKey: 'blue' as const, levels: ADAPTER_LEVELS },
  { group: 'WHEEL_SPACER', titleKey: 'offerCategorySpacer' as const, colorKey: 'purple' as const, levels: SPACER_LEVELS },
  { group: 'OTHER', titleKey: 'offerCategoryOther' as const, colorKey: 'orange' as const, levels: OTHER_LEVELS },
];

// Module card definitions
const MODULE_CARDS: { key: ViewMode; titleKey: string; descKey: string; colorKey: string; disabled?: boolean; icon: React.ReactNode }[] = [
  {
    key: 'restock', titleKey: 'restockTitle', descKey: 'restockDesc', colorKey: 'blue',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
  },
  {
    key: 'reprice', titleKey: 'repriceTitle', descKey: 'repriceDesc', colorKey: 'orange', disabled: true,
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'ads', titleKey: 'adsTitle', descKey: 'adsDesc', colorKey: 'purple',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
  {
    key: 'offerReply', titleKey: 'offerTitle', descKey: 'offerDesc', colorKey: 'green',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>,
  },
  {
    key: 'autoOps' as ViewMode, titleKey: 'autoOpsTitle', descKey: 'autoOpsDesc', colorKey: 'green',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
];

// ═══════════════════════════════════════════════════
// Main Page — Apple-style 2-level slide navigation
// ═══════════════════════════════════════════════════

export default function AutomationPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.automation');

  const [viewMode, setViewMode] = useState<ViewMode>('hub');
  const [rules, setRules] = useState<Record<string, string>>({});
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [skuMeta, setSkuMeta] = useState<SkuMeta>({ adapterThicknesses: [], adapterLugs: [], spacerThicknesses: [] });
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>('WHEEL_ADAPTER');
  const [priceRanges, setPriceRanges] = useState<string[]>(['0-30', '31-60', '61-100']);
  const [otherPieceCounts, setOtherPieceCounts] = useState<string[]>(['1-6', '7-12', '13-24']);
  const [autoOpsEnabled, setAutoOpsEnabled] = useState(false);
  const [autoOpsLoading, setAutoOpsLoading] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // ═══════════ Data Loading ═══════════
  const loadData = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrlCached();
      const [rulesRes, metaRes] = await Promise.all([
        fetch(`${baseUrl}/automation/rules`),
        fetch(`${baseUrl}/automation/sku-meta`),
      ]);
      const rulesData = await rulesRes.json();
      const metaData = await metaRes.json();
      const map: Record<string, string> = {};
      for (const r of (rulesData.rules || [])) map[`${r.module}.${r.rule_key}`] = r.rule_value;
      setRules(map);
      // Load price ranges from saved rules
      const savedRanges = map['OFFER.price_ranges'];
      if (savedRanges) setPriceRanges(savedRanges.split(',').filter(Boolean));
      const savedPieces = map['OFFER.piece_counts'];
      if (savedPieces) setOtherPieceCounts(savedPieces.split(',').filter(Boolean));
      setTree(rulesData.tree || []);
      setStrategies((rulesData.strategies || []).map((s: Record<string, unknown>) => ({
        id: s.id as number, category_group: s.category_group as string, path_key: s.path_key as string,
        qty_min: s.qty_min as number, qty_max: s.qty_max as number | null,
        discount_type: s.discount_type as 'AMOUNT' | 'PERCENT', discount_value: Number(s.discount_value),
        enabled: s.enabled as boolean,
      })));
      setSkuMeta(metaData);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load auto-ops status
  useEffect(() => {
    autoOpsApi.getStatus().then(res => setAutoOpsEnabled(res.enabled)).catch(() => {});
  }, []);

  const toggleAutoOps = async () => {
    setAutoOpsLoading(true);
    try {
      const res = await autoOpsApi.setStatus(!autoOpsEnabled);
      setAutoOpsEnabled(res.enabled);
    } catch { /* ignore */ }
    finally { setAutoOpsLoading(false); }
  };

  const rv = (mod: string, key: string, fb: string) => rules[`${mod}.${key}`] ?? fb;
  const setRv = (mod: string, key: string, val: string) => setRules(p => ({ ...p, [`${mod}.${key}`]: val }));
  const isTreeEnabled = (group: string, key: string) => tree.find(n => n.category_group === group && n.decision_key === key)?.enabled ?? false;
  const toggleTree = (group: string, key: string) => setTree(p => p.map(n => n.category_group === group && n.decision_key === key ? { ...n, enabled: !n.enabled } : n));

  const handleSave = async () => {
    setSaving(true);
    try {
      const baseUrl = getApiBaseUrlCached();
      await fetch(`${baseUrl}/automation/rules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: { ...rules, 'OFFER.price_ranges': priceRanges.join(','), 'OFFER.piece_counts': otherPieceCounts.join(',') }, tree }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const getTreeValues = (level: DecisionLevel): string[] => {
    if (!level.valuesFrom) return [];
    if (Array.isArray(level.valuesFrom)) return level.valuesFrom;
    if (level.valuesFrom === 'priceRanges') return priceRanges;
    if (level.valuesFrom === 'otherPieceCounts') return otherPieceCounts;
    return skuMeta[level.valuesFrom] || [];
  };

  // ═══════════ Leaf Node Computation ═══════════
  const computeLeafPaths = (group: string, levels: DecisionLevel[]): { pathKey: string; label: string }[] => {
    // Only consider enabled levels
    const enabledLevels = levels.filter(l => isTreeEnabled(group, l.key));
    if (enabledLevels.length === 0) return [{ pathKey: '*', label: t('offerUniversal') }];

    // Build cartesian product of all enabled dimension values
    const dimensions: { prefix: string; values: string[]; suffix: string }[] = [];
    for (const level of enabledLevels) {
      const vals = getTreeValues(level);
      const prefix = level.key.replace('by_', ''); // lug, thickness, piece_count, price_range
      if (vals.length === 0) continue; // skip if no values (e.g. price_range with no ranges)
      dimensions.push({ prefix, values: vals, suffix: level.valueSuffix || '' });
    }

    if (dimensions.length === 0) return [{ pathKey: '*', label: t('offerUniversal') }];

    // Cartesian product
    let paths: { pathKey: string; label: string }[] = [{ pathKey: '', label: '' }];
    for (const dim of dimensions) {
      const next: { pathKey: string; label: string }[] = [];
      for (const p of paths) {
        for (const v of dim.values) {
          const sep = p.pathKey ? '|' : '';
          next.push({
            pathKey: `${p.pathKey}${sep}${dim.prefix}:${v}`,
            label: `${p.label}${p.label ? ' / ' : ''}${v}${dim.suffix}`,
          });
        }
      }
      paths = next;
    }
    return paths;
  };

  // ═══════════ Strategy CRUD ═══════════
  const localIdCounter = useRef(-1);

  const addStrategyTier = async (group: string, pathKey: string) => {
    const tempId = localIdCounter.current--;
    const newStrategy: Strategy = { id: tempId, category_group: group, path_key: pathKey, qty_min: 1, qty_max: null, discount_type: 'AMOUNT', discount_value: 0, enabled: true };
    setStrategies(prev => [...prev, newStrategy]);
    try {
      const baseUrl = getApiBaseUrlCached();
      const res = await fetch(`${baseUrl}/automation/strategies`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_group: group, path_key: pathKey, qty_min: 1, qty_max: null, discount_type: 'AMOUNT', discount_value: 0 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) {
          // Replace temp ID with server-assigned ID
          setStrategies(prev => prev.map(s => s.id === tempId ? { ...s, id: data.id } : s));
        }
      }
    } catch { /* strategy added locally, will sync on next save */ }
  };

  const updateStrategyTier = async (s: Strategy) => {
    if (!s.id || s.id < 0) return; // don't push temp-only tiers to server
    try {
      const baseUrl = getApiBaseUrlCached();
      await fetch(`${baseUrl}/automation/strategies`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
    } catch { /* ignore */ }
  };

  const deleteStrategyTier = async (id: number) => {
    setStrategies(prev => prev.filter(s => s.id !== id));
    if (id > 0) {
      try {
        const baseUrl = getApiBaseUrlCached();
        await fetch(`${baseUrl}/automation/strategies/${id}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
  };

  const updateLocalStrategy = (id: number, field: keyof Strategy, value: unknown) => {
    if (id == null) return; // safety: never update when id is undefined
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // ═══════════ Slide Animation (same pattern as finance/flow) ═══════════
  const slideForward = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, { translateX: [0, -window.innerWidth], opacity: [1, 0], duration: 350, ease: 'inOut(3)' });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, { translateX: [window.innerWidth, 0], opacity: [0, 1], duration: 350, ease: 'inOut(3)' });
        }
      });
    }, 300);
  }, []);

  const slideBack = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, { translateX: [0, window.innerWidth], opacity: [1, 0], duration: 350, ease: 'inOut(3)' });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, { translateX: [-window.innerWidth, 0], opacity: [0, 1], duration: 350, ease: 'inOut(3)' });
        }
      });
    }, 300);
  }, []);

  // ═══════════ Navigation ═══════════
  const handleCardClick = useCallback((target: ViewMode) => {
    slideForward(() => setViewMode(target));
  }, [slideForward]);

  const handleBack = useCallback(() => {
    slideBack(() => setViewMode('hub'));
  }, [slideBack]);

  // ═══════════ Panel title helper ═══════════
  const panelTitle = () => {
    switch (viewMode) {
      case 'restock': return t('restockTitle');
      case 'ads': return t('adsTitle');
      case 'offerReply': return t('offerTitle');
      case 'reprice': return t('repriceTitle');
      case 'autoOps': return t('autoOpsTitle');
      default: return '';
    }
  };

  return (
    <div
      className="min-h-screen pb-20 overflow-x-hidden"
      style={{ backgroundColor: colors.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
      onClick={viewMode !== 'hub' ? handleBack : undefined}
    >
      {/* Header — always visible */}
      <section className="max-w-[1800px] mx-auto px-6 pt-10 pb-6">
        <ListingTabSelector />
        <p style={{ color: colors.textSecondary }} className="text-[15px] mt-3">{t('subtitle')}</p>
      </section>

      {/* Content Area */}
      <section className="max-w-[1800px] mx-auto px-6 relative z-20">
        <div ref={contentRef} className="relative">

          {/* ═══ Level 1: Hub Cards ═══ */}
          {viewMode === 'hub' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {MODULE_CARDS.map(mod => { const mc = colors[mod.colorKey as keyof typeof colors] as string; return (
                <button
                  key={mod.key}
                  onClick={() => !mod.disabled && handleCardClick(mod.key)}
                  disabled={mod.disabled}
                  className="group relative text-left rounded-2xl border p-6 transition-all duration-200"
                  style={{
                    backgroundColor: colors.bgSecondary, borderColor: colors.border,
                    cursor: mod.disabled ? 'not-allowed' : 'pointer', opacity: mod.disabled ? 0.55 : 1,
                  }}
                  onMouseEnter={e => { if (!mod.disabled) { e.currentTarget.style.borderColor = mc; e.currentTarget.style.boxShadow = `0 0 0 1px ${mc}30, 0 4px 20px ${mc}10`; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105" style={{ backgroundColor: `${mc}12`, color: mc }}>{mod.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[17px] font-semibold" style={{ color: colors.text }}>{t(mod.titleKey)}</h3>
                        {mod.disabled && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${mc}15`, color: mc }}>{t('repriceComingSoon')}</span>}
                      </div>
                      <p className="text-[13px] mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>{t(mod.descKey)}</p>
                    </div>
                    {!mod.disabled && (
                      <svg className="w-5 h-5 flex-shrink-0 mt-1 transition-transform group-hover:translate-x-1" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    )}
                  </div>
                </button>
              ); })}
            </div>
          )}

          {/* ═══ Level 2: Detail Panels ═══ */}
          {viewMode !== 'hub' && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div onClick={e => e.stopPropagation()}>

              {/* Back + Title + Save */}
              <div className="flex items-center justify-between mb-6">
                <button onClick={handleBack} className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70 transition-opacity" style={{ color: colors.controlAccent }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  {t('title')}
                </button>
                {['restock', 'ads', 'offerReply'].includes(viewMode) && (
                  <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-[13px] font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: saved ? colors.green : colors.controlAccent }}>
                    {saving ? t('saving') : saved ? t('saved') : t('save')}
                  </button>
                )}
              </div>

              <h2 className="text-[22px] font-bold mb-6" style={{ color: colors.text }}>{panelTitle()}</h2>

              {/* ── Restock ── */}
              {viewMode === 'restock' && (
                <div className="rounded-2xl border p-8 space-y-1" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                  {[
                    { label: t('restockMinStock'), key: 'min_stock', fb: '5', help: t('restockMinHelp') },
                    { label: t('restockMaxStock'), key: 'max_stock', fb: '50', help: t('restockMaxHelp') },
                    { label: t('restockSoldDivisor'), key: 'sold_divisor', fb: '30', help: t('restockDivisorHelp') },
                  ].map(f => (
                    <div key={f.key} className="flex items-center justify-between py-4 border-b last:border-b-0" style={{ borderColor: colors.border }}>
                      <div><p className="text-[14px] font-medium" style={{ color: colors.text }}>{f.label}</p><p className="text-[12px] mt-0.5" style={{ color: colors.textTertiary }}>{f.help}</p></div>
                      <input type="number" value={rv('RESTOCK', f.key, f.fb)} onChange={e => setRv('RESTOCK', f.key, e.target.value)}
                        className="w-24 px-3 py-2 rounded-xl border text-[14px] text-right outline-none" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Reprice (Coming Soon) ── */}
              {viewMode === 'reprice' && (
                <div className="rounded-2xl border p-16 flex flex-col items-center" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                  <span className="text-[16px] font-semibold px-4 py-1.5 rounded-full mb-2" style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>{t('repriceComingSoon')}</span>
                  <p className="text-[13px]" style={{ color: colors.textTertiary }}>{t('repriceComingSoonDesc')}</p>
                </div>
              )}

              {/* ── Ads ── */}
              {viewMode === 'ads' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border p-6 space-y-5" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('adsStrategyOffsets')}</h4>
                    {[
                      { label: t('adsAggressiveWeight'), key: 'aggressive_offset', fb: '3.0', prefix: '+' },
                      { label: t('adsConservativeWeight'), key: 'conservative_offset', fb: '3.0', prefix: '−' },
                    ].map(f => (
                      <div key={f.key} className="flex items-center justify-between">
                        <div>
                          <p className="text-[14px] font-medium" style={{ color: colors.text }}>{f.label}</p>
                          <p className="text-[11px]" style={{ color: colors.textTertiary }}>{f.prefix === '+' ? t('adsOffsetHelpPlus') : t('adsOffsetHelpMinus')}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[14px]" style={{ color: colors.textTertiary }}>{f.prefix}</span>
                          <input type="number" step="0.5" value={rv('ADS', f.key, f.fb)} onChange={e => setRv('ADS', f.key, e.target.value)}
                            className="w-20 px-3 py-2 rounded-xl border text-[14px] text-right outline-none" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
                          <span className="text-[13px]" style={{ color: colors.textTertiary }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border p-6 space-y-5" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('adsRateLimits')}</h4>
                    {[
                      { label: t('adsAdRateMin'), key: 'ad_rate_min', fb: '2.0' },
                      { label: t('adsAdRateMax'), key: 'ad_rate_max', fb: '8.0' },
                    ].map(f => (
                      <div key={f.key} className="flex items-center justify-between">
                        <p className="text-[14px] font-medium" style={{ color: colors.text }}>{f.label}</p>
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.5" value={rv('ADS', f.key, f.fb)} onChange={e => setRv('ADS', f.key, e.target.value)}
                            className="w-20 px-3 py-2 rounded-xl border text-[14px] text-right outline-none" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
                          <span className="text-[13px]" style={{ color: colors.textTertiary }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Preview */}
                  {(() => {
                    const sr = 10;
                    const agg = Math.min(sr + Number(rv('ADS', 'aggressive_offset', '3')), Number(rv('ADS', 'ad_rate_max', '8')));
                    const con = Math.max(sr - Number(rv('ADS', 'conservative_offset', '3')), Number(rv('ADS', 'ad_rate_min', '2')));
                    return (
                      <div className="rounded-2xl border p-5" style={{ backgroundColor: `${colors.purple}06`, borderColor: `${colors.purple}20` }}>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: colors.purple }}>{t('adsPreviewTitle', { rate: sr })}</h4>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div><p className="text-[11px]" style={{ color: colors.textTertiary }}>{t('adsPreviewConservative')}</p><p className="text-[22px] font-bold" style={{ color: colors.controlAccent }}>{con.toFixed(1)}%</p></div>
                          <div><p className="text-[11px]" style={{ color: colors.textTertiary }}>{t('adsPreviewBalanced')}</p><p className="text-[22px] font-bold" style={{ color: colors.text }}>{sr}%</p></div>
                          <div><p className="text-[11px]" style={{ color: colors.textTertiary }}>{t('adsPreviewAggressive')}</p><p className="text-[22px] font-bold" style={{ color: colors.orange }}>{agg.toFixed(1)}%</p></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Offer Reply Decision Tree ── */}
              {viewMode === 'offerReply' && (
                <div className="space-y-4">
                  {CATEGORIES.map(cat => { const cc = colors[cat.colorKey as keyof typeof colors] as string;
                    const isOpen = expandedCat === cat.group;
                    const enabledCount = cat.levels.filter(l => isTreeEnabled(cat.group, l.key)).length;
                    const leafPaths = computeLeafPaths(cat.group, cat.levels);
                    return (
                      <div key={cat.group} className="rounded-2xl border overflow-hidden" style={{ borderColor: isOpen ? cc : colors.border }}>
                        <button
                          onClick={() => setExpandedCat(isOpen ? null : cat.group)}
                          className="w-full flex items-center justify-between px-6 py-4 transition-colors"
                          style={{ backgroundColor: isOpen ? `${cc}08` : colors.bgSecondary }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cc }} />
                            <span className="text-[16px] font-semibold" style={{ color: colors.text }}>{t(cat.titleKey)}</span>
                            <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cc}12`, color: cc }}>{enabledCount}/{cat.levels.length}</span>
                            <span className="text-[11px]" style={{ color: colors.textTertiary }}>{leafPaths.length} {t('offerLeafNodes')}</span>
                          </div>
                          <svg className="w-5 h-5 transition-transform" style={{ color: colors.textTertiary, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {isOpen && (
                          <div className="px-6 pb-6" style={{ backgroundColor: colors.bgSecondary }}>
                            {/* Dimension toggles — flat & independent (like Color + Size) */}
                            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cat.levels.length}, 1fr)` }}>
                              {cat.levels.map(level => {
                                const enabled = isTreeEnabled(cat.group, level.key);
                                const values = getTreeValues(level);
                                return (
                                  <div key={level.key} className="rounded-xl border p-3" style={{ borderColor: enabled ? cc : colors.border, backgroundColor: enabled ? `${cc}05` : 'transparent' }}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[13px] font-medium" style={{ color: colors.text }}>{t(level.labelKey)}</p>
                                      <button onClick={() => toggleTree(cat.group, level.key)} className="relative flex-shrink-0 rounded-full transition-colors" style={{ backgroundColor: enabled ? colors.green : colors.gray5, width: '40px', height: '22px' }}>
                                        <span className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all" style={{ left: enabled ? '20px' : '2px' }} />
                                      </button>
                                    </div>
                                    <p className="text-[10px] mb-2" style={{ color: colors.textTertiary }}>{t(level.descKey)}</p>
                                    {/* Price range editor (only for by_price_range) */}
                                    {enabled && level.key === 'by_price_range' && (
                                      <div className="space-y-1.5">
                                        {priceRanges.map((range, idx) => {
                                          const parts = range.split('-');
                                          const min = parts[0] || '';
                                          const max = parts[1] || '';
                                          const minNum = min === '' ? 0 : Number(min);
                                          const maxNum = max === '' ? Infinity : Number(max);
                                          // Overlap detection
                                          const hasOverlap = priceRanges.some((other, oi) => {
                                            if (oi === idx) return false;
                                            const op = other.split('-');
                                            const oMin = op[0] === '' ? 0 : Number(op[0]);
                                            const oMax = op[1] === '' ? Infinity : Number(op[1]);
                                            return minNum <= oMax && oMin <= maxNum;
                                          });
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5">
                                              <span className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>≥ $</span>
                                              <input type="number" min="0" step="0.01" value={min} placeholder="0"
                                                onChange={e => {
                                                  const updated = [...priceRanges];
                                                  updated[idx] = `${e.target.value}-${max}`;
                                                  setPriceRanges(updated);
                                                }}
                                                className="w-16 px-1.5 py-1 rounded border text-[11px] text-center outline-none"
                                                style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              <span className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>≤ $</span>
                                              <input type="number" min="0" step="0.01" value={max} placeholder="∞"
                                                onChange={e => {
                                                  const updated = [...priceRanges];
                                                  updated[idx] = `${min}-${e.target.value}`;
                                                  setPriceRanges(updated);
                                                }}
                                                className="w-16 px-1.5 py-1 rounded border text-[11px] text-center outline-none"
                                                style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              <button onClick={() => setPriceRanges(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-[10px] hover:opacity-70" style={{ color: colors.red }}>✕</button>
                                              {hasOverlap && <span className="text-[9px] font-medium" style={{ color: colors.red }}>⚠ {t('overlapWarning')}</span>}
                                            </div>
                                          );
                                        })}
                                        <button
                                          onClick={() => {
                                            const last = priceRanges[priceRanges.length - 1];
                                            const lastMax = last ? Number(last.split('-')[1] || 0) : 0;
                                            const nextMin = lastMax ? (lastMax + 0.01).toFixed(2) : '0';
                                            const nextMax = (Number(nextMin) + 30).toFixed(2);
                                            setPriceRanges(prev => [...prev, `${nextMin}-${nextMax}`]);
                                          }}
                                          className="flex items-center gap-1 text-[10px] font-medium hover:opacity-80 mt-1"
                                          style={{ color: cc }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                          {t('addRange')}
                                        </button>
                                      </div>
                                    )}
                                    {/* Piece count range editor (only for OTHER by_piece_count with dynamic values) */}
                                    {enabled && level.key === 'by_piece_count' && level.valuesFrom === 'otherPieceCounts' && (
                                      <div className="space-y-1.5">
                                        {otherPieceCounts.map((range, idx) => {
                                          const parts = range.split('-');
                                          const min = parts[0] || '';
                                          const max = parts[1] || '';
                                          const minNum = min === '' ? 0 : Number(min);
                                          const maxNum = max === '' ? Infinity : Number(max);
                                          // Overlap detection
                                          const hasOverlap = otherPieceCounts.some((other, oi) => {
                                            if (oi === idx) return false;
                                            const op = other.split('-');
                                            const oMin = op[0] === '' ? 0 : Number(op[0]);
                                            const oMax = op[1] === '' ? Infinity : Number(op[1]);
                                            return minNum <= oMax && oMin <= maxNum;
                                          });
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5">
                                              <span className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>≥</span>
                                              <input type="number" min="0" step="1" value={min} placeholder="0"
                                                onChange={e => {
                                                  const updated = [...otherPieceCounts];
                                                  updated[idx] = `${e.target.value}-${max}`;
                                                  setOtherPieceCounts(updated);
                                                }}
                                                className="w-14 px-1.5 py-1 rounded border text-[11px] text-center outline-none"
                                                style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              <span className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>≤</span>
                                              <input type="number" min="0" step="1" value={max} placeholder="∞"
                                                onChange={e => {
                                                  const updated = [...otherPieceCounts];
                                                  updated[idx] = `${min}-${e.target.value}`;
                                                  setOtherPieceCounts(updated);
                                                }}
                                                className="w-14 px-1.5 py-1 rounded border text-[11px] text-center outline-none"
                                                style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              <span className="text-[9px]" style={{ color: colors.textTertiary }}>pcs</span>
                                              <button onClick={() => setOtherPieceCounts(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-[10px] hover:opacity-70" style={{ color: colors.red }}>✕</button>
                                              {hasOverlap && <span className="text-[9px] font-medium" style={{ color: colors.red }}>⚠ {t('overlapWarning')}</span>}
                                            </div>
                                          );
                                        })}
                                        <button
                                          onClick={() => {
                                            const last = otherPieceCounts[otherPieceCounts.length - 1];
                                            const lastMax = last ? Number(last.split('-')[1] || 0) : 0;
                                            const nextMin = lastMax ? lastMax + 1 : 1;
                                            setOtherPieceCounts(prev => [...prev, `${nextMin}-${nextMin + 5}`]);
                                          }}
                                          className="flex items-center gap-1 text-[10px] font-medium hover:opacity-80 mt-1"
                                          style={{ color: cc }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                          {t('addPieceCount')}
                                        </button>
                                      </div>
                                    )}
                                    {/* Value pills for static dimensions (ADAPTER/SPACER piece_count, lugs, thickness) */}
                                    {enabled && level.valuesFrom !== 'priceRanges' && level.valuesFrom !== 'otherPieceCounts' && values.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {values.map(v => (
                                          <span key={v} className="px-1.5 py-0.5 text-[9px] rounded border font-mono" style={{ backgroundColor: `${cc}08`, borderColor: `${cc}25`, color: cc }}>
                                            {v}{level.valueSuffix || ''}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Price range pills when enabled */}
                                    {enabled && level.key === 'by_price_range' && priceRanges.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {priceRanges.map(r => (
                                          <span key={r} className="px-1.5 py-0.5 text-[9px] rounded border font-mono" style={{ backgroundColor: `${cc}08`, borderColor: `${cc}25`, color: cc }}>
                                            ${r}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* ═══ Leaf Node Strategies ═══ */}
                            <div className="mt-5 pt-4 border-t" style={{ borderColor: colors.border }}>
                              <h4 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textTertiary }}>
                                {t('offerLeafStrategies')} ({leafPaths.length})
                              </h4>
                              <div className="space-y-3">
                                {leafPaths.map(leaf => {
                                  const tiers = strategies.filter(s => s.category_group === cat.group && s.path_key === leaf.pathKey);
                                  return (
                                    <div key={leaf.pathKey} className="rounded-xl border p-4" style={{ borderColor: `${cc}25` }}>
                                      {/* Leaf label */}
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="text-[13px] font-semibold font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: `${cc}10`, color: cc }}>
                                          {leaf.label}
                                        </span>
                                        <button
                                          onClick={() => addStrategyTier(cat.group, leaf.pathKey)}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium hover:opacity-80 transition-opacity"
                                          style={{ backgroundColor: `${cc}10`, color: cc }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                          {t('offerAddQtyTier')}
                                        </button>
                                      </div>

                                      {tiers.length === 0 ? (
                                        <p className="text-[11px] italic" style={{ color: colors.textTertiary }}>{t('offerNoTiers')}</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {/* Header */}
                                          <div className="grid grid-cols-[80px_80px_1fr_1fr_32px] gap-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                                            <span>≥ {t('offerColQtyMin')}</span>
                                            <span>≤ {t('offerColQtyMax')}</span>
                                            <span>{t('offerColType')}</span>
                                            <span>{t('offerColDiscount')}</span>
                                            <span></span>
                                          </div>
                                          {tiers.map((tier, ti) => {
                                            // Detect overlap with other tiers
                                            const hasOverlap = tiers.some((other, oi) => {
                                              if (oi === ti) return false;
                                              const tMin = tier.qty_min;
                                              const tMax = tier.qty_max ?? Infinity;
                                              const oMin = other.qty_min;
                                              const oMax = other.qty_max ?? Infinity;
                                              return tMin <= oMax && oMin <= tMax;
                                            });
                                            return (
                                            <div key={tier.id ?? `new-${ti}`} className="grid grid-cols-[80px_80px_1fr_1fr_32px] gap-2 items-center">
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: colors.textTertiary }}>≥</span>
                                                <input type="number" min="0" step="1" value={tier.qty_min || ''} placeholder="0"
                                                  onChange={e => updateLocalStrategy(tier.id!, 'qty_min', e.target.value ? Number(e.target.value) : 0)}
                                                  onBlur={() => updateStrategyTier(tier)}
                                                  className="w-full pl-5 pr-2 py-1.5 rounded-lg border text-[12px] text-center outline-none"
                                                  style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              </div>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: colors.textTertiary }}>≤</span>
                                                <input type="number" min="0" step="1" value={tier.qty_max ?? ''} placeholder="∞"
                                                  onChange={e => updateLocalStrategy(tier.id!, 'qty_max', e.target.value ? Number(e.target.value) : null)}
                                                  onBlur={() => updateStrategyTier(tier)}
                                                  className="w-full pl-5 pr-2 py-1.5 rounded-lg border text-[12px] text-center outline-none"
                                                  style={{ backgroundColor: colors.bg, borderColor: hasOverlap ? colors.red : colors.border, color: colors.text }} />
                                              </div>
                                              <select value={tier.discount_type}
                                                onChange={e => { updateLocalStrategy(tier.id!, 'discount_type', e.target.value); setTimeout(() => updateStrategyTier({ ...tier, discount_type: e.target.value as 'AMOUNT' | 'PERCENT' }), 50); }}
                                                className="w-full px-2 py-1.5 rounded-lg border text-[12px] outline-none appearance-none"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                                                <option value="AMOUNT">{t('offerTypeFixed')}</option>
                                                <option value="PERCENT">{t('offerTypePercent')}</option>
                                              </select>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: colors.textTertiary }}>{tier.discount_type === 'AMOUNT' ? '$' : ''}</span>
                                                <input type="number" step="0.01" min="0" value={tier.discount_value}
                                                  onChange={e => updateLocalStrategy(tier.id!, 'discount_value', Number(e.target.value))}
                                                  onBlur={() => updateStrategyTier(tier)}
                                                  className="w-full px-2 py-1.5 rounded-lg border text-[12px] text-right outline-none"
                                                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text, paddingLeft: tier.discount_type === 'AMOUNT' ? '16px' : '8px' }} />
                                                {tier.discount_type === 'PERCENT' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: colors.textTertiary }}>%</span>}
                                              </div>
                                              <button onClick={() => deleteStrategyTier(tier.id!)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: colors.red }}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                              </button>
                                              {hasOverlap && <span className="text-[9px] font-medium col-span-5" style={{ color: colors.red }}>⚠ {t('overlapWarning')}</span>}
                                            </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ═══ Global Default Strategy ═══ */}
                  <div className="mt-6">
                    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.controlAccent }}>
                      <div className="px-6 py-4" style={{ backgroundColor: `${colors.controlAccent}08` }}>
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.controlAccent }} />
                          <span className="text-[16px] font-semibold" style={{ color: colors.text }}>{'Global Default Strategy'}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${colors.controlAccent}12`, color: colors.controlAccent }}>
                            Fallback
                          </span>
                        </div>
                        <p className="text-[11px] mt-1 ml-6" style={{ color: colors.textTertiary }}>
                          {'Applied when no specific category rule matches. Ensures all offers get an auto-reply.'}
                        </p>
                      </div>
                      <div className="px-6 pb-5" style={{ backgroundColor: colors.bgSecondary }}>
                        {(() => {
                          const globalTiers = strategies.filter(s => s.category_group === '*');
                          const gc = colors.controlAccent;
                          return (
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                                  {t('offerLeafStrategies')}
                                </span>
                                <button
                                  onClick={() => addStrategyTier('*', '*')}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium hover:opacity-80 transition-opacity"
                                  style={{ backgroundColor: `${gc}10`, color: gc }}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                  {t('offerAddQtyTier')}
                                </button>
                              </div>
                              {globalTiers.length === 0 ? (
                                <p className="text-[11px] italic" style={{ color: colors.textTertiary }}>{t('offerNoTiers')}</p>
                              ) : (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-[80px_80px_1fr_1fr_32px] gap-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                                    <span>≥ {t('offerColQtyMin')}</span>
                                    <span>≤ {t('offerColQtyMax')}</span>
                                    <span>{t('offerColType')}</span>
                                    <span>{t('offerColDiscount')}</span>
                                    <span></span>
                                  </div>
                                  {globalTiers.map((tier, ti) => (
                                    <div key={tier.id ?? `g-${ti}`} className="grid grid-cols-[80px_80px_1fr_1fr_32px] gap-2 items-center">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: colors.textTertiary }}>≥</span>
                                        <input type="number" min="0" step="1" value={tier.qty_min || ''} placeholder="0"
                                          onChange={e => updateLocalStrategy(tier.id!, 'qty_min', e.target.value ? Number(e.target.value) : 0)}
                                          onBlur={() => updateStrategyTier(tier)}
                                          className="w-full pl-5 pr-2 py-1.5 rounded-lg border text-[12px] text-center outline-none"
                                          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
                                      </div>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: colors.textTertiary }}>≤</span>
                                        <input type="number" min="0" step="1" value={tier.qty_max ?? ''} placeholder="∞"
                                          onChange={e => updateLocalStrategy(tier.id!, 'qty_max', e.target.value ? Number(e.target.value) : null)}
                                          onBlur={() => updateStrategyTier(tier)}
                                          className="w-full pl-5 pr-2 py-1.5 rounded-lg border text-[12px] text-center outline-none"
                                          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
                                      </div>
                                      <select value={tier.discount_type}
                                        onChange={e => { updateLocalStrategy(tier.id!, 'discount_type', e.target.value); setTimeout(() => updateStrategyTier({ ...tier, discount_type: e.target.value as 'AMOUNT' | 'PERCENT' }), 50); }}
                                        className="w-full px-2 py-1.5 rounded-lg border text-[12px] outline-none appearance-none"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                                        <option value="AMOUNT">{t('offerTypeFixed')}</option>
                                        <option value="PERCENT">{t('offerTypePercent')}</option>
                                      </select>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: colors.textTertiary }}>{tier.discount_type === 'AMOUNT' ? '$' : ''}</span>
                                        <input type="number" step="0.01" min="0" value={tier.discount_value}
                                          onChange={e => updateLocalStrategy(tier.id!, 'discount_value', Number(e.target.value))}
                                          onBlur={() => updateStrategyTier(tier)}
                                          className="w-full px-2 py-1.5 rounded-lg border text-[12px] text-right outline-none"
                                          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text, paddingLeft: tier.discount_type === 'AMOUNT' ? '16px' : '8px' }} />
                                        {tier.discount_type === 'PERCENT' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: colors.textTertiary }}>%</span>}
                                      </div>
                                      <button onClick={() => deleteStrategyTier(tier.id!)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: colors.red }}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Full Auto Ops ── */}
              {viewMode === 'autoOps' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border p-8" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[18px] font-bold" style={{ color: colors.text }}>{t('autoOpsTitle')}</h3>
                        <p className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>{t('autoOpsDesc')}</p>
                      </div>
                      <button
                        onClick={toggleAutoOps}
                        disabled={autoOpsLoading}
                        className="relative flex-shrink-0 rounded-full transition-colors"
                        style={{
                          backgroundColor: autoOpsEnabled ? colors.green : colors.gray5,
                          width: '51px', height: '31px',
                          opacity: autoOpsLoading ? 0.5 : 1,
                        }}
                      >
                        <span className="absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-sm transition-all"
                          style={{ left: autoOpsEnabled ? '22px' : '2px' }} />
                      </button>
                    </div>

                    {/* Status badge */}
                    <div className="mt-5 pt-5 border-t" style={{ borderColor: colors.border }}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: autoOpsEnabled ? colors.green : colors.red }} />
                        <span className="text-[14px] font-semibold" style={{ color: autoOpsEnabled ? colors.green : colors.red }}>
                          {autoOpsEnabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>

                      {/* Automated actions list */}
                      <div className="space-y-3">
                        {[
                          { icon: 'R', title: 'Auto-Restock', desc: 'Restock listings 15s after sale webhook', timing: '15s delay' },
                          { icon: 'O', title: 'Auto-Reply Offers', desc: 'Reply to Best Offers 10s after webhook', timing: '10s delay' },
                          { icon: 'P', title: 'Auto-Promote', desc: 'Daily ad rate refresh at 2:30 AM PST', timing: '2:30 AM' },
                        ].map(a => (
                          <div key={a.title} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: autoOpsEnabled ? `${colors.green}08` : 'transparent' }}>
                            <span className="text-[20px]">{a.icon}</span>
                            <div className="flex-1">
                              <p className="text-[13px] font-medium" style={{ color: colors.text }}>{a.title}</p>
                              <p className="text-[11px]" style={{ color: colors.textTertiary }}>{a.desc}</p>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono" style={{
                              backgroundColor: autoOpsEnabled ? `${colors.green}12` : `${colors.gray5}`,
                              color: autoOpsEnabled ? colors.green : colors.textTertiary,
                            }}>{a.timing}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
