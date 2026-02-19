'use client';

import { useState } from 'react';
import type { ClinicalCase, CaseTransaction, Site, SpecOption, DSOption, LineItem, PickedProduct, CompletionSummary } from './types';
import ProductLine from './ProductLine';
import { useTranslations } from 'next-intl';
import { useModal } from '@/components/modal/GlobalModal';

interface CaseDetailPanelProps {
  selectedCase: ClinicalCase;
  caseDetail: CaseTransaction[];
  completionSummary: CompletionSummary | null;
  loadingDetail: boolean;
  isCompleted: boolean;
  colors: Record<string, string>;
  sites: Site[];
  // Edit Info
  editInfoMode: boolean;
  setEditInfoMode: (v: boolean) => void;
  infoForm: { caseNo: string; siteId: string; patientId: string; caseDate: string; operator: string };
  setInfoForm: (fn: (prev: { caseNo: string; siteId: string; patientId: string; caseDate: string; operator: string }) => { caseNo: string; siteId: string; patientId: string; caseDate: string; operator: string }) => void;
  infoSaving: boolean;
  infoError: string;
  handleSaveInfo: () => void;
  // Actions
  handleBack: () => void;
  handleDownloadPdf: () => void;
  openCompletionReview: () => void;
  setReverseModalOpen: (v: boolean) => void;
  // Edit Item
  openEdit: (txn: CaseTransaction) => void;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
  deleteLoading: boolean;
  confirmDelete: (txnId: string) => void;
  // Add Items
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
  addPvSpecOptions: SpecOption[];
  setAddPvSpecOptions: (fn: (prev: SpecOption[]) => SpecOption[] | SpecOption[]) => void;
  addDsOptions: DSOption[];
  addPvLines: LineItem[];
  setAddPvLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  addDsLines: LineItem[];
  setAddDsLines: (fn: (prev: LineItem[]) => LineItem[]) => void;
  addingItems: boolean;
  handleAddItems: () => void;
  autoPick: (type: 'pv' | 'ds', lineIndex: number, specNo: string, qty: number, mode: 'modal' | 'detail') => void;
  swapPicked: (type: 'pv' | 'ds', lineIndex: number, pickedIndex: number, newProduct: PickedProduct, mode: 'modal' | 'detail') => void;
  API: string;
  getAuthHeaders: () => Record<string, string>;
  onDeleteCase: (caseId: string) => Promise<boolean>;
  onAddRelatedCase: (sourceCaseId: string, dto: { caseNo?: string; siteId: string; patientId: string; caseDate: string }) => Promise<boolean>;
  onDeleteAllRelated: (caseId: string) => Promise<boolean>;
  relatedCases: Array<{ caseId: string; caseNo: string | null; siteId: string; siteName?: string; patientId: string; caseDate: string; status: string }>;
}

