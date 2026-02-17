'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, Product } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

// 可编辑字段类型
type EditableField = 'category' | 'subcategory' | 'type' | 'cost' | 'freight' | 'weight';

interface EditedProduct {
  category?: string;
  subcategory?: string;
  type?: string;
  cost?: number;
  freight?: number;
  weight?: number;
}

export default function CogsPage() {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // 编辑模式状态
  const [editMode, setEditMode] = useState(false);
  const [editedProducts, setEditedProducts] = useState<Record<string, EditedProduct>>({});
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateSecurityDialog, setShowCreateSecurityDialog] = useState(false);
  const [createSecurityError, setCreateSecurityError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ sku: '', name: '', category: '', cogs: '', upc: '' });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createSuccess, setCreateSuccess] = useState(false);

  // 下拉选项 (从数据中动态获取)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  useEffect(() => {
    setIsClient(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => productsApi.findAll({ page, limit: 50, search: search || undefined }),
    enabled: isClient && !!currentUser,
  });

  const products = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;

  // 从产品数据提取下拉选项
  useEffect(() => {
    if (products.length > 0) {
      const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
      const subcategories = [...new Set(products.map(p => p.subcategory).filter(Boolean))] as string[];
      const types = [...new Set(products.map(p => p.type).filter(Boolean))] as string[];
      setCategoryOptions(categories.sort());
      setSubcategoryOptions(subcategories.sort());
      setTypeOptions(types.sort());
    }
  }, [products]);

  const batchUpdateMutation = useMutation({
    mutationFn: (data: { items: { id: string; cogs: number }[]; sec_code_l2: string }) =>
      productsApi.batchUpdateCogs(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditedProducts({});
      setEditMode(false);
      setShowSecurityDialog(false);
      setSecurityError(null);
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { sku: string; name?: string; category?: string; cogs?: number; upc?: string; sec_code_l2: string }) =>
      productsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreateSecurityDialog(false);
      setCreateSecurityError(null);
      setCreateSuccess(true);
      setTimeout(() => {
        setCreateSuccess(false);
        setShowCreateModal(false);
        setCreateForm({ sku: '', name: '', category: '', cogs: '', upc: '' });
        setCreateErrors({});
      }, 1500);
    },
    onError: () => {
      setCreateSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const handleCreateSubmit = () => {
    const errs: Record<string, string> = {};
    if (!createForm.sku.trim()) errs.sku = t('form.sku.required');
    if (createForm.cogs && (isNaN(Number(createForm.cogs)) || Number(createForm.cogs) < 0)) errs.cogs = t('form.cogs.invalid');
    setCreateErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setShowCreateSecurityDialog(true);
  };

  const handleCreateConfirm = (secCode: string) => {
    createMutation.mutate({
      sku: createForm.sku.toUpperCase(),
      name: createForm.name || undefined,
      category: createForm.category || undefined,
      cogs: createForm.cogs ? parseFloat(createForm.cogs) : 0,
      upc: createForm.upc || undefined,
      sec_code_l2: secCode,
    });
  };

  // 处理字段变更
  const handleFieldChange = useCallback((productId: string, field: EditableField, value: string | number) => {
    setEditedProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  }, []);

  // 获取显示值 (优先编辑值)
  const getDisplayValue = useCallback((product: Product, field: EditableField): string | number => {
    const edited = editedProducts[product.id];
    if (edited && edited[field] !== undefined) {
      return edited[field]!;
    }
    return product[field] ?? '';
  }, [editedProducts]);

  // 计算 COG 值 (Cost + Freight)
  const getCalculatedCog = useCallback((product: Product): number => {
    const edited = editedProducts[product.id];
    const cost = edited?.cost !== undefined ? edited.cost : product.cost;
    const freight = edited?.freight !== undefined ? edited.freight : product.freight;
    return Number((cost + freight).toFixed(2));
  }, [editedProducts]);

  // 检查是否有修改
  const modifiedCount = useMemo(() => Object.keys(editedProducts).length, [editedProducts]);
  const hasChanges = modifiedCount > 0;

  // 保存变更
  const handleSave = (secCode: string) => {
    // 构建更新数据 (只包含 COGS = cost + freight)
    const items = Object.entries(editedProducts).map(([id, changes]) => {
      const product = products.find(p => p.id === id)!;
      const cost = changes.cost !== undefined ? changes.cost : product.cost;
      const freight = changes.freight !== undefined ? changes.freight : product.freight;
      return {
        id,
        cogs: Number((cost + freight).toFixed(2)),
      };
    });
    batchUpdateMutation.mutate({ items, sec_code_l2: secCode });
  };

  // 取消编辑
  const handleCancel = () => {
    setEditedProducts({});
    setEditMode(false);
  };

  if (!isClient) {
    return null;
  }

  if (!currentUser) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: colors.textSecondary }} className="mb-4">
            {t('list.loginRequired')}
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
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="max-w-[1400px] mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <Link href="/products" style={{ color: colors.blue }}>
              {t('module.title')}
            </Link>
            <span style={{ color: colors.textTertiary }}>/</span>
            <span style={{ color: colors.textSecondary }}>{t('cogs.title')}</span>
          </div>

          {/* Edit Mode Toggle */}
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <span 
                  style={{ color: colors.orange }} 
                  className="text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  {t('cogs.modifiedRows', { count: modifiedCount })}
                </span>
                <button
                  onClick={handleCancel}
                  disabled={batchUpdateMutation.isPending}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    color: colors.text,
                    borderColor: colors.border,
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-all hover:opacity-80 disabled:opacity-50"
                >
                  {t('cogs.discardChanges')}
                </button>
                <button
                  onClick={() => setShowSecurityDialog(true)}
                  disabled={batchUpdateMutation.isPending || !hasChanges}
                  style={{
                    backgroundColor: colors.green,
                    color: '#ffffff',
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {batchUpdateMutation.isPending ? tCommon('saving') : t('cogs.saveChanges')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                style={{
                  backgroundColor: colors.blue,
                  color: '#ffffff',
                }}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              >
                {t('cogs.editMode')}
              </button>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <h1
          style={{ color: colors.text }}
          className="text-2xl font-semibold tracking-tight mb-1"
        >
          {t('cogs.title')}
        </h1>
        <p style={{ color: colors.textSecondary }} className="text-sm">
          {t('cogs.description')}
        </p>
      </section>

      {/* Instructions Card (编辑模式时显示) */}
      {editMode && (
        <section className="max-w-[1400px] mx-auto px-6 pb-4">
          <div
            style={{
              backgroundColor: `${colors.blue}08`,
              borderColor: `${colors.blue}30`,
            }}
            className="rounded-xl border p-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                style={{ color: colors.blue }}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p style={{ color: colors.blue }} className="text-sm font-medium mb-1">
                  {t('cogs.instructions.title')}
                </p>
                <ul style={{ color: colors.textSecondary }} className="text-sm space-y-0.5">
                  <li>• {t('cogs.instructions.editCostFreight')}</li>
                  <li>• {t('cogs.instructions.autoCalculate')}</li>
                  <li>• {t('cogs.instructions.saveChanges')}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search Bar + New SKU Button */}
      <section className="max-w-[1400px] mx-auto px-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: colors.textTertiary }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('list.searchPlaceholder')}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <span style={{ color: colors.textTertiary }} className="text-sm">
            {t('pagination.total', { count: total })}
          </span>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreateSuccess(false);
              setCreateForm({ sku: '', name: '', category: '', cogs: '', upc: '' });
              setCreateErrors({});
            }}
            style={{ backgroundColor: '#30d158', color: '#ffffff' }}
            className="ml-auto px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('actions.create')}
          </button>
        </div>
      </section>

      {/* Products Table */}
      <section className="max-w-[1400px] mx-auto px-6 pb-20">
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-xl border overflow-hidden"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div
                className="w-8 h-8 border-2 rounded-full animate-spin"
                style={{ borderColor: colors.border, borderTopColor: colors.blue }}
              />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p style={{ color: colors.red }} className="mb-4">
                {t('list.loadFailed')}
              </p>
              <button
                onClick={() => refetch()}
                style={{ backgroundColor: colors.blue, color: '#ffffff' }}
                className="px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t('list.retry')}
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <p style={{ color: colors.textSecondary }}>{t('list.noProducts')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      SKU
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      Category
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                    >
                      SubCategory
                    </th>
                    <th
                      style={{ color: colors.textSecondary }}
                      className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24"
                    >
                      Type
                    </th>
                    <th
                      style={{ color: colors.blue }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24"
                    >
                      Cost
                    </th>
                    <th
                      style={{ color: colors.blue }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24"
                    >
                      Freight
                    </th>
                    <th
                      style={{ color: colors.orange }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-20"
                    >
                      Weight
                    </th>
                    <th
                      style={{ color: colors.green }}
                      className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24"
                    >
                      COG
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => {
                    const isEdited = !!editedProducts[product.id];
                    return (
                      <tr
                        key={product.id}
                        style={{
                          borderColor: colors.border,
                          backgroundColor: isEdited ? `${colors.blue}08` : 'transparent',
                        }}
                        className={`${index !== products.length - 1 ? 'border-b' : ''} transition-colors`}
                      >
                        {/* SKU */}
                        <td style={{ color: colors.text }} className="py-3 px-4 font-mono text-sm whitespace-nowrap">
                          {product.sku}
                        </td>

                        {/* Category */}
                        <td className="py-2 px-4">
                          {editMode ? (
                            <select
                              value={getDisplayValue(product, 'category') as string}
                              onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.text,
                              }}
                              className="w-full px-2 py-1.5 rounded-md border text-sm focus:outline-none focus:ring-1"
                            >
                              <option value="">-</option>
                              {categoryOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: colors.textSecondary }} className="text-sm">
                              {product.category || '-'}
                            </span>
                          )}
                        </td>

                        {/* SubCategory */}
                        <td className="py-2 px-4">
                          {editMode ? (
                            <select
                              value={getDisplayValue(product, 'subcategory') as string}
                              onChange={(e) => handleFieldChange(product.id, 'subcategory', e.target.value)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.text,
                              }}
                              className="w-full px-2 py-1.5 rounded-md border text-sm focus:outline-none focus:ring-1"
                            >
                              <option value="">-</option>
                              {subcategoryOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: colors.textSecondary }} className="text-sm">
                              {product.subcategory || '-'}
                            </span>
                          )}
                        </td>

                        {/* Type */}
                        <td className="py-2 px-4">
                          {editMode ? (
                            <select
                              value={getDisplayValue(product, 'type') as string}
                              onChange={(e) => handleFieldChange(product.id, 'type', e.target.value)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.text,
                              }}
                              className="w-full px-2 py-1.5 rounded-md border text-sm focus:outline-none focus:ring-1"
                            >
                              <option value="">-</option>
                              {typeOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: colors.textSecondary }} className="text-sm">
                              {product.type || '-'}
                            </span>
                          )}
                        </td>

                        {/* Cost */}
                        <td className="py-2 px-4 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={getDisplayValue(product, 'cost') as number}
                              onChange={(e) => handleFieldChange(product.id, 'cost', parseFloat(e.target.value) || 0)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.blue,
                              }}
                              className="w-20 px-2 py-1.5 rounded-md border text-right text-sm font-mono focus:outline-none focus:ring-1"
                            />
                          ) : (
                            <span style={{ color: colors.blue }} className="font-mono text-sm">
                              ${(product.cost ?? 0).toFixed(2)}
                            </span>
                          )}
                        </td>

                        {/* Freight */}
                        <td className="py-2 px-4 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={getDisplayValue(product, 'freight') as number}
                              onChange={(e) => handleFieldChange(product.id, 'freight', parseFloat(e.target.value) || 0)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.blue,
                              }}
                              className="w-20 px-2 py-1.5 rounded-md border text-right text-sm font-mono focus:outline-none focus:ring-1"
                            />
                          ) : (
                            <span style={{ color: colors.blue }} className="font-mono text-sm">
                              ${(product.freight ?? 0).toFixed(2)}
                            </span>
                          )}
                        </td>

                        {/* Weight */}
                        <td className="py-2 px-4 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={getDisplayValue(product, 'weight') as number}
                              onChange={(e) => handleFieldChange(product.id, 'weight', parseInt(e.target.value) || 0)}
                              style={{
                                backgroundColor: colors.bgTertiary,
                                borderColor: colors.border,
                                color: colors.orange,
                              }}
                              className="w-16 px-2 py-1.5 rounded-md border text-right text-sm font-mono focus:outline-none focus:ring-1"
                            />
                          ) : (
                            <span style={{ color: colors.orange }} className="font-mono text-sm">
                              {product.weight}g
                            </span>
                          )}
                        </td>

                        {/* COG (Auto) */}
                        <td className="py-3 px-4 text-right">
                          <span 
                            style={{ color: colors.green }} 
                            className="font-mono text-sm font-semibold"
                          >
                            ${getCalculatedCog(product).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center mt-6 gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
            >
              {t('pagination.prev')}
            </button>
            <span style={{ color: colors.textSecondary }} className="text-sm px-4">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
            >
              {t('pagination.next')}
            </button>
          </div>
        )}
      </section>

      {/* Security Code Dialog (COGS batch) */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L2"
        title={t('cogs.saveChanges')}
        description={t('cogs.batchUpdate')}
        onConfirm={handleSave}
        onCancel={() => {
          setShowSecurityDialog(false);
          setSecurityError(null);
        }}
        isLoading={batchUpdateMutation.isPending}
        error={securityError || undefined}
      />

      {/* Security Code Dialog (Create) */}
      <SecurityCodeDialog
        isOpen={showCreateSecurityDialog}
        level="L2"
        title={t('actions.create')}
        description={t('security.requiresL2')}
        onConfirm={handleCreateConfirm}
        onCancel={() => {
          setShowCreateSecurityDialog(false);
          setCreateSecurityError(null);
        }}
        isLoading={createMutation.isPending}
        error={createSecurityError || undefined}
      />

      {/* Create Product Modal */}
      {showCreateModal && (
        <div
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <h2 style={{ color: colors.text }} className="text-lg font-semibold">{t('create.title')}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ color: colors.textTertiary }}
                className="hover:opacity-70 transition-opacity"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            {createSuccess ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div
                  style={{ backgroundColor: `${colors.green}20` }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                >
                  <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p style={{ color: colors.text }} className="font-medium">{t('messages.createSuccess')}</p>
                <p style={{ color: colors.textSecondary }} className="text-sm mt-1">SKU: {createForm.sku}</p>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                {/* SKU */}
                <div>
                  <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                    {t('form.sku.label')} <span style={{ color: colors.red }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={createForm.sku}
                    onChange={(e) => setCreateForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    placeholder={t('form.sku.placeholder')}
                    style={{ backgroundColor: colors.bgTertiary, borderColor: createErrors.sku ? colors.red : colors.border, color: colors.text }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 font-mono uppercase"
                  />
                  {createErrors.sku && <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.sku}</p>}
                </div>

                {/* Name */}
                <div>
                  <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">{t('form.name.label')}</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t('form.name.placeholder')}
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">{t('form.category.label')}</label>
                  <input
                    type="text"
                    value={createForm.category}
                    onChange={(e) => setCreateForm(f => ({ ...f, category: e.target.value }))}
                    placeholder={t('form.category.placeholder')}
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  />
                </div>

                {/* COGS */}
                <div>
                  <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">{t('form.cogs.label')}</label>
                  <div className="relative">
                    <span style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.cogs}
                      onChange={(e) => setCreateForm(f => ({ ...f, cogs: e.target.value }))}
                      placeholder={t('form.cogs.placeholder')}
                      style={{ backgroundColor: colors.bgTertiary, borderColor: createErrors.cogs ? colors.red : colors.border, color: colors.text }}
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    />
                  </div>
                  {createErrors.cogs && <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.cogs}</p>}
                </div>

                {/* UPC */}
                <div>
                  <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">{t('form.upc.label')}</label>
                  <input
                    type="text"
                    value={createForm.upc}
                    onChange={(e) => setCreateForm(f => ({ ...f, upc: e.target.value }))}
                    placeholder={t('form.upc.placeholder')}
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Modal Footer */}
            {!createSuccess && (
              <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleCreateSubmit}
                  disabled={createMutation.isPending}
                  style={{ backgroundColor: colors.blue, color: '#ffffff' }}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {createMutation.isPending ? tCommon('saving') : t('actions.create')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
