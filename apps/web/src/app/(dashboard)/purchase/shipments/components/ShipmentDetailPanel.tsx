'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { Shipment, ShipmentEvent } from '@/lib/api';
import { shipmentStatusStyle } from '@/lib/status-colors';

interface ShipmentDetailPanelProps {
  shipment: Shipment;
  detail: Shipment | null;
  isLoading: boolean;
  history: ShipmentEvent[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onExport: (type: 'mgmt' | 'warehouse') => void;
}



export default function ShipmentDetailPanel({
  shipment,
  detail,
  isLoading,
  history,
  onBack,
  onEdit,
  onDelete,
  onRestore,
  onExport,
}: ShipmentDetailPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');

  const isDeleted = shipment.isDeleted === true;
  const rs = isDeleted ? 'deleted' : (shipment.receiveStatus ?? 'IN_TRANSIT');
  const statusStyle = shipmentStatusStyle(rs, colors);

  // V1 business rule: edit/delete only allowed when shipment is IN_TRANSIT
  // (goods not yet received). Once received (ALL_RECEIVED / DIFF_*), logistics are locked.
  const canModify = !isDeleted && rs === 'IN_TRANSIT';

  const items = detail?.items ?? [];
  const exchangeRate = detail?.exchangeRate ?? shipment.exchangeRate ?? 1;
  const totalUSD = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalRMB = totalUSD * exchangeRate;

  return (
    <div className="relative">
      {/* ── Back + Actions bar ─────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('shipments.detail.back')}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            onClick={() => onExport('mgmt')}
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 flex items-center gap-1.5"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('shipments.detail.exportMgmt')}
          </button>
          <button
            onClick={() => onExport('warehouse')}
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 flex items-center gap-1.5"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('shipments.detail.exportWarehouse')}
          </button>

          {/* Edit / Delete / Restore */}
          {isDeleted ? (
            <button
              onClick={onRestore}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
            >
              {t('shipments.detail.restore')}
            </button>
          ) : canModify ? (
            // V1 rule: only IN_TRANSIT shipments can be edited/deleted
            <>
              <button
                onClick={onEdit}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {t('shipments.detail.edit')}
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: `${colors.red}15`, color: colors.red }}
              >
                {t('shipments.detail.delete')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Summary card ───────────────────────────────────── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: logisticNum + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {shipment.logisticNum}
            </p>
            <span
              className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
                boxShadow: `0 0 0 1px ${statusStyle.ring}`,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  rs === 'IN_TRANSIT' ? 'animate-pulse' : ''
                }`}
                style={{ backgroundColor: statusStyle.dot }}
              />
              {isDeleted
                ? t('shipments.status.deleted')
                : t(`shipments.receiveStatus.${rs}`)}
            </span>
          </div>
          {/* Total value quick glance */}
          {!isLoading && (
            <div className="text-right">
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('shipments.detail.totalUSD')}</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {exchangeRate > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                    ≈ ¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Body: field grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Sent Date */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.sentDate')}
              </p>
              <p className="text-sm" style={{ color: colors.text }}>
                {detail?.sentDate ?? shipment.sentDate}
              </p>
            </div>
            {/* ETA */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.etaDate')}
              </p>
              <p className="text-sm" style={{ color: colors.text }}>
                {(detail?.etaDate ?? shipment.etaDate) || '—'}
              </p>
            </div>
            {/* Pallets */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.pallets')}
              </p>
              <p className="text-sm" style={{ color: colors.text }}>{detail?.pallets ?? '—'}</p>
            </div>
            {/* Weight */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.edit.totalWeight')}
              </p>
              <p className="text-sm font-mono" style={{ color: colors.text }}>
                {((detail?.totalWeight ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg
              </p>
            </div>
            {/* Logistics Cost */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.logisticsCost')}
              </p>
              <p className="text-sm font-mono" style={{ color: colors.text }}>
                ¥{((detail?.logisticsCost ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            {/* Exchange Rate */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.exchangeRate')}
              </p>
              <p className="text-sm font-mono" style={{ color: colors.text }}>
                {exchangeRate}
                <span className="ml-2 text-xs" style={{ color: colors.textSecondary }}>
                  ({(detail?.rateMode ?? shipment.rateMode) === 'A' ? t('orders.detail.rateAuto') : t('orders.detail.rateManual')})
                </span>
              </p>
            </div>
            {/* Note */}
            <div className="col-span-2">
              <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
                {t('shipments.detail.note')}
              </p>
              <p className="text-sm" style={{ color: colors.textSecondary }}>{detail?.note || '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      {(() => {
        const tabs = [
          { id: 'items' as const, label: t('shipments.detail.tab_items'), count: items.length },
          { id: 'history' as const, label: t('shipments.detail.tab_history'), count: history.length },
        ];
        return (
          <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                  borderBottom: activeTab === tab.id ? `2px solid ${colors.blue}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: activeTab === tab.id ? `${colors.blue}20` : colors.bgTertiary,
                      color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Loading (tab content only — summary card has its own spinner) ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
        </div>
      )}

