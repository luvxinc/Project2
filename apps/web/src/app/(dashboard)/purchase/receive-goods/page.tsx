'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, type PendingShipment, type SubmitReceiveDto, type SubmitReceiveItemInput, type ShipmentItem } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';

interface ReceiveRow extends SubmitReceiveItemInput {
  logisticNum: string;
  sentQuantity: number;
  selected: boolean;
}

export default function ReceiveGoodsPage() {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);

  // Per-shipment state: Map<logisticNum, Map<sku, receiveQty>>
  const [receiveQtyMap, setReceiveQtyMap] = useState<Map<string, Map<string, number>>>(new Map());
  const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set());

  // Security
  const [submitTarget, setSubmitTarget] = useState<PendingShipment | null>(null);

  // Success feedback
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setIsClient(true);
  }, []);

  // ═══════════ Fetch pending shipments ═══════════

  const { data: rawShipments, isLoading, error, refetch } = useQuery({
    queryKey: ['pendingShipments', receiveDate],
    queryFn: () => purchaseApi.getPendingShipments(receiveDate),
    enabled: isClient && !!receiveDate,
  });

  const shipments: PendingShipment[] = Array.isArray(rawShipments) ? rawShipments : [];

  // ═══════════ Helpers ═══════════

  const getQty = (logisticNum: string, sku: string, sentQty: number) => {
    return receiveQtyMap.get(logisticNum)?.get(sku) ?? sentQty;
  };

  const setQty = (logisticNum: string, sku: string, value: number) => {
    setReceiveQtyMap(prev => {
      const next = new Map(prev);
      if (!next.has(logisticNum)) next.set(logisticNum, new Map());
      next.get(logisticNum)!.set(sku, Math.max(0, value));
      return next;
    });
  };

  // ═══════════ Submit one shipment ═══════════

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!submitTarget) throw new Error('No target');
      const items: SubmitReceiveItemInput[] = submitTarget.items.map((item: ShipmentItem) => ({
        sku: item.sku,
        unitPrice: item.unitPrice,
        receiveQuantity: getQty(submitTarget.logisticNum, item.sku, item.quantity),
        receiveDate,
      }));
      return purchaseApi.submitReceive({ logisticNum: submitTarget.logisticNum, items });
    },
    onSuccess: () => {
      submitSecurity.onCancel();
      setSubmitTarget(null);
      setSuccessMsg(t('receiveGoods.submitSuccess'));
      setTimeout(() => setSuccessMsg(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['pendingShipments'] });
      queryClient.invalidateQueries({ queryKey: ['receiveManagement'] });
    },
    onError: () => {
      submitSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const submitSecurity = useSecurityAction({
    actionKey: 'btn_receive_submit',
    level: 'L3',
    onExecute: () => submitMutation.mutate(),
  });

  const handleSubmitShipment = (shipment: PendingShipment) => {
    setSubmitTarget(shipment);
    submitSecurity.trigger();
  };

  if (!isClient) return null;

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Header */}
      <section className="max-w-[1200px] mx-auto px-6 pt-8 pb-4">
        <h1 style={{ color: colors.text }} className="text-2xl font-semibold tracking-tight mb-1">
          {t('receiveGoods.title')}
        </h1>
        <p style={{ color: colors.textSecondary }} className="text-sm">
          {t('receiveGoods.description')}
        </p>
      </section>

      {/* Date picker */}
      <section className="max-w-[1200px] mx-auto px-6 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium" style={{ color: colors.textSecondary }}>
              {t('receiveGoods.receiveDateLabel')}
            </label>
            <input
              type="date"
              value={receiveDate}
              onChange={e => setReceiveDate(e.target.value)}
              className="h-9 px-3 border rounded-lg text-sm focus:outline-none"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
            />
          </div>
          <button
            onClick={() => refetch()}
            className="h-9 px-4 text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {t('receiveGoods.refresh')}
          </button>
        </div>
      </section>

      {/* Success toast */}
      {successMsg && (
        <div
          className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in"
          style={{ backgroundColor: colors.green, color: '#fff' }}
        >
          {successMsg}
        </div>
      )}

      {/* Content */}
      <section className="max-w-[1200px] mx-auto px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.blue }} />
              <p style={{ color: colors.textSecondary }} className="text-sm">{t('receiveGoods.loading')}</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex justify-center py-16">
            <div className="text-center">
              <p className="text-sm mb-3" style={{ color: colors.red }}>{t('receiveGoods.loadFailed')}</p>
              <button onClick={() => refetch()} className="px-4 py-2 text-sm rounded-lg" style={{ backgroundColor: colors.bgTertiary, color: colors.text }}>
                {t('receiveGoods.retry')}
              </button>
            </div>
          </div>
        ) : shipments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: colors.bgSecondary }}
            >
              <svg className="w-8 h-8" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>{t('receiveGoods.noShipments')}</p>
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('receiveGoods.noShipmentsHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {shipments.map(shipment => {
              const isExpanded = expandedShipment === shipment.logisticNum;
              const hasDiff = shipment.items.some(item => getQty(shipment.logisticNum, item.sku, item.quantity) !== item.quantity);

              return (
                <div
                  key={shipment.logisticNum}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                >
                  {/* Shipment header */}
                  <div
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setExpandedShipment(isExpanded ? null : shipment.logisticNum)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: hasDiff ? 'rgba(255,169,64,0.12)' : 'rgba(48,209,88,0.12)' }}
                      >
                        <svg className="w-5 h-5" style={{ color: hasDiff ? '#f5a623' : '#30d158' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold font-mono" style={{ color: colors.text }}>{shipment.logisticNum}</p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                          {t('receiveGoods.sentDate')}: {shipment.sentDate}
                          {shipment.etaDate && ` · ETA: ${shipment.etaDate}`}
                          {shipment.pallets > 0 && ` · ${shipment.pallets} ${t('receiveGoods.pallets')}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {hasDiff && (
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(255,169,64,0.12)', color: colors.orange }}
                        >
                          {t('receiveGoods.hasDiff')}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleSubmitShipment(shipment); }}
                        className="px-4 py-1.5 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                        style={{ backgroundColor: colors.green, color: '#fff' }}
                      >
                        {t('receiveGoods.submitBtn')}
                      </button>
                      <svg
                        className="w-5 h-5 transition-transform"
                        style={{ color: colors.textTertiary, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${colors.border}` }}>
                      <table className="w-full">
                        <thead>
                          <tr style={{ backgroundColor: colors.bg }}>
                          {['poNum', 'sku', 'unitPrice', 'sent', 'received'].map((col: string) => (
                              <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                                {t(`receiveGoods.col_${col}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shipment.items.map((item: ShipmentItem, idx: number) => {
                            const qty = getQty(shipment.logisticNum, item.sku, item.quantity);
                            const isDiff = qty !== item.quantity;
                            return (
                              <tr
                                key={`${item.poNum}-${item.sku}`}
                                style={{ borderTop: `1px solid ${colors.border}` }}
                              >
                                <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{item.poNum}</td>
                                <td className="px-4 py-2.5 text-sm font-mono font-medium" style={{ color: colors.text }}>{item.sku}</td>
                                <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>
                                  ${item.unitPrice.toFixed(4)}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-right" style={{ color: colors.textSecondary }}>
                                  {item.quantity}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={qty}
                                      onChange={e => setQty(shipment.logisticNum, item.sku, parseInt(e.target.value, 10) || 0)}
                                      onClick={e => e.stopPropagation()}
                                      className="w-24 h-8 px-2 border rounded text-sm text-right focus:outline-none focus:ring-1 transition-colors"
                                      style={{
                                        backgroundColor: colors.bg,
                                        borderColor: isDiff ? '#ff453a' : colors.border,
                                        color: colors.text,
                                        boxShadow: isDiff ? '0 0 0 1px rgba(255,69,58,0.2)' : undefined,
                                      }}
                                    />
                                    {isDiff && (
                                      <span className="text-xs font-medium" style={{ color: colors.red }}>
                                        {qty - item.quantity > 0 ? `+${qty - item.quantity}` : qty - item.quantity}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={submitSecurity.isOpen}
        level={submitSecurity.level}
        title={t('receiveGoods.confirmTitle')}
        description={t('receiveGoods.securityDescription')}
        onConfirm={() => submitMutation.mutate()}
        onCancel={() => { submitSecurity.onCancel(); setSubmitTarget(null); }}
        isLoading={submitMutation.isPending}
        error={submitSecurity.error}
      />
    </div>
  );
}
