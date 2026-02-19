'use client';

import { useState, useRef, useCallback, type RefObject } from 'react';
import { animate } from 'animejs';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';
import type { ClinicalCase, CaseTransaction, CompletionItem, CompletionSummary } from './types';

interface UseCaseCompletionParams {
  selectedCase: ClinicalCase | null;
  caseDetail: CaseTransaction[];
  usedItems: Array<{ specNo: string; serialNo: string; caseId: string }>;
  backRef: RefObject<HTMLDivElement | null>;
  refreshDetail: (caseId: string) => Promise<void>;
  fetchCases: () => Promise<void>;
  setToastError: (msg: string | null) => void;
  setSelectedCase: React.Dispatch<React.SetStateAction<ClinicalCase | null>>;
}

export function useCaseCompletion({
  selectedCase,
  caseDetail,
  usedItems,
  backRef,
  refreshDetail,
  fetchCases,
  setToastError,
  setSelectedCase,
}: UseCaseCompletionParams) {
  const completionRef = useRef<HTMLDivElement>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [completionTxns, setCompletionTxns] = useState<CaseTransaction[]>([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  // ====== Open Completion Review (slide in Layer 2) ======
  const openCompletionReview = useCallback(() => {
    const isTrip = !!selectedCase?.tripId;

    let available: typeof caseDetail;
    if (isTrip && usedItems.length > 0) {
      const usedCounts = new Map<string, number>();
      for (const u of usedItems) {
        const key = `${u.specNo}|${u.serialNo}`;
        usedCounts.set(key, (usedCounts.get(key) || 0) + 1);
      }
      const consumed = new Map<string, number>();
      available = caseDetail.filter(txn => {
        const key = `${txn.specNo}|${txn.serialNo}`;
        const usedQty = usedCounts.get(key) || 0;
        const alreadyConsumed = consumed.get(key) || 0;
        if (alreadyConsumed < usedQty) {
          consumed.set(key, alreadyConsumed + 1);
          return false;
        }
        return true;
      });
    } else {
      available = caseDetail;
    }

    setCompletionTxns(available);
    setCompletionItems(available.map(txn => ({
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
  }, [selectedCase, caseDetail, usedItems, backRef]);

  // ====== Close Completion Review ======
  const closeCompletionReview = useCallback(() => {
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
  }, [backRef]);

  // ====== Confirm Completion ======
  const handleConfirmCompletion = useCallback(async () => {
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
  }, [selectedCase, completionItems, refreshDetail, fetchCases, setToastError, setSelectedCase]);

  // ====== Reverse Completion ======
  const handleReverseCompletion = useCallback(async () => {
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
  }, [selectedCase, refreshDetail, fetchCases, setToastError, setSelectedCase]);

  return {
    completionRef,
    showCompletion, completionItems, completionTxns, setCompletionItems,
    confirmModalOpen, setConfirmModalOpen,
    completing, reverseModalOpen, setReverseModalOpen, reversing,
    openCompletionReview, closeCompletionReview,
    handleConfirmCompletion, handleReverseCompletion,
  };
}
