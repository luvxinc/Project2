'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  abnormalApi,
  type AbnormalListItem,
  type AbnormalDetail,
  type AbnormalHistoryItem,
  type PoMethodStrategy,
} from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import AbnormalTable from './components/AbnormalTable';
import AbnormalDetailPanel from './components/AbnormalDetailPanel';
import ProcessWizard from './components/ProcessWizard';

export default function AbnormalPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Slide-over state
  const [selectedItem, setSelectedItem] = useState<AbnormalListItem | null>(null);
  const [detail, setDetail] = useState<AbnormalDetail | null>(null);
  const [historyItems, setHistoryItems] = useState<AbnormalHistoryItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Process wizard state
  const [showProcessWizard, setShowProcessWizard] = useState(false);
  const [pendingProcess, setPendingProcess] = useState<{
    poMethods: Record<string, PoMethodStrategy>; note: string; delayDate?: string;
  } | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  // ═══════════ Data Fetching ═══════════

  const { data: rawList, isLoading, error, refetch } = useQuery({
    queryKey: ['abnormalList', sortOrder],
    queryFn: () => abnormalApi.getList({ sortOrder }),
    enabled: isClient,
  });

  const items: AbnormalListItem[] = (() => {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.filter((item) => {
      const matchSearch = !search || item.logisticNum.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !filterStatus || item.status === filterStatus;
      return matchSearch && matchStatus;
    });
  })();

  // ═══════════ Slide-over Animation ═══════════

  const handleRowClick = useCallback(async (item: AbnormalListItem) => {
    setSelectedItem(item);
    setDetail(null);
    setHistoryItems([]);
    setLoadingDetail(true);
    setShowProcessWizard(false);

    const slideOut = frontRef.current
      ? frontRef.current.getBoundingClientRect().right
      : window.innerWidth;

    if (frontRef.current) {
      animate(frontRef.current, {
        translateX: [0, -slideOut],
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
      const [d, h] = await Promise.all([
        abnormalApi.getDetail(item.logisticNum),
        abnormalApi.getHistory(item.logisticNum),
      ]);
      setDetail(d);
      setHistoryItems(Array.isArray(h) ? h : []);
    } catch {
      setDetail(null);
      setHistoryItems([]);
    }
    setLoadingDetail(false);
  }, []);

  const handleBack = useCallback(() => {
    const slideOut = backRef.current
      ? window.innerWidth - backRef.current.getBoundingClientRect().left
      : window.innerWidth;

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(false);
      setSelectedItem(null);
      setDetail(null);
      setHistoryItems([]);
      setShowProcessWizard(false);
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
  }, []);

  // ========== Process ==========

  const processMutation = useMutation({
    mutationFn: (secCode: string) =>
      abnormalApi.process({
        logisticNum: selectedItem!.logisticNum,
        note: pendingProcess?.note || undefined,
        delayDate: pendingProcess?.delayDate,
        poMethods: pendingProcess!.poMethods,
        sec_code_l3: secCode || undefined,
      }),
    onSuccess: () => {
      processSecurity.onCancel();
      setShowProcessWizard(false);
      setPendingProcess(null);
      queryClient.invalidateQueries({ queryKey: ['abnormalList'] });
      if (selectedItem) handleRowClick(selectedItem);
    },
    onError: () => {
      processSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const processSecurity = useSecurityAction({
    actionKey: 'btn_abnormal_process',
    level: 'L3',
    onExecute: (code) => processMutation.mutate(code),
  });

  const handleProcess = () => {
    setShowProcessWizard(true);
  };

  const handleProcessConfirm = (
    poMethods: Record<string, PoMethodStrategy>,
    note: string,
    delayDate?: string,
  ) => {
    setPendingProcess({ poMethods, note, delayDate });
    processSecurity.trigger();
  };

  // ========== Delete ==========

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      abnormalApi.delete({
        logisticNum: selectedItem!.logisticNum,
        sec_code_l3: secCode || undefined,
      }),
    onSuccess: () => {
      deleteSecurity.onCancel();
      queryClient.invalidateQueries({ queryKey: ['abnormalList'] });
      handleBack();
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_abnormal_delete',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDelete = () => {
    deleteSecurity.trigger();
  };

  if (!isClient) return null;

  const STATUS_OPTIONS = ['pending', 'resolved', 'deleted'];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Header */}
      <section className="max-w-[1400px] mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 style={{ color: colors.text }} className="text-2xl font-semibold tracking-tight">
            {t('abnormal.title')}
          </h1>
        </div>
        {!isFlipped && (
          <>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {t('abnormal.description')}
            </p>
            <div className="mt-3">
              <span style={{ color: colors.textTertiary }} className="text-sm">
                {t('abnormal.totalRecords', { count: items.length })}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Filters */}
      {!isFlipped && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('abnormal.logisticNum') + '...'}
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
              <option value="">{t('abnormal.filterAll')}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`abnormal.status${s.charAt(0).toUpperCase() + s.slice(1)}` as 'abnormal.statusPending')}</option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none appearance-none"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, minWidth: '200px' }}
            >
              <option value="desc">{t('abnormal.sortNewest')}</option>
              <option value="asc">{t('abnormal.sortOldest')}</option>
            </select>

            {(search || filterStatus) && (
              <button
                onClick={() => { setSearch(''); setFilterStatus(''); }}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('abnormal.clearFilters')}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Content */}
      <section className="max-w-[1400px] mx-auto px-6 relative">
        {isFlipped && <div className="fixed inset-0 z-10" onClick={handleBack} />}
        <div className="relative z-20">
          {/* FRONT: List */}
          {!isFlipped && (
            <div ref={frontRef}>
              <div
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                className="rounded-xl border overflow-hidden"
              >
                <AbnormalTable
                  items={items}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                />
              </div>
            </div>
          )}

          {/* BACK: Detail or ProcessWizard */}
          {isFlipped && selectedItem && (
            <div ref={backRef}>
              {showProcessWizard && detail ? (
                <div>
                  {/* Back to detail */}
                  <button
                    onClick={() => setShowProcessWizard(false)}
                    className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70 mb-6"
                    style={{ color: colors.blue }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {t('abnormal.detail.back')}
                  </button>
                  <ProcessWizard
                    detail={detail}
                    onConfirm={handleProcessConfirm}
                    onCancel={() => setShowProcessWizard(false)}
                    isSubmitting={processMutation.isPending}
                  />
                </div>
              ) : (
                <AbnormalDetailPanel
                  item={selectedItem}
                  detail={detail}
                  historyItems={historyItems}
                  isLoading={loadingDetail}
                  onBack={handleBack}
                  onProcess={handleProcess}
                  onDelete={handleDelete}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* Process Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={processSecurity.isOpen}
        level={processSecurity.level}
        title={t('abnormal.processAbnormal')}
        description={t('abnormal.process.description')}
        onConfirm={processSecurity.onConfirm}
        onCancel={processSecurity.onCancel}
        isLoading={processMutation.isPending}
        error={processSecurity.error}
      />

      {/* Delete Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('abnormal.deleteRecord')}
        description={t('abnormal.process.deleteConfirm')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={deleteSecurity.onCancel}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />
    </div>
  );
}
