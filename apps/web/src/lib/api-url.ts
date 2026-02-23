/**
 * Dynamic API URL Resolution — LAN-aware
 *
 * Automatically resolves the backend API URL based on how the user accesses the frontend:
 * - localhost:3000  →  localhost:8080
 * - 192.168.86.29:3000  →  192.168.86.29:8080
 * - any-lan-ip:3000  →  any-lan-ip:8080
 *
 * This eliminates the need to hardcode LAN IPs in .env.local.
 * The env var NEXT_PUBLIC_API_URL is used as fallback for SSR (server-side rendering)
 * where window is not available.
 */

const BACKEND_PORT = '8080';

/**
 * Get the API base URL dynamically.
 * Browser: derives from window.location.hostname
 * Server (SSR): falls back to env var or localhost
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser-side: use the same hostname the user typed in their browser
    const hostname = window.location.hostname;
    return `http://${hostname}:${BACKEND_PORT}/api/v1`;
  }
  // Server-side (SSR): use env var fallback
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1`;
}

/**
 * Lazy-cached browser-side URL (avoids recalculating on every call)
 */
let _cachedUrl: string | null = null;

export function getApiBaseUrlCached(): string {
  if (_cachedUrl) return _cachedUrl;
  _cachedUrl = getApiBaseUrl();
  return _cachedUrl;
}
