'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type { StocktakeListItem, StocktakeDetail, StocktakeItemData } from '@/lib/api/inventory';

interface EditStocktakeDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  stocktakes: StocktakeListItem[];
}

type ActionType = 'update' | 'delete' | null;
type Phase = 'form' | 'submitting' | 'done' | 'error';

export function EditStocktakeDialog({ open, onClose, onComplete, stocktakes }: EditStocktakeDialogProps) {
  const t = useTranslations('inventory.stocktake.edit');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // ─── State ───
  const [phase, setPhase] = useState<Phase>('form');
  const [selectedDateId, setSelectedDateId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedSku, setSelectedSku] = useState('');
  const [newQty, setNewQty] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [error, setError] = useState('');

  // Detail data
  const [detail, setDetail] = useState<StocktakeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Result
  const [resultMsg, setResultMsg] = useState('');
  const [resultSuccess, setResultSuccess] = useState(false);

  // Security — for delete actions
  const security = useSecurityAction({
    actionKey: 'btn_delete_stocktake',
    level: 'L3',
    onExecute: async (code: string) => {
      if (!selectedDateId) return;
      try {
        setPhase('submitting');
        await inventoryApi.deleteStocktake(selectedDateId, code);
        setResultSuccess(true);
        setResultMsg(t('deleteSuccess'));
        setPhase('done');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Unknown error';
        setError(msg);
        setPhase('error');
      }
    },
  });

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPhase('form');
      setSelectedDateId(null);
      setActionType(null);
      setSelectedSku('');
      setNewQty('');
      setDeleteReason('');
      setError('');
      setDetail(null);
      setResultMsg('');
    }
  }, [open]);

  // Load detail when date selected
  useEffect(() => {
    if (!selectedDateId) { setDetail(null); return; }
    setLoadingDetail(true);
    inventoryApi.getStocktake(selectedDateId)
      .then(d => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedDateId]);

  // Reset sub-fields when action changes
  useEffect(() => {
    setSelectedSku('');
    setNewQty('');
    setDeleteReason('');
    setError('');
  }, [actionType]);

  // Current item data
  const currentItem: StocktakeItemData | undefined = useMemo(() => {
    if (!detail || !selectedSku) return undefined;
    return detail.items.find(i => i.sku === selectedSku);
  }, [detail, selectedSku]);

  const selectedStocktake = stocktakes.find(s => s.id === selectedDateId);

  // ─── Field Validation ───
  const qtyError = useMemo(() => {
    if (newQty === '') return '';
    const n = Number(newQty);
    if (isNaN(n)) return t('mustBeNumber');
    if (n < 0) return t('cannotBeNegative');
    if (!Number.isInteger(n)) return t('mustBeInteger');
    if (currentItem && n === currentItem.countedQty) return t('sameValue');
    return '';
  }, [newQty, currentItem, t]);

  // ─── Overall Validation ───
  const canSubmit = useMemo(() => {
    if (!selectedDateId || !actionType) return false;
    if (actionType === 'update') {
      return !!selectedSku && newQty !== '' && !qtyError;
    }
    if (actionType === 'delete') {
      return deleteReason.trim().length > 0;
    }
    return false;
  }, [selectedDateId, actionType, selectedSku, newQty, qtyError, deleteReason]);

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!canSubmit || !selectedDateId) return;
    setError('');

    if (actionType === 'update') {
      // Update single item
      try {
        setPhase('submitting');
        const updatedItems = detail!.items.map(item =>
          item.sku === selectedSku
            ? { sku: item.sku, countedQty: parseInt(newQty, 10) }
            : { sku: item.sku, countedQty: item.countedQty }
        );
        await inventoryApi.updateStocktake(selectedDateId, { items: updatedItems });
        setResultSuccess(true);
        setResultMsg(t('updateSuccess'));
        setPhase('done');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Unknown error';
        setError(msg);
        setPhase('error');
      }
    } else if (actionType === 'delete') {
      // Delete — needs security code
      security.trigger();
    }
  };

  if (!open) return null;

  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const variance = currentItem && newQty !== '' && !qtyError
    ? parseInt(newQty) - currentItem.countedQty
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
          style={{ backgroundColor: colors.bgElevated, border: `1px solid ${borderColor}` }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl"
            style={{ backgroundColor: colors.bgElevated, borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ff9f0a, #ff6f00)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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

          <div className="px-6 py-5 space-y-5">
            {/* ═══ Form Phase ═══ */}
            {phase === 'form' && (
              <>
                {/* 1. Date Selector */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>
                    {t('stocktakeDate')}
                  </label>
                  <select
                    value={selectedDateId || ''}
                    onChange={e => setSelectedDateId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 px-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
                    style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}`, color: colors.text }}>
                    <option value="">{t('dateHint')}</option>
                    {stocktakes.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.stocktakeDate} ({s.itemCount} items)
                      </option>
                    ))}
                  </select>
                  {stocktakes.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: '#ff9f0a' }}>{t('noAvailableDates')}</p>
                  )}
                </div>

                {/* 2. Action Type */}
                {selectedDateId && (
                  <div>
                    <label className="text-sm font-medium mb-2 block" style={{ color: colors.textSecondary }}>
                      {t('selectAction')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Update Card */}
                      <button
                        onClick={() => setActionType('update')}
                        className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
                        style={{
                          border: `2px solid ${actionType === 'update' ? '#ffc107' : borderColor}`,
                          background: actionType === 'update' ? 'rgba(255,193,7,0.06)' : cardBg,
                        }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                          style={{ background: 'rgba(255,193,7,0.12)' }}>
                          <svg className="w-4 h-4" fill="none" stroke="#ffc107" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: colors.text }}>{t('updateSingle')}</p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>{t('updateSingleDesc')}</p>
                      </button>

                      {/* Delete Card */}
                      <button
                        onClick={() => setActionType('delete')}
                        className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
                        style={{
                          border: `2px solid ${actionType === 'delete' ? '#dc3545' : borderColor}`,
                          background: actionType === 'delete' ? 'rgba(220,53,69,0.04)' : cardBg,
                        }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                          style={{ background: 'rgba(220,53,69,0.12)' }}>
                          <svg className="w-4 h-4" fill="none" stroke="#dc3545" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: colors.text }}>{t('deleteDate')}</p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>{t('deleteDateDesc')}</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Update Form */}
                {actionType === 'update' && detail && (
                  <div className="space-y-4 rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                    {loadingDetail ? (
                      <div className="text-center py-4">
                        <div className="w-6 h-6 mx-auto border-2 border-t-transparent rounded-full animate-spin"
                          style={{ borderColor: `${colors.controlAccent} transparent` }} />
                      </div>
                    ) : (
                      <>
                        {/* SKU Select */}
                        <div>
                          <label className="text-xs font-medium mb-1 block" style={{ color: colors.textSecondary }}>
                            {t('selectSku')}
                          </label>
                          <select
                            value={selectedSku}
                            onChange={e => { setSelectedSku(e.target.value); setNewQty(''); }}
                            className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: colors.bgElevated, border: `1px solid ${borderColor}`, color: colors.text }}>
                            <option value="">{t('selectSkuPlaceholder')}</option>
                            {detail.items.map(item => (
                              <option key={item.sku} value={item.sku}>{item.sku} (qty: {item.countedQty})</option>
                            ))}
                          </select>
                        </div>

                        {/* Current Value */}
                        {currentItem && (
                          <>
                            <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                              style={{ background: 'rgba(0,113,227,0.06)', border: '1px solid rgba(0,113,227,0.15)' }}>
                              <span className="text-xs" style={{ color: colors.textSecondary }}>{t('currentValue')}</span>
                              <span className="text-lg font-bold font-mono" style={{ color: '#0071e3' }}>
                                {currentItem.countedQty}
                              </span>
                            </div>

                            {/* New Quantity */}
                            <div>
                              <label className="text-xs font-medium mb-1 block" style={{ color: colors.textSecondary }}>
                                {t('newQuantity')}
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={newQty}
                                onChange={e => setNewQty(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                                style={{
                                  backgroundColor: colors.bgElevated,
                                  border: `1px solid ${qtyError ? '#dc3545' : borderColor}`,
                                  color: colors.text,
                                }}
                              />
                              {qtyError && (
                                <p className="text-xs mt-1" style={{ color: '#dc3545' }}>{qtyError}</p>
                              )}
                            </div>

                            {/* Variance Preview */}
                            {variance !== null && (
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                                style={{
                                  background: variance > 0 ? 'rgba(52,199,89,0.06)' : 'rgba(220,53,69,0.06)',
                                  border: `1px solid ${variance > 0 ? 'rgba(52,199,89,0.2)' : 'rgba(220,53,69,0.2)'}`,
                                }}>
                                <span className="text-xs" style={{ color: colors.textSecondary }}>{t('variance')}</span>
                                <span className="text-sm font-bold font-mono"
                                  style={{ color: variance > 0 ? '#34c759' : '#dc3545' }}>
                                  {variance > 0 ? '+' : ''}{variance}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 3. Delete Form */}
                {actionType === 'delete' && selectedDateId && (
                  <div className="space-y-4">
                    {/* Warning */}
                    <div className="px-4 py-3 rounded-xl flex items-start gap-3"
                      style={{ background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.2)' }}>
                      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="#dc3545" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#dc3545' }}>{t('highRiskWarning')}</p>
                        <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                          {t('deleteWarning', { date: selectedStocktake?.stocktakeDate || '' })}
                        </p>
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>
                        {t('auditReason')}
                      </label>
                      <textarea
                        value={deleteReason}
                        onChange={e => setDeleteReason(e.target.value)}
                        rows={3}
                        placeholder={t('reasonPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{
                          backgroundColor: cardBg,
                          border: `1px solid ${deleteReason.trim() ? borderColor : 'rgba(220,53,69,0.3)'}`,
                          color: colors.text,
                        }}
                      />
                      {deleteReason.trim() === '' && (
                        <p className="text-xs mt-1" style={{ color: '#dc3545' }}>* {t('auditReason')}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(220,53,69,0.08)', color: '#dc3545' }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                    style={{
                      background: canSubmit
                        ? (actionType === 'delete' ? '#dc3545' : '#34c759')
                        : colors.textTertiary,
                    }}>
                    {actionType === 'delete' ?
                      `🗑 ${t('confirmExecute')}` :
                      `✓ ${t('confirmExecute')}`
                    }
                  </button>
                </div>
              </>
            )}

            {/* ═══ Submitting ═══ */}
            {phase === 'submitting' && (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-4 border-4 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: `${colors.controlAccent} transparent ${colors.controlAccent} ${colors.controlAccent}` }} />
                <h4 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('executing')}</h4>
              </div>
            )}

            {/* ═══ Done ═══ */}
            {phase === 'done' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(52,199,89,0.1)' }}>
                  <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{resultMsg}</h4>

                {actionType === 'update' && currentItem && (
                  <div className="mt-4 rounded-xl p-4 text-left" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                    <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>{t('changeDetails')}</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span style={{ color: colors.textTertiary }}>{t('stocktakeDate')}</span>
                        <span className="font-mono" style={{ color: colors.text }}>{selectedStocktake?.stocktakeDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: colors.textTertiary }}>SKU</span>
                        <span className="font-mono" style={{ color: colors.text }}>{selectedSku}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: colors.textTertiary }}>{t('oldValue')}</span>
                        <span className="font-mono" style={{ color: colors.text }}>{currentItem.countedQty}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: colors.textTertiary }}>{t('newValue')}</span>
                        <span className="font-mono font-bold" style={{ color: '#34c759' }}>{newQty}</span>
                      </div>
                    </div>
                  </div>
                )}

                {actionType === 'delete' && (
                  <div className="mt-4 rounded-xl p-4 text-left" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                    <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>{t('deletedDate')}</p>
                    <p className="text-sm font-mono" style={{ color: '#dc3545' }}>{selectedStocktake?.stocktakeDate}</p>
                    <p className="text-xs mt-2" style={{ color: colors.textTertiary }}>{t('deleteReason')}: {deleteReason}</p>
                  </div>
                )}

                <button onClick={() => { onComplete(); onClose(); }}
                  className="mt-6 px-6 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
                  style={{ background: colors.controlAccent }}>
                  {t('startNewRound')}
                </button>
              </div>
            )}

            {/* ═══ Error ═══ */}
            {phase === 'error' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(220,53,69,0.1)' }}>
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#dc3545' }}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>{t('operationFailed')}</h4>
                <p className="text-sm mb-6" style={{ color: '#dc3545' }}>{error}</p>
                <button onClick={() => { setPhase('form'); setError(''); }}
                  className="px-6 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90"
                  style={{ border: `1px solid ${borderColor}`, color: colors.text }}>
                  ←
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SecurityCodeDialog
        isOpen={security.isOpen}
        level={security.level}
        title={t('confirmExecute')}
        description={t('desc')}
        onConfirm={security.onConfirm}
        onCancel={security.onCancel}
        error={security.error}
      />
    </>
  );
}
