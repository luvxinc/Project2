'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi } from '@/lib/api/sales';
import type { ReportFile, PreviewTable } from '@/lib/api/sales';
import SalesTabSelector from '../components/SalesTabSelector';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { animate } from 'animejs';

// ═══════════════════════════════════════════════════
// Report Generator Modal (unchanged)
// ═══════════════════════════════════════════════════

function GeneratorModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations('sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Generation params
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lrCase, setLrCase] = useState(0.6);
  const [lrRequest, setLrRequest] = useState(0.5);
  const [lrReturn, setLrReturn] = useState(0.3);
  const [lrDispute, setLrDispute] = useState(1.0);
  const [leadTime, setLeadTime] = useState(3.0);
  const [safetyStock, setSafetyStock] = useState(1.0);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
      setResult(null);
      setProgress(0);
    }
  }, [isOpen]);

  const generateMutation = useMutation({
    mutationFn: () => {
      setIsGenerating(true);
      setProgress(1);
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 0.5, 8));
      }, 2000);

      return salesApi.generateReports({
        startDate, endDate,
        lrCase, lrRequest, lrReturn, lrDispute,
        leadTime, safetyStock,
      }).finally(() => clearInterval(interval));
    },
    onSuccess: (data) => {
      setIsGenerating(false);
      setProgress(9);
      if (data.success) {
        setResult({ success: true, message: t('reports.resultSuccess') + ` (${data.fileCount} files)` });
      } else {
        setResult({ success: false, message: data.errors?.join(', ') || t('reports.resultWarning') });
      }
      onSuccess();
    },
    onError: (err) => {
      setIsGenerating(false);
      setResult({ success: false, message: String(err) });
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isGenerating) onClose(); }}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
          <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
            {t('reports.generateTitle')}
          </h2>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
            style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('reports.startDate')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isGenerating}
                className="w-full h-9 px-3 border rounded-lg text-sm"
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('reports.endDate')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isGenerating}
                className="w-full h-9 px-3 border rounded-lg text-sm"
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              />
            </div>
          </div>

          {/* Loss Rates */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
              {t('reports.lossRates')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('reports.lrCase'), value: lrCase, set: setLrCase },
                { label: t('reports.lrRequest'), value: lrRequest, set: setLrRequest },
                { label: t('reports.lrReturn'), value: lrReturn, set: setLrReturn },
                { label: t('reports.lrDispute'), value: lrDispute, set: setLrDispute },
              ].map((item) => (
                <div key={item.label}>
                  <label className="block text-[10px] mb-0.5" style={{ color: colors.textTertiary }}>
                    {item.label}
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={item.value}
                    onChange={(e) => item.set(parseFloat(e.target.value) || 0)}
                    disabled={isGenerating}
                    className="w-full h-8 px-2 border rounded text-xs text-center"
                    style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Supply Chain Params */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('reports.leadTime')}
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={leadTime}
                onChange={(e) => setLeadTime(parseFloat(e.target.value) || 0)}
                disabled={isGenerating}
                className="w-full h-9 px-3 border rounded-lg text-sm"
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('reports.safetyStock')}
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={safetyStock}
                onChange={(e) => setSafetyStock(parseFloat(e.target.value) || 0)}
                disabled={isGenerating}
                className="w-full h-9 px-3 border rounded-lg text-sm"
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              />
            </div>
          </div>

          {/* Progress */}
          {isGenerating && (
            <div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.bgTertiary }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(progress / 9) * 100}%`, backgroundColor: colors.controlAccent }}
                />
              </div>
              <p className="text-xs mt-2 text-center" style={{ color: colors.textSecondary }}>
                {t('reports.generating')} ({Math.round(progress)}/9)
              </p>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className="rounded-xl p-4 border" style={{ borderColor: result.success ? `${colors.green}30` : `${colors.red}30`, backgroundColor: result.success ? `${colors.green}18` : `${colors.red}18` }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: result.success ? colors.green : colors.red }}>
                  {result.success ? t('reports.resultSuccess') : t('reports.resultWarning')}
                </span>
                <span className="text-sm" style={{ color: result.success ? colors.green : colors.red }}>
                  {result.message}
                </span>
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={isGenerating || !startDate || !endDate}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: colors.controlAccent, color: colors.white }}
          >
            {isGenerating ? t('reports.generating') : t('reports.generateBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════
// Report Center Page — Slide-in Preview Pattern
// ═══════════════════════════════════════════════════

export default function SalesReportsPage() {
  const t = useTranslations('sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [showGenerator, setShowGenerator] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Slide-over state (matches Supplier pattern)
  const [selectedFile, setSelectedFile] = useState<ReportFile | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsClient(true); }, []);

  const { data: files, isLoading } = useQuery({
    queryKey: ['salesReportFiles'],
    queryFn: () => salesApi.getReportFiles(),
    enabled: isClient,
  });

  // Preview data — fetched when a file is selected
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['salesReportPreview', selectedFile?.name],
    queryFn: () => salesApi.previewReport(selectedFile!.name),
    enabled: isFlipped && !!selectedFile?.name,
  });

  const clearMutation = useMutation({
    mutationFn: () => salesApi.clearReports(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesReportFiles'] });
    },
  });

  const handleClear = () => {
    if (confirm(t('reports.clearConfirm'))) {
      clearMutation.mutate();
    }
  };

  const handleDownloadFile = useCallback((filename: string) => {
    const baseUrl = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const url = `${baseUrl}/sales/reports/download/${encodeURIComponent(filename)}`;

    fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    }).then(res => res.blob()).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }, []);

  const handleDownloadZip = () => {
    const baseUrl = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const url = `${baseUrl}/sales/reports/download-zip`;

    fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    }).then(res => res.blob()).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Reports_All_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  // ═══════════ Slide-over Animation ═══════════

  const handleRowClick = useCallback((file: ReportFile) => {
    // Only preview table files
    if (file.fileType !== 'table') return;

    setSelectedFile(file);

    const slideOut = frontRef.current
      ? frontRef.current.getBoundingClientRect().right
      : window.innerWidth;

    if (frontRef.current) {
      animate(frontRef.current, {
        translateX: [0, -slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(true);
      requestAnimationFrame(() => {
        if (backRef.current) {
          animate(backRef.current, {
            translateX: [window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  const handleBack = useCallback(() => {
    const slideOut = backRef.current
      ? window.innerWidth - backRef.current.getBoundingClientRect().left
      : window.innerWidth;

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(false);
      setSelectedFile(null);
      requestAnimationFrame(() => {
        if (frontRef.current) {
          animate(frontRef.current, {
            translateX: [-window.innerWidth, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  // File icon — macOS Finder style: uniform muted color
  const getFileIcon = (name: string) => {
    const lower = name.toLowerCase();
    const c = colors.gray;
    if (lower.includes('sku_sold') || lower.includes('sales_qty'))                             return { icon: 'Q', color: c };
    if (lower.includes('listing'))                                                              return { icon: 'L', color: c };
    if (lower.includes('combo'))                                                                return { icon: 'C', color: c };
    if (lower.includes('profit') || lower.includes('sku'))                                     return { icon: '$', color: c };
    if (lower.includes('customer') || lower.includes('crm'))                                   return { icon: 'U', color: c };
    if (lower.includes('shipping') || lower.includes('logist'))                                return { icon: 'T', color: c };
    if (lower.includes('inventory') || lower.includes('snapshot'))                             return { icon: 'I', color: c };
    if (lower.includes('forecast') || lower.includes('predict') || lower.includes('estimated')) return { icon: 'P', color: c };
    if (lower.includes('order') || lower.includes('restock'))                                  return { icon: 'R', color: c };
    return { icon: 'F', color: c };
  };

  const reportFiles = files || [];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector — hidden during detail view */}
      {!isFlipped && (
        <section className="pt-12 pb-4 px-6">
          <div className="max-w-[1400px] mx-auto">
            <SalesTabSelector />
          </div>
        </section>
      )}

      {/* Content */}
      <section className="max-w-[1200px] mx-auto px-6 pt-4 relative">
        {/* Click-outside overlay for slide-over — closes detail panel */}
        {isFlipped && (
          <div
            className="fixed inset-0 z-10"
            onClick={handleBack}
          />
        )}

        <div className="relative z-20">
          {/* ═══════════ FRONT: File List ═══════════ */}
          {!isFlipped && (
            <div ref={frontRef}>
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {reportFiles.length > 0 && (
                    <>
                      <button
                        onClick={handleDownloadZip}
                        className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-opacity hover:opacity-80"
                        style={{ backgroundColor: colors.controlAccent, color: colors.white }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        {t('reports.downloadAll')}
                      </button>
                      <button
                        onClick={handleClear}
                        className="px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-opacity hover:opacity-80"
                        style={{ color: colors.red, border: `1px solid ${colors.red}4D` }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        {t('reports.clearAll')}
                      </button>
                    </>
                  )}
                </div>

                {/* Generate Reports Button */}
                <button
                  onClick={() => setShowGenerator(true)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ backgroundColor: colors.controlAccent }}
                >
                  {t('reports.generateBtn')}
                </button>
              </div>

              {/* File List */}
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                    style={{ borderColor: `${colors.controlAccent} transparent ${colors.controlAccent} ${colors.controlAccent}` }} />
                  <p className="text-sm mt-3" style={{ color: colors.textSecondary }}>
                    {t('reports.loading')}
                  </p>
                </div>
              ) : reportFiles.length === 0 ? (
                <div
                  className="rounded-xl p-16 text-center"
                  style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                >
                  <div className="text-5xl mb-4 opacity-30" style={{ color: colors.textTertiary }}>—</div>
                  <h3 className="text-lg font-medium mb-2" style={{ color: colors.textSecondary }}>
                    {t('reports.noFiles')}
                  </h3>
                  <p className="text-sm mb-5" style={{ color: colors.textTertiary }}>
                    {t('reports.noFilesHint')}
                  </p>
                  <button
                    onClick={() => setShowGenerator(true)}
                    className="px-5 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-80"
                    style={{ backgroundColor: colors.controlAccent }}
                  >
                    {t('reports.generateBtn')}
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                >
                  {/* File count header */}
                  <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: colors.border }}>
                    <span className="text-sm font-medium" style={{ color: colors.text }}>
                      {t('reports.fileList')}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
                      {reportFiles.length} {t('reports.files')}
                    </span>
                  </div>

                  {/* File items — entire row clickable for slide-in preview */}
                  <div className="divide-y" style={{ borderColor: colors.border }}>
                    {reportFiles.map((file, idx) => {
                      const { icon, color } = getFileIcon(file.name);
                      const isTable = file.fileType === 'table';
                      return (
                        <div
                          key={idx}
                          onClick={() => isTable && handleRowClick(file)}
                          className={`flex items-center px-5 py-3 transition-colors ${isTable ? 'cursor-pointer hover:brightness-110' : 'opacity-60'}`}
                          style={{ borderColor: colors.border }}
                        >
                          {/* Icon */}
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold mr-4 flex-shrink-0"
                            style={{ backgroundColor: `${color}15`, color }}
                          >{icon}</span>

                          {/* File info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: colors.text }}>
                              {file.name}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                                {file.sizeDisplay}
                              </span>
                              <span className="text-xs" style={{ color: colors.textTertiary }}>
                                {file.modified}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}10`, color }}>
                                {file.fileType?.toUpperCase() || 'FILE'}
                              </span>
                            </div>
                          </div>

                          {/* Chevron — only for previewable files */}
                          {isTable && (
                            <svg className="w-4 h-4 ml-3 flex-shrink-0" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════ BACK: File Detail / Preview Panel ═══════════ */}
          {isFlipped && selectedFile && (
            <div ref={backRef}>
              {/* Back + Actions bar */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: colors.blue }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('reports.fileList')}
                </button>

                {/* Download button — moved here from row */}
                <button
                  onClick={() => handleDownloadFile(selectedFile.name)}
                  className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-opacity hover:opacity-80"
                  style={{ backgroundColor: colors.controlAccent, color: colors.white }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {t('reports.download')}
                </button>
              </div>

              {/* File summary card */}
              <div
                className="rounded-xl mb-5 px-5 py-4"
                style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
              >
                <div className="flex items-center gap-4">
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: `${colors.gray}15`, color: colors.gray }}
                  >
                    {getFileIcon(selectedFile.name).icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold truncate" style={{ color: colors.text }}>
                      {selectedFile.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                        {selectedFile.sizeDisplay}
                      </span>
                      <span className="text-xs" style={{ color: colors.textTertiary }}>
                        {selectedFile.modified}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview content — constrained height with scroll */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
              >
                {/* Preview header */}
                <div className="px-5 py-3 border-b" style={{ borderColor: colors.border }}>
                  <span className="text-sm font-medium" style={{ color: colors.text }}>
                    {t('reports.previewTitle')}
                  </span>
                </div>

                {/* Preview body — max height with vertical scroll, horizontal drag/scroll */}
                <div className="px-5 py-4" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                  {previewLoading ? (
                    <div className="text-center py-16">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                        style={{ borderColor: `${colors.controlAccent} transparent ${colors.controlAccent} ${colors.controlAccent}` }} />
                      <p className="text-sm mt-3" style={{ color: colors.textSecondary }}>
                        {t('reports.loading')}
                      </p>
                    </div>
                  ) : !preview?.previewAvailable ? (
                    <div className="rounded-xl p-10 text-center" style={{ backgroundColor: colors.bgTertiary }}>
                      <div className="text-4xl mb-3 opacity-30">📄</div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {preview?.message || t('reports.previewUnavailable')}
                      </p>
                    </div>
                  ) : preview.tables && preview.tables.length > 0 ? (
                    <div className="space-y-5">
                      {preview.tables.map((table: PreviewTable, idx: number) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
                              {table.title}
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
                              {table.rows} rows × {table.columns.length} cols
                            </span>
                          </div>
                          {/* Horizontally scrollable table container */}
                          <div
                            className="overflow-x-auto rounded-lg cursor-grab active:cursor-grabbing"
                            style={{ border: `1px solid ${colors.border}` }}
                            onMouseDown={(e) => {
                              const el = e.currentTarget;
                              const startX = e.pageX - el.offsetLeft;
                              const scrollLeft = el.scrollLeft;
                              const onMove = (ev: MouseEvent) => {
                                el.scrollLeft = scrollLeft - (ev.pageX - el.offsetLeft - startX);
                              };
                              const onUp = () => {
                                document.removeEventListener('mousemove', onMove);
                                document.removeEventListener('mouseup', onUp);
                              };
                              document.addEventListener('mousemove', onMove);
                              document.addEventListener('mouseup', onUp);
                            }}
                          >
                            <table className="w-full text-xs" style={{ minWidth: `${Math.max(table.columns.length * 120, 600)}px` }}>
                              <thead>
                                <tr style={{ backgroundColor: colors.bgTertiary }}>
                                  {table.columns.map((col, ci) => (
                                    <th key={ci} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {table.data.map((row, ri) => (
                                  <tr key={ri} className="transition-colors hover:brightness-110">
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="px-3 py-1.5 whitespace-nowrap" style={{ color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {table.rows > 100 && (
                            <p className="text-xs mt-1 italic" style={{ color: colors.textTertiary }}>
                              {t('reports.showingRows', { count: table.rows })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl p-10 text-center" style={{ backgroundColor: colors.bgTertiary }}>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>{t('reports.noDataPreview')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Generator Modal */}
      <GeneratorModal
        isOpen={showGenerator}
        onClose={() => setShowGenerator(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['salesReportFiles'] });
        }}
      />
    </div>
  );
}
