'use client';

import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

/**
 * Response from GET /auth/security-policies/action/{actionKey}
 */
interface ActionTokensResponse {
  actionKey: string;
  requiredTokens: string[];
  requiresSecurityCode: boolean;
}

/**
 * useSecurityAction — Dynamic security code enforcement hook.
 *
 * Checks the Security Policy Matrix (via backend) to determine if an action
 * actually requires a security code. If no tokens are configured for the
 * actionKey, the action executes directly without prompting the user.
 *
 * Usage:
 *   const security = useSecurityAction('btn_abnormal_delete');
 *
 *   // Trigger: user clicks "Delete"
 *   const handleDelete = () => security.trigger();
 *
 *   // In JSX — conditionally renders SecurityCodeDialog:
 *   <SecurityCodeDialog
 *     isOpen={security.isOpen}
 *     level={security.level}
 *     onConfirm={security.onConfirm}
 *     onCancel={security.onCancel}
 *     ...
 *   />
 *
 *   // The mutation:
 *   const deleteMutation = useMutation({
 *     mutationFn: (code: string) => myApi.delete(id, code),
 *     ...
 *   });
 *
 *   // Connect: security.onExecute fires with the code (or empty string if no code needed)
 */
export interface UseSecurityActionOptions {
  /** The actionKey from @SecurityLevel annotation */
  actionKey: string;
  /** The security level label for the dialog (default: 'L3') */
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  /** Called when security is cleared (with code, or empty string if no code needed) */
  onExecute: (securityCode: string) => void;
}

export interface UseSecurityActionReturn {
  /** Call this to start the security flow (check policy → show dialog OR execute directly) */
  trigger: () => void;
  /** Whether the SecurityCodeDialog should be shown */
  isOpen: boolean;
  /** Security level for the dialog */
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  /** Pass this to SecurityCodeDialog.onConfirm */
  onConfirm: (code: string) => void;
  /** Pass this to SecurityCodeDialog.onCancel */
  onCancel: () => void;
  /** Whether checking policy is in progress */
  isChecking: boolean;
  /** Error message for the dialog */
  error: string | undefined;
  /** Set error (for mutation failures) */
  setError: (err: string | undefined) => void;
}

// In-memory cache for action token lookups (avoid repeated API calls)
const actionTokenCache = new Map<string, { requiresCode: boolean; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

export function useSecurityAction({
  actionKey,
  level = 'L3',
  onExecute,
}: UseSecurityActionOptions): UseSecurityActionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Ref to hold the latest onExecute to avoid stale closures
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  const trigger = useCallback(async () => {
    setError(undefined);

    // Check cache first
    const cached = actionTokenCache.get(actionKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      if (cached.requiresCode) {
        setIsOpen(true);
      } else {
        // No security code needed — execute directly
        onExecuteRef.current('');
      }
      return;
    }

    // Query backend
    setIsChecking(true);
    try {
      const result = await api.get<ActionTokensResponse>(
        `/auth/security-policies/action/${encodeURIComponent(actionKey)}`
      );

      // Cache the result
      actionTokenCache.set(actionKey, {
        requiresCode: result.requiresSecurityCode,
        ts: Date.now(),
      });

      if (result.requiresSecurityCode) {
        setIsOpen(true);
      } else {
        // No security code needed — execute directly
        onExecuteRef.current('');
      }
    } catch {
      // If policy check fails, fall back to showing the dialog (safe default)
      setIsOpen(true);
    } finally {
      setIsChecking(false);
    }
  }, [actionKey]);

  const onConfirm = useCallback((code: string) => {
    onExecuteRef.current(code);
  }, []);

  const onCancel = useCallback(() => {
    setIsOpen(false);
    setError(undefined);
  }, []);

  return {
    trigger,
    isOpen,
    level,
    onConfirm,
    onCancel,
    isChecking,
    error,
    setError,
  };
}

/**
 * Invalidate the cache for an actionKey (call after saving security policy)
 */
export function invalidateSecurityActionCache(actionKey?: string) {
  if (actionKey) {
    actionTokenCache.delete(actionKey);
  } else {
    actionTokenCache.clear();
  }
}
