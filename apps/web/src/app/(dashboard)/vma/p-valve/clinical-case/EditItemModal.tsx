'use client';

import type { CaseTransaction, SpecOption, PickedProduct } from './types';
import { useTranslations } from 'next-intl';
import type { ThemeColorSet } from '@/contexts/ThemeContext';

interface EditItemModalProps {
  editTxn: CaseTransaction;
  editForm: { specNo: string; serialNo: string; qty: number; expDate: string; batchNo: string };
  editSaving: boolean;
  editError: string;
  editSpecOptions: SpecOption[];
  editAvailable: PickedProduct[];
  editLoadingAvail: boolean;
  colors: ThemeColorSet;
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
  const t = useTranslations('vma');
  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    color: colors.text,
    borderColor: colors.border,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: `${colors.bg}73`, backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-[480px] rounded-2xl border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ color: colors.text }} className="text-sm font-semibold">{t('p_valve.clinicalCase.editModal.title')}</h3>
          <button onClick={onClose} style={{ color: colors.textSecondary }} className="text-lg hover:opacity-70">✕</button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <span className="px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{
              backgroundColor: editTxn.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
              color: editTxn.productType === 'PVALVE' ? colors.blue : colors.indigo,
            }}>
            {editTxn.productType === 'PVALVE' ? 'P-Valve' : 'Delivery System'}
          </span>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.editModal.specNo')}</label>
            <select value={editForm.specNo} onChange={e => onSpecChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
              <option value="">{t('p_valve.clinicalCase.editModal.selectSpec')}</option>
              {editSpecOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.editModal.serialNo')}</label>
            {editLoadingAvail ? (
              <div className="w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}>{t('p_valve.clinicalCase.editModal.loading')}</div>
            ) : (
              <select value={editForm.serialNo} onChange={e => onSerialChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
                <option value="">{t('p_valve.clinicalCase.editModal.selectSerial')}</option>
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
              style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.editModal.cancel')}</button>
            <button onClick={onSave} disabled={editSaving} style={{ backgroundColor: colors.controlAccent, color: colors.white }}
              className="px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >{editSaving ? t('p_valve.clinicalCase.editModal.saving') : t('p_valve.clinicalCase.editModal.save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
