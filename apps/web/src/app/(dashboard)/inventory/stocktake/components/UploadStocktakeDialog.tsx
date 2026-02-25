'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { hexToRgba } from '@/lib/status-colors';
import { api } from '@/lib/api/client';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type { StocktakeListItem } from '@/lib/api/inventory';

// ═══════════════════════════════════════
// Minimal Levenshtein for SKU fuzzy match
// ═══════════════════════════════════════
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// V1 parity: difflib.get_close_matches(n=5, cutoff=0.4)
function fuzzyMatch(bad: string, allSkus: string[], limit = 5): string[] {
  const b = bad.toUpperCase();
  return allSkus
    .map(s => {
      const a = s.toUpperCase();
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return { s, ratio: 0 };
      const dist = levenshtein(b, a);
      const ratio = 1 - dist / maxLen; // approximate SequenceMatcher ratio
      return { s, ratio };
    })
    .filter(x => x.ratio >= 0.4) // V1 parity: cutoff=0.4
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit)
    .map(x => x.s);
}

// ═══════════════════════════════════════
// CSV parser (no dependency)
// ═══════════════════════════════════════
function parseCSV(text: string): { sku: string; qty: number }[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // V1 parity: fuzzy column name matching
  const headers = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, '').toLowerCase());
  const skuIdx = headers.findIndex(h => h.includes('sku'));
  const qtyIdx = headers.findIndex(h => ['qty', 'quantity', 'amount'].some(k => h.includes(k)));
  if (skuIdx === -1 || qtyIdx === -1) return [];

  const rows: { sku: string; qty: number }[] = [];
  const INVALID_SKUS = new Set(['NAN', 'NONE', '', 'NULL', 'UNDEFINED']);

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const sku = (parts[skuIdx] || '').trim().toUpperCase();
    const qty = parseInt(parts[qtyIdx] || '', 10);
    // V1 parity: filter NaN/NONE/NULL/empty
    if (INVALID_SKUS.has(sku) || isNaN(qty) || qty < 0) continue;
    rows.push({ sku, qty });
  }
  return rows;
}

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════
interface UploadStocktakeDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  existingDates: string[];
}

interface CorrectionRow {
  badSku: string;
  suggestions: string[];
  selectedSku: string; // '' = unhandled, 'SKIP' = skip, else = mapped
}

