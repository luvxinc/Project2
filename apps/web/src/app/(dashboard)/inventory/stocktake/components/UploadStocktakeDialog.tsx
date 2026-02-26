'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { hexToRgba } from '@/lib/status-colors';
import { api } from '@/lib/api/client';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type {
  StocktakeListItem,
  CreateStocktakeLocationDetailRequest,
  WarehouseTreeResponse,
} from '@/lib/api/inventory';

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
      const ratio = 1 - dist / maxLen;
      return { s, ratio };
    })
    .filter(x => x.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit)
    .map(x => x.s);
}

// ═══════════════════════════════════════
// CSV Row Type (11-column new format)
// ═══════════════════════════════════════
interface CsvRow {
  sku: string;        // col 1
  // col 2 skipped (manual verification)
  qtyPerBox: number;  // col 3
  numOfBox: number;   // col 4
  aisle: string;      // col 5 (WLR: L/R)
  bay: number;        // col 6 (LOC)
  level: string;      // col 7 (LEVEL: G/M/T)
  bin: string;        // col 8 (SLR: L/R or empty)
  slot: string;       // col 9 (LLR: L/R or empty)
  warehouse: string;  // col 10
  // col 11 skipped (total qty, system calculates)
  totalQty: number;   // computed: qtyPerBox × numOfBox
  rowIndex: number;   // original CSV row #
}

// ═══════════════════════════════════════
// CSV parser — 11-column format
// ═══════════════════════════════════════
function parseCSV11(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // Skip header row
  const rows: CsvRow[] = [];
  const INVALID_SKUS = new Set(['NAN', 'NONE', '', 'NULL', 'UNDEFINED']);

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));

    // Need at least 10 columns (11th is optional)
    if (parts.length < 10) continue;

    const sku = (parts[0] || '').trim().toUpperCase();
    // col 2 (index 1) is skipped
    const qtyPerBox = parseInt(parts[2] || '', 10);
    const numOfBox = parseInt(parts[3] || '', 10);
    const aisle = (parts[4] || '').trim().toUpperCase();
    const bay = parseInt(parts[5] || '', 10);
    const level = (parts[6] || '').trim().toUpperCase();
    const bin = (parts[7] || '').trim().toUpperCase();
    const slot = (parts[8] || '').trim().toUpperCase();
    const warehouse = (parts[9] || '').trim().toUpperCase();
    // col 11 (index 10) is skipped — system calculates total

    // Validation
    if (INVALID_SKUS.has(sku)) continue;
    if (isNaN(qtyPerBox) || qtyPerBox < 0) continue;
    if (isNaN(numOfBox) || numOfBox < 0) continue;
    if (isNaN(bay) || bay < 0) continue;
    if (!warehouse) continue;

    rows.push({
      sku,
      qtyPerBox,
      numOfBox,
      aisle,
      bay,
      level,
      bin: bin || '',
      slot: slot || '',
      warehouse,
      totalQty: qtyPerBox * numOfBox,
      rowIndex: i + 1, // 1-based for user display
    });
  }
  return rows;
}

