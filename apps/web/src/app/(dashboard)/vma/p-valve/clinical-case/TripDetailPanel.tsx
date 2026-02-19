'use client';

import { useState } from 'react';
import type { Trip } from './TripListTable';
import type { ClinicalCase } from './types';

interface TripTransaction {
  id: string;
  specNo: string;
  serialNo: string;
  productType: string;
  qty: number;
  expDate?: string;
  batchNo?: string;
  caseId?: string;
  action: string;
}

interface TripDetailData {
  tripId: string;
  tripDate: string;
  siteId: string;
  siteName?: string;
  status: string;
  transactions: TripTransaction[];
  cases: { caseId: string; caseNo?: string; patientId: string; siteId?: string; siteName?: string; status: string }[];
}

interface TripDetailPanelProps {
  trip: Trip;
  detail: TripDetailData | null;
  loading: boolean;
  colors: Record<string, string>;
  onBack: () => void;
  onDelete: (tripId: string) => void;
  onAssign: (tripId: string, caseId: string, txnIds: string[]) => Promise<boolean>;
  onReturn: (tripId: string, txnIds: string[]) => Promise<boolean>;
  onComplete: (tripId: string) => Promise<boolean>;
  onAddCase: (tripId: string, caseId: string) => Promise<boolean>;
  onRemoveCase: (tripId: string, caseId: string) => Promise<boolean>;
  existingCases: ClinicalCase[];
}