// ═══════════════════════════════════════
// Component
// ═══════════════════════════════════════
export function UploadStocktakeDialog({ open, onClose, onComplete, existingDates }: UploadStocktakeDialogProps) {
  const t = useTranslations('inventory.stocktake.upload');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // ─── State ───
  const [file, setFile] = useState<File | null>(null);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [parsedRows, setParsedRows] = useState<{ sku: string; qty: number }[]>([]);
  const [allValidSkus, setAllValidSkus] = useState<string[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ rows: number; fixed: number; skipped: number } | null>(null);

  // Security — for creating new stocktakes
  const [pendingItems, setPendingItems] = useState<{sku: string; countedQty: number}[] | null>(null);
  const security = useSecurityAction({
    actionKey: 'btn_add_stocktake',
    level: 'L3',
    onExecute: async (code: string) => {
      if (!pendingItems) return;
      try {
        setSubmitting(true);
        await inventoryApi.createStocktake({
          stocktakeDate: targetDate,
          items: pendingItems,
          sec_code_l3: code,
        });
        const skippedCount = corrections.filter(c => c.selectedSku === 'SKIP').length;
        const fixedCount = corrections.filter(c => c.selectedSku !== '' && c.selectedSku !== 'SKIP').length;
        setResult({ rows: pendingItems.length, fixed: fixedCount, skipped: skippedCount });
        setDone(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Unknown error';
        setError(msg);
      } finally {
        setSubmitting(false);
      }
    },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load valid SKUs on mount
  useEffect(() => {
    if (!open) return;
    api.get<{ sku: string }[]>('/products/skus')
      .then(skus => setAllValidSkus(skus.map(s => s.sku?.toUpperCase?.() || (s as unknown as string)).filter(Boolean)))
      .catch(() => {
        api.get<string[]>('/products/sku-list')
          .then(list => setAllValidSkus(list.map(s => s.toUpperCase())))
          .catch(() => setAllValidSkus([]));
      });
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFile(null);
      setTargetDate(new Date().toISOString().split('T')[0]);
      setParsedRows([]);
      setCorrections([]);
      setError('');
      setSubmitting(false);
      setDone(false);
      setResult(null);
      setPendingItems(null);
    }
  }, [open]);

  // ─── Derived ───
  const dateExists = existingDates.includes(targetDate);
  const hasUnhandled = corrections.some(c => c.selectedSku === '');
  const allCorrected = corrections.length === 0 || corrections.every(c => c.selectedSku !== '');

  // Build final rows (live computation)
  const computedFinalRows = (() => {
    if (parsedRows.length === 0) return [];
    const skuMap: Record<string, string> = {};
    const skipped = new Set<string>();
    corrections.forEach(c => {
      if (c.selectedSku === 'SKIP') skipped.add(c.badSku);
      else if (c.selectedSku) skuMap[c.badSku] = c.selectedSku;
    });
    return parsedRows
      .filter(r => !skipped.has(r.sku))
      .map(r => ({ sku: skuMap[r.sku] || r.sku, qty: r.qty }));
  })();

  const canSubmit = targetDate && parsedRows.length > 0 && allCorrected && !submitting && !done && !hasUnhandled;

  // ─── File handling ───
  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) {
      setError('Please select a .csv file');
      return;
    }
    setFile(f);
    setError('');
    setDone(false);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError('CSV format error: no valid data found. Need SKU and Quantity columns.');
        return;
      }
      setParsedRows(rows);

      // Validate SKUs
      if (allValidSkus.length > 0) {
        const unknown = [...new Set(rows.map(r => r.sku))].filter(s => !allValidSkus.includes(s));
        if (unknown.length > 0) {
          setCorrections(unknown.map(bad => ({
            badSku: bad,
            suggestions: fuzzyMatch(bad, allValidSkus),
            selectedSku: '',
          })));
        } else {
          setCorrections([]);
        }
      }
    };
    reader.readAsText(f);
  }, [allValidSkus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.csv'));
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Correction handling ───
  const setCorrectionSku = (idx: number, sku: string) => {
    setCorrections(prev => prev.map((c, i) => i === idx ? { ...c, selectedSku: sku } : c));
  };

  const skipCorrection = (idx: number) => {
    setCorrections(prev => prev.map((c, i) => i === idx ? { ...c, selectedSku: 'SKIP' } : c));
  };

  const skipAll = () => {
    setCorrections(prev => prev.map(c => ({ ...c, selectedSku: 'SKIP' })));
  };

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');

    const items = computedFinalRows.map(r => ({ sku: r.sku, countedQty: r.qty }));
    if (items.length === 0) {
      setError('No valid items to submit');
      return;
    }

    try {
      setSubmitting(true);
      const existing = await inventoryApi.getStocktakes();
      const found = existing.find((s: StocktakeListItem) => s.stocktakeDate === targetDate);

      if (found) {
        // Update existing — no security code needed for update
        await inventoryApi.updateStocktake(found.id, { items });
        const skippedCount = corrections.filter(c => c.selectedSku === 'SKIP').length;
        const fixedCount = corrections.filter(c => c.selectedSku !== '' && c.selectedSku !== 'SKIP').length;
        setResult({ rows: items.length, fixed: fixedCount, skipped: skippedCount });
        setDone(true);
      } else {
        // Create new — needs security code
        setPendingItems(items);
        setSubmitting(false);
        security.trigger();
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Unknown error';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const cardBg = colors.bgSecondary;
  const borderColor = colors.separator;
  const correctedCount = corrections.filter(c => c.selectedSku !== '').length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: hexToRgba('#000000', 0.6), backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        {/* Dialog */}
        <div
          className="relative w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
          style={{ backgroundColor: colors.bgElevated, border: `1px solid ${borderColor}` }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl"
            style={{ backgroundColor: colors.bgElevated, borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${colors.green}, ${colors.green}dd)` }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: colors.text }}>{t('title')}</h3>
                <p className="text-xs" style={{ color: colors.textTertiary }}>{t('desc')}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: colors.textSecondary }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ═══ Done State ═══ */}
          {done && result ? (
            <div className="px-6 py-10 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: hexToRgba(colors.green, 0.1) }}>
                <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('syncComplete')}</h4>
              <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                {t('recorded', { date: targetDate })}
              </p>
              <div className="grid grid-cols-3 gap-4 mb-6 rounded-xl p-4" style={{ background: cardBg }}>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: colors.green }}>{result.rows}</div>
                  <div className="text-xs" style={{ color: colors.textTertiary }}>{t('rowsWritten')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: colors.blue }}>{result.fixed}</div>
                  <div className="text-xs" style={{ color: colors.textTertiary }}>{t('skuFixed')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: colors.orange }}>{result.skipped}</div>
                  <div className="text-xs" style={{ color: colors.textTertiary }}>{t('skuSkipped')}</div>
                </div>
              </div>
              <button onClick={() => { onComplete(); onClose(); }}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: colors.controlAccent }}>
                {t('backToHub')}
              </button>
            </div>
          ) : (
            /* ═══ Main Form (single page) ═══ */
            <div className="px-6 py-5 space-y-5">

              {/* 1. Date Picker */}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>
                  {t('targetDate')}
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => { setTargetDate(e.target.value); setDone(false); setResult(null); }}
                  disabled={submitting}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
                  style={{
                    backgroundColor: cardBg,
                    border: `1px solid ${dateExists ? hexToRgba(colors.yellow, 0.5) : borderColor}`,
                    color: colors.text,
                  }}
                />
                {dateExists && (
                  <div className="mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                    style={{ background: hexToRgba(colors.yellow, 0.08), border: `1px solid ${hexToRgba(colors.yellow, 0.25)}`, color: colors.yellow }}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495z" />
                    </svg>
                    {t('dateExists')}
                  </div>
                )}
              </div>

              {/* 2. CSV Upload */}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>
                  CSV {t('dragDrop').split(' ')[0]}
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => !submitting && fileInputRef.current?.click()}
                  className="rounded-xl p-6 text-center cursor-pointer transition-all hover:opacity-80"
                  style={{
                    border: `2px dashed ${file ? colors.green : borderColor}`,
                    background: file ? hexToRgba(colors.green, 0.04) : cardBg,
                    pointerEvents: submitting ? 'none' : 'auto',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  {!file ? (
                    <>
                      <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}
                        style={{ color: colors.textTertiary }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m0 0l2.25 2.25M9.75 14.25l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                      </svg>
                      <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('dragDrop')}</p>
                      <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>{t('csvHint')}</p>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                      </svg>
                      <span className="text-sm font-medium" style={{ color: colors.text }}>{file.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: hexToRgba(colors.green, 0.1), color: colors.green }}>
                        {parsedRows.length} rows
                      </span>
                      <button onClick={e => { e.stopPropagation(); setFile(null); setParsedRows([]); setCorrections([]); }}
                        className="ml-2 p-1 rounded hover:opacity-70" style={{ color: colors.textTertiary }}>✕</button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. SKU Corrections (inline, only if needed) */}
              {corrections.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: colors.orange }}>⚠ {t('unknownSku')}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: hexToRgba(colors.orange, 0.15), color: colors.orange }}>
                        {correctedCount}/{corrections.length}
                      </span>
                    </div>
                    <button onClick={skipAll} className="px-3 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                      style={{ background: hexToRgba(colors.orange, 0.1), color: colors.orange, border: `1px solid ${hexToRgba(colors.orange, 0.25)}` }}>
                      {t('skipAll')}
                    </button>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: cardBg }}>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('originalSku')}</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('recommendMatch')}</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('selectInput')}</th>
                            <th className="px-3 py-2 text-center font-medium w-16" style={{ color: colors.textTertiary }}>{t('operation')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {corrections.map((c, i) => (
                            <tr key={i}
                              style={{
                                borderTop: `1px solid ${borderColor}`,
                                background: c.selectedSku === 'SKIP' ? hexToRgba(colors.red, 0.04) :
                                  c.selectedSku ? hexToRgba(colors.green, 0.04) : 'transparent',
                                opacity: c.selectedSku === 'SKIP' ? 0.6 : 1,
                              }}>
                              <td className="px-3 py-2 font-mono font-medium" style={{ color: colors.orange }}>{c.badSku}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {c.suggestions.length > 0 ? c.suggestions.map(s => (
                                    <button key={s} onClick={() => setCorrectionSku(i, s)}
                                      className="px-2 py-0.5 rounded text-xs transition-all hover:opacity-80"
                                      style={{
                                        background: c.selectedSku === s ? hexToRgba(colors.controlAccent, 0.15) : hexToRgba(colors.controlAccent, 0.06),
                                        color: colors.controlAccent, border: `1px solid ${c.selectedSku === s ? colors.controlAccent : 'transparent'}`,
                                      }}>
                                      {s}
                                    </button>
                                  )) : (
                                    <span style={{ color: colors.textTertiary }}>{t('noRecommend')}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={c.selectedSku === 'SKIP' ? '' : c.selectedSku}
                                  onChange={e => setCorrectionSku(i, e.target.value)}
                                  className="w-full h-7 px-2 rounded text-xs outline-none"
                                  style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.text }}>
                                  <option value="">{t('selectSku')}</option>
                                  {allValidSkus.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => c.selectedSku === 'SKIP' ? setCorrectionSku(i, '') : skipCorrection(i)}
                                  className="px-2 py-1 rounded text-xs font-medium transition-all"
                                  style={{
                                    background: c.selectedSku === 'SKIP' ? hexToRgba(colors.red, 0.15) : 'transparent',
                                    color: c.selectedSku === 'SKIP' ? colors.red : colors.textSecondary,
                                    border: `1px solid ${c.selectedSku === 'SKIP' ? hexToRgba(colors.red, 0.3) : borderColor}`,
                                  }}>
                                  {c.selectedSku === 'SKIP' ? t('skipped') : t('skip')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {hasUnhandled && (
                    <p className="text-xs mt-1.5" style={{ color: colors.orange }}>
                      {t('remaining', { count: corrections.filter(c => c.selectedSku === '').length })}
                    </p>
                  )}
                </div>
              )}

              {/* 4. Preview Table (shows final computed rows) */}
              {computedFinalRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: colors.blue }}>
                      {t('finalReview')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: hexToRgba(colors.blue, 0.12), color: colors.blue }}>
                      {t('recordCount', { count: computedFinalRows.length })}
                    </span>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: cardBg }}>
                            <th className="px-3 py-2 text-left font-medium w-10" style={{ color: colors.textTertiary }}>#</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>SKU</th>
                            <th className="px-3 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computedFinalRows.slice(0, 100).map((r, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${borderColor}` }}>
                              <td className="px-3 py-1.5" style={{ color: colors.textTertiary }}>{i + 1}</td>
                              <td className="px-3 py-1.5 font-mono" style={{ color: colors.text }}>{r.sku}</td>
                              <td className="px-3 py-1.5 text-right font-medium" style={{ color: colors.text }}>{r.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: hexToRgba(colors.red, 0.08), border: `1px solid ${hexToRgba(colors.red, 0.25)}`, color: colors.red }}>
                  {error}
                </div>
              )}

              {/* 5. Action Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex-1 h-11 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: canSubmit ? colors.green : colors.textTertiary }}>
                  {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {submitting ? t('syncing') : t('confirmSync')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={security.isOpen}
        level={security.level}
        title={t('confirmSync')}
        description={t('desc')}
        onConfirm={security.onConfirm}
        onCancel={security.onCancel}
        error={security.error}
      />
    </>
  );
}
