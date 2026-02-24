'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type SupplierWithStrategy, type SupplierStrategy } from '@/lib/api';
import { animate } from 'animejs';
import SupplierTable from './components/SupplierTable';
import PurchaseTabSelector from '../components/PurchaseTabSelector';
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
  const [editingStrategy, setEditingStrategy] = useState<SupplierStrategy | undefined>(undefined);

  // ═══════════ Filter & Sort ═══════════
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('supplierCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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

  // ═══════════ Client-side Filter & Sort ═══════════
  const filteredSuppliers = useMemo(() => {
    let list = [...suppliers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.supplierCode.toLowerCase().includes(q) ||
        s.supplierName.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortField) {
        case 'supplierCode': aVal = a.supplierCode; bVal = b.supplierCode; break;
        case 'supplierName': aVal = a.supplierName; bVal = b.supplierName; break;
        case 'category': aVal = a.latestStrategy?.category ?? ''; bVal = b.latestStrategy?.category ?? ''; break;
        case 'currency': aVal = a.latestStrategy?.currency ?? ''; bVal = b.latestStrategy?.currency ?? ''; break;
        case 'status': aVal = a.status ? 1 : 0; bVal = b.status ? 1 : 0; break;
        case 'effectiveDate': aVal = a.latestStrategy?.effectiveDate ?? ''; bVal = b.latestStrategy?.effectiveDate ?? ''; break;
        default: aVal = a.supplierCode; bVal = b.supplierCode;
      }
      const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [suppliers, search, sortField, sortOrder]);

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const handleClearFilters = useCallback(() => {
    setSearch('');
  }, []);

  const hasFilters = !!search;

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

  const handleNewStrategy = () => {
    if (selectedSupplier) {
      setEditingSupplier(selectedSupplier);
      setEditingStrategy(undefined); // new mode — no specific strategy
    }
  };

  const handleEditStrategyRow = (strategy: SupplierStrategy) => {
    if (selectedSupplier) {
      setEditingSupplier(selectedSupplier);
      setEditingStrategy(strategy); // edit mode — specific strategy
    }
  };

  const handleEditSuccess = () => {
    setEditingSupplier(null);
    setEditingStrategy(undefined);
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
            {t('table.total', { count: filteredSuppliers.length })}
          </span>
        </section>
      )}

      {/* Filter Bar */}
      {!isFlipped && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('table.search')}
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
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="h-9 px-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
              >
                {t('table.clearFilters')}
              </button>
            )}

            {/* Add Supplier — right-most (aligned like shipments) */}
            <button
              onClick={() => setShowAddModal(true)}
              style={{ backgroundColor: colors.green, color: '#ffffff' }}
              className="ml-auto h-9 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('actions.addSupplier')}
            </button>
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
                  suppliers={filteredSuppliers}
                  isLoading={isLoading}
                  error={error as Error | null}
                  onRetry={() => refetch()}
                  onRowClick={handleRowClick}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
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
                onNewStrategy={handleNewStrategy}
                onEditStrategy={handleEditStrategyRow}
                onBack={handleBack}
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

      {/* Edit/New Strategy Modal */}
      {editingSupplier && (
        <EditStrategyModal
          isOpen={!!editingSupplier}
          supplier={editingSupplier}
          editingStrategy={editingStrategy}
          minEffectiveDate={strategies.length > 0 ? strategies[0].effectiveDate : undefined}
          onClose={() => { setEditingSupplier(null); setEditingStrategy(undefined); }}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
