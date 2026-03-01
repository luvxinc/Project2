'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

// ═══════════════════════════════════════════════════
// Promote Modal
// ═══════════════════════════════════════════════════

interface AdsRules {
  aggressive_offset?: number;
  conservative_offset?: number;
  ad_rate_max?: number;
  ad_rate_min?: number;
}

interface PromoteModalProps {
  colors: Record<string, any>;
  selectedCount: number;
  adsRules?: AdsRules;
  onConfirm: (strategy: 'conservative' | 'balanced' | 'aggressive', cap: number) => void;
  onClose: () => void;
}

export function PromoteModal({ colors, selectedCount, adsRules, onConfirm, onClose }: PromoteModalProps) {
  const t = useTranslations('sales.listings');
  const [strategy, setStrategy] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const defaultCap = adsRules?.ad_rate_max ?? 20;
  const [cap, setCap] = useState(String(defaultCap));

  const strategies = [
    { key: 'conservative' as const, label: t('promoteConservative'), desc: t('promoteConservativeDesc') },
    { key: 'balanced' as const, label: t('promoteBalanced'), desc: t('promoteBalancedDesc') },
    { key: 'aggressive' as const, label: t('promoteAggressive'), desc: t('promoteAggressiveDesc') },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-2xl p-6 w-[420px] shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, border: `1px solid ${colors.border}` }}
      >
        <h3 style={{ color: colors.text }} className="text-[18px] font-semibold mb-1">
          {t('promoteTitle')}
        </h3>
        <p style={{ color: colors.textSecondary }} className="text-[13px] mb-5">
          {t('promoteSelected', { count: selectedCount })}
        </p>

        {/* Strategy Selection */}
        <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium block mb-2">
          {t('promoteStrategy')}
        </label>
        <div className="flex gap-2 mb-5">
          {strategies.map(s => (
            <button
              key={s.key}
              onClick={() => setStrategy(s.key)}
              className="flex-1 rounded-lg border p-3 text-center transition-all"
              style={{
                backgroundColor: strategy === s.key ? `${colors.controlAccent}15` : colors.bgTertiary,
                borderColor: strategy === s.key ? colors.controlAccent : colors.border,
              }}
            >
              <div style={{ color: strategy === s.key ? colors.controlAccent : colors.text }} className="text-[13px] font-medium">
                {s.label}
              </div>
              <div style={{ color: colors.textTertiary }} className="text-[11px] mt-0.5">
                {s.desc}
              </div>
            </button>
          ))}
        </div>

        {/* CAP Input */}
        <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium block mb-2">
          {t('promoteCap')}
        </label>
        <input
          type="number"
          value={cap}
          onChange={e => setCap(e.target.value)}
          min="2"
          max="100"
          step="0.5"
          className="w-full rounded-lg border px-3 py-2 text-[14px] mb-5 outline-none"
          style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ color: colors.textSecondary }}
          >
            {t('promoteCancel')}
          </button>
          <button
            onClick={() => onConfirm(strategy, parseFloat(cap) || 20)}
            className="px-5 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: colors.controlAccent }}
          >
            {t('promoteApply', { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Reprice Modal
// ═══════════════════════════════════════════════════

interface RepriceModalProps {
  colors: Record<string, any>;
  selectedCount: number;
  onConfirm: (price: number) => void;
  onClose: () => void;
}

export function RepriceModal({ colors, selectedCount, onConfirm, onClose }: RepriceModalProps) {
  const t = useTranslations('sales.listings');
  const [price, setPrice] = useState('');
  const parsedPrice = parseFloat(price);
  const isValid = !isNaN(parsedPrice) && parsedPrice > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-2xl p-6 w-[380px] shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, border: `1px solid ${colors.border}` }}
      >
        <h3 style={{ color: colors.text }} className="text-[18px] font-semibold mb-1">
          {t('repriceTitle')}
        </h3>
        <p style={{ color: colors.textSecondary }} className="text-[13px] mb-5">
          {t('repriceDesc', { count: selectedCount })}
        </p>

        <label style={{ color: colors.textTertiary }} className="text-[11px] uppercase tracking-wider font-medium block mb-2">
          {t('repriceLabel')}
        </label>
        <div className="relative mb-5">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px]"
            style={{ color: colors.textTertiary }}
          >$</span>
          <input
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="w-full rounded-lg border pl-7 pr-3 py-2 text-[14px] outline-none"
            style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ color: colors.textSecondary }}
          >
            {t('repriceCancel')}
          </button>
          <button
            onClick={() => isValid && onConfirm(parsedPrice)}
            disabled={!isValid}
            className="px-5 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: colors.controlAccent }}
          >
            {t('repriceSetPrice', { price: isValid ? parsedPrice.toFixed(2) : '—' })}
          </button>
        </div>
      </div>
    </div>
  );
}
