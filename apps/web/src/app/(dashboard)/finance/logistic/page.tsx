'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi, type LogisticListItem } from '@/lib/api';
import { hexToRgba } from '@/lib/status-colors';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import LogisticTable from './components/LogisticTable';
import LogisticDetailPanel from './components/LogisticDetailPanel';
import PaymentDialog from './components/PaymentDialog';
import PaidPaymentTable from './components/PaidPaymentTable';
import PaymentDetailPanel from './components/PaymentDetailPanel';
import { groupByPaymentNo, type PaymentGroup } from './components/PaidPaymentCard';
import FinanceTabSelector from '../components/FinanceTabSelector';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

/**
 * View modes for the 3-level navigation:
 *   list → paymentDetail → shipmentFromPayment
 *   list → shipmentDetail (direct click on unpaid row)
 */
type ViewMode = 'list' | 'shipmentDetail' | 'paymentDetail' | 'shipmentFromPayment';

/**
 * Logistics Cost Management Page
 * V1 parity: backend/templates/finance/pages/logistic.html
 *
 * Design: Apple-style with 3-level slide-in navigation.
 *   Level 1: Unpaid table + Paid payment list
 *   Level 2: Payment detail (PaymentDetailPanel) or Shipment detail (LogisticDetailPanel)
 *   Level 3: Shipment detail from payment (LogisticDetailPanel, readOnly)
 */
