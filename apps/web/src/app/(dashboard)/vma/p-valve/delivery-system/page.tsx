'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryTransactions, useSpecOptions, useCreateTransaction, vmaKeys, vmaFetch } from '@/lib/hooks/use-vma-queries';
import PValveTabSelector from '../components/PValveTabSelector';

const ACTION_META: Record<string, { label: string }> = {
  REC_CN:    { label: 'Receive from China' },
  REC_CASE:  { label: 'Return from Case' },
  OUT_CASE:  { label: 'Out to Case' },
  OUT_CN:    { label: 'Return to China' },
  MOVE_DEMO: { label: 'Move to DEMO' },
};

interface Transaction {
  id: string; date: string; action: string; batchNo: string | null;
  productType: string; specNo: string; serialNo: string | null; qty: number;
  expDate: string | null; inspection: string | null; notes: string | null;
  caseId: string | null; operator: string | null; location: string | null;
}

interface SpecOption { specification: string; model: string; }

export default function DeliverySystemPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');
  const queryClient = useQueryClient();

  // React Query: replaces raw fetch + useState + useEffect
  const { data: transactions = [], isLoading: loading } = useInventoryTransactions('DELIVERY_SYSTEM');
  const { data: specOptions = [] } = useSpecOptions('DELIVERY_SYSTEM');
  const createTxn = useCreateTransaction();

  const [showForm, setShowForm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    batchNo: '', specNo: '', serialNo: '', qty: '1',
    expDate: '', inspection: '', notes: '', caseId: '',
    operator: '', location: '',
  });

  const resetForm = () => {
    setFormData({ date: new Date().toISOString().split('T')[0], batchNo: '', specNo: '', serialNo: '', qty: '1', expDate: '', inspection: '', notes: '', caseId: '', operator: '', location: '' });
    setShowForm(null);
  };

  const handleSubmit = async () => {
    if (!showForm || !formData.specNo) return;
    try {
      const body: any = { date: formData.date, action: showForm, productType: 'DELIVERY_SYSTEM', specNo: formData.specNo, qty: parseInt(formData.qty) || 1 };
      if (formData.batchNo) body.batchNo = formData.batchNo;
      if (formData.serialNo) body.serialNo = formData.serialNo;
      if (formData.expDate) body.expDate = formData.expDate;
      if (formData.inspection) body.inspection = formData.inspection;
      if (formData.notes) body.notes = formData.notes;
      if (formData.caseId) body.caseId = formData.caseId;
      if (formData.operator) body.operator = formData.operator;
      if (formData.location) body.location = formData.location;
      await createTxn.mutateAsync(body);
      resetForm();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    try {
      await vmaFetch(`/vma/inventory-transactions/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: vmaKeys.inventory.all });
    } catch (e) { console.error(e); }
  };

  const columns = ['Date', 'Action', 'Spec#', 'Batch#', 'Serial No.', 'Qty', 'Exp. Date', 'Inspection', 'Case ID', 'Location', 'Operator', ''];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto"><PValveTabSelector /></div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <p style={{ color: colors.textSecondary }} className="text-sm">
            Delivery System Inventory — {transactions.length} record{transactions.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm('REC_CN')} style={{ backgroundColor: colors.blue }} className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              Receive from China
            </button>
            <button onClick={() => setShowForm('OUT_CN')} style={{ backgroundColor: colors.bgTertiary, color: colors.text }} className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              Return to China
            </button>
            <button onClick={() => setShowForm('MOVE_DEMO')} style={{ backgroundColor: colors.bgTertiary, color: colors.text }} className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
              Move to DEMO
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border p-5" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold" style={{ color: colors.text }}>{ACTION_META[showForm]?.label || showForm}</h3>
              <button onClick={resetForm} className="text-[13px] font-medium" style={{ color: colors.textTertiary }}>Cancel</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Date *</label>
                <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Spec# *</label>
                <select value={formData.specNo} onChange={e => setFormData(p => ({ ...p, specNo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
                  <option value="">Select...</option>
                  {specOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Batch#</label>
                <input type="text" value={formData.batchNo} onChange={e => setFormData(p => ({ ...p, batchNo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Serial No.</label>
                <input type="text" value={formData.serialNo} onChange={e => setFormData(p => ({ ...p, serialNo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Qty</label>
                <input type="number" min="1" value={formData.qty} onChange={e => setFormData(p => ({ ...p, qty: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Location</label>
                <input type="text" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Operator</label>
                <input type="text" value={formData.operator} onChange={e => setFormData(p => ({ ...p, operator: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Notes</label>
                <input type="text" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-[13px] border" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }} />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleSubmit} disabled={!formData.specNo} className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40" style={{ backgroundColor: colors.blue }}>
                Save Transaction
              </button>
            </div>
          </div>
        )}

        <div style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }} className="rounded-2xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                {columns.map(col => <th key={col} className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>Loading...</td></tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                      <p className="text-[15px] font-medium">No delivery system records yet</p>
                      <p className="text-[13px]">Click &quot;Receive from China&quot; to record incoming equipment</p>
                    </div>
                  </td>
                </tr>
              ) : transactions.map((txn, idx) => {
                const ac = ACTION_META[txn.action];
                return (
                  <tr key={txn.id} style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }} className="hover:opacity-80 transition-opacity">
                    <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: colors.text }}>{txn.date?.split('T')[0]}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>{ac?.label || txn.action}</span></td>
                    <td className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: colors.controlAccent }}>{txn.specNo}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: colors.textSecondary }}>{txn.batchNo || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: colors.textSecondary }}>{txn.serialNo || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums" style={{ color: colors.text }}>{txn.qty}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: colors.textSecondary }}>{txn.expDate?.split('T')[0] || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: txn.inspection === 'ACCEPT' ? colors.green : txn.inspection === 'REJECT' ? colors.red : colors.textTertiary, fontWeight: txn.inspection ? 600 : 400 }}>{txn.inspection || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: colors.textSecondary }}>{txn.caseId || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: colors.textSecondary }}>{txn.location || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: colors.textSecondary }}>{txn.operator || '—'}</td>
                    <td className="px-3 py-2.5"><button onClick={() => handleDelete(txn.id)} className="text-[11px] font-medium hover:opacity-70" style={{ color: colors.red }}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
