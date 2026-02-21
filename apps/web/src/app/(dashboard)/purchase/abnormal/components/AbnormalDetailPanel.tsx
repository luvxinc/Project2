'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type {
  AbnormalListItem,
  AbnormalDetail,
  AbnormalHistoryItem,
} from '@/lib/api';

// ─── Props ─────────────────────────────────────────────────────

interface AbnormalDetailPanelProps {
  item: AbnormalListItem;
  detail: AbnormalDetail | null;
  historyItems: AbnormalHistoryItem[];
  isLoading: boolean;
  onBack: () => void;
  onProcess: () => void;
  onDelete: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────

function getStatusColor(status: string, colors: typeof themeColors[keyof typeof themeColors]) {
  switch (status) {
    case 'pending':  return colors.orange;
    case 'resolved': return colors.green;
    case 'deleted':  return colors.gray2;
    default:         return colors.gray;
  }
}

// ─── Main Component ────────────────────────────────────────────

export default function AbnormalDetailPanel({
  item, detail, historyItems, isLoading, onBack, onProcess, onDelete,
}: AbnormalDetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');

  const statusColor = getStatusColor(item.status, colors);

  return (
    <div className="relative">
      {/* ── Back bar + action buttons (aligned with ReceiveDetailPanel) ───── */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('abnormal.detail.back')}
        </button>

        <div className="flex items-center gap-2">
          {/* pending → Process button */}
          {item.status === 'pending' && (
            <button
              onClick={onProcess}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: `${colors.orange}18`, color: colors.orange }}
            >
              {t('abnormal.processAbnormal')}
            </button>
          )}
          {/* resolved → Delete button */}
          {item.status === 'resolved' && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: `${colors.red}18`, color: colors.red }}
            >
              {t('abnormal.deleteRecord')}
            </button>
          )}
        </div>
      </div>

      {/* ── Summary card ─────────────────────────────────── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: LogisticNum + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {item.logisticNum}
            </p>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: `${statusColor}12`,
                color: statusColor,
                boxShadow: `0 0 0 1px ${statusColor}40`,
              }}
            >
              {t(`abnormal.status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}` as 'abnormal.statusPending')}
            </span>
          </div>
        </div>

        {/* Body: field grid */}
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('abnormal.receiveDate')}</p>
            <p className="text-sm" style={{ color: colors.text }}>{item.receiveDate || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('abnormal.skuCount')}</p>
            <p className="text-sm font-mono" style={{ color: colors.text }}>{item.skuCount}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('abnormal.totalDiff')}</p>
            <p className="text-sm font-mono font-bold" style={{ color: item.totalDiff !== 0 ? colors.red : colors.textSecondary }}>
              {item.totalDiff > 0 ? `+${item.totalDiff}` : item.totalDiff}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('abnormal.note')}</p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>{item.note || '—'}</p>
          </div>
        </div>
      </div>

      {/* ── Tabs (aligned with ReceiveDetailPanel) ─────── */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
        {(['detail', 'history'] as const).map((tab) => {
          let tabCount: number | null = null;
          if (tab === 'detail' && detail?.items) tabCount = detail.items.length;
          if (tab === 'history') tabCount = historyItems.length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                color: activeTab === tab ? colors.blue : colors.textTertiary,
                borderBottom: activeTab === tab ? `2px solid ${colors.blue}` : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab === 'detail' ? t('abnormal.detail.title') : t('abnormal.history.title')}
              {tabCount !== null && tabCount > 0 && (
                <span
                  className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-[-2px] align-middle"
                  style={{
                    backgroundColor: activeTab === tab ? `${colors.blue}20` : colors.bgTertiary,
                    color: activeTab === tab ? colors.blue : colors.textTertiary,
                  }}
                >
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ─────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
        </div>
      ) : activeTab === 'detail' ? (
        <DetailTab detail={detail} colors={colors} t={t} />
      ) : (
        <HistoryTab historyItems={historyItems} colors={colors} t={t} />
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
// Detail Tab — per-PO grouped tables
// ═════════════════════════════════════════════════════════════════

function DetailTab({ detail, colors, t }: {
  detail: AbnormalDetail | null;
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}) {
  if (!detail || detail.items.length === 0) {
    return <p style={{ color: colors.textTertiary }} className="text-sm text-center py-8">{t('abnormal.noRecords')}</p>;
  }

  // Group by PO
  const grouped: Record<string, typeof detail.items> = {};
  for (const item of detail.items) {
    if (!grouped[item.poNum]) grouped[item.poNum] = [];
    grouped[item.poNum].push(item);
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('abnormal.skuCount'), value: detail.summary.totalSkus, color: colors.blue },
          { label: t('abnormal.totalDiff'), value: detail.summary.totalDiff, color: detail.summary.totalDiff === 0 ? colors.green : colors.red },
          { label: t('abnormal.detail.overReceived'), value: `+${detail.summary.overReceived}`, color: colors.green },
          { label: t('abnormal.detail.underReceived'), value: `-${detail.summary.underReceived}`, color: colors.red },
        ].map((card, i) => (
          <div key={i} className="rounded-lg p-4" style={{ backgroundColor: colors.bgTertiary }}>
            <p style={{ color: colors.textTertiary }} className="text-xs uppercase tracking-wide mb-1">{card.label}</p>
            <p style={{ color: typeof card.color === 'string' ? card.color : colors.text }} className="text-xl font-bold font-mono">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-PO Tables */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([poNum, poItems]) => {
        const currency = poItems[0]?.currency || 'RMB';
        return (
          <div key={poNum} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2">
                <span style={{ color: colors.text }} className="text-sm font-mono font-bold">{poNum}</span>
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                  backgroundColor: `${currency === 'USD' ? colors.green : colors.orange}18`,
                  color: currency === 'USD' ? colors.green : colors.orange,
                }}>
                  {currency}
                </span>
              </div>
              <span style={{ color: colors.textTertiary }} className="text-xs">{poItems.length} SKU(s)</span>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {['sku', 'unitPrice', 'orderedQty', 'sentQty', 'receivedQty', 'diffQty'].map((col) => (
                    <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                      {t(`abnormal.detail.${col}` as 'abnormal.detail.sku')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poItems.map((it) => {
                  const diff = it.diffQuantity;
                  const dColor = diff > 0 ? colors.red : diff < 0 ? colors.green : colors.textTertiary;
                  const dPrefix = diff > 0 ? '+' : '';
                  return (
                    <tr key={it.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td className="px-4 py-2.5"><span style={{ color: colors.text }} className="text-sm font-mono">{it.sku}</span></td>
                      <td className="px-4 py-2.5"><span style={{ color: colors.textSecondary }} className="text-sm">{(it.unitPrice ?? 0).toFixed(2)}</span></td>
                      <td className="px-4 py-2.5"><span style={{ color: colors.textTertiary }} className="text-sm">{it.poQuantity}</span></td>
                      <td className="px-4 py-2.5"><span style={{ color: colors.blue }} className="text-sm">{it.sentQuantity}</span></td>
                      <td className="px-4 py-2.5"><span style={{ color: colors.green }} className="text-sm">{it.receiveQuantity}</span></td>
                      <td className="px-4 py-2.5"><span style={{ color: dColor }} className="text-sm font-bold">{dPrefix}{diff}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
// History Tab — 4-panel strategy grid (Apple minimal, no timeline)
// Aligned with ShipmentDetailPanel history layout
// ═════════════════════════════════════════════════════════════════

type ThemeColorKey = 'green' | 'blue' | 'yellow' | 'purple';

const STRATEGY_PANELS: readonly { key: string; eventTypes: readonly string[]; colorKey: ThemeColorKey }[] = [
  { key: 'M1', eventTypes: ['PROCESS_M1'], colorKey: 'green'  },
  { key: 'M2', eventTypes: ['PROCESS_M2'], colorKey: 'blue'   },
  { key: 'M3', eventTypes: ['PROCESS_M3'], colorKey: 'yellow' },
  { key: 'M4', eventTypes: ['PROCESS_M4'], colorKey: 'purple' },
];

interface ChangesSnapshot {
  status?: string;
  diffQuantity?: number;
  sentQuantity?: number;
  receiveQuantity?: number;
  poQuantity?: number;
  resolutionNote?: string | null;
}

function parseChanges(raw: string): { before: ChangesSnapshot; after: ChangesSnapshot } | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { before: parsed.before || {}, after: parsed.after || {} };
  } catch {
    return null;
  }
}

function HistoryTab({ historyItems, colors, t }: {
  historyItems: AbnormalHistoryItem[];
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}) {
  // Group events by strategy panel — always show all 4
  const grouped: Record<string, AbnormalHistoryItem[]> = {};
  for (const panel of STRATEGY_PANELS) grouped[panel.key] = [];
  for (const item of historyItems) {
    const panel = STRATEGY_PANELS.find(p => p.eventTypes.includes(item.eventType as never));
    if (panel) grouped[panel.key].push(item);
  }

  const FIELD_LABELS: Record<string, string> = {
    status: t('abnormal.detail.status'),
    diffQuantity: t('abnormal.detail.diffQty'),
    sentQuantity: t('abnormal.detail.sentQty'),
    receiveQuantity: t('abnormal.detail.receivedQty'),
    poQuantity: t('abnormal.detail.orderedQty'),
    resolutionNote: t('abnormal.note'),
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {STRATEGY_PANELS.map(panel => {
        const events = grouped[panel.key];
        const panelColor = colors[panel.colorKey];
        return (
          <div
            key={panel.key}
            className="flex flex-col rounded-xl overflow-hidden"
            style={{ border: `1px solid ${colors.border}` }}
          >
            {/* Panel Header */}
            <div
              className="flex items-center gap-2 px-4 py-3 shrink-0"
              style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
            >

              <span className="text-xs font-semibold" style={{ color: colors.text }}>
                {t(`abnormal.history.panel${panel.key}` as 'abnormal.history.panelM1')}
              </span>
              <span
                className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${panelColor}20`, color: panelColor }}
              >
                {events.length}
              </span>
            </div>

            {/* Panel Body */}
            <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: '480px', backgroundColor: colors.bg }}>
              {events.length === 0 ? (
                <p className="py-6 text-center text-xs" style={{ color: colors.textTertiary }}>
                  {t('abnormal.history.noRecords')}
                </p>
              ) : events.map((ev, idx) => {
                const changes = parseChanges(ev.changes);
                return (
                  <div
                    key={ev.id}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: `${panelColor}15`, color: panelColor }}
                      >
                        {panel.key[1]}{String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="text-right">
                        <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                        <p className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                          {ev.createdAt.substring(0, 19).replace('T', ' ')}
                        </p>
                      </div>
                    </div>

                    {/* Note */}
                    {ev.note && (
                      <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{ev.note}</p>
                    )}

                    {/* Field-level changes — before → after */}
                    {changes && (() => {
                      const fields: { field: string; before: unknown; after: unknown }[] = [];
                      for (const [field] of Object.entries(FIELD_LABELS)) {
                        const bVal = (changes.before as Record<string, unknown>)[field];
                        const aVal = (changes.after as Record<string, unknown>)[field];
                        if (bVal !== undefined || aVal !== undefined) {
                          fields.push({ field, before: bVal, after: aVal });
                        }
                      }
                      if (fields.length === 0) return null;
                      return (
                        <div className="space-y-1.5">
                          {fields.map((ch, i) => {
                            const changed = String(ch.before ?? '—') !== String(ch.after ?? '—');
                            return (
                              <div
                                key={i}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                style={{ backgroundColor: colors.bgTertiary }}
                              >
                                <span className="w-16 shrink-0 font-medium" style={{ color: colors.textTertiary }}>
                                  {FIELD_LABELS[ch.field] ?? ch.field}
                                </span>
                                <span className="font-mono" style={{ color: colors.red, textDecoration: changed ? 'line-through' : 'none' }}>
                                  {String(ch.before ?? '—')}
                                </span>
                                {changed && (
                                  <>
                                    <span style={{ color: colors.textTertiary }}>→</span>
                                    <span className="font-mono font-semibold" style={{ color: colors.green }}>
                                      {String(ch.after ?? '—')}
                                    </span>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
