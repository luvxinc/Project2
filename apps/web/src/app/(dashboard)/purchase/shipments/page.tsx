'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type Shipment } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import ShipmentTable from './components/ShipmentTable';
import PurchaseTabSelector from '../components/PurchaseTabSelector';
import ShipmentDetailPanel from './components/ShipmentDetailPanel';
import CreateShipmentModal from './components/CreateShipmentModal';
import EditShipmentModal from './components/EditShipmentModal';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

export default function ShipmentsPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // ═══════════ Filters ═══════════
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [sortField, setSortField] = useState('sentDate');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // ═══════════ Slide-over state ═══════════
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipmentDetail, setShipmentDetail] = useState<Shipment | null>(null);
  const [shipmentHistory, setShipmentHistory] = useState<{ id: number; shipmentId: number; logisticNum: string; eventType: string; eventSeq: number; changes: string; note: string | null; operator: string; createdAt: string }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // ═══════════ Modal state ═══════════
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);

  // ═══════════ Delete/Restore ═══════════
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Shipment | null>(null);

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

  const { data: shipmentsData, isLoading, error, refetch } = useQuery({
    queryKey: ['shipments', page, search, filterYear],
    queryFn: () =>
      purchaseApi.getShipments({
        page,
        limit: LIMIT,
        search: search || undefined,
        dateFrom: filterYear ? `${filterYear}-01-01` : undefined,
        dateTo: filterYear ? `${filterYear}-12-31` : undefined,
      }),
    enabled: isClient && !!currentUser,
  });

  const shipments: Shipment[] = useMemo(() => {
    let list: Shipment[] = [];
    if (!shipmentsData) return list;
    if (Array.isArray(shipmentsData)) list = shipmentsData;
    else if (typeof shipmentsData === 'object' && 'data' in shipmentsData && Array.isArray((shipmentsData as any).data)) {
      list = (shipmentsData as any).data;
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'logisticNum': cmp = a.logisticNum.localeCompare(b.logisticNum); break;
        case 'sentDate': cmp = a.sentDate.localeCompare(b.sentDate); break;
        case 'etaDate': cmp = (a.etaDate ?? '').localeCompare(b.etaDate ?? ''); break;
        case 'pallets': cmp = (a.pallets ?? 0) - (b.pallets ?? 0); break;
        case 'logisticsCost': cmp = (a.logisticsCost ?? 0) - (b.logisticsCost ?? 0); break;
        case 'totalValue': cmp = (a.totalValue ?? 0) - (b.totalValue ?? 0); break;
        case 'receiveStatus': cmp = (a.receiveStatus ?? '').localeCompare(b.receiveStatus ?? ''); break;
        default: cmp = a.sentDate.localeCompare(b.sentDate);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [shipmentsData, sortField, sortOrder]);

  const totalShipments = useMemo(() => {
    if (!shipmentsData) return 0;
    if (typeof shipmentsData === 'object' && 'meta' in shipmentsData) {
      return (shipmentsData as any).meta?.total ?? 0;
    }
    return shipments.length;
  }, [shipmentsData, shipments.length]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalShipments / LIMIT));
  }, [totalShipments]);

  // ═══════════ Slide-over Animation ═══════════

  const handleRowClick = useCallback(async (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setShipmentDetail(null);
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
        purchaseApi.getShipment(shipment.id),
        purchaseApi.getShipmentHistory(shipment.id).catch(() => []),
      ]);
      setShipmentDetail(detail);
      setShipmentHistory(Array.isArray(history) ? history : []);
    } catch {
      setShipmentDetail(null);
      setShipmentHistory([]);
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
      setSelectedShipment(null);
      setShipmentDetail(null);
      setShipmentHistory([]);
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
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
  };

  // ═══════════ Edit Modal ═══════════

  const handleEdit = () => {
    if (shipmentDetail) {
      setEditingShipment(shipmentDetail);
    }
  };

  const handleEditSuccess = () => {
    setEditingShipment(null);
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
    if (selectedShipment) {
      handleRowClick(selectedShipment);
    }
  };

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.deleteShipment(deleteTarget!.id, secCode || undefined as unknown as string),
    onSuccess: () => {
      deleteSecurity.onCancel();
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      handleBack();
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_delete_send',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDelete = () => {
    if (selectedShipment) {
      setDeleteTarget(selectedShipment);
      deleteSecurity.trigger();
    }
  };

  // ═══════════ Restore ═══════════

  const restoreMutation = useMutation({
    mutationFn: () => purchaseApi.restoreShipment(restoreTarget!.id),
    onSuccess: () => {
      restoreSecurity.onCancel();
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      if (selectedShipment) {
        handleRowClick(selectedShipment);
      }
    },
    onError: () => {
      restoreSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const restoreSecurity = useSecurityAction({
    actionKey: 'btn_restore_send',
    level: 'L2',
    onExecute: () => restoreMutation.mutate(),
  });

  const handleRestore = () => {
    if (selectedShipment) {
      setRestoreTarget(selectedShipment);
      restoreSecurity.trigger();
    }
  };

  // ═══════════ Export Excel ═══════════

  const handleExport = (type: 'mgmt' | 'warehouse') => {
    if (!shipmentDetail) return;

    const url = purchaseApi.getShipmentExportUrl(shipmentDetail.id, type);
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
        a.download = `${shipmentDetail.logisticNum}_${type}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        // Export failed silently
      });
  };

  // ═══════════ Filter Handlers ═══════════

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setFilterYear('');
    setPage(1);
  };

  const hasFilters = search || filterYear;

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'sentDate' ? 'desc' : 'asc');
    }
  }, [sortField]);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, []);

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
      {/* Apple Pill Tab Selector */}
      {!isFlipped && (
        <section className="pt-12 pb-6 px-6">
          <div className="max-w-[1400px] mx-auto">
            <PurchaseTabSelector />
          </div>
        </section>
      )}

      {/* Count Bar */}
      {!isFlipped && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('shipments.table.count', { count: totalShipments })}
          </span>
        </section>
      )}

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
                placeholder={t('shipments.table.search')}
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

            {/* Year Filter */}
            <select
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none appearance-none"
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
                minWidth: '120px',
              }}
            >
              <option value="">{t('shipments.table.allYears')}</option>
              {availableYears.map((year) => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('shipments.table.clearFilters')}
              </button>
            )}

            {/* 新建发货单 — right-most in filter bar (aligns with receives page) */}
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ backgroundColor: colors.green, color: '#ffffff' }}
              className="ml-auto h-9 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('shipments.createShipment')}
            </button>
          </div>
        </section>
      )}

      {/* Content Area */}
      <section className="max-w-[1400px] mx-auto px-6 relative">
        {isFlipped && (
          <div
            className="fixed inset-0 z-10"
            onClick={handleBack}
          />
        )}

        <div className="relative z-20">
          {/* FRONT: Shipment Table */}
          {!isFlipped && (
            <div ref={frontRef}>
              <div
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                }}
                className="rounded-xl border overflow-hidden"
              >
                <ShipmentTable
                  shipments={shipments}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
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
          {isFlipped && selectedShipment && (
            <div ref={backRef}>
              <ShipmentDetailPanel
                shipment={selectedShipment}
                detail={shipmentDetail}
                isLoading={loadingDetail}
                history={shipmentHistory}
                onBack={handleBack}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onExport={handleExport}
              />
            </div>
          )}
        </div>
      </section>

      {/* Create Shipment Modal */}
      <CreateShipmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit Shipment Modal */}
      {editingShipment && (
        <EditShipmentModal
          isOpen={!!editingShipment}
          shipment={editingShipment}
          onClose={() => setEditingShipment(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Security Dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('shipments.delete.title')}
        description={t('shipments.delete.securityDescription')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => { deleteSecurity.onCancel(); setDeleteTarget(null); }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />

      {/* Restore Security Dialog */}
      <SecurityCodeDialog
        isOpen={restoreSecurity.isOpen}
        level={restoreSecurity.level}
        title={t('shipments.restore.title')}
        description={t('shipments.restore.securityDescription')}
        onConfirm={restoreSecurity.onConfirm}
        onCancel={() => { restoreSecurity.onCancel(); setRestoreTarget(null); }}
        isLoading={restoreMutation.isPending}
        error={restoreSecurity.error}
      />
    </div>
  );
}
