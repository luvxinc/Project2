'use client';

import { useState } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { exportLogs, type LogQueryParams } from '@/lib/api/logs';

interface ExportButtonProps {
  logType: 'error' | 'audit' | 'business' | 'access';
  currentFilters?: LogQueryParams;
  className?: string;
}

/**
 * 日志导出按钮组件
 */
export function ExportButton({ logType, currentFilters = {}, className = '' }: ExportButtonProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('logs');
  const [exporting, setExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    setShowDropdown(false);
    try {
      await exportLogs(logType, format, currentFilters);
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={exporting}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{
          backgroundColor: colors.bgTertiary,
          color: colors.text,
          opacity: exporting ? 0.5 : 1,
        }}
      >
        {exporting ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{t('common.exporting')}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{t('common.export')}</span>
          </>
        )}
      </button>

      {/* 下拉菜单 */}
      {showDropdown && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          
          {/* 菜单内容 */}
          <div
            className="absolute right-0 top-full mt-1 py-1 rounded-lg shadow-lg z-20 min-w-[120px]"
            style={{
              backgroundColor: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
            }}
          >
            <button
              onClick={() => handleExport('csv')}
              className="w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity"
              style={{ color: colors.text }}
            >
              CSV 格式
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity"
              style={{ color: colors.text }}
            >
              JSON 格式
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ExportButton;
