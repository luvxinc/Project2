'use client';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryTransactions, vmaKeys } from '@/lib/hooks/use-vma-queries';
import PValveTabSelector from '../components/PValveTabSelector';

interface Transaction {
  id: string;
  date: string;
  action: string;
  productType: string;
  specNo: string;
  serialNo: string | null;
  qty: number;
  expDate: string | null;
  operator: string | null;
  notes: string | null;
  batchNo: string | null;
  caseId: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  REC_CN: 'Receive from CN',
  REC_CASE: 'Return from Case',
  OUT_CASE: 'Send to Case',
  OUT_CN: 'Return to CN',
  USED_CASE: 'Used in Case',
  MOVE_DEMO: 'Move to Demo',
};

const PER_PAGE = 50;

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return d.split('T')[0];
}

export default function InventoryOverviewPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();
  const { data: txns = [], isLoading: loading } = useInventoryTransactions();
  const refetch = () => queryClient.invalidateQueries({ queryKey: vmaKeys.inventory.all });

  // Filters
  const [fAction, setFAction] = useState('');
  const [fType, setFType] = useState('');
  const [fSpec, setFSpec] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [page, setPage] = useState(1);

  const filtered = txns.filter(tx => {
    if (fAction && tx.action !== fAction) return false;
    if (fType && tx.productType !== fType) return false;
    if (fSpec && !tx.specNo.toLowerCase().includes(fSpec.toLowerCase())) return false;
    if (fFrom && fmtDate(tx.date) < fFrom) return false;
    if (fTo && fmtDate(tx.date) > fTo) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [fAction, fType, fSpec, fFrom, fTo]);

  const hasFilter = fAction || fType || fSpec || fFrom || fTo;

  // Shared input style
  const inputSx: React.CSSProperties = {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[18px] font-semibold" style={{ color: colors.text }}>Transaction Ledger</h1>
          <button onClick={refetch}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium border hover:opacity-80 transition"
            style={{ ...inputSx }}>
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <select value={fAction} onChange={e => setFAction(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] border" style={inputSx}>
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] border" style={inputSx}>
            <option value="">All Types</option>
            <option value="PVALVE">P-Valve</option>
            <option value="DELIVERY_SYSTEM">Delivery System</option>
          </select>
          <input type="text" placeholder="Spec#" value={fSpec} onChange={e => setFSpec(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] border w-[100px]" style={inputSx} />
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] border" style={inputSx} />
          <span className="text-[11px]" style={{ color: colors.textTertiary }}>to</span>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] border" style={inputSx} />
          {hasFilter && (
            <button onClick={() => { setFAction(''); setFType(''); setFSpec(''); setFFrom(''); setFTo(''); }}
              className="text-[11px] font-medium ml-1 hover:opacity-70 transition" style={{ color: colors.textSecondary }}>
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: colors.textTertiary }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="text-[13px]" style={{ color: colors.textTertiary }}>Loading...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-20" style={{ color: colors.textTertiary }}>
              <p className="text-[14px] font-medium">{hasFilter ? 'No matching records' : 'No transactions yet'}</p>
            </div>
          ) : (
            <table className="w-full text-[12px]" style={{ color: colors.text }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {['Date', 'Action', 'Type', 'Spec #', 'Serial No.', 'Qty', 'Batch #', 'Exp. Date', 'Operator', 'Notes'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: colors.textTertiary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((tx, i) => (
                  <tr key={tx.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${colors.border}` : 'none' }}
                    className="hover:brightness-95 transition-colors">
                    <td className="px-3 py-2 tabular-nums" style={{ color: colors.textSecondary }}>{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2 font-medium">{ACTION_LABEL[tx.action] || tx.action}</td>
                    <td className="px-3 py-2" style={{ color: colors.textSecondary }}>
                      {tx.productType === 'PVALVE' ? 'P-Valve' : 'DS'}
                    </td>
                    <td className="px-3 py-2 font-mono">{tx.specNo}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: tx.serialNo ? colors.text : colors.textTertiary }}>
                      {tx.serialNo || '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{tx.qty}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{tx.batchNo || '—'}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colors.textSecondary }}>{fmtDate(tx.expDate)}</td>
                    <td className="px-3 py-2" style={{ color: colors.textSecondary }}>{tx.operator || '—'}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: colors.textTertiary }} title={tx.notes || ''}>
                      {tx.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px]" style={{ color: colors.textTertiary }}>
              {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2.5 py-1 rounded-lg text-[11px] border disabled:opacity-30 hover:opacity-80 transition"
                style={inputSx}>Prev</button>
              <span className="text-[11px] tabular-nums" style={{ color: colors.textSecondary }}>{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2.5 py-1 rounded-lg text-[11px] border disabled:opacity-30 hover:opacity-80 transition"
                style={inputSx}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
