'use client';

import type { LineItem, SpecOption } from './types';
import { useTranslations } from 'next-intl';

interface ProductLineProps {
  line: LineItem;
  index: number;
  specOptions: SpecOption[];
  colors: Record<string, string>;
  onSpecChange: (spec: string) => void;
  onQtyChange: (qty: number) => void;
  onPick: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function ProductLine({ line, index, specOptions, colors, onSpecChange, onQtyChange, onPick, onRemove, canRemove }: ProductLineProps) {
  const t = useTranslations('vma');
  return (
    <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.border}` }}>
      <div className="flex items-center gap-2 mb-1">
        <select value={line.specNo} onChange={e => onSpecChange(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg text-xs border outline-none"
          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}>
          <option value="">{t('p_valve.clinicalCase.productLine.specPlaceholder')}</option>
          {specOptions.map(s => <option key={s.specification} value={s.specification}>{s.specification} ({s.model})</option>)}
        </select>
        <input type="number" min={1} value={line.qty} onChange={e => onQtyChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 px-2 py-1.5 rounded-lg text-xs border outline-none text-center"
          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }} />
        <button onClick={onPick} disabled={!line.specNo || line.loading}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-40 transition"
          style={{ backgroundColor: colors.controlAccent, color: '#fff' }}>
          {line.loading ? '...' : t('p_valve.clinicalCase.productLine.pick')}
        </button>
        {canRemove && (
          <button onClick={onRemove} className="text-red-400 hover:text-red-500 text-xs px-1">✕</button>
        )}
      </div>
      {line.picked.length > 0 && (
        <table className="w-full text-xs mt-1.5">
          <thead>
            <tr style={{ color: colors.textSecondary }}>
              <th className="text-left py-0.5 px-1">{t('p_valve.clinicalCase.productLine.serialNo')}</th>
              <th className="text-left py-0.5 px-1">{t('p_valve.clinicalCase.productLine.expDate')}</th>
              <th className="text-center py-0.5 px-1">{t('p_valve.clinicalCase.productLine.qty')}</th>
            </tr>
          </thead>
          <tbody>
            {line.picked.map((p, pi) => (
              <tr key={pi} style={{ color: colors.text }}>
                <td className="py-0.5 px-1 font-mono">{p.serialNo}</td>
                <td className="py-0.5 px-1">{p.expDate}</td>
                <td className="py-0.5 px-1 text-center">{p.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
