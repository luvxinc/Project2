/**
 * Dynamic API URL Resolution — LAN + Public Domain aware
 *
 * Automatically resolves the backend API URL based on how the user accesses the frontend:
 *
 * Public (Cloudflare Tunnel):
 * - erp.topmorrow.com  →  https://api.topmorrow.com/api/v1
 *
 * Local / LAN:
 * - localhost:3000          →  http://localhost:8080/api/v1
 * - 192.168.x.x:3000       →  http://192.168.x.x:8080/api/v1
 *
 * This eliminates the need to hardcode LAN IPs in .env.local.
 * The env var NEXT_PUBLIC_API_URL is used as fallback for SSR (server-side rendering)
 * where window is not available.
 */

const BACKEND_PORT = '8080';
const PUBLIC_API_URL = 'https://api.topmorrowusa.com/api/v1';

/**
 * Check if a hostname is a local/LAN address
 */
function isLocalNetwork(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.')
  );
}

/**
 * Get the API base URL dynamically.
 * Browser: derives from window.location.hostname
 * Server (SSR): falls back to env var or localhost
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Public domain → use dedicated API subdomain via HTTPS
    if (!isLocalNetwork(hostname)) {
      return PUBLIC_API_URL;
    }

    // Local/LAN → derive from browser hostname
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
