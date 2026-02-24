'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { AisleConfigPanel } from './AisleConfigPanel';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { inventoryApi } from '@/lib/api/inventory';
import type { AisleConfig, BayConfig, WarehouseNode } from '@/lib/api/inventory';

const WarehouseScene = dynamic(
  () => import('./three/WarehouseScene').then(m => ({ default: m.WarehouseScene })),
  { ssr: false }
);

const MAX_LOCATIONS_WARNING = 10000;

interface WarehouseWizardProps {
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

export function WarehouseWizard({
  mode,
  existingWarehouse,
  onComplete,
  onCancel,
}: WarehouseWizardProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const isEdit = mode === 'edit';
  const totalSteps = isEdit ? 2 : 3;
  const [step, setStep] = useState(1);
  const [warehouseName, setWarehouseName] = useState(existingWarehouse?.warehouse || '');
  const [aisles, setAisles] = useState<AisleConfig[]>(() => {
    if (existingWarehouse) {
      return existingWarehouse.aisles.map(a => ({
        aisle: a.aisle,
        bayConfig: {
          bayCount: a.bays.length,
          levels: a.bays[0]?.levels.map(l => l.level) || ['G'],
          binCount: a.bays[0]?.levels[0]?.bins.length || 1,
          slotCount: a.bays[0]?.levels[0]?.bins[0]?.slots.length || 1,
        },
      }));
    }
    return [{ aisle: 'L', bayConfig: defaultBayConfig() }, { aisle: 'R', bayConfig: defaultBayConfig() }];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

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

  // Step mapping for edit mode (skip step 1)
  const currentStep = isEdit ? step + 1 : step; // Effective step: 1=name, 2=config, 3=preview

  const canProceed = () => {
    if (currentStep === 1) return warehouseName.trim().length > 0;
    if (currentStep === 2) return aisles.length > 0 && aisles.every(a => a.aisle.trim() && a.bayConfig.bayCount > 0 && a.bayConfig.levels.length > 0);
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    security.trigger();
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      <div className="max-w-[960px] mx-auto px-6 pt-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1
            style={{ color: colors.text }}
            className="text-[28px] font-semibold"
          >
            {isEdit ? t('shelf.wizard.editTitle') : t('shelf.wizard.createTitle')}
          </h1>
          <button
            onClick={onCancel}
            style={{ color: colors.textSecondary }}
            className="text-[14px] hover:opacity-70 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isDone = stepNum < step;
            const stepLabel = isEdit
              ? stepNum === 1 ? t('shelf.wizard.step2') : t('shelf.wizard.step3')
              : stepNum === 1 ? t('shelf.wizard.step1') : stepNum === 2 ? t('shelf.wizard.step2') : t('shelf.wizard.step3');

            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    style={{ backgroundColor: isDone || isActive ? colors.controlAccent : colors.border }}
                    className="w-8 h-px"
                  />
                )}
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      backgroundColor: isActive ? colors.controlAccent : isDone ? colors.green : colors.bgTertiary,
                      color: isActive || isDone ? '#fff' : colors.textTertiary,
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold"
                  >
                    {isDone ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : stepNum}
                  </div>
                  <span
                    style={{ color: isActive ? colors.text : colors.textTertiary }}
                    className="text-[13px] font-medium"
                  >
                    {stepLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="mb-8">
          {/* Step 1: Warehouse Name (create only) */}
          {currentStep === 1 && (
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-2xl border p-6"
            >
              <label style={{ color: colors.textSecondary }} className="block text-[13px] mb-2">
                {t('shelf.wizard.warehouse')}
              </label>
              <input
                type="text"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value.toUpperCase())}
                placeholder="e.g. WH-A"
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-full rounded-xl border px-4 py-3 text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                autoFocus
              />
            </div>
          )}

          {/* Step 2: Aisle Configuration */}
          {currentStep === 2 && (
            <div>
              <AisleConfigPanel aisles={aisles} onChange={setAisles} />
            </div>
          )}

          {/* Step 3: Preview & Confirm */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* 3D Preview */}
              <div
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                className="rounded-2xl border overflow-hidden h-[350px]"
              >
                <WarehouseScene aisles={aisles} />
              </div>

              {/* Summary */}
              <div
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                className="rounded-2xl border p-5"
              >
                <h3 style={{ color: colors.text }} className="text-[16px] font-semibold mb-3">
                  {t('shelf.wizard.preview')}
                </h3>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div style={{ color: colors.text }} className="text-[24px] font-bold">
                      {warehouseName || '-'}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[12px]">
                      {t('shelf.wizard.warehouse')}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: colors.text }} className="text-[24px] font-bold">
                      {aisles.length}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[12px]">
                      {t('shelf.card.aisles')}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ color: totalLocations > MAX_LOCATIONS_WARNING ? colors.orange : colors.text }}
                      className="text-[24px] font-bold"
                    >
                      {totalLocations.toLocaleString()}
                    </div>
                    <div style={{ color: colors.textTertiary }} className="text-[12px]">
                      {t('shelf.wizard.totalLocations')}
                    </div>
                  </div>
                </div>

                {totalLocations > MAX_LOCATIONS_WARNING && (
                  <div
                    style={{ backgroundColor: `${colors.orange}15`, borderColor: `${colors.orange}40` }}
                    className="mt-4 rounded-xl border px-4 py-3 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: colors.orange }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span style={{ color: colors.orange }} className="text-[13px]">
                      {totalLocations.toLocaleString()} locations. Large warehouses may take longer to process.
                    </span>
                  </div>
                )}

                {submitError && (
                  <div
                    style={{ backgroundColor: `${colors.red}15`, borderColor: `${colors.red}40` }}
                    className="mt-4 rounded-xl border px-4 py-3"
                  >
                    <span style={{ color: colors.red }} className="text-[13px]">{submitError}</span>
                  </div>
                )}

                {/* Aisle details */}
                <div className="mt-4 space-y-2">
                  {aisles.map((a, i) => {
                    const bins = Math.max(1, a.bayConfig.binCount);
                    const slots = Math.max(1, a.bayConfig.slotCount);
                    const locs = a.bayConfig.bayCount * a.bayConfig.levels.length * bins * slots;
                    return (
                      <div
                        key={i}
                        style={{ backgroundColor: colors.bgTertiary }}
                        className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                      >
                        <span style={{ color: colors.text }} className="text-[14px] font-medium">
                          {t('shelf.wizard.aisle')} {a.aisle}
                        </span>
                        <span style={{ color: colors.textSecondary }} className="text-[13px]">
                          {a.bayConfig.bayCount} bays / {a.bayConfig.levels.join(',')} / {locs} loc
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={step === 1 ? onCancel : handleBack}
            style={{ color: colors.textSecondary }}
            className="text-[14px] font-medium hover:opacity-70 transition-opacity"
          >
            {step === 1 ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              t('shelf.wizard.back')
            )}
          </button>

          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              style={{
                backgroundColor: canProceed() ? colors.controlAccent : colors.bgTertiary,
                color: canProceed() ? '#fff' : colors.textTertiary,
              }}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed"
            >
              {t('shelf.wizard.next')}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !canProceed()}
              style={{
                backgroundColor: canProceed() && !isSubmitting ? colors.controlAccent : colors.bgTertiary,
                color: canProceed() && !isSubmitting ? '#fff' : colors.textTertiary,
              }}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '...' : isEdit ? t('shelf.wizard.update') : t('shelf.wizard.create')}
            </button>
          )}
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
    </div>
  );
}
