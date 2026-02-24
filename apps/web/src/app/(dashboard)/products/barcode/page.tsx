'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate, stagger } from 'animejs';

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

  // V1 wizard: input rows
  const [rows, setRows] = useState<BarcodeRow[]>(() => [createEmptyRow()]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Animation refs
  const tableRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

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

  // Entry animation
  useEffect(() => {
    if (isClient && headerRef.current) {
      animate(headerRef.current.querySelectorAll('.anim-item'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: stagger(80, { start: 100 }),
        duration: 500,
        ease: 'out(3)',
      });
    }
  }, [isClient]);

  // V1: SKU dropdown list
  const { data: skuList = [] } = useQuery({
    queryKey: ['products-sku-list'],
    queryFn: () => productsApi.getSkuList(),
    enabled: isClient && !!currentUser,
  });



  // === Row management ===
  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
    // Animate the new row in
    setTimeout(() => {
      if (tableRef.current) {
        const rows = tableRef.current.querySelectorAll('tr.data-row');
        const last = rows[rows.length - 1];
        if (last) {
          animate(last, {
            opacity: [0, 1],
            translateX: [-12, 0],
            duration: 300,
            ease: 'out(2)',
          });
        }
      }
    }, 10);
  };
  const addRows = (n: number) => {
    setRows(prev => [...prev, ...Array.from({ length: n }, () => createEmptyRow())]);
  };
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id: number, field: keyof BarcodeRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // === Validation ===
  const validateRows = (): boolean => {
    const errors: string[] = [];
    const validRows = rows.filter(r => r.sku.trim());

    if (validRows.length === 0) {
      errors.push(t('barcode.validation.atLeastOneRow'));
    }

    validRows.forEach((r, i) => {
      const qty = parseInt(r.qtyPerBox);
      const ctn = parseInt(r.boxPerCtn);
      if (!r.sku.trim()) errors.push(t('barcode.validation.skuRequired', { row: i + 1 }));
      if (isNaN(qty) || qty < 1) errors.push(t('barcode.validation.qtyRequired', { row: i + 1 }));
      if (isNaN(ctn) || ctn < 1) errors.push(t('barcode.validation.ctnRequired', { row: i + 1 }));
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const getValidItems = () => rows
    .filter(r => r.sku.trim() && parseInt(r.qtyPerBox) > 0 && parseInt(r.boxPerCtn) > 0)
    .map(r => ({
      sku: r.sku.trim(),
      qtyPerBox: parseInt(r.qtyPerBox),
      boxPerCtn: parseInt(r.boxPerCtn),
    }));

  // === Mutation ===
  const generateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const blob = await productsApi.generateBarcodePdf(data as any);
      if (!blob || blob.size === 0) {
        throw new Error('Empty PDF response from server');
      }
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
      barcodeSecurity.onCancel();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: (error: any) => {
      console.error('[Barcode] Generation failed:', error);
      const message = error?.message || tCommon('securityCode.invalid');
      barcodeSecurity.setError(message);
    },
  });

  const barcodeSecurity = useSecurityAction({
    actionKey: 'btn_generate_barcode',
    level: 'L3',
    onExecute: (code) => {
      const payload: Record<string, unknown> = {
        items: getValidItems(),
      };
      if (code) {
        payload.sec_code_l3 = code;
      }
      generateMutation.mutate(payload);
    },
  });

  const handleGenerateClick = () => {
    if (!validateRows()) return;
    barcodeSecurity.trigger();
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
      {/* Header Section */}
      <section ref={headerRef} className="max-w-[1400px] mx-auto px-6 pt-8 pb-4">
        {/* Breadcrumb */}
        <div className="anim-item opacity-0 flex items-center gap-2 text-sm mb-4">
          <Link href="/products" style={{ color: colors.blue }} className="hover:opacity-70 transition-opacity">
            {t('module.title')}
          </Link>
          <span style={{ color: colors.textTertiary }}>/</span>
          <span style={{ color: colors.textSecondary }}>{t('barcode.title')}</span>
        </div>

        {/* Title Row */}
        <div className="anim-item opacity-0 flex items-end justify-between mb-1">
          <div>
            <h1
              style={{ color: colors.text }}
              className="text-2xl font-semibold tracking-tight mb-1"
            >
              {t('barcode.title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {t('barcode.description')}
            </p>
          </div>

          {/* Row count badge */}
          <div className="flex items-center gap-3">
            {validItemCount > 0 && (
              <span
                style={{ backgroundColor: `${colors.orange}15`, color: colors.orange }}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                </svg>
                {t('barcode.labelCount', { count: validItemCount })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Instruction Card */}
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
                {t('barcode.instructions.title')}
              </p>
              <ul style={{ color: colors.textSecondary }} className="text-sm space-y-0.5">
                <li>• {t('barcode.instructions.step1')}</li>
                <li>• {t('barcode.instructions.step2')}</li>
                <li>• {t('barcode.instructions.step3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Main Data Table */}
      <section className="max-w-[1400px] mx-auto px-6 pb-20">
        <div
          ref={tableRef}
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-xl border overflow-hidden shadow-sm"
        >
          {/* macOS-style table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ borderColor: colors.border, backgroundColor: `${colors.bg}80` }} className="border-b">
                  <th
                    style={{ color: colors.textSecondary }}
                    className="text-left py-3 px-5 text-[11px] font-semibold uppercase tracking-wide"
                  >
                    #
                  </th>
                  <th
                    style={{ color: colors.textSecondary }}
                    className="text-left py-3 px-5 text-[11px] font-semibold uppercase tracking-wide"
                  >
                    SKU
                  </th>
                  <th
                    style={{ color: colors.blue }}
                    className="text-left py-3 px-5 text-[11px] font-semibold uppercase tracking-wide w-[160px]"
                  >
                    Qty/Box
                  </th>
                  <th
                    style={{ color: colors.orange }}
                    className="text-left py-3 px-5 text-[11px] font-semibold uppercase tracking-wide w-[160px]"
                  >
                    Box/Ctn
                  </th>
                  <th
                    style={{ color: colors.textTertiary }}
                    className="text-center py-3 px-5 text-[11px] font-semibold uppercase tracking-wide w-[80px]"
                  >
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isComplete = row.sku.trim() && parseInt(row.qtyPerBox) > 0 && parseInt(row.boxPerCtn) > 0;
                  return (
                    <tr
                      key={row.id}
                      className={`data-row transition-colors ${index !== rows.length - 1 ? 'border-b' : ''}`}
                      style={{
                        borderColor: colors.borderLight || colors.border,
                        backgroundColor: isComplete ? `${colors.green}06` : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isComplete) e.currentTarget.style.backgroundColor = colors.hover || `${colors.bgTertiary}40`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isComplete ? `${colors.green}06` : 'transparent';
                      }}
                    >
                      {/* Row Number */}
                      <td className="py-2.5 px-5">
                        <span
                          style={{ color: colors.textTertiary }}
                          className="text-[12px] font-mono"
                        >
                          {index + 1}
                        </span>
                      </td>

                      {/* SKU Select */}
                      <td className="py-2.5 px-5">
                        <select
                          value={row.sku}
                          onChange={(e) => updateRow(row.id, 'sku', e.target.value)}
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: row.sku ? colors.text : colors.textTertiary,
                          }}
                          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-[#0071e3] transition-all"
                        >
                          <option value="">{t('barcode.selectSku')}</option>
                          {skuList.map((s: SkuItem) => (
                            <option key={s.id} value={s.sku}>
                              {s.sku}{s.name ? ` — ${s.name}` : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Qty/Box */}
                      <td className="py-2.5 px-5">
                        <input
                          type="number"
                          min={1}
                          value={row.qtyPerBox}
                          onChange={(e) => updateRow(row.id, 'qtyPerBox', e.target.value)}
                          placeholder="0"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: colors.blue,
                          }}
                          className="w-full px-3 py-2 rounded-lg border text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#0071e3] transition-all"
                        />
                      </td>

                      {/* Box/Ctn */}
                      <td className="py-2.5 px-5">
                        <input
                          type="number"
                          min={1}
                          value={row.boxPerCtn}
                          onChange={(e) => updateRow(row.id, 'boxPerCtn', e.target.value)}
                          placeholder="0"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: colors.orange,
                          }}
                          className="w-full px-3 py-2 rounded-lg border text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#0071e3] transition-all"
                        />
                      </td>

                      {/* Remove */}
                      <td className="py-2.5 px-5 text-center">
                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 1}
                          style={{ color: rows.length <= 1 ? colors.textTertiary : colors.red }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70 transition-colors disabled:cursor-not-allowed mx-auto"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          <div
            style={{ borderColor: colors.border }}
            className="px-5 py-3.5 border-t flex items-center justify-between"
          >
            {/* Left: Add row buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={addRow}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                  color: colors.text,
                }}
                className="flex items-center gap-1.5 px-3 h-8 border rounded-lg text-[13px] font-medium hover:opacity-80 transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('barcode.addRow')}
              </button>
              <button
                onClick={() => addRows(5)}
                style={{
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                  color: colors.textSecondary,
                }}
                className="flex items-center gap-1.5 px-3 h-8 border rounded-lg text-[13px] font-medium hover:opacity-80 transition-all active:scale-95"
              >
                {t('barcode.addFiveRows')}
              </button>
            </div>

            {/* Right: Generate button */}
            <button
              onClick={handleGenerateClick}
              disabled={generateMutation.isPending || validItemCount === 0}
              style={{
                backgroundColor: colors.blue,
                color: colors.white,
              }}
              className="flex items-center gap-2 px-6 h-9 hover:opacity-90 text-[14px] font-medium rounded-lg transition-all active:scale-95 disabled:opacity-50"
            >
              {generateMutation.isPending ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }}
                  />
                  {t('barcode.generating')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  </svg>
                  {t('barcode.generate')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div
            className="mt-4 rounded-xl border p-4"
            style={{
              backgroundColor: `${colors.red}08`,
              borderColor: `${colors.red}30`,
            }}
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                style={{ color: colors.red }}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p style={{ color: colors.red }} className="text-sm font-medium mb-1">
                  {t('barcode.validation.failed')}
                </p>
                <ul style={{ color: colors.textSecondary }} className="text-sm space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {showSuccess && (
          <div
            className="mt-4 rounded-xl border p-4 flex items-center gap-3"
            style={{
              backgroundColor: `${colors.green}10`,
              borderColor: `${colors.green}30`,
            }}
          >
            <div
              style={{ backgroundColor: `${colors.green}20` }}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <svg className="w-4 h-4" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p style={{ color: colors.green }} className="text-sm font-medium">{t('barcode.generateSuccess')}</p>
              <p style={{ color: colors.textSecondary }} className="text-[12px]">{t('barcode.downloadComplete')}</p>
            </div>
          </div>
        )}
      </section>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={barcodeSecurity.isOpen}
        level={barcodeSecurity.level}
        title={t('barcode.generate')}
        description={t('security.requiresL3')}
        onConfirm={barcodeSecurity.onConfirm}
        onCancel={barcodeSecurity.onCancel}
        isLoading={generateMutation.isPending}
        error={barcodeSecurity.error}
      />
    </div>
  );
}
