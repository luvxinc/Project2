'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useDemoInventory, useActiveOperators, useSpecOptions, useInventoryDetail, useCreateTransaction, vmaKeys } from '@/lib/hooks/use-vma-queries';
import { animate } from 'animejs';
import PValveTabSelector from '../components/PValveTabSelector';

// 9 conditional inspection items — indices match receiving checklist
const CONDITION_ITEMS = [
  'Quantity received matches quantity shipped',
  'Packaging is in good condition and not damaged',
  'Sealing sticker is undamaged and remains hinged',
  'No strain or waterlogging',
  'No labels are missing or torn',
  'Printing is clear and no information missing',
  'No additional external labels',
  'Products are still within the expiration date',
  'Temperature displayed as "OK" and is not triggered',
];

// Short labels for table display
const CONDITION_SHORT: Record<number, string> = {
  0: 'Qty Mismatch',
  1: 'Pkg Damaged',
  2: 'Seal Broken',
  3: 'Water/Strain',
  4: 'Label Issue',
  5: 'Print Issue',
  6: 'Extra Labels',
  7: 'Exp. Issue',
  8: 'Temp. Issue',
};

interface DemoRow {
  id: string;
  batchNo: string;
  productType: string;
  specNo: string;
  recDate: string;
  serialNo: string;
  expDate: string;
  qty: number;
  status: string;
  notes: string;
  condition: number[];
  date: string;
  operator: string;
  location: string;
  inspection: string;
  createdAt: string;
}

interface SpecOption {
  specification: string;
  model: string;
}

interface DetailRow {
  batchNo: string;
  specNo: string;
  recDate: string;
  serialNo: string;
  expDate: string;
  quantity: number;
  actionDate: string;
  operator: string;
  transactionIds: string[];
}

interface InventoryDetail {
  available: DetailRow[];
  wip: DetailRow[];
  nearExp: DetailRow[];
  expired: DetailRow[];
  returnedToCn: DetailRow[];
}

// ====== DemoLine type for "Add Demo" modal ======
interface DemoLine {
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
  specNo: string;
  serialNo: string;
  batchNo: string;
  recDate: string;
  expDate: string;
  qty: number;
  maxQty: number;
  note: string;
  _selectedRowIdx: number;
  _specOptions: SpecOption[];
  _availableRows: DetailRow[];
  _loadingRows: boolean;
}

const emptyDemoLine = (): DemoLine => ({
  productType: 'PVALVE', specNo: '', serialNo: '', batchNo: '', recDate: '', expDate: '',
  qty: 1, maxQty: 1, note: 'Manual Move to Demo',
  _selectedRowIdx: -1, _specOptions: [], _availableRows: [], _loadingRows: false,
});

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.split('T')[0];
}

// ======== Status badge colors ========
function statusBadge(status: string, colors: any) {
  switch (status) {
    case 'Manually Moved':
      return { bg: `${colors.blue}18`, text: colors.blue, label: 'Manual' };
    case 'Rejected (Receiving)':
      return { bg: `${colors.orange}18`, text: colors.orange, label: 'Rej. Recv.' };
    case 'Rejected (Case)':
      return { bg: `${colors.red}18`, text: colors.red, label: 'Rej. Case' };
    case 'Expired':
      return { bg: `${colors.textTertiary}18`, text: colors.textTertiary, label: 'Expired' };
    default:
      return { bg: `${colors.textTertiary}18`, text: colors.textTertiary, label: status };
  }
}

