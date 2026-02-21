'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { purchaseApi, type ReceiveManagementItem, type ReceiveManagementDetail, type ReceiveDetailItem, type ReceiveDiff } from '@/lib/api';

interface ReceiveDetailPanelProps {
  item: ReceiveManagementItem;
  detail: ReceiveManagementDetail | null;
  isLoading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  IN_TRANSIT:      '#f5a623',
  ALL_RECEIVED:    '#30d158',
  DIFF_UNRESOLVED: '#ff453a',
  DIFF_RESOLVED:   '#8e8e93',
  DELETED:         '#636366',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  normal:  '#30d158',
  deficit: '#ff453a',
  excess:  '#f5a623',
};

// ── Sub-component: SKU Accordion Items ──────────────────────────────────────
// V1 parity: detail.py groups items by DISTINCT po_sku — no poNum column shown.
// Each SKU row is clickable to expand and show per-PO breakdown.

interface ItemsFlatTableProps {
  items: ReceiveDetailItem[];
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}

function ItemsFlatTable({ items, colors, t }: ItemsFlatTableProps) {
  // Sort by po_num then sku — V1 parity: detail.py ORDER BY po_num, po_sku
  const sorted = [...items].sort((a, b) =>
    a.poNum !== b.poNum ? a.poNum.localeCompare(b.poNum) : a.sku.localeCompare(b.sku)
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
      <table className="w-full table-fixed">
        <colgroup>
          <col />
          <col />
          <col style={{ width: '80px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '90px' }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_sku')}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_poNum')}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_sent')}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_received')}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_diff')}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              {t('receives.detail.col_itemStatus')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const diff = row.sentQuantity - row.receiveQuantity;
            const sc = ITEM_STATUS_COLORS[row.itemStatus] ?? colors.text;
            return (
              <tr
                key={`${row.poNum}-${row.sku}-${idx}`}
                style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : undefined }}
              >
                <td className="px-4 py-2.5 text-sm font-mono font-medium" style={{ color: colors.text }}>{row.sku}</td>
                <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.textSecondary }}>{row.poNum}</td>
                <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.textSecondary }}>{row.sentQuantity}</td>
                <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.text }}>{row.receiveQuantity}</td>
                <td className="px-4 py-2.5 text-sm text-right font-semibold" style={{ color: diff === 0 ? colors.textSecondary : '#ff453a' }}>
                  {diff === 0 ? '—' : diff > 0 ? `+${diff}` : `${diff}`}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${sc}18`, color: sc }}>
                    {t(`receives.itemStatus.${row.itemStatus}`)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ── Main Component ──────────────────────────────────────────────────────────

export default function ReceiveDetailPanel({ item, detail, isLoading, onEdit, onDelete, onRestore, onBack }: ReceiveDetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [activeTab, setActiveTab] = useState<'items' | 'diffs' | 'history'>('items');

  const { data: history } = useQuery({
    queryKey: ['receiveHistory', item.logisticNum],
    queryFn: () => purchaseApi.getReceiveHistory(item.logisticNum),
    enabled: activeTab === 'history',
  });

  const statusColor = STATUS_COLORS[item.status] ?? '#8e8e93';

  return (
    <div className="relative">
      {/* Back + actions bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('receives.detail.back')}
        </button>

        <div className="flex items-center gap-2">
          {item.isDeleted ? (
            <button
              onClick={onRestore}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: 'rgba(48,209,88,0.15)', color: '#30d158' }}
            >
              {t('receives.detail.restore')}
            </button>
          ) : (
            <>
              {item.canModify && (
                <button
                  onClick={onEdit}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                >
                  {t('receives.detail.edit')}
                </button>
              )}
              {item.canDelete && (
                <button
                  onClick={onDelete}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                  style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}
                >
                  {t('receives.detail.delete')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Summary card ───────────────────────────────────── */}
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
              {t(`receives.status.${item.status.toLowerCase()}`)}
            </span>
          </div>
        </div>

        {/* Body: field grid */}
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.detail.receiveDate')}</p>
            <p className="text-sm" style={{ color: colors.text }}>{detail?.receiveDate ?? item.receiveDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.detail.etaDate')}</p>
            <p className="text-sm" style={{ color: colors.text }}>{detail?.etaDate ?? '—'}</p>
          </div>
          {detail && (
            <>
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.detail.pallets')}</p>
                <p className="text-sm" style={{ color: colors.text }}>{detail.pallets}</p>
              </div>
              <div className="col-span-1 md:col-span-3">
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.detail.note')}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>{detail.note ?? '—'}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
        {(['items', 'diffs', 'history'] as const).map((tab) => {
          let tabCount: number | null = null;
          if (tab === 'items' && detail?.items) tabCount = detail.items.length;
          if (tab === 'history' && history) tabCount = history.receiveVersions.length + history.diffVersions.length;
          const hasDiffs = tab === 'diffs' && detail?.diffs && detail.diffs.length > 0;
          if (hasDiffs) tabCount = detail.diffs!.filter(d => d.status === 'pending').length;

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
              {t(`receives.detail.tab_${tab}`)}
              {tabCount !== null && tabCount > 0 && (
                <span
                  className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-[-2px] align-middle"
                  style={
                    tab === 'diffs'
                      ? { backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }
                      : {
                          backgroundColor: activeTab === tab ? `${colors.blue}20` : colors.bgTertiary,
                          color: activeTab === tab ? colors.blue : colors.textTertiary,
                        }
                  }
                >
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
        </div>
      ) : (
        <>
          {/* ── Items Tab ── flat table: each row = (SKU, PO#), no grouping ── */}
          {activeTab === 'items' && detail && (
            <ItemsFlatTable items={detail.items} colors={colors} t={t} />
          )}

          {/* ── Diffs Tab ── */}
          {activeTab === 'diffs' && detail && (
            <div>
              {detail.diffs.length === 0 ? (
                <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>{t('receives.detail.noDiffs')}</p>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '100px' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                        {['sku', 'sent', 'received', 'diff', 'diffStatus', 'note'].map(col => (
                          <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                            {t(`receives.detail.col_${col}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.diffs.map((d: ReceiveDiff, idx: number) => (
                        <tr key={d.id} style={{ borderBottom: idx < detail.diffs.length - 1 ? `1px solid ${colors.border}` : undefined }}>
                          <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.text }}>{d.sku}</td>
                          <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.text }}>{d.sentQuantity}</td>
                          <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.text }}>{d.receiveQuantity}</td>
                          <td className="px-4 py-2.5 text-sm text-right font-bold" style={{ color: '#ff453a' }}>{d.diffQuantity}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: d.status === 'pending' ? 'rgba(255,69,58,0.12)' : 'rgba(99,99,102,0.12)',
                                color: d.status === 'pending' ? '#ff453a' : '#8e8e93',
                              }}
                            >
                              {t(`receives.diffStatus.${d.status}`)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{d.resolutionNote ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── History Tab ── V1 parity: receive_history.html — 双栏布局 ── */}
          {activeTab === 'history' && (
            <div>
              {!history ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
                </div>
              ) : (
                /* V1 双栏: 左栏「入库修订记录」+ 右栏「差异修订记录」*/
                <div className="grid grid-cols-2 gap-4">

                  {/* ── 左栏：入库版本记录 ── */}
                  <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    {/* 左栏 Panel Header */}
                    <div
                      className="flex items-center gap-2 px-4 py-3 shrink-0"
                      style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-xs font-semibold" style={{ color: colors.text }}>
                        {t('receives.detail.historyReceive')}
                      </span>
                      <span
                        className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
                      >
                        {history.receiveVersions.length}
                      </span>
                    </div>

                    {/* 左栏 Body */}
                    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                      {history.receiveVersions.length === 0 ? (
                        <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
                          {t('receives.detail.noHistory')}
                        </p>
                      ) : (
                        history.receiveVersions.map((v, idx) => {
                          const vItems = v.items ?? [];
                          const vChanges = v.changes ?? [];
                          const changedKeys = new Set(vChanges.map(ch => `${ch.poNum}|${ch.sku}`));
                          return (
                            <div
                              key={idx}
                              className="rounded-xl p-4"
                              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                            >
                              {/* Version card header */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                                    style={{
                                      backgroundColor: v.isInitial ? `${colors.blue}20` : colors.bgTertiary,
                                      color: v.isInitial ? colors.blue : colors.textSecondary,
                                    }}
                                  >
                                    {v.seq ?? 'V01'}
                                  </span>
                                  <span className="text-sm font-medium" style={{ color: colors.text }}>
                                    {v.versionDate}
                                  </span>
                                  {!v.isActive && (
                                    <span
                                      className="px-2 py-0.5 rounded text-xs"
                                      style={{ backgroundColor: 'rgba(99,99,102,0.12)', color: '#8e8e93' }}
                                    >
                                      {t('receives.detail.historyCancelled')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{v.updatedBy}</p>
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                                    {v.updatedAt ? v.updatedAt.substring(0, 10) : '—'}
                                  </p>
                                </div>
                              </div>

                              {v.note && (
                                <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{v.note}</p>
                              )}

                              {/* Initial version: full item snapshot */}
                              {vItems.length > 0 ? (
                                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                  <div
                                    className="grid grid-cols-4 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                                    style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}
                                  >
                                    <span>PO #</span>
                                    <span>SKU</span>
                                    <span className="text-right">已发</span>
                                    <span className="text-right">已收</span>
                                  </div>
                                  {vItems.map((item, i) => {
                                    const isChanged = changedKeys.has(`${item.poNum}|${item.sku}`);
                                    const isDiff = item.sentQuantity !== item.receiveQuantity;
                                    return (
                                      <div
                                        key={i}
                                        className="grid grid-cols-4 px-4 py-2 text-xs"
                                        style={{
                                          borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                                          backgroundColor: isChanged ? 'rgba(255,149,0,0.06)' : 'transparent',
                                        }}
                                      >
                                        <span className="font-mono truncate" style={{ color: colors.textSecondary }}>{item.poNum}</span>
                                        <span className="font-mono font-medium" style={{ color: isChanged ? '#f5a623' : colors.text }}>{item.sku}</span>
                                        <span className="text-right" style={{ color: colors.textSecondary }}>{item.sentQuantity}</span>
                                        <span className="text-right font-semibold" style={{ color: isChanged ? '#f5a623' : isDiff ? '#ff453a' : '#30d158' }}>
                                          {item.receiveQuantity}{isChanged && ' ✎'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : vChanges.length > 0 ? (
                                /* Adjustment version: field-level changes */
                                <div className="space-y-2">
                                  {vChanges.map((ch, ci) => (
                                    <div
                                      key={ci}
                                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                      style={{ backgroundColor: colors.bgTertiary }}
                                    >
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                                        style={{ backgroundColor: 'rgba(245,166,35,0.15)', color: '#f5a623' }}
                                      >
                                        调整
                                      </span>
                                      <span className="font-mono font-medium" style={{ color: colors.text }}>{ch.sku}</span>
                                      <span className="font-mono line-through" style={{ color: '#ff453a' }}>{ch.fields[0]?.old ?? '—'}</span>
                                      <span style={{ color: colors.textTertiary }}>→</span>
                                      <span className="font-mono font-semibold" style={{ color: '#30d158' }}>{ch.fields[0]?.new ?? '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs italic" style={{ color: colors.textTertiary }}>
                                  {t('receives.detail.historyNoChanges')}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* ── 右栏：差异修订历史 ── */}
                  <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    {/* 右栏 Panel Header */}
                    <div
                      className="flex items-center gap-2 px-4 py-3 shrink-0"
                      style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#f5a623' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-xs font-semibold" style={{ color: colors.text }}>
                        {t('receives.detail.historyDiff')}
                      </span>
                      <span
                        className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(245,166,35,0.15)', color: '#f5a623' }}
                      >
                        {(history.diffVersions ?? []).length}
                      </span>
                    </div>

                    {/* 右栏 Body */}
                    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                      {(history.diffVersions ?? []).length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-sm font-medium mb-1" style={{ color: '#30d158' }}>全部正常入库</p>
                          <p className="text-xs" style={{ color: colors.textTertiary }}>没有差异修订记录</p>
                        </div>
                      ) : (
                        (history.diffVersions ?? []).map((dv, idx) => {
                          const dvItems = dv.items ?? [];
                          const dvChanges = dv.changes ?? [];
                          const dvChangedKeys = new Set(dvChanges.map(ch => `${ch.poNum}|${ch.sku}`));
                          return (
                            <div
                              key={idx}
                              className="rounded-xl p-4"
                              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                            >
                              {/* Diff version card header */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                                    style={{
                                      backgroundColor: dv.isInitial ? 'rgba(255,69,58,0.12)' : 'rgba(245,166,35,0.12)',
                                      color: dv.isInitial ? '#ff453a' : '#f5a623',
                                    }}
                                  >
                                    {dv.seq ?? 'D01'}
                                  </span>
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                      backgroundColor: dv.isInitial ? 'rgba(255,69,58,0.10)' : colors.bgTertiary,
                                      color: dv.isInitial ? '#ff453a' : colors.textSecondary,
                                    }}
                                  >
                                    {dv.isInitial ? '初始差异' : '差异调整'}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{dv.updatedBy}</p>
                                  <p className="text-xs" style={{ color: colors.textTertiary }}>{dv.receiveDate}</p>
                                </div>
                              </div>

                              {dv.note && (
                                <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{dv.note}</p>
                              )}

                              {dvItems.length > 0 && (
                                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                  <div
                                    className="grid grid-cols-4 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                                    style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}
                                  >
                                    <span>SKU</span>
                                    <span className="text-right">已发</span>
                                    <span className="text-right">已收</span>
                                    <span className="text-right">差异</span>
                                  </div>
                                  {dvItems.map((item, i) => {
                                    const isChanged = dvChangedKeys.has(`${item.poNum}|${item.sku}`);
                                    return (
                                      <div
                                        key={i}
                                        className="grid grid-cols-4 px-4 py-2 text-xs"
                                        style={{
                                          borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                                          backgroundColor: isChanged ? 'rgba(255,69,58,0.05)' : 'transparent',
                                        }}
                                      >
                                        <span className="font-mono font-medium" style={{ color: isChanged ? '#ff453a' : colors.text }}>{item.sku}</span>
                                        <span className="text-right" style={{ color: colors.textSecondary }}>{item.sentQuantity}</span>
                                        <span className="text-right" style={{ color: colors.textSecondary }}>{item.receiveQuantity}</span>
                                        <span className="text-right font-semibold" style={{ color: '#ff453a' }}>{item.diffQuantity}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Footer meta ── */}
      {!isLoading && detail && (
        <div
          className="mt-6 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
          style={{ borderTop: `1px solid ${colors.border}`, color: colors.textTertiary }}
        >
          {detail.createdBy && detail.createdBy !== '-' && (
            <span>{t('receives.detail.createdBy')}: {detail.createdBy}</span>
          )}
          <span>{t('receives.detail.receiveDate')}: {detail.receiveDate}</span>
          {detail.updatedBy && detail.updatedBy !== detail.createdBy && detail.updatedBy !== '-' && (
            <span>更新人: {detail.updatedBy}</span>
          )}
          {item.updateDate && item.updateDate !== '-' && (
            <span>更新时间: {new Date(item.updateDate).toLocaleString()}</span>
          )}
        </div>
      )}
    </div>
  );
}

