'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventorySummary, useActiveOperators, useSpecOptions, vmaKeys } from '@/lib/hooks/use-vma-queries';
import { animate } from 'animejs';
import PValveTabSelector from '../components/PValveTabSelector';
import ReceiveFromChinaModal from './ReceiveFromChinaModal';

interface SpecSummary {
  specNo: string;
  available: number;
  wip: number;
  approachingExp: number;
  expired: number;
}

interface SpecOption {
  specification: string;
  model: string;
}

const ACTION_META: Record<string, { label: string }> = {
  REC_CN:    { label: 'Receive from China' },
  OUT_CN:    { label: 'Return to China' },
  MOVE_DEMO: { label: 'Move to DEMO' },
};

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

// 9 conditional inspection items — indices match PDF checkbox pairs
const CONDITIONAL_NOTES_ITEMS = [
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

// Full transaction record for edit modal
interface FullTransaction {
  id: string;
  date: string;
  action: string;
  productType: string;
  specNo: string;
  serialNo: string;
  qty: number;
  batchNo: string;
  expDate: string | null;
  inspection: string | null;
  condition: number[];
  notes: string;
  operator: string;
  location: string;
  caseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function InventoryPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  const queryClient = useQueryClient();

  // React Query: inventory summaries
  const { data: pvalveSummary = [], isLoading: pvLoading } = useInventorySummary('PVALVE');
  const { data: dsSummary = [], isLoading: dsLoading } = useInventorySummary('DELIVERY_SYSTEM');
  const loading = pvLoading || dsLoading;
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);

  // Detail slide state
  const [selectedSpec, setSelectedSpec] = useState<{ specNo: string; productType: 'PVALVE' | 'DELIVERY_SYSTEM' } | null>(null);
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTransactions, setEditTransactions] = useState<FullTransaction[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState<string | null>(null); // action type
  const [formProductType, setFormProductType] = useState<'PVALVE' | 'DELIVERY_SYSTEM'>('PVALVE');

  // React Query: operators and spec options
  const { data: operatorOptions = [] } = useActiveOperators();
  const { data: specOptions = [] } = useSpecOptions(formProductType);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    specNo: '', qty: '1', expDate: '', serialNo: '',
    batchNo: '', inspection: '', operator: '', location: '', notes: '',
  });

  const refetchSummary = () => queryClient.invalidateQueries({ queryKey: vmaKeys.inventory.all });

  const openForm = (action: string) => {
    setShowForm(action);
    setFormProductType('PVALVE');
    setFormData({
      date: new Date().toISOString().split('T')[0],
      specNo: '', qty: '1', expDate: '', serialNo: '',
      batchNo: '', inspection: '', operator: '', location: '', notes: '',
    });
  };

  const resetForm = () => { setShowForm(null); };

  const handleProductTypeChange = (pt: 'PVALVE' | 'DELIVERY_SYSTEM') => {
    setFormProductType(pt);
    setFormData(p => ({ ...p, specNo: '' }));
  };

  // ======== Detail Slide Logic ========
  const handleRowClick = useCallback(async (specNo: string, productType: 'PVALVE' | 'DELIVERY_SYSTEM') => {
    setSelectedSpec({ specNo, productType });
    setLoadingDetail(true);

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

    try {
      const res = await fetch(`${API}/vma/inventory-detail?specNo=${encodeURIComponent(specNo)}&productType=${productType}`, { headers: getAuthHeaders() });
      if (res.ok) setDetail(await res.json());
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
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
      setSelectedSpec(null);
      setDetail(null);
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

  const handleSubmit = async () => {
    if (!showForm || !formData.specNo) return;
    try {
      const body: any = {
        date: formData.date,
        action: showForm,
        productType: formProductType,
        specNo: formData.specNo,
        qty: parseInt(formData.qty) || 1,
      };
      if (formData.batchNo) body.batchNo = formData.batchNo;
      if (formData.serialNo) body.serialNo = formData.serialNo;
      if (formData.expDate) body.expDate = formData.expDate;
      if (formData.inspection) body.inspection = formData.inspection;
      if (formData.notes) body.notes = formData.notes;
      if (formData.operator) body.operator = formData.operator;
      if (formData.location) body.location = formData.location;

      const res = await fetch(`${API}/vma/inventory-transactions`, {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) { resetForm(); refetchSummary(); }
    } catch (e) { console.error(e); }
  };

  const summaryColumns = ['Spec#', 'Available', 'WIP', 'Near Exp.', 'Expired'];

  const detailColumns = ['Batch #', 'Spec #', 'Rec. Date', 'Serial No.', 'Exp. Date', 'Quantity', 'Action Date', 'Operator'];

  // Open edit modal for a detail row
  const openEditModal = async (row: DetailRow) => {
    setEditModalOpen(true);
    setEditLoading(true);
    try {
      const txns: FullTransaction[] = [];
      for (const id of row.transactionIds) {
        const res = await fetch(`${API}/vma/inventory-transactions/${id}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          txns.push({
            ...data,
            date: data.date?.split('T')[0] || '',
            expDate: data.expDate?.split('T')[0] || null,
            condition: data.condition || [],
            createdAt: data.createdAt || '',
            updatedAt: data.updatedAt || '',
          });
        }
      }
      setEditTransactions(txns);
    } catch (e) { console.error(e); }
    setEditLoading(false);
  };

  const saveTransaction = async (txn: FullTransaction) => {
    setEditSaving(true);
    try {
      const body: any = {
        date: txn.date,
        action: txn.action,
        productType: txn.productType,
        specNo: txn.specNo,
        serialNo: txn.serialNo,
        qty: txn.qty,
        batchNo: txn.batchNo || undefined,
        expDate: txn.expDate || undefined,
        inspection: txn.inspection || undefined,
        condition: txn.condition || [],
        notes: txn.notes || undefined,
        operator: txn.operator || undefined,
        location: txn.location || undefined,
        caseId: txn.caseId || undefined,
      };
      const res = await fetch(`${API}/vma/inventory-transactions/${txn.id}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) {
        // Update modal data inline
        const updated = await res.json();
        setEditTransactions(prev => prev.map(t => t.id === txn.id ? {
          ...updated,
          date: updated.date?.split('T')[0] || '',
          expDate: updated.expDate?.split('T')[0] || null,
          condition: updated.condition || [],
          createdAt: updated.createdAt || '',
          updatedAt: updated.updatedAt || '',
        } : t));
        // Refresh background data
        if (selectedSpec) handleRowClick(selectedSpec.specNo, selectedSpec.productType);
        refetchSummary();
      }
    } catch (e) { console.error(e); }
    setEditSaving(false);
  };

  // Renders one detail section (Available / WIP / Near Exp / Expired / Returned to CN)
  const renderDetailSection = (title: string, rows: DetailRow[], accentColor: string) => (
    <div>
      <div
        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
        style={{
          color: accentColor,
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: theme === 'dark' ? `${accentColor}10` : `${accentColor}08`,
        }}
      >
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
        {title}
        <span className="ml-1 font-normal" style={{ color: colors.textTertiary }}>({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-[12px]" style={{ color: colors.textTertiary }}>
          No records
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: colors.bgTertiary }}>
              {detailColumns.map(col => (
                <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.serialNo}-${idx}`}
                onClick={() => openEditModal(row)}
                style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }}
                className="cursor-pointer transition-colors hover:opacity-80"
              >
                <td className="px-3 py-2 text-[12px] font-mono" style={{ color: colors.text }}>{row.batchNo || '—'}</td>
                <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: colors.blue }}>{row.specNo}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: colors.textSecondary }}>{row.recDate || '—'}</td>
                <td className="px-3 py-2 text-[12px] font-mono" style={{ color: colors.text }}>{row.serialNo || '—'}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: colors.textSecondary }}>{row.expDate || '—'}</td>
                <td className="px-3 py-2 text-[12px] font-bold tabular-nums" style={{ color: colors.text }}>{row.quantity}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: colors.textSecondary }}>{row.actionDate || 'N/A'}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: colors.textSecondary }}>{row.operator || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  // Renders one summary table
  const renderSummaryTable = (title: string, data: SpecSummary[], emptyIcon: React.ReactNode, productType: 'PVALVE' | 'DELIVERY_SYSTEM') => (
    <div style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }} className="rounded-2xl border overflow-hidden flex-1">
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
        <h3 className="text-[14px] font-semibold" style={{ color: colors.text }}>{title}</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bgTertiary }}>
            {summaryColumns.map(col => (
              <th key={col} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-12 text-center text-[13px]" style={{ color: colors.textTertiary }}>Loading...</td></tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center" style={{ color: colors.textTertiary }}>
                <div className="flex flex-col items-center gap-2">
                  {emptyIcon}
                  <p className="text-[13px]">No inventory data</p>
                </div>
              </td>
            </tr>
          ) : data.map((row, idx) => (
            <tr key={row.specNo}
              onClick={() => handleRowClick(row.specNo, productType)}
              style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }}
              className="cursor-pointer transition-colors hover:opacity-80"
            >
              <td className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: colors.blue }}>{row.specNo}</td>
              <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums" style={{ color: colors.text }}>{row.available}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: row.wip > 0 ? colors.orange : colors.textTertiary, fontWeight: row.wip > 0 ? 600 : 400 }}>{row.wip}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: row.approachingExp > 0 ? colors.orange : colors.textTertiary, fontWeight: row.approachingExp > 0 ? 600 : 400 }}>{row.approachingExp}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: row.expired > 0 ? colors.red : colors.textTertiary, fontWeight: row.expired > 0 ? 600 : 400 }}>{row.expired}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

    return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <p style={{ color: colors.textSecondary }} className="text-[13px]">
            Current inventory across all specifications
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setReceiveModalOpen(true)}
              style={{ backgroundColor: colors.blue }}
              className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              Receive from China
            </button>
            <button onClick={() => openForm('OUT_CN')}
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              Return to China
            </button>

          </div>
        </div>

        {/* Inline Form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border p-5" style={{
            backgroundColor: colors.bgSecondary, borderColor: colors.border,
          }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold" style={{ color: colors.text }}>
                {ACTION_META[showForm]?.label || showForm}
              </h3>
              <button onClick={resetForm} className="text-[13px] font-medium" style={{ color: colors.textTertiary }}>Cancel</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {/* Product Type */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Product Type *</label>
                <select value={formProductType} onChange={e => handleProductTypeChange(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                  <option value="PVALVE">P-Valve</option>
                  <option value="DELIVERY_SYSTEM">Delivery System</option>
                </select>
              </div>
              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Date *</label>
                <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Spec */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Spec# *</label>
                <select value={formData.specNo} onChange={e => setFormData(p => ({ ...p, specNo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                  <option value="">Select...</option>
                  {specOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
                </select>
              </div>
              {/* Qty */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Qty *</label>
                <input type="number" min="1" value={formData.qty} onChange={e => setFormData(p => ({ ...p, qty: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Exp Date */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Exp. Date</label>
                <input type="date" value={formData.expDate} onChange={e => setFormData(p => ({ ...p, expDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Serial No */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Serial No.</label>
                <input type="text" value={formData.serialNo} onChange={e => setFormData(p => ({ ...p, serialNo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Batch No */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Batch#</label>
                <input type="text" value={formData.batchNo} onChange={e => setFormData(p => ({ ...p, batchNo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Inspection - only for REC_CN */}
              {showForm === 'REC_CN' && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Inspection</label>
                  <select value={formData.inspection} onChange={e => setFormData(p => ({ ...p, inspection: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                    <option value="">--</option>
                    <option value="ACCEPT">Accept</option>
                    <option value="REJECT">Reject</option>
                  </select>
                </div>
              )}
              {/* Location */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Location</label>
                <input type="text" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              {/* Operator */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Operator</label>
                <select value={formData.operator} onChange={e => setFormData(p => ({ ...p, operator: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                  <option value="">Select...</option>
                  {operatorOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              {/* Notes */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Notes</label>
                <input type="text" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleSubmit} disabled={!formData.specNo}
                className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
                style={{ backgroundColor: colors.blue }}>
                Save Transaction
              </button>
            </div>
          </div>
        )}

        {/* ======== Flip Container ======== */}
        {/* Click-outside overlay when detail is shown */}
        {isFlipped && (
          <div
            className="fixed inset-0 z-10"
            onClick={handleBack}
          />
        )}
        <div className="relative z-20">
          {/* === FRONT: Summary Tables === */}
          {!isFlipped && (
            <div ref={frontRef}>
              <div className="flex gap-4">
                {renderSummaryTable(
                  'P-Valve Inventory',
                  pvalveSummary,
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>,
                  'PVALVE',
                )}
                {renderSummaryTable(
                  'Delivery System Inventory',
                  dsSummary,
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>,
                  'DELIVERY_SYSTEM',
                )}
              </div>
            </div>
          )}

          {/* === BACK: Detail Panel === */}
          {isFlipped && selectedSpec && (
            <div ref={backRef}>
              {/* Header */}
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
                  Back
                </button>
                <div className="flex-1">
                  <h3 style={{ color: colors.text }} className="text-base font-semibold">
                    {selectedSpec.specNo}
                    <span className="ml-2 text-sm font-normal" style={{ color: colors.textSecondary }}>
                      {selectedSpec.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'} — Inventory Detail
                    </span>
                  </h3>
                </div>
              </div>

              {/* 5 Section Tables */}
              {loadingDetail ? (
                <div className="flex justify-center py-20 rounded-b-2xl border border-t-0" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detail && (
                <div className="rounded-b-2xl border border-t-0 overflow-hidden" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                  {renderDetailSection('Available', detail.available, '#22C55E')}
                  {renderDetailSection('WIP', detail.wip, colors.orange || '#F59E0B')}
                  {renderDetailSection('Near Exp', detail.nearExp, '#F59E0B')}
                  {renderDetailSection('Expired', detail.expired, '#EF4444')}
                  {renderDetailSection('Returned to CN', detail.returnedToCn, colors.textSecondary)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Receive from China Modal */}
      <ReceiveFromChinaModal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        onSuccess={refetchSummary}
      />

      {/* ======== Transaction Ledger Modal ======== */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !editSaving && setEditModalOpen(false)} />
          <div
            className="relative w-full max-w-2xl rounded-2xl border shadow-2xl max-h-[85vh] flex flex-col"
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          >
            {/* Modal Header — Product Identity */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <h3 className="text-[16px] font-semibold" style={{ color: colors.text }}>Transaction Ledger</h3>
                {selectedSpec && (
                  <p className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
                    {selectedSpec.specNo} · {selectedSpec.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                disabled={editSaving}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-gray-500/20"
                style={{ color: colors.textSecondary }}
              >✕</button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {editLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : editTransactions.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: colors.textTertiary }}>No transactions found</div>
              ) : (
                <div className="px-6 py-4">
                  {/* Timeline */}
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px" style={{ backgroundColor: colors.border }} />

                    {editTransactions.map((txn, idx) => (
                      <LedgerEntry
                        key={txn.id}
                        txn={txn}
                        colors={colors}
                        theme={theme}
                        saving={editSaving}
                        onSave={saveTransaction}
                        isLast={idx === editTransactions.length - 1}
                        operatorOptions={operatorOptions}
                      />
                    ))}
                  </div>

                  {/* Net Summary */}
                  <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textTertiary }}>Net Summary</p>
                    <div className="flex gap-6">
                      {(() => {
                        let recCn = 0, outCn = 0, outCase = 0, recCase = 0, usedCase = 0, moveDemo = 0;
                        editTransactions.forEach(t => {
                          const q = t.qty;
                          switch (t.action) {
                            case 'REC_CN': recCn += q; break;
                            case 'OUT_CN': outCn += q; break;
                            case 'OUT_CASE': outCase += q; break;
                            case 'REC_CASE': recCase += q; break;
                            case 'USED_CASE': usedCase += q; break;
                            case 'MOVE_DEMO': moveDemo += q; break;
                          }
                        });
                        const onShelf = recCn + recCase - outCase - outCn - moveDemo;
                        const inWip = outCase - recCase - usedCase;
                        return (
                          <>
                            <div>
                              <p className="text-[18px] font-bold tabular-nums" style={{ color: colors.text }}>{Math.max(0, onShelf)}</p>
                              <p className="text-[10px]" style={{ color: colors.textTertiary }}>On Shelf</p>
                            </div>
                            <div>
                              <p className="text-[18px] font-bold tabular-nums" style={{ color: colors.text }}>{Math.max(0, inWip)}</p>
                              <p className="text-[10px]" style={{ color: colors.textTertiary }}>In WIP</p>
                            </div>
                            <div>
                              <p className="text-[18px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>{outCn}</p>
                              <p className="text-[10px]" style={{ color: colors.textTertiary }}>Returned CN</p>
                            </div>
                            <div>
                              <p className="text-[18px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>{usedCase}</p>
                              <p className="text-[10px]" style={{ color: colors.textTertiary }}>Used</p>
                            </div>
                            <div>
                              <p className="text-[18px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>{moveDemo}</p>
                              <p className="text-[10px]" style={{ color: colors.textTertiary }}>Demo</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Move to Demo is now in Demo Inventory page */}
    </div>
  );
}

// ======== Action label config — monochrome macOS style ========
const ACTION_CONFIG: Record<string, { label: string; abbr: string }> = {
  REC_CN:    { label: 'Receive from China', abbr: 'REC' },
  OUT_CN:    { label: 'Return to China',    abbr: 'OUT' },
  OUT_CASE:  { label: 'Out for Case',       abbr: 'CASE' },
  REC_CASE:  { label: 'Return from Case',   abbr: 'RET' },
  USED_CASE: { label: 'Used in Case',       abbr: 'USED' },
  MOVE_DEMO: { label: 'Move to DEMO',       abbr: 'DEMO' },
};

// Actions that can be edited from the Inventory tab (warehouse actions only)
const WAREHOUSE_ACTIONS = ['REC_CN', 'OUT_CN', 'MOVE_DEMO'];

// ======== Ledger Entry Component ========
function LedgerEntry({
  txn: initialTxn,
  colors,
  theme,
  saving,
  onSave,
  isLast,
  operatorOptions,
}: {
  txn: FullTransaction;
  colors: any;
  theme: string;
  saving: boolean;
  onSave: (txn: FullTransaction) => void;
  isLast: boolean;
  operatorOptions: string[];
}) {
  const [txn, setTxn] = useState(initialTxn);
  const [editing, setEditing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const cfg = ACTION_CONFIG[txn.action] || { label: txn.action, abbr: '—' };
  const isWarehouse = WAREHOUSE_ACTIONS.includes(txn.action);
  const isRecCn = txn.action === 'REC_CN';
  const inputStyle = { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text };

  // Sync from parent when save completes
  useEffect(() => { setTxn(initialTxn); setEditing(false); }, [initialTxn]);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API}/vma/inventory-receive-pdf/${encodeURIComponent(txn.id)}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receiving_inspection_${txn.specNo}_${txn.serialNo || 'N-A'}_${txn.date}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { console.error(e); }
    setDownloadingPdf(false);
  };

  const toggleConditionItem = (idx: number) => {
    setTxn(p => {
      const current = p.condition || [];
      const next = current.includes(idx) ? current.filter(i => i !== idx) : [...current, idx];
      return { ...p, condition: next };
    });
  };

  const failedItems = (txn.condition || []).sort((a, b) => a - b);

  return (
    <div className={`relative pl-10 ${isLast ? 'pb-0' : 'pb-5'}`}>
      {/* Timeline dot */}
      <div
        className="absolute left-[10px] top-[7px] w-[11px] h-[11px] rounded-full border-2"
        style={{ borderColor: colors.textTertiary, backgroundColor: colors.bgSecondary }}
      />

      {/* Entry card */}
      <div
        className="rounded-xl border p-4 transition-all"
        style={{ borderColor: editing ? colors.blue : colors.border, backgroundColor: colors.bgSecondary }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
            >
              {cfg.abbr}
            </span>
            <span className="text-[12px] font-medium" style={{ color: colors.text }}>
              {cfg.label}
            </span>
            <span className="text-[11px]" style={{ color: colors.textTertiary }}>
              {txn.date}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* PDF download for REC_CN */}
            {isRecCn && !editing && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition hover:opacity-80 disabled:opacity-40"
                style={{ color: colors.textSecondary, backgroundColor: colors.bgTertiary }}
              >{downloadingPdf ? 'Downloading...' : 'Download PDF'}</button>
            )}

            {isWarehouse ? (
              !editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition hover:opacity-80"
                  style={{ color: colors.blue, backgroundColor: colors.bgTertiary }}
                >Edit</button>
              ) : (
                <>
                  <button
                    onClick={() => { setEditing(false); setTxn(initialTxn); }}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                    style={{ color: colors.textSecondary, backgroundColor: colors.bgTertiary }}
                  >Cancel</button>
                  <button
                    onClick={() => onSave(txn)}
                    disabled={saving}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg text-white disabled:opacity-40"
                    style={{ backgroundColor: colors.blue }}
                  >{saving ? 'Saving...' : 'Save'}</button>
                </>
              )
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ color: colors.textTertiary, backgroundColor: colors.bgTertiary }}>
                Clinical Case
              </span>
            )}
          </div>
        </div>

        {/* Fields */}
        {editing ? (
          /* Edit mode — grid */
          <div className="grid grid-cols-3 gap-2 mt-3">
            <EditField label="Date" type="date" value={txn.date} onChange={v => setTxn(p => ({ ...p, date: v }))} colors={colors} inputStyle={{...inputStyle, colorScheme: theme === 'dark' ? 'dark' : 'light'}} />
            <EditField label="Spec No." value={txn.specNo} onChange={v => setTxn(p => ({ ...p, specNo: v }))} colors={colors} inputStyle={inputStyle} />
            <EditField label="Serial No." value={txn.serialNo || ''} onChange={v => setTxn(p => ({ ...p, serialNo: v }))} colors={colors} inputStyle={inputStyle} />
            <EditField label="Qty" type="number" value={String(txn.qty)} onChange={v => setTxn(p => ({ ...p, qty: parseInt(v) || 1 }))} colors={colors} inputStyle={inputStyle} />
            <EditField label="Batch No." value={txn.batchNo || ''} onChange={v => setTxn(p => ({ ...p, batchNo: v }))} colors={colors} inputStyle={inputStyle} />
            <EditField label="Exp. Date" type="date" value={txn.expDate || ''} onChange={v => setTxn(p => ({ ...p, expDate: v || null }))} colors={colors} inputStyle={{...inputStyle, colorScheme: theme === 'dark' ? 'dark' : 'light'}} />
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Operator</label>
              <select value={txn.operator || ''} onChange={e => setTxn(p => ({ ...p, operator: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-[12px] border" style={inputStyle}>
                <option value="">Select...</option>
                {operatorOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            {/* Location: disabled for REC_CN */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                Location {isRecCn && <span className="normal-case font-normal">(set in Fridge Shelf)</span>}
              </label>
              <input
                type="text"
                value={txn.location || ''}
                onChange={e => setTxn(p => ({ ...p, location: e.target.value }))}
                disabled={isRecCn}
                className="w-full px-2 py-1.5 rounded-lg text-[12px] border disabled:opacity-40"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Inspection</label>
              <select value={txn.inspection || ''} onChange={e => setTxn(p => ({ ...p, inspection: e.target.value || null }))}
                className="w-full px-2 py-1.5 rounded-lg text-[12px] border" style={inputStyle}>
                <option value="">—</option>
                <option value="ACCEPT">Accept</option>
                <option value="REJECT">Reject</option>
              </select>
            </div>

            {/* Conditional Notes — editable checklist for REC_CN */}
            {isRecCn && (
              <div className="col-span-3 mt-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: colors.textTertiary }}>
                  Conditional Notes <span className="normal-case font-normal">(check items that failed)</span>
                </label>
                <div className="grid grid-cols-1 gap-1">
                  {CONDITIONAL_NOTES_ITEMS.map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-2 px-2 py-1 rounded-lg cursor-pointer transition hover:opacity-80 text-[11px]"
                      style={{
                        backgroundColor: (txn.condition || []).includes(idx) ? (colors.bgTertiary) : 'transparent',
                        color: (txn.condition || []).includes(idx) ? colors.text : colors.textSecondary,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={(txn.condition || []).includes(idx)}
                        onChange={() => toggleConditionItem(idx)}
                        className="mt-0.5 accent-current"
                      />
                      <span>{idx + 1}. {item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="col-span-3">
              <EditField label="Notes" value={txn.notes || ''} onChange={v => setTxn(p => ({ ...p, notes: v }))} colors={colors} inputStyle={inputStyle} />
            </div>
          </div>
        ) : (
          /* Read-only — compact inline */
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <span style={{ color: colors.textSecondary }}>Qty: <strong style={{ color: colors.text }}>{txn.qty}</strong></span>
              {txn.batchNo && <span style={{ color: colors.textSecondary }}>Batch: <strong style={{ color: colors.text }}>{txn.batchNo}</strong></span>}
              {txn.serialNo && <span style={{ color: colors.textSecondary }}>S/N: <strong className="font-mono" style={{ color: colors.text }}>{txn.serialNo}</strong></span>}
              {txn.expDate && <span style={{ color: colors.textSecondary }}>Exp: <strong style={{ color: colors.text }}>{txn.expDate}</strong></span>}
              {txn.inspection && (
                <span style={{ color: colors.textSecondary }}>
                  Inspection: <strong style={{ color: colors.text }}>{txn.inspection}</strong>
                </span>
              )}
              {txn.operator && <span style={{ color: colors.textSecondary }}>Op: {txn.operator}</span>}
              {txn.location && <span style={{ color: colors.textSecondary }}>Loc: {txn.location}</span>}
              {txn.caseId && <span style={{ color: colors.textSecondary }}>Case: {txn.caseId}</span>}
              {txn.notes && <span style={{ color: colors.textTertiary }}>Notes: {txn.notes}</span>}
            </div>

            {/* Read-only conditional notes — show failed items */}
            {isRecCn && failedItems.length > 0 && (
              <div className="mt-1.5 text-[11px]" style={{ color: colors.textTertiary }}>
                <span className="font-medium" style={{ color: colors.textSecondary }}>Failed items: </span>
                {failedItems.map(idx => CONDITIONAL_NOTES_ITEMS[idx] ? `#${idx + 1}` : null).filter(Boolean).join(', ')}
              </div>
            )}
          </>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] font-mono" style={{ color: colors.textTertiary }}>{txn.id.slice(0, 8)}</span>
          <span className="text-[10px]" style={{ color: colors.textTertiary }}>Created: {txn.createdAt?.split('T')[0]}</span>
        </div>
      </div>
    </div>
  );
}

// ======== Reusable Edit Field ========
function EditField({ label, value, onChange, type, colors, inputStyle }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; colors: any; inputStyle: any;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{label}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg text-[12px] border"
        style={inputStyle}
      />
    </div>
  );
}

