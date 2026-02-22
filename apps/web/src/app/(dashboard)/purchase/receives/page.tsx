'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type ReceiveManagementItem, type ReceiveManagementDetail } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import ReceiveTable from './components/ReceiveTable';
import PurchaseTabSelector from '../components/PurchaseTabSelector';
import ReceiveDetailPanel from './components/ReceiveDetailPanel';
import EditReceiveModal from './components/EditReceiveModal';
import ReceivePendingPanel from './components/ReceivePendingPanel';

export default function ReceivingManagementPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // receiveMode: 'list' = normal list view, 'receive' = slide-in pending panel
  const [receiveMode, setReceiveMode] = useState<'list' | 'receive'>('list');
  const receiveRef = useRef<HTMLDivElement>(null);

  // Slide-over state
  const [selectedItem, setSelectedItem] = useState<ReceiveManagementItem | null>(null);
  const [itemDetail, setItemDetail] = useState<ReceiveManagementDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Edit modal
  const [editingLogisticNum, setEditingLogisticNum] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteNote, setDeleteNote] = useState('');

  // Restore
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // ═══════════ Data Fetching ═══════════

  const { data: rawList, isLoading, error, refetch } = useQuery({
    queryKey: ['receiveManagement'],
    queryFn: () => purchaseApi.getReceiveManagementList(),
    enabled: isClient,
  });

  const items: ReceiveManagementItem[] = (() => {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.filter((item) => {
      const matchSearch = !search || item.logisticNum.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !filterStatus || item.status === filterStatus;
      return matchSearch && matchStatus;
    });
  })();

  // ═══════════ Slide-over Animation (shared) ═══════════

  const slideForward = useCallback((outRef: React.RefObject<HTMLDivElement | null>, inRef: React.RefObject<HTMLDivElement | null>, onFlip: () => void) => {
    const slideOut = outRef.current
      ? outRef.current.getBoundingClientRect().right
      : window.innerWidth;

    if (outRef.current) {
      animate(outRef.current, {
        translateX: [0, -slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      onFlip();
      requestAnimationFrame(() => {
        if (inRef.current) {
          animate(inRef.current, {
            translateX: [window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  const slideBack = useCallback((outRef: React.RefObject<HTMLDivElement | null>, inRef: React.RefObject<HTMLDivElement | null>, onFlip: () => void) => {
    const slideOut = outRef.current
      ? window.innerWidth - outRef.current.getBoundingClientRect().left
      : window.innerWidth;

    if (outRef.current) {
      animate(outRef.current, {
        translateX: [0, slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      onFlip();
      requestAnimationFrame(() => {
        if (inRef.current) {
          animate(inRef.current, {
            translateX: [-window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  const handleRowClick = useCallback(async (item: ReceiveManagementItem) => {
    setSelectedItem(item);
    setItemDetail(null);
    setLoadingDetail(true);

    slideForward(frontRef, backRef, () => setIsFlipped(true));

    try {
      const detail = await purchaseApi.getReceiveManagementDetail(item.logisticNum);
      setItemDetail(detail);
    } catch {
      setItemDetail(null);
    }
    setLoadingDetail(false);
  }, [slideForward]);

  const handleBack = useCallback(() => {
    slideBack(backRef, frontRef, () => {
      setIsFlipped(false);
      setSelectedItem(null);
      setItemDetail(null);
    });
  }, [slideBack]);

  // ═══════════ Receive Mode Slide ═══════════

  const handleOpenReceive = useCallback(() => {
    slideForward(frontRef, receiveRef, () => setReceiveMode('receive'));
  }, [slideForward]);

  const handleCloseReceive = useCallback(() => {
    slideBack(receiveRef, frontRef, () => setReceiveMode('list'));
  }, [slideBack]);

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) => {
      if (!deleteNote.trim()) {
        throw new Error(t('receives.delete.noteRequired'));
      }
      return purchaseApi.deleteReceive(deleteTarget!, deleteNote.trim(), secCode || undefined);
    },
    onSuccess: () => {
      deleteSecurity.onCancel();
      setDeleteTarget(null);
      setDeleteNote('');
      queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
      handleBack();
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_receive_delete',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDelete = () => {
    if (selectedItem) {
      setDeleteTarget(selectedItem.logisticNum);
      setDeleteNote('');
      deleteSecurity.trigger();
    }
  };


  // ═══════════ Restore ═══════════

  const restoreMutation = useMutation({
    mutationFn: (secCode: string) => purchaseApi.restoreReceive(restoreTarget!, secCode || undefined),
    onSuccess: () => {
      restoreSecurity.onCancel();
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
      if (selectedItem) handleRowClick(selectedItem);
    },
    onError: () => {
      restoreSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const restoreSecurity = useSecurityAction({
    actionKey: 'btn_receive_restore',
    level: 'L3',
    onExecute: (code) => restoreMutation.mutate(code),
  });

  const handleRestore = () => {
    if (selectedItem) {
      setRestoreTarget(selectedItem.logisticNum);
      restoreSecurity.trigger();
    }
  };

  // ═══════════ Edit ═══════════

  const handleEdit = () => {
    if (selectedItem) setEditingLogisticNum(selectedItem.logisticNum);
  };

  const handleEditSuccess = () => {
    setEditingLogisticNum(null);
    queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
    if (selectedItem) handleRowClick(selectedItem);
  };

  if (!isClient) return null;

  const STATUS_OPTIONS = ['IN_TRANSIT', 'ALL_RECEIVED', 'DIFF_UNRESOLVED', 'DIFF_RESOLVED', 'DELETED'];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector */}
      {!isFlipped && receiveMode === 'list' && (
        <section className="pt-12 pb-6 px-6">
          <div className="max-w-[1400px] mx-auto">
            <PurchaseTabSelector />
          </div>
        </section>
      )}

      {/* Count Bar */}
      {!isFlipped && receiveMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('receives.table.count', { count: items.length })}
          </span>
        </section>
      )}

      {/* Filters */}
      {!isFlipped && receiveMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('receives.table.search')}
                className="w-full h-9 pl-9 pr-3 border rounded-lg text-sm focus:outline-none transition-colors"
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none appearance-none"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, minWidth: '160px' }}
            >
              <option value="">{t('receives.table.allStatuses')}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`receives.status.${s.toLowerCase()}`)}</option>
              ))}
            </select>

            {(search || filterStatus) && (
              <button
                onClick={() => { setSearch(''); setFilterStatus(''); }}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('receives.table.clearFilters')}
              </button>
            )}

            {/* 货物入库 — right-most in filter bar */}
            <button
              onClick={handleOpenReceive}
              className="ml-auto flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: colors.blue, color: '#fff' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v13m0 0l-4-4m4 4l4-4" />
              </svg>
              {t('receives.drawer.openButton')}
            </button>
          </div>
        </section>
      )}

      {/* Content */}
      <section className="max-w-[1400px] mx-auto px-6 relative">
        {isFlipped && (
          <div className="fixed inset-0 z-10" onClick={handleBack} />
        )}
        <div className="relative z-20">
          {/* FRONT: List */}
          {!isFlipped && receiveMode === 'list' && (
            <div ref={frontRef}>
              <div
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                className="rounded-xl border overflow-hidden"
              >
                <ReceiveTable
                  items={items}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                />
              </div>
            </div>
          )}

          {/* BACK: Detail */}
          {isFlipped && selectedItem && (
            <div ref={backRef}>
              <ReceiveDetailPanel
                item={selectedItem}
                detail={itemDetail}
                isLoading={loadingDetail}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onBack={handleBack}
              />
            </div>
          )}

          {/* RECEIVE: Pending Panel (slide-in like detail) */}
          {receiveMode === 'receive' && !isFlipped && (
            <div ref={receiveRef}>
              <ReceivePendingPanel
                onBack={handleCloseReceive}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
                  handleCloseReceive();
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Edit Modal */}
      {editingLogisticNum && itemDetail && (
        <EditReceiveModal
          isOpen={!!editingLogisticNum}
          logisticNum={editingLogisticNum}
          detail={itemDetail}
          onClose={() => setEditingLogisticNum(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('receives.delete.title')}
        description={t('receives.delete.securityDescription')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => { deleteSecurity.onCancel(); setDeleteTarget(null); }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />

      {/* Restore Dialog */}
      <SecurityCodeDialog
        isOpen={restoreSecurity.isOpen}
        level={restoreSecurity.level}
        title={t('receives.restore.title')}
        description={t('receives.restore.securityDescription')}
        onConfirm={restoreSecurity.onConfirm}
        onCancel={() => { restoreSecurity.onCancel(); setRestoreTarget(null); }}
        isLoading={restoreMutation.isPending}
        error={restoreSecurity.error}
      />


    </div>
  );
}