export default function DemoInventoryPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');
  const queryClient = useQueryClient();

  // React Query: replaces raw fetch + useState + useEffect for main data
  const { data: rows = [], isLoading: loading } = useDemoInventory();
  const { data: operatorOptions = [] } = useActiveOperators();
  const { data: pvSpecs = [] } = useSpecOptions('PVALVE');
  const { data: dsSpecs = [] } = useSpecOptions('DELIVERY_SYSTEM');
  const createTxn = useCreateTransaction();

  // Legend panel
  const [showLegend, setShowLegend] = useState(false);

  // Add Demo modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [demoDate, setDemoDate] = useState(new Date().toISOString().split('T')[0]);
  const [demoOperator, setDemoOperator] = useState('');
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoLines, setDemoLines] = useState<DemoLine[]>([emptyDemoLine()]);

  // ======== Detail Card Slide State ========
  const [selectedRow, setSelectedRow] = useState<DemoRow | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnOperator, setReturnOperator] = useState('');
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // ===== Modal handlers =====
  const openModal = () => {
    setDemoDate(new Date().toISOString().split('T')[0]);
    setDemoOperator('');
    // pvSpecs & dsSpecs already loaded via React Query — no need to fetch
    setDemoLines([{ ...emptyDemoLine(), _specOptions: pvSpecs as SpecOption[] }]);
    setModalOpen(true);
  };

  const handleProductTypeChange = (idx: number, pt: 'PVALVE' | 'DELIVERY_SYSTEM') => {
    const specs = pt === 'PVALVE' ? pvSpecs : dsSpecs;
    setDemoLines(prev => prev.map((l, i) => i === idx ? { ...emptyDemoLine(), productType: pt, _specOptions: specs as SpecOption[] } : l));
  };

  const handleSpecChange = async (idx: number, specNo: string, productType: 'PVALVE' | 'DELIVERY_SYSTEM') => {
    setDemoLines(prev => prev.map((l, i) => i === idx ? { ...l, specNo, serialNo: '', batchNo: '', recDate: '', expDate: '', qty: 1, maxQty: 1, _selectedRowIdx: -1, _loadingRows: true, _availableRows: [] } : l));
    if (!specNo) return;
    try {
      const data: InventoryDetail = await (await import('@/lib/hooks/use-vma-queries')).vmaFetch(`/vma/inventory-transactions/detail?specNo=${encodeURIComponent(specNo)}&productType=${productType}`);
      const avail = [...data.available, ...data.nearExp, ...data.expired];
      setDemoLines(prev => prev.map((l, i) => i === idx ? { ...l, _availableRows: avail, _loadingRows: false } : l));
    } catch {
      setDemoLines(prev => prev.map((l, i) => i === idx ? { ...l, _loadingRows: false } : l));
    }
  };

  const handleRowSelect = (idx: number, rowIdx: number) => {
    setDemoLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const row = l._availableRows[rowIdx];
      if (row) {
        return { ...l, _selectedRowIdx: rowIdx, serialNo: row.serialNo || '', batchNo: row.batchNo, recDate: row.recDate, expDate: row.expDate, qty: 1, maxQty: row.quantity };
      }
      return { ...l, _selectedRowIdx: -1, serialNo: '', batchNo: '', recDate: '', expDate: '', qty: 1, maxQty: 1 };
    }));
  };

  const addLine = () => {
    setDemoLines(prev => [...prev, { ...emptyDemoLine(), _specOptions: pvSpecs as SpecOption[] }]);
  };

  const removeLine = (idx: number) => {
    setDemoLines(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const validLines = demoLines.filter(l => l.specNo);
    if (validLines.length === 0 || !demoOperator) return;
    setDemoSubmitting(true);
    try {
      for (const line of validLines) {
        await createTxn.mutateAsync({
          date: demoDate,
          action: 'MOVE_DEMO',
          productType: line.productType,
          specNo: line.specNo,
          serialNo: line.serialNo || undefined,
          qty: line.qty,
          batchNo: line.batchNo || undefined,
          expDate: line.expDate || undefined,
          operator: demoOperator,
          notes: line.note || 'Manual Move to Demo',
        });
      }
      setModalOpen(false);
      // Cache auto-invalidated by createTxn onSuccess
    } catch (e) { console.error(e); }
    setDemoSubmitting(false);
  };

  // ======== Detail Card Slide ========
  const handleRowClick = useCallback((row: DemoRow) => {
    setSelectedRow(row);
    setShowReturnConfirm(false);
    setReturnOperator('');

    const slideOut = frontRef.current
      ? frontRef.current.getBoundingClientRect().right
      : window.innerWidth;

    if (frontRef.current) {
      animate(frontRef.current, {
        translateX: [0, -slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(true);
      requestAnimationFrame(() => {
        if (backRef.current) {
          animate(backRef.current, {
            translateX: [window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  const handleBack = useCallback(() => {
    const slideOut = backRef.current
      ? window.innerWidth - backRef.current.getBoundingClientRect().left
      : window.innerWidth;

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(false);
      setSelectedRow(null);
      setShowReturnConfirm(false);
      requestAnimationFrame(() => {
        if (frontRef.current) {
          animate(frontRef.current, {
            translateX: [-window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  // ======== Return to Inventory ========
  const handleReturnToInventory = async () => {
    if (!selectedRow || !returnOperator) return;
    setReturning(true);
    try {
      await createTxn.mutateAsync({
        date: new Date().toISOString().split('T')[0],
        action: 'RETURN_DEMO',
        productType: selectedRow.productType,
        specNo: selectedRow.specNo,
        serialNo: selectedRow.serialNo || undefined,
        qty: selectedRow.qty,
        batchNo: selectedRow.batchNo || undefined,
        expDate: selectedRow.expDate || undefined,
        operator: returnOperator,
        notes: `Returned from Demo — original Demo ID: ${selectedRow.id}`,
      });
      // Go back to list after success
      handleBack();
    } catch (e) { console.error(e); }
    setReturning(false);
  };

  // Notes display helper
  const notesDisplay = (row: DemoRow): string => {
    if (row.condition && row.condition.length > 0) {
      return row.condition.map(i => CONDITION_SHORT[i] || `#${i}`).join(', ');
    }
    return row.notes || '—';
  };

  // Check if row can be returned to inventory
  const canReturn = (row: DemoRow): boolean => {
    return row.status === 'Manually Moved' && !row.id.startsWith('expired-');
  };

  // Shared input style
  const inputSx: React.CSSProperties = {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6">
        {/* Click-outside overlay when detail is shown */}
        {isFlipped && (
          <div
            className="fixed inset-0 z-10"
            onClick={handleBack}
          />
        )}
        <div className="relative z-20">

          {/* ═══════ FRONT: Table List ═══════ */}
          {!isFlipped && (
            <div ref={frontRef}>
              {/* Title row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h1 className="text-[18px] font-semibold" style={{ color: colors.text }}>{t('p_valve.demoInventory.title')}</h1>
                  <span className="text-[12px] tabular-nums" style={{ color: colors.textTertiary }}>
                    {rows.length} item{rows.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowLegend(!showLegend)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium border hover:opacity-80 transition"
                    style={inputSx}>
                    {showLegend ? 'Hide' : 'Show'} Legend
                  </button>
                  <button onClick={() => queryClient.invalidateQueries({ queryKey: vmaKeys.inventory.all })}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium border hover:opacity-80 transition"
                    style={inputSx}>
                    Refresh
                  </button>
                  <button onClick={openModal}
                    className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold hover:opacity-90 transition"
                    style={{ backgroundColor: colors.controlAccent, color: '#fff' }}>
                    + {t('p_valve.demoInventory.addDemo')}
                  </button>
                </div>
              </div>

              {/* Legend panel */}
              {showLegend && (
                <div className="mb-4 rounded-xl border p-4" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                  <h3 className="text-[12px] font-semibold mb-2" style={{ color: colors.text }}>Condition Notes Reference</h3>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                    {CONDITION_ITEMS.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                        <span className="font-mono font-semibold shrink-0" style={{ color: colors.textTertiary }}>{CONDITION_SHORT[i]}</span>
                        <span>— {item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <span className="text-[13px]" style={{ color: colors.textTertiary }}>{t('p_valve.inventory.loading')}</span>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex flex-col items-center py-20" style={{ color: colors.textTertiary }}>
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                    </svg>
                    <p className="text-[14px] font-medium">{t('p_valve.demoInventory.empty')}</p>
                  </div>
                ) : (
                  <table className="w-full text-[12px]" style={{ color: colors.text }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        {['Batch #', 'Type', 'Spec #', 'Serial No.', 'Exp. Date', 'Qty', 'Status', 'Notes'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: colors.textTertiary }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: DemoRow, i: number) => {
                        const badge = statusBadge(row.status, colors);
                        return (
                          <tr key={row.id}
                            onClick={() => handleRowClick(row)}
                            style={{ borderBottom: i < rows.length - 1 ? `1px solid ${colors.border}` : 'none' }}
                            className="cursor-pointer transition-colors hover:opacity-80">
                            <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{row.batchNo || '—'}</td>
                            <td className="px-3 py-2" style={{ color: colors.textSecondary }}>
                              {row.productType === 'PVALVE' ? 'P-Valve' : 'DS'}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.blue }}>{row.specNo}</td>
                            <td className="px-3 py-2 font-mono" style={{ color: row.serialNo ? colors.text : colors.textTertiary }}>
                              {row.serialNo || '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: colors.textSecondary }}>{fmtDate(row.expDate)}</td>
                            <td className="px-3 py-2 font-semibold tabular-nums">{row.qty}</td>
                            <td className="px-3 py-2">
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 max-w-[180px] truncate" style={{ color: colors.textTertiary }} title={notesDisplay(row)}>
                              {notesDisplay(row)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ═══════ BACK: Detail Card (名片) ═══════ */}
          {isFlipped && selectedRow && (
            <div ref={backRef}>
              {/* Back button header */}
              <div
                className="flex items-center gap-4 px-5 py-4 rounded-t-2xl border border-b-0"
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-70"
                  style={{ color: colors.blue }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('p_valve.demoInventory.detail.back')}
                </button>
                <div className="flex-1">
                  <h3 style={{ color: colors.text }} className="text-base font-semibold">
                    Product Detail
                  </h3>
                </div>
              </div>

              {/* macOS Card */}
              <div
                className="rounded-b-2xl border border-t-0 overflow-hidden"
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              >
                {/* Card header strip */}
                <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-[22px] font-bold tracking-tight" style={{ color: colors.text }}>
                          {selectedRow.specNo}
                        </h2>
                        {(() => {
                          const badge = statusBadge(selectedRow.status, colors);
                          return (
                            <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {selectedRow.status}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-[13px]" style={{ color: colors.textSecondary }}>
                        {selectedRow.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'}
                        {selectedRow.serialNo ? ` · SN: ${selectedRow.serialNo}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[36px] font-bold tabular-nums leading-none" style={{ color: colors.text }}>
                        {selectedRow.qty}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: colors.textTertiary }}>
                        Unit{selectedRow.qty !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detail fields grid */}
                <div className="px-6 py-5">
                  <div className="grid grid-cols-3 gap-x-8 gap-y-5">
                    {/* Batch No */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.batchNo')}</p>
                      <p className="text-[14px] font-mono" style={{ color: colors.text }}>{selectedRow.batchNo || '—'}</p>
                    </div>
                    {/* Serial No */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.serialNo')}</p>
                      <p className="text-[14px] font-mono" style={{ color: selectedRow.serialNo ? colors.text : colors.textTertiary }}>
                        {selectedRow.serialNo || '—'}
                      </p>
                    </div>
                    {/* Product Type */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.productType')}</p>
                      <p className="text-[14px]" style={{ color: colors.text }}>
                        {selectedRow.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'}
                      </p>
                    </div>
                    {/* Demo Date */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.demoDate')}</p>
                      <p className="text-[14px] tabular-nums" style={{ color: colors.text }}>{fmtDate(selectedRow.date)}</p>
                    </div>
                    {/* Rec Date */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.recDate')}</p>
                      <p className="text-[14px] tabular-nums" style={{ color: colors.text }}>{fmtDate(selectedRow.recDate)}</p>
                    </div>
                    {/* Exp Date */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.expDate')}</p>
                      <p className="text-[14px] tabular-nums" style={{ color: colors.text }}>{fmtDate(selectedRow.expDate)}</p>
                    </div>
                    {/* Operator */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.operator')}</p>
                      <p className="text-[14px]" style={{ color: colors.text }}>{selectedRow.operator || '—'}</p>
                    </div>
                    {/* Location */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.location')}</p>
                      <p className="text-[14px]" style={{ color: colors.text }}>{selectedRow.location || '—'}</p>
                    </div>
                    {/* Inspection */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.inspection')}</p>
                      <p className="text-[14px]" style={{ color: colors.text }}>{selectedRow.inspection || '—'}</p>
                    </div>
                  </div>

                  {/* Notes / Condition */}
                  <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.detail.notes')}</p>
                    {selectedRow.condition && selectedRow.condition.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRow.condition.map((idx: number) => (
                          <span key={idx} className="inline-block px-2 py-1 rounded-md text-[11px] font-medium"
                            style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}>
                            {CONDITION_SHORT[idx] || `#${idx}`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: colors.textSecondary }}>
                        {selectedRow.notes || 'No notes'}
                      </p>
                    )}
                  </div>

                  {/* Created timestamp */}
                  {selectedRow.createdAt && (
                    <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                      <p className="text-[10px]" style={{ color: colors.textTertiary }}>
                        {t('p_valve.demoInventory.detail.created')}: {new Date(selectedRow.createdAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
                      </p>
                    </div>
                  )}
                </div>

                {/* ═══════ Return to Inventory Button (only for Manually Moved, non-expired) ═══════ */}
                {canReturn(selectedRow) && (
                  <div className="px-6 pb-6">
                    {!showReturnConfirm ? (
                      <button
                        onClick={() => setShowReturnConfirm(true)}
                        className="w-full py-3 rounded-xl text-[13px] font-semibold transition hover:opacity-90 flex items-center justify-center gap-2"
                        style={{ backgroundColor: colors.green, color: '#fff' }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                        {t('p_valve.demoInventory.returnToInventory.title')}
                      </button>
                    ) : (
                      <div className="rounded-xl border p-4" style={{
                        backgroundColor: theme === 'dark' ? `${colors.green}08` : `${colors.green}05`,
                        borderColor: `${colors.green}30`,
                      }}>
                        <p className="text-[12px] font-semibold mb-3" style={{ color: colors.text }}>
                            {t('p_valve.demoInventory.returnToInventory.confirmTitle')}: {selectedRow.qty} × {selectedRow.specNo}
                          {selectedRow.serialNo ? ` (SN: ${selectedRow.serialNo})` : ''}?
                        </p>
                        <div className="mb-3">
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                            {t('p_valve.demoInventory.detail.operator')} *
                          </label>
                          <select
                            value={returnOperator}
                            onChange={e => setReturnOperator(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-[13px] border"
                            style={inputSx}
                          >
                            <option value="">{t('p_valve.demoInventory.returnToInventory.selectOperator')}</option>
                            {operatorOptions.map((name: string) => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowReturnConfirm(false)}
                            className="flex-1 py-2 rounded-xl text-[13px] font-medium transition hover:opacity-80"
                            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                          >
                             {t('p_valve.demoInventory.returnToInventory.cancel')}
                          </button>
                          <button
                            onClick={handleReturnToInventory}
                            disabled={returning || !returnOperator}
                            className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: colors.green, color: '#fff' }}
                          >
                             {returning ? t('p_valve.demoInventory.returnToInventory.processing') : t('p_valve.demoInventory.returnToInventory.confirm')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== Add Demo Modal ====== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-[900px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: colors.bgSecondary }}>
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <h2 className="text-[16px] font-bold" style={{ color: colors.text }}>{t('p_valve.demoInventory.addModal.title')}</h2>
              <button onClick={() => !demoSubmitting && setModalOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-70 transition" style={{ backgroundColor: colors.bgTertiary }}>
                <svg className="w-4 h-4" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Global Fields */}
            <div className="px-6 py-4 flex gap-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.addModal.dateShipped')} *</label>
                <input type="date" value={demoDate} onChange={e => setDemoDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputSx} />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.demoInventory.addModal.operator')} *</label>
                <select value={demoOperator} onChange={e => setDemoOperator(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputSx}>
                  <option value="">{t('p_valve.demoInventory.returnToInventory.selectOperator')}</option>
                  {operatorOptions.map((name: string) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>

            {/* Product Lines */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {demoLines.map((line, idx) => (
                  <div key={idx} className="rounded-xl border p-4" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textTertiary }}>Product #{idx + 1}</span>
                      {demoLines.length > 1 && (
                        <button onClick={() => removeLine(idx)} className="text-[11px] font-medium hover:opacity-70 transition" style={{ color: colors.textSecondary }}>Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Type</label>
                        <select value={line.productType} onChange={e => handleProductTypeChange(idx, e.target.value as 'PVALVE' | 'DELIVERY_SYSTEM')}
                          className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}>
                          <option value="PVALVE">P-Valve</option>
                          <option value="DELIVERY_SYSTEM">Delivery System</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Spec # *</label>
                        <select value={line.specNo} onChange={e => handleSpecChange(idx, e.target.value, line.productType)}
                          className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}>
                          <option value="">Select spec...</option>
                          {line._specOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                          {line.productType === 'PVALVE' ? 'Serial No.' : 'Product'}
                        </label>
                        {line._loadingRows ? (
                          <div className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textTertiary }}>Loading...</div>
                        ) : line._availableRows.length > 0 ? (
                          <select value={line._selectedRowIdx >= 0 ? String(line._selectedRowIdx) : ''}
                            onChange={e => handleRowSelect(idx, parseInt(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}>
                            <option value="">Select...</option>
                            {line._availableRows.map((r, ri) => (
                              <option key={ri} value={String(ri)}>
                                {r.serialNo ? `SN: ${r.serialNo}` : `Batch: ${r.batchNo || '?'}`} — Exp: {r.expDate || '?'}, Qty: {r.quantity}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textTertiary }}>
                            {line.specNo ? 'No available stock' : 'Select spec first'}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Auto-filled when row selected */}
                    {line._selectedRowIdx >= 0 && (
                      <div className="grid grid-cols-5 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Batch #</label>
                          <div className="px-3 py-2 rounded-lg text-[13px] font-mono" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{line.batchNo || '—'}</div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Rec. Date</label>
                          <div className="px-3 py-2 rounded-lg text-[13px]" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{line.recDate || '—'}</div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Exp. Date</label>
                          <div className="px-3 py-2 rounded-lg text-[13px]" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{line.expDate || '—'}</div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Qty (max: {line.maxQty})</label>
                          <input type="number" min="1" max={line.maxQty} value={line.qty}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 1;
                              setDemoLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: Math.min(Math.max(1, val), l.maxQty) } : l));
                            }}
                            className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Note</label>
                          <input type="text" value={line.note}
                            onChange={e => setDemoLines(prev => prev.map((l, i) => i === idx ? { ...l, note: e.target.value } : l))}
                            className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={addLine}
                className="mt-3 w-full py-2.5 rounded-xl border border-dashed text-[13px] font-medium hover:opacity-70 transition flex items-center justify-center gap-1.5"
                style={{ borderColor: colors.border, color: colors.textSecondary }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t('p_valve.demoInventory.addModal.addLine')}
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${colors.border}` }}>
              <div className="text-[12px]" style={{ color: colors.textTertiary }}>
                {demoLines.filter(l => l.specNo && l._selectedRowIdx >= 0).length} product(s) ready
              </div>
              <div className="flex gap-3">
                <button onClick={() => !demoSubmitting && setModalOpen(false)}
                  className="px-5 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>{t('p_valve.demoInventory.addModal.cancel')}</button>
                <button onClick={handleSubmit}
                  disabled={demoSubmitting || !demoOperator || demoLines.filter(l => l.specNo).length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-40"
                  style={{ backgroundColor: colors.controlAccent, color: '#fff' }}>
                  {demoSubmitting ? t('p_valve.demoInventory.addModal.processing') : t('p_valve.demoInventory.addModal.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
