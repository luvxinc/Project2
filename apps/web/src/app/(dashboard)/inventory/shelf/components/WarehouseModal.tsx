'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { inventoryApi } from '@/lib/api/inventory';
import type { AisleConfig, BayConfig, WarehouseNode } from '@/lib/api/inventory';

const WarehouseScene = dynamic(
  () => import('./three/WarehouseScene').then(m => ({ default: m.WarehouseScene })),
  { ssr: false }
);

const MAX_LOCATIONS_WARNING = 10000;

// V1 parity: fixed level order with dependency chain G→M→T
const LEVELS = ['G', 'M', 'T'] as const;
const LEVEL_COLORS: Record<string, string> = {
  G: '#4CAF50',
  M: '#2196F3',
  T: '#FF9800',
};

// V1 parity: Bin/Slot only allow 0 or 2
const BIN_SLOT_OPTIONS = [
  { value: 0, label: '0' },
  { value: 2, label: '2 (L/R)' },
];

interface WarehouseModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  existingWarehouse?: WarehouseNode;
  existingNames: Set<string>;  // V1 parity: for duplicate checking
  onComplete: () => void;
  onCancel: () => void;
}

function defaultBayConfig(): BayConfig {
  // V1 parity: default bay=3, levels=GMT, bin=2(L/R), slot=0
  return { bayCount: 3, levels: ['G', 'M', 'T'], binCount: 2, slotCount: 0 };
}

function calculateTotalLocations(enableL: boolean, enableR: boolean, configL: BayConfig, configR: BayConfig): number {
  let total = 0;
  const calc = (cfg: BayConfig) => {
    const bins = Math.max(1, cfg.binCount);
    const slots = Math.max(1, cfg.slotCount);
    return cfg.bayCount * cfg.levels.length * bins * slots;
  };
  if (enableL) total += calc(configL);
  if (enableR) total += calc(configR);
  return total;
}

