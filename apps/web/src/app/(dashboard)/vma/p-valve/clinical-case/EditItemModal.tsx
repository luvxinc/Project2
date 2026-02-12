'use client';

import type { CaseTransaction, SpecOption, PickedProduct } from './types';

interface EditItemModalProps {
  editTxn: CaseTransaction;
  editForm: { specNo: string; serialNo: string; qty: number; expDate: string; batchNo: string };
  editSaving: boolean;
  editError: string;
  editSpecOptions: SpecOption[];
  editAvailable: PickedProduct[];
  editLoadingAvail: boolean;
  colors: Record<string, string>;
  onClose: () => void;
  onSpecChange: (spec: string) => void;
  onSerialChange: (serial: string) => void;
  onSave: () => void;
}

export default function EditItemModal({
  editTxn, editForm, editSaving, editError,
  editSpecOptions, editAvailable, editLoadingAvail,
  colors, onClose, onSpecChange, onSerialChange, onSave,
}: EditItemModalProps) {
  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    color: colors.text,
    borderColor: colors.border,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-[480px] rounded-2xl border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ color: colors.text }} className="text-sm font-semibold">Edit Case Item</h3>
          <button onClick={onClose} style={{ color: colors.textSecondary }} className="text-lg hover:opacity-70">✕</button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <span className="px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{
              backgroundColor: editTxn.productType === 'PVALVE' ? 'rgba(0,122,255,0.12)' : 'rgba(175,82,222,0.12)',
              color: editTxn.productType === 'PVALVE' ? '#007AFF' : '#AF52DE',
            }}>
            {editTxn.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'}
          </span>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>Spec #</label>
            <select value={editForm.specNo} onChange={e => onSpecChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
              <option value="">Select spec...</option>
              {editSpecOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>Serial No.</label>
            {editLoadingAvail ? (
              <div className="w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}>Loading...</div>
            ) : (
              <select value={editForm.serialNo} onChange={e => onSerialChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
                <option value="">Select serial...</option>
                {(() => {
                  const seen = new Set<string>();
                  return editAvailable.filter(a => {
                    if (editTxn?.productType === 'DELIVERY_SYSTEM') {
                      if (seen.has(a.serialNo)) return false;
                      seen.add(a.serialNo);
                    }
                    return true;
                  }).map((a, i) => (
                    <option key={`${a.serialNo}-${i}`} value={a.serialNo}>
                      {a.serialNo}{a.expDate ? ` (exp: ${a.expDate})` : ''}
                    </option>
                  ));
                })()}
              </select>
            )}
          </div>
        </div>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${colors.border}` }}>
          {editError ? <p className="text-xs text-red-500">{editError}</p> : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm hover:opacity-70 transition"
              style={{ color: colors.textSecondary }}>Cancel</button>
            <button onClick={onSave} disabled={editSaving} style={{ backgroundColor: colors.controlAccent }}
              className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >{editSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
