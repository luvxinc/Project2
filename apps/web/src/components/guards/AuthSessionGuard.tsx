'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '@/lib/api-url';

/**
 * AuthSessionGuard — Sliding Session + 401 Auto-Redirect + Permission Sync
 *
 * Three mechanisms:
 *
 * 1. **Proactive Refresh (sliding window):**
 *    Decodes the JWT's `exp` claim and schedules a silent refresh
 *    ~2 minutes before expiry. Every successful API call that returns
 *    a new access token resets the timer. As long as the user is active,
 *    the session never expires.
 *
 * 2. **Reactive 401 Interception:**
 *    Wraps `fetch` to catch 401 responses. On 401, attempts one refresh.
 *    If refresh fails → clears tokens, redirects to /login.
 *
 * 3. **Permission Sync (60s polling):**
 *    Polls /auth/me every 60s. If roles/permissions differ from
 *    localStorage, updates localStorage and dispatches
 *    CustomEvent('mgmt:user-updated') so all components re-read.
 *    Pauses when tab is hidden, resumes + syncs on tab re-focus.
 */
export function AuthSessionGuard() {
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const redirectingRef = useRef(false);

  // Parse JWT exp without library
  const getTokenExp = useCallback((token: string): number | null => {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.exp ?? null;
    } catch {
      return null;
    }
  }, []);

  const getApiUrl = useCallback(() => {
    return getApiBaseUrl();
  }, []);

  // Force logout
  const forceLogout = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.href = '/login';
  }, []);

  // Sync permissions from /auth/me and dispatch event if changed
  const syncPermissions = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token || redirectingRef.current) return;

    try {
      const apiUrl = getApiUrl();
      const res = await window._originalFetch(`${apiUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) return;

      const json = await res.json();
      const freshUser = json.data;
      if (!freshUser) return;

      const stored = localStorage.getItem('user');
      if (!stored) return;

      try {
        const existing = JSON.parse(stored);
        const rolesChanged = JSON.stringify(existing.roles) !== JSON.stringify(freshUser.roles);
        const permsChanged = JSON.stringify(existing.permissions) !== JSON.stringify(freshUser.permissions);

        if (rolesChanged || permsChanged) {
          existing.roles = freshUser.roles;
          existing.permissions = freshUser.permissions;
          localStorage.setItem('user', JSON.stringify(existing));
          window.dispatchEvent(new CustomEvent('mgmt:user-updated'));
        }
      } catch {
        // ignore parse errors
      }
    } catch {
      // network error — skip this cycle
    }
  }, [getApiUrl]);

  // Silent refresh
  const doRefresh = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) return false;
    isRefreshingRef.current = true;

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      isRefreshingRef.current = false;
      return false;
    }

    try {
      const apiUrl = getApiUrl();
      const res = await window._originalFetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const json = await res.json();
        const newAccessToken = json.data?.accessToken;
        if (newAccessToken) {
          localStorage.setItem('accessToken', newAccessToken);
          scheduleRefresh(newAccessToken);
          isRefreshingRef.current = false;
          // Sync permissions after successful token refresh
          syncPermissions();
          return true;
        }
      }
    } catch {
      // Network error
    }

    isRefreshingRef.current = false;
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getApiUrl, syncPermissions]);

  // Schedule proactive refresh ~2 min before expiry
  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const exp = getTokenExp(token);
    if (!exp) return;

    const now = Math.floor(Date.now() / 1000);
    const refreshInSec = Math.max((exp - now) - 120, 10); // 2 min before expiry, min 10s

    refreshTimerRef.current = setTimeout(async () => {
      const ok = await doRefresh();
      if (!ok) forceLogout();
    }, refreshInSec * 1000);
  }, [getTokenExp, doRefresh, forceLogout]);

  useEffect(() => {
    // Store original fetch for internal use (bypasses our interceptor)
    if (!window._originalFetch) {
      window._originalFetch = window.fetch.bind(window);
    }

    const originalFetch: typeof fetch = window._originalFetch;

    // Schedule initial refresh based on current token
    const currentToken = localStorage.getItem('accessToken');
    if (currentToken) {
      scheduleRefresh(currentToken);
    }

    // --- Permission polling (60s) ---
    const POLL_INTERVAL = 60_000;

    // Start polling
    permPollRef.current = setInterval(syncPermissions, POLL_INTERVAL);

    // Pause/resume on visibility change + sync on re-focus
    const handleVisibility = () => {
      if (document.hidden) {
        // Tab hidden — pause polling
        if (permPollRef.current) {
          clearInterval(permPollRef.current);
          permPollRef.current = null;
        }
      } else {
        // Tab visible — sync immediately + resume polling
        syncPermissions();
        if (!permPollRef.current) {
          permPollRef.current = setInterval(syncPermissions, POLL_INTERVAL);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Wrap fetch to intercept 401
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(this, args);

      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const isApiCall = url.includes('/api/') || url.includes(':8080');
      const isRefreshCall = url.includes('/auth/refresh');

      if (response.status === 401 && isApiCall && !isRefreshCall && !redirectingRef.current) {
        // Try to refresh first
        const refreshed = await doRefresh();
        if (refreshed) {
          // Retry the original request with new token
          const newToken = localStorage.getItem('accessToken');
          if (newToken) {
            const [input, init] = args;
            const newInit = { ...(init || {}) };
            const headers = new Headers(newInit.headers || {});
            headers.set('Authorization', `Bearer ${newToken}`);
            newInit.headers = headers;
            return originalFetch(input, newInit);
          }
        }
        // Refresh failed → force logout
        forceLogout();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (permPollRef.current) clearInterval(permPollRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Type augmentation for _originalFetch
declare global {
  interface Window {
    _originalFetch: typeof fetch;
  }
}
