'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { PillNav } from '@/components/ui/pill-nav';

// ================================
// Types
// ================================

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  supplierCode: string;
  supplierName: string;
  category: string;
  currency: string;
  floatCurrency: boolean;
  floatThreshold: number;
  requireDeposit: boolean;
  depositRatio: number;
}

interface FormErrors {
  supplierCode?: string;
  supplierName?: string;
  floatThreshold?: string;
  depositRatio?: string;
}

const INITIAL_FORM: FormData = {
  supplierCode: '',
  supplierName: '',
  category: 'E',
  currency: 'USD',
  floatCurrency: false,
  floatThreshold: 0,
  requireDeposit: false,
  depositRatio: 0,
};

const PILLS = [
  { key: 'basic', label: '' },
  { key: 'strategy', label: '' },
];

// ================================
// Component
// ================================

export default function AddSupplierModal({ isOpen, onClose, onSuccess }: AddSupplierModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const queryClient = useQueryClient();

  // --- State ---
  const [activeStep, setActiveStep] = useState('basic');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [codeExists, setCodeExists] = useState<boolean | null>(null);
  const [codeCheckLoading, setCodeCheckLoading] = useState(false);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  // Debounce timer ref for code check
  const codeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate pill labels from i18n
  const pills = PILLS.map((p) => ({
    ...p,
    label: t(`add.pill.${p.key}`),
  }));

  // --- Reset on open/close ---
  useEffect(() => {
    if (isOpen) {
      setActiveStep('basic');
      setCompletedSteps([]);
      setFormData(INITIAL_FORM);
      setErrors({});
      setCodeExists(null);
      setCodeCheckLoading(false);
      setShowSecurityDialog(false);
      setSecurityError(undefined);
      setSuccess(false);
    }
  }, [isOpen]);

  // --- ESC to close ---
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSecurityDialog) onClose();
    },
    [onClose, showSecurityDialog],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // --- Inline code existence check (debounced 500ms) ---
  const checkCodeInline = useCallback((code: string) => {
    // Clear any pending timer
    if (codeCheckTimer.current) {
      clearTimeout(codeCheckTimer.current);
      codeCheckTimer.current = null;
    }

    // Reset if not 2 chars
    if (code.length !== 2) {
      setCodeExists(null);
      setCodeCheckLoading(false);
      return;
    }

    setCodeCheckLoading(true);
    codeCheckTimer.current = setTimeout(async () => {
      try {
        const res = await purchaseApi.checkCodeExists(code);
        setCodeExists(res.exists);
      } catch {
        setCodeExists(null);
      } finally {
        setCodeCheckLoading(false);
      }
    }, 500);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (codeCheckTimer.current) {
        clearTimeout(codeCheckTimer.current);
      }
    };
  }, []);

  // --- Mutation ---
  const createMutation = useMutation({
    mutationFn: (secCode: string) =>
      purchaseApi.createSupplier({
        supplierCode: formData.supplierCode,
        supplierName: formData.supplierName,
        category: formData.category,
        currency: formData.currency,
        floatCurrency: formData.floatCurrency,
        floatThreshold: formData.floatCurrency ? formData.floatThreshold : undefined,
        requireDeposit: formData.requireDeposit,
        depositRatio: formData.requireDeposit ? formData.depositRatio : undefined,
        sec_code_l3: secCode,
      }),
    onSuccess: () => {
      setShowSecurityDialog(false);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    },
    onError: (err: any) => {
      if (err?.statusCode === 409) {
        setCodeExists(true);
        setShowSecurityDialog(false);
        setActiveStep('basic');
        setErrors({ supplierCode: t('add.errors.codeExists') });
      } else {
        setSecurityError(tCommon('securityCode.invalid'));
      }
    },
  });

  // --- Validation ---
  const validateBasic = (): boolean => {
    const newErrors: FormErrors = {};
    if (!/^[A-Z]{2}$/.test(formData.supplierCode)) {
      newErrors.supplierCode = t('add.errors.codeFormat');
    } else if (codeExists === true) {
      newErrors.supplierCode = t('add.errors.codeExists');
    }
    if (!formData.supplierName.trim()) {
      newErrors.supplierName = t('add.errors.nameRequired');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStrategy = (): boolean => {
    const newErrors: FormErrors = {};
    if (formData.floatCurrency) {
      if (formData.floatThreshold <= 0 || formData.floatThreshold > 10) {
        newErrors.floatThreshold = t('add.errors.floatRange');
      }
    }
    if (formData.requireDeposit) {
      if (formData.depositRatio <= 0) {
        newErrors.depositRatio = t('add.errors.depositPositive');
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Navigation ---
  const handleStepChange = (key: string) => {
    const stepOrder = ['basic', 'strategy'];
    const currentIdx = stepOrder.indexOf(activeStep);
    const targetIdx = stepOrder.indexOf(key);

    // Going forward — validate current step
    if (targetIdx > currentIdx) {
      if (activeStep === 'basic' && !validateBasic()) return;
    }

    // Mark current as completed when moving forward
    if (targetIdx > currentIdx) {
      setCompletedSteps((prev) => {
        const updated = new Set(prev);
        for (let i = 0; i <= currentIdx; i++) {
          updated.add(stepOrder[i]);
        }
        return Array.from(updated);
      });
    }

    setErrors({});
    setActiveStep(key);
  };

  const handleNext = () => {
    if (activeStep === 'basic') handleStepChange('strategy');
  };

  const handleBack = () => {
    if (activeStep === 'strategy') setActiveStep('basic');
  };

  // --- Field change ---
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as keyof FormErrors];
        return next;
      });
    }
  };

  // --- Submit ---
  const handleSubmit = () => {
    if (!validateStrategy()) return;
    setSecurityError(undefined);
    setShowSecurityDialog(true);
  };

  const handleSecurityConfirm = (code: string) => {
    createMutation.mutate(code);
  };

  // --- Early return ---
  if (!isOpen) return null;

  // --- Success state ---
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-lg rounded-2xl border shadow-2xl p-8 text-center"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${colors.green}20` }}
          >
            <svg className="w-8 h-8" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
            {t('add.success')}
          </h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {formData.supplierCode} - {formData.supplierName}
          </p>
        </div>
      </div>
    );
  }

  // --- Render helpers ---
  const renderInput = (opts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    error?: string;
    placeholder?: string;
    maxLength?: number;
    type?: string;
    disabled?: boolean;
    suffix?: React.ReactNode;
  }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
        {opts.label}
      </label>
      <div className="relative">
        <input
          type={opts.type || 'text'}
          value={opts.value}
          onChange={(e) => opts.onChange(e.target.value)}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength}
          disabled={opts.disabled}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50"
          style={{
            backgroundColor: colors.bgTertiary,
            borderColor: opts.error ? colors.red : colors.border,
            color: colors.text,
            paddingRight: opts.suffix ? '36px' : undefined,
          }}
        />
        {opts.suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {opts.suffix}
          </div>
        )}
      </div>
      {opts.error && (
        <p className="mt-1 text-xs" style={{ color: colors.red }}>
          {opts.error}
        </p>
      )}
    </div>
  );

  const renderSelect = (opts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
        {opts.label}
      </label>
      <select
        value={opts.value}
        onChange={(e) => opts.onChange(e.target.value)}
        className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors appearance-none"
        style={{
          backgroundColor: colors.bgTertiary,
          borderColor: colors.border,
          color: colors.text,
        }}
      >
        {opts.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderToggle = (opts: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between mb-4">
      <label className="text-sm font-medium" style={{ color: colors.text }}>
        {opts.label}
      </label>
      <button
        type="button"
        onClick={() => opts.onChange(!opts.checked)}
        className="relative w-11 h-6 rounded-full transition-colors"
        style={{
          backgroundColor: opts.checked ? colors.green : colors.bgTertiary,
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{
            transform: opts.checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );

  // --- Code availability inline indicator ---
  const renderCodeSuffix = () => {
    if (formData.supplierCode.length !== 2) return null;

    if (codeCheckLoading) {
      return (
        <div
          className="w-4 h-4 border-2 rounded-full animate-spin"
          style={{ borderColor: `${colors.blue}30`, borderTopColor: colors.blue }}
          title={t('add.checking')}
        />
      );
    }

    if (codeExists === false) {
      return (
        <svg className="w-4 h-4" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    }

    if (codeExists === true) {
      return (
        <svg className="w-4 h-4" style={{ color: colors.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }

    return null;
  };

  // --- Code availability status text ---
  const renderCodeStatus = () => {
    if (formData.supplierCode.length !== 2) return null;

    if (codeCheckLoading) {
      return (
        <p className="mt-1 text-xs" style={{ color: colors.blue }}>
          {t('add.checking')}
        </p>
      );
    }

    if (codeExists === false) {
      return (
        <p className="mt-1 text-xs" style={{ color: colors.green }}>
          {t('add.codeAvailable')}
        </p>
      );
    }

    if (codeExists === true) {
      return (
        <p className="mt-1 text-xs" style={{ color: colors.red }}>
          {t('add.codeUnavailable')}
        </p>
      );
    }

    return null;
  };

  // ================================
  // Pill Content
  // ================================

  const renderBasicPill = () => (
    <div>
      {/* Supplier Code with inline availability check */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text }}>
          {t('add.field.supplierCode')}
        </label>
        <div className="relative">
          <input
            type="text"
            value={formData.supplierCode}
            onChange={(e) => {
              const cleaned = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
              updateField('supplierCode', cleaned);
              // Reset code exists state and trigger check
              setCodeExists(null);
              checkCodeInline(cleaned);
            }}
            placeholder={t('add.placeholder.code')}
            maxLength={2}
            className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none transition-colors"
            style={{
              backgroundColor: colors.bgTertiary,
              borderColor: errors.supplierCode ? colors.red : codeExists === true ? colors.red : codeExists === false ? colors.green : colors.border,
              color: colors.text,
              paddingRight: '36px',
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {renderCodeSuffix()}
          </div>
        </div>
        {errors.supplierCode && (
          <p className="mt-1 text-xs" style={{ color: colors.red }}>
            {errors.supplierCode}
          </p>
        )}
        {!errors.supplierCode && renderCodeStatus()}
      </div>

      {renderInput({
        label: t('add.field.supplierName'),
        value: formData.supplierName,
        onChange: (v) => updateField('supplierName', v),
        error: errors.supplierName,
        placeholder: t('add.placeholder.name'),
      })}
    </div>
  );

  const renderStrategyPill = () => (
    <div>
      {renderSelect({
        label: t('add.field.category'),
        value: formData.category,
        onChange: (v) => updateField('category', v),
        options: [
          { value: 'E', label: t('category.E') },
          { value: 'A', label: t('category.A') },
        ],
      })}

      {renderSelect({
        label: t('add.field.currency'),
        value: formData.currency,
        onChange: (v) => updateField('currency', v),
        options: [
          { value: 'USD', label: 'USD' },
          { value: 'RMB', label: 'RMB' },
        ],
      })}

      {renderToggle({
        label: t('add.field.floatCurrency'),
        checked: formData.floatCurrency,
        onChange: (v) => {
          updateField('floatCurrency', v);
          if (!v) updateField('floatThreshold', 0);
        },
      })}

      {formData.floatCurrency &&
        renderInput({
          label: t('add.field.floatThreshold'),
          value: formData.floatThreshold ? String(formData.floatThreshold) : '',
          onChange: (v) => {
            const num = parseFloat(v);
            updateField('floatThreshold', isNaN(num) ? 0 : num);
          },
          error: errors.floatThreshold,
          placeholder: '1-10',
          type: 'number',
        })}

      {renderToggle({
        label: t('add.field.requireDeposit'),
        checked: formData.requireDeposit,
        onChange: (v) => {
          updateField('requireDeposit', v);
          if (!v) updateField('depositRatio', 0);
        },
      })}

      {formData.requireDeposit &&
        renderInput({
          label: t('add.field.depositRatio'),
          value: formData.depositRatio ? String(formData.depositRatio) : '',
          onChange: (v) => {
            const num = parseFloat(v);
            updateField('depositRatio', isNaN(num) ? 0 : num);
          },
          error: errors.depositRatio,
          placeholder: '>0',
          type: 'number',
        })}
    </div>
  );

  // ================================
  // Main render
  // ================================

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        {/* Panel */}
        <div
          className="relative w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 pt-5 pb-4"
            style={{ borderBottom: `1px solid ${colors.border}` }}
          >
            <h2 className="text-[17px] font-semibold" style={{ color: colors.text }}>
              {t('add.title')}
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ backgroundColor: colors.bgTertiary }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Pill Nav */}
          <div className="flex justify-center px-6 pt-4 pb-2">
            <PillNav
              steps={pills}
              activeStep={activeStep}
              onStepChange={handleStepChange}
              completedSteps={completedSteps}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-4 flex-1 overflow-y-auto" style={{ maxHeight: '400px' }}>
            {activeStep === 'basic' && renderBasicPill()}
            {activeStep === 'strategy' && renderStrategyPill()}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            <div>
              {activeStep !== 'basic' && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                >
                  {tCommon('back')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {tCommon('cancel')}
              </button>

              {activeStep === 'basic' ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: colors.blue }}
                >
                  {tCommon('next')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="h-9 px-5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: colors.blue }}
                >
                  {t('add.submit')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Code Dialog */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L3"
        title={t('add.title')}
        description={t('add.securityDescription')}
        onConfirm={handleSecurityConfirm}
        onCancel={() => {
          setShowSecurityDialog(false);
          setSecurityError(undefined);
        }}
        isLoading={createMutation.isPending}
        error={securityError}
      />
    </>
  );
}
