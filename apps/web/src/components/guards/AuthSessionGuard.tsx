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

  // Force logout with permission-revoked modal
  const forceLogoutWithModal = useCallback((reason: string) => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    // Create modal overlay in DOM (works even if React state is stale)
    const overlay = document.createElement('div');
    overlay.id = 'permission-revoked-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(8px);
    `;

    const reasonText = reason === 'ROLE_CHANGED'
      ? (document.documentElement.lang === 'zh' ? '您的角色已被管理员变更' : 'Your role has been changed by an administrator')
      : reason === 'ROLE_BOUNDARY_CHANGED'
        ? (document.documentElement.lang === 'zh' ? '您的职能边界已被管理员调整' : 'Your role boundaries have been updated by an administrator')
        : (document.documentElement.lang === 'zh' ? '您的板块权限已被管理员修改' : 'Your module permissions have been updated by an administrator');

    const titleText = document.documentElement.lang === 'zh' ? '权限已变更' : 'Permissions Changed';
    const subtitleText = document.documentElement.lang === 'zh' ? '请重新登录以加载最新权限配置。' : 'Please re-login to load the latest permission configuration.';
    const btnText = document.documentElement.lang === 'zh' ? '重新登录' : 'Re-Login';

    overlay.innerHTML = `
      <div style="
        background: #1c1c1e; border-radius: 16px; padding: 32px;
        max-width: 400px; width: 90%; text-align: center;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        animation: modalIn 0.3s ease;
      ">
        <div style="
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(255,159,10,0.15); margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
        ">
          <svg width="28" height="28" fill="none" stroke="#FF9F0A" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <h2 style="color: #fff; font-size: 20px; font-weight: 600; margin-bottom: 8px;">${titleText}</h2>
        <p style="color: #FF9F0A; font-size: 14px; margin-bottom: 6px; font-weight: 500;">${reasonText}</p>
        <p style="color: #98989D; font-size: 13px; margin-bottom: 24px;">${subtitleText}</p>
        <button id="revoke-confirm-btn" style="
          width: 100%; height: 44px; border: none; border-radius: 10px;
          background: #0A84FF; color: #fff; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: opacity 0.2s;
        ">${btnText}</button>
      </div>
      <style>
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        #revoke-confirm-btn:hover { opacity: 0.85; }
      </style>
    `;

    document.body.appendChild(overlay);

    document.getElementById('revoke-confirm-btn')?.addEventListener('click', () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      window.location.href = '/login';
    });
  }, []);

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
        // Check if this is a PERMISSION_REVOKED response (not a normal session expiry)
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          if (body?.error === 'PERMISSION_REVOKED') {
            forceLogoutWithModal(body.reason || 'PERMISSION_CHANGED');
            return response;
          }
        } catch {
          // Not JSON or parse error — fall through to normal 401 handling
        }

        // Normal 401 — try to refresh first
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
