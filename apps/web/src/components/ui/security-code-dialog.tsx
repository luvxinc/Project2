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

const levelInfo = {
  L0: { label: 'User Password', color: '#86868b' },
  L1: { label: 'Query Code', color: '#30d158' },
  L2: { label: 'Modify Code', color: '#ff9f0a' },
  L3: { label: 'Database Code', color: '#ff453a' },
  L4: { label: 'System Code', color: '#bf5af2' },
};

export function SecurityCodeDialog({
  isOpen,
  level,
  title,
  description,
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
}: SecurityCodeDialogProps) {
  const t = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onConfirm(code.trim());
    }
  };

  const info = levelInfo[level];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div 
        style={{ backgroundColor: colors.bgSecondary }}
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-6 h-6 text-[#ff9f0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 style={{ color: colors.text }} className="text-[17px] font-semibold">{title}</h2>
          </div>
          {description && (
            <p style={{ color: colors.textSecondary }} className="text-[13px] mt-1">{description}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          {/* Security Level Badge */}
          <div className="flex items-center gap-2 mb-4">
            <span 
              className="px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: `${info.color}20`, color: info.color }}
            >
              {level}
            </span>
            <span style={{ color: colors.textSecondary }} className="text-[12px]">{info.label}</span>
          </div>

          {/* Input */}
          <div className="mb-4">
            <input
              ref={inputRef}
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('securityCode.placeholder')}
              disabled={isLoading}
              style={{ 
                backgroundColor: colors.bgTertiary, 
                borderColor: colors.border,
                color: colors.text 
              }}
              className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {/* Error */}
          {error && (
            <div 
              style={{ 
                backgroundColor: `${colors.red}15`, 
                borderColor: `${colors.red}50` 
              }}
              className="mb-4 p-3 border rounded-lg"
            >
              <p style={{ color: colors.red }} className="text-[13px]">{error}</p>
            </div>
          )}

          {/* Actions */}
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
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {t('confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
