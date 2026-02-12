'use client';

import { useEffect } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
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

  const hook = useClinicalCases();

  // Auto-dismiss toast errors after 4 seconds
  useEffect(() => {
    if (!hook.toastError) return;
    const timer = setTimeout(() => hook.setToastError(null), 4000);
    return () => clearTimeout(timer);
  }, [hook.toastError]);

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
            {hook.cases.length} clinical case{hook.cases.length !== 1 ? 's' : ''} recorded
          </p>
          <button
            onClick={() => { hook.resetModal(); hook.setModalOpen(true); }}
            style={{ backgroundColor: colors.controlAccent }}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition"
          >
            + New Case
          </button>
        </div>

        {/* Click-outside overlay — layer-aware */}
        {hook.isFlipped && (
          <div className="fixed inset-0 z-10" onClick={() => {
            if (hook.showCompletion) {
              hook.closeCompletionReview();
            } else {
              hook.handleBack();
            }
          }} />
        )}

        <div className="relative z-20">
          {/* === FRONT: Case List Table === */}
          {!hook.isFlipped && (
            <div ref={hook.frontRef}>
              <CaseListTable
                cases={hook.cases}
                loading={hook.loading}
                colors={colors}
                onCaseClick={hook.handleCaseClick}
              />
            </div>
          )}

          {/* === BACK: Case Detail Panel === */}
          {hook.isFlipped && hook.selectedCase && !hook.showCompletion && (
            <div ref={hook.backRef}>
              <CaseDetailPanel
                selectedCase={hook.selectedCase}
                caseDetail={hook.caseDetail}
                loadingDetail={hook.loadingDetail}
                isCompleted={hook.isCompleted}
                colors={colors}
                sites={hook.sites}
                editInfoMode={hook.editInfoMode}
                setEditInfoMode={hook.setEditInfoMode}
                infoForm={hook.infoForm}
                setInfoForm={hook.setInfoForm}
                infoSaving={hook.infoSaving}
                infoError={hook.infoError}
                handleSaveInfo={hook.handleSaveInfo}
                handleBack={hook.handleBack}
                handleDownloadPdf={hook.handleDownloadPdf}
                openCompletionReview={hook.openCompletionReview}
                setReverseModalOpen={hook.setReverseModalOpen}
                openEdit={hook.openEdit}
                deletingId={hook.deletingId}
                setDeletingId={hook.setDeletingId}
                deleteLoading={hook.deleteLoading}
                confirmDelete={hook.confirmDelete}
                showAddForm={hook.showAddForm}
                setShowAddForm={hook.setShowAddForm}
                addPvSpecOptions={hook.addPvSpecOptions}
                setAddPvSpecOptions={hook.setAddPvSpecOptions}
                addDsOptions={hook.addDsOptions}
                addPvLines={hook.addPvLines}
                setAddPvLines={hook.setAddPvLines}
                addDsLines={hook.addDsLines}
                setAddDsLines={hook.setAddDsLines}
                addingItems={hook.addingItems}
                handleAddItems={hook.handleAddItems}
                autoPick={hook.autoPick}
                API={hook.API}
                getAuthHeaders={hook.getAuthHeaders}
              />
            </div>
          )}

          {/* === LAYER 2: Completion Review Panel === */}
          {hook.showCompletion && hook.selectedCase && (
            <div ref={hook.completionRef}>
              <CompletionReviewPanel
                selectedCase={hook.selectedCase}
                caseDetail={hook.caseDetail}
                completionItems={hook.completionItems}
                setCompletionItems={hook.setCompletionItems}
                colors={colors}
                closeCompletionReview={hook.closeCompletionReview}
                setConfirmModalOpen={hook.setConfirmModalOpen}
              />
            </div>
          )}
        </div>
      </div>

      {/* ====== Confirm Completion Modal ====== */}
      {hook.confirmModalOpen && (
        <ConfirmCompletionModal
          selectedCase={hook.selectedCase}
          completionItems={hook.completionItems}
          completing={hook.completing}
          colors={colors}
          onClose={() => hook.setConfirmModalOpen(false)}
          onConfirm={hook.handleConfirmCompletion}
        />
      )}

      {/* ====== Reverse Completion Modal ====== */}
      {hook.reverseModalOpen && (
        <ReverseCompletionModal
          selectedCase={hook.selectedCase}
          reversing={hook.reversing}
          colors={colors}
          onClose={() => hook.setReverseModalOpen(false)}
          onReverse={hook.handleReverseCompletion}
        />
      )}

      {/* ====== New Case Modal ====== */}
      {hook.modalOpen && (
        <NewCaseModal
          colors={colors}
          sites={hook.sites}
          caseNo={hook.caseNo}
          setCaseNo={hook.setCaseNo}
          siteId={hook.siteId}
          setSiteId={hook.setSiteId}
          patientId={hook.patientId}
          setPatientId={hook.setPatientId}
          caseDate={hook.caseDate}
          setCaseDate={hook.setCaseDate}
          caseNoDup={hook.caseNoDup}
          error={hook.error}
          submitting={hook.submitting}
          pvSpecOptions={hook.pvSpecOptions}
          pvLines={hook.pvLines}
          setPvLines={hook.setPvLines}
          dsOptions={hook.dsOptions}
          dsLines={hook.dsLines}
          setDsLines={hook.setDsLines}
          autoPick={hook.autoPick}
          onClose={() => hook.setModalOpen(false)}
          onSubmit={hook.handleSubmit}
        />
      )}

      {/* ====== Edit Item Modal ====== */}
      {hook.editTxn && (
        <EditItemModal
          editTxn={hook.editTxn}
          editForm={hook.editForm}
          editSaving={hook.editSaving}
          editError={hook.editError}
          editSpecOptions={hook.editSpecOptions}
          editAvailable={hook.editAvailable}
          editLoadingAvail={hook.editLoadingAvail}
          colors={colors}
          onClose={() => hook.setEditTxn(null)}
          onSpecChange={hook.handleEditSpecChange}
          onSerialChange={hook.handleEditSerialChange}
          onSave={hook.saveEdit}
        />
      )}

      {/* Toast Error — replaces native alert() */}
      {hook.toastError && (
        <div
          style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            backgroundColor: 'rgba(220, 38, 38, 0.95)', color: '#fff',
            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            animation: 'toastSlideUp 0.3s ease-out',
          }}
        >
          <span style={{ flex: 1 }}>{hook.toastError}</span>
          <button
            onClick={() => hook.setToastError(null)}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Dismiss
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
