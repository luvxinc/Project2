'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

interface SecurityCodeDialogProps {
  isOpen: boolean;
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  title: string;
  description?: string;
  onConfirm: (code: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const levelColors = {
  L0: '#86868b',
  L1: '#30d158',
  L2: '#ff9f0a',
  L3: '#ff453a',
  L4: '#bf5af2',
};

export function SecurityCodeDialog(props: SecurityCodeDialogProps) {
  if (!props.isOpen) return null;
  return <SecurityCodeDialogContent {...props} />;
}

function SecurityCodeDialogContent({
  level,
  title,
  description,
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
}: Omit<SecurityCodeDialogProps, 'isOpen'>) {
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onConfirm(code.trim());
    }
  };

  const levelColor = levelColors[level];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div style={{ backgroundColor: colors.bgSecondary }} className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-6 h-6 text-[#ff9f0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 style={{ color: colors.text }} className="text-[17px] font-semibold">{title}</h2>
          </div>
          {description && <p style={{ color: colors.textSecondary }} className="text-[13px] mt-1">{description}</p>}
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: `${levelColor}20`, color: levelColor }}>
              {level}
            </span>
            <span style={{ color: colors.textSecondary }} className="text-[12px]">{tAuth(`securityLevels.${level}`)}</span>
          </div>

          <div className="mb-4">
            <input
              ref={inputRef}
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('securityCode.placeholder')}
              disabled={isLoading}
              style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {error && (
            <div style={{ backgroundColor: `${colors.red}15`, borderColor: `${colors.red}50` }} className="mb-4 p-3 border rounded-lg">
              <p style={{ color: colors.red }} className="text-[13px]">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              className="flex-1 h-11 hover:opacity-80 text-[15px] font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading || !code.trim()}
              style={{ backgroundColor: colors.blue }}
              className="flex-1 h-11 hover:opacity-90 text-white text-[15px] font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {t('confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
