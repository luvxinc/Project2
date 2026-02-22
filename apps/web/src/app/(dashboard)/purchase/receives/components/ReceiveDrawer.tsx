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
  receiveQuantity: string; // empty = not filled
}

interface ReceiveDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Sub-component: Pending Shipment List (Level 1) ───────────────────────────

interface ShipmentListPanelProps {
  onSelect: (s: PendingShipment) => void;
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}

function ShipmentListPanel({ onSelect, colors, t }: ShipmentListPanelProps) {
  const receiveDate = today();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pendingShipments', receiveDate],
    queryFn: () => purchaseApi.getPendingShipments(receiveDate),
  });

  const list: PendingShipment[] = Array.isArray(data) ? data : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
        <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
          {t('receives.drawer.pendingSubtitle', { date: receiveDate })}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        )}
        {error && (
          <p className="text-center py-12 text-sm" style={{ color: '#ff453a' }}>
            {t('receives.drawer.loadError')}
          </p>
        )}
        {!isLoading && !error && list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.bgTertiary }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textTertiary }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: colors.textTertiary }}>{t('receives.drawer.noPending')}</p>
          </div>
        )}
        {list.map((shipment, idx) => (
          <button
            key={shipment.id}
            onClick={() => onSelect(shipment)}
            className="w-full px-6 py-4 text-left transition-colors hover:opacity-70 flex items-center justify-between"
            style={{
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
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,166,35,0.12)', color: '#f5a623' }}>
                {t('receives.status.in_transit')}
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textTertiary }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sub-component: Receive Input Form (Level 2) ───────────────────────────────

interface ReceiveFormPanelProps {
  shipment: PendingShipment;
  onBack: () => void;
  onSuccess: () => void;
  onClose: () => void;
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}

function ReceiveFormPanel({ shipment, onBack, onSuccess, onClose, colors, t }: ReceiveFormPanelProps) {
  const queryClient = useQueryClient();
  const [receiveDate, setReceiveDate] = useState(today());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<RowInput[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load grouped items
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['shipmentItems', shipment.logisticNum],
    queryFn: () => purchaseApi.getShipmentItems(shipment.logisticNum),
  });

  useEffect(() => {
    if (itemsData && Array.isArray(itemsData)) {
      setRows(
        itemsData.map((item: ShipmentItemGrouped) => ({
          poNum: item.poNum,
          sku: item.sku,
          unitPrice: item.unitPrice,
          sentQuantity: item.sentQuantity,
          receiveQuantity: '',  // intentionally blank — user must fill
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
      onClose();
    },
    onError: (err: Error) => {
      setSubmitError(err.message || t('receives.drawer.submitError'));
    },
  });

  // Validation
  const allFilled = rows.length > 0 && rows.every(r => r.receiveQuantity !== '' && !isNaN(Number(r.receiveQuantity)));
  const hasEmpty = rows.some(r => r.receiveQuantity === '');

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
      receiveDate,
      note: note || undefined,
    }));

    submitMutation.mutate({ logisticNum: shipment.logisticNum, items });
  };

  const handleRowChange = (idx: number, val: string) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], receiveQuantity: val };
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 rounded-lg transition-opacity hover:opacity-60" style={{ color: colors.blue }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="text-sm font-mono font-semibold" style={{ color: colors.text }}>{shipment.logisticNum}</p>
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('receives.drawer.sentDate')}: {shipment.sentDate}</p>
          </div>
        </div>
        {/* Right: No-diff fill + Submit */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFillNoDiscrepancy}
            disabled={rows.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: 'rgba(48,209,88,0.12)', color: '#30d158' }}
          >
            ✓ {t('receives.drawer.noDiscrepancy')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allFilled || submitMutation.isPending}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: colors.blue, color: '#fff' }}
          >
            {submitMutation.isPending ? t('receives.drawer.submitting') : t('receives.drawer.submit')}
          </button>
        </div>
      </div>

      {/* Receive date + note */}
      <div className="px-6 py-3 flex items-center gap-4" style={{ borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.bgSecondary }}>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium" style={{ color: colors.textTertiary }}>
            {t('receives.drawer.receiveDate')}
          </label>
          <input
            type="date"
            value={receiveDate}
            onChange={e => setReceiveDate(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-medium whitespace-nowrap" style={{ color: colors.textTertiary }}>
            {t('receives.drawer.note')}
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('receives.drawer.notePlaceholder')}
            className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
          />
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(255,69,58,0.1)', color: '#ff453a' }}>
          {submitError}
        </div>
      )}

      {/* Empty alert */}
      {hasEmpty && !submitMutation.isPending && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(245,166,35,0.1)', color: '#f5a623' }}>
          {t('receives.drawer.fillAllPrompt')}
        </div>
      )}

      {/* Items table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {itemsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            <table className="w-full table-fixed">
              <colgroup>
                <col />
                <col />
                <col style={{ width: '80px' }} />
                <col style={{ width: '110px' }} />
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
                      <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.textSecondary }}>{row.sentQuantity}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          value={val}
                          onChange={e => handleRowChange(idx, e.target.value)}
                          placeholder={t('receives.drawer.qtyPlaceholder')}
                          className="w-full text-sm text-right px-2 py-1 rounded-lg outline-none transition-all"
                          style={{
                            backgroundColor: isEmpty
                              ? 'rgba(255,69,58,0.06)'
                              : hasDiff
                              ? 'rgba(245,166,35,0.08)'
                              : 'rgba(48,209,88,0.06)',
                            border: isEmpty
                              ? '1px solid rgba(255,69,58,0.3)'
                              : hasDiff
                              ? '1px solid rgba(245,166,35,0.4)'
                              : '1px solid rgba(48,209,88,0.3)',
                            color: isEmpty ? '#ff453a' : hasDiff ? '#f5a623' : '#30d158',
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
    </div>
  );
}

// ── Main Drawer Component ─────────────────────────────────────────────────────

export default function ReceiveDrawer({ open, onClose, onSuccess }: ReceiveDrawerProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const drawerRef = useRef<HTMLDivElement>(null);

  const [level, setLevel] = useState<1 | 2>(1);
  const [selectedShipment, setSelectedShipment] = useState<PendingShipment | null>(null);

  // Reset to L1 when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setLevel(1);
        setSelectedShipment(null);
      }, 350); // after animation
    }
  }, [open]);

  const handleSelectShipment = (s: PendingShipment) => {
    setSelectedShipment(s);
    setLevel(2);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: '480px',
          backgroundColor: colors.bg,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          borderLeft: `1px solid ${colors.border}`,
        }}
      >
        {/* Drawer Title Bar */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-2">
            {/* Breadcrumb dots */}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.blue }} />
              {level === 2 && (
                <>
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: colors.border }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.blue }} />
                </>
              )}
            </div>
            <h2 className="text-base font-semibold" style={{ color: colors.text }}>
              {level === 1 ? t('receives.drawer.title') : t('receives.drawer.titleForm')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: colors.textSecondary }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Level 1: Shipment list */}
        {level === 1 && (
          <ShipmentListPanel onSelect={handleSelectShipment} colors={colors} t={t} />
        )}

        {/* Level 2: Receive form */}
        {level === 2 && selectedShipment && (
          <ReceiveFormPanel
            shipment={selectedShipment}
            onBack={() => setLevel(1)}
            onSuccess={onSuccess}
            onClose={onClose}
            colors={colors}
            t={t}
          />
        )}
      </div>
    </>
  );
}
