/**
 * 日志系统 API 客户端
 * 企业级功能: 自动刷新、导出、告警查询
 */
import { getApiBaseUrlCached } from '@/lib/api-url';

const API_BASE = getApiBaseUrlCached();

// ================================
// Types
// ================================

export interface LogQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  severity?: string;
  category?: string;
  isResolved?: boolean;
  module?: string;
  action?: string;
  riskLevel?: string;
  statusCode?: number;
  method?: string;
  devMode?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Normalize V3 paginated response → frontend PaginatedResponse.
 * V3 returns: { data: T[], meta: { page, size, total, totalPages } }
 * Frontend expects: { items: T[], total, page, pageSize, totalPages }
 */
function normalizePagedResponse<T>(raw: Record<string, unknown>): PaginatedResponse<T> {
  // V3 format: { data: [...], meta: { page, size, total, totalPages } }
  if (raw.data && raw.meta && typeof raw.meta === 'object') {
    const meta = raw.meta as Record<string, unknown>;
    return {
      items: (raw.data as T[]) || [],
      total: Number(meta.total ?? 0),
      page: Number(meta.page ?? 1),
      pageSize: Number(meta.size ?? meta.pageSize ?? 20),
      totalPages: Number(meta.totalPages ?? 1),
    };
  }
  // V2 / already-normalized format: { items: [...], total, page, ... }
  if (raw.items) {
    return raw as unknown as PaginatedResponse<T>;
  }
  // Fallback: data exists but no meta (ApiResponse<List<T>>)
  if (Array.isArray(raw.data)) {
    return {
      items: raw.data as T[],
      total: (raw.data as T[]).length,
      page: 1,
      pageSize: (raw.data as T[]).length,
      totalPages: 1,
    };
  }
  // Last resort: return empty
  return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
}

/**
 * Unwrap V3 ApiResponse wrapper.
 * V3 returns: { success: true, data: T }
 * Frontend expects: T
 */
function unwrapApiResponse<T>(raw: Record<string, unknown>): T {
  // V3 ApiResponse: { success: true, data: <actual> }
  if ('success' in raw && 'data' in raw) {
    return raw.data as T;
  }
  // Already unwrapped or V2 format
  return raw as unknown as T;
}

export interface LogStats {
  error: {
    total: number;
    unresolved: number;
    today: number;
    last7Days: number;
    critical: number;
    trend: { date: string; count: number }[];
  };
  audit: {
    total: number;
    today: number;
  };
  business: {
    total: number;
  };
  access: {
    total: number;
    today: number;
  };
}

// 日志记录类型
export interface ErrorLog {
  id: string;
  createdAt: string;
  traceId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  errorType: string;
  errorMessage: string;
  module?: string;
  requestPath?: string;
  username?: string;
  ipAddress?: string;
  isResolved: boolean;
  occurrences: number;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  traceId: string;
  username: string;
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ipAddress?: string;
}

export interface BusinessLog {
  id: string;
  createdAt: string;
  traceId: string;
  username: string;
  module: string;
  action: string;
  summary?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
}

