'use client';

import { useEffect, useCallback, type ReactNode } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

// ================================
// Shared Modal Shell — Purchase Module
// ================================
// Unified design for all purchase module Modals (Create / Edit / Add).
// - Wide panel (max-w-4xl)
// - Full-area content — no wizard step bar
// - Consistent header (title + subtitle + close button)
// - Consistent footer (left slot + right slot)
// - Theme-aware, backdrop-blur, ESC to close

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** Main title, e.g. "Edit Shipment" */
  title: string;
  /** Subtitle line, e.g. "L01-YC25001DS — 2025-01-15" */
  subtitle?: string;
  /** Optional status badge next to title */
  badge?: ReactNode;
  /** Whether close (ESC / backdrop click) is allowed */
  closable?: boolean;
  /** Left footer slot (e.g. dirty indicator, back button) */
  footerLeft?: ReactNode;
  /** Right footer slot (e.g. cancel + submit buttons) */
  footerRight?: ReactNode;
  /** Whether to show the footer at all */
  showFooter?: boolean;
  children: ReactNode;
}

export default function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  closable = true,
  footerLeft,
  footerRight,
  showFooter = true,
  children,
}: ModalShellProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // --- ESC to close ---
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) onClose();
    },
    [onClose, closable],
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={closable ? onClose : undefined}
      />

      {/* Panel — wide */}
      <div
        className="relative w-full max-w-4xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold truncate" style={{ color: colors.text }}>
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && (
                <p className="text-sm font-mono mt-0.5 truncate" style={{ color: colors.textSecondary }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {closable && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity shrink-0 ml-4"
              style={{ backgroundColor: colors.bgTertiary }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Content — scrollable, full width */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {children}
        </div>

        {/* Footer */}
        {showFooter && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-4 shrink-0"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            <div className="flex items-center gap-3">{footerLeft}</div>
            <div className="flex items-center gap-3">{footerRight}</div>
          </div>
        )}
      </div>
    </div>
  );
}
