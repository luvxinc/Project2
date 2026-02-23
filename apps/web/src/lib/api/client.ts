/**
 * API Client 配置
 * 连接到 V3 Spring Boot 后端
 * 
 * 支持 silent token refresh：
 * - 401 时自动尝试 refresh token 续期
 * - 用户活跃期间永远不会被踢出（7天 refresh token 有效期内）
 */
import { getApiBaseUrlCached } from '@/lib/api-url';

// Dynamic: resolves based on browser hostname (LAN-aware)
const API_BASE_URL = getApiBaseUrlCached();

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

// Prevent multiple simultaneous refresh requests
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if refresh succeeded, false otherwise.
 */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok) {
      const data = await res.json();
      const newAccessToken = data.accessToken || data.data?.accessToken;
      const expiresIn = data.expiresIn || data.data?.expiresIn;
      if (newAccessToken) {
        localStorage.setItem('accessToken', newAccessToken);
        // Schedule next proactive refresh
        if (expiresIn) scheduleProactiveRefresh(expiresIn);
        return true;
      }
    }
  } catch {
    // Refresh failed — network error
  }
  return false;
}

/**
 * Force logout — clear all tokens and redirect to login.
 */
function forceLogout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  document.cookie = 'auth_session=; path=/; max-age=0';
  if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

/**
 * Schedule a proactive token refresh before the access token expires.
 * Refreshes 5 minutes before expiry (or at half-life for short-lived tokens).
 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(expiresInSec: number) {
  if (typeof window === 'undefined') return;
  if (refreshTimer) clearTimeout(refreshTimer);

  // Refresh 5 minutes before expiry (or half-life if < 10 min)
  const refreshInMs = Math.max(
    (expiresInSec - 300) * 1000,
    (expiresInSec / 2) * 1000,
    30_000 // minimum 30 seconds
  );

  refreshTimer = setTimeout(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await tryRefreshToken();
    }
  }, refreshInMs);
}

// On page load, schedule proactive refresh if we have tokens
if (typeof window !== 'undefined') {
  const hasToken = localStorage.getItem('accessToken');
  const hasRefresh = localStorage.getItem('refreshToken');
  if (hasToken && hasRefresh) {
    // On load, we don't know exact expiry — schedule a check in 30 min
    scheduleProactiveRefresh(1800);
  }
}

/**
 * 通用 API 请求函数
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // 获取存储的 token
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // 401 — try silent refresh before logging out
    if (response.status === 401 && typeof window !== 'undefined') {
      // Don't try to refresh the refresh endpoint itself
      if (!endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
        // Deduplicate concurrent refresh attempts
        if (!refreshPromise) {
          refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
        }
        const refreshed = await refreshPromise;

        if (refreshed) {
          // Retry the original request with the new token
          const newToken = localStorage.getItem('accessToken');
          if (newToken) {
            (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
          }
          const retryResponse = await fetch(url, { ...options, headers });
          if (retryResponse.ok) {
            if (retryResponse.status === 204) return {} as T;
            const json = await retryResponse.json();
            if (json && typeof json === 'object' && 'success' in json && 'data' in json && !('meta' in json)) {
              return json.data as T;
            }
            return json as T;
          }
          // Retry also failed — fall through to logout
        }

        // Refresh failed — force logout
        forceLogout();
      }
    }

    const error: ApiError = await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }));
    
    // Normalize: ProblemDetail uses "detail", Spring default uses "message"
    if (!error.message && (error as any).detail) {
      error.message = (error as any).detail;
    }
    
    throw error;
  }

  // 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const json = await response.json();

  // V3 ApiResponse unwrap: { success: true, data: T } → T
  if (json && typeof json === 'object' && 'success' in json && 'data' in json && !('meta' in json)) {
    return json.data as T;
  }

  return json as T;
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  
  post: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    }),
};

export default api;

