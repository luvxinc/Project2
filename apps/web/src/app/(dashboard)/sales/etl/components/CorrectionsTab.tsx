'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { salesApi } from '@/lib/api/sales';
import type { SkuCorrectionRule } from '@/lib/api/sales';

interface CorrectionsTabProps {
  colors: any;
}

export default function CorrectionsTab({ colors }: CorrectionsTabProps) {
  const t = useTranslations('sales');
  const [rules, setRules] = useState<SkuCorrectionRule[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSku, setEditSku] = useState('');

  useEffect(() => { loadRules(); }, []);

  const loadRules = () => {
    salesApi.getSkuCorrections().then(setRules).catch(() => {});
  };

  const handleSave = async (id: number) => {
    await salesApi.updateSkuCorrection({ id, correctSku: editSku });
    setEditingId(null);
    setEditSku('');
    loadRules();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('etl.corrections.deleteConfirm'))) return;
    await salesApi.deleteSkuCorrection(id);
    loadRules();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-CA'); } catch { return iso; }
  };

  return (
    <section className="rounded-xl overflow-hidden" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
      <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: colors.border }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{t('etl.corrections.title')}</h3>
          <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{t('etl.corrections.desc')}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
          {t('etl.corrections.totalRules', { count: rules.length })}
        </span>
      </div>

      {rules.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm" style={{ color: colors.textTertiary }}>{t('etl.corrections.noRules')}</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.corrections.label')}</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.corrections.badSku')}</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.corrections.correctSku')}</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: colors.textSecondary }}>{t('etl.corrections.date')}</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: colors.textSecondary }} />
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                  <td className="px-3 py-2 font-mono" style={{ color: colors.text }}>{rule.customLabel}</td>
                  <td className="px-3 py-2 font-mono text-orange-400">{rule.badSku}</td>
                  <td className="px-3 py-2">
                    {editingId === rule.id ? (
                      <input
                        value={editSku}
                        onChange={e => setEditSku(e.target.value)}
                        className="w-full px-2 py-1 rounded text-xs"
                        style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.controlAccent}` }}
                        autoFocus
                      />
                    ) : (
                      <span className="font-mono text-green-500">{rule.correctSku}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: colors.textTertiary }}>
                    {formatDate(rule.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingId === rule.id ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleSave(rule.id)} className="px-2 py-1 rounded text-[10px] font-medium text-white" style={{ backgroundColor: '#34C759' }}>
                          {t('etl.corrections.save')}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditSku(''); }} className="px-2 py-1 rounded text-[10px] font-medium" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
                          {t('etl.corrections.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditingId(rule.id); setEditSku(rule.correctSku); }} className="px-2 py-1 rounded text-[10px] font-medium" style={{ color: colors.controlAccent }}>
                          {t('etl.corrections.edit')}
                        </button>
                        <button onClick={() => handleDelete(rule.id)} className="px-2 py-1 rounded text-[10px] font-medium" style={{ color: '#FF3B30' }}>
                          {t('etl.corrections.delete')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
