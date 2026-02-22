'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type PendingShipment, type ShipmentItemGrouped } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RowInput {
  poNum: string;
  sku: string;
  unitPrice: number;
  sentQuantity: number;
  receiveQuantity: string;
}

interface ReceivePendingPanelProps {
  onBack: () => void;
  onSuccess: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main Panel — consistent with ReceiveDetailPanel / ShipmentDetailPanel
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReceivePendingPanel({ onBack, onSuccess }: ReceivePendingPanelProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [level, setLevel] = useState<1 | 2>(1);
  const [selectedShipment, setSelectedShipment] = useState<PendingShipment | null>(null);

  // ═══════════ Level 1: Pending Shipments ═══════════

  const receiveDate = today();
  const { data, isLoading, error } = useQuery({
    queryKey: ['pendingShipments', receiveDate],
    queryFn: () => purchaseApi.getPendingShipments(receiveDate),
  });
  const list: PendingShipment[] = Array.isArray(data) ? data : [];

  // ═══════════ Level 2: Receive Form ═══════════

  const [formReceiveDate, setFormReceiveDate] = useState(today());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<RowInput[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['shipmentItems', selectedShipment?.logisticNum],
    queryFn: () => purchaseApi.getShipmentItems(selectedShipment!.logisticNum),
    enabled: !!selectedShipment,
  });

  useEffect(() => {
    if (itemsData && Array.isArray(itemsData)) {
      setRows(
        itemsData.map((item: ShipmentItemGrouped) => ({
          poNum: item.poNum,
          sku: item.sku,
          unitPrice: item.unitPrice,
          sentQuantity: item.sentQuantity,
          receiveQuantity: '',
        }))
      );
    }
  }, [itemsData]);

  const submitMutation = useMutation({
    mutationFn: (payload: Parameters<typeof purchaseApi.submitReceive>[0]) =>
      purchaseApi.submitReceive(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
      queryClient.invalidateQueries({ queryKey: ['pendingShipments'] });
      onSuccess();
    },
    onError: (err: Error) => {
      setSubmitError(err.message || t('receives.drawer.submitError'));
    },
  });

  const allFilled = rows.length > 0 && rows.every(r => r.receiveQuantity !== '' && !isNaN(Number(r.receiveQuantity)));

  const handleFillNoDiscrepancy = () => {
    setRows(prev => prev.map(r => ({ ...r, receiveQuantity: String(r.sentQuantity) })));
  };

  const handleSubmit = () => {
    if (!allFilled) return;
    setSubmitError(null);
    const items = rows.map(r => ({
      sku: r.sku,
      unitPrice: r.unitPrice,
      receiveQuantity: Number(r.receiveQuantity),
      receiveDate: formReceiveDate,
      note: note || undefined,
    }));
    submitMutation.mutate({ logisticNum: selectedShipment!.logisticNum, items });
  };