      {/* ── Items Tab ─────────────────────────────────────── */}
      {!isLoading && activeTab === 'items' && (
        <>
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('shipments.detail.noItems')}
            </p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                    {['poNum', 'sku', 'qty', 'unitPrice', 'poChange', 'amount'].map((col) => (
                      <th
                        key={col}
                        className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${
                          ['qty', 'unitPrice', 'amount'].includes(col) ? 'text-right' :
                          col === 'poChange' ? 'text-center' : 'text-left'
                        }`}
                        style={{ color: colors.textTertiary }}
                      >
                        {t(`shipments.detail.${col}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const amount = item.quantity * item.unitPrice;
                    return (
                      <tr key={item.id} style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : undefined }}>
                        <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.blue }}>{item.poNum}</td>
                        <td className="px-4 py-2.5 text-sm font-mono font-medium" style={{ color: colors.text }}>{item.sku}</td>
                        <td className="px-4 py-2.5 text-sm font-mono text-right" style={{ color: colors.textSecondary }}>{item.quantity.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-sm font-mono text-right" style={{ color: colors.textSecondary }}>${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-2.5 text-center">
                          {item.poChange && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>
                              {t('shipments.detail.yes')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bgSecondary }}>
                    <td colSpan={5} className="px-4 py-2.5 text-sm font-medium text-right" style={{ color: colors.textSecondary }}>
                      {t('shipments.detail.totalUSD')}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-mono text-right font-semibold" style={{ color: colors.text }}>
                      ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  {exchangeRate > 0 && (
                    <tr style={{ backgroundColor: colors.bgSecondary }}>
                      <td colSpan={5} className="px-4 py-1.5 text-xs text-right" style={{ color: colors.textTertiary }}>
                        {t('shipments.detail.totalRMB')}
                      </td>
                      <td className="px-4 py-1.5 text-xs font-mono text-right" style={{ color: colors.textTertiary }}>
                        ¥{totalRMB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── History Tab ── V1 parity: send_history.html — 双栏布局 ── */}
      {!isLoading && activeTab === 'history' && (() => {
        // V1 双栏分流: 左栏 = 物流单信息变更, 右栏 = 货物明细变更
        // eventType: CREATE / UPDATE_LOGISTICS / DELETE / RESTORE → 左栏
        // eventType: CREATE / UPDATE_ITEMS / DELETE / RESTORE     → 右栏
        const logisticsEvents = history.filter(ev =>
          ['CREATE', 'UPDATE_LOGISTICS', 'DELETE', 'RESTORE'].includes(ev.eventType)
        );
        const itemEvents = history.filter(ev =>
          ['CREATE', 'UPDATE_ITEMS', 'DELETE', 'RESTORE'].includes(ev.eventType)
        );

        // Human-readable field labels (V1 parity: history.py field_labels)
        const FIELD_LABELS: Record<string, string> = {
          etaDate: t('shipments.history.fieldLabels.etaDate'),
          pallets: t('shipments.history.fieldLabels.pallets'),
          totalWeight: t('shipments.history.fieldLabels.totalWeight'),
          priceKg: t('shipments.history.fieldLabels.priceKg'),
          logisticsCost: t('shipments.history.fieldLabels.logisticsCost'),
          exchangeRate: t('shipments.history.fieldLabels.exchangeRate'),
          note: t('shipments.history.fieldLabels.note'),
          sentDate: t('shipments.history.fieldLabels.sentDate'),
        };

        const parseChanges = (changesJson: string) => {
          try {
            const raw = JSON.parse(changesJson) as Record<string, { before: unknown; after: unknown }>;
            return Object.entries(raw).map(([field, vals]) => ({ field, before: vals.before, after: vals.after }));
          } catch { return []; }
        };

        const parseItemChanges = (changesJson: string): {
          added: { poNum: string; sku: string; qty: number; unitPrice: number }[];
          removed: { poNum: string; sku: string }[];
          adjusted: { poNum: string; sku: string; field: string; before: unknown; after: unknown }[];
        } => {
          try {
            const raw = JSON.parse(changesJson) as {
              added?: { poNum: string; sku: string; qty: number; unitPrice: number }[];
              removed?: { poNum: string; sku: string }[];
              adjusted?: { poNum: string; sku: string; field: string; before: unknown; after: unknown }[];
            };
            return {
              added: raw.added ?? [],
              removed: raw.removed ?? [],
              adjusted: raw.adjusted ?? [],
            };
          } catch {
            return { added: [], removed: [], adjusted: [] };
          }
        };

        if (history.length === 0) {
          return (
            <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
              {t('shipments.detail.noHistory')}
            </p>
          );
        }

        return (
          <div className="grid grid-cols-3 gap-4">

            {/* ── 左栏：物流单信息修订 ── */}
            <div className="col-span-1 flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              {/* 左栏 Panel Header */}
              <div
                className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0V9l3 3-3 4" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: colors.text }}>
                  {t('shipments.history.panelLogistics')}
                </span>
                <span
                  className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
                >
                  {logisticsEvents.length}
                </span>
              </div>

              {/* 左栏 Body */}
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                {logisticsEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
                    {t('shipments.detail.noHistory')}
                  </p>
                ) : (
                  logisticsEvents.map((ev, idx) => {
                    const isCreate = ev.eventType === 'CREATE';
                    const isDelete = ev.eventType === 'DELETE';
                    const isRestore = ev.eventType === 'RESTORE';
                    const parsedChanges = parseChanges(ev.changes);
                    const accentColor = isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue;

                    return (
                      <div
                        key={ev.id}
                        className="rounded-xl p-4"
                        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                      >
                        {/* Card header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: `${accentColor}15`,
                                color: accentColor,
                              }}
                            >
                              S{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isCreate || isDelete || isRestore ? `${accentColor}12` : colors.bgTertiary,
                                color: isCreate || isDelete || isRestore ? accentColor : colors.textSecondary,
                              }}
                            >
                              {isCreate ? t('shipments.history.typeCreate') :
                               isDelete ? t('shipments.history.typeDelete') :
                               isRestore ? t('shipments.history.typeRestore') :
                               t('shipments.history.typeUpdate')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                            <p className="text-xs" style={{ color: colors.textTertiary }}>
                              {new Date(ev.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {ev.note && (
                          <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{ev.note}</p>
                        )}

                        {/* Field-level changes */}
                        {parsedChanges.length > 0 ? (
                          <div className="space-y-1.5">
                            {parsedChanges.map((ch, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                style={{ backgroundColor: colors.bgTertiary }}
                              >
                                <span className="w-20 shrink-0 font-medium" style={{ color: colors.textTertiary }}>
                                  {FIELD_LABELS[ch.field] ?? ch.field}
                                </span>
                                <span className="font-mono line-through" style={{ color: colors.red }}>
                                  {String(ch.before ?? '—')}
                                </span>
                                <span style={{ color: colors.textTertiary }}>→</span>
                                <span className="font-mono font-semibold" style={{ color: colors.green }}>
                                  {String(ch.after ?? '—')}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : isCreate ? (
                          <div className="space-y-1.5">
                            {(() => {
                              const FALLBACK_FIELD_LABELS: Record<string, string> = {
                                logisticNum: t('shipments.history.fieldLabels.logisticNum'),
                                sentDate: t('shipments.history.fieldLabels.sentDate'),
                                etaDate: t('shipments.history.fieldLabels.etaDate'),
                                pallets: t('shipments.history.fieldLabels.pallets'),
                                logisticsCost: t('shipments.history.fieldLabels.logisticsCost'),
                                exchangeRate: t('shipments.history.fieldLabels.exchangeRate'),
                                rateMode: t('shipments.history.fieldLabels.rateMode'),
                                totalWeight: t('shipments.history.fieldLabels.totalWeight'),
                              };
                              // Try to use changes JSON first (V3-native CREATE events)
                              let snapshotData: Record<string, unknown> = {};
                              try {
                                const raw = JSON.parse(ev.changes) as Record<string, unknown>;
                                const fields = Object.keys(FALLBACK_FIELD_LABELS);
                                const hasData = fields.some(f => raw[f] !== undefined);
                                if (hasData) snapshotData = raw;
                              } catch { /* empty */ }

                              // Fallback to detail/shipment model (ETL-migrated: changes = "{}")
                              if (Object.keys(snapshotData).length === 0 && (detail || shipment)) {
                                const src = detail ?? shipment;
                                snapshotData = {
                                  logisticNum: src.logisticNum,
                                  sentDate: src.sentDate,
                                  etaDate: (src as typeof detail)?.etaDate ?? null,
                                  pallets: (src as typeof detail)?.pallets ?? 0,
                                  totalWeight: (src as typeof detail)?.totalWeight ?? 0,
                                  logisticsCost: (src as typeof detail)?.logisticsCost ?? 0,
                                  exchangeRate: (src as typeof detail)?.exchangeRate ?? exchangeRate,
                                  rateMode: (src as typeof detail)?.rateMode ?? 'M',
                                };
                              }

                              const fields = Object.keys(FALLBACK_FIELD_LABELS);
                              return fields.map(f => {
                                const val = snapshotData[f];
                                if (val === undefined || val === null || val === '') return null;
                                let display = String(val);
                                if (f === 'rateMode') display = val === 'A' ? t('shipments.history.rateModeAuto') : t('shipments.history.rateModeManual');
                                if (f === 'logisticsCost') display = `¥${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                if (f === 'totalWeight') display = `${Number(val).toLocaleString()} kg`;
                                return (
                                  <div
                                    key={f}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                    style={{ backgroundColor: colors.bgTertiary }}
                                  >
                                    <span className="w-24 shrink-0 font-medium" style={{ color: colors.textTertiary }}>{FALLBACK_FIELD_LABELS[f]}</span>
                                    <span className="font-mono font-semibold" style={{ color: colors.textSecondary }}>{display}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : isDelete ? (
                          <p className="text-xs italic" style={{ color: colors.red }}>{t('shipments.history.deleted')}</p>
                        ) : isRestore ? (
                          <p className="text-xs italic" style={{ color: colors.green }}>{t('shipments.history.restored')}</p>
                        ) : isCreate ? null : (
                          <p className="text-xs italic" style={{ color: colors.textTertiary }}>
                            {t('shipments.history.noChanges')}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── 右栏：货物修订记录 ── */}
            <div className="col-span-2 flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              {/* 右栏 Panel Header */}
              <div
                className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.green }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: colors.text }}>
                  {t('shipments.history.panelItems')}
                </span>
                <span
                  className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
                >
                  {itemEvents.length}
                </span>
              </div>

              {/* 右栏 Body */}
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '520px', backgroundColor: colors.bg }}>
                {itemEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: colors.textTertiary }}>
                    {t('shipments.detail.noHistory')}
                  </p>
                ) : (
                  itemEvents.map((ev, idx) => {
                    const isCreate = ev.eventType === 'CREATE';
                    const isDelete = ev.eventType === 'DELETE';
                    const isRestore = ev.eventType === 'RESTORE';
                    const itemChanges = parseItemChanges(ev.changes);
                    // For CREATE, also show items snapshot from detail
                    const snapshotItems = isCreate
                      ? (detail?.items ?? [])
                      : [];
                    const hasChanges = itemChanges.added.length > 0 || itemChanges.removed.length > 0 || itemChanges.adjusted.length > 0;

                    return (
                      <div
                        key={ev.id}
                        className="rounded-xl p-4"
                        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                      >
                        {/* Card header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: `${isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue}15`,
                                color: isCreate ? colors.green : isDelete ? colors.red : isRestore ? colors.orange : colors.blue,
                              }}
                            >
                              L{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isCreate || isDelete || isRestore ? `${isCreate ? colors.green : isDelete ? colors.red : colors.orange}12` : colors.bgTertiary,
                                color: isCreate || isDelete || isRestore ? (isCreate ? colors.green : isDelete ? colors.red : colors.orange) : colors.textSecondary,
                              }}
                            >
                              {isCreate ? t('shipments.history.typeCreate') :
                               isDelete ? t('shipments.history.typeDelete') :
                               isRestore ? t('shipments.history.typeRestore') :
                               t('shipments.history.typeUpdate')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textTertiary }}>{ev.operator}</p>
                            <p className="text-xs" style={{ color: colors.textTertiary }}>
                              {new Date(ev.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {ev.note && (
                          <p className="text-xs mb-3 italic" style={{ color: colors.textTertiary }}>{ev.note}</p>
                        )}

                        {/* CREATE: show initial item snapshot */}
                        {isCreate && snapshotItems.length > 0 && (
                          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                            <div
                              className="grid grid-cols-5 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                              style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}
                            >
                              <span>PO #</span>
                              <span>SKU</span>
                              <span className="text-right">{t('shipments.history.snapshotQty')}</span>
                              <span className="text-right">{t('shipments.history.snapshotPrice')}</span>
                              <span className="text-center">{t('shipments.history.snapshotPoChange')}</span>
                            </div>
                            {snapshotItems.map((item, i) => (
                              <div
                                key={i}
                                className="grid grid-cols-5 px-4 py-2 text-xs"
                                style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}
                              >
                                <span className="font-mono truncate" style={{ color: colors.blue }}>{item.poNum}</span>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span className="text-right" style={{ color: colors.textSecondary }}>{item.quantity.toLocaleString()}</span>
                                <span className="text-right font-mono" style={{ color: colors.textSecondary }}>${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-center">
                                  {item.poChange && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                      style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>
                                      ✓
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* UPDATE_ITEMS: show diff changes */}
                        {!isCreate && hasChanges && (
                          <div className="space-y-1.5">
                            {itemChanges.added.map((item, i) => (
                              <div
                                key={`add-${i}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                                style={{ backgroundColor: `${colors.green}08` }}
                              >
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.green}15`, color: colors.green }}>{t('shipments.history.itemAdded')}</span>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span style={{ color: colors.textTertiary }}>{t('shipments.history.itemAddedDetail', { qty: item.qty, price: (item.unitPrice ?? 0).toFixed(2) })}</span>
                              </div>
                            ))}
                            {itemChanges.removed.map((item, i) => (
                              <div
                                key={`rm-${i}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                                style={{ backgroundColor: `${colors.red}08` }}
                              >
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${colors.red}15`, color: colors.red }}>{t('shipments.history.itemRemoved')}</span>
                                <span className="font-mono font-medium line-through" style={{ color: colors.textSecondary }}>{item.sku}</span>
                              </div>
                            ))}
                            {itemChanges.adjusted.map((item, i) => (
                              <div
                                key={`adj-${i}`}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                                style={{ backgroundColor: colors.bgTertiary }}
                              >
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>{t('shipments.history.itemAdjusted')}</span>
                                <span className="font-mono font-medium" style={{ color: colors.text }}>{item.sku}</span>
                                <span className="font-mono line-through" style={{ color: colors.red }}>{String(item.before ?? '—')}</span>
                                <span style={{ color: colors.textTertiary }}>→</span>
                                <span className="font-mono font-semibold" style={{ color: colors.green }}>{String(item.after ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {isDelete && (
                          <p className="text-xs italic" style={{ color: colors.red }}>{t('shipments.history.deletedItems')}</p>
                        )}
                        {isRestore && (
                          <p className="text-xs italic" style={{ color: colors.green }}>{t('shipments.history.restoredItems')}</p>
                        )}
                        {!isCreate && !isDelete && !isRestore && !hasChanges && (
                          <p className="text-xs italic" style={{ color: colors.textTertiary }}>
                            {t('shipments.history.noChanges')}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── Footer meta ────────────────────────────────────── */}
      {detail && (
        <div className="mt-6 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
          style={{ borderTop: `1px solid ${colors.border}`, color: colors.textTertiary }}>
          {detail.createdBy && <span>{t('shipments.detail.operator')}: {detail.createdBy}</span>}
          <span>{t('shipments.detail.createdAt')}: {new Date(detail.createdAt).toLocaleString()}</span>
          {detail.updatedBy && detail.updatedBy !== detail.createdBy && (
            <span>{t('shipments.detail.lastEditor')}: {detail.updatedBy}</span>
          )}
          <span>{t('shipments.detail.updatedAt')}: {new Date(detail.updatedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
