'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { WarehouseCard } from './components/WarehouseCard';
import { WarehouseWizard } from './components/WarehouseWizard';
import { CustomDownloadView } from './components/CustomDownloadView';
import type { WarehouseNode, WarehouseTreeResponse } from '@/lib/api/inventory';

type View = 'list' | 'wizard' | 'customDownload';

export default function ShelfPage() {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [view, setView] = useState<View>('list');
  const [data, setData] = useState<WarehouseTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<WarehouseNode | undefined>();
  const [customDownloadWarehouse, setCustomDownloadWarehouse] = useState<string | undefined>();

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

  const handleEdit = (warehouse: WarehouseNode) => {
    setWizardMode('edit');
    setEditTarget(warehouse);
    setView('wizard');
  };

  const handleCreate = () => {
    setWizardMode('create');
    setEditTarget(undefined);
    setView('wizard');
  };

  const handleDelete = (warehouse: WarehouseNode) => {
    setDeleteTarget(warehouse);
    deleteSecurity.trigger();
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

  const handleWizardComplete = () => {
    setView('list');
    loadData();
  };

  // Wizard view
  if (view === 'wizard') {
    return (
      <WarehouseWizard
        mode={wizardMode}
        existingWarehouse={editTarget}
        onComplete={handleWizardComplete}
        onCancel={() => setView('list')}
      />
    );
  }

  // Custom download view
  if (view === 'customDownload' && data) {
    return (
      <CustomDownloadView
        warehouses={data.warehouses}
        initialWarehouse={customDownloadWarehouse}
        onBack={() => setView('list')}
      />
    );
  }

  // List view
  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight">
              {t('shelf.title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-[15px] mt-1">
              {t('shelf.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
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
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.textSecondary,
                }}
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
              style={{
                backgroundColor: colors.controlAccent,
                color: '#ffffff',
              }}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('shelf.wizard.createTitle')}
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              style={{ borderColor: `${colors.controlAccent}30`, borderTopColor: colors.controlAccent }}
              className="w-8 h-8 border-2 rounded-full animate-spin"
            />
          </div>
        ) : error ? (
          <div
            style={{ backgroundColor: `${colors.red}10`, borderColor: `${colors.red}30` }}
            className="rounded-2xl border px-6 py-4 text-center"
          >
            <span style={{ color: colors.red }} className="text-[14px]">{error}</span>
            <button onClick={loadData} style={{ color: colors.controlAccent }} className="ml-3 text-[14px] font-medium">
              Retry
            </button>
          </div>
        ) : !data || data.warehouses.length === 0 ? (
          /* Empty state */
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
              style={{ backgroundColor: colors.controlAccent, color: '#ffffff' }}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium hover:opacity-90 transition-opacity"
            >
              {t('shelf.empty.createFirst')}
            </button>
          </div>
        ) : (
          /* Warehouse cards grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.warehouses.map((warehouse) => (
              <WarehouseCard
                key={warehouse.warehouse}
                warehouse={warehouse}
                onEdit={() => handleEdit(warehouse)}
                onDelete={() => handleDelete(warehouse)}
                onDownload={() => handleDownload(warehouse)}
                onCustomDownload={() => handleCustomDownload(warehouse)}
              />
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