export interface AccessLog {
  id: string;
  createdAt: string;
  traceId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface MaintenanceStats {
  devMode: boolean;
  environment: string;
  devLogs: {
    error: number;
    audit: number;
    business: number;
    access: number;
    total: number;
  };
  prodLogs: {
    error: number;
    audit: number;
    business: number;
    access: number;
    total: number;
  };
  summary: {
    canClearDevLogs: boolean;
    totalLogs: number;
  };
}

export interface Alert {
  id: string;
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

export interface HealthSummary {
  status: 'healthy' | 'warning' | 'critical';
  metrics: {
    errorRate: string;
    criticalErrors: number;
    avgLatency: number;
    requestsPerMinute: number;
  };
  activeAlerts: number;
  lastChecked: string;
}

export interface GodModeStatus {
  godMode: boolean;
  expiresAt?: string;
  remainingSeconds?: number;
  devMode: boolean;
}

export interface GodModeUnlockResult {
  success: boolean;
  message: string;
  expiresAt?: string;
  remainingSeconds?: number;
}

// ================================
// Auth Helper
// ================================

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('accessToken') 
    : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ================================
// API Functions
// ================================

/**
 * 获取概览统计
 */
export async function getLogOverview(): Promise<LogStats> {
  const res = await fetch(`${API_BASE}/logs/overview`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch overview');
  const raw = await res.json();
  return unwrapApiResponse<LogStats>(raw);
}

/**
 * 获取系统健康状态
 */
export async function getSystemHealth(): Promise<HealthSummary> {
  const res = await fetch(`${API_BASE}/logs/health`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch health');
  const raw = await res.json();
  return unwrapApiResponse<HealthSummary>(raw);
}

/**
 * 获取活跃告警
 */
export async function getActiveAlerts(): Promise<{ alerts: Alert[]; rules: unknown[] }> {
  const res = await fetch(`${API_BASE}/logs/alerts`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  const raw = await res.json();
  // V3 returns PagedResponse: { data: [...], meta: {...} }
  // Frontend expects: { alerts: [...], rules: [] }
  const unwrapped = unwrapApiResponse<Record<string, unknown>>(raw);
  if (Array.isArray(unwrapped.data)) {
    return { alerts: unwrapped.data as Alert[], rules: [] };
  }
  if (Array.isArray((unwrapped as Record<string, unknown>).alerts)) {
    return unwrapped as unknown as { alerts: Alert[]; rules: unknown[] };
  }
  return { alerts: [], rules: [] };
}

/**
 * 确认告警
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/logs/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to acknowledge alert');
}

// ================================
// God Mode
// ================================

/**
 * 获取 God Mode 状态
 */
export async function getGodModeStatus(): Promise<GodModeStatus> {
  const res = await fetch(`${API_BASE}/logs/godmode/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch god mode status');
  const raw = await res.json();
  return unwrapApiResponse<GodModeStatus>(raw);
}

/**
 * 解锁 God Mode
 */
export async function unlockGodMode(securityCode: string): Promise<GodModeUnlockResult> {
  const res = await fetch(`${API_BASE}/logs/godmode/unlock`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ securityCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to unlock god mode');
  }
  return data;
}

/**
 * 锁定 God Mode
 */
export async function lockGodMode(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/logs/godmode/lock`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to lock god mode');
  return res.json();
}

/**
 * 获取错误日志
 */
export async function getErrors(params: LogQueryParams = {}): Promise<PaginatedResponse<ErrorLog>> {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const res = await fetch(`${API_BASE}/logs/errors?${queryString}`, {
    headers: getAuthHeaders(),
  });
  const raw = await res.json();
  return normalizePagedResponse<ErrorLog>(raw);
}

/**
 * 解决错误
 */
export async function resolveError(id: string, resolvedBy: string): Promise<void> {
  const res = await fetch(`${API_BASE}/logs/errors/${id}/resolve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ resolvedBy }),
  });
  if (!res.ok) throw new Error('Failed to resolve error');
}

/**
 * 获取审计日志
 */
export async function getAudits(params: LogQueryParams = {}): Promise<PaginatedResponse<AuditLog>> {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const res = await fetch(`${API_BASE}/logs/audits?${queryString}`, {
    headers: getAuthHeaders(),
  });
  const raw = await res.json();
  return normalizePagedResponse<AuditLog>(raw);
}

/**
 * 获取业务日志
 */
export async function getBusiness(params: LogQueryParams = {}): Promise<PaginatedResponse<BusinessLog>> {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const res = await fetch(`${API_BASE}/logs/business?${queryString}`, {
    headers: getAuthHeaders(),
  });
  const raw = await res.json();
  return normalizePagedResponse<BusinessLog>(raw);
}

/**
 * 获取访问日志
 */
export async function getAccess(params: LogQueryParams = {}): Promise<PaginatedResponse<AccessLog>> {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const res = await fetch(`${API_BASE}/logs/access?${queryString}`, {
    headers: getAuthHeaders(),
  });
  const raw = await res.json();
  return normalizePagedResponse<AccessLog>(raw);
}

/**
 * 导出日志
 */
export async function exportLogs(
  logType: 'error' | 'audit' | 'business' | 'access',
  format: 'json' | 'csv' = 'csv',
  params: LogQueryParams = {}
): Promise<void> {
  const queryString = new URLSearchParams({
    format,
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    ),
  }).toString();

  const res = await fetch(`${API_BASE}/logs/export?logType=${logType}&${queryString}`, {
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) throw new Error('Failed to export logs');
  
  // 下载文件
  const blob = await res.blob();
  const filename = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') 
    || `${logType}_logs.${format}`;
  
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * 获取维护统计 (需要 Superadmin)
 */
export async function getMaintenanceStats(): Promise<MaintenanceStats> {
  const res = await fetch(`${API_BASE}/logs/maintenance/stats`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (res.status === 403) throw new Error('FORBIDDEN');
    throw new Error('Failed to fetch maintenance stats');
  }
  const raw = await res.json();
  return unwrapApiResponse<MaintenanceStats>(raw);
}

/**
 * 清理开发日志 (需要 Superadmin + L4)
 */
export async function clearDevLogs(securityCode: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/logs/maintenance/clear-dev`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      action: 'CLEAR_DEV_LOGS',
      securityCode,
    }),
  });
  if (!res.ok) throw new Error('Failed to clear dev logs');
  const raw = await res.json();
  return unwrapApiResponse<unknown>(raw);
}

// ================================
// Archive
// ================================

export interface ArchiveStats {
  retentionPolicies: {
    error: number;
    audit: number;
    business: number;
    access: number;
  };
  pendingArchive: { logType: string; retentionDays: number; pendingCount: number }[];
  totalArchived: number;
  totalSize: number;
  totalBatches: number;
  archiveDir: string;
  recentArchives: {
    id: string;
    logType: string;
    recordCount: number;
    fileSize: number;
    status: string;
    createdAt: string;
  }[];
  lastChecked: string;
}

export interface ArchiveResult {
  success: boolean;
  archived: {
    error: number;
    business: number;
    access: number;
  };
  archivePath?: string;
  message: string;
  timestamp: string;
}

/**
 * 获取归档统计
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  const res = await fetch(`${API_BASE}/logs/archive/stats`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('FORBIDDEN');
    throw new Error('Failed to fetch archive stats');
  }
  const raw = await res.json();
  return unwrapApiResponse<ArchiveStats>(raw);
}

/**
 * 获取归档历史
 */
export async function getArchiveHistory(page = 1, pageSize = 20): Promise<{
  data: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const res = await fetch(`${API_BASE}/logs/archive/history?page=${page}&pageSize=${pageSize}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch archive history');
  const raw = await res.json();
  return unwrapApiResponse<{ data: unknown[]; page: number; pageSize: number; total: number; totalPages: number }>(raw);
}

/**
 * 执行归档 (需要 L4)
 */
export async function executeArchive(securityCode: string): Promise<ArchiveResult> {
  const res = await fetch(`${API_BASE}/logs/archive`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ securityCode }),
  });
  const raw = await res.json();
  const data = unwrapApiResponse<ArchiveResult>(raw);
  if (!res.ok) {
    throw new Error((data as unknown as Record<string, unknown>).message as string || 'Failed to execute archive');
  }
  return data;
}

// ================================
// API Object Export
// ================================

/**
 * 日志 API 集合
 */
export const logsApi = {
  getOverview: getLogOverview,
  getHealth: getSystemHealth,
  getErrors,
  getAudits,
  getBusiness,
  getAccess,
  resolveError,
  getActiveAlerts,
  acknowledgeAlert,
  exportLogs,
  getMaintenanceStats,
  clearDevLogs,
  // God Mode
  getGodModeStatus,
  unlockGodMode,
  lockGodMode,
  // Archive
  getArchiveStats,
  getArchiveHistory,
  executeArchive,
};
