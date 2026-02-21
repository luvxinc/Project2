'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { AbnormalDetail, AbnormalDetailItem, PoMethodStrategy } from '@/lib/api';

// ─── Strategy definitions ──────────────────────────────────────

type ThemeColorKey = 'green' | 'blue' | 'yellow' | 'purple';

const STRATEGIES: { id: number; key: string; colorKey: ThemeColorKey; forPositive: boolean; forNegative: boolean }[] = [
  { id: 1, key: 'M1', colorKey: 'green',  forPositive: true, forNegative: true },
  { id: 2, key: 'M2', colorKey: 'blue',   forPositive: true, forNegative: true },
  { id: 3, key: 'M3', colorKey: 'yellow', forPositive: true, forNegative: false },
  { id: 4, key: 'M4', colorKey: 'purple', forPositive: true, forNegative: true },
];

// ─── Props ─────────────────────────────────────────────────────

interface ProcessWizardProps {
  detail: AbnormalDetail;
  onConfirm: (poMethods: Record<string, PoMethodStrategy>, note: string, delayDate?: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

// ─── Main Component ────────────────────────────────────────────

export default function ProcessWizard({ detail, onConfirm, onCancel, isSubmitting }: ProcessWizardProps) {
  const t = useTranslations('purchase');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Group diffs by PO, split into positive (shortage) and negative (overage)
  const poGroups = useMemo(() => {
    const groups: Record<string, { positive: AbnormalDetailItem[]; negative: AbnormalDetailItem[] }> = {};
    for (const item of detail.items) {
      if (!groups[item.poNum]) groups[item.poNum] = { positive: [], negative: [] };
      if (item.diffQuantity > 0) groups[item.poNum].positive.push(item);
      else if (item.diffQuantity < 0) groups[item.poNum].negative.push(item);
    }
    return groups;
  }, [detail.items]);

  const poNums = Object.keys(poGroups).sort();

  // Selected strategy per PO: { poNum: { positive: number|null, negative: number|null } }
  const [selections, setSelections] = useState<Record<string, PoMethodStrategy>>(() => {
    const init: Record<string, PoMethodStrategy> = {};
    for (const po of poNums) {
      init[po] = { positive: null, negative: null };
    }
    return init;
  });

  const [note, setNote] = useState('');
  const [delayDate, setDelayDate] = useState('');

  // Check if M3 is selected anywhere
  const hasM3 = Object.values(selections).some(s => s.positive === 3);

  // Check if all required strategies are selected
  const isComplete = poNums.every(po => {
    const group = poGroups[po];
    const sel = selections[po];
    const posOk = group.positive.length === 0 || sel.positive != null;
    const negOk = group.negative.length === 0 || sel.negative != null;
    return posOk && negOk;
  });

  const canSubmit = isComplete && (!hasM3 || delayDate.length > 0);

  const selectStrategy = (poNum: string, type: 'positive' | 'negative', strategyId: number) => {
    setSelections(prev => ({
      ...prev,
      [poNum]: { ...prev[poNum], [type]: strategyId },
    }));
  };

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(selections, note, hasM3 ? delayDate : undefined);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: colors.text }}>
            {t('abnormal.process.title')}
          </h3>
          <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
            {t('abnormal.process.description')}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
          style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
        >
          {t('abnormal.process.cancel')}
        </button>
      </div>

      {/* Per-PO Strategy Cards — mind-map layout */}
      {poNums.map(poNum => {
        const group = poGroups[poNum];
        const sel = selections[poNum];

        return (
          <div
            key={poNum}
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            {/* PO Header */}
            <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <span className="text-sm font-mono font-bold" style={{ color: colors.text }}>{poNum}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: colors.bgTertiary, color: colors.textTertiary }}>
                {group.positive.length + group.negative.length} SKU(s)
              </span>
            </div>

            <div className="p-5 space-y-5">
              {/* Shortage branch (positive diff) */}
              {group.positive.length > 0 && (
                <StrategyBranch
                  type="positive"
                  items={group.positive}
                  selectedStrategy={sel.positive}
                  onSelect={(id) => selectStrategy(poNum, 'positive', id)}
                  colors={colors}
                  t={t}
                />
              )}

              {/* Overage branch (negative diff) */}
              {group.negative.length > 0 && (
                <StrategyBranch
                  type="negative"
                  items={group.negative}
                  selectedStrategy={sel.negative}
                  onSelect={(id) => selectStrategy(poNum, 'negative', id)}
                  colors={colors}
                  t={t}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* M3 delay date picker */}
      {hasM3 && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: `${colors.yellow}10`, border: `1px solid ${colors.yellow}40` }}
        >
          <label className="block text-sm font-medium mb-2" style={{ color: colors.yellow }}>
            {t('abnormal.process.delayDateLabel')}
          </label>
          <input
            type="date"
            value={delayDate}
            onChange={(e) => setDelayDate(e.target.value)}
            className="h-9 px-3 border rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
          />
        </div>
      )}

      {/* Note */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textTertiary }}>
          {t('abnormal.process.noteLabel')}
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('abnormal.process.notePlaceholder')}
          className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Confirm */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
        >
          {t('abnormal.process.cancel')}
        </button>
        <button
          onClick={handleConfirm}
          disabled={!canSubmit || isSubmitting}
          className="px-6 py-2 text-sm font-semibold rounded-lg transition-all hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: colors.blue, color: '#fff' }}
        >
          {isSubmitting ? '...' : t('abnormal.process.confirm')}
        </button>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
// Strategy Branch — mind-map style diverging choices
// ═════════════════════════════════════════════════════════════════

function StrategyBranch({ type, items, selectedStrategy, onSelect, colors, t }: {
  type: 'positive' | 'negative';
  items: AbnormalDetailItem[];
  selectedStrategy: number | null | undefined;
  onSelect: (id: number) => void;
  colors: typeof themeColors[keyof typeof themeColors];
  t: ReturnType<typeof useTranslations<'purchase'>>;
}) {
  const isShortage = type === 'positive';
  const branchColor = isShortage ? colors.red : colors.green;
  const available = STRATEGIES.filter(s => isShortage ? s.forPositive : s.forNegative);

  return (
    <div>
      {/* Branch label */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: branchColor }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: branchColor }}>
          {isShortage ? t('abnormal.process.shortage') : t('abnormal.process.overage')}
        </span>
        <span className="text-xs" style={{ color: colors.textTertiary }}>
          — {items.map(i => `${i.sku}(${isShortage ? '+' : ''}${i.diffQuantity})`).join(', ')}
        </span>
      </div>

      {/* Strategy options — mind-map cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {available.map(strategy => {
          const isSelected = selectedStrategy === strategy.id;
          const sColor = colors[strategy.colorKey];
          return (
            <button
              key={strategy.id}
              onClick={() => onSelect(strategy.id)}
              className="relative rounded-xl p-4 text-left transition-all"
              style={{
                backgroundColor: isSelected ? `${sColor}18` : colors.bgTertiary,
                border: isSelected
                  ? `2px solid ${sColor}`
                  : `1px solid ${colors.border}`,
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {/* Selected checkmark */}
              {isSelected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: sColor }}
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}


              <p className="text-sm font-bold mb-1" style={{ color: sColor }}>
                {strategy.key}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                {t(`abnormal.process.strategy${strategy.key}` as 'abnormal.process.strategyM1')}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
