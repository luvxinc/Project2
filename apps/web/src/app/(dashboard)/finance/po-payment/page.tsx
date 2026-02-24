'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi, type POPaymentListItem } from '@/lib/api/finance';
import { purchaseApi, type PurchaseOrder } from '@/lib/api/purchase';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import POPaymentTable from './components/POPaymentTable';
import POPaymentDetailPanel from './components/POPaymentDetailPanel';
import PaymentDialog from './components/PaymentDialog';
import PODetailPanel from './components/PODetailPanel';
import FinanceTabSelector from '../components/FinanceTabSelector';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

/**
 * Group paid PO payment items by their payment number (pmtNo from paymentDetails).
 */
export interface POPaymentGroup {
  pmtNo: string;
  paymentDate: string;
  supplierCode: string;
  supplierName: string;
  items: POPaymentListItem[];
  totalAmountUsd: number;
  totalPoPaidUsd: number;
  totalDepositPaidUsd: number;
  totalExtraFeesUsd: number;
  exchangeRate: number;
}

function groupPaidByPayment(items: POPaymentListItem[]): POPaymentGroup[] {
  const map = new Map<string, POPaymentListItem[]>();

  for (const item of items) {
    if (item.paymentDetails && item.paymentDetails.length > 0) {
      for (const detail of item.paymentDetails) {
        const key = detail.pmtNo;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      }
    } else {
      const key = item.latestPaymentDate || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
  }

  const groups: POPaymentGroup[] = [];
  for (const [pmtNo, groupItems] of map) {
    const seen = new Set<string>();
    const uniqueItems: POPaymentListItem[] = [];
    for (const item of groupItems) {
      if (!seen.has(item.poNum)) {
        seen.add(item.poNum);
        uniqueItems.push(item);
      }
    }

    let totalAmountUsd = 0;
    let totalPoPaidUsd = 0;
    let totalDepositPaidUsd = 0;
    let totalExtraFeesUsd = 0;
    let exchangeRate = 0;
    let rateCount = 0;
    let paymentDate = '';
    let supplierCode = '';
    let supplierName = '';

    for (const item of uniqueItems) {
      totalAmountUsd += item.totalAmountUsd;
      totalPoPaidUsd += item.poPaidUsd;
      totalDepositPaidUsd += item.depositPaidUsd;
      totalExtraFeesUsd += item.extraFeesUsd;
      if (item.curUsdRmb > 0) {
        exchangeRate += item.curUsdRmb;
        rateCount++;
      }
      if (item.latestPaymentDate) paymentDate = item.latestPaymentDate;
      supplierCode = item.supplierCode;
      supplierName = item.supplierName;
    }

    if (rateCount > 0) exchangeRate = exchangeRate / rateCount;

    groups.push({
      pmtNo,
      paymentDate,
      supplierCode,
      supplierName,
      items: uniqueItems,
      totalAmountUsd,
      totalPoPaidUsd,
      totalDepositPaidUsd,
      totalExtraFeesUsd,
      exchangeRate,
    });
  }

  groups.sort((a, b) => b.pmtNo.localeCompare(a.pmtNo));
  return groups;
}

type ViewMode = 'list' | 'detail' | 'poDetail';

/**
 * PO Payment Management Page
 * Balance payment after deposit. Shows ALL POs.
 */
export default function POPaymentPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // ═══════════ Filters & Sort ═══════════
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('po_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ═══════════ Selection for batch payment ═══════════
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // ═══════════ 2-level navigation state ═══════════
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPaymentGroup, setSelectedPaymentGroup] = useState<POPaymentGroup | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ═══════════ PO Detail state ═══════════
  const [poDetailOrder, setPoDetailOrder] = useState<PurchaseOrder | null>(null);
  const [poDetailFull, setPoDetailFull] = useState<PurchaseOrder | null>(null);
  const [poDetailHistory, setPoDetailHistory] = useState<{ id: number; eventType: string; eventSeq: number; changes: string; note: string | null; operator: string; createdAt: string }[]>([]);
  const [poDetailLoading, setPoDetailLoading] = useState(false);

  // ═══════════ Delete state ═══════════
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    setIsClient(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        // ignore
      }
    }
  }, []);

  // ═══════════ Data Fetching ═══════════

  const { data: poPaymentData, isLoading, error, refetch } = useQuery({
    queryKey: ['poPaymentList', sortField, sortOrder],
    queryFn: () => financeApi.getPOPaymentList({ sortBy: sortField, sortOrder }),
    enabled: isClient && !!currentUser,
  });

  const { unpaidData, paidData } = useMemo(() => {
    const list = poPaymentData?.data || [];
    const filtered = search
      ? list.filter(item => {
          const q = search.toLowerCase();
          return item.poNum.toLowerCase().includes(q) ||
            item.supplierCode.toLowerCase().includes(q) ||
            item.supplierName.toLowerCase().includes(q);
        })
      : list;

    const unpaid: POPaymentListItem[] = [];
    const paid: POPaymentListItem[] = [];
    for (const item of filtered) {
      if (item.paymentStatus !== 'paid') {
        unpaid.push(item);
      } else {
        paid.push(item);
      }
    }
    return { unpaidData: unpaid, paidData: paid };
  }, [poPaymentData, search]);

  const paymentGroups = useMemo(() => groupPaidByPayment(paidData), [paidData]);
  const totalCount = poPaymentData?.data?.length ?? 0;

  // ═══════════ Sort Handler ═══════════

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'po_date' ? 'desc' : 'asc');
    }
  }, [sortField]);

  // ═══════════ Slide Animation Helpers ═══════════

  const slideForward = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, {
        translateX: [0, -window.innerWidth],
        opacity: [1, 0],
        duration: 350,
        ease: 'inOut(3)',
      });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, {
            translateX: [window.innerWidth, 0],
            opacity: [0, 1],
            duration: 350,
            ease: 'inOut(3)',
          });
        }
      });
    }, 300);
  }, []);

  const slideBack = useCallback((onMidpoint: () => void) => {
    if (contentRef.current) {
      animate(contentRef.current, {
        translateX: [0, window.innerWidth],
        opacity: [1, 0],
        duration: 350,
        ease: 'inOut(3)',
      });
    }
    setTimeout(() => {
      onMidpoint();
      requestAnimationFrame(() => {
        if (contentRef.current) {
          animate(contentRef.current, {
            translateX: [-window.innerWidth, 0],
            opacity: [0, 1],
            duration: 350,
            ease: 'inOut(3)',
          });
        }
      });
    }, 300);
  }, []);

  // ═══════════ Navigation Handlers ═══════════

  const handlePaymentRowClick = useCallback((group: POPaymentGroup) => {
    slideForward(() => {
      setSelectedPaymentGroup(group);
      setViewMode('detail');
    });
  }, [slideForward]);

  const handleBackToList = useCallback(() => {
    slideBack(() => {
      setViewMode('list');
      setSelectedPaymentGroup(null);
      setPoDetailOrder(null);
      setPoDetailFull(null);
      setPoDetailHistory([]);
    });
  }, [slideBack]);

  // ═══════════ PO Detail Navigation ═══════════

  const handlePoRowClick = useCallback(async (poNum: string) => {
    slideForward(() => {
      setViewMode('poDetail');
    });

    setPoDetailLoading(true);
    setPoDetailFull(null);
    setPoDetailHistory([]);

    try {
      const ordersResult = await purchaseApi.getOrders({ search: poNum, limit: 5 });
      let orders: PurchaseOrder[] = [];
      if (ordersResult && typeof ordersResult === 'object' && 'data' in ordersResult) {
        orders = (ordersResult as any).data ?? [];
      } else if (Array.isArray(ordersResult)) {
        orders = ordersResult;
      }

      const matchedOrder = orders.find(o => o.poNum === poNum);
      if (!matchedOrder) {
        setPoDetailOrder({ id: 0, poNum, supplierCode: '', supplierId: 0, poDate: '', status: 'ACTIVE', createdAt: '', updatedAt: '' } as PurchaseOrder);
        setPoDetailLoading(false);
        return;
      }

      setPoDetailOrder(matchedOrder);

      const [detail, history] = await Promise.all([
        purchaseApi.getOrder(matchedOrder.id),
        purchaseApi.getHistory(matchedOrder.id).catch(() => []),
      ]);

      setPoDetailFull(detail);
      setPoDetailHistory(Array.isArray(history) ? history : []);
    } catch {
      setPoDetailOrder(prev => prev ?? { id: 0, poNum, supplierCode: '', supplierId: 0, poDate: '', status: 'ACTIVE', createdAt: '', updatedAt: '' } as PurchaseOrder);
    }
    setPoDetailLoading(false);
  }, [slideForward]);

  // ═══════════ Batch Payment ═══════════

  const handleSubmitPayment = useCallback(() => {
    if (selectedItems.length > 0) {
      setShowPaymentDialog(true);
    }
  }, [selectedItems]);

  const handlePaymentSuccess = useCallback(() => {
    setShowPaymentDialog(false);
    setSelectedItems([]);
    queryClient.invalidateQueries({ queryKey: ['poPaymentList'] });
  }, [queryClient]);

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      financeApi.deletePOPayment(deleteTarget!, secCode),
    onSuccess: () => {
      deleteSecurity.onCancel();
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['poPaymentList'] });
      if (viewMode !== 'list') {
        handleBackToList();
      }
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_po_payment_delete',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDeletePayment = useCallback((pmtNo: string) => {
    setDeleteTarget(pmtNo);
    deleteSecurity.trigger();
  }, [deleteSecurity]);

  // ═══════════ Filter Handlers ═══════════

  const handleClearFilters = () => {
    setSearch('');
  };

  // ═══════════ Render Guards ═══════════

  if (!isClient) return null;

  if (!currentUser) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: colors.textSecondary }} className="mb-4">
            Please sign in to access this page.
          </p>
          <button
            onClick={() => {
              const loginBtn = document.querySelector('[data-login-trigger]') as HTMLElement;
              if (loginBtn) loginBtn.click();
            }}
            className="inline-flex items-center px-6 py-2 rounded-full text-white"
            style={{ backgroundColor: colors.blue }}
          >
            {tCommon('signIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {viewMode === 'list' && (
        <section className="pt-12 pb-6 px-6">
          <div className="max-w-[1400px] mx-auto">
            <FinanceTabSelector />
          </div>
        </section>
      )}

      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('poPayment.table.count', { count: totalCount })}
          </span>
        </section>
      )}

      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('poPayment.table.search')}
                className="w-full h-9 pl-9 pr-3 border rounded-lg text-sm focus:outline-none transition-colors"
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: colors.textTertiary }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {search && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('poPayment.table.clearFilters')}
              </button>
            )}

            <button
              onClick={handleSubmitPayment}
              disabled={selectedItems.length === 0}
              style={{
                backgroundColor: selectedItems.length > 0 ? '#30d158' : colors.bgTertiary,
                color: selectedItems.length > 0 ? '#ffffff' : colors.textTertiary,
              }}
              className="ml-auto h-9 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectedItems.length > 0 && (
                <span className="text-xs font-normal opacity-80">({selectedItems.length})</span>
              )}
              {t('poPayment.submitPayment')}
            </button>
          </div>
        </section>
      )}

      {viewMode !== 'list' && (
        <div
          className="fixed inset-0 z-10"
          onClick={handleBackToList}
        />
      )}

      <section className="max-w-[1400px] mx-auto px-6 relative z-20">
        <div ref={contentRef} className="relative">
          {viewMode === 'list' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 style={{ color: colors.text }} className="text-sm font-semibold">
                    {t('poPayment.sectionUnpaid')}
                  </h2>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(255,159,10,0.12)', color: '#ff9f0a' }}
                  >
                    {unpaidData.length}
                  </span>
                </div>
                <div
                  style={{
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  }}
                  className="rounded-xl border overflow-hidden"
                >
                  <POPaymentTable
                    items={unpaidData}
                    mode="unpaid"
                    selectedPoNums={selectedItems}
                    onSelectionChange={setSelectedItems}
                    onViewDetail={() => {}}
                    onDeletePayment={() => {}}
                    onPoRowClick={handlePoRowClick}
                    t={t}
                    theme={theme}
                    isLoading={isLoading}
                    error={error as Error | null}
                    onRetry={() => refetch()}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </div>
              </div>

              {paymentGroups.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 style={{ color: colors.text }} className="text-sm font-semibold">
                      {t('poPayment.sectionPaid')}
                    </h2>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(48,209,88,0.12)', color: '#30d158' }}
                    >
                      {paymentGroups.length}
                    </span>
                  </div>
                  <div
                    style={{
                      backgroundColor: colors.bgSecondary,
                      borderColor: colors.border,
                    }}
                    className="rounded-xl border overflow-hidden"
                  >
                    <POPaymentTable
                      items={paidData}
                      mode="paid"
                      selectedPoNums={[]}
                      onSelectionChange={() => {}}
                      onViewDetail={(item, pmtNo) => {
                        const group = paymentGroups.find(g => g.pmtNo === pmtNo);
                        if (group) handlePaymentRowClick(group);
                      }}
                      onDeletePayment={handleDeletePayment}
                      onPoRowClick={handlePoRowClick}
                      t={t}
                      theme={theme}
                      isLoading={isLoading}
                      error={error as Error | null}
                      onRetry={() => refetch()}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'detail' && selectedPaymentGroup && (
            <POPaymentDetailPanel
              pmtNo={selectedPaymentGroup.pmtNo}
              poNum={selectedPaymentGroup.items[0]?.poNum ?? ''}
              item={selectedPaymentGroup.items[0]}
              onBack={handleBackToList}
              onDeletePayment={handleDeletePayment}
              t={t}
              theme={theme}
            />
          )}

          {viewMode === 'poDetail' && poDetailOrder && (() => {
            const matchedItem = paidData.find(i => i.poNum === poDetailOrder.poNum)
              || unpaidData.find(i => i.poNum === poDetailOrder.poNum);
            const pmtNo = matchedItem?.paymentDetails?.[0]?.pmtNo;
            return (
              <PODetailPanel
                order={poDetailOrder}
                detail={poDetailFull}
                isLoading={poDetailLoading}
                history={poDetailHistory}
                onBack={handleBackToList}
                onDeletePayment={pmtNo ? () => handleDeletePayment(pmtNo) : undefined}
                depositDetails={matchedItem?.depositDetails}
                paymentDetails={matchedItem?.paymentDetails}
              />
            );
          })()}
        </div>
      </section>

      {showPaymentDialog && (
        <PaymentDialog
          open={showPaymentDialog}
          selectedItems={unpaidData.filter(item => selectedItems.includes(item.poNum))}
          onClose={() => setShowPaymentDialog(false)}
          onSuccess={handlePaymentSuccess}
          t={t}
          theme={theme}
        />
      )}

      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('poPayment.delete.title')}
        description={t('poPayment.delete.description')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => { deleteSecurity.onCancel(); setDeleteTarget(null); }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />
    </div>
  );
}
