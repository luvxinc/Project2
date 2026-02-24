'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { getApiBaseUrlCached } from '@/lib/api-url';

const API_BASE = getApiBaseUrlCached();

interface GodModeStatus {
  godMode: boolean;
  expiresAt?: string;
  remainingSeconds?: number;
  devMode: boolean;
}

interface GodModePanelProps {
  /** 刷新间隔 (毫秒) */
  refreshInterval?: number;
  /** 状态变化回调 */
  onStatusChange?: (godMode: boolean) => void;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('accessToken') 
    : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * God Mode 控制面板
 * 允许用户解锁/锁定敏感信息查看权限
 */
export function GodModePanel({ refreshInterval = 10000, onStatusChange }: GodModePanelProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('logs');
  const tc = useTranslations('common');
  
  const [status, setStatus] = useState<GodModeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 获取状态
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/logs/godmode/status`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        onStatusChange?.(data.godMode);
      }
    } catch (err) {
      console.error('Failed to fetch god mode status:', err);
    }
  }, [onStatusChange]);

  // 解锁
  const handleUnlock = async () => {
    if (!securityCode.trim()) {
      setError(t('godMode.securityCodePlaceholder'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/logs/godmode/unlock`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ securityCode }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowUnlockModal(false);
        setSecurityCode('');
        await fetchStatus();
      } else {
        setError(data.message || t('godMode.unlockFailed'));
      }
    } catch {
      setError(tc('networkError'));
    } finally {
      setLoading(false);
    }
  };

  // 锁定
  const handleLock = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/logs/godmode/lock`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Failed to lock god mode:', err);
    } finally {
      setLoading(false);
    }
  };

  // 初始化和定时刷新
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(timer);
  }, [fetchStatus, refreshInterval]);

  // 格式化剩余时间
  const formatRemaining = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!status) return null;

  return (
    <>
      {/* God Mode 状态指示器 */}
      <div
        className="flex items-center gap-3 px-4 py-2 rounded-lg"
        style={{
          backgroundColor: status.godMode 
            ? `${colors.orange}15` 
            : colors.bgTertiary,
          border: `1px solid ${status.godMode ? colors.orange : colors.border}40`,
        }}
      >
        {/* 状态图标 */}
        <div
          className={`w-2 h-2 rounded-full ${status.godMode ? 'animate-pulse' : ''}`}
          style={{ 
            backgroundColor: status.godMode ? colors.orange : colors.textTertiary 
          }}
        />

        {/* 状态文本 */}
        <div className="flex-1">
          <span 
            className="text-sm font-medium"
            style={{ color: status.godMode ? colors.orange : colors.textSecondary }}
          >
            {status.godMode ? t('godMode.enabled') : t('godMode.disabled')}
          </span>
          {status.godMode && status.remainingSeconds && (
            <span 
              className="ml-2 text-xs"
              style={{ color: colors.textTertiary }}
            >
              {t('godMode.remaining')} {formatRemaining(status.remainingSeconds)}
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        {status.godMode ? (
          <button
            onClick={handleLock}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: colors.bgSecondary,
              color: colors.text,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t('godMode.lock')}
          </button>
        ) : (
          <button
            onClick={() => setShowUnlockModal(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: colors.orange,
              color: '#fff',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            {t('godMode.unlock')}
          </button>
        )}
      </div>

      {/* 解锁弹窗 */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 背景遮罩 */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowUnlockModal(false);
              setSecurityCode('');
              setError(null);
            }}
          />
          
          {/* 弹窗内容 */}
          <div
            className="relative z-10 w-full max-w-md p-6 rounded-xl shadow-2xl"
            style={{ backgroundColor: colors.bgSecondary }}
          >
            <h3 
              className="text-lg font-semibold mb-2"
              style={{ color: colors.text }}
            >
              {t('godMode.unlockTitle')}
            </h3>
            <p 
              className="text-sm mb-4"
              style={{ color: colors.textSecondary }}
            >
              {t('godMode.unlockDesc')}
            </p>

            {/* 安全码输入 */}
            <div className="mb-4">
              <label 
                className="block text-sm font-medium mb-1"
                style={{ color: colors.textSecondary }}
              >
                {t('godMode.securityCodeLabel')}
              </label>
              <input
                type="password"
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder={t('godMode.securityCodePlaceholder')}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  border: `1px solid ${error ? colors.red : colors.border}`,
                }}
                autoFocus
              />
              {error && (
                <p className="mt-1 text-xs" style={{ color: colors.red }}>
                  {error}
                </p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUnlockModal(false);
                  setSecurityCode('');
                  setError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.textSecondary,
                }}
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handleUnlock}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: colors.orange,
                  color: '#fff',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? t('godMode.verifying') : t('godMode.confirmUnlock')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default GodModePanel;