export default function CaseDetailPanel({
  selectedCase, caseDetail, completionSummary, loadingDetail, isCompleted, colors, sites,
  editInfoMode, setEditInfoMode, infoForm, setInfoForm, infoSaving, infoError, handleSaveInfo,
  handleBack, handleDownloadPdf, openCompletionReview, setReverseModalOpen,
  openEdit, deletingId, setDeletingId, deleteLoading, confirmDelete,
  showAddForm, setShowAddForm,
  addPvSpecOptions, setAddPvSpecOptions, addDsOptions,
  addPvLines, setAddPvLines, addDsLines, setAddDsLines,
  addingItems, handleAddItems, autoPick, swapPicked, API, getAuthHeaders,
  onDeleteCase, onAddRelatedCase, onDeleteAllRelated, relatedCases,
}: CaseDetailPanelProps) {
  const t = useTranslations('vma');
  const { showConfirm, showError } = useModal();
  const [deletingCase, setDeletingCase] = useState(false);
  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.bgTertiary,
    color: colors.text,
    borderColor: colors.border,
  };

  return (
    <>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-5 py-4 rounded-t-2xl border border-b-0"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-70"
          style={{ color: colors.controlAccent }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('p_valve.clinicalCase.detail.back')}
        </button>
        <div className="flex-1">
          <h3 style={{ color: colors.text }} className="text-base font-semibold">
            {selectedCase.caseNo && <span style={{ color: colors.controlAccent }} className="mr-2">#{selectedCase.caseNo}</span>}
            {selectedCase.caseId}
            <span className="ml-2 text-sm font-normal" style={{ color: colors.textSecondary }}>
              {selectedCase.site?.siteName || selectedCase.siteId} — {selectedCase.caseDate?.split('T')[0]}
              {selectedCase.operator && ` — ${selectedCase.operator}`}
            </span>
            <span
              className="ml-3 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: isCompleted ? `${colors.green}26` : `${colors.orange}26`,
                color: isCompleted ? colors.green : colors.orange,
              }}
            >
              {isCompleted ? t('p_valve.clinicalCase.status.completed') : t('p_valve.clinicalCase.status.inProgress')}
            </span>
          </h3>
        </div>
        {!isCompleted && (
          <button
            onClick={() => {
              setEditInfoMode(true);
              setInfoForm(() => ({
                caseNo: selectedCase.caseNo || '',
                siteId: selectedCase.siteId,
                patientId: selectedCase.patientId,
                caseDate: selectedCase.caseDate?.split('T')[0] || '',
                operator: selectedCase.operator || '',
              }));
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition"
            style={{ color: colors.controlAccent, border: `1px solid ${colors.border}` }}
          >
            {t('p_valve.clinicalCase.detail.editInfo')}
          </button>
        )}
        {/* Download PDF Button */}
        <button
          onClick={handleDownloadPdf}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
          style={{ backgroundColor: colors.controlAccent, color: '#fff' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          PDF
        </button>
        {/* Return for Completion — only when IN_PROGRESS */}
        {!isCompleted && (
          <button
            onClick={openCompletionReview}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
            style={{ backgroundColor: colors.green, color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('p_valve.clinicalCase.detail.returnForCompletion')}
          </button>
        )}
        {/* Delete Case — only when IN_PROGRESS */}
        {!isCompleted && (
          <button
            onClick={() => {
              showConfirm({
                title: t('p_valve.clinicalCase.detail.deleteCase'),
                message: t('p_valve.clinicalCase.detail.deleteCaseMessage', { caseId: selectedCase.caseNo ? '#' + selectedCase.caseNo : selectedCase.caseId }),
                confirmText: t('p_valve.clinicalCase.detail.delete'),
                onConfirm: async () => {
                  setDeletingCase(true);
                  const ok = await onDeleteCase(selectedCase.caseId);
                  setDeletingCase(false);
                  if (ok) handleBack();
                },
              });
            }}
            disabled={deletingCase}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
            style={{ backgroundColor: '#ff3b30', color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            {deletingCase ? '...' : t('p_valve.clinicalCase.detail.delete')}
          </button>
        )}
        {/* Reverse Completion — only when COMPLETED */}
        {isCompleted && (
          <button
            onClick={() => setReverseModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
            style={{ backgroundColor: colors.orange, color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            {t('p_valve.clinicalCase.detail.reverseCompletion')}
          </button>
        )}
      </div>

      {/* Content Area */}
      <div
        className="rounded-b-2xl border border-t-0 overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      >
        {loadingDetail ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Edit Case Info Panel */}
            {editInfoMode && (
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                  {t('p_valve.clinicalCase.detail.editCaseInfo')}
                </h4>
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.caseNo')}</label>
                    <input type="text" value={infoForm.caseNo}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
                        setInfoForm(p => ({ ...p, caseNo: v }));
                      }}
                      placeholder={t('p_valve.clinicalCase.detail.caseNoPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.siteLabel')}</label>
                    <select value={infoForm.siteId} onChange={e => setInfoForm(p => ({ ...p, siteId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle}>
                      {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteId} - {s.siteName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.patientId')}</label>
                    <input type="text" value={infoForm.patientId}
                      onChange={e => setInfoForm(p => ({ ...p, patientId: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                      maxLength={3}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.caseDate')}</label>
                    <input type="date" value={infoForm.caseDate}
                      onChange={e => setInfoForm(p => ({ ...p, caseDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.operator')}</label>
                    <input type="text" value={infoForm.operator}
                      onChange={e => setInfoForm(p => ({ ...p, operator: e.target.value }))}
                      placeholder={t('p_valve.clinicalCase.detail.operatorPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {infoError && <p className="text-xs text-red-500 flex-1">{infoError}</p>}
                  <div className="flex-1" />
                  <button onClick={() => setEditInfoMode(false)}
                    className="px-3 py-1.5 rounded-lg text-xs hover:opacity-70" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.cancel')}</button>
                  <button onClick={handleSaveInfo} disabled={infoSaving}
                    className="px-4 py-1.5 rounded-lg text-xs text-white font-medium hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: colors.controlAccent }}>{infoSaving ? t('p_valve.clinicalCase.detail.saving') : t('p_valve.clinicalCase.detail.save')}</button>
                </div>
              </div>
            )}

            {/* Related Cases (Trip siblings) */}
            {relatedCases.length > 1 && (
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    {t('p_valve.clinicalCase.detail.relatedCases')} — {relatedCases.length}
                  </h4>
                  {!isCompleted && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          showConfirm({
                            title: t('p_valve.clinicalCase.detail.deleteAllRelated'),
                            message: t('p_valve.clinicalCase.detail.deleteAllRelatedMessage'),
                            onConfirm: async () => {
                              await onDeleteAllRelated(selectedCase.caseId);
                            },
                          });
                        }}
                        className="text-xs px-2 py-1 rounded-lg hover:opacity-80"
                        style={{ color: colors.red }}
                      >
                        {t('p_valve.clinicalCase.detail.deleteAll')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {relatedCases.map(s => (
                    <div key={s.caseId} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{
                        backgroundColor: s.caseId === selectedCase.caseId ? `${colors.controlAccent}15` : colors.bgTertiary,
                        border: s.caseId === selectedCase.caseId ? `1px solid ${colors.controlAccent}40` : '1px solid transparent',
                      }}
                    >
                      <span className="text-xs font-mono font-medium" style={{ color: colors.text }}>{s.caseId}</span>
                      {s.caseNo && <span className="text-xs" style={{ color: colors.controlAccent }}>#{s.caseNo}</span>}
                      <span className="text-xs" style={{ color: colors.textSecondary }}>{s.siteName || s.siteId} — {s.patientId}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium`}
                        style={{
                          backgroundColor: s.status === 'COMPLETED' ? `${colors.green}26` : `${colors.orange}26`,
                          color: s.status === 'COMPLETED' ? colors.green : colors.orange,
                        }}
                      >
                        {s.status === 'COMPLETED' ? t('p_valve.clinicalCase.status.completed') : t('p_valve.clinicalCase.status.inProgress')}
                      </span>
                      {s.caseId === selectedCase.caseId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${colors.controlAccent}20`, color: colors.controlAccent }}
                        >
                          {t('p_valve.clinicalCase.detail.current')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="px-5 pt-4 pb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                {t('p_valve.clinicalCase.detail.products')} ({caseDetail.length})
              </h4>
            </div>
            {caseDetail.length === 0 ? (
              <p className="text-xs text-center py-8 px-5" style={{ color: colors.textTertiary }}>{t('p_valve.clinicalCase.detail.noProducts')}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: colors.bgTertiary }}>
                    <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.type')}</th>
                    <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.specNo')}</th>
                    <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.serialNo')}</th>
                    <th className="text-center py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.qty')}</th>
                    <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.expDate')}</th>
                    <th className="text-left py-2 px-4 font-semibold uppercase" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.batchNo')}</th>
                    {!isCompleted && <th className="w-20 py-2 px-4 font-semibold uppercase text-center" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {caseDetail.map(txn => (
                    <tr
                      key={txn.id}
                      style={{ borderTop: `1px solid ${colors.border}`, color: colors.text }}
                    >
                      <td className="py-2.5 px-4">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: txn.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
                            color: txn.productType === 'PVALVE' ? colors.blue : colors.indigo,
                          }}
                        >
                          {txn.productType === 'PVALVE' ? t('p_valve.clinicalCase.detail.pvalveLabel') : t('p_valve.clinicalCase.detail.dsLabel')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono">{txn.specNo}</td>
                      <td className="py-2.5 px-4 font-mono">{txn.serialNo || '-'}</td>
                      <td className="py-2.5 px-4 text-center">{txn.qty}</td>
                      <td className="py-2.5 px-4">{txn.expDate?.split('T')[0] || '-'}</td>
                      <td className="py-2.5 px-4 font-mono">{txn.batchNo || '-'}</td>
                      {!isCompleted && (
                        <td className="py-2.5 px-4 text-center">
                          {deletingId === txn.id ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                onClick={() => confirmDelete(txn.id)}
                                disabled={deleteLoading}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50"
                              >
                                {deleteLoading ? '...' : t('p_valve.clinicalCase.detail.deleteYes')}
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
                                style={{ color: colors.textSecondary }}
                              >
                                {t('p_valve.clinicalCase.detail.deleteNo')}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5 justify-center">
                              <button
                                onClick={() => openEdit(txn)}
                                className="text-[12px] hover:opacity-70 transition"
                                style={{ color: colors.controlAccent }}
                                title={t('p_valve.clinicalCase.detail.edit')}
                              >✎</button>
                              <button
                                onClick={() => setDeletingId(txn.id)}
                                className="text-[12px] hover:opacity-70 transition text-red-400"
                                title={t('p_valve.clinicalCase.detail.delete')}
                              >✕</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Completion Summary — only for COMPLETED cases */}
            {isCompleted && completionSummary && (
              <div className="px-5 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                  {t('p_valve.clinicalCase.detail.completionSummary')}
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {/* Used */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.textSecondary }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        {t('p_valve.clinicalCase.detail.summaryUsed')}
                      </span>
                      <span className="ml-auto text-[11px] font-mono" style={{ color: colors.text }}>
                        {completionSummary.used.reduce((s, i) => s + i.qty, 0)}
                      </span>
                    </div>
                    {completionSummary.used.length === 0 ? (
                      <p className="text-[11px]" style={{ color: colors.textTertiary }}>—</p>
                    ) : (
                      <div className="space-y-1">
                        {completionSummary.used.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: colors.text }}>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                              style={{
                                backgroundColor: item.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
                                color: item.productType === 'PVALVE' ? colors.blue : colors.indigo,
                              }}>
                              {item.productType === 'PVALVE' ? t('p_valve.clinicalCase.detail.pvShort') : t('p_valve.clinicalCase.detail.dsShort')}
                            </span>
                            <span className="font-mono">{item.specNo}</span>
                            <span className="font-mono flex-1" style={{ color: colors.textSecondary }}>{item.serialNo || '-'}</span>
                            {selectedCase.tripId && item.caseId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                style={{ backgroundColor: `${colors.orange}1f`, color: colors.orange }}>
                                {item.caseId}
                              </span>
                            )}
                            <span className="font-mono" style={{ color: colors.textSecondary }}>×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Returned OK */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.green }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        {t('p_valve.clinicalCase.detail.summaryReturnedOk')}
                      </span>
                      <span className="ml-auto text-[11px] font-mono" style={{ color: colors.text }}>
                        {completionSummary.returnedOk.reduce((s, i) => s + i.qty, 0)}
                      </span>
                    </div>
                    {completionSummary.returnedOk.length === 0 ? (
                      <p className="text-[11px]" style={{ color: colors.textTertiary }}>—</p>
                    ) : (
                      <div className="space-y-1">
                        {completionSummary.returnedOk.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: colors.text }}>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                              style={{
                                backgroundColor: item.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
                                color: item.productType === 'PVALVE' ? colors.blue : colors.indigo,
                              }}>
                              {item.productType === 'PVALVE' ? t('p_valve.clinicalCase.detail.pvShort') : t('p_valve.clinicalCase.detail.dsShort')}
                            </span>
                            <span className="font-mono">{item.specNo}</span>
                            <span className="font-mono flex-1" style={{ color: colors.textSecondary }}>{item.serialNo || '-'}</span>
                            <span className="font-mono" style={{ color: colors.textSecondary }}>×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Returned Damaged */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.orange }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        {t('p_valve.clinicalCase.detail.summaryReturnedDamaged')}
                      </span>
                      <span className="ml-auto text-[11px] font-mono" style={{ color: colors.text }}>
                        {completionSummary.returnedDamaged.reduce((s, i) => s + i.qty, 0)}
                      </span>
                    </div>
                    {completionSummary.returnedDamaged.length === 0 ? (
                      <p className="text-[11px]" style={{ color: colors.textTertiary }}>—</p>
                    ) : (
                      <div className="space-y-1">
                        {completionSummary.returnedDamaged.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: colors.text }}>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                              style={{
                                backgroundColor: item.productType === 'PVALVE' ? `${colors.blue}1f` : `${colors.indigo}1f`,
                                color: item.productType === 'PVALVE' ? colors.blue : colors.indigo,
                              }}>
                              {item.productType === 'PVALVE' ? t('p_valve.clinicalCase.detail.pvShort') : t('p_valve.clinicalCase.detail.dsShort')}
                            </span>
                            <span className="font-mono">{item.specNo}</span>
                            <span className="font-mono flex-1" style={{ color: colors.textSecondary }}>{item.serialNo || '-'}</span>
                            <span className="font-mono" style={{ color: colors.textSecondary }}>×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Add Products Section */}
            {!isCompleted && (
              <div className="px-5 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                {!showAddForm ? (
                  <button
                    onClick={() => {
                      setShowAddForm(true);
                      setAddPvLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
                      setAddDsLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
                      (async () => {
                        try {
                          const res = await fetch(`${API}/vma/inventory-transactions/spec-options?productType=PVALVE`, { headers: getAuthHeaders() });
                          if (res.ok) {
                            const data = await res.json();
                            setAddPvSpecOptions(() => data);
                          }
                        } catch (e) { console.error(e); }
                      })();
                    }}
                    className="text-sm font-medium hover:opacity-80 transition"
                    style={{ color: colors.controlAccent }}
                  >
                    {t('p_valve.clinicalCase.detail.addProducts')}
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold" style={{ color: colors.text }}>{t('p_valve.clinicalCase.detail.addProductsTitle')}</h4>
                      <button onClick={() => setShowAddForm(false)} className="text-xs" style={{ color: colors.textSecondary }}>{t('p_valve.clinicalCase.detail.cancel')}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      {/* P-Valve */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-semibold" style={{ color: colors.text }}>P-Valve</h5>
                          <button
                            onClick={() => setAddPvLines(prev => [...prev, { specNo: '', qty: 1, picked: [], available: [], loading: false }])}
                            className="text-xs" style={{ color: colors.controlAccent }}
                          >{t('p_valve.clinicalCase.detail.addRow')}</button>
                        </div>
                        {addPvLines.map((line, i) => (
                          <ProductLine
                            key={i}
                            line={line}
                            index={i}
                            specOptions={addPvSpecOptions}
                            colors={colors}
                            onSpecChange={spec => setAddPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [], available: [] } : l))}
                            onQtyChange={qty => setAddPvLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [], available: [] } : l))}
                            onPick={() => autoPick('pv', i, line.specNo, line.qty, 'detail')}
                            onSwap={(pickedIdx, newProd) => swapPicked('pv', i, pickedIdx, newProd, 'detail')}
                            onRemove={() => { if (addPvLines.length > 1) setAddPvLines(prev => prev.filter((_, idx) => idx !== i)); else setAddPvLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]); }}
                            canRemove={addPvLines.length > 1 || line.picked.length > 0}
                          />
                        ))}
                      </div>
                      {/* DS */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-semibold" style={{ color: colors.text }}>{t('p_valve.clinicalCase.detail.deliverySystem')}</h5>
                          <button
                            onClick={() => setAddDsLines(prev => [...prev, { specNo: '', qty: 1, picked: [], available: [], loading: false }])}
                            className="text-xs" style={{ color: colors.controlAccent }}
                          >{t('p_valve.clinicalCase.detail.addRow')}</button>
                        </div>
                        {addDsOptions.length === 0 ? (
                          <p className="text-xs text-center py-4" style={{ color: colors.textTertiary }}>
                            {t('p_valve.clinicalCase.detail.dsHint')}
                          </p>
                        ) : (
                          addDsLines.map((line, i) => (
                            <ProductLine
                              key={i}
                              line={line}
                              index={i}
                              specOptions={addDsOptions.map(d => ({ specification: d.specification, model: d.model }))}
                              colors={colors}
                              onSpecChange={spec => setAddDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, specNo: spec, picked: [], available: [] } : l))}
                              onQtyChange={qty => setAddDsLines(prev => prev.map((l, idx) => idx === i ? { ...l, qty, picked: [], available: [] } : l))}
                              onPick={() => autoPick('ds', i, line.specNo, line.qty, 'detail')}
                              onSwap={(pickedIdx, newProd) => swapPicked('ds', i, pickedIdx, newProd, 'detail')}
                              onRemove={() => { if (addDsLines.length > 1) setAddDsLines(prev => prev.filter((_, idx) => idx !== i)); else setAddDsLines(() => [{ specNo: '', qty: 1, picked: [], available: [], loading: false }]); }}
                              canRemove={addDsLines.length > 1 || line.picked.length > 0}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={handleAddItems}
                        disabled={addingItems || ([...addPvLines, ...addDsLines].every(l => l.picked.length === 0))}
                        style={{ backgroundColor: colors.controlAccent }}
                        className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
                      >
                        {addingItems ? t('p_valve.clinicalCase.detail.adding') : t('p_valve.clinicalCase.detail.addToCase')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
