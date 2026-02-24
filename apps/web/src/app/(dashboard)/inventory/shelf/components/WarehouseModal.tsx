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

const AVAILABLE_LEVELS = ['G', 'M', 'T'] as const;
const LEVEL_COLORS: Record<string, string> = {
  G: '#4CAF50',
  M: '#2196F3',
  T: '#FF9800',
};

interface WarehouseModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  existingWarehouse?: WarehouseNode;
  onComplete: () => void;
  onCancel: () => void;
}

function defaultBayConfig(): BayConfig {
  return { bayCount: 4, levels: ['G', 'M', 'T'], binCount: 1, slotCount: 1 };
}

function calculateTotalLocations(aisles: AisleConfig[]): number {
  return aisles.reduce((total, a) => {
    const bins = Math.max(1, a.bayConfig.binCount);
    const slots = Math.max(1, a.bayConfig.slotCount);
    return total + a.bayConfig.bayCount * a.bayConfig.levels.length * bins * slots;
  }, 0);
}

export function WarehouseModal({
  isOpen,
  mode,
  existingWarehouse,
  onComplete,
  onCancel,
}: WarehouseModalProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const backdropRef = useRef<HTMLDivElement>(null);

  const isEdit = mode === 'edit';
  const [warehouseName, setWarehouseName] = useState('');
  const [aisles, setAisles] = useState<AisleConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (existingWarehouse) {
        setWarehouseName(existingWarehouse.warehouse);
        setAisles(existingWarehouse.aisles.map(a => ({
          aisle: a.aisle,
          bayConfig: {
            bayCount: a.bays.length,
            levels: a.bays[0]?.levels.map(l => l.level) || ['G'],
            binCount: a.bays[0]?.levels[0]?.bins.length || 1,
            slotCount: a.bays[0]?.levels[0]?.bins[0]?.slots.length || 1,
          },
        })));
      } else {
        setWarehouseName('');
        setAisles([
          { aisle: 'L', bayConfig: defaultBayConfig() },
          { aisle: 'R', bayConfig: defaultBayConfig() },
        ]);
      }
      setSubmitError(undefined);
    }
  }, [isOpen, existingWarehouse]);

  const totalLocations = useMemo(() => calculateTotalLocations(aisles), [aisles]);

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

  const canSubmit = warehouseName.trim().length > 0
    && aisles.length > 0
    && aisles.every(a => a.aisle.trim() && a.bayConfig.bayCount > 0 && a.bayConfig.levels.length > 0);

  // ═══════════ Aisle config helpers ═══════════
  const updateAisleName = (idx: number, value: string) => {
    const updated = [...aisles];
    updated[idx] = { ...updated[idx], aisle: value.toUpperCase() };
    setAisles(updated);
  };

  const updateBayConfig = (idx: number, field: keyof BayConfig, value: number | string[]) => {
    const updated = [...aisles];
    updated[idx] = {
      ...updated[idx],
      bayConfig: { ...updated[idx].bayConfig, [field]: value },
    };
    setAisles(updated);
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

  const addAisle = () => {
    const nextChar = String.fromCharCode(65 + aisles.length);
    setAisles([...aisles, { aisle: nextChar, bayConfig: defaultBayConfig() }]);
  };

  const removeAisle = (index: number) => {
    setAisles(aisles.filter((_, i) => i !== index));
  };

  const aisleLocations = (cfg: BayConfig) => {
    const bins = Math.max(1, cfg.binCount);
    const slots = Math.max(1, cfg.slotCount);
    return cfg.bayCount * cfg.levels.length * bins * slots;
  };

  if (!isOpen) return null;

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
          className="relative w-[960px] max-h-[85vh] rounded-2xl border overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
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
              className="w-[440px] flex-shrink-0 border-r overflow-y-auto p-5 space-y-4"
            >
              {/* Warehouse Name */}
              <div>
                <label style={{ color: colors.textSecondary }} className="block text-[12px] font-medium mb-1.5">
                  {t('shelf.wizard.warehouse')}
                </label>
                <input
                  type="text"
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value.toUpperCase())}
                  disabled={isEdit}
                  placeholder="e.g. WH-A"
                  style={{
                    backgroundColor: isEdit ? `${colors.bgTertiary}80` : colors.bgTertiary,
                    color: colors.text,
                    borderColor: colors.border,
                  }}
                  className="w-full rounded-xl border px-4 py-2.5 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
                  autoFocus={!isEdit}
                />
              </div>

              {/* Aisle configs */}
              {aisles.map((aisle, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                  }}
                  className="rounded-xl border p-4"
                >
                  {/* Aisle header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aisle.aisle}
                        onChange={(e) => updateAisleName(idx, e.target.value)}
                        style={{
                          backgroundColor: colors.bgTertiary,
                          color: colors.text,
                          borderColor: colors.border,
                        }}
                        className="w-12 text-center text-[14px] font-bold rounded-lg border px-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        maxLength={3}
                      />
                      <span style={{ color: colors.textTertiary }} className="text-[11px]">
                        {t('shelf.wizard.aisle')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: colors.textTertiary }} className="text-[11px]">
                        {aisleLocations(aisle.bayConfig)} loc
                      </span>
                      {aisles.length > 1 && (
                        <button
                          onClick={() => removeAisle(idx)}
                          style={{ color: colors.red }}
                          className="p-0.5 hover:opacity-60 transition-opacity"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact config grid */}
                  <div className="space-y-3">
                    {/* Bay Count + Levels in one row */}
                    <div className="flex items-end gap-3">
                      <div className="w-20 flex-shrink-0">
                        <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
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
                          className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                      <div className="flex-1">
                        <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
                          {t('shelf.wizard.levels')}
                        </label>
                        <div className="flex gap-1.5">
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
                                className="flex-1 rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold transition-all hover:opacity-80"
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bin + Slot in one row */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
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
                          className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                      <div className="flex-1">
                        <label style={{ color: colors.textSecondary }} className="block text-[11px] mb-1">
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
                          className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add aisle */}
              <button
                onClick={addAisle}
                style={{ borderColor: colors.border, color: colors.controlAccent }}
                className="w-full rounded-xl border border-dashed py-2.5 text-[13px] font-medium hover:opacity-70 transition-opacity"
              >
                + {t('shelf.wizard.aisle')}
              </button>

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
                {AVAILABLE_LEVELS.map(l => (
                  <div key={l} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: LEVEL_COLORS[l] }}
                    />
                    <span style={{ color: colors.textSecondary }} className="text-[11px]">
                      {l} - {t(`shelf.levels.${l}` as 'shelf.levels.G')}
                    </span>
                  </div>
                ))}
              </div>

              {/* 3D Canvas */}
              <div className="flex-1 min-h-[350px]">
                <WarehouseScene aisles={aisles} />
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
                      {aisles.length}
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
