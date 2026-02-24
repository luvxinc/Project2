'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { LineItem, SpecOption, PickedProduct } from './types';
import { useTranslations } from 'next-intl';

interface ProductLineProps {
  line: LineItem;
  index: number;
  specOptions: SpecOption[];
  colors: Record<string, string>;
  onSpecChange: (spec: string) => void;
  onQtyChange: (qty: number) => void;
  onPick: () => void;
  onSwap: (pickedIndex: number, newProduct: PickedProduct) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function ProductLine({ line, index, specOptions, colors, onSpecChange, onQtyChange, onPick, onSwap, onRemove, canRemove }: ProductLineProps) {
  const t = useTranslations('vma');
  const [swapOpenIdx, setSwapOpenIdx] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const swapBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Build qty-aware alternatives for the swap dropdown
  type AltItem = PickedProduct & { totalQty: number; remaining: number };
  const getAlternatives = (pickedIndex: number): AltItem[] => {
    const currentSerial = line.picked[pickedIndex]?.serialNo;

    const totalMap = new Map<string, number>();
    line.available.forEach(a => totalMap.set(a.serialNo, (totalMap.get(a.serialNo) ?? 0) + 1));

    const usedMap = new Map<string, number>();
    line.picked.forEach((p, idx) => {
      if (idx !== pickedIndex) usedMap.set(p.serialNo, (usedMap.get(p.serialNo) ?? 0) + 1);
    });

    const seen = new Set<string>();
    return line.available
      .filter(a => {
        if (seen.has(a.serialNo)) return false;
        seen.add(a.serialNo);
        const total = totalMap.get(a.serialNo) ?? 0;
        const used = usedMap.get(a.serialNo) ?? 0;
        const remaining = total - used;
        return a.serialNo === currentSerial || remaining > 0;
      })
      .map(a => {
        const total = totalMap.get(a.serialNo) ?? 0;
        const used = usedMap.get(a.serialNo) ?? 0;
        return { ...a, totalQty: total, remaining: total - used };
      });
  };

  const handleSwapSelect = (pickedIndex: number, serialNo: string) => {
    const newProduct = line.available.find(a => a.serialNo === serialNo);
    if (newProduct && newProduct.serialNo !== line.picked[pickedIndex]?.serialNo) {
      onSwap(pickedIndex, newProduct);
    }
    setSwapOpenIdx(null);
    setDropdownPos(null);
  };

  const handleSwapToggle = (pi: number) => {
    if (swapOpenIdx === pi) {
      setSwapOpenIdx(null);
      setDropdownPos(null);
    } else {
      const btn = swapBtnRefs.current.get(pi);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.right - 260 });
      }
      setSwapOpenIdx(pi);
    }
  };

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
          style={{ backgroundColor: colors.controlAccent, color: colors.white }}>
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
              {line.available.length > 1 && (
                <th className="text-center py-0.5 px-1" style={{ width: 28 }}></th>
              )}
            </tr>
          </thead>
          <tbody>
            {line.picked.map((p, pi) => {
              const hasAlternatives = line.available.length > 1;
              const isSwapOpen = swapOpenIdx === pi;
              const alternatives = isSwapOpen ? getAlternatives(pi) : [];

              return (
                <tr key={pi} style={{ color: colors.text }} className="group">
                  <td className="py-0.5 px-1 font-mono">{p.serialNo}</td>
                  <td className="py-0.5 px-1">{p.expDate}</td>
                  <td className="py-0.5 px-1 text-center">{p.qty}</td>
                  {hasAlternatives && (
                    <td className="py-0.5 px-1 text-center">
                      <button
                        ref={el => { if (el) swapBtnRefs.current.set(pi, el); }}
                        onClick={(e) => { e.stopPropagation(); handleSwapToggle(pi); }}
                        className="text-xs hover:opacity-70 transition"
                        style={{ color: colors.controlAccent }}
                        title={t('p_valve.clinicalCase.productLine.swap')}
                      >
                        ⇄
                      </button>
                      {isSwapOpen && dropdownPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[9998]" onClick={() => { setSwapOpenIdx(null); setDropdownPos(null); }} />
                          <div
                            className="fixed z-[9999] rounded-xl shadow-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bgSecondary,
                              border: `1px solid ${colors.border}`,
                              width: 260,
                              top: dropdownPos.top,
                              left: Math.max(8, dropdownPos.left),
                            }}
                          >
                            <div className="px-3 py-2 text-xs font-semibold" style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>
                              {t('p_valve.clinicalCase.productLine.swapTitle')}
                            </div>
                            <div className="max-h-[200px] overflow-y-auto">
                              {alternatives.map(alt => {
                                const isCurrent = alt.serialNo === p.serialNo;
                                const disabled = !isCurrent && alt.remaining <= 0;
                                return (
                                  <button
                                    key={alt.serialNo}
                                    onClick={() => !disabled && handleSwapSelect(pi, alt.serialNo)}
                                    disabled={disabled}
                                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:opacity-80 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                      backgroundColor: isCurrent ? (colors.controlAccent + '20') : 'transparent',
                                      color: colors.text,
                                      borderBottom: `1px solid ${colors.border}`,
                                    }}
                                  >
                                    <span className="font-mono flex-1">{alt.serialNo}</span>
                                    {alt.totalQty > 1 && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                        style={{ backgroundColor: colors.controlAccent + '18', color: colors.controlAccent }}>
                                        ×{alt.totalQty}
                                      </span>
                                    )}
                                    <span style={{ color: colors.textSecondary }}>{alt.expDate}</span>
                                    {isCurrent && (
                                      <span style={{ color: colors.controlAccent, fontSize: 10 }}>✓</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>,
                        document.body,
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
