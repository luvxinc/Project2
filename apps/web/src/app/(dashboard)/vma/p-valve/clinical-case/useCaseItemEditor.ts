'use client';

import { useState } from 'react';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';
import type { ClinicalCase, CaseTransaction, PickedProduct, SpecOption } from './types';

interface UseCaseItemEditorParams {
  selectedCase: ClinicalCase | null;
  refreshDetail: (caseId: string) => Promise<void>;
  setToastError: (msg: string | null) => void;
}

export function useCaseItemEditor({
  selectedCase,
  refreshDetail,
  setToastError,
}: UseCaseItemEditorParams) {
  const [editTxn, setEditTxn] = useState<CaseTransaction | null>(null);
  const [editForm, setEditForm] = useState({ specNo: '', serialNo: '', qty: 1, expDate: '', batchNo: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSpecOptions, setEditSpecOptions] = useState<SpecOption[]>([]);
  const [editAvailable, setEditAvailable] = useState<PickedProduct[]>([]);
  const [editLoadingAvail, setEditLoadingAvail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ====== Fetch available products for edit ======
  const fetchEditAvailable = async (specNo: string, productType: string, currentSerial?: string) => {
    if (!selectedCase || !specNo) { setEditAvailable([]); return; }
    setEditLoadingAvail(true);
    try {
      const res = await fetch(`${API}/vma/case-available-products`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          specNo,
          caseDate: selectedCase.caseDate?.split('T')[0],
          productType,
        }),
      });
      if (res.ok) {
        const all: PickedProduct[] = await res.json();
        // Include the currently assigned serial so user can keep it
        if (currentSerial && !all.find(a => a.serialNo === currentSerial)) {
          all.unshift({ serialNo: currentSerial, specNo, expDate: '', batchNo: '', qty: 1 });
        }
        setEditAvailable(all);
      }
    } catch { /* non-critical */ }
    setEditLoadingAvail(false);
  };

  // ====== Open Edit Modal ======
  const openEdit = (txn: CaseTransaction) => {
    setEditTxn(txn);
    setEditForm({
      specNo: txn.specNo,
      serialNo: txn.serialNo || '',
      qty: txn.qty,
      expDate: txn.expDate || '',
      batchNo: txn.batchNo || '',
    });
    setEditError('');
    // Load spec options
    (async () => {
      try {
        const res = await fetch(`${API}/vma/inventory-transactions/spec-options?productType=${txn.productType}`, { headers: getAuthHeaders() });
        if (res.ok) setEditSpecOptions(await res.json());
      } catch { /* non-critical */ }
    })();
    fetchEditAvailable(txn.specNo, txn.productType, txn.serialNo || undefined);
  };

  // ====== Handle Edit Spec Change ======
  const handleEditSpecChange = (specNo: string) => {
    setEditForm(prev => ({ ...prev, specNo, serialNo: '' }));
    if (editTxn) fetchEditAvailable(specNo, editTxn.productType);
  };

  // ====== Handle Edit Serial Change ======
  const handleEditSerialChange = (serialNo: string) => {
    const matched = editAvailable.find(a => a.serialNo === serialNo);
    setEditForm(prev => ({
      ...prev,
      serialNo,
      expDate: matched?.expDate || prev.expDate,
      batchNo: matched?.batchNo || prev.batchNo,
    }));
  };

  // ====== Save Edit ======
  const saveEdit = async () => {
    if (!selectedCase || !editTxn) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/items/${editTxn.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditTxn(null);
        refreshDetail(selectedCase.caseId);
      } else {
        const data = await res.json().catch(() => null);
        setEditError(data?.message || 'Failed to update');
      }
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Network error');
    }
    setEditSaving(false);
  };

  // ====== Delete Item ======
  const confirmDelete = async (txnId: string) => {
    if (!selectedCase) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/items/${txnId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeletingId(null);
        refreshDetail(selectedCase.caseId);
      }
    } catch { setToastError('Network error deleting item'); }
    setDeleteLoading(false);
  };

  return {
    editTxn, setEditTxn, editForm,
    editSaving, editError, editSpecOptions,
    editAvailable, editLoadingAvail,
    openEdit, handleEditSpecChange, handleEditSerialChange, saveEdit,
    deletingId, setDeletingId, deleteLoading, confirmDelete,
  };
}
