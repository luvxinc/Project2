'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';

// ================================
// Types
// ================================

export type LogType = 'error' | 'audit' | 'business' | 'access';

export interface LogDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  logType: LogType;
  data: Record<string, unknown> | null;
}

// ================================
// 字段显示配置
// ================================

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'code' | 'json' | 'badge' | 'datetime' | 'duration' | 'status';
  group: 'basic' | 'request' | 'user' | 'system' | 'business' | 'detail';
  fullWidth?: boolean;
  badgeColors?: Record<string, string>;
}

// 严重程度颜色
const severityColors: Record<string, string> = {
  CRITICAL: '#ff3b30',
  HIGH: '#ff9f0a',
  MEDIUM: '#ffcc00',
  LOW: '#30d158',
};

// 风险等级颜色
const riskColors: Record<string, string> = {
  CRITICAL: '#ff3b30',
  HIGH: '#ff9f0a',
  MEDIUM: '#ffcc00',
  LOW: '#30d158',
};

// 结果颜色
const resultColors: Record<string, string> = {
  SUCCESS: '#30d158',
  DENIED: '#ff9f0a',
  FAILED: '#ff3b30',
};

// 状态颜色
const statusColors: Record<string, string> = {
  SUCCESS: '#30d158',
  FAILED: '#ff3b30',
  PENDING: '#ffcc00',
};

// ================================
// 各日志类型的字段配置
// ================================

const errorLogFields: FieldConfig[] = [
  { key: 'traceId', label: 'Trace ID', type: 'code', group: 'basic' },
  { key: 'createdAt', label: '时间', type: 'datetime', group: 'basic' },
  { key: 'severity', label: '严重程度', type: 'badge', group: 'basic', badgeColors: severityColors },
  { key: 'category', label: '分类', type: 'badge', group: 'basic' },
  { key: 'occurrences', label: '出现次数', type: 'text', group: 'basic' },
  { key: 'isResolved', label: '状态', type: 'status', group: 'basic' },
  { key: 'errorType', label: '错误类型', type: 'text', group: 'detail' },
  { key: 'errorCode', label: '错误代码', type: 'code', group: 'detail' },
  { key: 'errorMessage', label: '错误消息', type: 'text', group: 'detail', fullWidth: true },
  { key: 'rootCause', label: '根因', type: 'text', group: 'detail', fullWidth: true },
  { key: 'stackTrace', label: '调用堆栈', type: 'code', group: 'detail', fullWidth: true },
  { key: 'requestMethod', label: '请求方法', type: 'badge', group: 'request' },
  { key: 'requestPath', label: '请求路径', type: 'code', group: 'request' },
  { key: 'requestQuery', label: '查询参数', type: 'json', group: 'request', fullWidth: true },
  { key: 'requestBody', label: '请求体', type: 'json', group: 'request', fullWidth: true },
  { key: 'userId', label: '用户 ID', type: 'code', group: 'user' },
  { key: 'username', label: '用户名', type: 'text', group: 'user' },
  { key: 'ipAddress', label: 'IP 地址', type: 'code', group: 'user' },
  { key: 'userAgent', label: 'User Agent', type: 'text', group: 'user', fullWidth: true },
  { key: 'module', label: '模块', type: 'text', group: 'business' },
  { key: 'operation', label: '操作', type: 'text', group: 'business' },
  { key: 'entityType', label: '实体类型', type: 'text', group: 'business' },
  { key: 'entityId', label: '实体 ID', type: 'code', group: 'business' },
];

