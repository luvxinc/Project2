'use client';

import type { ClinicalCase, CaseTransaction, CompletionItem } from './types';
import { CONDITIONAL_NOTES_ITEMS } from './types';
import { useTranslations } from 'next-intl';

interface CompletionReviewPanelProps {
  selectedCase: ClinicalCase;
  caseDetail: CaseTransaction[];
  completionItems: CompletionItem[];
  setCompletionItems: (fn: (prev: CompletionItem[]) => CompletionItem[]) => void;
  colors: Record<string, string>;
  closeCompletionReview: () => void;
  setConfirmModalOpen: (v: boolean) => void;
}

export default function CompletionReviewPanel({
  selectedCase, caseDetail, completionItems, setCompletionItems, colors,
  closeCompletionReview, setConfirmModalOpen,
}: CompletionReviewPanelProps) {
  const t = useTranslations('vma');
  return (
    <>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-5 py-4 rounded-t-2xl border border-b-0"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      >
        <button
          onClick={closeCompletionReview}
          className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-70"
          style={{ color: colors.controlAccent }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Case
        </button>
        <div className="flex-1">
          <h3 style={{ color: colors.text }} className="text-base font-semibold">
            {t('p_valve.clinicalCase.completion.title')}
            <span className="ml-2 text-sm font-normal" style={{ color: colors.textSecondary }}>
              {selectedCase.caseId}
            </span>
          </h3>
        </div>
      </div>

      {/* Review Table */}
      <div
        className="rounded-b-2xl border border-t-0"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: colors.bgTertiary }}>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.type')}</th>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.specNo')}</th>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.serialNo')}</th>
              <th className="text-center py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.qty')}</th>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.expDate')}</th>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.batchNo')}</th>
              <th className="text-center py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.return')}</th>
              <th className="text-center py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.acceptance')}</th>
              <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.completion.note')}</th>
            </tr>
          </thead>
          <tbody>
            {caseDetail.map((txn, idx) => {
              const ci = completionItems[idx];
              if (!ci) return null;
              const disabled = !ci.returned;
              return (
                <tr key={txn.id} style={{ borderTop: `1px solid ${colors.border}`, color: colors.text }}>
                  <td className="py-2.5 px-4">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        backgroundColor: txn.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
                        color: txn.productType === 'PVALVE' ? colors.blue : colors.indigo,
                      }}
                    >
                      {txn.productType === 'PVALVE' ? 'P-Valve' : 'DS'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono">{txn.specNo}</td>
                  <td className="py-2.5 px-4 font-mono">{txn.serialNo || '-'}</td>
                  <td className="py-2.5 px-4 text-center">{txn.qty}</td>
                  <td className="py-2.5 px-4">{txn.expDate?.split('T')[0] || '-'}</td>
                  <td className="py-2.5 px-4 font-mono">{txn.batchNo || '-'}</td>
                  {/* Return Toggle */}
                  <td className="py-2.5 px-4 text-center">
                    <button
                      onClick={() => {
                        setCompletionItems(prev => prev.map((item, i) =>
                          i === idx ? { ...item, returned: !item.returned, accepted: true, returnCondition: [] } : item
                        ));
                      }}
                      className="relative inline-flex items-center h-[22px] w-[40px] rounded-full transition-colors duration-200"
                      style={{ backgroundColor: ci.returned ? colors.green : colors.bgTertiary, border: `1px solid ${ci.returned ? colors.green : colors.border}` }}
                    >
                      <span
                        className="inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200"
                        style={{ transform: ci.returned ? 'translateX(18px)' : 'translateX(1px)' }}
                      />
                    </button>
                  </td>
                  {/* Acceptance Toggle */}
                  <td className="py-2.5 px-4 text-center">
                    <button
                      disabled={disabled}
                      onClick={() => {
                        setCompletionItems(prev => prev.map((item, i) =>
                          i === idx ? { ...item, accepted: !item.accepted, returnCondition: [] } : item
                        ));
                      }}
                      className="relative inline-flex items-center h-[22px] w-[40px] rounded-full transition-colors duration-200"
                      style={{
                        backgroundColor: disabled ? colors.bgTertiary : (ci.accepted ? colors.green : colors.red),
                        border: `1px solid ${disabled ? colors.border : (ci.accepted ? colors.green : colors.red)}`,
                        opacity: disabled ? 0.35 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span
                        className="inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200"
                        style={{ transform: (!disabled && ci.accepted) ? 'translateX(18px)' : 'translateX(1px)' }}
                      />
                    </button>
                  </td>
                  {/* Note Column */}
                  <td className="py-2.5 px-4" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {disabled ? (
                      <span className="text-[11px] italic" style={{ color: colors.textTertiary, opacity: 0.4 }}>—</span>
                    ) : ci.accepted ? (
                      <span className="text-[11px] font-medium" style={{ color: colors.green }}>{t('p_valve.clinicalCase.completion.allOk')}</span>
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => {
                            setCompletionItems(prev => prev.map((item, i) =>
                              i === idx ? { ...item, _dropdownOpen: !(item._dropdownOpen) } : { ...item, _dropdownOpen: false }
                            ));
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-1"
                          style={{
                            borderColor: ci.returnCondition.length > 0 ? colors.red : colors.border,
                            backgroundColor: colors.bgTertiary,
                            color: ci.returnCondition.length > 0 ? colors.red : colors.textSecondary,
                            width: 180,
                          }}
                        >
                          <span className="truncate">
                            {ci.returnCondition.length === 0
                              ? t('p_valve.clinicalCase.completion.selectReasons')
                              : t('p_valve.clinicalCase.completion.issuesSelected', { count: ci.returnCondition.length })}
                          </span>
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {/* Dropdown menu */}
                        {ci._dropdownOpen && (
                          <div
                            className="absolute z-50 mt-1 left-0 w-[360px] rounded-xl border shadow-xl overflow-hidden"
                            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                          >
                            {CONDITIONAL_NOTES_ITEMS.map((label, condIdx) => {
                              const checked = ci.returnCondition.includes(condIdx);
                              return (
                                <label
                                  key={condIdx}
                                  className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:opacity-80 transition"
                                  style={{ borderTop: condIdx > 0 ? `1px solid ${colors.border}` : 'none' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setCompletionItems(prev => prev.map((item, i) => {
                                        if (i !== idx) return item;
                                        const conds = checked
                                          ? item.returnCondition.filter(c => c !== condIdx)
                                          : [...item.returnCondition, condIdx];
                                        return { ...item, returnCondition: conds };
                                      }));
                                    }}
                                    className="mt-0.5 accent-red-500"
                                  />
                                  <span className="text-[11px] leading-tight" style={{ color: checked ? colors.red : colors.text }}>
                                    {label}
                                  </span>
                                </label>
                              );
                            })}
                            <div className="px-3 py-2 flex justify-end" style={{ borderTop: `1px solid ${colors.border}` }}>
                              <button
                                onClick={() => {
                                  setCompletionItems(prev => prev.map((item, i) =>
                                    i === idx ? { ...item, _dropdownOpen: false } : item
                                  ));
                                }}
                                className="text-[11px] font-medium px-3 py-1 rounded-lg"
                                style={{ color: colors.controlAccent }}
                              >
                                {t('p_valve.clinicalCase.completion.done')}
                              </button>
                            </div>
                          </div>
                        )}
                        {ci.returnCondition.length > 0 && (
                          <p className="text-[10px] mt-1" style={{ color: colors.red }}>
                            {t('p_valve.clinicalCase.completion.demoWarning')}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center" style={{ borderTop: `1px solid ${colors.border}` }}>
          <button
            onClick={() => setConfirmModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition"
            style={{ backgroundColor: colors.green, color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {t('p_valve.clinicalCase.completion.confirmCompletion')}
          </button>
        </div>
      </div>
    </>
  );
}
