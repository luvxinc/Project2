'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseAutoRefreshOptions<T> {
  /** 获取数据的函数 */
  fetcher: () => Promise<T>;
  /** 刷新间隔 (毫秒)，默认 30000ms = 30秒 */
  interval?: number;
  /** 是否启用自动刷新，默认 true */
  enabled?: boolean;
  /** 初始数据 */
  initialData?: T;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

interface UseAutoRefreshResult<T> {
  /** 当前数据 */
  data: T | undefined;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 最后更新时间 */
  lastUpdated: Date | null;
  /** 是否自动刷新已暂停 */
  isPaused: boolean;
  /** 手动刷新 */
  refresh: () => Promise<void>;
  /** 暂停自动刷新 */
  pause: () => void;
  /** 恢复自动刷新 */
  resume: () => void;
  /** 设置刷新间隔 */
  setInterval: (ms: number) => void;
}

/**
 * 自动刷新 Hook - 企业级日志监控
 * 
 * @example
 * ```tsx
 * const { data, loading, refresh, isPaused, pause, resume } = useAutoRefresh({
 *   fetcher: () => getErrors({ page: 1 }),
 *   interval: 10000, // 10秒刷新
 * });
 * ```
 */
export function useAutoRefresh<T>(options: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const { 
    fetcher, 
    interval: initialInterval = 30000, 
    enabled = true, 
    initialData,
    onError,
  } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [intervalMs, setIntervalMs] = useState(initialInterval);

  const fetcherRef = useRef(fetcher);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 保持 fetcher 引用最新
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  // 执行数据获取
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcherRef.current();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  // 手动刷新
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // 暂停自动刷新
  const pause = useCallback(() => {
    setIsPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 恢复自动刷新
  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  // 设置刷新间隔
  const setIntervalCallback = useCallback((ms: number) => {
    setIntervalMs(ms);
  }, []);

  // 初次加载 + 自动刷新定时器
  useEffect(() => {
    if (!enabled) return;

    // 初次加载
    fetchData();

    // 设置定时器
    if (!isPaused && intervalMs > 0) {
      timerRef.current = setInterval(fetchData, intervalMs);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isPaused, intervalMs, fetchData]);

  // 页面可见性变化时暂停/恢复
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pause();
      } else {
        resume();
        refresh(); // 页面重新可见时立即刷新
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pause, resume, refresh]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isPaused,
    refresh,
    pause,
    resume,
    setInterval: setIntervalCallback,
  };
}

/**
 * 预设刷新间隔
 */
export const RefreshIntervals = {
  REALTIME: 5000,    // 5秒 - 实时监控
  FAST: 10000,       // 10秒 - 快速刷新
  NORMAL: 30000,     // 30秒 - 正常模式
  SLOW: 60000,       // 1分钟 - 慢速模式
  BACKGROUND: 300000, // 5分钟 - 后台模式
} as const;

export default useAutoRefresh;
