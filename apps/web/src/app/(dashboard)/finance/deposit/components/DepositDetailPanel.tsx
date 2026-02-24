'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { themeColors } from '@/contexts/ThemeContext';
import { financeApi } from '@/lib/api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import type { DepositListItem, FileItem } from '@/lib/api';
import HistoryPanel from './HistoryPanel';
import OrdersPanel from './OrdersPanel';

interface DepositDetailPanelProps {
  pmtNo: string;
  poNum: string;
  item: DepositListItem;
  onBack: () => void;
  onDeletePayment?: (pmtNo: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  theme: string;
}

const PAYMENT_STATUS_COLORS: Record<string, { bg: string; color: string; dot: string; ring: string }> = {
  unpaid:  { bg: 'rgba(255,159,10,0.12)',  color: '#ff9f0a', dot: '#ff9f0a', ring: 'rgba(255,159,10,0.3)' },
  paid:    { bg: 'rgba(48,209,88,0.12)',   color: '#30d158', dot: '#30d158', ring: 'rgba(48,209,88,0.3)' },
  partial: { bg: 'rgba(100,210,255,0.12)', color: '#64d2ff', dot: '#64d2ff', ring: 'rgba(100,210,255,0.3)' },
  deleted: { bg: 'rgba(142,142,147,0.14)', color: '#8e8e93', dot: '#8e8e93', ring: 'rgba(142,142,147,0.25)' },
};

const fmtNum = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * DepositDetailPanel -- Slide-in detail panel for a deposit payment record.
 * V1 parity: deposit/detail view
 *
 * Shows payment info summary and tabbed content: History | Orders | Files
 */
export default function DepositDetailPanel({
  pmtNo, poNum, item, onBack, onDeletePayment, t, theme,
}: DepositDetailPanelProps) {
  const colors = themeColors[theme as keyof typeof themeColors] ?? themeColors.dark;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'orders' | 'files'>('history');
  const [uploadPending, setUploadPending] = useState(false);

  const statusStyle = PAYMENT_STATUS_COLORS[item.paymentStatus] ?? PAYMENT_STATUS_COLORS.unpaid;

  // ── Files query ──
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['depositPaymentFiles', pmtNo],
    queryFn: () => financeApi.getDepositPaymentFiles(pmtNo),
    enabled: activeTab === 'files',
  });

  const files = filesData?.files ?? [];

  // ── File upload (L2 security) ──
  const pendingFileRef = useRef<File | null>(null);

  const uploadSecurity = useSecurityAction({
    actionKey: 'btn_deposit_file_upload',
    level: 'L2',
    onExecute: async (code) => {
      if (!pendingFileRef.current) return;
      setUploadPending(true);
      try {
        await financeApi.uploadDepositPaymentFile(pmtNo, pendingFileRef.current, code);
        queryClient.invalidateQueries({ queryKey: ['depositPaymentFiles', pmtNo] });
      } finally {
        pendingFileRef.current = null;
        setUploadPending(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFileRef.current = file;
    uploadSecurity.trigger();
  };

  // ── File delete (L2 security) ──
  const pendingDeleteRef = useRef<string>('');

  const deleteMutation = useMutation({
    mutationFn: (args: { filename: string; code: string }) =>
      financeApi.deleteDepositPaymentFile(pmtNo, args.filename, args.code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['depositPaymentFiles', pmtNo] });
      deleteFileSecurity.onCancel();
    },
    onError: () => {
      deleteFileSecurity.setError(t('common.securityCode.invalid'));
    },
  });

  const deleteFileSecurity = useSecurityAction({
    actionKey: 'btn_deposit_file_delete',
    level: 'L2',
    onExecute: (code) => {
      deleteMutation.mutate({ filename: pendingDeleteRef.current, code });
    },
  });

  const handleDeleteFile = (filename: string) => {
    pendingDeleteRef.current = filename;
    deleteFileSecurity.trigger();
  };

  // ── File download ──
  const handleDownload = (filename: string) => {
    const url = financeApi.serveDepositPaymentFile(pmtNo, filename);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const baseUrl = getApiBaseUrlCached();

    fetch(`${baseUrl}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  // ── Count badges for tabs ──
  const fileCount = files.length;

  return (
    <div className="relative">
      {/* ── Back button + Delete ── */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: colors.blue }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('deposit.detail.back')}
        </button>

        {onDeletePayment && pmtNo && (
          <button
            onClick={() => onDeletePayment(pmtNo)}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}
          >
            {t('deposit.actions.delete')}
          </button>
        )}
      </div>

      {/* ── Summary card ── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* Top: pmtNo + poNum + status badge */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <p className="text-base font-mono font-bold" style={{ color: colors.text }}>
              {pmtNo}
            </p>
            <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>
              {poNum}
            </span>
            <span
              className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-xs font-semibold tracking-tight"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
                boxShadow: `0 0 0 1px ${statusStyle.ring}`,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.paymentStatus === 'unpaid' ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: statusStyle.dot }}
              />
              {t(`deposit.status.${item.paymentStatus}`)}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('deposit.detail.depositAmount')}</p>
            <p className="text-sm font-mono font-semibold tabular-nums" style={{ color: colors.text }}>
              ¥{fmtNum(item.depositAmountRmb, 5)}
              <span className="ml-2 text-xs font-normal" style={{ color: colors.textTertiary }}>
                ≈ ${fmtNum(item.depositAmountUsd, 5)}
              </span>
            </p>
          </div>
        </div>

        {/* Amount details */}
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <FieldBlock label={t('deposit.detail.supplier')} value={`${item.supplierCode} — ${item.supplierName}`} colors={colors} />
          <FieldBlock label={t('deposit.detail.poDate')} value={item.poDate} colors={colors} />
          <FieldBlock label={t('deposit.detail.currency')} value={item.curCurrency} colors={colors} />
          <FieldBlock
            label={t('deposit.detail.exchangeRate')}
            value={fmtNum(item.curUsdRmb, 4)}
            suffix={item.rateSourceCode === 'A' || item.rateSourceCode === 'auto'
              ? t('deposit.detail.rateAuto')
              : t('deposit.detail.rateManual')}
            colors={colors}
            mono
          />
          <FieldBlock label={t('deposit.detail.depositPercent')} value={`${item.depositPar}%`} colors={colors} mono />
          <FieldBlock label={t('deposit.detail.totalAmount')} value={`¥${fmtNum(item.totalAmountRmb, 5)}`} colors={colors} mono />
          <FieldBlock label={t('deposit.detail.actualPaid')} value={`¥${fmtNum(item.actualPaid, 5)}`} colors={colors} mono />
          <FieldBlock label={t('deposit.detail.prepayDeducted')} value={`¥${fmtNum(item.prepayDeducted, 5)}`} colors={colors} mono />
          <FieldBlock label={t('deposit.detail.depositPending')} value={`¥${fmtNum(item.depositPending, 5)}`} colors={colors} mono />
          <FieldBlock label={t('deposit.detail.balanceRemaining')} value={`¥${fmtNum(item.balanceRemaining, 5)}`} colors={colors} mono />
          <FieldBlock
            label={t('deposit.detail.extraFees')}
            value={item.extraFeesRmb > 0 ? `¥${fmtNum(item.extraFeesRmb, 5)}` : '—'}
            colors={colors}
            mono
          />
          <FieldBlock label={t('deposit.detail.paymentDate')} value={item.latestPaymentDate || '—'} colors={colors} />
        </div>
      </div>

      {/* ── Deposit Payment Details Section ── */}
      <div
        className="rounded-xl mb-5"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: '#30d158' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
              {t('deposit.detail.paymentDetailsTitle')}
            </h3>
            {item.paymentDetails && item.paymentDetails.length > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${colors.green}15`, color: colors.green }}
              >
                {item.paymentDetails.length}
              </span>
            )}
          </div>
        </div>
        {(!item.paymentDetails || item.paymentDetails.length === 0) ? (
          <div className="px-5 py-4">
            <p className="text-xs" style={{ color: colors.textTertiary }}>
              {t('deposit.detail.noPayment')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: `${colors.bg}50` }}>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.pmtNo')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depDate')}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depPaid')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depPaidCur')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depPrepayAmount')}</th>
                  <th className="text-center py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.depOverride')}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('deposit.detail.extraAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {item.paymentDetails.map((det, idx) => {
                  const curSym = (c: string) => (c === 'RMB' || c === 'CNY') ? '¥' : '$';
                  return (
                    <tr
                      key={det.pmtNo + '-' + idx}
                      style={{ borderColor: colors.border }}
                      className={idx !== item.paymentDetails.length - 1 ? 'border-b' : ''}
                    >
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span style={{ color: '#30d158' }} className="font-mono text-xs font-semibold">{det.pmtNo}</span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono whitespace-nowrap">{det.depDate}</td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: det.depCur === 'USD' ? 'rgba(100,210,255,0.14)' : 'rgba(255,214,10,0.14)',
                            color: det.depCur === 'USD' ? '#64d2ff' : '#ffd60a',
                          }}
                        >
                          {curSym(det.depCur)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span style={{ color: colors.text }} className="font-mono text-xs tabular-nums">
                          {curSym(det.depCur)}{fmtNum(det.depPaid)}
                        </span>
                      </td>
                      <td style={{ color: colors.textSecondary }} className="py-2 px-4 text-xs font-mono text-right whitespace-nowrap tabular-nums">
                        {curSym(det.depCur)}{fmtNum(det.depPaidCur, 4)}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span
                          style={{ color: det.depPrepayAmount > 0 ? colors.purple : colors.textTertiary }}
                          className="font-mono text-xs tabular-nums"
                        >
                          {det.depPrepayAmount > 0 ? `$${fmtNum(det.depPrepayAmount)}` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center whitespace-nowrap">
                        {det.depOverride === 1 ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff453a' }}>{t('deposit.detail.depOverride')}</span>
                        ) : (
                          <span style={{ color: colors.textTertiary }} className="text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        {det.extraAmount > 0 ? (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.orange }}>
                            {curSym(det.extraCur)}{fmtNum(det.extraAmount)}
                          </span>
                        ) : (
                          <span style={{ color: colors.textTertiary }} className="text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      {(() => {
        const tabs = [
          { id: 'history' as const, label: t('deposit.detail.tab_history') },
          { id: 'orders' as const, label: t('deposit.detail.tab_orders') },
          { id: 'files' as const, label: t('deposit.detail.tab_files'), count: fileCount },
        ];
        return (
          <div className="flex gap-1 mb-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                  borderBottom: activeTab === tab.id ? `2px solid ${colors.blue}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span
                    className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: activeTab === tab.id ? `${colors.blue}20` : colors.bgTertiary,
                      color: activeTab === tab.id ? colors.blue : colors.textTertiary,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* History Tab */}
      {activeTab === 'history' && (
        <HistoryPanel pmtNo={pmtNo} poNum={poNum} t={t} theme={theme} />
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <OrdersPanel pmtNo={pmtNo} t={t} theme={theme} />
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <FilesContent
          files={files}
          isLoading={filesLoading}
          uploadPending={uploadPending}
          colors={colors}
          t={t}
          onUpload={() => fileInputRef.current?.click()}
          onDownload={handleDownload}
          onDelete={handleDeleteFile}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Security dialogs */}
      <SecurityCodeDialog
        isOpen={uploadSecurity.isOpen}
        level={uploadSecurity.level}
        title={t('deposit.files.uploadTitle')}
        description={t('deposit.files.uploadDesc')}
        onConfirm={uploadSecurity.onConfirm}
        onCancel={uploadSecurity.onCancel}
        isLoading={uploadPending}
        error={uploadSecurity.error}
      />
      <SecurityCodeDialog
        isOpen={deleteFileSecurity.isOpen}
        level={deleteFileSecurity.level}
        title={t('deposit.files.deleteTitle')}
        description={t('deposit.files.deleteDesc')}
        onConfirm={deleteFileSecurity.onConfirm}
        onCancel={deleteFileSecurity.onCancel}
        isLoading={deleteMutation.isPending}
        error={deleteFileSecurity.error}
      />
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function FieldBlock({ label, value, suffix, colors, mono }: {
  label: string; value: string; suffix?: string;
  colors: Record<string, string>; mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>{label}</p>
      <p className={`text-sm ${mono ? 'font-mono tabular-nums' : ''}`} style={{ color: colors.text }}>
        {value}
        {suffix && (
          <span
            className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: suffix.includes('Auto') || suffix.includes('auto')
                ? 'rgba(10,132,255,0.14)' : 'rgba(142,142,147,0.14)',
              color: suffix.includes('Auto') || suffix.includes('auto')
                ? '#0a84ff' : '#8e8e93',
            }}
          >
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function FilesContent({ files, isLoading, uploadPending, colors, t, onUpload, onDownload, onDelete }: {
  files: FileItem[];
  isLoading: boolean;
  uploadPending: boolean;
  colors: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
  onUpload: () => void;
  onDownload: (filename: string) => void;
  onDelete: (filename: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: colors.border, borderTopColor: colors.blue }}
        />
      </div>
    );
  }

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Upload button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: colors.textTertiary }}>
          {t('deposit.files.count', { count: files.length })}
        </p>
        <button
          onClick={onUpload}
          disabled={uploadPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: `${colors.blue}15`, color: colors.blue }}
        >
          {uploadPending ? (
            <div
              className="w-3 h-3 border-2 rounded-full animate-spin"
              style={{ borderColor: 'transparent', borderTopColor: colors.blue }}
            />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {t('deposit.files.upload')}
        </button>
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: colors.textTertiary }}>
          {t('deposit.files.noFiles')}
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textTertiary }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: colors.text }}>{file.name}</p>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {fmtSize(file.size)}
                    {file.modified > 0 && (
                      <span className="ml-2">{new Date(file.modified).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  onClick={() => onDownload(file.name)}
                  className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ backgroundColor: colors.bgTertiary }}
                  title={t('deposit.files.download')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.blue }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(file.name)}
                  className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ backgroundColor: colors.bgTertiary }}
                  title={t('deposit.files.delete')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.red }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
