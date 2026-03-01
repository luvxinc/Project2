'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { salesApi } from '@/lib/api/sales';
import type { DataRangeResponse, PendingSkuRow, ApiSkuFix } from '@/lib/api/sales';

interface ApiTabProps {
  colors: any;
  dataRange: DataRangeResponse | null;
  setDataRange: (r: DataRangeResponse) => void;
  formatDate: (iso: string | null) => string;
}

export default function ApiTab({ colors, dataRange, setDataRange, formatDate }: ApiTabProps) {
  const t = useTranslations('sales');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pendingApiSkus, setPendingApiSkus] = useState<PendingSkuRow[]>([]);
  const [validSkuList, setValidSkuList] = useState<string[]>([]);
  const [skuFixes, setSkuFixes] = useState<Record<number, string>>({});
  const [qtyFixes, setQtyFixes] = useState<Record<number, string>>({});
  const [isFixingSkus, setIsFixingSkus] = useState(false);

  useEffect(() => {
    salesApi.getPendingSkus().then(data => {
      setPendingApiSkus(data.pending);
      setValidSkuList(data.validSkus);
      const auto: Record<number, string> = {};
      data.pending.forEach(p => { if (p.autoFix) auto[p.id] = p.autoFix; });
      setSkuFixes(auto);
    }).catch(() => {});
  }, []);

  const handleApiSync = async () => {
    setIsSyncing(true); setSyncMessage(null);
    try {
      const result = await salesApi.triggerAutoSync();
      const total = result.sellers.reduce((s, r) => s + r.transactionsFetched + r.ordersFetched, 0);
      setSyncMessage(`${t('etl.apiSync.syncSuccess')} (${total})`);
      const fresh = await salesApi.getDataRange(); setDataRange(fresh);
      const skus = await salesApi.getPendingSkus();
      setPendingApiSkus(skus.pending); setValidSkuList(skus.validSkus);
      const auto: Record<number, string> = {};
      skus.pending.forEach(p => { if (p.autoFix) auto[p.id] = p.autoFix; });
      setSkuFixes(auto);
    } catch { setSyncMessage(t('etl.apiSync.syncError')); }
    finally { setIsSyncing(false); setTimeout(() => setSyncMessage(null), 5000); }
  };

  const handleFixApiSkus = async () => {
    const fixList: ApiSkuFix[] = pendingApiSkus
      .filter(p => p.issueType === 'bad_sku' ? skuFixes[p.id] : qtyFixes[p.id])
      .map(p => ({
        id: p.id,
        fullSku: p.fullSku,
        badSku: p.currentSku1,
        correctSku: p.issueType === 'bad_sku' ? skuFixes[p.id] : p.currentSku1,
        correctQty: p.issueType === 'bad_qty' ? qtyFixes[p.id] : undefined,
      }));
    if (fixList.length === 0) return;
    setIsFixingSkus(true);
    try {
      await salesApi.fixApiSkus(fixList);
      const fresh = await salesApi.getPendingSkus();
      setPendingApiSkus(fresh.pending); setValidSkuList(fresh.validSkus);
      const auto: Record<number, string> = {};
      fresh.pending.forEach(p => { if (p.autoFix) auto[p.id] = p.autoFix; });
      setSkuFixes(auto); setQtyFixes({});
      const range = await salesApi.getDataRange(); setDataRange(range);
    } catch { /* handled */ }
    finally { setIsFixingSkus(false); }
  };

  const hasAnyFix = pendingApiSkus.some(p =>
    p.issueType === 'bad_sku' ? !!skuFixes[p.id] : !!qtyFixes[p.id]
  );
  const apiInfo = dataRange?.api;

  return (
    <div>
      {/* Data Status Bar */}
      <section className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
        <div className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#34C759' }} />
            <span className="text-sm font-semibold" style={{ color: colors.text }}>{t('etl.apiSync.statusTitle')}</span>
          </div>
          <div className="flex-1 flex items-center gap-3 text-xs" style={{ color: colors.textSecondary }}>
            {apiInfo && (
              <>
                <span>
                  {t('etl.apiSync.dateRange')}:{' '}
                  <span className="font-mono font-medium" style={{ color: colors.text }}>{formatDate(apiInfo.minDate)}</span>
                  {' '}{t('etl.apiSync.to')}{' '}
                  <span className="font-mono font-medium" style={{ color: colors.text }}>{formatDate(apiInfo.maxDate)}</span>
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bgTertiary }}>
                  {apiInfo.totalRows.toLocaleString()} {t('etl.apiSync.totalRows')}
                </span>
              </>
            )}
          </div>
          <button onClick={handleApiSync} disabled={isSyncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-all" style={{ backgroundColor: colors.controlAccent }}>
            {isSyncing && <div className="w-3 h-3 rounded-full animate-spin" style={{ border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />}
            {isSyncing ? t('etl.apiSync.syncing') : t('etl.apiSync.syncBtn')}
          </button>
        </div>
        {syncMessage && (
          <div className="px-5 py-2 text-xs border-t" style={{
            borderColor: colors.border,
            color: syncMessage.includes(t('etl.apiSync.syncError')) ? '#FF3B30' : '#34C759',
            backgroundColor: syncMessage.includes(t('etl.apiSync.syncError')) ? '#FF3B3010' : '#34C75910',
          }}>{syncMessage}</div>
        )}
      </section>

      {/* Pending Fixes */}
      {pendingApiSkus.length > 0 ? (
        <section className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.bgSecondary, border: '1px solid #FF950050' }}>
          <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: colors.border }}>
            <span className="text-sm">⚠️</span>
            <span className="text-sm font-semibold flex-1" style={{ color: colors.text }}>{t('etl.pendingSku.title')}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">
              {pendingApiSkus.length} {t('etl.pendingSku.groups')} · {pendingApiSkus.reduce((s, p) => s + p.affectedCount, 0)} {t('etl.apiSync.totalRows')}
            </span>
          </div>
          <div className="px-5 pb-4 pt-3">
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>{t('etl.pendingSku.desc')}</p>
            <div className="overflow-auto max-h-[400px] rounded-lg mb-3" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: colors.bgTertiary }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.pendingSku.orderNum')}</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.pendingSku.fullSku')}</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.pendingSku.currentSku')}</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>
                      {t('etl.pendingSku.correctSku')} / {t('etl.pendingSku.quantity')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApiSkus.map(p => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{p.orderNumber}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: colors.text }}>{p.fullSku}</td>
                      <td className="px-3 py-2 font-mono">
                        <span style={{ color: p.issueType === 'bad_qty' ? '#34C759' : '#FF9500' }}>{p.currentSku1}</span>
                        {p.affectedCount > 1 && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${colors.controlAccent}20`, color: colors.controlAccent }}>
                            ×{p.affectedCount}
                          </span>
                        )}
                        {p.issueType === 'bad_qty' && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400">
                            qty=0
                          </span>
                        )}
                        {p.autoFix && p.issueType === 'bad_sku' && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-green-500/15 text-green-500">
                            ✦ {t('etl.pendingSku.autoFixed')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.issueType === 'bad_qty' ? (
                          /* Quantity input for bad_qty rows */
                          <input
                            type="number"
                            min="1"
                            placeholder={t('etl.pendingSku.quantity')}
                            value={qtyFixes[p.id] || ''}
                            onChange={e => setQtyFixes(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-20 px-2 py-1 rounded text-xs text-center"
                            style={{
                              backgroundColor: colors.bgTertiary,
                              color: colors.text,
                              border: `1px solid ${qtyFixes[p.id] ? '#34C759' : colors.border}`,
                            }}
                          />
                        ) : (
                          /* SKU dropdown for bad_sku rows */
                          <select
                            value={skuFixes[p.id] || ''}
                            onChange={e => setSkuFixes(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-full px-2 py-1 rounded text-xs"
                            style={{
                              backgroundColor: colors.bgTertiary,
                              color: skuFixes[p.id] ? colors.text : colors.textTertiary,
                              border: `1px solid ${skuFixes[p.id] ? '#34C759' : colors.border}`,
                            }}
                          >
                            <option value="">{t('etl.pendingSku.selectSku')}</option>
                            {p.suggestions.map(s => (<option key={s} value={s}>{s}</option>))}
                            <option disabled>────────────</option>
                            {validSkuList.filter(s => !p.suggestions.includes(s)).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleFixApiSkus}
                disabled={isFixingSkus || !hasAnyFix}
                className="px-5 py-2 rounded-lg text-white text-xs font-medium disabled:opacity-40"
                style={{ backgroundColor: '#FF9500' }}
              >
                {isFixingSkus ? t('etl.pendingSku.fixing') : t('etl.pendingSku.submitFixes')}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="text-xs text-center py-3 mb-2" style={{ color: '#34C759' }}>
          {t('etl.pendingSku.noIssues')}
        </div>
      )}
    </div>
  );
}
