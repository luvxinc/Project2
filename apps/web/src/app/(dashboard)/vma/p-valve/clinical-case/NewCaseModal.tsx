'use client';

import type { Site, SpecOption, DSOption, LineItem } from './types';
import ProductLine from './ProductLine';

interface NewCaseModalProps {
  colors: Record<string, string>;
  sites: Site[];
  // Fields
  caseNo: string;
  setCaseNo: (v: string) => void;
  siteId: string;
  setSiteId: (v: string) => void;
  patientId: string;
  setPatientId: (v: string) => void;
  caseDate: string;
  setCaseDate: (v: string) => void;
  caseNoDup: boolean;
  error: string;
  submitting: boolean;
  // Products
  pvSpecOptions: SpecOption[];
  pvLines: LineItem[];
  setPvLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  dsOptions: DSOption[];
  dsLines: LineItem[];
  setDsLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  autoPick: (type: 'pv' | 'ds', lineIndex: number, specNo: string, qty: number, mode: 'modal' | 'detail') => void;
  // Actions
  onClose: () => void;
  onSubmit: () => void;
}

export default function NewCaseModal({
  colors, sites,
  caseNo, setCaseNo, siteId, setSiteId, patientId, setPatientId, caseDate, setCaseDate,
  caseNoDup, error, submitting,
  pvSpecOptions, pvLines, setPvLines, dsOptions, dsLines, setDsLines,
  autoPick, onClose, onSubmit,
}: NewCaseModalProps) {
  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    color: colors.text,
    borderColor: colors.border,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-[900px] max-h-[85vh] rounded-2xl border overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2 style={{ color: colors.text }} className="text-lg font-semibold">New Clinical Case</h2>
          <button onClick={onClose} style={{ color: colors.textSecondary }} className="text-xl hover:opacity-70">✕</button>
        </div>

        {/* Top Section: Case #, Site, Patient, Date */}
        <div className="px-6 py-4 grid grid-cols-4 gap-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Case #</label>
            <input type="text" value={caseNo}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
                if (/^\d*[A-Za-z]?$/.test(v)) setCaseNo(v);
              }}
              placeholder="e.g. 123 or 123A"
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
            {caseNoDup && <p className="text-xs mt-1 text-red-500">Case # already exists</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Site ID</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
              <option value="">Select site...</option>
              {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteId} - {s.siteName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Patient ID (3 digits)</label>
            <input type="text" value={patientId}
              onChange={e => setPatientId(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="001" maxLength={3}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
            {siteId && patientId.length === 3 && (
              <p className="text-xs mt-1 font-mono" style={{ color: colors.controlAccent }}>Case ID: UVP-{siteId}-{patientId}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Case Date</label>
            <input type="date" value={caseDate} onChange={e => setCaseDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
          </div>
        </div>

        {/* Products */}
        <div className="px-6 py-4 grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ color: colors.text }} className="text-sm font-semibold">P-Valve Requested</h3>
              <button onClick={() => setPvLines(prev => [...prev, { specNo: '', qty: 1, picked: [], loading: false }])}
                className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ color: colors.controlAccent }}>+ Add Row</button>
            </div>
            {pvLines.map((line, i) => (
              <ProductLine key={i} line={line} index={i} specOptions={pvSpecOptions} colors={colors}
                onSpecChange={spec => setPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [] } : l))}
                onQtyChange={qty => setPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [] } : l))}
                onPick={() => autoPick('pv', i, line.specNo, line.qty, 'modal')}
                onRemove={() => { if (pvLines.length > 1) setPvLines(prev => prev.filter((_, idx) => idx !== i)); }}
                canRemove={pvLines.length > 1}
              />
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ color: colors.text }} className="text-sm font-semibold">Delivery System Requested</h3>
              <button onClick={() => setDsLines(prev => [...prev, { specNo: '', qty: 1, picked: [], loading: false }])}
                className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ color: colors.controlAccent }}>+ Add Row</button>
            </div>
            {dsOptions.length === 0 && pvLines.every(l => !l.specNo) ? (
              <p className="text-xs text-center py-6" style={{ color: colors.textTertiary }}>Select P-Valve specs first</p>
            ) : (
              dsLines.map((line, i) => (
                <ProductLine key={i} line={line} index={i}
                  specOptions={dsOptions.map(d => ({ specification: d.specification, model: d.model }))}
                  colors={colors}
                  onSpecChange={spec => setDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [] } : l))}
                  onQtyChange={qty => setDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [] } : l))}
                  onPick={() => autoPick('ds', i, line.specNo, line.qty, 'modal')}
                  onRemove={() => { if (dsLines.length > 1) setDsLines(prev => prev.filter((_, idx) => idx !== i)); }}
                  canRemove={dsLines.length > 1}
                />
              ))
            )}
          </div>
        </div>

        {/* Error & Submit */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${colors.border}` }}>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex-1" />
          <button onClick={onSubmit} disabled={submitting}
            style={{ backgroundColor: colors.controlAccent }}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Case & Download Packing List'}
          </button>
        </div>
      </div>
    </div>
  );
}
