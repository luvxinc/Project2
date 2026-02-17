'use client';

import { useState, useEffect } from 'react';
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

interface SkuItem {
  id: string;
  sku: string;
  name: string | null;
}

/** V1 parity: each row = { sku, qtyPerBox, boxPerCtn } */
interface BarcodeRow {
  id: number;
  sku: string;
  qtyPerBox: string;
  boxPerCtn: string;
}

let rowIdCounter = 0;
function createEmptyRow(): BarcodeRow {
  return { id: ++rowIdCounter, sku: '', qtyPerBox: '', boxPerCtn: '' };
}

export default function BarcodePage() {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // V1 wizard: input rows
  const [rows, setRows] = useState<BarcodeRow[]>(() => [createEmptyRow()]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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

  // V1: SKU dropdown list
  const { data: skuList = [] } = useQuery({
    queryKey: ['products-sku-list'],
    queryFn: () => productsApi.getSkuList(),
    enabled: isClient && !!currentUser,
  });

  // V1 parity: dynamic security policy check
  const { data: actionPolicy } = useQuery({
    queryKey: ['action-policy', 'btn_generate_barcode'],
    queryFn: () => api.get<{ actionKey: string; requiredTokens: string[]; requiresSecurityCode: boolean }>(
      '/auth/security-policies/action/btn_generate_barcode'
    ),
    enabled: isClient && !!currentUser,
    staleTime: 30_000,
  });

  const getSecurityLevel = (): 'L0' | 'L1' | 'L2' | 'L3' | 'L4' => {
    const tokens = actionPolicy?.requiredTokens || [];
    const levelMap: Record<string, 'L0' | 'L1' | 'L2' | 'L3' | 'L4'> = {
      user: 'L0', query: 'L1', modify: 'L2', db: 'L3', system: 'L4',
    };
    const secCodeKeyMap: Record<string, 'L0' | 'L1' | 'L2' | 'L3' | 'L4'> = {
      sec_code_l0: 'L0', sec_code_l1: 'L1', sec_code_l2: 'L2', sec_code_l3: 'L3', sec_code_l4: 'L4',
    };
    for (const t of tokens) {
      if (levelMap[t]) return levelMap[t];
      if (secCodeKeyMap[t]) return secCodeKeyMap[t];
    }
    return 'L3';
  };

  const getSecCodeKey = (): string => {
    const level = getSecurityLevel();
    return `sec_code_${level.toLowerCase()}`;
  };

  // === Row management (V1 parity: addBarcodeRow, addMultipleBarcodeRows) ===
  const addRow = () => setRows(prev => [...prev, createEmptyRow()]);
  const addRows = (n: number) => setRows(prev => [...prev, ...Array.from({ length: n }, () => createEmptyRow())]);
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id: number, field: keyof BarcodeRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // === Validation (V1 parity: Step 1 → Step 2) ===
  const validateRows = (): boolean => {
    const errors: string[] = [];
    const validRows = rows.filter(r => r.sku.trim());

    if (validRows.length === 0) {
      errors.push('请至少填写一行有效的条形码数据');
    }

    validRows.forEach((r, i) => {
      const qty = parseInt(r.qtyPerBox);
      const ctn = parseInt(r.boxPerCtn);
      if (!r.sku.trim()) errors.push(`第 ${i + 1} 行: SKU 不能为空`);
      if (isNaN(qty) || qty < 1) errors.push(`第 ${i + 1} 行: 每盒个数必须是大于 0 的正整数`);
      if (isNaN(ctn) || ctn < 1) errors.push(`第 ${i + 1} 行: 每箱盒数必须是大于 0 的正整数`);
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Get valid rows for submission
  const getValidItems = () => rows
    .filter(r => r.sku.trim() && parseInt(r.qtyPerBox) > 0 && parseInt(r.boxPerCtn) > 0)
    .map(r => ({
      sku: r.sku.trim(),
      qtyPerBox: parseInt(r.qtyPerBox),
      boxPerCtn: parseInt(r.boxPerCtn),
    }));

  // === Mutation (V1 parity: batch generate) ===
  const generateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const blob = await productsApi.generateBarcodePdf(data as any);
      if (!blob || blob.size === 0) {
        throw new Error('Empty PDF response from server');
      }
      // V1 parity: trigger download
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
    onError: (error: any) => {
      console.error('[Barcode] Generation failed:', error);
      const message = error?.message || tCommon('securityCode.invalid');
      if (showSecurityDialog) {
        setSecurityError(message);
      } else {
        alert(`生成条形码 — ${message}`);
      }
    },
  });

  const handleGenerate = (secCode?: string) => {
    const payload: Record<string, unknown> = {
      items: getValidItems(),
    };
    if (secCode) {
      payload[getSecCodeKey()] = secCode;
    }
    generateMutation.mutate(payload);
  };

  const handleGenerateClick = () => {
    if (!validateRows()) return;

    const requiresSecurity = actionPolicy?.requiresSecurityCode ?? true;
    if (requiresSecurity) {
      setShowSecurityDialog(true);
    } else {
      handleGenerate();
    }
  };

  // === Render ===
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

  const validItemCount = getValidItems().length;

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="max-w-[1000px] mx-auto px-6 pt-12 pb-6">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/products" style={{ color: colors.blue }}>
            {t('module.title')}
          </Link>
          <span style={{ color: colors.textTertiary }}>/</span>
          <span style={{ color: colors.textSecondary }}>{t('barcode.title')}</span>
        </div>

        <h1
          style={{ color: colors.text }}
          className="text-[32px] font-semibold tracking-tight mb-2"
        >
          {t('barcode.title')}
        </h1>
        <p style={{ color: colors.textSecondary }} className="text-[17px]">
          外包装条形码 PDF 生成向导 — 4&quot;×6&quot; 热敏标签
        </p>
      </section>

      {/* Main Content */}
      <section className="max-w-[1000px] mx-auto px-6 pb-20">
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          {/* Wizard Header */}
          <div
            style={{ borderColor: colors.border }}
            className="p-6 border-b"
          >
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${colors.blue}20` }}
              >
                <svg className="w-5 h-5" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                </svg>
              </div>
              <div>
                <h2 style={{ color: colors.text }} className="text-lg font-semibold">
                  Packaging Barcode 生成向导
                </h2>
                <p style={{ color: colors.textSecondary }} className="text-sm">
                  按步骤填写数据、验证并生成条形码 PDF。
                </p>
              </div>
            </div>
          </div>

          {/* Instructions Card */}
          <div className="px-6 pt-6">
            <div
              style={{
                backgroundColor: `${colors.blue}08`,
                borderColor: `${colors.blue}30`,
              }}
              className="rounded-xl border p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4" style={{ color: colors.blue }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span style={{ color: colors.blue }} className="text-sm font-medium">操作说明</span>
              </div>
              <ul style={{ color: colors.textSecondary }} className="text-sm space-y-1 ml-6 list-disc">
                <li>每行填写一个 SKU 及其包装规格（每盒个数、每箱盒数）。</li>
                <li>多行用于生成不同规格的条形码 PDF，每行生成一个独立标签页。</li>
                <li>每盒个数和每箱盒数必须是大于 0 的正整数。</li>
              </ul>
            </div>
          </div>

          {/* Data Input Table (V1 parity) */}
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                <thead>
                  <tr>
                    <th style={{ color: colors.textSecondary, width: '40%' }} className="text-left text-sm font-medium pb-2 px-2">SKU</th>
                    <th style={{ color: colors.textSecondary, width: '20%' }} className="text-left text-sm font-medium pb-2 px-2">每盒个数 (QTY/BOX)</th>
                    <th style={{ color: colors.textSecondary, width: '20%' }} className="text-left text-sm font-medium pb-2 px-2">每箱盒数 (BOX/CTN)</th>
                    <th style={{ color: colors.textSecondary, width: '10%' }} className="text-center text-sm font-medium pb-2 px-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {/* SKU Select (V1: dropdown from DB) */}
                      <td className="px-2 py-1">
                        <select
                          value={row.sku}
                          onChange={(e) => updateRow(row.id, 'sku', e.target.value)}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: row.sku ? colors.text : colors.textTertiary,
                          }}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                        >
                          <option value="">— 选择 SKU —</option>
                          {skuList.map((s: SkuItem) => (
                            <option key={s.id} value={s.sku}>
                              {s.sku}{s.name ? ` — ${s.name}` : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Qty/Box */}
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={1}
                          value={row.qtyPerBox}
                          onChange={(e) => updateRow(row.id, 'qtyPerBox', e.target.value)}
                          placeholder="例: 10"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: colors.text,
                          }}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 text-center"
                        />
                      </td>

                      {/* Box/Ctn */}
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={1}
                          value={row.boxPerCtn}
                          onChange={(e) => updateRow(row.id, 'boxPerCtn', e.target.value)}
                          placeholder="例: 5"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: colors.text,
                          }}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 text-center"
                        />
                      </td>

                      {/* Remove button */}
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 1}
                          style={{ color: rows.length <= 1 ? colors.textTertiary : '#ef4444' }}
                          className="p-2 rounded-lg transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Row Buttons (V1 parity) */}
            <div className="flex gap-3 mt-2">
              <button
                onClick={addRow}
                style={{ color: colors.blue, borderColor: `${colors.blue}40` }}
                className="px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-blue-500/10"
              >
                + 添加一行
              </button>
              <button
                onClick={() => addRows(5)}
                style={{ color: colors.textSecondary, borderColor: colors.border }}
                className="px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-white/5"
              >
                批量添加 (5行)
              </button>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div
                className="mt-4 p-4 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-red-400 text-sm font-medium">验证失败</span>
                </div>
                <ul className="text-sm text-red-300 space-y-1 ml-6 list-disc">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer Actions (V1 parity) */}
          <div
            style={{ borderColor: colors.border }}
            className="px-6 py-4 border-t flex items-center justify-between"
          >
            <span style={{ color: colors.textSecondary }} className="text-sm">
              待生成: <strong style={{ color: colors.text }}>{validItemCount}</strong> 个标签
            </span>
            <button
              onClick={handleGenerateClick}
              disabled={generateMutation.isPending || validItemCount === 0}
              style={{
                backgroundColor: colors.blue,
                color: '#ffffff',
              }}
              className="px-6 py-2.5 rounded-full font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {generateMutation.isPending ? '正在生成...' : '生成条形码'}
            </button>
          </div>
        </div>
      </section>

      {/* Security Code Dialog */}
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