// ═══════════════════════════════════════
// Location Key helper
// ═══════════════════════════════════════
function locationKey(wh: string, aisle: string, bay: number, level: string, bin: string, slot: string): string {
  return `${wh}_${aisle}_${bay}_${level}_${bin || '-'}_${slot || '-'}`;
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

interface LocationIssue {
  csvLocation: string; // human readable "WH01 L-3-G-R-L"
  rowIndices: number[];
  warehouse: string;
  aisle: string;
  bay: number;
  level: string;
  bin: string;
  slot: string;
  correctedLocation: string | null; // location key or null if unresolved
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
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [allValidSkus, setAllValidSkus] = useState<string[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [locationIssues, setLocationIssues] = useState<LocationIssue[]>([]);
  const [allLocations, setAllLocations] = useState<Set<string>>(new Set());
  const [allLocationsList, setAllLocationsList] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ rows: number; fixed: number; skipped: number; locations: number } | null>(null);

  // Security — for creating new stocktakes
  const [pendingPayload, setPendingPayload] = useState<{
    items: { sku: string; countedQty: number }[];
    locationDetails: CreateStocktakeLocationDetailRequest[];
  } | null>(null);

  const security = useSecurityAction({
    actionKey: 'btn_add_stocktake',
    level: 'L3',
    onExecute: async (code: string) => {
      if (!pendingPayload) return;
      try {
        setSubmitting(true);
        await inventoryApi.createStocktake({
          stocktakeDate: targetDate,
          items: pendingPayload.items,
          locationDetails: pendingPayload.locationDetails,
          sec_code_l3: code,
        });
        const skippedCount = corrections.filter(c => c.selectedSku === 'SKIP').length;
        const fixedCount = corrections.filter(c => c.selectedSku !== '' && c.selectedSku !== 'SKIP').length;
        setResult({
          rows: pendingPayload.items.length,
          fixed: fixedCount,
          skipped: skippedCount,
          locations: pendingPayload.locationDetails.length,
        });
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

  // Load valid SKUs + warehouse locations on mount
  useEffect(() => {
    if (!open) return;
    // Load SKUs
    api.get<{ sku: string }[]>('/products/skus')
      .then(skus => setAllValidSkus(skus.map(s => s.sku?.toUpperCase?.() || (s as unknown as string)).filter(Boolean)))
      .catch(() => {
        api.get<string[]>('/products/sku-list')
          .then(list => setAllValidSkus(list.map(s => s.toUpperCase())))
          .catch(() => setAllValidSkus([]));
      });

    // Load warehouse tree to build location index
    inventoryApi.getWarehouseTree()
      .then((tree: WarehouseTreeResponse) => {
        const locSet = new Set<string>();
        const locList: string[] = [];
        for (const wh of tree.warehouses) {
          for (const aisle of wh.aisles) {
            for (const bay of aisle.bays) {
              for (const lev of bay.levels) {
                if (lev.bins.length === 0) {
                  // No bins — location is warehouse_aisle_bay_level
                  const key = locationKey(wh.warehouse, aisle.aisle, bay.bay, lev.level, '', '');
                  locSet.add(key);
                  locList.push(key);
                } else {
                  for (const bin of lev.bins) {
                    if (bin.slots.length === 0) {
                      const key = locationKey(wh.warehouse, aisle.aisle, bay.bay, lev.level, String(bin.bin), '');
                      locSet.add(key);
                      locList.push(key);
                    } else {
                      // Also register bin-level key (slot='') so CSV rows without slot can match
                      const binKey = locationKey(wh.warehouse, aisle.aisle, bay.bay, lev.level, String(bin.bin), '');
                      locSet.add(binKey);
                      locList.push(binKey);
                      for (const slot of bin.slots) {
                        const key = locationKey(wh.warehouse, aisle.aisle, bay.bay, lev.level, String(bin.bin), slot);
                        locSet.add(key);
                        locList.push(key);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        setAllLocations(locSet);
        setAllLocationsList(locList);
      })
      .catch(() => {
        setAllLocations(new Set());
        setAllLocationsList([]);
      });
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFile(null);
      setTargetDate(new Date().toISOString().split('T')[0]);
      setParsedRows([]);
      setCorrections([]);
      setLocationIssues([]);
      setError('');
      setSubmitting(false);
      setDone(false);
      setResult(null);
      setPendingPayload(null);
    }
  }, [open]);

  // ─── Derived ───
  const dateExists = existingDates.includes(targetDate);
  const hasUnhandled = corrections.some(c => c.selectedSku === '');
  const allCorrected = corrections.length === 0 || corrections.every(c => c.selectedSku !== '');
  const hasLocationIssues = locationIssues.some(li => !li.correctedLocation);
  const allLocationsResolved = locationIssues.length === 0 || locationIssues.every(li => !!li.correctedLocation);

  // Build final location details (after corrections)
  const computedLocationDetails = (() => {
    if (parsedRows.length === 0) return [];
    const skuMap: Record<string, string> = {};
    const skipped = new Set<string>();
    corrections.forEach(c => {
      if (c.selectedSku === 'SKIP') skipped.add(c.badSku);
      else if (c.selectedSku) skuMap[c.badSku] = c.selectedSku;
    });

    return parsedRows
      .filter(r => !skipped.has(r.sku))
      .map(r => {
        const correctedSku = skuMap[r.sku] || r.sku;
        // Check if this row had a location issue that was corrected
        const rowLocKey = locationKey(r.warehouse, r.aisle, r.bay, r.level, r.bin, r.slot);
        const issue = locationIssues.find(li => li.csvLocation === rowLocKey);
        if (issue?.correctedLocation) {
          const parts = issue.correctedLocation.split('_');
          return {
            sku: correctedSku,
            qtyPerBox: r.qtyPerBox,
            numOfBox: r.numOfBox,
            warehouse: parts[0] || r.warehouse,
            aisle: parts[1] || r.aisle,
            bay: parseInt(parts[2]) || r.bay,
            level: parts[3] || r.level,
            bin: parts[4] === '-' ? '' : (parts[4] || ''),
            slot: parts[5] === '-' ? '' : (parts[5] || ''),
          };
        }
        return {
          sku: correctedSku,
          qtyPerBox: r.qtyPerBox,
          numOfBox: r.numOfBox,
          warehouse: r.warehouse,
          aisle: r.aisle,
          bay: r.bay,
          level: r.level,
          bin: r.bin,
          slot: r.slot,
        };
      });
  })();

  // Build aggregated items (SKU → sum of total qty)
  const computedFinalItems = (() => {
    const agg: Record<string, number> = {};
    for (const d of computedLocationDetails) {
      const totalQty = d.qtyPerBox * d.numOfBox;
      agg[d.sku] = (agg[d.sku] || 0) + totalQty;
    }
    return Object.entries(agg).map(([sku, countedQty]) => ({ sku, countedQty })).sort((a, b) => a.sku.localeCompare(b.sku));
  })();

  const canSubmit = targetDate && parsedRows.length > 0 && allCorrected && allLocationsResolved && !submitting && !done && !hasUnhandled;

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
      const rows = parseCSV11(text);
      if (rows.length === 0) {
        setError('CSV format error: no valid data found. Need 11-column format (SKU, skip, Qty/Box, Boxes, Aisle, Bay, Level, Bin, Slot, Warehouse, skip).');
        return;
      }
      setParsedRows(rows);

      // ─── SKU Validation ───
      if (allValidSkus.length > 0) {
        const uniqueSkus = [...new Set(rows.map(r => r.sku))];
        const unknown = uniqueSkus.filter(s => !allValidSkus.includes(s));
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

      // ─── Location Validation ───
      if (allLocations.size > 0) {
        const locGrouped: Record<string, number[]> = {};
        for (const row of rows) {
          const key = locationKey(row.warehouse, row.aisle, row.bay, row.level, row.bin, row.slot);
          if (!allLocations.has(key)) {
            if (!locGrouped[key]) locGrouped[key] = [];
            locGrouped[key].push(row.rowIndex);
          }
        }

        const issues: LocationIssue[] = Object.entries(locGrouped).map(([key, rowIndices]) => {
          const parts = key.split('_');
          return {
            csvLocation: key,
            rowIndices,
            warehouse: parts[0] || '',
            aisle: parts[1] || '',
            bay: parseInt(parts[2]) || 0,
            level: parts[3] || '',
            bin: parts[4] === '-' ? '' : (parts[4] || ''),
            slot: parts[5] === '-' ? '' : (parts[5] || ''),
            correctedLocation: null,
          };
        });
        setLocationIssues(issues);
      } else {
        setLocationIssues([]);
      }
    };
    reader.readAsText(f);
  }, [allValidSkus, allLocations]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.csv'));
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Correction handling (SKU) ───
  const setCorrectionSku = (idx: number, sku: string) => {
    setCorrections(prev => prev.map((c, i) => i === idx ? { ...c, selectedSku: sku } : c));
  };

  const skipCorrection = (idx: number) => {
    setCorrections(prev => prev.map((c, i) => i === idx ? { ...c, selectedSku: 'SKIP' } : c));
  };

  const skipAll = () => {
    setCorrections(prev => prev.map(c => ({ ...c, selectedSku: 'SKIP' })));
  };

  // ─── Location correction ───
  const setLocationCorrection = (idx: number, locKey: string) => {
    setLocationIssues(prev => prev.map((li, i) => i === idx ? { ...li, correctedLocation: locKey } : li));
  };

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');

    if (computedFinalItems.length === 0) {
      setError('No valid items to submit');
      return;
    }

    try {
      setSubmitting(true);
      const existing = await inventoryApi.getStocktakes();
      const found = existing.find((s: StocktakeListItem) => s.stocktakeDate === targetDate);

      if (found) {
        // Update existing — no security code needed
        await inventoryApi.updateStocktake(found.id, {
          items: computedFinalItems,
          locationDetails: computedLocationDetails,
        });
        const skippedCount = corrections.filter(c => c.selectedSku === 'SKIP').length;
        const fixedCount = corrections.filter(c => c.selectedSku !== '' && c.selectedSku !== 'SKIP').length;
        setResult({
          rows: computedFinalItems.length,
          fixed: fixedCount,
          skipped: skippedCount,
          locations: computedLocationDetails.length,
        });
        setDone(true);
      } else {
        // Create new — needs security code
        setPendingPayload({
          items: computedFinalItems,
          locationDetails: computedLocationDetails,
        });
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

  // Helper to format location key for display
  const formatLocDisplay = (key: string) => {
    const parts = key.split('_');
    const [wh, aisle, bay, level, bin, slot] = parts;
    let display = `${wh} ${aisle}-${bay}-${level}`;
    if (bin && bin !== '-') display += `-${bin}`;
    if (slot && slot !== '-') display += `-${slot}`;
    return display;
  };

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
          className="relative w-full max-w-[820px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
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
              <div className="grid grid-cols-4 gap-4 mb-6 rounded-xl p-4" style={{ background: cardBg }}>
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
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: colors.controlAccent }}>{result.locations}</div>
                  <div className="text-xs" style={{ color: colors.textTertiary }}>{t('locationCols.warehouse')}</div>
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
                  CSV
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
                      <button onClick={e => { e.stopPropagation(); setFile(null); setParsedRows([]); setCorrections([]); setLocationIssues([]); }}
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

              {/* 4. Location Issues (if any locations not found) */}
              {locationIssues.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: colors.red }}>
                        📍 {t('locationCorrection')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: hexToRgba(colors.red, 0.15), color: colors.red }}>
                        {t('locationInvalid', { count: locationIssues.filter(li => !li.correctedLocation).length })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mb-2" style={{ color: colors.textTertiary }}>
                    {t('locationCorrectionHint')}
                  </p>

                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: cardBg }}>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('csvLocation')}</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>Rows</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>{t('correctLocation')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationIssues.map((li, idx) => (
                            <tr key={idx} style={{
                              borderTop: `1px solid ${borderColor}`,
                              background: li.correctedLocation ? hexToRgba(colors.green, 0.04) : hexToRgba(colors.red, 0.04),
                            }}>
                              <td className="px-3 py-2 font-mono font-medium" style={{ color: colors.red }}>
                                {formatLocDisplay(li.csvLocation)}
                              </td>
                              <td className="px-3 py-2" style={{ color: colors.textSecondary }}>
                                {li.rowIndices.length} row{li.rowIndices.length > 1 ? 's' : ''}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={li.correctedLocation || ''}
                                  onChange={e => setLocationCorrection(idx, e.target.value)}
                                  className="w-full h-7 px-2 rounded text-xs outline-none"
                                  style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.text }}>
                                  <option value="">{t('selectLocation')}</option>
                                  {(() => {
                                    // Find deepest matching prefix: WH_AISLE_BAY_LEVEL_BIN_SLOT
                                    const parts = li.csvLocation.split('_');
                                    let prefix = '';
                                    for (let i = 0; i < parts.length; i++) {
                                      const candidate = parts.slice(0, i + 1).join('_');
                                      if (allLocationsList.some(loc => loc.startsWith(candidate + '_') || loc === candidate)) {
                                        prefix = candidate;
                                      } else {
                                        break;
                                      }
                                    }
                                    const filterPrefix = prefix || `${li.warehouse}`;
                                    return allLocationsList
                                      .filter(loc => loc.startsWith(filterPrefix + '_') || loc === filterPrefix)
                                      .map(loc => (
                                        <option key={loc} value={loc}>{formatLocDisplay(loc)}</option>
                                      ));
                                  })()}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Location Validation Status */}
              {parsedRows.length > 0 && locationIssues.length === 0 && allLocations.size > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                  style={{ background: hexToRgba(colors.green, 0.08), border: `1px solid ${hexToRgba(colors.green, 0.25)}`, color: colors.green }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                  ✅ {t('locationValid')}
                </div>
              )}

              {/* 6. Preview Table — Aggregated SKU totals */}
              {computedFinalItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: colors.blue }}>
                      {t('finalReview')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: hexToRgba(colors.blue, 0.12), color: colors.blue }}>
                      {t('recordCount', { count: computedFinalItems.length })} SKUs · {computedLocationDetails.length} {t('locationCols.warehouse')}
                    </span>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: cardBg }}>
                            <th className="px-3 py-2 text-left font-medium w-10" style={{ color: colors.textTertiary }}>#</th>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: colors.textTertiary }}>SKU</th>
                            <th className="px-3 py-2 text-right font-medium" style={{ color: colors.textTertiary }}>{t('locationCols.totalQty')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computedFinalItems.slice(0, 100).map((r, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${borderColor}` }}>
                              <td className="px-3 py-1.5" style={{ color: colors.textTertiary }}>{i + 1}</td>
                              <td className="px-3 py-1.5 font-mono" style={{ color: colors.text }}>{r.sku}</td>
                              <td className="px-3 py-1.5 text-right font-medium" style={{ color: colors.text }}>{r.countedQty}</td>
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

              {/* 7. Action Buttons */}
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
