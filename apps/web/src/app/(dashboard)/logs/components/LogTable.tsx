'use client';

import { useState } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { TableColumn, LogType, methodColors } from './tableColumns';
import LogDetailModal from './LogDetailModal';

// ================================
// Types
// ================================

interface LogTableProps {
  logType: LogType;
  columns: TableColumn[];
  data: Record<string, unknown>[];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
}

// ================================
// HTTP 状态码颜色
// ================================
function getStatusCodeColor(code: number): string {
  if (code >= 500) return '#ff3b30';
  if (code >= 400) return '#ff9f0a';
  if (code >= 300) return '#ffcc00';
  return '#30d158';
}

// ================================
// LogTable Component
// ================================

export default function LogTable({
  logType,
  columns,
  data,
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange,
  emptyMessage,
}: LogTableProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('logs');
  const tc = useTranslations('common');
  
  // LogType 到 i18n namespace 的映射（处理单复数差异）
  const logTypeI18nMap: Record<LogType, string> = {
    error: 'errors',
    audit: 'audits',
    business: 'business',
    access: 'access',
  };
  const i18nType = logTypeI18nMap[logType];
  
  const [selectedLog, setSelectedLog] = useState<Record<string, unknown> | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);


  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 渲染单元格
  const renderCell = (column: TableColumn, value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return <span style={{ color: colors.textTertiary }}>—</span>;
    }

    switch (column.type) {
      case 'datetime':
        return (
          <span style={{ color: colors.textSecondary }} className="text-[12px] font-mono">
            {formatDate(value as string)}
          </span>
        );

      case 'duration':
        return (
          <span style={{ color: colors.textSecondary }} className="text-[12px] font-mono">
            {String(value)}ms
          </span>
        );

      case 'truncate':
        return (
          <span 
            style={{ color: colors.text }} 
            className="text-[13px] block truncate max-w-full"
            title={String(value)}
          >
            {String(value)}
          </span>
        );

      case 'status':
        const isResolved = Boolean(value);
        return (
          <span 
            className="px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1"
            style={{ 
              backgroundColor: isResolved ? '#30d15820' : '#ff9f0a20',
              color: isResolved ? '#30d158' : '#ff9f0a',
            }}
          >
            {isResolved ? '✓' : '○'}
          </span>
        );

      case 'badge':
        const strValue = String(value);
        let badgeColor = column.badgeColors?.[strValue] || colors.blue;
        
        // HTTP 状态码特殊处理
        const statusCode = Number(value);
        if (!isNaN(statusCode) && statusCode >= 100 && statusCode < 600) {
          badgeColor = getStatusCodeColor(statusCode);
        }
        
        // HTTP 方法颜色
        if (methodColors[strValue]) {
          badgeColor = methodColors[strValue];
        }
        
        return (
          <span 
            className="px-2 py-1 rounded text-[11px] font-medium"
            style={{ 
              backgroundColor: `${badgeColor}20`,
              color: badgeColor,
            }}
          >
            {strValue}
          </span>
        );

      default:
        return (
          <span style={{ color: colors.text }} className="text-[13px]">
            {String(value)}
          </span>
        );
    }
  };

  return (
    <>
      <div 
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
      >
        {/* 始终显示表格和表头 */}
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              {columns.map((col) => (
                <th 
                  key={col.key}
                  style={{ color: colors.textTertiary }} 
                  className={`px-4 py-3 text-[11px] font-medium uppercase tracking-wider ${
                    col.align === 'center' ? 'text-center' : 
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.width || ''}`}
                >
                  {t(`${i18nType}.columns.${col.label}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Loading state
              <tr>
                <td colSpan={columns.length} className="text-center py-16">
                  <div className="flex items-center justify-center">
                    <div 
                      className="w-8 h-8 border-2 rounded-full animate-spin" 
                      style={{ 
                        borderLeftColor: colors.border, 
                        borderRightColor: colors.border, 
                        borderBottomColor: colors.border, 
                        borderTopColor: colors.blue 
                      }} 
                    />
                  </div>
                </td>
              </tr>
            ) : !data || data.length === 0 ? (
              // Empty state
              <tr>
                <td colSpan={columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ color: colors.textTertiary }} className="text-[14px]">
                      {emptyMessage || t('common.empty')}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              // Data rows
              data.map((row, idx) => {
                const rowId = (row.id as string) || String(idx);
                const isHovered = hoveredRow === rowId;
                
                return (
                  <tr 
                    key={rowId}
                    style={{ 
                      borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none',
                      backgroundColor: isHovered 
                        ? (theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                        : 'transparent',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    className="group"
                    onMouseEnter={() => setHoveredRow(rowId)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => setSelectedLog(row)}
                  >
                    {columns.map((col) => (
                      <td 
                        key={col.key}
                        className={`px-4 py-3 ${col.width || ''} ${
                          col.align === 'center' ? 'text-center' : 
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {renderCell(col, row[col.key])}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && data && data.length > 0 && totalPages > 1 && (
          <div 
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            <span style={{ color: colors.textTertiary }} className="text-[12px]">
              {t('common.page')} {page} / {totalPages}
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange?.(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                ← {tc('previous')}
              </button>
              <button
                onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {tc('next')} →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <LogDetailModal
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        logType={logType}
        data={selectedLog}
      />
    </>
  );
}