export function WarehouseModal({
  isOpen,
  mode,
  existingWarehouse,
  existingNames,
  onComplete,
  onCancel,
}: WarehouseModalProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const backdropRef = useRef<HTMLDivElement>(null);

  const isEdit = mode === 'edit';

  // V1 parity: warehouse name with maxlength=10, uppercase, uniqueness check
  const [warehouseName, setWarehouseName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // V1 parity: fixed L/R aisles with enable/disable toggle
  const [enableL, setEnableL] = useState(true);
  const [enableR, setEnableR] = useState(true);
  const [configL, setConfigL] = useState<BayConfig>(defaultBayConfig());
  const [configR, setConfigR] = useState<BayConfig>(defaultBayConfig());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  // Initialize state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (existingWarehouse) {
      setWarehouseName(existingWarehouse.warehouse);
      const aisleL = existingWarehouse.aisles.find(a => a.aisle === 'L');
      const aisleR = existingWarehouse.aisles.find(a => a.aisle === 'R');
      setEnableL(!!aisleL);
      setEnableR(!!aisleR);
      if (aisleL) {
        setConfigL({
          bayCount: aisleL.bays.length,
          levels: aisleL.bays[0]?.levels.map(l => l.level) || ['G'],
          binCount: aisleL.bays[0]?.levels[0]?.bins.length || 0,
          slotCount: aisleL.bays[0]?.levels[0]?.bins[0]?.slots.length || 0,
        });
      } else {
        setConfigL(defaultBayConfig());
      }
      if (aisleR) {
        setConfigR({
          bayCount: aisleR.bays.length,
          levels: aisleR.bays[0]?.levels.map(l => l.level) || ['G'],
          binCount: aisleR.bays[0]?.levels[0]?.bins.length || 0,
          slotCount: aisleR.bays[0]?.levels[0]?.bins[0]?.slots.length || 0,
        });
      } else {
        setConfigR(defaultBayConfig());
      }
    } else {
      setWarehouseName('');
      setEnableL(true);
      setEnableR(true);
      setConfigL(defaultBayConfig());
      setConfigR(defaultBayConfig());
    }
    setNameError(null);
    setSubmitError(undefined);
  }, [isOpen, existingWarehouse]);

  // V1 parity: realtime name uniqueness check
  const handleNameChange = (val: string) => {
    const upper = val.toUpperCase().slice(0, 10); // V1: maxlength=10
    setWarehouseName(upper);
    if (upper && !isEdit && existingNames.has(upper)) {
      setNameError(t('shelf.wizard.nameExists'));
    } else {
      setNameError(null);
    }
  };

  // V1 parity: G→M→T dependency chain enforcement
  const toggleLevel = (side: 'L' | 'R', level: string) => {
    const config = side === 'L' ? configL : configR;
    const setConfig = side === 'L' ? setConfigL : setConfigR;
    const current = config.levels;
    const levelIdx = LEVELS.indexOf(level as typeof LEVELS[number]);

    if (current.includes(level)) {
      // Unchecking: also uncheck all levels above
      const newLevels = current.filter(l => LEVELS.indexOf(l as typeof LEVELS[number]) < levelIdx);
      setConfig({ ...config, levels: newLevels.length > 0 ? newLevels : ['G'] }); // Must have at least G
    } else {
      // Checking: also check all levels below
      const newLevels = LEVELS.filter((l, i) => i <= levelIdx || current.includes(l))
        .filter((l, i) => i <= levelIdx);
      // Ensure contiguous from G upward
      const contiguous: string[] = [];
      for (const l of LEVELS) {
        if (LEVELS.indexOf(l) <= levelIdx) contiguous.push(l);
        else if (current.includes(l) && contiguous.length === LEVELS.indexOf(l)) contiguous.push(l);
      }
      setConfig({ ...config, levels: contiguous });
    }
  };

  const updateConfig = (side: 'L' | 'R', field: keyof BayConfig, value: number | string[]) => {
    const setConfig = side === 'L' ? setConfigL : setConfigR;
    const config = side === 'L' ? configL : configR;
    setConfig({ ...config, [field]: value });
  };

  // Build aisles array for preview + submission
  const aisles = useMemo<AisleConfig[]>(() => {
    const result: AisleConfig[] = [];
    if (enableL) result.push({ aisle: 'L', bayConfig: configL });
    if (enableR) result.push({ aisle: 'R', bayConfig: configR });
    return result;
  }, [enableL, enableR, configL, configR]);

  const totalLocations = useMemo(
    () => calculateTotalLocations(enableL, enableR, configL, configR),
    [enableL, enableR, configL, configR]
  );

  // V1 parity: at least one aisle enabled + valid name
  const canSubmit = warehouseName.trim().length > 0
    && !nameError
    && (enableL || enableR)
    && aisles.every(a => a.bayConfig.levels.length > 0);

  const security = useSecurityAction({
    actionKey: isEdit ? 'btn_update_warehouse' : 'btn_create_warehouse',
    level: 'L2',
    onExecute: async (code) => {
      setIsSubmitting(true);
      setSubmitError(undefined);
      try {
        const payload = { warehouse: warehouseName, aisles };
        if (isEdit && existingWarehouse) {
          await inventoryApi.updateWarehouse(existingWarehouse.warehouse, payload, code);
        } else {
          await inventoryApi.createWarehouse(payload, code);
        }
        security.onCancel();
        onComplete();
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message || 'Failed to save';
        security.setError(msg);
        setSubmitError(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  if (!isOpen) return null;

  // ═══════ Render one aisle config panel ═══════
  const renderAisleConfig = (side: 'L' | 'R', enabled: boolean, setEnabled: (v: boolean) => void, config: BayConfig) => (
    <div
      style={{
        backgroundColor: colors.bg,
        borderColor: enabled ? colors.border : `${colors.border}40`,
        opacity: enabled ? 1 : 0.45,
      }}
      className="rounded-xl border p-3.5 transition-opacity duration-200"
    >
      {/* Enable toggle + side label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {/* iOS-style toggle */}
          <button
            onClick={() => setEnabled(!enabled)}
            className="relative w-10 h-[22px] rounded-full transition-colors duration-200 flex-shrink-0"
            style={{
              backgroundColor: enabled ? colors.controlAccent : colors.bgTertiary,
            }}
          >
            <div
              className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{ left: enabled ? '20px' : '2px' }}
            />
          </button>
          <span style={{ color: colors.text }} className="text-[14px] font-semibold">
            {side === 'L' ? t('shelf.wizard.aisleL') : t('shelf.wizard.aisleR')}
          </span>
        </div>
        {enabled && (
          <span style={{ color: colors.textTertiary }} className="text-[11px]">
            {(() => {
              const bins = Math.max(1, config.binCount);
              const slots = Math.max(1, config.slotCount);
              return config.bayCount * config.levels.length * bins * slots;
            })()} loc
          </span>
        )}
      </div>

      {enabled && (
        <div className="space-y-3">
          {/* Bay Count */}
          <div>
            <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
              {t('shelf.wizard.bayCount')}
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={config.bayCount}
              onChange={(e) => updateConfig(side, 'bayCount', Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
              className="w-full rounded-lg border px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Levels — V1: G→M→T dependency chain */}
          <div>
            <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
              {t('shelf.wizard.levels')}
              <span style={{ color: colors.textTertiary }} className="ml-1 text-[10px]">(G→M→T)</span>
            </label>
            <div className="flex gap-1.5">
              {LEVELS.map((level, idx) => {
                const active = config.levels.includes(level);
                // V1: can't enable a level if the one below is disabled
                const belowDisabled = idx > 0 && !config.levels.includes(LEVELS[idx - 1]);
                return (
                  <button
                    key={level}
                    onClick={() => !belowDisabled && toggleLevel(side, level)}
                    disabled={belowDisabled}
                    style={{
                      backgroundColor: active ? LEVEL_COLORS[level] : colors.bgTertiary,
                      color: active ? '#ffffff' : belowDisabled ? colors.textQuaternary : colors.textSecondary,
                      borderColor: active ? LEVEL_COLORS[level] : colors.border,
                    }}
                    className="flex-1 rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bin — V1: only 0 or 2 (select dropdown) */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
                {t('shelf.wizard.binCount')}
              </label>
              <select
                value={config.binCount}
                onChange={(e) => updateConfig(side, 'binCount', parseInt(e.target.value))}
                style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                {BIN_SLOT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Slot — V1: only 0 or 2 (select dropdown) */}
            <div className="flex-1">
              <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
                {t('shelf.wizard.slotCount')}
              </label>
              <select
                value={config.slotCount}
                onChange={(e) => updateConfig(side, 'slotCount', parseInt(e.target.value))}
                style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                {BIN_SLOT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={(e) => e.target === backdropRef.current && onCancel()}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      >
        {/* Modal */}
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
            boxShadow: theme === 'dark'
              ? '0 32px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1)'
              : '0 32px 80px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.15)',
          }}
          className="relative w-[920px] max-h-[85vh] rounded-2xl border overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div
            style={{ borderColor: `${colors.border}80` }}
            className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          >
            <div>
              <h2 style={{ color: colors.text }} className="text-[20px] font-semibold">
                {isEdit ? t('shelf.wizard.editTitle') : t('shelf.wizard.createTitle')}
              </h2>
              <p style={{ color: colors.textTertiary }} className="text-[12px] mt-0.5">
                {totalLocations.toLocaleString()} {t('shelf.card.locations')}
                {totalLocations > MAX_LOCATIONS_WARNING && (
                  <span style={{ color: colors.orange }} className="ml-2">⚠ Large warehouse</span>
                )}
              </p>
            </div>
            <button
              onClick={onCancel}
              style={{ color: colors.textTertiary }}
              className="p-1.5 rounded-lg hover:opacity-60 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body: Left form + Right preview */}
          <div className="flex flex-1 min-h-0">
            {/* ═══ Left: Form ═══ */}
            <div
              style={{ borderColor: `${colors.border}80` }}
              className="w-[400px] flex-shrink-0 border-r overflow-y-auto p-5 space-y-4"
            >
              {/* Warehouse Name — V1: maxlength=10, uppercase, realtime uniqueness */}
              <div>
                <label style={{ color: colors.textSecondary }} className="block text-[12px] font-medium mb-1.5">
                  {t('shelf.wizard.warehouse')}
                  <span style={{ color: colors.textTertiary }} className="ml-1 text-[10px]">
                    (max 10)
                  </span>
                </label>
                <input
                  type="text"
                  value={warehouseName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isEdit}
                  placeholder="WH01"
                  maxLength={10}
                  style={{
                    backgroundColor: isEdit ? `${colors.bgTertiary}80` : colors.bgTertiary,
                    color: colors.text,
                    borderColor: nameError ? colors.red : colors.border,
                    letterSpacing: '2px',
                  }}
                  className="w-full rounded-xl border px-4 py-2.5 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
                  autoFocus={!isEdit}
                />
                {nameError && (
                  <p style={{ color: colors.red }} className="text-[11px] mt-1">{nameError}</p>
                )}
              </div>

              {/* L Aisle Config */}
              {renderAisleConfig('L', enableL, setEnableL, configL)}

              {/* R Aisle Config */}
              {renderAisleConfig('R', enableR, setEnableR, configR)}

              {/* V1 parity: "at least one aisle" warning */}
              {!enableL && !enableR && (
                <div
                  style={{ backgroundColor: `${colors.orange}12`, borderColor: `${colors.orange}40` }}
                  className="rounded-xl border px-4 py-2.5"
                >
                  <span style={{ color: colors.orange }} className="text-[12px]">
                    {t('shelf.wizard.enableAtLeastOne')}
                  </span>
                </div>
              )}

              {/* Submit error */}
              {submitError && (
                <div
                  style={{ backgroundColor: `${colors.red}12`, borderColor: `${colors.red}40` }}
                  className="rounded-xl border px-4 py-2.5"
                >
                  <span style={{ color: colors.red }} className="text-[12px]">{submitError}</span>
                </div>
              )}
            </div>

            {/* ═══ Right: 3D Preview ═══ */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Legend */}
              <div
                style={{ borderColor: `${colors.border}60` }}
                className="flex items-center justify-center gap-4 px-4 py-2 border-b flex-shrink-0"
              >
                {LEVELS.map(l => (
                  <div key={l} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: LEVEL_COLORS[l] }} />
                    <span style={{ color: colors.textSecondary }} className="text-[11px]">
                      {l} - {t(`shelf.levels.${l}` as 'shelf.levels.G')}
                    </span>
                  </div>
                ))}
              </div>

              {/* 3D Canvas */}
              <div className="flex-1 min-h-[350px]">
                {(enableL || enableR) ? (
                  <WarehouseScene aisles={aisles} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: '#1a1d24' }}>
                    <span style={{ color: colors.textTertiary }} className="text-[13px]">
                      {t('shelf.wizard.enableAtLeastOne')}
                    </span>
                  </div>
                )}
              </div>

              {/* Summary bar */}
              <div
                style={{ borderColor: `${colors.border}60`, backgroundColor: `${colors.bg}80` }}
                className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
              >
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div style={{ color: colors.text }} className="text-[18px] font-bold">
                      {warehouseName || '—'}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[10px]">
                      {t('shelf.wizard.warehouse')}
                    </div>
                  </div>
                  <div style={{ backgroundColor: colors.border }} className="w-px h-6" />
                  <div className="text-center">
                    <div style={{ color: colors.text }} className="text-[18px] font-bold">
                      {(enableL ? 1 : 0) + (enableR ? 1 : 0)}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[10px]">
                      {t('shelf.card.aisles')}
                    </div>
                  </div>
                  <div style={{ backgroundColor: colors.border }} className="w-px h-6" />
                  <div className="text-center">
                    <div
                      style={{ color: totalLocations > MAX_LOCATIONS_WARNING ? colors.orange : colors.text }}
                      className="text-[18px] font-bold"
                    >
                      {totalLocations.toLocaleString()}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[10px]">
                      {t('shelf.wizard.totalLocations')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onCancel}
                    style={{ color: colors.textSecondary }}
                    className="px-4 py-2 rounded-full text-[13px] font-medium hover:opacity-70 transition-opacity"
                  >
                    {t('shelf.wizard.back')}
                  </button>
                  <button
                    onClick={() => security.trigger()}
                    disabled={isSubmitting || !canSubmit}
                    style={{
                      backgroundColor: canSubmit && !isSubmitting ? colors.controlAccent : colors.bgTertiary,
                      color: canSubmit && !isSubmitting ? '#fff' : colors.textTertiary,
                    }}
                    className="px-5 py-2 rounded-full text-[13px] font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '...' : isEdit ? t('shelf.wizard.update') : t('shelf.wizard.create')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={security.isOpen}
        level={security.level}
        title={isEdit ? t('shelf.wizard.editTitle') : t('shelf.wizard.createTitle')}
        onConfirm={security.onConfirm}
        onCancel={security.onCancel}
        isLoading={isSubmitting}
        error={security.error}
      />
    </>
  );
}
