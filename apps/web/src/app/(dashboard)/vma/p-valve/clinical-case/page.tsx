'use client';

import { useEffect } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import PValveTabSelector from '../components/PValveTabSelector';
import { useClinicalCases } from './useClinicalCases';
import CaseListTable from './CaseListTable';
import CaseDetailPanel from './CaseDetailPanel';
import CompletionReviewPanel from './CompletionReviewPanel';
import { ConfirmCompletionModal, ReverseCompletionModal } from './ConfirmModals';
import NewCaseModal from './NewCaseModal';
import EditItemModal from './EditItemModal';

export default function ClinicalCasePage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  const {
    toastError, setToastError,
    cases, loading,
    selectedCase, caseDetail, relatedCases, completionSummary, loadingDetail, isFlipped,
    frontRef, backRef, completionRef,
    handleCaseClick, handleBack,
    showCompletion, completionItems, completionTxns, setCompletionItems,
    confirmModalOpen, setConfirmModalOpen,
    completing, reverseModalOpen, setReverseModalOpen, reversing,
    openCompletionReview, closeCompletionReview,
    handleConfirmCompletion, handleReverseCompletion,
    modalOpen, setModalOpen, sites,
    caseNo, setCaseNo, siteId, setSiteId,
    patientId, setPatientId, caseDate, setCaseDate,
    submitting, error, caseNoDup,
    pvSpecOptions, pvLines, setPvLines,
    dsOptions, dsLines, setDsLines,
    handleSubmit, resetModal,
    additionalCases, setAdditionalCases,
    handleAddRelatedCase, handleDeleteAllRelated,
    editInfoMode, setEditInfoMode,
    infoForm, setInfoForm, infoSaving, infoError,
    handleSaveInfo, handleDownloadPdf,
    isCompleted,
    addPvSpecOptions, setAddPvSpecOptions, addDsOptions,
    addPvLines, setAddPvLines, addDsLines, setAddDsLines,
    addingItems, showAddForm, setShowAddForm,
    handleAddItems,
    editTxn, setEditTxn, editForm,
    editSaving, editError, editSpecOptions,
    editAvailable, editLoadingAvail,
    openEdit, handleEditSpecChange, handleEditSerialChange, saveEdit,
    deletingId, setDeletingId, deleteLoading, confirmDelete,
    handleDeleteCase,
    autoPick, swapPicked,
    API, getAuthHeaders,
  } = useClinicalCases();


  // Auto-dismiss toast errors after 4 seconds
  useEffect(() => {
    if (!toastError) return;
    const timer = setTimeout(() => setToastError(null), 4000);
    return () => clearTimeout(timer);
  }, [toastError, setToastError]);

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
          <p style={{ color: colors.textSecondary }} className="text-sm">
            {t('p_valve.clinicalCase.caseCount', { count: cases.length })}
          </p>
          <button
            onClick={() => { resetModal(); setModalOpen(true); }}
            style={{ backgroundColor: colors.controlAccent }}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition"
          >
            {t('p_valve.clinicalCase.newCase')}
          </button>
        </div>

        {/* Click-outside overlay — layer-aware */}
        {isFlipped && (
          <div className="fixed inset-0 z-10" onClick={() => {
            if (showCompletion) {
              closeCompletionReview();
            } else {
              handleBack();
            }
          }} />
        )}

        <div className="relative z-20">
            <>
              {/* === FRONT: Case List Table === */}
              {!isFlipped && (
                <div ref={frontRef}>
                  <CaseListTable
                    cases={cases}
                    loading={loading}
                    colors={colors}
                    onCaseClick={handleCaseClick}
                  />
                </div>
              )}

              {/* === BACK: Case Detail Panel === */}
              {isFlipped && selectedCase && !showCompletion && (
                <div ref={backRef}>
                  <CaseDetailPanel
                    selectedCase={selectedCase}
                    caseDetail={caseDetail}
                    completionSummary={completionSummary}
                    loadingDetail={loadingDetail}
                    isCompleted={isCompleted}
                    colors={colors}
                    sites={sites}
                    editInfoMode={editInfoMode}
                    setEditInfoMode={setEditInfoMode}
                    infoForm={infoForm}
                    setInfoForm={setInfoForm}
                    infoSaving={infoSaving}
                    infoError={infoError}
                    handleSaveInfo={handleSaveInfo}
                    handleBack={handleBack}
                    handleDownloadPdf={handleDownloadPdf}
                    openCompletionReview={openCompletionReview}
                    setReverseModalOpen={setReverseModalOpen}
                    openEdit={openEdit}
                    deletingId={deletingId}
                    setDeletingId={setDeletingId}
                    deleteLoading={deleteLoading}
                    confirmDelete={confirmDelete}
                    showAddForm={showAddForm}
                    setShowAddForm={setShowAddForm}
                    addPvSpecOptions={addPvSpecOptions}
                    setAddPvSpecOptions={setAddPvSpecOptions}
                    addDsOptions={addDsOptions}
                    addPvLines={addPvLines}
                    setAddPvLines={setAddPvLines}
                    addDsLines={addDsLines}
                    setAddDsLines={setAddDsLines}
                    addingItems={addingItems}
                    handleAddItems={handleAddItems}
                    autoPick={autoPick}
                    swapPicked={swapPicked}
                    API={API}
                    getAuthHeaders={getAuthHeaders}
                    onDeleteCase={handleDeleteCase}
                    onAddRelatedCase={handleAddRelatedCase}
                    onDeleteAllRelated={handleDeleteAllRelated}
                    relatedCases={relatedCases}
                  />
                </div>
              )}

              {/* === LAYER 2: Completion Review Panel === */}
              {showCompletion && selectedCase && (
                <div ref={completionRef}>
                  <CompletionReviewPanel
                    selectedCase={selectedCase}
                    caseDetail={completionTxns}
                    completionItems={completionItems}
                    setCompletionItems={setCompletionItems}
                    colors={colors}
                    closeCompletionReview={closeCompletionReview}
                    setConfirmModalOpen={setConfirmModalOpen}
                  />
                </div>
              )}
            </>
        </div>
      </div>

      {/* ====== Confirm Completion Modal ====== */}
      {confirmModalOpen && (
        <ConfirmCompletionModal
          selectedCase={selectedCase}
          completionItems={completionItems}
          completing={completing}
          colors={colors}
          onClose={() => setConfirmModalOpen(false)}
          onConfirm={handleConfirmCompletion}
        />
      )}

      {/* ====== Reverse Completion Modal ====== */}
      {reverseModalOpen && (
        <ReverseCompletionModal
          selectedCase={selectedCase}
          reversing={reversing}
          colors={colors}
          onClose={() => setReverseModalOpen(false)}
          onReverse={handleReverseCompletion}
        />
      )}

      {/* ====== New Case Modal ====== */}
      {modalOpen && (
        <NewCaseModal
          colors={colors}
          sites={sites}
          caseNo={caseNo}
          setCaseNo={setCaseNo}
          siteId={siteId}
          setSiteId={setSiteId}
          patientId={patientId}
          setPatientId={setPatientId}
          caseDate={caseDate}
          setCaseDate={setCaseDate}
          caseNoDup={caseNoDup}
          error={error}
          submitting={submitting}
          additionalCases={additionalCases}
          setAdditionalCases={setAdditionalCases}
          pvSpecOptions={pvSpecOptions}
          pvLines={pvLines}
          setPvLines={setPvLines}
          dsOptions={dsOptions}
          dsLines={dsLines}
          setDsLines={setDsLines}
          autoPick={autoPick}
          onSwapPicked={swapPicked}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      {/* ====== Edit Item Modal ====== */}
      {editTxn && (
        <EditItemModal
          editTxn={editTxn}
          editForm={editForm}
          editSaving={editSaving}
          editError={editError}
          editSpecOptions={editSpecOptions}
          editAvailable={editAvailable}
          editLoadingAvail={editLoadingAvail}
          colors={colors}
          onClose={() => setEditTxn(null)}
          onSpecChange={handleEditSpecChange}
          onSerialChange={handleEditSerialChange}
          onSave={saveEdit}
        />
      )}

      {/* Toast Error — replaces native alert() */}
      {toastError && (
        <div
          style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            backgroundColor: `${colors.red}f2`, color: colors.white,
            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            animation: 'toastSlideUp 0.3s ease-out',
          }}
        >
          <span style={{ flex: 1 }}>{toastError}</span>
          <button
            onClick={() => setToastError(null)}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: colors.white,
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >
            {t('p_valve.clinicalCase.dismiss')}
          </button>
        </div>
      )}

      <style>{`
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
