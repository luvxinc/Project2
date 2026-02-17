'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { api } from '@/lib/api/client';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

// 产品类型
interface SkuItem {
  id: string;
  sku: string;
  name: string | null;
}

export default function BarcodePage() {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [copies, setCopies] = useState(1);
  const [search, setSearch] = useState('');
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

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

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-sku-list'],
    queryFn: () => productsApi.getSkuList(),
    enabled: isClient && !!currentUser,
  });

  // V1 parity: dynamic security policy check — {% security_inputs "btn_generate_barcode" %}
  const { data: actionPolicy } = useQuery({
    queryKey: ['action-policy', 'btn_generate_barcode'],
    queryFn: () => api.get<{ actionKey: string; requiredTokens: string[]; requiresSecurityCode: boolean }>(
      '/auth/security-policies/action/btn_generate_barcode'
    ),
    enabled: isClient && !!currentUser,
    staleTime: 30_000, // 30s cache — policy changes propagate within 30s
  });

  // Determine the highest security level needed from the dynamic policy
  const getSecurityLevel = (): 'L0' | 'L1' | 'L2' | 'L3' | 'L4' => {
    const tokens = actionPolicy?.requiredTokens || [];
    const levelMap: Record<string, 'L0' | 'L1' | 'L2' | 'L3' | 'L4'> = {
      user: 'L0', query: 'L1', modify: 'L2', db: 'L3', system: 'L4',
    };
    const secCodeKeyMap: Record<string, 'L0' | 'L1' | 'L2' | 'L3' | 'L4'> = {
      sec_code_l0: 'L0', sec_code_l1: 'L1', sec_code_l2: 'L2', sec_code_l3: 'L3', sec_code_l4: 'L4',
    };
    // Check both token type names and sec_code keys
    for (const t of tokens) {
      if (levelMap[t]) return levelMap[t];
      if (secCodeKeyMap[t]) return secCodeKeyMap[t];
    }
    return 'L3'; // default fallback
  };

  // Build the security code key for the API request
  const getSecCodeKey = (): string => {
    const level = getSecurityLevel();
    return `sec_code_${level.toLowerCase()}`;
  };

  const generateMutation = useMutation({
    mutationFn: async (data: { skus: string[]; copiesPerSku: number; format: 'CODE128'; [key: string]: unknown }) => {
      const blob = await productsApi.generateBarcodePdf(data);
      // 触发下载
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `barcodes_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return blob;
    },
    onSuccess: () => {
      setShowSecurityDialog(false);
      setSecurityError(null);
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  // 切换选择
  const toggleSku = (sku: string) => {
    setSelectedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  // 过滤产品
  const filteredProducts = products.filter(
    (p: SkuItem) =>
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.name?.toLowerCase().includes(search.toLowerCase())
  );

  // 全选/取消全选
  const toggleAll = () => {
    if (selectedSkus.length === filteredProducts.length) {
      setSelectedSkus([]);
    } else {
      setSelectedSkus(filteredProducts.map((p: SkuItem) => p.sku));
    }
  };

  // 生成条形码 — V1 parity: CODE128 only, dynamic security policy
  const handleGenerate = (secCode?: string) => {
    const payload: Record<string, unknown> = {
      skus: selectedSkus,
      copiesPerSku: copies,
      format: 'CODE128' as const,
    };
    // Only include security code if one was provided
    if (secCode) {
      payload[getSecCodeKey()] = secCode;
    }
    generateMutation.mutate(payload as any);
  };

  // Handle generate button click — check dynamic policy first
  const handleGenerateClick = () => {
    const requiresSecurity = actionPolicy?.requiresSecurityCode ?? true; // default: require
    if (requiresSecurity) {
      setShowSecurityDialog(true);
    } else {
      // No security code required — call API directly
      handleGenerate();
    }
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
      <section className="max-w-[1200px] mx-auto px-6 pt-12 pb-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/products" style={{ color: colors.blue }}>
            {t('module.title')}
          </Link>
          <span style={{ color: colors.textTertiary }}>/</span>
          <span style={{ color: colors.textSecondary }}>{t('barcode.title')}</span>
        </div>

        {/* Title & Description */}
        <h1
          style={{ color: colors.text }}
          className="text-[32px] font-semibold tracking-tight mb-2"
        >
          {t('barcode.title')}
        </h1>
        <p style={{ color: colors.textSecondary }} className="text-[17px]">
          {t('barcode.description')}
        </p>
      </section>

      {/* Main Content */}
      <section className="max-w-[1200px] mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Product Selection */}
          <div className="lg:col-span-2">
            <div
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              }}
              className="rounded-2xl border overflow-hidden"
            >
              {/* Search & Select All */}
              <div
                style={{ borderColor: colors.border }}
                className="p-4 border-b flex items-center gap-4"
              >
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
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
                      backgroundColor: colors.bgTertiary,
                      borderColor: colors.border,
                      color: colors.text,
                    }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 text-sm"
                  />
                </div>
                <button
                  onClick={toggleAll}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    color: colors.text,
                  }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                >
                  {selectedSkus.length === filteredProducts.length
                    ? tCommon('deselectAll')
                    : tCommon('selectAll')}
                </button>
              </div>

              {/* Product List */}
              <div className="max-h-[500px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div
                      className="w-8 h-8 border-2 rounded-full animate-spin"
                      style={{ borderColor: colors.border, borderTopColor: colors.blue }}
                    />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <p style={{ color: colors.textSecondary }}>{t('list.noProducts')}</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: colors.border }}>
                    {filteredProducts.map((product: SkuItem) => (
                      <label
                        key={product.id}
                        className="flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-opacity-50"
                        style={{
                          backgroundColor: selectedSkus.includes(product.sku)
                            ? `${colors.blue}10`
                            : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSkus.includes(product.sku)}
                          onChange={() => toggleSku(product.sku)}
                          className="w-5 h-5 rounded border-2 cursor-pointer"
                          style={{ accentColor: colors.blue }}
                        />
                        <div className="flex-1">
                          <p style={{ color: colors.text }} className="font-mono text-sm">
                            {product.sku}
                          </p>
                          {product.name && (
                            <p style={{ color: colors.textSecondary }} className="text-sm">
                              {product.name}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Options */}
          <div>
            <div
              style={{
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              }}
              className="rounded-2xl border p-6 sticky top-6"
            >
              <h3
                style={{ color: colors.text }}
                className="text-lg font-semibold mb-6"
              >
                {t('barcode.selectProducts')}
              </h3>

              {/* Selected Count */}
              <div
                style={{
                  backgroundColor: `${colors.blue}15`,
                  color: colors.blue,
                }}
                className="rounded-xl p-4 mb-6 text-center"
              >
                <span className="text-2xl font-semibold">{selectedSkus.length}</span>
                <span className="ml-2 text-sm">{t('list.productCount')}</span>
              </div>

              {/* Format — V1 parity: CODE128 fixed, no user selection */}
              <div className="mb-6">
                <label
                  style={{ color: colors.text }}
                  className="block text-sm font-medium mb-3"
                >
                  {t('barcode.format')}
                </label>
                <div
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{
                    backgroundColor: `${colors.blue}15`,
                    borderColor: colors.blue,
                    borderWidth: 1,
                  }}
                >
                  <svg className="w-5 h-5" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ color: colors.text }} className="text-sm font-medium">CODE128</span>
                </div>
              </div>

              {/* Copies */}
              <div className="mb-8">
                <label
                  style={{ color: colors.text }}
                  className="block text-sm font-medium mb-3"
                >
                  {t('barcode.copies')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: colors.border,
                    color: colors.text,
                  }}
                  className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 text-center text-lg font-medium"
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateClick}
                disabled={generateMutation.isPending || selectedSkus.length === 0}
                style={{
                  backgroundColor: colors.blue,
                  color: '#ffffff',
                }}
                className="w-full py-3 rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {generateMutation.isPending ? tCommon('loading') : t('barcode.generate')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Security Code Dialog — V1 parity: dynamic policy from action registry */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level={getSecurityLevel()}
        title={t('barcode.generate')}
        description={t('security.requiresL3')}
        onConfirm={handleGenerate}
        onCancel={() => {
          setShowSecurityDialog(false);
          setSecurityError(null);
        }}
        isLoading={generateMutation.isPending}
        error={securityError || undefined}
      />
    </div>
  );
}
