'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { salesApi } from '@/lib/api/sales';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type {
  CsvTransactionRow, CsvEarningRow, EtlUploadResponse,
  ParseResult, PendingSkuItem, TransformResult, EtlBatchStatus,
  DataRangeResponse,
} from '@/lib/api/sales';
import { parseEbayCsv, detectSeller, detectFileType, type DetectedFile } from './csv-parser';

// ═══════════════════════════════════════
// Section Card (wizard step container)
// ═══════════════════════════════════════

function SectionCard({ stepNum, title, status, collapsed, onToggle, colors, children }: {
  stepNum: number; title: string; status: 'pending' | 'active' | 'done' | 'error';
  collapsed: boolean; onToggle?: () => void; colors: any; children: React.ReactNode;
}) {
  const statusIcon = {
    pending: <span className="text-gray-400">{stepNum}</span>,
    active: <span style={{ color: colors.controlAccent }}>{stepNum}</span>,
    done: <span className="text-green-500">✓</span>,
    error: <span className="text-red-500">✕</span>,
  };
  return (
    <section className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}`, opacity: status === 'pending' ? 0.5 : 1 }}>
      <div className={`flex items-center gap-3 px-5 py-3 ${status === 'done' ? 'cursor-pointer' : ''}`} onClick={status === 'done' ? onToggle : undefined} style={{ borderBottom: collapsed ? 'none' : `1px solid ${colors.border}` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: status === 'active' ? `${colors.controlAccent}20` : status === 'done' ? '#34C75915' : colors.bgTertiary }}>
          {statusIcon[status]}
        </div>
        <span className="text-sm font-semibold flex-1" style={{ color: status === 'pending' ? colors.textTertiary : colors.text }}>{title}</span>
        {status === 'done' && onToggle && (<span className="text-xs" style={{ color: colors.textTertiary }}>{collapsed ? '▸' : '▾'}</span>)}
      </div>
      {!collapsed && (<div className="px-5 pb-5 pt-3">{children}</div>)}
    </section>
  );
}

// ═══════════════════════════════════════
// CSV Tab
// ═══════════════════════════════════════

type WizardStep = 'upload' | 'parse' | 'clean' | 'transform' | 'processing' | 'done';

interface CsvTabProps {
  colors: any;
  dataRange: DataRangeResponse | null;
  formatDate: (iso: string | null) => string;
}

export default function CsvTab({ colors, dataRange, formatDate }: CsvTabProps) {
  const t = useTranslations('sales');

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fifoRatioRe, setFifoRatioRe] = useState(60);
  const [fifoRatioCr, setFifoRatioCr] = useState(50);
  const [fifoRatioCc, setFifoRatioCc] = useState(30);
  const [uploadResult, setUploadResult] = useState<EtlUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingSkuItem[]>([]);
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null);
  const [batchStatus, setBatchStatus] = useState<EtlBatchStatus | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [secDialogOpen, setSecDialogOpen] = useState(false);
  const [secAction, setSecAction] = useState('');
  const [secLevel] = useState<'L0' | 'L1' | 'L2' | 'L3' | 'L4'>('L3');
  const secCallback = useRef<(code: string) => void>(() => {});

  // Derived
  const transFile = detectedFiles.find(f => f.type === 'transaction');
  const earnFile = detectedFiles.find(f => f.type === 'earning');
  const detectedSeller = transFile?.seller || earnFile?.seller || '';
  const sellerMismatch = transFile?.seller && earnFile?.seller && transFile.seller !== earnFile.seller;
  const stepOrder: WizardStep[] = ['upload', 'parse', 'clean', 'transform', 'processing', 'done'];
  const currentIdx = stepOrder.indexOf(step);
  const sectionStatus = (sectionStep: WizardStep): 'pending' | 'active' | 'done' | 'error' => {
    const sIdx = stepOrder.indexOf(sectionStep);
    if (sIdx < currentIdx) return 'done';
    if (sIdx === currentIdx) return error && sIdx === currentIdx ? 'error' : 'active';
    return 'pending';
  };

  // Handlers
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
            for (const nf of newFiles) { const idx = updated.findIndex(u => u.type === nf.type); if (idx >= 0) updated[idx] = nf; else updated.push(nf); }
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
    for (const row of transFile.rows) { const d = row.transactionCreationDate; if (d) { if (d < transMinDate) transMinDate = d; if (d > transMaxDate) transMaxDate = d; } }
    if (transMaxDate && transMaxDate >= today) { setError(t('etl.upload.futureDate', { maxDate: transMaxDate, today })); return; }
    let earnMinDate = 'zzzz', earnMaxDate = '';
    for (const row of earnFile.rows) { const d = row.orderCreationDate; if (d) { if (d < earnMinDate) earnMinDate = d; if (d > earnMaxDate) earnMaxDate = d; } }
    if (transMinDate !== 'zzzz' && earnMinDate !== 'zzzz' && (transMinDate !== earnMinDate || transMaxDate !== earnMaxDate)) {
      setError(t('etl.upload.dateRangeMismatch', { transMin: transMinDate, transMax: transMaxDate, earnMin: earnMinDate, earnMax: earnMaxDate })); return;
    }
    setIsLoading(true); setError(null);
    try {
      const transRows = transFile.rows.map(row => ({ ...row, seller: transFile.seller })) as CsvTransactionRow[];
      const earnRows = earnFile.rows.map(row => ({ ...row, seller: earnFile.seller })) as CsvEarningRow[];
      const result = await salesApi.upload({ seller: detectedSeller, fifoRatioRe, fifoRatioCr, fifoRatioCc, transactions: transRows, earnings: earnRows });
      setUploadResult(result); setBatchId(result.batchId); setStep('parse');
      setCollapsedSections(prev => ({ ...prev, upload: true }));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setIsLoading(false); }
  };

  const handleParse = async () => {
    if (!batchId) return; setIsLoading(true); setError(null);
    try {
      const result = await salesApi.parse(batchId); setParseResult(result);
      const needsFix = result.pendingItems.filter(p => !p.autoFixed);
      if (needsFix.length > 0) { setPendingItems(needsFix); setStep('clean'); } else { setStep('transform'); }
      setCollapsedSections(prev => ({ ...prev, parse: true }));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Parse failed'); }
    finally { setIsLoading(false); }
  };

  const handleFixSku = async (secCode: string) => {
    if (!batchId) return; setIsLoading(true); setError(null);
    try {
      const fixItems = pendingItems.filter(p => fixes[p.transactionId]).map(p => ({
        transactionId: p.transactionId, customLabel: p.customLabel, badSku: p.badSku, badQty: p.badQty,
        correctSku: fixes[p.transactionId], correctQty: p.badQty,
      }));
      await salesApi.fixSku(batchId, { fixes: fixItems, sec_code_l3: secCode });
      setStep('transform'); setCollapsedSections(prev => ({ ...prev, clean: true }));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Fix failed'); }
    finally { setIsLoading(false); }
  };

  const handleTransform = async (secCode: string) => {
    if (!batchId) return; setIsLoading(true); setError(null); setStep('processing');
    try {
      const result = await salesApi.transform(batchId, secCode);
      setTransformResult(result); setStep('done'); setCollapsedSections(prev => ({ ...prev, transform: true }));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Transform failed'); setStep('transform'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (step !== 'processing' || !batchId) return;
    const interval = setInterval(async () => {
      try {
        const status = await salesApi.getStatus(batchId);
        setBatchStatus(status);
        if (status.status === 'done' || status.status === 'error') { clearInterval(interval); if (status.status === 'done') setStep('done'); }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, batchId]);

  const requestSecurityCode = (action: string, callback: (code: string) => void) => { setSecAction(action); secCallback.current = callback; setSecDialogOpen(true); };
  const handleReset = () => { setStep('upload'); setBatchId(null); setDetectedFiles([]); setUploadResult(null); setParseResult(null); setTransformResult(null); setFixes({}); setPendingItems([]); setError(null); setBatchStatus(null); setCollapsedSections({}); };
  const fileTypeLabel = (type: DetectedFile['type']) => {
    switch (type) { case 'transaction': return t('etl.upload.typeTransaction'); case 'earning': return t('etl.upload.typeEarning'); default: return t('etl.upload.typeUnknown'); }
  };
  const fileTypeBadge = (type: DetectedFile['type']) => {
    switch (type) { case 'transaction': return '#007AFF'; case 'earning': return '#34C759'; default: return '#FF9500'; }
  };

  const csvInfo = dataRange?.csv;

  return (
    <div>
      {/* CSV Data Status */}
      <section className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
        <div className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#FF9500' }} />
            <span className="text-sm font-semibold" style={{ color: colors.text }}>{t('etl.apiSync.statusTitle')}</span>
          </div>
          <div className="flex-1 flex items-center gap-3 text-xs" style={{ color: colors.textSecondary }}>
            {csvInfo && (
              <>
                <span>
                  {t('etl.apiSync.dateRange')}:{' '}
                  <span className="font-mono font-medium" style={{ color: colors.text }}>{formatDate(csvInfo.minDate)}</span>
                  {' '}{t('etl.apiSync.to')}{' '}
                  <span className="font-mono font-medium" style={{ color: colors.text }}>{formatDate(csvInfo.maxDate)}</span>
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bgTertiary }}>
                  {csvInfo.totalRows.toLocaleString()} {t('etl.apiSync.totalRows')}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Reset button */}
      <div className="flex items-center justify-end mb-4">
        {step !== 'upload' && (
          <button onClick={handleReset} className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
            {t('etl.done.newBatch')}
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl p-3 mb-4 text-sm" style={{ backgroundColor: '#FF3B3015', border: '1px solid #FF3B3040', color: '#FF3B30' }}>{error}</div>
      )}

      {/* Section 1: Upload */}
      <SectionCard stepNum={1} title={t('etl.steps.upload')} status={sectionStatus('upload')} collapsed={!!collapsedSections.upload} onToggle={() => setCollapsedSections(prev => ({ ...prev, upload: !prev.upload }))} colors={colors}>
        <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <div className="rounded-xl p-6 text-center border-2 border-dashed cursor-pointer transition-colors hover:border-opacity-60 mb-4" style={{ borderColor: colors.border, backgroundColor: colors.bgTertiary }} onClick={() => fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{t('etl.upload.dropOrClick')}</p>
        </div>
        {detectedFiles.length > 0 && (
          <div className="space-y-2 mb-4">
            {detectedFiles.map((df, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: fileTypeBadge(df.type) }} />
                <span className="text-sm flex-1 truncate" style={{ color: colors.text }}>{df.file.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${fileTypeBadge(df.type)}20`, color: fileTypeBadge(df.type) }}>{fileTypeLabel(df.type)}</span>
                <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>{df.rowCount} {t('etl.upload.rowsDetected')}</span>
              </div>
            ))}
            {detectedSeller && <p className="text-xs" style={{ color: colors.textSecondary }}>{t('etl.upload.detectedSeller')}: <span className="font-medium" style={{ color: colors.text }}>{detectedSeller}</span></p>}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[{ label: t('etl.upload.fifoRe'), value: fifoRatioRe, set: setFifoRatioRe }, { label: t('etl.upload.fifoCr'), value: fifoRatioCr, set: setFifoRatioCr }, { label: t('etl.upload.fifoCc'), value: fifoRatioCc, set: setFifoRatioCc }].map(({ label, value, set }) => (
            <div key={label} className="p-2.5 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
              <span className="text-xs" style={{ color: colors.textSecondary }}>{label}: </span>
              <input type="number" value={value} onChange={e => set(Number(e.target.value))} className="w-12 text-xs text-center bg-transparent" style={{ color: colors.text }} />%
            </div>
          ))}
        </div>
        <button onClick={handleUpload} disabled={!transFile || isLoading} className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40" style={{ backgroundColor: colors.controlAccent }}>
          {isLoading ? t('etl.upload.uploading') : t('etl.upload.uploadBtn')}
        </button>
      </SectionCard>

      {/* Section 2: Parse */}
      {(step === 'parse' || currentIdx > stepOrder.indexOf('parse')) && (
        <SectionCard stepNum={2} title={t('etl.steps.parse')} status={sectionStatus('parse')} collapsed={!!collapsedSections.parse} onToggle={() => setCollapsedSections(prev => ({ ...prev, parse: !prev.parse }))} colors={colors}>
          {uploadResult && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[{ label: t('etl.parse.transIngested'), val: uploadResult.transCount }, { label: t('etl.parse.earnIngested'), val: uploadResult.earnCount }, { label: t('etl.parse.duplicates'), val: uploadResult.duplicateTransCount + uploadResult.duplicateEarnCount }].map(({ label, val }) => (
                <div key={label} className="p-2.5 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{label}</p>
                  <p className="text-lg font-bold" style={{ color: colors.controlAccent }}>{val}</p>
                </div>
              ))}
            </div>
          )}
          <button onClick={handleParse} disabled={isLoading} className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40" style={{ backgroundColor: colors.controlAccent }}>
            {isLoading ? t('etl.parse.parsing') : t('etl.parse.parseBtn')}
          </button>
        </SectionCard>
      )}

      {/* Section 3: Clean (SKU Fix) */}
      {pendingItems.length > 0 && (step === 'clean' || currentIdx > stepOrder.indexOf('clean')) && (
        <SectionCard stepNum={3} title={t('etl.steps.clean')} status={sectionStatus('clean')} collapsed={!!collapsedSections.clean} onToggle={() => setCollapsedSections(prev => ({ ...prev, clean: !prev.clean }))} colors={colors}>
          {parseResult && <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>{t('etl.clean.stats', { ok: parseResult.parsedOk, fix: parseResult.needsFix })}</p>}
          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
            {pendingItems.map(p => (
              <div key={p.transactionId} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono truncate" style={{ color: colors.text }}>{p.customLabel}</p>
                  <p className="text-[10px]" style={{ color: colors.textTertiary }}>{p.badSku}</p>
                </div>
                <select value={fixes[p.transactionId] || ''} onChange={e => setFixes(prev => ({ ...prev, [p.transactionId]: e.target.value }))} className="w-40 px-2 py-1 rounded text-xs" style={{ backgroundColor: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}` }}>
                  <option value="">{t('etl.clean.selectSku')}</option>
                  {p.suggestions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => requestSecurityCode('btn_etl_fix', handleFixSku)} disabled={isLoading} className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40" style={{ backgroundColor: colors.controlAccent }}>
              {isLoading ? t('etl.clean.fixing') : t('etl.clean.fixBtn')}
            </button>
            <button onClick={() => { setStep('transform'); setCollapsedSections(prev => ({ ...prev, clean: true })); }} className="px-4 py-2 rounded-lg text-sm" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
              {t('etl.clean.skipAll')}
            </button>
          </div>
        </SectionCard>
      )}

      {/* Section 4: Transform */}
      {(step === 'transform' || step === 'processing' || step === 'done') && (
        <SectionCard stepNum={pendingItems.length > 0 ? 4 : 3} title={t('etl.steps.transform')} status={sectionStatus('transform')} collapsed={!!collapsedSections.transform} onToggle={() => setCollapsedSections(prev => ({ ...prev, transform: !prev.transform }))} colors={colors}>
          <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>{t('etl.transform.desc')}</p>
          <button onClick={() => requestSecurityCode('btn_etl_transform', handleTransform)} disabled={isLoading || step === 'processing' || step === 'done'} className="px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40" style={{ backgroundColor: colors.controlAccent }}>
            {isLoading ? t('etl.transform.processing') : t('etl.transform.confirmBtn')}
          </button>
        </SectionCard>
      )}

      {/* Section 5: Processing / Done */}
      {(step === 'processing' || step === 'done') && (
        <SectionCard stepNum={pendingItems.length > 0 ? 5 : 4} title={step === 'done' ? t('etl.done.title') : t('etl.processing.title')} status={step === 'done' ? 'done' : 'active'} collapsed={false} colors={colors}>
          {step === 'processing' && (
            <div className="text-center py-6">
              <div className="w-10 h-10 mx-auto mb-4 rounded-full animate-spin" style={{ border: `2px solid ${colors.border}`, borderTopColor: colors.controlAccent }} />
              {batchStatus && (
                <div className="space-y-2 max-w-sm mx-auto">
                  <div className="w-full rounded-full h-1.5" style={{ backgroundColor: colors.bgTertiary }}>
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${batchStatus.progress}%`, backgroundColor: colors.controlAccent }} />
                  </div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{batchStatus.stageMessage} ({batchStatus.progress}%)</p>
                </div>
              )}
            </div>
          )}
          {step === 'done' && transformResult && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.cleaned')}</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>{transformResult.transform.cleanedCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.fifoOut')}</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>{transformResult.fifo.outCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.fifoReturn')}</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: colors.controlAccent }}>{transformResult.fifo.returnCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                  <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('etl.done.actions')}</p>
                  <div className="space-y-0.5 text-xs tabular-nums" style={{ color: colors.text }}>
                    {Object.entries(transformResult.transform.actionBreakdown).map(([k, v]) => <p key={k}><span className="font-mono">{k}</span>: {v}</p>)}
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <button onClick={handleReset} className="px-6 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: colors.controlAccent }}>{t('etl.done.newBatch')}</button>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* Security Code Dialog */}
      <SecurityCodeDialog isOpen={secDialogOpen} onCancel={() => setSecDialogOpen(false)} onConfirm={(code) => { setSecDialogOpen(false); secCallback.current(code); }} level={secLevel} title={secAction} />
    </div>
  );
}
