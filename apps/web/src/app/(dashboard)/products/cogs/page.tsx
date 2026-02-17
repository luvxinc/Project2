'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, Product, CategoryHierarchy } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

// Edit modal form state
interface EditForm {
  category: string;
  subcategory: string;
  type: string;
  cost: string;
  freight: string;
  weight: string;
}

// Custom input modes for new values
interface CustomInputMode {
  category: boolean;
  subcategory: boolean;
  type: boolean;
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

  // Column filter state
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    category: '', subcategory: '', type: '',
    cost: '', freight: '', weight: '',
  });
  const [customInput, setCustomInput] = useState<CustomInputMode>({
    category: false, subcategory: false, type: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateSecurityDialog, setShowCreateSecurityDialog] = useState(false);
  const [createSecurityError, setCreateSecurityError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<EditForm & { sku: string }>({
    sku: '', category: '', subcategory: '', type: '',
    cost: '0.00', freight: '0.00', weight: '0',
  });
  const [createCustomInput, setCreateCustomInput] = useState<CustomInputMode>({
    category: false, subcategory: false, type: false,
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createSuccess, setCreateSuccess] = useState(false);
  const [skuCheckMessage, setSkuCheckMessage] = useState<string | null>(null);

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

  // Fetch ALL products (no pagination — scroll-based)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', 'all', search],
    queryFn: () => productsApi.findAll({ page: 1, limit: 9999, search: search || undefined }),
    enabled: isClient && !!currentUser,
  });

  // Fetch category hierarchy
  const { data: hierarchyData } = useQuery({
    queryKey: ['products', 'hierarchy'],
    queryFn: () => productsApi.getHierarchy(),
    enabled: isClient && !!currentUser,
  });

  const products = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const hierarchy: CategoryHierarchy = (hierarchyData as any)?.data ?? hierarchyData ?? {};

  // Distinct filter options (derived from loaded products)
  const filterOptions = useMemo(() => {
    const cats = new Set<string>();
    const subs = new Set<string>();
    const types = new Set<string>();
    for (const p of products) {
      if (p.category) cats.add(p.category);
      if (p.subcategory) subs.add(p.subcategory);
      if (p.type) types.add(p.type);
    }
    return {
      categories: Array.from(cats).sort(),
      subcategories: Array.from(subs).sort(),
      types: Array.from(types).sort(),
    };
  }, [products]);

  // Filtered products (search + column filters)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (filterCategory && (p.category || '') !== filterCategory) return false;
      if (filterSubcategory && (p.subcategory || '') !== filterSubcategory) return false;
      if (filterType && (p.type || '') !== filterType) return false;
      return true;
    });
  }, [products, filterCategory, filterSubcategory, filterType]);

  const hasActiveFilters = filterCategory || filterSubcategory || filterType;

  const clearAllFilters = useCallback(() => {
    setFilterCategory('');
    setFilterSubcategory('');
    setFilterType('');
  }, []);

  // All category options
  const categoryOptions = useMemo(() => {
    return Object.keys(hierarchy).sort();
  }, [hierarchy]);

  // Helper: get subcategory options for a given category
  const getSubcategoryOptions = useCallback((cat: string) => {
    if (!cat || !hierarchy[cat]) return [];
    return Object.keys(hierarchy[cat]).sort();
  }, [hierarchy]);

  // Helper: get type options for a given category + subcategory
  const getTypeOptions = useCallback((cat: string, sub: string) => {
    if (!cat || !sub || !hierarchy[cat] || !hierarchy[cat][sub]) return [];
    return hierarchy[cat][sub].sort();
  }, [hierarchy]);

  // Derived: subcategory options for EDIT form
  const subcategoryOptions = useMemo(() => {
    return getSubcategoryOptions(editForm.category);
  }, [editForm.category, getSubcategoryOptions]);

  // Derived: type options for EDIT form
  const typeOptions = useMemo(() => {
    return getTypeOptions(editForm.category, editForm.subcategory);
  }, [editForm.category, editForm.subcategory, getTypeOptions]);

  // Derived: subcategory options for CREATE form
  const createSubcategoryOptions = useMemo(() => {
    return getSubcategoryOptions(createForm.category);
  }, [createForm.category, getSubcategoryOptions]);

  // Derived: type options for CREATE form
  const createTypeOptions = useMemo(() => {
    return getTypeOptions(createForm.category, createForm.subcategory);
  }, [createForm.category, createForm.subcategory, getTypeOptions]);

  // Existing SKUs set for uniqueness validation
  const existingSkus = useMemo(() => {
    return new Set(products.map(p => p.sku.toUpperCase()));
  }, [products]);

  // Update mutation (single product)
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: Record<string, any> }) =>
      productsApi.updateProduct(data.id, data.payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowSecurityDialog(false);
      setSecurityError(null);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingProduct(null);
      }, 1200);
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      productsApi.create(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreateSecurityDialog(false);
      setCreateSecurityError(null);
      setCreateSuccess(true);
      setTimeout(() => {
        setCreateSuccess(false);
        setShowCreateModal(false);
        resetCreateForm();
      }, 1500);
    },
    onError: () => {
      setCreateSecurityError(tCommon('securityCode.invalid'));
    },
  });

  // Reset create form
  const resetCreateForm = useCallback(() => {
    setCreateForm({
      sku: '', category: '', subcategory: '', type: '',
      cost: '0.00', freight: '0.00', weight: '0',
    });
    setCreateCustomInput({ category: false, subcategory: false, type: false });
    setCreateErrors({});
    setSkuCheckMessage(null);
  }, []);

  // Open create modal
  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setCreateSuccess(false);
    setShowCreateModal(true);
  }, [resetCreateForm]);

  // Open edit modal
  const openEditModal = useCallback((product: Product) => {
    setEditingProduct(product);
    setEditForm({
      category: product.category || '',
      subcategory: product.subcategory || '',
      type: product.type || '',
      cost: (product.cost ?? 0).toFixed(2),
      freight: (product.freight ?? 0).toFixed(2),
      weight: String(product.weight ?? 0),
    });
    setCustomInput({ category: false, subcategory: false, type: false });
    setFormErrors({});
    setSaveSuccess(false);
    setSecurityError(null);
  }, []);

  // Shared validation helper for cost/freight/weight
  const validateNumericFields = useCallback((form: { cost: string; freight: string; weight: string }): Record<string, string> => {
    const errors: Record<string, string> = {};
    const cost = parseFloat(form.cost);
    const freight = parseFloat(form.freight);
    const weight = parseInt(form.weight);

    if (isNaN(cost) || cost < 0) errors.cost = 'Must be ≥ 0';
    else if (!/^\d+(\.\d{1,2})?$/.test(form.cost)) errors.cost = 'Max 2 decimal places';

    if (isNaN(freight) || freight < 0) errors.freight = 'Must be ≥ 0';
    else if (!/^\d+(\.\d{1,2})?$/.test(form.freight)) errors.freight = 'Max 2 decimal places';

    if (isNaN(weight) || weight < 0) errors.weight = 'Must be ≥ 0';
    else if (!Number.isInteger(Number(form.weight))) errors.weight = 'Must be integer';

    return errors;
  }, []);

  // Validate edit form
  const validateForm = useCallback((): boolean => {
    const errors = validateNumericFields(editForm);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [editForm, validateNumericFields]);

  // Validate create form
  const validateCreateForm = useCallback((): boolean => {
    const errors = validateNumericFields(createForm);
    if (!createForm.sku.trim()) errors.sku = t('form.sku.required');
    else if (existingSkus.has(createForm.sku.trim().toUpperCase())) errors.sku = t('create.skuDuplicate');
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  }, [createForm, validateNumericFields, existingSkus, t]);

  // Handle save (edit)
  const handleSaveConfirm = useCallback((secCode: string) => {
    if (!editingProduct) return;
    const payload: Record<string, any> = {
      category: editForm.category || null,
      subcategory: editForm.subcategory || null,
      type: editForm.type || null,
      cost: parseFloat(editForm.cost),
      freight: parseFloat(editForm.freight),
      weight: parseInt(editForm.weight),
      sec_code_l2: secCode,
    };
    updateMutation.mutate({ id: editingProduct.id, payload });
  }, [editingProduct, editForm, updateMutation]);

  // Handle create confirm
  const handleCreateConfirm = useCallback((secCode: string) => {
    createMutation.mutate({
      sku: createForm.sku.toUpperCase(),
      category: createForm.category || undefined,
      subcategory: createForm.subcategory || undefined,
      type: createForm.type || undefined,
      cost: parseFloat(createForm.cost),
      freight: parseFloat(createForm.freight),
      weight: parseInt(createForm.weight),
      sec_code_l2: secCode,
    });
  }, [createForm, createMutation]);

  // Handle create submit (triggers security dialog)
  const handleCreateSubmit = useCallback(() => {
    if (validateCreateForm()) {
      setShowCreateSecurityDialog(true);
    }
  }, [validateCreateForm]);

  // Handle category change for EDIT (cascading: reset sub + type)
  const handleCategoryChange = useCallback((value: string) => {
    setEditForm(prev => ({
      ...prev,
      category: value,
      subcategory: '',
      type: '',
    }));
    setCustomInput(prev => ({ ...prev, subcategory: false, type: false }));
  }, []);

  // Handle subcategory change for EDIT (cascading: reset type)
  const handleSubcategoryChange = useCallback((value: string) => {
    setEditForm(prev => ({
      ...prev,
      subcategory: value,
      type: '',
    }));
    setCustomInput(prev => ({ ...prev, type: false }));
  }, []);

  // Handle category change for CREATE (cascading)
  const handleCreateCategoryChange = useCallback((value: string) => {
    setCreateForm(prev => ({
      ...prev,
      category: value,
      subcategory: '',
      type: '',
    }));
    setCreateCustomInput(prev => ({ ...prev, subcategory: false, type: false }));
  }, []);

  // Handle subcategory change for CREATE (cascading)
  const handleCreateSubcategoryChange = useCallback((value: string) => {
    setCreateForm(prev => ({
      ...prev,
      subcategory: value,
      type: '',
    }));
    setCreateCustomInput(prev => ({ ...prev, type: false }));
  }, []);

  // SKU change handler with real-time uniqueness check
  const handleSkuChange = useCallback((value: string) => {
    const upperSku = value.toUpperCase();
    setCreateForm(prev => ({ ...prev, sku: upperSku }));
    if (upperSku.trim() && existingSkus.has(upperSku.trim())) {
      setSkuCheckMessage(t('create.skuDuplicate'));
    } else {
      setSkuCheckMessage(null);
    }
  }, [existingSkus, t]);

  // Calculated COGS preview for EDIT modal
  const previewCogs = useMemo(() => {
    const cost = parseFloat(editForm.cost) || 0;
    const freight = parseFloat(editForm.freight) || 0;
    return (cost + freight).toFixed(2);
  }, [editForm.cost, editForm.freight]);

  // Calculated COGS preview for CREATE modal
  const createPreviewCogs = useMemo(() => {
    const cost = parseFloat(createForm.cost) || 0;
    const freight = parseFloat(createForm.freight) || 0;
    return (cost + freight).toFixed(2);
  }, [createForm.cost, createForm.freight]);

  if (!isClient) return null;

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

      {/* Search Bar + Filters + New SKU Button */}
      <section className="max-w-[1400px] mx-auto px-6 pb-4">
        <div className="flex items-center gap-4 mb-3">
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
              onChange={(e) => setSearch(e.target.value)}
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
            {hasActiveFilters && (
              <span style={{ color: colors.orange }} className="ml-2">
                ({filteredProducts.length} filtered)
              </span>
            )}
          </span>
          <button
            onClick={openCreateModal}
            style={{ backgroundColor: '#30d158', color: '#ffffff' }}
            className="ml-auto px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('actions.create')}
          </button>
        </div>

        {/* Column Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span style={{ color: colors.textTertiary }} className="text-xs font-medium uppercase tracking-wider">Filters</span>
          </div>

          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory(''); setFilterType(''); }}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: filterCategory ? colors.blue : colors.border,
              color: filterCategory ? colors.blue : colors.textSecondary,
            }}
            className="px-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 cursor-pointer min-w-[120px]"
          >
            <option value="">All Categories</option>
            {filterOptions.categories.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          <select
            value={filterSubcategory}
            onChange={(e) => { setFilterSubcategory(e.target.value); setFilterType(''); }}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: filterSubcategory ? colors.blue : colors.border,
              color: filterSubcategory ? colors.blue : colors.textSecondary,
            }}
            className="px-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 cursor-pointer min-w-[140px]"
          >
            <option value="">All SubCategories</option>
            {filterOptions.subcategories.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: filterType ? colors.blue : colors.border,
              color: filterType ? colors.blue : colors.textSecondary,
            }}
            className="px-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 cursor-pointer min-w-[100px]"
          >
            <option value="">All Types</option>
            {filterOptions.types.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ color: colors.red }}
              className="text-xs font-medium hover:opacity-70 transition-opacity flex items-center gap-1 ml-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Products Table — scroll-based, no pagination */}
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
                    <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
                      SKU
                    </th>
                    <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
                      Category
                    </th>
                    <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap">
                      SubCategory
                    </th>
                    <th style={{ color: colors.textSecondary }} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24">
                      Type
                    </th>
                    <th style={{ color: colors.blue }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24">
                      Cost
                    </th>
                    <th style={{ color: colors.blue }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24">
                      Freight
                    </th>
                    <th style={{ color: colors.orange }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-20">
                      Weight
                    </th>
                    <th style={{ color: colors.green }} className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap w-24">
                      COG
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, index) => (
                    <tr
                      key={product.id}
                      onClick={() => openEditModal(product)}
                      style={{ borderColor: colors.border }}
                      className={`${index !== filteredProducts.length - 1 ? 'border-b' : ''} transition-colors cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]`}
                    >
                      <td style={{ color: colors.text }} className="py-3 px-4 font-mono text-sm whitespace-nowrap">
                        {product.sku}
                      </td>
                      <td className="py-3 px-4">
                        <span style={{ color: colors.textSecondary }} className="text-sm">
                          {product.category || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span style={{ color: colors.textSecondary }} className="text-sm">
                          {product.subcategory || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span style={{ color: colors.textSecondary }} className="text-sm">
                          {product.type || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span style={{ color: colors.blue }} className="font-mono text-sm">
                          ${(product.cost ?? 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span style={{ color: colors.blue }} className="font-mono text-sm">
                          ${(product.freight ?? 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span style={{ color: colors.orange }} className="font-mono text-sm">
                          {product.weight}g
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span style={{ color: colors.green }} className="font-mono text-sm font-semibold">
                          ${((product.cost ?? 0) + (product.freight ?? 0)).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ Edit Product Modal ═══════════ */}
      {editingProduct && (
        <div
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !updateMutation.isPending) setEditingProduct(null); }}
        >
          <div
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <h2 style={{ color: colors.text }} className="text-lg font-semibold">
                  {t('cogs.modal.title')}
                </h2>
                <p style={{ color: colors.textTertiary }} className="text-sm font-mono mt-0.5">
                  {editingProduct.sku}
                </p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                disabled={updateMutation.isPending}
                style={{ color: colors.textTertiary }}
                className="hover:opacity-70 transition-opacity disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success State */}
            {saveSuccess ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div
                  style={{ backgroundColor: `${colors.green}20` }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                >
                  <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p style={{ color: colors.text }} className="font-medium">{t('cogs.modal.success')}</p>
              </div>
            ) : (
              <>
                {/* Modal Body */}
                <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

                  {/* Read-only: SKU */}
                  <div>
                    <label style={{ color: colors.textSecondary }} className="block text-xs font-medium mb-1.5 uppercase tracking-wider">
                      SKU <span style={{ color: colors.textTertiary }} className="normal-case tracking-normal font-normal">— {t('cogs.modal.readOnly')}</span>
                    </label>
                    <div
                      style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textSecondary }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono"
                    >
                      {editingProduct.sku}
                    </div>
                  </div>

                  {/* Read-only: COGS (auto-calculated preview) */}
                  <div>
                    <label style={{ color: colors.textSecondary }} className="block text-xs font-medium mb-1.5 uppercase tracking-wider">
                      COGS <span style={{ color: colors.textTertiary }} className="normal-case tracking-normal font-normal">— {t('cogs.modal.autoCalculated')}</span>
                    </label>
                    <div
                      style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.green }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono font-semibold"
                    >
                      ${previewCogs}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderColor: colors.border }} className="border-t" />

                  {/* Cost */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.cost')}
                    </label>
                    <div className="relative">
                      <span style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.cost}
                        onChange={(e) => setEditForm(f => ({ ...f, cost: e.target.value }))}
                        style={{
                          backgroundColor: colors.bgTertiary,
                          borderColor: formErrors.cost ? colors.red : colors.border,
                          color: colors.blue,
                        }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                      />
                    </div>
                    {formErrors.cost ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{formErrors.cost}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.costHint')}</p>
                    )}
                  </div>

                  {/* Freight */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.freight')}
                    </label>
                    <div className="relative">
                      <span style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.freight}
                        onChange={(e) => setEditForm(f => ({ ...f, freight: e.target.value }))}
                        style={{
                          backgroundColor: colors.bgTertiary,
                          borderColor: formErrors.freight ? colors.red : colors.border,
                          color: colors.blue,
                        }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                      />
                    </div>
                    {formErrors.freight ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{formErrors.freight}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.freightHint')}</p>
                    )}
                  </div>

                  {/* Weight */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.weight')}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editForm.weight}
                      onChange={(e) => setEditForm(f => ({ ...f, weight: e.target.value }))}
                      style={{
                        backgroundColor: colors.bgTertiary,
                        borderColor: formErrors.weight ? colors.red : colors.border,
                        color: colors.orange,
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                    />
                    {formErrors.weight ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{formErrors.weight}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.weightHint')}</p>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ borderColor: colors.border }} className="border-t" />

                  {/* Category (cascading level 1) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.category')}
                    </label>
                    {customInput.category ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.category}
                          onChange={(e) => {
                            setEditForm(f => ({ ...f, category: e.target.value, subcategory: '', type: '' }));
                          }}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCustomInput(p => ({ ...p, category: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={editForm.category}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                        >
                          <option value="">{t('cogs.modal.selectCategory')}</option>
                          {categoryOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCustomInput(p => ({ ...p, category: true }));
                            setEditForm(f => ({ ...f, category: '', subcategory: '', type: '' }));
                          }}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SubCategory (cascading level 2) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.subcategory')}
                    </label>
                    {customInput.subcategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.subcategory}
                          onChange={(e) => {
                            setEditForm(f => ({ ...f, subcategory: e.target.value, type: '' }));
                          }}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCustomInput(p => ({ ...p, subcategory: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={editForm.subcategory}
                          onChange={(e) => handleSubcategoryChange(e.target.value)}
                          disabled={!editForm.category}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: editForm.category ? colors.text : colors.textTertiary,
                          }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                        >
                          <option value="">{t('cogs.modal.selectSubcategory')}</option>
                          {subcategoryOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCustomInput(p => ({ ...p, subcategory: true }));
                            setEditForm(f => ({ ...f, subcategory: '', type: '' }));
                          }}
                          disabled={!editForm.category}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Type (cascading level 3) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.type')}
                    </label>
                    {customInput.type ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.type}
                          onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value }))}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCustomInput(p => ({ ...p, type: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={editForm.type}
                          onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value }))}
                          disabled={!editForm.subcategory}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: editForm.subcategory ? colors.text : colors.textTertiary,
                          }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                        >
                          <option value="">{t('cogs.modal.selectType')}</option>
                          {typeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCustomInput(p => ({ ...p, type: true }));
                            setEditForm(f => ({ ...f, type: '' }));
                          }}
                          disabled={!editForm.subcategory}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                  <button
                    onClick={() => setEditingProduct(null)}
                    disabled={updateMutation.isPending}
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={() => {
                      if (validateForm()) {
                        setShowSecurityDialog(true);
                      }
                    }}
                    disabled={updateMutation.isPending}
                    style={{ backgroundColor: colors.blue, color: '#ffffff' }}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {t('cogs.modal.save')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Security Code Dialog (Edit) */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L2"
        title={t('cogs.modal.title')}
        description={t('security.requiresL2')}
        onConfirm={handleSaveConfirm}
        onCancel={() => {
          setShowSecurityDialog(false);
          setSecurityError(null);
        }}
        isLoading={updateMutation.isPending}
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
          onClick={(e) => { if (e.target === e.currentTarget && !createMutation.isPending) setShowCreateModal(false); }}
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
                disabled={createMutation.isPending}
                style={{ color: colors.textTertiary }}
                className="hover:opacity-70 transition-opacity disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success State */}
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
              <>
                {/* Modal Body */}
                <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

                  {/* SKU (editable, unique) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      SKU <span style={{ color: colors.red }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.sku}
                      onChange={(e) => handleSkuChange(e.target.value)}
                      placeholder={t('form.sku.placeholder')}
                      style={{
                        backgroundColor: colors.bgTertiary,
                        borderColor: createErrors.sku || skuCheckMessage ? colors.red : colors.border,
                        color: colors.text,
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 font-mono uppercase"
                    />
                    {createErrors.sku && <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.sku}</p>}
                    {!createErrors.sku && skuCheckMessage && <p style={{ color: colors.red }} className="mt-1 text-xs">{skuCheckMessage}</p>}
                  </div>

                  {/* Read-only: COGS (auto-calculated preview) */}
                  <div>
                    <label style={{ color: colors.textSecondary }} className="block text-xs font-medium mb-1.5 uppercase tracking-wider">
                      COGS <span style={{ color: colors.textTertiary }} className="normal-case tracking-normal font-normal">— {t('cogs.modal.autoCalculated')}</span>
                    </label>
                    <div
                      style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.green }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono font-semibold"
                    >
                      ${createPreviewCogs}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderColor: colors.border }} className="border-t" />

                  {/* Cost */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.cost')}
                    </label>
                    <div className="relative">
                      <span style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={createForm.cost}
                        onChange={(e) => setCreateForm(f => ({ ...f, cost: e.target.value }))}
                        style={{
                          backgroundColor: colors.bgTertiary,
                          borderColor: createErrors.cost ? colors.red : colors.border,
                          color: colors.blue,
                        }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                      />
                    </div>
                    {createErrors.cost ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.cost}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.costHint')}</p>
                    )}
                  </div>

                  {/* Freight */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.freight')}
                    </label>
                    <div className="relative">
                      <span style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={createForm.freight}
                        onChange={(e) => setCreateForm(f => ({ ...f, freight: e.target.value }))}
                        style={{
                          backgroundColor: colors.bgTertiary,
                          borderColor: createErrors.freight ? colors.red : colors.border,
                          color: colors.blue,
                        }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                      />
                    </div>
                    {createErrors.freight ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.freight}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.freightHint')}</p>
                    )}
                  </div>

                  {/* Weight */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.weight')}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={createForm.weight}
                      onChange={(e) => setCreateForm(f => ({ ...f, weight: e.target.value }))}
                      style={{
                        backgroundColor: colors.bgTertiary,
                        borderColor: createErrors.weight ? colors.red : colors.border,
                        color: colors.orange,
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                    />
                    {createErrors.weight ? (
                      <p style={{ color: colors.red }} className="mt-1 text-xs">{createErrors.weight}</p>
                    ) : (
                      <p style={{ color: colors.textTertiary }} className="mt-1 text-xs">{t('cogs.modal.weightHint')}</p>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ borderColor: colors.border }} className="border-t" />

                  {/* Category (cascading level 1) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.category')}
                    </label>
                    {createCustomInput.category ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.category}
                          onChange={(e) => setCreateForm(f => ({ ...f, category: e.target.value, subcategory: '', type: '' }))}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCreateCustomInput(p => ({ ...p, category: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={createForm.category}
                          onChange={(e) => handleCreateCategoryChange(e.target.value)}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                        >
                          <option value="">{t('cogs.modal.selectCategory')}</option>
                          {categoryOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCreateCustomInput(p => ({ ...p, category: true }));
                            setCreateForm(f => ({ ...f, category: '', subcategory: '', type: '' }));
                          }}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SubCategory (cascading level 2) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.subcategory')}
                    </label>
                    {createCustomInput.subcategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.subcategory}
                          onChange={(e) => setCreateForm(f => ({ ...f, subcategory: e.target.value, type: '' }))}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCreateCustomInput(p => ({ ...p, subcategory: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={createForm.subcategory}
                          onChange={(e) => handleCreateSubcategoryChange(e.target.value)}
                          disabled={!createForm.category}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: createForm.category ? colors.text : colors.textTertiary,
                          }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                        >
                          <option value="">{t('cogs.modal.selectSubcategory')}</option>
                          {createSubcategoryOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCreateCustomInput(p => ({ ...p, subcategory: true }));
                            setCreateForm(f => ({ ...f, subcategory: '', type: '' }));
                          }}
                          disabled={!createForm.category}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Type (cascading level 3) */}
                  <div>
                    <label style={{ color: colors.text }} className="block text-sm font-medium mb-1.5">
                      {t('cogs.modal.type')}
                    </label>
                    {createCustomInput.type ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.type}
                          onChange={(e) => setCreateForm(f => ({ ...f, type: e.target.value }))}
                          placeholder={t('cogs.modal.enterNew')}
                          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => setCreateCustomInput(p => ({ ...p, type: false }))}
                          style={{ color: colors.textTertiary }}
                          className="px-2 hover:opacity-70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={createForm.type}
                          onChange={(e) => setCreateForm(f => ({ ...f, type: e.target.value }))}
                          disabled={!createForm.subcategory}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: createForm.subcategory ? colors.text : colors.textTertiary,
                          }}
                          className="flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                        >
                          <option value="">{t('cogs.modal.selectType')}</option>
                          {createTypeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setCreateCustomInput(p => ({ ...p, type: true }));
                            setCreateForm(f => ({ ...f, type: '' }));
                          }}
                          disabled={!createForm.subcategory}
                          style={{ color: colors.blue, borderColor: colors.border }}
                          className="px-3 py-2.5 rounded-lg border text-xs font-medium hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                        >
                          {t('cogs.modal.addNew')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    disabled={createMutation.isPending}
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={handleCreateSubmit}
                    disabled={createMutation.isPending || !!skuCheckMessage}
                    style={{ backgroundColor: colors.blue, color: '#ffffff' }}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {createMutation.isPending ? tCommon('saving') : t('actions.create')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