  const handleRowChange = (idx: number, val: string) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], receiveQuantity: val };
      return next;
    });
  };

  const handleSelectShipment = (s: PendingShipment) => {
    setSelectedShipment(s);
    setFormReceiveDate(today());
    setNote('');
    setSubmitError(null);
    setLevel(2);
  };

  const handleFormBack = () => {
    setLevel(1);
    setSelectedShipment(null);
    setRows([]);
  };

  // ── Click-outside for entire panel ─────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const handler = (e: MouseEvent) => {
      if (!mounted) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Always use onBack (slide animation) when clicking outside
        onBack();
      }
    };
    // Delay to avoid the click that opened the panel from immediately closing it
    const id = setTimeout(() => {
      if (mounted) document.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      mounted = false;
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  //  Render — matches ReceiveDetailPanel / ShipmentDetailPanel layout exactly
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div ref={panelRef} className="relative">

      {/* ── Level 1: Pending Shipment List ────────────────────────────────── */}
      {level === 1 && (
        <>
          {/* Back + Actions bar */}
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
          </div>

          {/* Summary card */}
          <div
            className="rounded-xl mb-5"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: `1px solid ${colors.border}` }}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v13m0 0l-4-4m4 4l4-4" />
                </svg>
                <p className="text-base font-semibold" style={{ color: colors.text }}>
                  {t('receives.drawer.title')}
                </p>
              </div>
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
                style={{
                  backgroundColor: `${colors.blue}18`,
                  color: colors.blue,
                  boxShadow: `0 0 0 1px ${colors.blue}40`,
                }}
              >
                {list.length} {t('receives.drawer.pendingSubtitle', { date: receiveDate })}
              </span>
            </div>

            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>入库日期</p>
                <p className="text-sm" style={{ color: colors.text }}>{receiveDate}</p>
              </div>
            </div>
          </div>

          {/* Pending shipments list */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            {isLoading && (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
              </div>
            )}
            {error && (
              <p className="text-center py-16 text-sm" style={{ color: colors.red }}>
                {t('receives.drawer.loadError')}
              </p>
            )}
            {!isLoading && !error && list.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textTertiary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: colors.textTertiary }}>{t('receives.drawer.noPending')}</p>
              </div>
            )}
            {list.map((shipment, idx) => (
              <button
                key={shipment.id}
                onClick={() => handleSelectShipment(shipment)}
                className="w-full px-6 py-4 text-left transition-colors hover:opacity-70 flex items-center justify-between"
                style={{
                  backgroundColor: idx % 2 === 0 ? 'transparent' : colors.bgSecondary,
                  borderBottom: idx < list.length - 1 ? `1px solid ${colors.border}` : undefined,
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-mono font-semibold" style={{ color: colors.text }}>
                    {shipment.logisticNum}
                  </span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>
                    {t('receives.drawer.sentDate')}: {shipment.sentDate}
                    {shipment.etaDate && ` · ETA ${shipment.etaDate}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${colors.orange}18`, color: colors.orange }}>
                    {t('receives.status.in_transit')}
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textTertiary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Level 2: Receive Input Form ──────────────────────────────────── */}
      {level === 2 && selectedShipment && (
        <div>
          {/* Back + Actions bar */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handleFormBack}
              className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: colors.blue }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('receives.drawer.title')}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleFillNoDiscrepancy}
                disabled={rows.length === 0}
                className="px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
                style={{ borderColor: `${colors.green}4d`, color: colors.green }}
              >
                ✓ {t('receives.drawer.noDiscrepancy')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!allFilled || submitMutation.isPending}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-all hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: colors.blue, color: '#fff' }}
              >
                {submitMutation.isPending ? t('receives.drawer.submitting') : t('receives.drawer.submit')}
              </button>
            </div>
          </div>

          {/* Summary card */}
          <div
            className="rounded-xl mb-5"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: `1px solid ${colors.border}` }}
            >
              <div className="flex items-center gap-3">
                <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
                  {selectedShipment.logisticNum}
                </p>
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-tight"
                  style={{ backgroundColor: `${colors.orange}18`, color: colors.orange, boxShadow: `0 0 0 1px ${colors.orange}66` }}
                >
                  {t('receives.status.in_transit')}
                </span>
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.drawer.sentDate')}</p>
                <p className="text-sm" style={{ color: colors.text }}>{selectedShipment.sentDate}</p>
              </div>
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.drawer.receiveDate')}</p>
                <input
                  type="date"
                  value={formReceiveDate}
                  onChange={e => setFormReceiveDate(e.target.value)}
                  className="text-sm px-2 py-1 rounded-lg outline-none"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
                />
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{t('receives.drawer.note')}</p>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('receives.drawer.notePlaceholder')}
                  className="w-full text-sm px-2 py-1 rounded-lg outline-none"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
                />
              </div>
            </div>
          </div>

          {/* Real-time audit summary */}
          {rows.length > 0 && !itemsLoading && (() => {
            const filled = rows.filter(r => r.receiveQuantity !== '' && !isNaN(Number(r.receiveQuantity)));
            const filledCount = filled.length;
            const totalCount = rows.length;
            const totalSent = rows.reduce((s, r) => s + (r.sentQuantity ?? 0), 0);
            const totalReceived = filled.reduce((s, r) => s + Number(r.receiveQuantity), 0);
            const diffCount = filled.filter(r => Number(r.receiveQuantity) !== r.sentQuantity).length;
            const allDone = filledCount === totalCount;
            const noDiffs = diffCount === 0 && allDone;

            return (
              <div
                className="mb-4 rounded-xl overflow-hidden"
                style={{ border: `1px solid ${noDiffs ? `${colors.green}4d` : allDone ? `${colors.orange}4d` : colors.border}` }}
              >
                <div className="grid grid-cols-4 divide-x" style={{ borderColor: colors.border }}>
                  {/* Filled progress */}
                  <div className="px-4 py-3 text-center" style={{ backgroundColor: allDone ? `${colors.green}0f` : `${colors.orange}0f` }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: colors.textTertiary }}>
                      {t('receives.drawer.summaryFilled')}
                    </p>
                    <p className="text-lg font-bold" style={{ color: allDone ? colors.green : colors.orange }}>
                      {filledCount}/{totalCount}
                    </p>
                  </div>
                  {/* Discrepancies */}
                  <div className="px-4 py-3 text-center" style={{ backgroundColor: diffCount > 0 ? `${colors.red}0f` : 'transparent' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: colors.textTertiary }}>
                      {t('receives.drawer.summaryDiffs')}
                    </p>
                    <p className="text-lg font-bold" style={{ color: diffCount > 0 ? colors.red : colors.green }}>
                      {diffCount}
                    </p>
                  </div>
                  {/* Total sent */}
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: colors.textTertiary }}>
                      {t('receives.drawer.summarySent')}
                    </p>
                    <p className="text-lg font-bold" style={{ color: colors.text }}>
                      {totalSent.toLocaleString()}
                    </p>
                  </div>
                  {/* Total received */}
                  <div className="px-4 py-3 text-center" style={{ backgroundColor: totalReceived !== totalSent && allDone ? `${colors.red}0f` : 'transparent' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: colors.textTertiary }}>
                      {t('receives.drawer.summaryReceived')}
                    </p>
                    <p className="text-lg font-bold" style={{ color: totalReceived !== totalSent && allDone ? colors.red : allDone ? colors.green : colors.textSecondary }}>
                      {allDone ? totalReceived.toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Submit error */}
          {submitError && (
            <div className="mb-4 px-4 py-2.5 rounded-xl text-xs" style={{ backgroundColor: `${colors.red}18`, color: colors.red }}>
              {submitError}
            </div>
          )}

          {/* Items table */}
          {itemsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full table-fixed">
                <colgroup>
                  <col />
                  <col />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '130px' }} />
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
                      {t('receives.drawer.col_receiveQty')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const val = row.receiveQuantity;
                    const isEmpty = val === '';
                    const numVal = Number(val);
                    const hasDiff = !isEmpty && numVal !== row.sentQuantity;
                    return (
                      <tr
                        key={`${row.poNum}-${row.sku}`}
                        style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : undefined }}
                      >
                        <td className="px-4 py-2.5 text-sm font-mono font-medium" style={{ color: colors.text }}>{row.sku}</td>
                        <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.textSecondary }}>{row.poNum}</td>
                        <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.textSecondary }}>{(row.sentQuantity ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            value={val}
                            onChange={e => handleRowChange(idx, e.target.value)}
                            placeholder={t('receives.drawer.qtyPlaceholder')}
                            className="w-full text-sm text-right px-2 py-1.5 rounded-lg outline-none transition-all"
                            style={{
                              backgroundColor: isEmpty
                                ? `${colors.red}0f`
                                : hasDiff
                                ? `${colors.orange}14`
                                : `${colors.green}0f`,
                              border: isEmpty
                                ? `1px solid ${colors.red}4d`
                                : hasDiff
                                ? `1px solid ${colors.orange}66`
                                : `1px solid ${colors.green}4d`,
                              color: isEmpty ? colors.red : hasDiff ? colors.orange : colors.green,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