const auditLogFields: FieldConfig[] = [
  { key: 'traceId', label: 'Trace ID', type: 'code', group: 'basic' },
  { key: 'createdAt', label: '时间', type: 'datetime', group: 'basic' },
  { key: 'result', label: '结果', type: 'badge', group: 'basic', badgeColors: resultColors },
  { key: 'riskLevel', label: '风险等级', type: 'badge', group: 'basic', badgeColors: riskColors },
  { key: 'module', label: '模块', type: 'text', group: 'business' },
  { key: 'action', label: '操作', type: 'badge', group: 'business' },
  { key: 'entityType', label: '实体类型', type: 'text', group: 'business' },
  { key: 'entityId', label: '实体 ID', type: 'code', group: 'business' },
  { key: 'oldValue', label: '修改前', type: 'json', group: 'detail', fullWidth: true },
  { key: 'newValue', label: '修改后', type: 'json', group: 'detail', fullWidth: true },
  { key: 'details', label: '详情', type: 'json', group: 'detail', fullWidth: true },
  { key: 'userId', label: '用户 ID', type: 'code', group: 'user' },
  { key: 'username', label: '用户名', type: 'text', group: 'user' },
  { key: 'ipAddress', label: 'IP 地址', type: 'code', group: 'user' },
  { key: 'userAgent', label: 'User Agent', type: 'text', group: 'user', fullWidth: true },
];

const businessLogFields: FieldConfig[] = [
  { key: 'traceId', label: 'Trace ID', type: 'code', group: 'basic' },
  { key: 'createdAt', label: '时间', type: 'datetime', group: 'basic' },
  { key: 'status', label: '状态', type: 'badge', group: 'basic', badgeColors: statusColors },
  { key: 'module', label: '模块', type: 'text', group: 'business' },
  { key: 'action', label: '操作', type: 'badge', group: 'business' },
  { key: 'summary', label: '摘要', type: 'text', group: 'business', fullWidth: true },
  { key: 'entityType', label: '实体类型', type: 'text', group: 'business' },
  { key: 'entityId', label: '实体 ID', type: 'code', group: 'business' },
  { key: 'details', label: '详情', type: 'json', group: 'detail', fullWidth: true },
  { key: 'username', label: '用户名', type: 'text', group: 'user' },
  { key: 'ipAddress', label: 'IP 地址', type: 'code', group: 'user' },
];

const accessLogFields: FieldConfig[] = [
  { key: 'traceId', label: 'Trace ID', type: 'code', group: 'basic' },
  { key: 'createdAt', label: '时间', type: 'datetime', group: 'basic' },
  { key: 'statusCode', label: '状态码', type: 'badge', group: 'basic' },
  { key: 'responseTime', label: '响应时间', type: 'duration', group: 'basic' },
  { key: 'method', label: '请求方法', type: 'badge', group: 'request' },
  { key: 'path', label: '请求路径', type: 'code', group: 'request' },
  { key: 'queryParams', label: '查询参数', type: 'code', group: 'request', fullWidth: true },
  { key: 'responseSize', label: '响应大小', type: 'text', group: 'request' },
  { key: 'username', label: '用户名', type: 'text', group: 'user' },
  { key: 'ipAddress', label: 'IP 地址', type: 'code', group: 'user' },
  { key: 'userAgent', label: 'User Agent', type: 'text', group: 'user', fullWidth: true },
];

const fieldConfigs: Record<LogType, FieldConfig[]> = {
  error: errorLogFields,
  audit: auditLogFields,
  business: businessLogFields,
  access: accessLogFields,
};

// ================================
// 复制按钮组件
// ================================

