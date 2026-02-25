'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import SalesTabSelector from '../components/SalesTabSelector';
import { salesApi } from '@/lib/api/sales';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type {
  CsvTransactionRow, CsvEarningRow, EtlUploadResponse,
  ParseResult, PendingSkuItem, TransformResult, EtlBatchStatus,
} from '@/lib/api/sales';

// ═══════════════════════════════════════
// CSV Parser — eBay Transaction/Earning
// ═══════════════════════════════════════

/** Normalize eBay CSV header → camelCase key */
function normalizeHeader(h: string): string {
  const map: Record<string, string> = {
    'transaction creation date': 'transactionCreationDate',
    'type': 'type',
    'reference id': 'referenceId',
    'description': 'description',
    'order number': 'orderNumber',
    'item id': 'itemId',
    'item title': 'itemTitle',
    'custom label': 'customLabel',
    'quantity': 'quantity',
    'item subtotal': 'itemSubtotal',
    'shipping and handling': 'shippingAndHandling',
    'seller collected tax': 'sellerCollectedTax',
    'ebay collected tax': 'ebayCollectedTax',
    'final value fee - fixed': 'finalValueFeeFixed',
    'final value fee - variable': 'finalValueFeeVariable',
    'regulatory operating fee': 'regulatoryOperatingFee',
    'international fee': 'internationalFee',
    'promoted listings fee': 'promotedListingsFee',
    'payments dispute fee': 'paymentsDisputeFee',
    'gross transaction amount': 'grossTransactionAmount',
    'refund': 'refund',
    'buyer username': 'buyerUsername',
    'ship to city': 'shipToCity',
    'ship to country': 'shipToCountry',
    'net amount': 'netAmount',
    // Earning CSV
    'order creation date': 'orderCreationDate',
    'buyer name': 'buyerName',
    'shipping labels': 'shippingLabels',
    'seller': 'seller',
  };
  return map[h.toLowerCase().trim()] || '';
}

function parseEbayCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('order number') || lower.includes('item id')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { headers: [], rows: [] };

  const rawHeaders = parseCsvLine(lines[headerIdx]);
  const headers = rawHeaders.map(h => normalizeHeader(h));

  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.length < 3) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) row[headers[j]] = sanitizeValue((vals[j] || '').trim());
    }
    if (row.orderNumber || row.type) rows.push(row);
  }

  return { headers: headers.filter(Boolean), rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const JUNK_VALUES = new Set(['--', '-', 'n/a', 'null', 'nan', 'none', 'N/A', 'None']);
function sanitizeValue(v: string): string {
  return JUNK_VALUES.has(v) ? '' : v;
}

function detectSeller(text: string, filename?: string): string {
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(0, 30)) {
    const clean = line.replace(/"/g, '').trim().toLowerCase();
    if (clean.startsWith('seller,') || clean.startsWith('seller\t')) {
      const parts = line.replace(/"/g, '').split(/[,\t]/);
      if (parts.length >= 2 && parts[1].trim()) return parts[1].trim();
    }
  }
  if (filename) {
    const fname = filename.toLowerCase();
    if (fname.includes('88')) return 'esparts88';
    if (fname.includes('plus')) return 'espartsplus';
  }
  return '';
}

function detectFileType(text: string): 'transaction' | 'earning' | 'unknown' {
  const head = text.substring(0, 2048).toLowerCase();
  if (head.includes('transaction report') || head.includes('transaction creation date')) {
    return 'transaction';
  }
  if (head.includes('order earnings report') || head.includes('shipping labels')) {
    return 'earning';
  }
  return 'unknown';
}

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

type WizardStep = 'upload' | 'parse' | 'clean' | 'transform' | 'processing' | 'done';

interface DetectedFile {
  file: File;
  type: 'transaction' | 'earning' | 'unknown';
  seller: string;
  rowCount: number;
  rows: Record<string, string>[];
}

// ═══════════════════════════════════════
// Section Card Component
// ═══════════════════════════════════════

function SectionCard({
  stepNum,
  title,
  status,
  collapsed,
  onToggle,
  colors,
  children,
}: {
  stepNum: number;
  title: string;
  status: 'pending' | 'active' | 'done' | 'error';
  collapsed: boolean;
  onToggle?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  children: React.ReactNode;
}) {
  const statusIcon = {
    pending: <span className="text-gray-400">{stepNum}</span>,
    active: <span className="animate-pulse" style={{ color: colors.controlAccent }}>●</span>,
    done: <span style={{ color: '#34C759' }}>✓</span>,
    error: <span className="text-red-400">✗</span>,
  };

  const borderColor = {
    pending: colors.border,
    active: colors.border,
    done: colors.border,
    error: '#FF3B3030',
  };

  return (
    <section
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${borderColor[status]}`,
        opacity: status === 'pending' ? 0.5 : 1,
      }}
    >
      {/* Header — always visible */}
      <div
        className={`flex items-center gap-3 px-5 py-3.5 ${onToggle && status === 'done' ? 'cursor-pointer' : ''}`}
        onClick={status === 'done' ? onToggle : undefined}
        style={{ borderBottom: collapsed ? 'none' : `1px solid ${colors.border}` }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{
            backgroundColor: status === 'active' ? `${colors.controlAccent}20` :
                             status === 'done' ? '#34C75915' : colors.bgTertiary,
          }}
        >
          {statusIcon[status]}
        </div>
        <span
          className="text-sm font-semibold flex-1"
          style={{ color: status === 'pending' ? colors.textTertiary : colors.text }}
        >
          {title}
        </span>
        {status === 'done' && onToggle && (
          <span className="text-xs" style={{ color: colors.textTertiary }}>
            {collapsed ? '▸' : '▾'}
          </span>
        )}
      </div>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="px-5 pb-5 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════
// Main Component
// ═══════════════════════════════════════

export default function SalesEtlPage() {
  const t = useTranslations('sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // ─── Wizard State (kept for logic — drives section visibility) ───
  const [step, setStep] = useState<WizardStep>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Upload State ───
  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fifoRatioRe, setFifoRatioRe] = useState(60);
  const [fifoRatioCr, setFifoRatioCr] = useState(50);
  const [fifoRatioCc, setFifoRatioCc] = useState(30);
  const [uploadResult, setUploadResult] = useState<EtlUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Parse State ───
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ─── Clean State ───
  const [pendingItems, setPendingItems] = useState<PendingSkuItem[]>([]);
  const [fixes, setFixes] = useState<Record<number, string>>({});

  // ─── Transform/Done State ───
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null);
  const [batchStatus, setBatchStatus] = useState<EtlBatchStatus | null>(null);

  // ─── Section collapse state ───
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── Security Code ───
  const [secDialogOpen, setSecDialogOpen] = useState(false);
  const [secAction, setSecAction] = useState<string>('');
  const [secLevel] = useState<'L0' | 'L1' | 'L2' | 'L3' | 'L4'>('L3');
  const secCallback = useRef<(code: string) => void>(() => {});

  // ─── Derived state ───
  const transFile = detectedFiles.find(f => f.type === 'transaction');
  const earnFile = detectedFiles.find(f => f.type === 'earning');
  const detectedSeller = transFile?.seller || earnFile?.seller || '';
  const hasBothFiles = !!transFile && !!earnFile;

  const sellerMismatch = transFile && earnFile
    && transFile.seller && earnFile.seller
    && transFile.seller.toLowerCase() !== earnFile.seller.toLowerCase();

  // ─── Section status derivation ───
  const stepOrder: WizardStep[] = ['upload', 'parse', 'clean', 'transform', 'processing', 'done'];
  const currentIdx = stepOrder.indexOf(step);

  const sectionStatus = (sectionStep: WizardStep): 'pending' | 'active' | 'done' | 'error' => {
    const sIdx = stepOrder.indexOf(sectionStep);
    if (sIdx < currentIdx) return 'done';
    if (sIdx === currentIdx) return error && sIdx === currentIdx ? 'error' : 'active';
    return 'pending';
  };

  // ═══════════════════════════════════════
  // Handlers (unchanged from wizard version)
  // ═══════════════════════════════════════

  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles: DetectedFile[] = [];

    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const type = detectFileType(text);
        const seller = detectSeller(text, file.name);
        const { rows } = parseEbayCsv(text);

        newFiles.push({ file, type, seller, rowCount: rows.length, rows });

        if (newFiles.length === fileList.length) {
          setDetectedFiles(prev => {
            const updated = [...prev];
            for (const nf of newFiles) {
              const idx = updated.findIndex(u => u.type === nf.type);
              if (idx >= 0) { updated[idx] = nf; } else { updated.push(nf); }
            }
            return updated;
          });
          setError(null);
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const handleUpload = async () => {
    if (!transFile) return;
    if (!earnFile) { setError(t('etl.upload.missingEarning')); return; }
    if (sellerMismatch) { setError(t('etl.upload.sellerMismatch')); return; }

    const today = new Date().toISOString().slice(0, 10);
    let transMinDate = 'zzzz', transMaxDate = '';
    for (const row of transFile.rows) {
      const d = row.transactionCreationDate;
      if (d) { if (d < transMinDate) transMinDate = d; if (d > transMaxDate) transMaxDate = d; }
    }
    if (transMaxDate && transMaxDate >= today) {
      setError(t('etl.upload.futureDate', { maxDate: transMaxDate, today }));
      return;
    }

    let earnMinDate = 'zzzz', earnMaxDate = '';
    for (const row of earnFile.rows) {
      const d = row.orderCreationDate;
      if (d) { if (d < earnMinDate) earnMinDate = d; if (d > earnMaxDate) earnMaxDate = d; }
    }
    if (transMinDate !== 'zzzz' && earnMinDate !== 'zzzz' &&
        (transMinDate !== earnMinDate || transMaxDate !== earnMaxDate)) {
      setError(t('etl.upload.dateRangeMismatch', {
        transMin: transMinDate, transMax: transMaxDate,
        earnMin: earnMinDate, earnMax: earnMaxDate,
      }));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const transRows = transFile.rows.map(row => ({
        ...row, seller: transFile.seller,
      })) as CsvTransactionRow[];
      const earnRows = earnFile.rows.map(row => ({
        ...row, seller: earnFile.seller,
      })) as CsvEarningRow[];

      const result = await salesApi.upload({
        seller: detectedSeller, fifoRatioRe, fifoRatioCr, fifoRatioCc,
        transactions: transRows, earnings: earnRows,
      });
      setUploadResult(result);
      setBatchId(result.batchId);
      setStep('parse');
      // Auto-collapse upload section after success
      setCollapsedSections(prev => ({ ...prev, upload: true }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleParse = async () => {
    if (!batchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await salesApi.parse(batchId);
      setParseResult(result);
      const needsFix = result.pendingItems.filter(p => !p.autoFixed);
      if (needsFix.length > 0) {
        setPendingItems(needsFix);
        setStep('clean');
      } else {
        setStep('transform');
      }
      setCollapsedSections(prev => ({ ...prev, parse: true }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFixSku = async (secCode: string) => {
    if (!batchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const fixItems = pendingItems
        .filter(p => fixes[p.transactionId])
        .map(p => ({
          transactionId: p.transactionId,
          customLabel: p.customLabel,
          badSku: p.badSku,
          badQty: p.badQty,
          correctSku: fixes[p.transactionId],
          correctQty: p.badQty,
        }));

      await salesApi.fixSku(batchId, { fixes: fixItems, sec_code_l3: secCode });
      setStep('transform');
      setCollapsedSections(prev => ({ ...prev, clean: true }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fix failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransform = async (secCode: string) => {
    if (!batchId) return;
    setIsLoading(true);
    setError(null);
    setStep('processing');
    try {
      const result = await salesApi.transform(batchId, secCode);
      setTransformResult(result);
      setStep('done');
      setCollapsedSections(prev => ({ ...prev, transform: true }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transform failed');
      setStep('transform');
    } finally {
      setIsLoading(false);
    }
  };

  // Poll batch status during processing
  useEffect(() => {
    if (step !== 'processing' || !batchId) return;
    const interval = setInterval(async () => {
      try {
        const status = await salesApi.getStatus(batchId);
        setBatchStatus(status);
        if (status.status === 'done' || status.status === 'error') {
          clearInterval(interval);
          if (status.status === 'done') setStep('done');
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, batchId]);

  const requestSecurityCode = (action: string, callback: (code: string) => void) => {
    setSecAction(action);
    secCallback.current = callback;
    setSecDialogOpen(true);
  };

  const handleReset = () => {
    setStep('upload');
    setBatchId(null);
    setDetectedFiles([]);
    setUploadResult(null);
    setParseResult(null);
    setTransformResult(null);
    setFixes({});
    setPendingItems([]);
    setError(null);
    setBatchStatus(null);
    setCollapsedSections({});
  };

  // ─── File helpers ───
  const fileTypeLabel = (type: DetectedFile['type']) => {
    switch (type) {
      case 'transaction': return t('etl.upload.typeTransaction');
      case 'earning': return t('etl.upload.typeEarning');
      default: return t('etl.upload.typeUnknown');
    }
  };

  const fileTypeBadge = (type: DetectedFile['type']) => {
    switch (type) {
      case 'transaction': return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
      case 'earning': return { bg: 'bg-green-500/15', text: 'text-green-400' };
      default: return { bg: 'bg-yellow-500/15', text: 'text-yellow-400' };
    }
  };

  // ═══════════════════════════════════════
  // Render — Single Page Progressive Layout
  // ═══════════════════════════════════════

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[1400px] mx-auto">
          <SalesTabSelector />
        </div>
      </section>

      <div className="max-w-[900px] mx-auto px-6 py-4">
      {/* Reset button */}
      <div className="flex items-center justify-end mb-6">
        {step !== 'upload' && (
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
          >
            {t('etl.done.newBatch')}
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="space-y-3">

        {/* ═══════════════════════════════════════════════
            Section 1: Upload
            ═══════════════════════════════════════════════ */}
        <SectionCard
          stepNum={1}
          title={t('etl.steps.upload')}
          status={sectionStatus('upload')}
          collapsed={!!collapsedSections.upload}
          onToggle={() => toggleSection('upload')}
          colors={colors}
        >
          {/* Drop zone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-blue-400 mb-4"
            style={{ borderColor: colors.border }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }}
            />
            <p className="text-sm" style={{ color: colors.textSecondary }}>{t('etl.upload.dropOrClick')}</p>
          </div>

          {/* Detected files */}
          {detectedFiles.length > 0 && (
            <div className="space-y-2 mb-4">
              {detectedFiles.map((df, i) => {
                const badge = fileTypeBadge(df.type);
                return (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ backgroundColor: colors.bgTertiary }}>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                      {fileTypeLabel(df.type)}
                    </span>
                    <span className="text-sm font-medium flex-1 truncate" style={{ color: colors.text }}>
                      {df.file.name}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                      {df.rowCount.toLocaleString()} {t('etl.upload.rowsDetected')}
                    </span>
                    {df.seller && (
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">
                        {df.seller}
                      </span>
                    )}
                    <button
                      className="text-xs text-red-400 hover:text-red-300 ml-1"
                      onClick={() => setDetectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {!transFile && <p className="text-xs text-yellow-400">{t('etl.upload.missingTransaction')}</p>}
              {!earnFile && <p className="text-xs text-yellow-400">{t('etl.upload.missingEarning')}</p>}
              {sellerMismatch && <p className="text-xs text-red-400">{t('etl.upload.sellerMismatch')}</p>}
              {detectedSeller && !sellerMismatch && (
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  {t('etl.upload.detectedSeller')}: <span className="font-medium" style={{ color: colors.text }}>{detectedSeller}</span>
                </p>
              )}
            </div>
          )}

          {/* FIFO sliders — compact row */}
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
            <div>
              <label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
                {t('etl.upload.fifoRe')} <span className="font-mono">{fifoRatioRe}%</span>
              </label>
              <input type="range" min={0} max={100} value={fifoRatioRe}
                onChange={e => setFifoRatioRe(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
                {t('etl.upload.fifoCr')} <span className="font-mono">{fifoRatioCr}%</span>
              </label>
              <input type="range" min={0} max={100} value={fifoRatioCr}
                onChange={e => setFifoRatioCr(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
                {t('etl.upload.fifoCc')} <span className="font-mono">{fifoRatioCc}%</span>
              </label>
              <input type="range" min={0} max={100} value={fifoRatioCc}
                onChange={e => setFifoRatioCc(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          {/* Upload button */}
          <div className="flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!hasBothFiles || !!sellerMismatch || isLoading}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors"
              style={{ backgroundColor: colors.controlAccent }}
            >
              {isLoading ? t('etl.upload.uploading') : t('etl.upload.uploadBtn')}
            </button>
          </div>
        </SectionCard>

        {/* ═══════════════════════════════════════════════
            Section 2: Parse
            ═══════════════════════════════════════════════ */}
        {currentIdx >= stepOrder.indexOf('parse') && (
          <SectionCard
            stepNum={2}
            title={t('etl.steps.parse')}
            status={sectionStatus('parse')}
            collapsed={!!collapsedSections.parse}
            onToggle={() => toggleSection('parse')}
            colors={colors}
          >
            {/* Upload summary */}
            {uploadResult && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{t('etl.parse.transIngested')}</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: colors.text }}>
                    {uploadResult.transCount.toLocaleString()}
                    <span className="text-xs font-normal ml-2" style={{ color: colors.textTertiary }}>
                      ({uploadResult.duplicateTransCount} {t('etl.parse.duplicates')})
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{t('etl.parse.earnIngested')}</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: colors.text }}>
                    {uploadResult.earnCount.toLocaleString()}
                    <span className="text-xs font-normal ml-2" style={{ color: colors.textTertiary }}>
                      ({uploadResult.duplicateEarnCount} {t('etl.parse.duplicates')})
                    </span>
                  </p>
                </div>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              {t('etl.parse.desc')}
            </p>

            <button
              onClick={handleParse}
              disabled={isLoading}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: colors.controlAccent }}
            >
              {isLoading ? t('etl.parse.parsing') : t('etl.parse.parseBtn')}
            </button>
          </SectionCard>
        )}

        {/* ═══════════════════════════════════════════════
            Section 3: Clean (only visible if there are items)
            ═══════════════════════════════════════════════ */}
        {currentIdx >= stepOrder.indexOf('clean') && pendingItems.length > 0 && (
          <SectionCard
            stepNum={3}
            title={`${t('etl.steps.clean')} (${pendingItems.length})`}
            status={sectionStatus('clean')}
            collapsed={!!collapsedSections.clean}
            onToggle={() => toggleSection('clean')}
            colors={colors}
          >
            {parseResult && (
              <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                {t('etl.clean.stats', { ok: parseResult.parsedOk, fix: parseResult.needsFix })}
              </p>
            )}

            {/* SKU correction table */}
            <div className="overflow-auto max-h-[300px] rounded-lg mb-4" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: colors.bgTertiary }}>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: colors.textSecondary }}>Custom Label</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: colors.textSecondary }}>Bad SKU</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: colors.textSecondary }}>{t('etl.clean.correctSku')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((p) => (
                    <tr key={`${p.transactionId}-${p.badSku}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: colors.textSecondary }}>{p.customLabel}</td>
                      <td className="px-3 py-2 text-red-400 font-mono text-xs">{p.badSku}</td>
                      <td className="px-3 py-2">
                        <select
                          value={fixes[p.transactionId] || ''}
                          onChange={e => setFixes(prev => ({ ...prev, [p.transactionId]: e.target.value }))}
                          className="w-full px-2 py-1 rounded text-xs"
                          style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
                        >
                          <option value="">{t('etl.clean.selectSku')}</option>
                          {p.suggestions.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => { setStep('transform'); setCollapsedSections(prev => ({ ...prev, clean: true })); }}
                className="px-4 py-2 rounded-lg text-xs"
                style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
              >
                {t('etl.clean.skipAll')}
              </button>
              <button
                onClick={() => requestSecurityCode('btn_etl_fix_sku', handleFixSku)}
                disabled={isLoading || !Object.keys(fixes).length}
                className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: colors.controlAccent }}
              >
                {isLoading ? t('etl.clean.fixing') : t('etl.clean.fixBtn')}
              </button>
            </div>
          </SectionCard>
        )}

        {/* ═══════════════════════════════════════════════
            Section 4: Transform Confirm
            ═══════════════════════════════════════════════ */}
        {currentIdx >= stepOrder.indexOf('transform') && (
          <SectionCard
            stepNum={pendingItems.length > 0 ? 4 : 3}
            title={t('etl.steps.transform')}
            status={step === 'processing' ? 'done' : step === 'done' ? 'done' : sectionStatus('transform')}
            collapsed={!!collapsedSections.transform}
            onToggle={() => toggleSection('transform')}
            colors={colors}
          >
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              {t('etl.transform.desc')}
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
              <div className="p-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                <span style={{ color: colors.textSecondary }}>{t('etl.upload.fifoRe')}:</span>{' '}
                <span className="font-medium" style={{ color: colors.text }}>{fifoRatioRe}%</span>
              </div>
              <div className="p-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                <span style={{ color: colors.textSecondary }}>{t('etl.upload.fifoCr')}:</span>{' '}
                <span className="font-medium" style={{ color: colors.text }}>{fifoRatioCr}%</span>
              </div>
              <div className="p-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                <span style={{ color: colors.textSecondary }}>{t('etl.upload.fifoCc')}:</span>{' '}
                <span className="font-medium" style={{ color: colors.text }}>{fifoRatioCc}%</span>
              </div>
            </div>
            <button
              onClick={() => requestSecurityCode('btn_etl_transform', handleTransform)}
              disabled={isLoading || step === 'processing' || step === 'done'}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: colors.controlAccent }}
            >
              {isLoading ? t('etl.transform.processing') : t('etl.transform.confirmBtn')}
            </button>
          </SectionCard>
        )}

        {/* ═══════════════════════════════════════════════
            Section 5: Processing / Done
            ═══════════════════════════════════════════════ */}
        {(step === 'processing' || step === 'done') && (
          <SectionCard
            stepNum={pendingItems.length > 0 ? 5 : 4}
            title={step === 'done' ? t('etl.done.title') : t('etl.processing.title')}
            status={step === 'done' ? 'done' : 'active'}
            collapsed={false}
            colors={colors}
          >
            {step === 'processing' && (
              <div className="text-center py-6">
                <div className="w-10 h-10 mx-auto mb-4 rounded-full animate-spin" style={{
                  border: `2px solid ${colors.border}`,
                  borderTopColor: colors.controlAccent,
                }} />
                {batchStatus && (
                  <div className="space-y-2 max-w-sm mx-auto">
                    <div className="w-full rounded-full h-1.5" style={{ backgroundColor: colors.bgTertiary }}>
                      <div className="h-1.5 rounded-full transition-all" style={{
                        width: `${batchStatus.progress}%`,
                        backgroundColor: colors.controlAccent,
                      }} />
                    </div>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      {batchStatus.stageMessage} ({batchStatus.progress}%)
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 'done' && transformResult && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.cleaned')}</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>
                      {transformResult.transform.cleanedCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.fifoOut')}</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>
                      {transformResult.fifo.outCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.fifoReturn')}</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>
                      {transformResult.fifo.returnCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.actions')}</p>
                    <div className="space-y-0.5 text-xs tabular-nums" style={{ color: colors.text }}>
                      {Object.entries(transformResult.transform.actionBreakdown).map(([k, v]) => (
                        <p key={k}><span className="font-mono">{k}</span>: {v}</p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={handleReset}
                    className="px-6 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ backgroundColor: colors.controlAccent }}
                  >
                    {t('etl.done.newBatch')}
                  </button>
                </div>
              </>
            )}
          </SectionCard>
        )}

      </div>
      </div>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={secDialogOpen}
        onCancel={() => setSecDialogOpen(false)}
        onConfirm={(code) => {
          setSecDialogOpen(false);
          secCallback.current(code);
        }}
        level={secLevel}
        title={secAction}
      />
    </div>
  );
}
