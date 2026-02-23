'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi, type SupplierBalance, type TransactionListResponse, type TransactionItem as TxnItem } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { animate } from 'animejs';
import SupplierBalanceList from './components/SupplierBalanceList';
import TransactionTable from './components/TransactionTable';
import PrepayWizard from './components/PrepayWizard';
import HistoryPanel from './components/HistoryPanel';

/**
 * Prepayment Management Page
 * V1 parity: backend/templates/finance/pages/prepay.html
 *
 * Layout: Dual-panel
 *   Left panel: Supplier balance list (clickable cards)
 *   Right panel: Transaction details for selected supplier
 */
export default function PrepaymentPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierBalance | null>(null);
  const [datePreset, setDatePreset] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);

  // History state
  const [historyTranNum, setHistoryTranNum] = useState<string | null>(null);

  // Delete / Restore state
  const [deleteTarget, setDeleteTarget] = useState<TxnItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TxnItem | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  // ═══════════ Data Fetching ═══════════

  const { data: balances, isLoading: loadingBalances } = useQuery({
    queryKey: ['prepaymentBalances'],
    queryFn: () => financeApi.getBalances(),
    enabled: isClient,
  });

  const { data: txnData, isLoading: loadingTxns, refetch: refetchTxns } = useQuery({
    queryKey: ['prepaymentTransactions', selectedSupplier?.supplierCode, datePreset, dateFrom, dateTo],
    queryFn: () => financeApi.getTransactions(selectedSupplier!.supplierCode, {
      preset: datePreset || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    enabled: isClient && !!selectedSupplier,
  });

  // ═══════════ Handlers ═══════════

  const handleSelectSupplier = useCallback((supplier: SupplierBalance) => {
    setSelectedSupplier(supplier);
    setDatePreset('');
    setDateFrom('');
    setDateTo('');
  }, []);

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    setDateFrom('');
    setDateTo('');
  };

  const handleDateRange = (from: string, to: string) => {
    setDatePreset('');
    setDateFrom(from);
    setDateTo(to);
  };

  const handleWizardSuccess = () => {
    setShowWizard(false);
    queryClient.invalidateQueries({ queryKey: ['prepaymentBalances'] });
    if (selectedSupplier) {
      queryClient.invalidateQueries({ queryKey: ['prepaymentTransactions'] });
    }
  };

  // ═══════════ Delete ═══════════

  const deleteMutation = useMutation({
    mutationFn: (secCode: string) =>
      financeApi.deletePrepayment(deleteTarget!.id, secCode || undefined),
    onSuccess: () => {
      deleteSecurity.onCancel();
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['prepaymentBalances'] });
      queryClient.invalidateQueries({ queryKey: ['prepaymentTransactions'] });
    },
    onError: () => {
      deleteSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const deleteSecurity = useSecurityAction({
    actionKey: 'btn_prepay_delete',
    level: 'L3',
    onExecute: (code) => deleteMutation.mutate(code),
  });

  const handleDelete = useCallback((txn: TxnItem) => {
    setDeleteTarget(txn);
    deleteSecurity.trigger();
  }, [deleteSecurity]);

  // ═══════════ Restore ═══════════

  const restoreMutation = useMutation({
    mutationFn: (secCode: string) =>
      financeApi.restorePrepayment(restoreTarget!.id, secCode || undefined),
    onSuccess: () => {
      restoreSecurity.onCancel();
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['prepaymentBalances'] });
      queryClient.invalidateQueries({ queryKey: ['prepaymentTransactions'] });
    },
    onError: () => {
      restoreSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const restoreSecurity = useSecurityAction({
    actionKey: 'btn_prepay_undelete',
    level: 'L2',
    onExecute: (code) => restoreMutation.mutate(code),
  });

  const handleRestore = useCallback((txn: TxnItem) => {
    setRestoreTarget(txn);
    restoreSecurity.trigger();
  }, [restoreSecurity]);

  if (!isClient) return null;

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Page title */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[1400px] mx-auto">
          <h1 style={{ color: colors.text }} className="text-2xl font-bold">
            {t('prepay.title')}
          </h1>
          <p style={{ color: colors.textTertiary }} className="text-sm mt-1">
            {t('prepay.subtitle')}
          </p>
        </div>
      </section>

      {/* Dual-panel layout */}
      <section className="max-w-[1400px] mx-auto px-6">
        <div className="flex gap-6">
          {/* LEFT PANEL: Supplier balance list */}
          <div className="w-[340px] shrink-0">
            <SupplierBalanceList
              balances={balances || []}
              isLoading={loadingBalances}
              selectedCode={selectedSupplier?.supplierCode || null}
              onSelect={handleSelectSupplier}
              onAddNew={() => setShowWizard(true)}
            />
          </div>

          {/* RIGHT PANEL: Transaction details */}
          <div className="flex-1 min-w-0">
            {selectedSupplier ? (
              <TransactionTable
                data={txnData || null}
                isLoading={loadingTxns}
                supplierCurrency={selectedSupplier.currency}
                datePreset={datePreset}
                onDatePreset={handleDatePreset}
                onDateRange={handleDateRange}
                onAddNew={() => setShowWizard(true)}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onViewHistory={(tranNum) => setHistoryTranNum(tranNum)}
              />
            ) : (
              <div
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                className="rounded-xl border p-12 text-center"
              >
                <svg className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
                <p style={{ color: colors.textSecondary }} className="text-lg font-medium">
                  {t('prepay.selectSupplier')}
                </p>
                <p style={{ color: colors.textTertiary }} className="text-sm mt-1">
                  {t('prepay.selectSupplierHint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Prepayment Wizard Modal */}
      {showWizard && (
        <PrepayWizard
          isOpen={showWizard}
          supplier={selectedSupplier}
          onClose={() => setShowWizard(false)}
          onSuccess={handleWizardSuccess}
        />
      )}

      {/* History Panel */}
      {historyTranNum && (
        <HistoryPanel
          tranNum={historyTranNum}
          onClose={() => setHistoryTranNum(null)}
        />
      )}

      {/* Delete Dialog */}
      <SecurityCodeDialog
        isOpen={deleteSecurity.isOpen}
        level={deleteSecurity.level}
        title={t('prepay.delete.title')}
        description={t('prepay.delete.description')}
        onConfirm={deleteSecurity.onConfirm}
        onCancel={() => { deleteSecurity.onCancel(); setDeleteTarget(null); }}
        isLoading={deleteMutation.isPending}
        error={deleteSecurity.error}
      />

      {/* Restore Dialog */}
      <SecurityCodeDialog
        isOpen={restoreSecurity.isOpen}
        level={restoreSecurity.level}
        title={t('prepay.restore.title')}
        description={t('prepay.restore.description')}
        onConfirm={restoreSecurity.onConfirm}
        onCancel={() => { restoreSecurity.onCancel(); setRestoreTarget(null); }}
        isLoading={restoreMutation.isPending}
        error={restoreSecurity.error}
      />
    </div>
  );
}
