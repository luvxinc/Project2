/**
 * VMA 共享 API 工具 — 消除前端页面间的代码重复
 *
 * - getAuthHeaders(): 统一的认证 header 构造
 * - VMA_API: 统一的 API base URL (dynamic, LAN-aware)
 */
import { getApiBaseUrl } from '@/lib/api-url';

// Dynamic: resolves based on browser hostname (LAN-aware)
// Note: This is evaluated at module load time. For SSR, falls back to env var.
export const VMA_API = getApiBaseUrl();

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  // Primary: localStorage (consistent with centralized api client)
  const token = localStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
