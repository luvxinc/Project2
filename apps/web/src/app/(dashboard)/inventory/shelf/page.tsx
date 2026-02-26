'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { WarehouseCard } from './components/WarehouseCard';
import { WarehouseModal } from './components/WarehouseModal';
import { CustomDownloadView } from './components/CustomDownloadView';
import { WarehouseMainPage } from './components/WarehouseMainPage';
import { animate, stagger } from 'animejs';
import type { WarehouseNode, WarehouseTreeResponse } from '@/lib/api/inventory';

type View = 'list' | 'customDownload' | 'warehouseMain';

export default function ShelfPage() {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const carouselRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>('list');
  const [data, setData] = useState<WarehouseTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carousel scroll state
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const SCROLL_AMOUNT = 400;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<WarehouseNode | undefined>();
  const [customDownloadWarehouse, setCustomDownloadWarehouse] = useState<string | undefined>();
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseNode | null>(null);
  const [lockedAlertOpen, setLockedAlertOpen] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<WarehouseNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_delete_warehouse',
    level: 'L3',
    onExecute: async (code) => {
      if (!deleteTarget) return;
      setIsDeleting(true);
      try {
        await inventoryApi.deleteWarehouse(deleteTarget.warehouse, code);
        deleteSecurity.onCancel();
        setDeleteTarget(null);
        loadData();
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message || 'Delete failed';
        deleteSecurity.setError(msg);
      } finally {
        setIsDeleting(false);
      }
    },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await inventoryApi.getWarehouseTree();
      setData(result);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carousel scroll controls
  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Animate cards on data load
  useEffect(() => {
    if (!loading && data && data.warehouses.length > 0 && carouselRef.current) {
      const cards = carouselRef.current.querySelectorAll('.warehouse-item');
      if (cards.length > 0) {
        animate(cards, {
          opacity: [0, 1],
          translateY: [50, 0],
          delay: stagger(120, { start: 200 }),
          duration: 700,
          ease: 'out(3)',
        });
      }
      updateScrollButtons();
    }
  }, [loading, data, updateScrollButtons]);

  const handleEdit = (warehouse: WarehouseNode) => {
    if (warehouse.hasInventory) {
      setLockedAlertOpen(true);
      return;
    }
    setModalMode('edit');
    setEditTarget(warehouse);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setModalMode('create');
    setEditTarget(undefined);
    setModalOpen(true);
  };

  const handleDelete = (warehouse: WarehouseNode) => {
    if (warehouse.hasInventory) {
      setLockedAlertOpen(true);
      return;
    }
    setDeleteTarget(warehouse);
    deleteSecurity.trigger();
  };

  const handleWarehouseClick = (warehouse: WarehouseNode) => {
    setSelectedWarehouse(warehouse);
    setView('warehouseMain');
  };

  const handleDownload = async (warehouse: WarehouseNode) => {
    try {
      const blob = await inventoryApi.downloadWarehouseBarcode(warehouse.warehouse);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `barcodes-${warehouse.warehouse}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleCustomDownload = (warehouse: WarehouseNode) => {
    setCustomDownloadWarehouse(warehouse.warehouse);
    setView('customDownload');
  };

  const existingNames = useMemo(() => {
    const names = new Set<string>();
    data?.warehouses.forEach(w => names.add(w.warehouse));
    return names;
  }, [data]);

  const handleModalComplete = () => {
    setModalOpen(false);
    setEditTarget(undefined);
    loadData();
  };

  // Edit from warehouse main page — go back to list and open modal
  const handleEditFromMain = (wh: WarehouseNode) => {
    setView('list');
    setSelectedWarehouse(null);
    setTimeout(() => handleEdit(wh), 50);
  };

  // Warehouse main page view
  if (view === 'warehouseMain' && selectedWarehouse) {
    const goBack = () => { setView('list'); setSelectedWarehouse(null); loadData(); };
    return (
      <div
        style={{ backgroundColor: colors.bg }}
        className="min-h-screen"
        onClick={(e) => {
          // Click outside content area → go back
          if (e.target === e.currentTarget) goBack();
        }}
      >
        <section
          className="max-w-[1200px] mx-auto px-6 py-6"
          onClick={(e) => e.stopPropagation()}
        >
          <WarehouseMainPage
            warehouse={selectedWarehouse}
            onBack={goBack}
            onEdit={handleEditFromMain}
          />
        </section>
      </div>
    );
  }

  // Custom download view
  if (view === 'customDownload' && data) {
    return (
      <CustomDownloadView
        warehouses={data.warehouses}
        initialWarehouse={customDownloadWarehouse}
        onBack={() => { setView('list'); loadData(); }}
      />
    );
  }

  // List view — Hub-style horizontal carousel
  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Action bar */}
      <section className="max-w-[1200px] mx-auto px-6 pb-6">
        <div className="flex items-end justify-end">

          <div className="flex items-center gap-3 pb-1">
            {/* Global action buttons */}
            {data && data.warehouses.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    const blob = await inventoryApi.downloadBatchZip();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'barcodes-all.zip';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('Batch download failed:', err);
                  }
                }}
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
                className="px-4 py-2.5 rounded-full text-[13px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {t('shelf.card.downloadAll')}
              </button>
            )}

            <button
              onClick={handleCreate}
              style={{ backgroundColor: colors.controlAccent, color: '#fff' }}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('shelf.wizard.createTitle')}
            </button>

            {/* Carousel navigation arrows */}
            {data && data.warehouses.length > 0 && (
              <>
                <div style={{ backgroundColor: colors.border }} className="w-px h-6 mx-1" />
                <button
                  onClick={() => scrollCarousel('left')}
                  disabled={!canScrollLeft}
                  style={{
                    backgroundColor: canScrollLeft ? colors.bgTertiary : `${colors.bgTertiary}60`,
                    color: canScrollLeft ? colors.text : colors.textTertiary,
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${canScrollLeft ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => scrollCarousel('right')}
                  disabled={!canScrollRight}
                  style={{
                    backgroundColor: canScrollRight ? colors.bgTertiary : `${colors.bgTertiary}60`,
                    color: canScrollRight ? colors.text : colors.textTertiary,
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${canScrollRight ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            style={{ borderColor: `${colors.controlAccent}30`, borderTopColor: colors.controlAccent }}
            className="w-8 h-8 border-2 rounded-full animate-spin"
          />
        </div>
      ) : error ? (
        <div className="max-w-[1200px] mx-auto px-6">
          <div
            style={{ backgroundColor: `${colors.red}10`, borderColor: `${colors.red}30` }}
            className="rounded-2xl border px-6 py-4 text-center"
          >
            <span style={{ color: colors.red }} className="text-[14px]">{error}</span>
            <button onClick={loadData} style={{ color: colors.controlAccent }} className="ml-3 text-[14px] font-medium">
              {t('shelf.retry')}
            </button>
          </div>
        </div>
      ) : !data || data.warehouses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <svg
            className="w-16 h-16 mb-4"
            style={{ color: colors.textTertiary }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={0.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5M6 6.75v10.5M10 6.75v10.5M14 6.75v10.5M18 6.75v10.5" />
          </svg>
          <h2 style={{ color: colors.text }} className="text-[20px] font-semibold mb-2">
            {t('shelf.empty.title')}
          </h2>
          <p style={{ color: colors.textSecondary }} className="text-[14px] mb-6 text-center max-w-[360px]">
            {t('shelf.empty.message')}
          </p>
          <button
            onClick={handleCreate}
            style={{ backgroundColor: colors.controlAccent, color: '#fff' }}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium hover:opacity-90 transition-opacity"
          >
            {t('shelf.empty.createFirst')}
          </button>
        </div>
      ) : (
        /* ═══ Warehouse Carousel (purchase hub style) ═══ */
        <section className="pb-20 overflow-hidden pt-6">
          <div
            ref={carouselRef}
            onScroll={updateScrollButtons}
            className="flex gap-6 overflow-x-auto px-6 pt-4 pb-6 cursor-grab active:cursor-grabbing"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Left spacer for centering */}
            <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />

            {data.warehouses.map((warehouse) => (
              <div
                key={warehouse.warehouse}
                className="warehouse-item flex-shrink-0 opacity-0"
                style={{ width: '408px' }}
              >
                <WarehouseCard
                  warehouse={warehouse}
                  onEdit={() => handleEdit(warehouse)}
                  onDelete={() => handleDelete(warehouse)}
                  onDownload={() => handleDownload(warehouse)}
                  onCustomDownload={() => handleCustomDownload(warehouse)}
                  onClick={() => handleWarehouseClick(warehouse)}
                />
              </div>
            ))}

            {/* Right spacer */}
            <div className="flex-shrink-0 w-[max(24px,calc((100vw-1200px)/2))]" />
          </div>
        </section>
      )}

      {/* Warehouse Create/Edit Modal */}
      <WarehouseModal
        isOpen={modalOpen}
        mode={modalMode}
        existingWarehouse={editTarget}
        existingNames={existingNames}
        onComplete={handleModalComplete}
        onCancel={() => { setModalOpen(false); setEditTarget(undefined); }}
      />

      {/* Delete confirmation dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('shelf.delete.title')}
        description={deleteTarget ? t('shelf.delete.message', { warehouse: deleteTarget.warehouse }) : ''}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => {
          deleteSecurity.onCancel();
          setDeleteTarget(null);
        }}
        isLoading={isDeleting}
        error={deleteSecurity.error}
      />

      {/* Locked alert modal */}
      {lockedAlertOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setLockedAlertOpen(false)}>
          <div className="rounded-2xl p-6 max-w-sm mx-4 shadow-2xl" style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.separator}` }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.orange}18` }}>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" style={{ color: colors.orange }}>
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-base font-semibold" style={{ color: colors.text }}>{t('shelf.main.lockedTitle')}</h3>
            </div>
            <p className="text-sm mb-5" style={{ color: colors.textSecondary }}>{t('shelf.main.lockedMessage')}</p>
            <button
              onClick={() => setLockedAlertOpen(false)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: colors.controlAccent, color: '#fff' }}>
              {t('shelf.main.lockedOk')}
            </button>
          </div>
        </div>
      )}

      {/* Hide scrollbar */}
      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