export default function LogisticPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // ═══════════ Filters & Sort ═══════════
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('date_sent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ═══════════ Selection for batch payment ═══════════
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // ═══════════ 3-level navigation state ═══════════
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedItem, setSelectedItem] = useState<LogisticListItem | null>(null);
  const [selectedPaymentGroup, setSelectedPaymentGroup] = useState<PaymentGroup | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ═══════════ Delete / Restore state ═══════════
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

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

  const { data: logisticData, isLoading } = useQuery({
    queryKey: ['logisticList', sortField, sortOrder],
    queryFn: () => financeApi.getLogisticList({ sortBy: sortField, sortOrder }),
    enabled: isClient && !!currentUser,
  });

  // Client-side search filtering + split into unpaid / paid groups
  const { unpaidData, paidData } = useMemo(() => {
    const list = logisticData?.data || [];
    const filtered = search
      ? list.filter(item => {
          const q = search.toLowerCase();
          return item.logisticNum.toLowerCase().includes(q) ||
            (item.pmtNo && item.pmtNo.toLowerCase().includes(q));
        })
      : list;

    const unpaid: LogisticListItem[] = [];
    const paid: LogisticListItem[] = [];
    for (const item of filtered) {
      if (item.paymentStatus === 'unpaid' || item.paymentStatus === 'partial') {
        unpaid.push(item);
      } else {
        paid.push(item);
      }
    }
    return { unpaidData: unpaid, paidData: paid };
  }, [logisticData, search]);

  // Group paid items by pmtNo for table display
  const paymentGroups = useMemo(() => groupByPaymentNo(paidData), [paidData]);

  // Total RMB freight for selected unpaid items (needed for Actual Payment rate calc)
  const selectedFreightRmb = useMemo(() => {
    return unpaidData
      .filter(item => selectedItems.includes(item.logisticNum))
      .reduce((sum, item) => sum + item.totalPriceRmb, 0);
  }, [unpaidData, selectedItems]);

  const totalCount = logisticData?.data?.length ?? 0;

  // ═══════════ Sort Handler ═══════════

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'date_sent' ? 'desc' : 'asc');
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

  // List → Shipment Detail (unpaid row click)
  const handleUnpaidRowClick = useCallback((item: LogisticListItem) => {
    slideForward(() => {
      setSelectedItem(item);
      setViewMode('shipmentDetail');
    });
  }, [slideForward]);

  // List → Payment Detail (paid payment row click)
  const handlePaymentRowClick = useCallback((group: PaymentGroup) => {
    slideForward(() => {
      setSelectedPaymentGroup(group);
      setViewMode('paymentDetail');
    });
  }, [slideForward]);

  // Payment Detail → Shipment Detail (shipment click within payment)
  const handleShipmentFromPayment = useCallback((item: LogisticListItem) => {
    slideForward(() => {
      setSelectedItem(item);
      setViewMode('shipmentFromPayment');
    });
  }, [slideForward]);

  // Back navigation
  const handleBackToList = useCallback(() => {
    slideBack(() => {
      setViewMode('list');
      setSelectedItem(null);
      setSelectedPaymentGroup(null);
    });
  }, [slideBack]);

  const handleBackToPaymentDetail = useCallback(() => {
    slideBack(() => {
      setViewMode('paymentDetail');
      setSelectedItem(null);
    });
  }, [slideBack]);

  // ═══════════ Batch Payment ═══════════

  const handleSubmitPayment = useCallback(() => {
    if (selectedItems.length > 0) {
      setShowPaymentDialog(true);
    }
  }, [selectedItems]);

  const handlePaymentSuccess = useCallback(() => {
    setShowPaymentDialog(false);
    setSelectedItems([]);
    queryClient.invalidateQueries({ queryKey: ['logisticList'] });
  }, [queryClient]);

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      financeApi.deleteLogisticPayment(deleteTarget!, secCode),
    onSuccess: () => {
      deleteSecurity.onCancel();
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['logisticList'] });
      // Navigate back to list after delete
      if (viewMode !== 'list') {
        handleBackToList();
      }
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_logistic_payment_delete',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDeletePayment = useCallback((pmtNo: string) => {
    setDeleteTarget(pmtNo);
    deleteSecurity.trigger();
  }, [deleteSecurity]);

  // ═══════════ Restore ═══════════

  const restoreMutation = useMutation({
    mutationFn: (secCode: string) =>
      financeApi.restoreLogisticPayment(restoreTarget!, secCode),
    onSuccess: () => {
      restoreSecurity.onCancel();
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['logisticList'] });
      if (viewMode !== 'list') {
        handleBackToList();
      }
    },
    onError: () => {
      restoreSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const restoreSecurity = useSecurityAction({
    actionKey: 'btn_logistic_payment_restore',
    level: 'L2',
    onExecute: (code) => restoreMutation.mutate(code),
  });

  const handleRestorePayment = useCallback((pmtNo: string) => {
    setRestoreTarget(pmtNo);
    restoreSecurity.trigger();
  }, [restoreSecurity]);

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
      {/* Apple Pill Tab Selector — only on list view */}
      {viewMode === 'list' && (
        <section className="pt-12 pb-6 px-6">
          <div className="max-w-[1400px] mx-auto">
            <FinanceTabSelector />
          </div>
        </section>
      )}

      {/* Count Bar */}
      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('logistic.table.count', { count: totalCount })}
          </span>
        </section>
      )}

      {/* Filter Bar */}
      {viewMode === 'list' && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('logistic.table.search')}
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

            {/* Clear */}
            {search && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('logistic.table.clearFilters')}
              </button>
            )}

            {/* Submit Payment button — right-aligned */}
            <button
              onClick={handleSubmitPayment}
              disabled={selectedItems.length === 0}
              style={{
                backgroundColor: selectedItems.length > 0 ? colors.green : colors.bgTertiary,
                color: selectedItems.length > 0 ? '#fff' : colors.textTertiary,
              }}
              className="ml-auto h-9 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectedItems.length > 0 && (
                <span className="text-xs font-normal opacity-80">({selectedItems.length})</span>
              )}
              {t('logistic.submitPayment')}
            </button>
          </div>
        </section>
      )}

      {/* Click-outside backdrop for detail views */}
      {viewMode !== 'list' && (
        <div
          className="fixed inset-0 z-10"
          onClick={viewMode === 'shipmentFromPayment' ? handleBackToPaymentDetail : handleBackToList}
        />
      )}

      {/* Content Area */}
      <section className="max-w-[1400px] mx-auto px-6 relative z-20">
        <div ref={contentRef} className="relative">
          {/* ── Level 1: List View ── */}
          {viewMode === 'list' && (
            <div className="space-y-6">
              {/* Unpaid Section */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 style={{ color: colors.text }} className="text-sm font-semibold">
                    {t('logistic.sectionUnpaid')}
                  </h2>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: hexToRgba(colors.orange, 0.12), color: colors.orange }}
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
                  <LogisticTable
                    data={unpaidData}
                    isLoading={isLoading}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    selectedItems={selectedItems}
                    onSelectionChange={setSelectedItems}
                    onRowClick={handleUnpaidRowClick}
                    selectable
                  />
                </div>
              </div>

              {/* Paid Section — Table grouped by pmtNo */}
              {paymentGroups.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 style={{ color: colors.text }} className="text-sm font-semibold">
                      {t('logistic.sectionPaid')}
                    </h2>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: hexToRgba(colors.green, 0.12), color: colors.green }}
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
                    <PaidPaymentTable
                      groups={paymentGroups}
                      isLoading={isLoading}
                      onRowClick={handlePaymentRowClick}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Level 2a: Shipment Detail (from unpaid row click) ── */}
          {viewMode === 'shipmentDetail' && selectedItem && (
            <LogisticDetailPanel
              item={selectedItem}
              onBack={handleBackToList}
              onDeletePayment={handleDeletePayment}
              onRestorePayment={handleRestorePayment}
            />
          )}

          {/* ── Level 2b: Payment Detail (from paid payment row click) ── */}
          {viewMode === 'paymentDetail' && selectedPaymentGroup && (
            <PaymentDetailPanel
              group={selectedPaymentGroup}
              onBack={handleBackToList}
              onClickShipment={handleShipmentFromPayment}
              onDeletePayment={handleDeletePayment}
              onRestorePayment={handleRestorePayment}
            />
          )}

          {/* ── Level 3: Shipment Detail from Payment (readOnly) ── */}
          {viewMode === 'shipmentFromPayment' && selectedItem && (
            <LogisticDetailPanel
              item={selectedItem}
              onBack={handleBackToPaymentDetail}
              onDeletePayment={handleDeletePayment}
              onRestorePayment={handleRestorePayment}
              readOnly
            />
          )}
        </div>
      </section>

      {/* Payment Dialog */}
      {showPaymentDialog && (
        <PaymentDialog
          isOpen={showPaymentDialog}
          selectedLogisticNums={selectedItems}
          totalFreightRmb={selectedFreightRmb}
          onClose={() => setShowPaymentDialog(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Delete Dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('logistic.delete.title')}
        description={t('logistic.delete.description')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => { deleteSecurity.onCancel(); setDeleteTarget(null); }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />

      {/* Restore Dialog */}
      <SecurityCodeDialog
        isOpen={restoreSecurity.isOpen}
        level={restoreSecurity.level}
        title={t('logistic.restore.title')}
        description={t('logistic.restore.description')}
        onConfirm={restoreSecurity.onConfirm}
        onCancel={() => { restoreSecurity.onCancel(); setRestoreTarget(null); }}
        isLoading={restoreMutation.isPending}
        error={restoreSecurity.error}
      />
    </div>
  );
}
