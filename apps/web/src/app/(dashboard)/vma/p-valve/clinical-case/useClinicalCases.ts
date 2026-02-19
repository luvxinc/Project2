'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { animate } from 'animejs';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';
import type {
  ClinicalCase, CaseTransaction, Site, PickedProduct,
  SpecOption, DSOption, LineItem, CompletionItem, CompletionSummary,
} from './types';

export function useClinicalCases() {
  // ====== List State ======
  const [cases, setCases] = useState<ClinicalCase[]>([]);
  const [loading, setLoading] = useState(true);

  // ====== Toast Error (replaces native alert()) ======
  const [toastError, setToastError] = useState<string | null>(null);

  // ====== Flip / Detail State ======
  const [selectedCase, setSelectedCase] = useState<ClinicalCase | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseTransaction[]>([]);
  const [relatedCases, setRelatedCases] = useState<Array<{ caseId: string; caseNo: string | null; siteId: string; siteName?: string; patientId: string; caseDate: string; status: string }>>([]);
  const [completionSummary, setCompletionSummary] = useState<CompletionSummary | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // ====== Completion Review State (Layer 2) ======
  const completionRef = useRef<HTMLDivElement>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  // ====== New Case Modal State ======
  const [modalOpen, setModalOpen] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [caseNo, setCaseNo] = useState('');
  const [siteId, setSiteId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [caseDate, setCaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [caseNoDup, setCaseNoDup] = useState(false);
  const [additionalCases, setAdditionalCases] = useState<Array<{caseNo: string; siteId: string; patientId: string; caseDate: string}>>([]);

  // ====== Detail Panel: Edit Case Info ======
  const [editInfoMode, setEditInfoMode] = useState(false);
  const [infoForm, setInfoForm] = useState({ caseNo: '', siteId: '', patientId: '', caseDate: '', operator: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState('');

  // P-Valve lines (for New Case modal)
  const [pvSpecOptions, setPvSpecOptions] = useState<SpecOption[]>([]);
  const [pvLines, setPvLines] = useState<LineItem[]>([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);

  // DS lines (for New Case modal)
  const [dsOptions, setDsOptions] = useState<DSOption[]>([]);
  const [dsLines, setDsLines] = useState<LineItem[]>([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);

  // ====== Detail Panel: Add-Item State ======
  const [addPvSpecOptions, setAddPvSpecOptions] = useState<SpecOption[]>([]);
  const [addDsOptions, setAddDsOptions] = useState<DSOption[]>([]);
  const [addPvLines, setAddPvLines] = useState<LineItem[]>([]);
  const [addDsLines, setAddDsLines] = useState<LineItem[]>([]);
  const [addingItems, setAddingItems] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // ====== Detail Panel: Edit Item Modal ======
  const [editTxn, setEditTxn] = useState<CaseTransaction | null>(null);
  const [editForm, setEditForm] = useState({ specNo: '', serialNo: '', qty: 1, expDate: '', batchNo: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSpecOptions, setEditSpecOptions] = useState<SpecOption[]>([]);
  const [editAvailable, setEditAvailable] = useState<PickedProduct[]>([]);
  const [editLoadingAvail, setEditLoadingAvail] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ====== Fetch Cases ======
  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/vma/clinical-cases`, { headers: getAuthHeaders() });
      if (res.ok) setCases(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // ====== Fetch Sites ======
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/vma/sites`, { headers: getAuthHeaders() });
        if (res.ok) setSites(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ====== Fetch P-Valve spec options ======
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/vma/inventory-transactions/spec-options?productType=PVALVE`, { headers: getAuthHeaders() });
        if (res.ok) setPvSpecOptions(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ====== When P-Valve specs change (New Case modal), fetch compatible DS ======
  useEffect(() => {
    const activeSpecs = pvLines.filter(l => l.specNo).map(l => l.specNo);
    if (activeSpecs.length === 0) { setDsOptions([]); return; }
    (async () => {
      try {
        const res = await fetch(`${API}/vma/case-compatible-ds?specs=${activeSpecs.join(',')}`, { headers: getAuthHeaders() });
        if (res.ok) setDsOptions(await res.json());
      } catch (e) { console.error(e); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvLines.map(l => l.specNo).join(',')]);

  // ====== When add-form P-Valve specs change, fetch compatible DS ======
  useEffect(() => {
    const activeSpecs = addPvLines.filter(l => l.specNo).map(l => l.specNo);
    const existingPvSpecs = caseDetail.filter(t => t.productType === 'PVALVE').map(t => t.specNo);
    const allSpecs = [...new Set([...activeSpecs, ...existingPvSpecs])];
    if (allSpecs.length === 0) { setAddDsOptions([]); return; }
    (async () => {
      try {
        const res = await fetch(`${API}/vma/case-compatible-ds?specs=${allSpecs.join(',')}`, { headers: getAuthHeaders() });
        if (res.ok) setAddDsOptions(await res.json());
      } catch (e) { console.error(e); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPvLines.map(l => l.specNo).join(','), caseDetail.map(t => t.productType === 'PVALVE' ? t.specNo : '').join(',')]);

  // ====== Auto-pick Products ======
  const autoPick = async (
    type: 'pv' | 'ds',
    lineIndex: number,
    specNo: string,
    qty: number,
    mode: 'modal' | 'detail',
  ) => {
    if (!specNo || qty <= 0) return;
    const setLines = mode === 'modal'
      ? (type === 'pv' ? setPvLines : setDsLines)
      : (type === 'pv' ? setAddPvLines : setAddDsLines);

    setLines(prev => prev.map((l, i) => i === lineIndex ? { ...l, loading: true } : l));

    try {
      // Use the correct case date: existing case for detail mode, form value for new case modal
      const effectiveCaseDate = mode === 'detail'
        ? (selectedCase?.caseDate?.split('T')[0] || caseDate)
        : caseDate;

      const res = await fetch(`${API}/vma/case-available-products`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          specNo,
          caseDate: effectiveCaseDate,
          productType: type === 'pv' ? 'PVALVE' : 'DELIVERY_SYSTEM',
        }),
      });
      if (res.ok) {
        const allAvailable: PickedProduct[] = await res.json();

        // Exclude products already picked in OTHER rows of the same type
        const getLines = mode === 'modal'
          ? (type === 'pv' ? pvLines : dsLines)
          : (type === 'pv' ? addPvLines : addDsLines);

        let filteredAvailable: PickedProduct[];

        if (type === 'pv') {
          // P-Valve: 1 serial = 1 product, exclude entirely once picked
          const usedSerials = new Set<string>();
          getLines.forEach((l, i) => {
            if (i !== lineIndex) l.picked.forEach(p => usedSerials.add(p.serialNo));
          });
          filteredAvailable = allAvailable.filter(a => !usedSerials.has(a.serialNo));
        } else {
          // DS: 1 serial = lot (multiple units). Count consumed qty per serial across other rows
          const usedQtyMap = new Map<string, number>();
          getLines.forEach((l, i) => {
            if (i !== lineIndex) l.picked.forEach(p => {
              usedQtyMap.set(p.serialNo, (usedQtyMap.get(p.serialNo) ?? 0) + (p.qty || 1));
            });
          });
          // For each available entry, subtract already-consumed units
          filteredAvailable = [];
          const consumedSoFar = new Map<string, number>();
          for (const a of allAvailable) {
            const totalUsed = usedQtyMap.get(a.serialNo) ?? 0;
            const consumed = consumedSoFar.get(a.serialNo) ?? 0;
            // How many of this serial's entries to skip = totalUsed
            if (consumed < totalUsed) {
              consumedSoFar.set(a.serialNo, consumed + 1);
              // skip this entry — it's consumed by another row
            } else {
              filteredAvailable.push(a);
            }
          }
        }

        const picked = filteredAvailable.slice(0, qty);
        setLines(prev => prev.map((l, i) => i === lineIndex ? { ...l, picked, available: filteredAvailable, loading: false } : l));
      } else {
        setLines(prev => prev.map((l, i) => i === lineIndex ? { ...l, loading: false } : l));
      }
    } catch {
      setLines(prev => prev.map((l, i) => i === lineIndex ? { ...l, loading: false } : l));
    }
  };

  // ====== Swap a picked product with another from available ======
  const swapPicked = (
    type: 'pv' | 'ds',
    lineIndex: number,
    pickedIndex: number,
    newProduct: PickedProduct,
    mode: 'modal' | 'detail',
  ) => {
    const setLines = mode === 'modal'
      ? (type === 'pv' ? setPvLines : setDsLines)
      : (type === 'pv' ? setAddPvLines : setAddDsLines);

    setLines(prev => prev.map((l, i) => {
      if (i !== lineIndex) return l;
      const newPicked = [...l.picked];
      newPicked[pickedIndex] = newProduct;
      return { ...l, picked: newPicked };
    }));
  };

  // ====== Flip Animation: Open Detail ======
  const handleCaseClick = useCallback(async (c: ClinicalCase) => {
    setSelectedCase(c);
    setLoadingDetail(true);
    setShowAddForm(false);
    setAddPvLines([]);
    setAddDsLines([]);

    if (frontRef.current) {
      animate(frontRef.current, {
        translateX: [0, -window.innerWidth],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(true);
      requestAnimationFrame(() => {
        if (backRef.current) {
          animate(backRef.current, {
            translateX: [window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);

    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(c.caseId)}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCaseDetail(data.transactions || []);
        setRelatedCases(data.relatedCases || []);
        setCompletionSummary(data.completionSummary || null);
      }
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
  }, []);

  // ====== Flip Animation: Back (Detail → List) ======
  const handleBack = useCallback(() => {
    setShowCompletion(false);
    setCompletionItems([]);

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, window.innerWidth],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(false);
      setSelectedCase(null);
      setCaseDetail([]);
      setRelatedCases([]);
      setEditTxn(null);
      setEditInfoMode(false);
      fetchCases();
      requestAnimationFrame(() => {
        if (frontRef.current) {
          animate(frontRef.current, {
            translateX: [-window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, [fetchCases]);

  // ====== Refresh Case Detail ======
  const refreshDetail = async (caseId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(caseId)}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCaseDetail(data.transactions || []);
        setRelatedCases(data.relatedCases || []);
        setCompletionSummary(data.completionSummary || null);
      }
    } catch (e) { console.error(e); }
  };

  // ====== Edit Item ======
  const fetchEditAvailable = async (specNo: string, productType: string, currentSerial?: string) => {
    if (!selectedCase || !specNo) { setEditAvailable([]); return; }
    setEditLoadingAvail(true);
    try {
      const res = await fetch(`${API}/vma/case-available-products`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ specNo, caseDate: selectedCase.caseDate.split('T')[0], productType }),
      });
      if (res.ok) {
        const avail: PickedProduct[] = await res.json();
        if (currentSerial && !avail.some(a => a.serialNo === currentSerial)) {
          avail.unshift({ serialNo: currentSerial, specNo, expDate: '', batchNo: '', qty: 1 });
        }
        setEditAvailable(avail);
      }
    } catch (e) { console.error(e); }
    setEditLoadingAvail(false);
  };

  const openEdit = async (txn: CaseTransaction) => {
    setEditTxn(txn);
    setEditForm({
      specNo: txn.specNo,
      serialNo: txn.serialNo || '',
      qty: txn.qty,
      expDate: txn.expDate?.split('T')[0] || '',
      batchNo: txn.batchNo || '',
    });
    setEditError('');
    try {
      const res = await fetch(`${API}/vma/inventory-transactions/spec-options?productType=${txn.productType}`, { headers: getAuthHeaders() });
      if (res.ok) setEditSpecOptions(await res.json());
    } catch (e) { console.error(e); }
    fetchEditAvailable(txn.specNo, txn.productType, txn.serialNo || undefined);
  };

  const handleEditSpecChange = (newSpec: string) => {
    if (!editTxn) return;
    setEditForm(p => ({ ...p, specNo: newSpec, serialNo: '', expDate: '', batchNo: '' }));
    fetchEditAvailable(newSpec, editTxn.productType);
  };

  const handleEditSerialChange = (serialNo: string) => {
    const prod = editAvailable.find(a => a.serialNo === serialNo);
    if (prod) {
      setEditForm(p => ({
        ...p,
        serialNo: prod.serialNo,
        expDate: prod.expDate || p.expDate,
        batchNo: prod.batchNo || p.batchNo,
      }));
    } else {
      setEditForm(p => ({ ...p, serialNo }));
    }
  };

  const saveEdit = async () => {
    if (!editTxn || !selectedCase) return;
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
    } catch (e) { console.error(e); }
    setDeleteLoading(false);
  };

  // ====== Delete Entire Case ======
  const handleDeleteCase = async (caseId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(caseId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchCases();
        return true;
      } else {
        const err = await res.json().catch(() => null);
        setToastError(err?.detail || 'Failed to delete case');
        return false;
      }
    } catch (e) {
      console.error(e);
      setToastError('Network error');
      return false;
    }
  };

  // ====== Add Items to Case ======
  const handleAddItems = async () => {
    if (!selectedCase) return;
    const items: Array<{ productType: string; specNo: string; serialNo: string; qty: number; expDate: string; batchNo: string }> = [];
    for (const line of addPvLines) {
      for (const p of line.picked) {
        items.push({ productType: 'PVALVE', specNo: p.specNo, serialNo: p.serialNo, qty: p.qty, expDate: p.expDate, batchNo: p.batchNo });
      }
    }
    for (const line of addDsLines) {
      for (const p of line.picked) {
        items.push({ productType: 'DELIVERY_SYSTEM', specNo: p.specNo, serialNo: p.serialNo, qty: p.qty, expDate: p.expDate, batchNo: p.batchNo });
      }
    }
    if (items.length === 0) return;

    setAddingItems(true);
    try {
      for (const item of items) {
        await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/items`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(item),
        });
      }
      setShowAddForm(false);
      setAddPvLines([]);
      setAddDsLines([]);
      refreshDetail(selectedCase.caseId);
    } catch (e) { console.error(e); }
    setAddingItems(false);
  };

  // ====== Download PDF ======
  const handleDownloadPdf = async () => {
    if (!selectedCase) return;
    try {
      const headers = getAuthHeaders();
      // Remove Content-Type for download requests (not sending JSON body)
      delete headers['Content-Type'];
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/pdf`, {
        headers,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="?([^"]+)"?/);
        a.download = m ? m[1] : `PackingList_${selectedCase.caseId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (e) { console.error(e); }
  };

  // ====== Check caseNo uniqueness (debounced) ======
  useEffect(() => {
    if (!caseNo) { setCaseNoDup(false); return; }
    const timer = setTimeout(async () => {
      const existing = cases.find(c => c.caseNo === caseNo);
      setCaseNoDup(!!existing);
    }, 200);
    return () => clearTimeout(timer);
  }, [caseNo, cases]);

  // ====== Save Case Info (detail panel) ======
  const handleSaveInfo = async () => {
    if (!selectedCase) return;
    setInfoSaving(true);
    setInfoError('');
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(infoForm),
      });
      if (res.ok) {
        setEditInfoMode(false);
        setSelectedCase(prev => prev ? { ...prev, ...infoForm } : prev);
        fetchCases();
      } else {
        const data = await res.json().catch(() => null);
        setInfoError(data?.message || 'Failed to save');
      }
    } catch (e: unknown) {
      setInfoError(e instanceof Error ? e.message : 'Network error');
    }
    setInfoSaving(false);
  };

  // ====== Open Completion Review (slide in Layer 2) ======
  const openCompletionReview = () => {
    setCompletionItems(caseDetail.map(txn => ({
      txnId: txn.id,
      returned: false,
      accepted: true,
      returnCondition: [],
    })));

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, -window.innerWidth],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setShowCompletion(true);
      requestAnimationFrame(() => {
        if (completionRef.current) {
          animate(completionRef.current, {
            translateX: [window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  };

  // ====== Close Completion Review (slide back to detail) ======
  const closeCompletionReview = () => {
    if (completionRef.current) {
      animate(completionRef.current, {
        translateX: [0, window.innerWidth],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setShowCompletion(false);
      setCompletionItems([]);
      requestAnimationFrame(() => {
        if (backRef.current) {
          animate(backRef.current, {
            translateX: [-window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  };

  // ====== Confirm Completion ======
  const handleConfirmCompletion = async () => {
    if (!selectedCase) return;
    setCompleting(true);
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/complete`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ items: completionItems }),
      });
      if (res.ok) {
        setConfirmModalOpen(false);
        setShowCompletion(false);
        setCompletionItems([]);
        setSelectedCase(prev => prev ? { ...prev, status: 'COMPLETED' } : prev);
        refreshDetail(selectedCase.caseId);
        fetchCases();
      } else {
        const data = await res.json().catch(() => null);
        setToastError(data?.message || 'Failed to complete case');
      }
    } catch (e: unknown) {
      setToastError(e instanceof Error ? e.message : 'Network error');
    }
    setCompleting(false);
  };

  // ====== Reverse Completion ======
  const handleReverseCompletion = async () => {
    if (!selectedCase) return;
    setReversing(true);
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${encodeURIComponent(selectedCase.caseId)}/reverse`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setReverseModalOpen(false);
        setSelectedCase(prev => prev ? { ...prev, status: 'IN_PROGRESS' } : prev);
        refreshDetail(selectedCase.caseId);
        fetchCases();
      } else {
        const data = await res.json().catch(() => null);
        setToastError(data?.message || 'Failed to reverse');
      }
    } catch (e: unknown) {
      setToastError(e instanceof Error ? e.message : 'Network error');
    }
    setReversing(false);
  };

  // ====== Submit New Case ======
  const handleSubmit = async () => {
    setError('');
    if (!siteId) { setError('Please select a site'); return; }
    if (!patientId || patientId.length !== 3) { setError('Patient ID must be 3 digits'); return; }
    if (!caseDate) { setError('Please select a case date'); return; }
    if (caseNo && caseNoDup) { setError('Case # already exists'); return; }
    if (caseNo && !/^\d+[A-Za-z]?$/.test(caseNo)) { setError('Case # must be digits + optional letter (e.g. 123 or 123A)'); return; }

    const items: Array<{ productType: string; specNo: string; serialNo: string; qty: number; expDate: string; batchNo: string }> = [];
    for (const line of pvLines) {
      for (const p of line.picked) {
        items.push({ productType: 'PVALVE', specNo: p.specNo, serialNo: p.serialNo, qty: p.qty, expDate: p.expDate, batchNo: p.batchNo });
      }
    }
    for (const line of dsLines) {
      for (const p of line.picked) {
        items.push({ productType: 'DELIVERY_SYSTEM', specNo: p.specNo, serialNo: p.serialNo, qty: p.qty, expDate: p.expDate, batchNo: p.batchNo });
      }
    }

    if (items.length === 0) { setError('Please select at least one product'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/vma/clinical-cases`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          caseNo: caseNo || undefined, siteId, patientId, caseDate, items,
          additionalCases: additionalCases.filter(c => c.siteId && c.patientId.length === 3 && c.caseDate).map(c => ({
            caseNo: c.caseNo || undefined, siteId: c.siteId, patientId: c.patientId, caseDate: c.caseDate,
          })),
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="?([^"]+)"?/);
        a.download = m ? m[1] : `PackingList_UVP-${siteId}-${patientId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setModalOpen(false);
        resetModal();
        fetchCases();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Failed to create case');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setSubmitting(false);
  };

  const resetModal = () => {
    setCaseNo('');
    setSiteId('');
    setPatientId('');
    setCaseDate(new Date().toISOString().split('T')[0]);
    setPvLines([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
    setDsLines([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
    setError('');
    setCaseNoDup(false);
    setAdditionalCases([]);
  };

  // ====== Related Cases (Trip) ======
  const handleAddRelatedCase = async (sourceCaseId: string, dto: { caseNo?: string; siteId: string; patientId: string; caseDate: string }) => {
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${sourceCaseId}/related-case`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.ok) {
        fetchCases();
        if (selectedCase) handleCaseClick(selectedCase);
        return true;
      } else {
        const data = await res.json().catch(() => null);
        setToastError(data?.message || 'Failed to add related case');
        return false;
      }
    } catch (e: unknown) {
      setToastError(e instanceof Error ? e.message : 'Network error');
      return false;
    }
  };

  const handleDeleteAllRelated = async (caseId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-cases/${caseId}/related-cases`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (res.ok) {
        handleBack();
        fetchCases();
        return true;
      } else {
        const data = await res.json().catch(() => null);
        setToastError(data?.message || 'Failed to delete related cases');
        return false;
      }
    } catch (e: unknown) {
      setToastError(e instanceof Error ? e.message : 'Network error');
      return false;
    }
  };

  const isCompleted = selectedCase?.status === 'COMPLETED';

  return {
    // Toast
    toastError, setToastError,
    // List
    cases, loading,
    // Flip / Detail
    selectedCase, caseDetail, relatedCases, completionSummary, loadingDetail, isFlipped,
    frontRef, backRef, completionRef,
    handleCaseClick, handleBack,
    // Completion Review
    showCompletion, completionItems, setCompletionItems,
    confirmModalOpen, setConfirmModalOpen,
    completing, reverseModalOpen, setReverseModalOpen, reversing,
    openCompletionReview, closeCompletionReview,
    handleConfirmCompletion, handleReverseCompletion,
    // New Case Modal
    modalOpen, setModalOpen, sites,
    caseNo, setCaseNo, siteId, setSiteId,
    patientId, setPatientId, caseDate, setCaseDate,
    submitting, error, setError, caseNoDup,
    pvSpecOptions, pvLines, setPvLines,
    dsOptions, dsLines, setDsLines,
    handleSubmit, resetModal,
    additionalCases, setAdditionalCases,
    handleAddRelatedCase, handleDeleteAllRelated,
    // Detail Panel
    editInfoMode, setEditInfoMode,
    infoForm, setInfoForm, infoSaving, infoError,
    handleSaveInfo, handleDownloadPdf,
    isCompleted,
    // Add Items
    addPvSpecOptions, setAddPvSpecOptions, addDsOptions,
    addPvLines, setAddPvLines, addDsLines, setAddDsLines,
    addingItems, showAddForm, setShowAddForm,
    handleAddItems,
    // Edit Item
    editTxn, setEditTxn, editForm,
    editSaving, editError, editSpecOptions,
    editAvailable, editLoadingAvail,
    openEdit, handleEditSpecChange, handleEditSerialChange, saveEdit,
    // Delete
    deletingId, setDeletingId, deleteLoading, confirmDelete,
    handleDeleteCase,
    // Auto pick & swap
    autoPick, swapPicked,
    // API helper (for inline fetch in Add button)
    API, getAuthHeaders,
  };
}