function CopyButton({ text, colors }: { text: string; colors: typeof themeColors.light }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-opacity-80 transition-all"
      style={{ backgroundColor: colors.bgSecondary }}
      title="复制"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" style={{ color: colors.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

// ================================
// LogDetailModal Component
// ================================

export default function LogDetailModal({ isOpen, onClose, logType, data }: LogDetailModalProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('logs');
  
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // 动画控制
  useEffect(() => {
    if (isOpen) {
      const showTimer = setTimeout(() => {
        setIsVisible(true);
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      }, 0);
      return () => clearTimeout(showTimer);
    } else {
      const hideAnimTimer = setTimeout(() => setIsAnimating(false), 0);
      const hideTimer = setTimeout(() => setIsVisible(false), 300);
      return () => {
        clearTimeout(hideAnimTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isOpen]);
  
  // ESC 键关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);
  
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
  
  if (!isVisible || !data) return null;
  
  const fields = fieldConfigs[logType];
  
  // 按分组组织字段
  const groups: Record<string, FieldConfig[]> = {};
  fields.forEach(field => {
    if (!groups[field.group]) groups[field.group] = [];
    groups[field.group].push(field);
  });
  
  // 分组标题使用 i18n
  const getGroupLabel = (groupKey: string) => {
    return t(`detail.groups.${groupKey}`);
  };
  
  // 字段标签使用 i18n
  const getFieldLabel = (fieldKey: string) => {
    return t(`detail.fields.${fieldKey}`);
  };
  
  // Modal 标题使用 i18n
  const getTitleLabel = (): string => {
    const key = `detail.title.${logType}` as const;
    return String(t(key));
  };

  // 获取分组数据用于复制
  const getGroupData = (groupFields: FieldConfig[]) => {
    const result: Record<string, unknown> = {};
    groupFields.forEach(f => {
      if (data[f.key] !== null && data[f.key] !== undefined && data[f.key] !== '') {
        result[f.key] = data[f.key];
      }
    });
    return JSON.stringify(result, null, 2);
  };
  
  // 渲染字段值
  const renderValue = (field: FieldConfig, value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return <span style={{ color: colors.textTertiary }}>—</span>;
    }
    
    switch (field.type) {
      case 'datetime':
        return <span>{new Date(value as string).toLocaleString('zh-CN', { 
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}</span>;
      
      case 'duration':
        return <span>{String(value)}ms</span>;
      
      case 'code':
        return (
          <code 
            className="px-1.5 py-0.5 rounded text-[11px] font-mono break-all inline-block max-w-full"
            style={{ 
              backgroundColor: colors.bgTertiary, 
              color: colors.blue,
              wordBreak: 'break-all',
              overflowWrap: 'anywhere',
            }}
          >
            {String(value)}
          </code>
        );
      
      case 'json':
        const jsonStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return (
          <pre 
            className="px-2 py-1.5 rounded text-[10px] font-mono overflow-x-auto max-h-[150px] overflow-y-auto whitespace-pre-wrap break-all"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {jsonStr}
          </pre>
        );
      
      case 'badge':
        const strValue = String(value);
        const badgeColor = field.badgeColors?.[strValue] || colors.blue;
        const statusCode = Number(value);
        let computedBadgeColor = badgeColor;
        if (!isNaN(statusCode) && statusCode >= 100) {
          if (statusCode >= 500) computedBadgeColor = '#ff3b30';
          else if (statusCode >= 400) computedBadgeColor = '#ff9f0a';
          else if (statusCode >= 300) computedBadgeColor = '#ffcc00';
          else computedBadgeColor = '#30d158';
        }
        const methodColors: Record<string, string> = {
          GET: '#30d158', POST: '#0071e3', PUT: '#ff9f0a', PATCH: '#ffcc00', DELETE: '#ff3b30',
        };
        if (methodColors[strValue]) computedBadgeColor = methodColors[strValue];
        
        return (
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: `${computedBadgeColor}20`, color: computedBadgeColor }}
          >
            {strValue}
          </span>
        );
      
      case 'status':
        const isResolved = Boolean(value);
        return (
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
            style={{ 
              backgroundColor: isResolved ? '#30d15820' : '#ff3b3020',
              color: isResolved ? '#30d158' : '#ff3b30',
            }}
          >
            {isResolved ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
              </svg>
            )}
            {isResolved ? '已解决' : '待处理'}
          </span>
        );
      
      default:
        return (
          <span 
            className="break-words"
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {String(value)}
          </span>
        );
    }
  };
  
  // 使用 Portal 渲染到 body 层级，解决 z-index 穿透问题
  if (typeof document === 'undefined') return null;
  
  // 预先计算标题，避免 JSX 中的类型问题
  const titleLabel: React.ReactNode = getTitleLabel();
  
  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{
        zIndex: 99999,
        backgroundColor: isAnimating ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
        backdropFilter: isAnimating ? 'blur(8px)' : 'blur(0px)',
        WebkitBackdropFilter: isAnimating ? 'blur(8px)' : 'blur(0px)',
        transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
        isolation: 'isolate',
      }}
      onClick={onClose}
    >
      {/* Modal Content - 强制固定尺寸 */}
      <div 
        className="overflow-hidden rounded-xl flex flex-col"
        style={{ 
          position: 'relative',
          zIndex: 10000,
          width: '1380px',
          maxWidth: '1380px',
          minWidth: '1380px',
          height: '1040px',
          maxHeight: '90vh',
          backgroundColor: colors.bgSecondary,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
          opacity: isAnimating ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header - macOS 风格 */}
        <div 
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: colors.text }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {logType === 'error' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              )}
              {logType === 'audit' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              )}
              {logType === 'business' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              )}
              {logType === 'access' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              )}
            </svg>
            <h2 style={{ color: colors.text }} className="text-[14px] font-semibold">
              {titleLabel}
            </h2>
            {Boolean(data.traceId) && (
              <span 
                style={{ color: colors.textTertiary }} 
                className="text-[11px] font-mono truncate max-w-[180px]"
              >
                {String(data.traceId as string).substring(0, 20)}...
              </span>
            )}
          </div>
          
          {/* 关闭按钮 */}
          <button 
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ backgroundColor: colors.bgTertiary }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path 
                d="M1 1L9 9M9 1L1 9" 
                stroke={colors.textSecondary} 
                strokeWidth="1.5" 
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        
        {/* Body - 可滚动，使用 scrollbar-gutter 保证宽度一致 */}
        <div 
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{ scrollbarGutter: 'stable' }}
        >
          {Object.entries(groups).map(([groupKey, groupFields]) => {
            const hasValues = groupFields.some(f => {
              const val = data[f.key];
              return val !== null && val !== undefined && val !== '';
            });
            if (!hasValues) return null;
            
            return (
              <div key={groupKey} className="mb-4 group">
                {/* 分组标题带复制按钮 */}
                <div className="flex items-center justify-between mb-2">
                  <h3 
                    style={{ color: colors.textSecondary }} 
                    className="text-[10px] font-medium uppercase tracking-wider"
                  >
                    {getGroupLabel(groupKey)}
                  </h3>
                  <CopyButton text={getGroupData(groupFields)} colors={colors} />
                </div>
                
                <div 
                  className="rounded-lg p-3 overflow-hidden"
                  style={{ backgroundColor: colors.bgTertiary }}
                >
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 min-w-0">
                    {groupFields.map(field => {
                      const value = data[field.key];
                      if (value === null || value === undefined || value === '') return null;
                      
                      return (
                        <div 
                          key={field.key} 
                          className={`min-w-0 overflow-hidden ${field.fullWidth ? 'col-span-2' : ''}`}
                        >
                          <div 
                            style={{ color: colors.textTertiary }} 
                            className="text-[10px] mb-1"
                          >
                            {getFieldLabel(field.key)}
                          </div>
                          <div style={{ color: colors.text }} className="text-[12px] break-words overflow-hidden">
                            {renderValue(field, value)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Footer */}
        <div 
          className="flex items-center justify-between px-5 py-2.5 shrink-0"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: colors.textTertiary }} className="text-[11px]">
              ESC
            </span>
            <span style={{ color: colors.textTertiary }} className="text-[11px]">
              {t('detail.close')}
            </span>
          </div>
          
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ backgroundColor: colors.blue, color: '#fff' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
