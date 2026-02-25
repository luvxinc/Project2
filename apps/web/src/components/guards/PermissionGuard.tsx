'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

const ROUTE_TO_PERMISSION: Record<string, string> = {
  '/sales':    'module.sales',
  '/purchase': 'module.purchase',
  '/inventory':'module.inventory',
  '/finance':  'module.finance',
  '/products': 'module.products',
  '/vma':      'module.vma',
  '/users':    'module.user_admin',
  '/logs':     'module.audit',
  '/backup':   'module.db_admin',
};

function evaluatePermission(pathname: string): 'allowed' | 'denied' {
  if (pathname === '/dashboard') return 'allowed';

  try {
    const stored = localStorage.getItem('user');
    if (!stored) return 'allowed';

    const user = JSON.parse(stored);
    const roles: string[] = user.roles || [];
    if (roles.includes('superuser') || roles.includes('admin')) return 'allowed';

    const permissions: Record<string, unknown> = user.permissions || {};
    const matchedRoute = Object.keys(ROUTE_TO_PERMISSION).find(route => pathname.startsWith(route));
    if (!matchedRoute) return 'allowed';

    const requiredPrefix = ROUTE_TO_PERMISSION[matchedRoute];
    const hasPermission = Object.keys(permissions).some(
      k => k.startsWith(requiredPrefix) && permissions[k] === true
    );

    return hasPermission ? 'allowed' : 'denied';
  } catch {
    return 'allowed';
  }
}

export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('auth');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [status, setStatus] = useState<'allowed' | 'denied'>(() => evaluatePermission(pathname));

  // Re-evaluate on pathname change
  useEffect(() => {
    setStatus(evaluatePermission(pathname));
  }, [pathname]);

  // Re-evaluate when permissions are synced globally
  useEffect(() => {
    const handleUserUpdated = () => {
      setStatus(evaluatePermission(pathname));
    };
    window.addEventListener('mgmt:user-updated', handleUserUpdated);
    return () => window.removeEventListener('mgmt:user-updated', handleUserUpdated);
  }, [pathname]);

  useEffect(() => {
    if (status !== 'denied') return;
    const timer = setTimeout(() => router.push('/dashboard'), 3000);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === 'denied') {
    return (
      <div
        style={{ backgroundColor: colors.bg }}
        className="min-h-screen flex items-center justify-center"
      >
        <div className="text-center max-w-md mx-auto px-6">
          <div
            style={{ backgroundColor: `${colors.red}15` }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <svg className="w-10 h-10" fill="none" stroke={colors.red} viewBox="0 0 24 24" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>

          <h1 style={{ color: colors.text }} className="text-[28px] font-semibold mb-3">{t('accessDenied.title')}</h1>
          <p style={{ color: colors.textSecondary }} className="text-[15px] mb-6">
            {t('accessDenied.message')}
          </p>
          <p style={{ color: colors.textTertiary }} className="text-[13px] mb-8">
            {t('accessDenied.redirect')}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ backgroundColor: colors.blue }}
            className="text-white text-[14px] font-medium px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity"
          >
            {t('accessDenied.goToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
