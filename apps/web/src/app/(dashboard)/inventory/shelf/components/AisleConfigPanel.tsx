'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { AisleConfig, BayConfig } from '@/lib/api/inventory';
import { LEVEL_COLORS, AVAILABLE_LEVELS } from '../constants';

interface AisleConfigPanelProps {
  aisles: AisleConfig[];
  onChange: (aisles: AisleConfig[]) => void;
}

function defaultBayConfig(): BayConfig {
  return { bayCount: 4, levels: ['G', 'M', 'T'], binCount: 1, slotCount: 1 };
}

export function AisleConfigPanel({ aisles, onChange }: AisleConfigPanelProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const addAisle = () => {
    // Generate next aisle letter
    const nextChar = String.fromCharCode(65 + aisles.length); // A, B, C...
    onChange([...aisles, { aisle: nextChar, bayConfig: defaultBayConfig() }]);
  };

  const removeAisle = (index: number) => {
    onChange(aisles.filter((_, i) => i !== index));
  };

  const updateAisle = (index: number, field: string, value: string) => {
    const updated = [...aisles];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const updateBayConfig = (index: number, field: keyof BayConfig, value: number | string[]) => {
    const updated = [...aisles];
    updated[index] = {
      ...updated[index],
      bayConfig: { ...updated[index].bayConfig, [field]: value },
    };
    onChange(updated);
  };

  const toggleLevel = (aisleIndex: number, level: string) => {
    const current = aisles[aisleIndex].bayConfig.levels;
    const newLevels = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level].sort((a, b) => {
          const order = ['G', 'M', 'T'];
          return order.indexOf(a) - order.indexOf(b);
        });
    if (newLevels.length > 0) {
      updateBayConfig(aisleIndex, 'levels', newLevels);
    }
  };

  // Calculate total locations for one aisle
  const aisleLocations = (cfg: BayConfig) => {
    const bins = Math.max(1, cfg.binCount);
    const slots = Math.max(1, cfg.slotCount);
    return cfg.bayCount * cfg.levels.length * bins * slots;
  };

  return (
    <div className="space-y-4">
      {aisles.map((aisle, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
          className="rounded-2xl border p-5"
        >
          {/* Aisle header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={aisle.aisle}
                onChange={(e) => updateAisle(idx, 'aisle', e.target.value.toUpperCase())}
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-16 text-center text-[15px] font-semibold rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                maxLength={3}
              />
              <span style={{ color: colors.textSecondary }} className="text-[13px]">
                {t('shelf.wizard.aisle')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ color: colors.textTertiary }} className="text-[12px]">
                {aisleLocations(aisle.bayConfig)} {t('shelf.card.locations')}
              </span>
              {aisles.length > 1 && (
                <button
                  onClick={() => removeAisle(idx)}
                  style={{ color: colors.red }}
                  className="text-[12px] hover:opacity-70 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Config grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Bay count */}
            <div>
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1.5">
                {t('shelf.wizard.bayCount')}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={aisle.bayConfig.bayCount}
                onChange={(e) => updateBayConfig(idx, 'bayCount', Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-full rounded-lg border px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Levels */}
            <div>
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1.5">
                {t('shelf.wizard.levels')}
              </label>
              <div className="flex gap-2">
                {AVAILABLE_LEVELS.map((level) => {
                  const active = aisle.bayConfig.levels.includes(level);
                  return (
                    <button
                      key={level}
                      onClick={() => toggleLevel(idx, level)}
                      style={{
                        backgroundColor: active ? LEVEL_COLORS[level] : colors.bgTertiary,
                        color: active ? '#ffffff' : colors.textSecondary,
                        borderColor: active ? LEVEL_COLORS[level] : colors.border,
                      }}
                      className="flex-1 rounded-lg border px-2 py-2 text-[13px] font-medium transition-all hover:opacity-80"
                    >
                      {level} - {t(`shelf.levels.${level}` as 'shelf.levels.G')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bin count */}
            <div>
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1.5">
                {t('shelf.wizard.binCount')}
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={aisle.bayConfig.binCount}
                onChange={(e) => updateBayConfig(idx, 'binCount', Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-full rounded-lg border px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Slot count */}
            <div>
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1.5">
                {t('shelf.wizard.slotCount')}
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={aisle.bayConfig.slotCount}
                onChange={(e) => updateBayConfig(idx, 'slotCount', Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-full rounded-lg border px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add aisle button */}
      <button
        onClick={addAisle}
        style={{
          borderColor: colors.border,
          color: colors.controlAccent,
        }}
        className="w-full rounded-2xl border border-dashed py-3 text-[14px] font-medium hover:opacity-70 transition-opacity"
      >
        + {t('shelf.wizard.aisle')}
      </button>
    </div>
  );
}
