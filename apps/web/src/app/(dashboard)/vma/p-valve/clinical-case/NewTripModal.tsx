'use client';

import type { Site, SpecOption, DSOption, LineItem, PickedProduct, ClinicalCase } from './types';
import ProductLine from './ProductLine';
import { useTranslations } from 'next-intl';

interface NewTripModalProps {
  colors: Record<string, string>;
  sites: Site[];
  siteId: string;
  setSiteId: (v: string) => void;
  tripDate: string;
  setTripDate: (v: string) => void;
  error: string;
  submitting: boolean;
  // Case selection
  availableCases: ClinicalCase[];
  selectedCaseIds: string[];
  setSelectedCaseIds: (ids: string[]) => void;
  // Products
  pvSpecOptions: SpecOption[];
  pvLines: LineItem[];
  setPvLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  dsOptions: DSOption[];
  dsLines: LineItem[];
  setDsLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  autoPick: (type: 'pv' | 'ds', lineIndex: number, specNo: string, qty: number, mode: 'modal' | 'detail') => void;
  onSwapPicked: (type: 'pv' | 'ds', lineIndex: number, pickedIndex: number, newProduct: PickedProduct, mode: 'modal' | 'detail') => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function NewTripModal({
  colors, sites,
  siteId, setSiteId, tripDate, setTripDate,
  error, submitting,
  availableCases, selectedCaseIds, setSelectedCaseIds,
  pvSpecOptions, pvLines, setPvLines, dsOptions, dsLines, setDsLines,
  autoPick, onSwapPicked,
  onClose, onSubmit,
}: NewTripModalProps) {
  const t = useTranslations('vma');
  const hasPicked = pvLines.some(l => l.picked.length > 0) || dsLines.some(l => l.picked.length > 0);

  const inputStyle = {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
    color: colors.text,
  };

  const toggleCase = (caseId: string) => {
    setSelectedCaseIds(
      selectedCaseIds.includes(caseId)
        ? selectedCaseIds.filter(id => id !== caseId)
        : [...selectedCaseIds, caseId]
    );
  };

  // Filter cases by selected site
  const casesForSite = siteId
    ? availableCases.filter(c => c.siteId === siteId && !c.tripId)
    : availableCases.filter(c => !c.tripId);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-[780px] rounded-2xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
          <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
            New Trip (出库单)
          </h2>
          <button onClick={onClose} className="text-lg hover:opacity-60" style={{ color: colors.textSecondary }}>✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* Site + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Site *</label>
              <select
                value={siteId}
                onChange={e => { setSiteId(e.target.value); setSelectedCaseIds([]); }}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={inputStyle}
              >
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.siteId} value={s.siteId}>{s.siteId} — {s.siteName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>Date *</label>
              <input
                type="date" value={tripDate}
                onChange={e => setTripDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Case Selection */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
              Select Cases for this Trip ({selectedCaseIds.length} selected)
            </label>
            {casesForSite.length === 0 ? (
              <p className="text-xs py-3 text-center" style={{ color: colors.textTertiary }}>
                {siteId ? 'No available cases for this site' : 'Select a site first'}
              </p>
            ) : (
              <div className="rounded-xl border overflow-hidden max-h-[140px] overflow-y-auto" style={{ borderColor: colors.border }}>
                {casesForSite.map(c => (
                  <div
                    key={c.caseId}
                    onClick={() => toggleCase(c.caseId)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:opacity-80 border-b last:border-b-0"
                    style={{
                      borderColor: `${colors.border}50`,
                      backgroundColor: selectedCaseIds.includes(c.caseId) ? `${colors.controlAccent}12` : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCaseIds.includes(c.caseId)}
                      onChange={() => toggleCase(c.caseId)}
                    />
                    <span className="text-xs font-mono font-medium" style={{ color: colors.controlAccent }}>
                      {c.caseNo ? `#${c.caseNo}` : c.caseId}
                    </span>
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      Patient: {c.patientId || '—'}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: colors.textTertiary }}>
                      {c.caseDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Products - 2 columns */}
          <div className="grid grid-cols-2 gap-6">
            {/* P-Valve */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold" style={{ color: colors.text }}>P-Valve</h4>
                <button
                  onClick={() => setPvLines(prev => [...prev, { specNo: '', qty: 1, picked: [], available: [], loading: false }])}
                  className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ color: colors.controlAccent }}
                >+ Add Row</button>
              </div>
              {pvLines.map((line, i) => (
                <ProductLine key={i} line={line} index={i} specOptions={pvSpecOptions} colors={colors}
                  onSpecChange={spec => setPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [], available: [] } : l))}
                  onQtyChange={qty => setPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [], available: [] } : l))}
                  onPick={() => { if (line.specNo) autoPick('pv', i, line.specNo, line.qty, 'modal'); }}
                  onSwap={(pickedIdx, newProd) => onSwapPicked('pv', i, pickedIdx, newProd, 'modal')}
                  onRemove={() => { if (pvLines.length > 1) setPvLines(prev => prev.filter((_, idx) => idx !== i)); else setPvLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]); }}
                  canRemove={pvLines.length > 1 || line.picked.length > 0}
                />
              ))}
            </div>

            {/* Delivery System */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold" style={{ color: colors.text }}>Delivery System</h4>
                <button
                  onClick={() => setDsLines(prev => [...prev, { specNo: '', qty: 1, picked: [], available: [], loading: false }])}
                  className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ color: colors.controlAccent }}
                >+ Add Row</button>
              </div>
              {dsLines.map((line, i) => (
                <ProductLine key={i} line={line} index={i}
                  specOptions={dsOptions.map(d => ({ specification: d.specification, model: d.model }))}
                  colors={colors}
                  onSpecChange={spec => setDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [], available: [] } : l))}
                  onQtyChange={qty => setDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [], available: [] } : l))}
                  onPick={() => { if (line.specNo) autoPick('ds', i, line.specNo, line.qty, 'modal'); }}
                  onSwap={(pickedIdx, newProd) => onSwapPicked('ds', i, pickedIdx, newProd, 'modal')}
                  onRemove={() => { if (dsLines.length > 1) setDsLines(prev => prev.filter((_, idx) => idx !== i)); else setDsLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]); }}
                  canRemove={dsLines.length > 1 || line.picked.length > 0}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: colors.border }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm hover:opacity-70"
            style={{ color: colors.textSecondary }}
          >Cancel</button>
          <button
            onClick={onSubmit}
            disabled={submitting || !siteId || !tripDate || !hasPicked || selectedCaseIds.length === 0}
            className="px-6 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: colors.controlAccent }}
          >
            {submitting ? 'Creating...' : `Create Trip (${selectedCaseIds.length} Cases)`}
          </button>
        </div>
      </div>
    </div>
  );
}
