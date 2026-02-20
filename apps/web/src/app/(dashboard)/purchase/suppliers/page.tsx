'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type SupplierWithStrategy, type SupplierStrategy } from '@/lib/api';
import { animate } from 'animejs';
import SupplierTable from './components/SupplierTable';
import SupplierDetailPanel from './components/SupplierDetailPanel';
import AddSupplierModal from './components/AddSupplierModal';
import EditStrategyModal from './components/EditStrategyModal';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

export default function SuppliersPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Slide-over state
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierWithStrategy | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [strategies, setStrategies] = useState<SupplierStrategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithStrategy | null>(null);

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

  // Fetch suppliers with latest strategy
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => purchaseApi.getSuppliers(),
    enabled: isClient && !!currentUser,
  });

  const suppliers: SupplierWithStrategy[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) return (data as any).data;
    return [];
  }, [data]);

  // ═══════════ Slide-over Animation ═══════════

  const handleRowClick = useCallback(async (supplier: SupplierWithStrategy) => {
    setSelectedSupplier(supplier);
    setLoadingStrategies(true);

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
      const res = await purchaseApi.getStrategies(supplier.id);
      const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
      setStrategies(list);
    } catch {
      setStrategies([]);
    }
    setLoadingStrategies(false);
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
      setSelectedSupplier(null);
      setStrategies([]);
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

  // ═══════════ Modal Handlers ═══════════

  const handleAddSuccess = () => {
    setShowAddModal(false);
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  };

  const handleEditStrategy = (supplier: SupplierWithStrategy) => {
    setEditingSupplier(supplier);
  };

  const handleEditSuccess = () => {
    setEditingSupplier(null);
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    // Refresh the detail panel if it's open
    if (selectedSupplier) {
      handleRowClick(selectedSupplier);
    }
  };

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
            {t('title')}
          </h1>
          {!isFlipped && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{ backgroundColor: '#30d158', color: '#ffffff' }}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('actions.addSupplier')}
            </button>
          )}
        </div>
        {!isFlipped && (
          <>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {t('description')}
            </p>
            <div className="mt-3">
              <span style={{ color: colors.textTertiary }} className="text-sm">
                {t('table.total', { count: suppliers.length })}
              </span>
            </div>
          </>
        )}
      </section>

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
          {/* FRONT: Supplier Table */}
          {!isFlipped && (
            <div ref={frontRef}>
              <div
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                }}
                className="rounded-xl border overflow-hidden"
              >
                <SupplierTable
                  suppliers={suppliers}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                />
              </div>
            </div>
          )}

          {/* BACK: Detail Panel */}
          {isFlipped && selectedSupplier && (
            <div ref={backRef}>
              <SupplierDetailPanel
                supplier={selectedSupplier}
                strategies={strategies}
                isLoading={loadingStrategies}
                onEditStrategy={handleEditStrategy}
              />
            </div>
          )}
        </div>
      </section>

      {/* Add Supplier Modal */}
      <AddSupplierModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      {/* Edit Strategy Modal */}
      {editingSupplier && (
        <EditStrategyModal
          isOpen={!!editingSupplier}
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