export default function TripDetailPanel({
  trip, detail, loading, colors,
  onBack, onDelete, onAssign, onReturn, onComplete,
  onAddCase, onRemoveCase,
  existingCases,
}: TripDetailPanelProps) {
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [assignCaseId, setAssignCaseId] = useState('');
  const [addCaseId, setAddCaseId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.controlAccent}40`, borderTopColor: colors.controlAccent }} />
      </div>
    );
  }

  const txns = detail.transactions as TripTransaction[];
  const unassigned = txns.filter(tx => !tx.caseId && tx.action === 'OUT_TRIP');
  const assigned = txns.filter(tx => tx.caseId);
  const isCompleted = detail.status === 'COMPLETED';
  const tripCaseIds = new Set((detail.cases || []).map(c => c.caseId));

  const toggleTxn = (id: string) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedTxnIds.size === unassigned.length) {
      setSelectedTxnIds(new Set());
    } else {
      setSelectedTxnIds(new Set(unassigned.map(tx => tx.id)));
    }
  };

  const handleAssign = async () => {
    if (!assignCaseId || selectedTxnIds.size === 0) return;
    setActionLoading(true);
    await onAssign(trip.tripId, assignCaseId, Array.from(selectedTxnIds));
    setSelectedTxnIds(new Set());
    setAssignCaseId('');
    setActionLoading(false);
  };

  const handleReturn = async () => {
    if (selectedTxnIds.size === 0) return;
    setActionLoading(true);
    await onReturn(trip.tripId, Array.from(selectedTxnIds));
    setSelectedTxnIds(new Set());
    setActionLoading(false);
  };

  const handleComplete = async () => {
    setActionLoading(true);
    await onComplete(trip.tripId);
    setActionLoading(false);
  };

  const handleAddCase = async () => {
    if (!addCaseId) return;
    setActionLoading(true);
    await onAddCase(trip.tripId, addCaseId);
    setAddCaseId('');
    setActionLoading(false);
  };

  const handleRemoveCase = async (caseId: string) => {
    setActionLoading(true);
    await onRemoveCase(trip.tripId, caseId);
    setActionLoading(false);
  };

  const typeBadge = (productType: string) => (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-semibold"
      style={{
        backgroundColor: productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
        color: productType === 'PVALVE' ? colors.blue : colors.indigo,
      }}
    >
      {productType === 'PVALVE' ? 'PV' : 'DS'}
    </span>
  );

  // Cases eligible for assignment (belong to this trip)
  const tripCases = (detail.cases || []);
  // Cases that can be added (not in any trip)
  const addableCases = existingCases.filter(c => !c.tripId && !tripCaseIds.has(c.caseId));

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.bgSecondary }}>
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center gap-4" style={{ borderColor: colors.border }}>
        <button onClick={onBack} className="flex items-center gap-1 text-sm hover:opacity-70" style={{ color: colors.controlAccent }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex-1">
          <h3 className="text-base font-semibold" style={{ color: colors.text }}>
            <span style={{ color: colors.controlAccent }} className="mr-2">{detail.tripId}</span>
            <span className="text-sm font-normal" style={{ color: colors.textSecondary }}>
              {detail.siteName || detail.siteId} — {detail.tripDate}
            </span>
            <span
              className="ml-3 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: isCompleted ? '#30d15820' : `${colors.orange}20`,
                color: isCompleted ? '#30d158' : colors.orange,
              }}
            >
              {isCompleted ? '✓ Completed' : '● Out'}
            </span>
          </h3>
        </div>

        {!isCompleted && (
          <div className="flex items-center gap-2">
            {unassigned.length === 0 && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg text-xs text-white font-medium hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#30d158' }}
              >
                ✓ Complete Trip
              </button>
            )}
            <button
              onClick={() => onDelete(trip.tripId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
              style={{ color: '#ff453a', backgroundColor: '#ff453a15' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Cases in this Trip */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold" style={{ color: colors.text }}>
              Cases in Trip ({tripCases.length})
            </h4>
          </div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
            {tripCases.map(c => {
              const caseTxns = assigned.filter(tx => tx.caseId === c.caseId);
              return (
                <div key={c.caseId} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0"
                  style={{ borderColor: `${colors.border}50` }}
                >
                  <span className="text-xs font-mono font-semibold" style={{ color: colors.controlAccent }}>
                    {c.caseNo ? `#${c.caseNo}` : c.caseId}
                  </span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    Patient: {c.patientId}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: c.status === 'COMPLETED' ? '#30d15820' : `${colors.controlAccent}20`,
                      color: c.status === 'COMPLETED' ? '#30d158' : colors.controlAccent,
                    }}
                  >
                    {c.status}
                  </span>
                  {caseTxns.length > 0 && (
                    <span className="text-[10px]" style={{ color: colors.textTertiary }}>
                      {caseTxns.length} product(s) assigned
                    </span>
                  )}
                  {!isCompleted && (
                    <button
                      onClick={() => handleRemoveCase(c.caseId)}
                      disabled={actionLoading}
                      className="ml-auto text-[10px] px-2 py-0.5 rounded-lg hover:opacity-70 disabled:opacity-50"
                      style={{ color: '#ff453a' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            {tripCases.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: colors.textTertiary }}>No cases linked</p>
            )}
          </div>
          {/* Add Case */}
          {!isCompleted && addableCases.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={addCaseId}
                onChange={e => setAddCaseId(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs border outline-none flex-1"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
              >
                <option value="">Add Case to Trip...</option>
                {addableCases.map(c => (
                  <option key={c.caseId} value={c.caseId}>
                    {c.caseNo ? `#${c.caseNo} — ` : ''}{c.caseId} — {c.patientId}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddCase}
                disabled={!addCaseId || actionLoading}
                className="px-3 py-1.5 rounded-lg text-xs text-white font-medium hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: colors.controlAccent }}
              >
                + Add
              </button>
            </div>
          )}
        </div>

        {/* Unassigned Products */}
        {unassigned.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold" style={{ color: colors.text }}>
                Shared Product Pool ({unassigned.length} unassigned)
              </h4>
              <button onClick={selectAll} className="text-xs" style={{ color: colors.controlAccent }}>
                {selectedTxnIds.size === unassigned.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderColor: colors.border }} className="border-b">
                    <th className="w-8 py-2 px-3"></th>
                    <th className="text-left py-2 px-3" style={{ color: colors.textSecondary }}>Type</th>
                    <th className="text-left py-2 px-3" style={{ color: colors.textSecondary }}>Spec</th>
                    <th className="text-left py-2 px-3" style={{ color: colors.textSecondary }}>Serial</th>
                    <th className="text-left py-2 px-3" style={{ color: colors.textSecondary }}>Batch</th>
                    <th className="text-left py-2 px-3" style={{ color: colors.textSecondary }}>Exp</th>
                    <th className="text-center py-2 px-3" style={{ color: colors.textSecondary }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map(tx => (
                    <tr
                      key={tx.id}
                      className="border-b cursor-pointer"
                      style={{
                        borderColor: `${colors.border}50`,
                        backgroundColor: selectedTxnIds.has(tx.id) ? `${colors.controlAccent}15` : 'transparent',
                      }}
                      onClick={() => toggleTxn(tx.id)}
                    >
                      <td className="py-2 px-3 text-center">
                        <input type="checkbox" checked={selectedTxnIds.has(tx.id)} onChange={() => toggleTxn(tx.id)} />
                      </td>
                      <td className="py-2 px-3">{typeBadge(tx.productType)}</td>
                      <td className="py-2 px-3" style={{ color: colors.text }}>{tx.specNo}</td>
                      <td className="py-2 px-3" style={{ color: colors.text }}>{tx.serialNo || '—'}</td>
                      <td className="py-2 px-3" style={{ color: colors.textSecondary }}>{tx.batchNo || '—'}</td>
                      <td className="py-2 px-3" style={{ color: colors.textSecondary }}>{tx.expDate || '—'}</td>
                      <td className="py-2 px-3 text-center" style={{ color: colors.text }}>{tx.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Assign / Return Actions */}
            {selectedTxnIds.size > 0 && !isCompleted && (
              <div className="mt-3 p-3 rounded-xl border flex items-center gap-3 flex-wrap" style={{ borderColor: colors.border, backgroundColor: `${colors.controlAccent}08` }}>
                <span className="text-xs font-medium" style={{ color: colors.text }}>
                  {selectedTxnIds.size} selected →
                </span>

                <select
                  value={assignCaseId}
                  onChange={e => setAssignCaseId(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-xs border outline-none"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                >
                  <option value="">Assign to Case...</option>
                  {tripCases.map(c => (
                    <option key={c.caseId} value={c.caseId}>
                      {c.caseNo ? `#${c.caseNo} — ` : ''}{c.caseId}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!assignCaseId || actionLoading}
                  className="px-3 py-1.5 rounded-lg text-xs text-white font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: colors.controlAccent }}
                >
                  Assign
                </button>

                <span className="text-xs" style={{ color: colors.textTertiary }}>or</span>

                <button
                  onClick={handleReturn}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                  style={{ color: colors.orange, backgroundColor: `${colors.orange}15` }}
                >
                  Return to Inventory
                </button>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {unassigned.length === 0 && !isCompleted && (
          <div className="text-center py-4">
            <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
              All products have been assigned or returned.
            </p>
            <button
              onClick={handleComplete}
              disabled={actionLoading}
              className="px-6 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#30d158' }}
            >
              ✓ Complete This Trip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
