'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { getActiveAlerts, acknowledgeAlert, getSystemHealth, type Alert, type HealthSummary } from '@/lib/api/logs';

interface AlertBannerProps {
  /** 是否显示健康状态摘要 */
  showHealth?: boolean;
  /** 刷新间隔 (毫秒) */
  refreshInterval?: number;
}

/**
 * 告警横幅组件 - 显示活跃告警和系统健康状态
 */
export function AlertBanner({ showHealth = true, refreshInterval = 30000 }: AlertBannerProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取数据
  const fetchData = useCallback(async () => {
    try {
      const [alertsData, healthData] = await Promise.all([
        getActiveAlerts(),
        showHealth ? getSystemHealth() : Promise.resolve(null),
      ]);
      setAlerts(alertsData.alerts);
      setHealth(healthData);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showHealth]);

  // 确认告警
  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  // 初始化和定时刷新
  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, refreshInterval);
    return () => clearInterval(timer);
  }, [fetchData, refreshInterval]);

  if (loading) return null;
  if (error) return null; // 静默失败
  if (alerts.length === 0 && (!health || health.status === 'healthy')) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return colors.red;
      case 'warning': return colors.orange;
      default: return colors.blue;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return colors.red;
      case 'warning': return colors.orange;
      default: return colors.green;
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {/* 健康状态摘要 */}
      {showHealth && health && health.status !== 'healthy' && (
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-lg"
          style={{
            backgroundColor: `${getStatusColor(health.status)}15`,
            border: `1px solid ${getStatusColor(health.status)}40`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: getStatusColor(health.status) }}
          />
          <span style={{ color: getStatusColor(health.status) }} className="font-medium text-sm">
            系统状态: {health.status === 'critical' ? '严重' : '警告'}
          </span>
          <span style={{ color: colors.textSecondary }} className="text-xs">
            错误率 {health.metrics.errorRate}% | {health.metrics.criticalErrors} 个严重错误 | {health.activeAlerts} 个活跃告警
          </span>
        </div>
      )}

      {/* 告警列表 */}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg"
          style={{
            backgroundColor: `${getSeverityColor(alert.severity)}10`,
            border: `1px solid ${getSeverityColor(alert.severity)}30`,
          }}
        >
          <div className="flex items-center gap-3">
            {/* 严重度指示器 */}
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getSeverityColor(alert.severity) }}
            />
            
            {/* 告警内容 */}
            <div>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `${getSeverityColor(alert.severity)}20`,
                  color: getSeverityColor(alert.severity),
                }}
              >
                {alert.severity === 'critical' ? '严重' : alert.severity === 'warning' ? '警告' : '信息'}
              </span>
              <span className="ml-2 text-sm" style={{ color: colors.text }}>
                {alert.message}
              </span>
            </div>
          </div>

          {/* 确认按钮 */}
          <button
            onClick={() => handleAcknowledge(alert.id)}
            className="text-xs px-3 py-1 rounded transition-colors hover:opacity-80"
            style={{
              backgroundColor: colors.bgTertiary,
              color: colors.textSecondary,
            }}
          >
            确认
          </button>
        </div>
      ))}
    </div>
  );
}

export default AlertBanner;
