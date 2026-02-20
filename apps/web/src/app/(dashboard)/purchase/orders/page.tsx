'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type PurchaseOrder } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { animate } from 'animejs';
import * as XLSX from 'xlsx';
import POTable from './components/POTable';
import PODetailPanel from './components/PODetailPanel';
import CreatePOModal from './components/CreatePOModal';
import EditPOModal from './components/EditPOModal';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

export default function OrdersPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // ═══════════ Filters (V1 parity: supplier filter only) ═══════════
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // V1 parity: sort by po_num / supplier_code / order_date
  const [sortBy, setSortBy] = useState('order_date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // ═══════════ Slide-over state ═══════════
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [orderDetail, setOrderDetail] = useState<PurchaseOrder | null>(null);
  const [orderHistory, setOrderHistory] = useState<{ id: number; eventType: string; eventSeq: number; changes: string; note: string | null; operator: string; createdAt: string }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // ═══════════ Modal state ═══════════
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);

  // ═══════════ Delete/Restore ═══════════
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [showDeleteSecurity, setShowDeleteSecurity] = useState(false);
  const [deleteSecurityError, setDeleteSecurityError] = useState<string | undefined>(undefined);
  const [restoreTarget, setRestoreTarget] = useState<PurchaseOrder | null>(null);
  const [showRestoreSecurity, setShowRestoreSecurity] = useState(false);
  const [restoreSecurityError, setRestoreSecurityError] = useState<string | undefined>(undefined);

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

  const { data: ordersData, isLoading, error, refetch } = useQuery({
    queryKey: ['purchaseOrders', page, search, filterSupplier, dateFrom, dateTo],
    queryFn: () =>
      purchaseApi.getOrders({
        page,
        limit: LIMIT,
        search: search || undefined,
        supplierCode: filterSupplier || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    enabled: isClient && !!currentUser,
  });

  // The API returns PagedResponse which has { data, meta } structure
  // but the client unwraps ApiResponse, so for paginated endpoints we get the raw object
  const orders: PurchaseOrder[] = useMemo(() => {
    let list: PurchaseOrder[] = [];
    if (!ordersData) return list;
    if (Array.isArray(ordersData)) list = ordersData;
    else if (typeof ordersData === 'object' && 'data' in ordersData && Array.isArray((ordersData as any).data)) {
      list = (ordersData as any).data;
    }
    // V1 parity: client-side sort (V1 sorts after data collection)
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'po_num') cmp = a.poNum.localeCompare(b.poNum);
      else if (sortBy === 'supplier_code') cmp = a.supplierCode.localeCompare(b.supplierCode);
      else cmp = a.poDate.localeCompare(b.poDate); // order_date default
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [ordersData, sortBy, sortOrder]);

  const totalOrders = useMemo(() => {
    if (!ordersData) return 0;
    if (typeof ordersData === 'object' && 'meta' in ordersData) {
      return (ordersData as any).meta?.total ?? 0;
    }
    return orders.length;
  }, [ordersData, orders.length]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalOrders / LIMIT));
  }, [totalOrders]);

  // Fetch unique supplier codes for filter dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => purchaseApi.getSuppliers(),
    enabled: isClient && !!currentUser,
  });

  const supplierCodes: string[] = useMemo(() => {
    if (!suppliersData) return [];
    const list = Array.isArray(suppliersData) ? suppliersData : (suppliersData as any)?.data ?? [];
    return list.map((s: any) => s.supplierCode).sort();
  }, [suppliersData]);

  // ═══════════ Slide-over Animation ═══════════

  const handleRowClick = useCallback(async (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setOrderDetail(null);
    setLoadingDetail(true);

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
      const [detail, history] = await Promise.all([
        purchaseApi.getOrder(order.id),
        purchaseApi.getHistory(order.id).catch(() => []),
      ]);
      setOrderDetail(detail);
      setOrderHistory(Array.isArray(history) ? history : []);
    } catch {
      setOrderDetail(null);
      setOrderHistory([]);
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
      setSelectedOrder(null);
      setOrderDetail(null);
      setOrderHistory([]);
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

  // ═══════════ Create Modal ═══════════

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
  };

  // ═══════════ Edit Modal ═══════════

  const handleEdit = () => {
    if (orderDetail) {
      setEditingOrder(orderDetail);
    }
  };

  const handleEditSuccess = () => {
    setEditingOrder(null);
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    // Refresh detail panel
    if (selectedOrder) {
      handleRowClick(selectedOrder);
    }
  };

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.deleteOrder(deleteTarget!.id, secCode),
    onSuccess: () => {
      setShowDeleteSecurity(false);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      // Go back to list
      handleBack();
    },
    onError: () => {
      setDeleteSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const handleDelete = () => {
    if (selectedOrder) {
      setDeleteTarget(selectedOrder);
      setDeleteSecurityError(undefined);
      setShowDeleteSecurity(true);
    }
  };

  const handleDeleteConfirm = (code: string) => {
    deleteMutation.mutate(code);
  };

  // ═══════════ Restore (V1 parity: requires L2 security code) ═══════════

  const restoreMutation = useMutation({
    mutationFn: (secCode: string) => purchaseApi.restoreOrder(restoreTarget!.id, secCode),
    onSuccess: () => {
      setShowRestoreSecurity(false);
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      if (selectedOrder) {
        handleRowClick(selectedOrder);
      }
    },
    onError: () => {
      setRestoreSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const handleRestore = () => {
    if (selectedOrder) {
      setRestoreTarget(selectedOrder);
      setRestoreSecurityError(undefined);
      setShowRestoreSecurity(true);
    }
  };

  const handleRestoreConfirm = (code: string) => {
    restoreMutation.mutate(code);
  };

  // ═══════════ Export Excel ═══════════

  /**
   * V1 parity: export PO via backend (Apache POI with full formatting).
   * Falls back to client-side XLSX if backend unavailable.
   */
  const handleExport = () => {
    if (!orderDetail) return;

    const url = purchaseApi.getExportUrl(orderDetail.id);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const baseUrl = getApiBaseUrlCached();

    fetch(`${baseUrl}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${orderDetail.poNum}_current.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        // Fallback: client-side export
        const items = orderDetail.items || [];
        const strategy = orderDetail.strategy;
        const currency = strategy?.currency || 'USD';
        const exchangeRate = strategy?.exchangeRate || 1;

        const wsData: (string | number | null)[][] = [
          [null, null, '采购订单详情'],
          [],
          [null, null, orderDetail.supplierCode, null, null, orderDetail.poDate],
          [],
          [null, null, orderDetail.poNum],
          [],
          [null, null, null, null, null, orderDetail.strategySeq || 'V01'],
          [], [], [],
          [null, null, currency, null, null, exchangeRate],
          [],
          [null, null, strategy?.floatEnabled ? '是' : '否', null, null, strategy?.floatEnabled ? `${strategy.floatThreshold}%` : '0%'],
          [],
          [null, null, strategy?.requireDeposit ? '是' : '否', null, null, strategy?.requireDeposit ? `${strategy.depositRatio}%` : '0%'],
          [], [], [], [], [],
        ];

        let total = 0;
        items.forEach(i => { total += i.quantity * i.unitPrice; });
        wsData.push([null, null, `${currency} ${total.toFixed(2)}`]);
        wsData.push([]);
        wsData.push([null, 'SKU', '数量', '货币', '单价', '小计']);
        items.forEach(i => {
          wsData.push([null, i.sku, i.quantity, currency, i.unitPrice, Math.round(i.quantity * i.unitPrice * 100000) / 100000]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 3 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('orders.export.sheetName'));
        XLSX.writeFile(wb, `${orderDetail.poNum}_current.xlsx`);
      });
  };

  // ═══════════ Filter Handlers ═══════════

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setFilterSupplier('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters = search || filterSupplier || dateFrom || dateTo;

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
      {/* Header */}
      <section className="max-w-[1400px] mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1
            style={{ color: colors.text }}
            className="text-2xl font-semibold tracking-tight"
          >
            {t('orders.title')}
          </h1>
          {!isFlipped && (
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ backgroundColor: '#30d158', color: '#ffffff' }}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('orders.createPO')}
            </button>
          )}
        </div>
        {!isFlipped && (
          <>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {t('orders.description')}
            </p>
            <div className="mt-3">
              <span style={{ color: colors.textTertiary }} className="text-sm">
                {t('orders.table.count', { count: totalOrders })}
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
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('orders.table.search')}
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

            {/* Supplier Filter */}
            <select
              value={filterSupplier}
              onChange={(e) => { setFilterSupplier(e.target.value); setPage(1); }}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none appearance-none"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
                minWidth: '140px',
              }}
            >
              <option value="">{t('orders.table.allSuppliers')}</option>
              {supplierCodes.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>

            {/* Date Range */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              placeholder={t('orders.table.dateFrom')}
            />
            <span style={{ color: colors.textTertiary }} className="text-sm">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              placeholder={t('orders.table.dateTo')}
            />

            {/* V1 parity: Sort by */}
            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('_');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
                setPage(1);
              }}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none appearance-none"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text, minWidth: '150px' }}
            >
              <option value="order_date_desc">{t('orders.table.orderDate')} ↓</option>
              <option value="order_date_asc">{t('orders.table.orderDate')} ↑</option>
              <option value="po_num_desc">{t('orders.table.poNum')} ↓</option>
              <option value="po_num_asc">{t('orders.table.poNum')} ↑</option>
              <option value="supplier_code_asc">{t('orders.table.supplier')} A→Z</option>
              <option value="supplier_code_desc">{t('orders.table.supplier')} Z→A</option>
            </select>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('orders.table.clearFilters')}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Content Area */}
      <section className="max-w-[1400px] mx-auto px-6 relative">
        {/* Click-outside overlay for slide-over */}
        {isFlipped && (
          <div
            className="fixed inset-0 z-10"
            onClick={handleBack}
          />
        )}

        <div className="relative z-20">
          {/* FRONT: Order Table */}
          {!isFlipped && (
            <div ref={frontRef}>
              <div
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                }}
                className="rounded-xl border overflow-hidden"
              >
                <POTable
                  orders={orders}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                />
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-8 px-3 text-sm rounded-lg transition-opacity disabled:opacity-30"
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  >
                    &laquo;
                  </button>
                  <span style={{ color: colors.textSecondary }} className="text-sm px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="h-8 px-3 text-sm rounded-lg transition-opacity disabled:opacity-30"
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  >
                    &raquo;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* BACK: Detail Panel */}
          {isFlipped && selectedOrder && (
            <div ref={backRef}>
              <PODetailPanel
                order={selectedOrder}
                detail={orderDetail}
                isLoading={loadingDetail}
                history={orderHistory}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onExport={handleExport}
              />
            </div>
          )}
        </div>
      </section>

      {/* Create PO Modal */}
      <CreatePOModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit PO Modal */}
      {editingOrder && (
        <EditPOModal
          isOpen={!!editingOrder}
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Security Dialog */}
      <SecurityCodeDialog
        isOpen={showDeleteSecurity}
        level="L3"
        title={t('orders.delete.title')}
        description={t('orders.delete.securityDescription')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteSecurity(false);
          setDeleteTarget(null);
          setDeleteSecurityError(undefined);
        }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurityError}
      />

      {/* Restore Security Dialog (V1 parity: L2) */}
      <SecurityCodeDialog
        isOpen={showRestoreSecurity}
        level="L2"
        title={t('orders.restore.title')}
        description={t('orders.restore.securityDescription')}
        onConfirm={handleRestoreConfirm}
        onCancel={() => {
          setShowRestoreSecurity(false);
          setRestoreTarget(null);
          setRestoreSecurityError(undefined);
        }}
        isLoading={restoreMutation.isPending}
        error={restoreSecurityError}
      />
    </div>
  );
}
