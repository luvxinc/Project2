'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

// 表单状态类型
interface FormData {
  sku: string;
  name: string;
  category: string;
  cogs: string;
  upc: string;
}

// 验证错误类型
interface FormErrors {
  sku?: string;
  name?: string;
  category?: string;
  cogs?: string;
  upc?: string;
}

export default function CreateProductPage() {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    sku: '',
    name: '',
    category: '',
    cogs: '',
    upc: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: (data: { sku: string; name?: string; category?: string; cogs?: number; upc?: string; sec_code_l2: string }) =>
      productsApi.create(data),
    onSuccess: () => {
      setSuccess(true);
      createSecurity.onCancel();
      setTimeout(() => {
        router.push('/products/cogs');
      }, 2000);
    },
    onError: (err: any) => {
      if (err?.message?.includes('skuExists') || err?.statusCode === 409) {
        setErrors({ sku: t('errors.skuExists') });
        createSecurity.onCancel();
      } else {
        createSecurity.setError(tCommon('securityCode.invalid'));
      }
    },
  });

  const createSecurity = useSecurityAction({
    actionKey: 'btn_create_skus',
    level: 'L2',
    onExecute: (code) => createMutation.mutate({
      sku: formData.sku.toUpperCase(),
      name: formData.name || undefined,
      category: formData.category || undefined,
      cogs: formData.cogs ? parseFloat(formData.cogs) : 0,
      upc: formData.upc || undefined,
      sec_code_l2: code,
    }),
  });

  // 验证 SKU 格式
  const validateSku = (sku: string): string | undefined => {
    if (!sku.trim()) {
      return t('errors.invalidSku');
    }
    if (sku.length < 3 || sku.length > 50) {
      return t('form.sku.hint');
    }
    if (!/^[A-Z0-9_-]+$/.test(sku.toUpperCase())) {
      return t('form.sku.hint');
    }
    return undefined;
  };

  // 验证 COGS
  const validateCogs = (cogs: string): string | undefined => {
    if (cogs && (isNaN(parseFloat(cogs)) || parseFloat(cogs) < 0)) {
      return t('errors.invalidCogs');
    }
    return undefined;
  };

  // 验证整个表单
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const skuError = validateSku(formData.sku);
    if (skuError) newErrors.sku = skuError;

    const cogsError = validateCogs(formData.cogs);
    if (cogsError) newErrors.cogs = cogsError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 处理输入变更
  const handleChange = (field: keyof FormData, value: string) => {
    // SKU 自动转大写
    const processedValue = field === 'sku' ? value.toUpperCase() : value;
    
    setFormData((prev) => ({
      ...prev,
      [field]: processedValue,
    }));

    // 清除该字段的错误
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    createSecurity.trigger();
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
            className="inline-flex items-center px-6 py-2 rounded-full"
            style={{ backgroundColor: colors.blue, color: colors.white }}
          >
            {tCommon('signIn')}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div
            style={{ backgroundColor: `${colors.green}20` }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <svg
              className="w-10 h-10"
              style={{ color: colors.green }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 style={{ color: colors.text }} className="text-2xl font-semibold mb-2">
            {t('messages.createSuccess')}
          </h2>
          <p style={{ color: colors.textSecondary }}>
            SKU: {formData.sku}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="max-w-[800px] mx-auto px-6 pt-12 pb-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/products" style={{ color: colors.blue }}>
            {t('module.title')}
          </Link>
          <span style={{ color: colors.textTertiary }}>/</span>
          <span style={{ color: colors.textSecondary }}>{t('create.title')}</span>
        </div>

        {/* Title & Description */}
        <h1
          style={{ color: colors.text }}
          className="text-[32px] font-semibold tracking-tight mb-2"
        >
          {t('create.title')}
        </h1>
        <p style={{ color: colors.textSecondary }} className="text-[17px]">
          {t('create.description')}
        </p>
      </section>

      {/* Form */}
      <section className="max-w-[800px] mx-auto px-6 pb-20">
        <form onSubmit={handleSubmit}>
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
            }}
            className="rounded-2xl border p-8"
          >
            {/* SKU Field */}
            <div className="mb-6">
              <label
                style={{ color: colors.text }}
                className="block text-sm font-medium mb-2"
              >
                {t('form.sku.label')} <span style={{ color: colors.red }}>*</span>
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
                placeholder={t('form.sku.placeholder')}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: errors.sku ? colors.red : colors.border,
                  color: colors.text,
                }}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 font-mono uppercase"
              />
              {errors.sku ? (
                <p style={{ color: colors.red }} className="mt-2 text-sm">
                  {errors.sku}
                </p>
              ) : (
                <p style={{ color: colors.textTertiary }} className="mt-2 text-sm">
                  {t('form.sku.hint')}
                </p>
              )}
            </div>

            {/* Name Field */}
            <div className="mb-6">
              <label
                style={{ color: colors.text }}
                className="block text-sm font-medium mb-2"
              >
                {t('form.name.label')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('form.name.placeholder')}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
              />
            </div>

            {/* Category Field */}
            <div className="mb-6">
              <label
                style={{ color: colors.text }}
                className="block text-sm font-medium mb-2"
              >
                {t('form.category.label')}
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                placeholder={t('form.category.placeholder')}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
              />
            </div>

            {/* COGS Field */}
            <div className="mb-6">
              <label
                style={{ color: colors.text }}
                className="block text-sm font-medium mb-2"
              >
                {t('form.cogs.label')}
              </label>
              <div className="relative">
                <span
                  style={{ color: colors.textSecondary }}
                  className="absolute left-4 top-1/2 -translate-y-1/2"
                >
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cogs}
                  onChange={(e) => handleChange('cogs', e.target.value)}
                  placeholder={t('form.cogs.placeholder')}
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: errors.cogs ? colors.red : colors.border,
                    color: colors.text,
                  }}
                  className="w-full pl-8 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
                />
              </div>
              {errors.cogs ? (
                <p style={{ color: colors.red }} className="mt-2 text-sm">
                  {errors.cogs}
                </p>
              ) : (
                <p style={{ color: colors.textTertiary }} className="mt-2 text-sm">
                  {t('form.cogs.hint')}
                </p>
              )}
            </div>

            {/* UPC Field */}
            <div className="mb-8">
              <label
                style={{ color: colors.text }}
                className="block text-sm font-medium mb-2"
              >
                {t('form.upc.label')}
              </label>
              <input
                type="text"
                value={formData.upc}
                onChange={(e) => handleChange('upc', e.target.value)}
                placeholder={t('form.upc.placeholder')}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 font-mono"
              />
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{
                  backgroundColor: colors.blue,
                  color: colors.white,
                }}
                className="flex-1 py-3 rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending ? tCommon('saving') : t('actions.create')}
              </button>
              <Link
                href="/products"
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                }}
                className="px-8 py-3 rounded-xl font-medium transition-opacity hover:opacity-80"
              >
                {tCommon('cancel')}
              </Link>
            </div>
          </div>
        </form>
      </section>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={createSecurity.isOpen}
        level={createSecurity.level}
        title={t('actions.create')}
        description={t('security.requiresL2')}
        onConfirm={createSecurity.onConfirm}
        onCancel={createSecurity.onCancel}
        isLoading={createMutation.isPending}
        error={createSecurity.error}
      />
    </div>
  );
}
