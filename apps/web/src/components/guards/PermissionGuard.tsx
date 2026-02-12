'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

/**
 * 路由 → 权限前缀映射
 * 根据当前 URL 路径判断需要哪个模块的权限
 */
const ROUTE_TO_PERMISSION: Record<string, string> = {
  '/products': 'module.products',
  '/vma':      'module.vma',
  '/users':    'module.user_admin',
  '/logs':     'module.audit',
  // 后续迁移完成后继续添加:
  // '/sales':     'module.sales',
  // '/purchase':  'module.purchase',
  // '/inventory': 'module.inventory',
  // '/finance':   'module.finance',
  // '/db-admin':  'module.db_admin',
};

/**
 * 🔒 权限路由守卫
 * 
 * 放在 (dashboard)/layout.tsx 中，包裹 children。
 * 每次路由变化时检查当前用户是否有权访问该路径。
 * 
 * 检查逻辑:
 * 1. /dashboard 永远允许 (首页)
 * 2. superuser / admin 永远允许
 * 3. 匹配 ROUTE_TO_PERMISSION 前缀 → 检查用户 permissions
 * 4. 无权限 → 显示无权限提示页 + 自动跳转
 */
export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    // Dashboard 首页永远允许
    if (pathname === '/dashboard') {
      setStatus('allowed');
      return;
    }

    try {
      const stored = localStorage.getItem('user');
      if (!stored) {
        setStatus('allowed'); // middleware 会处理未登录
        return;
      }

      const user = JSON.parse(stored);
      const roles: string[] = user.roles || [];

      // superuser / admin 永远放行
      if (roles.includes('superuser') || roles.includes('admin')) {
        setStatus('allowed');
        return;
      }

      const permissions: Record<string, unknown> = user.permissions || {};

      // 找到匹配的权限前缀
      const matchedRoute = Object.keys(ROUTE_TO_PERMISSION).find(route =>
        pathname.startsWith(route)
      );

      if (!matchedRoute) {
        // 没有映射的路由 → 放行 (可能是公共页面或未配置的路由)
        setStatus('allowed');
        return;
      }

      const requiredPrefix = ROUTE_TO_PERMISSION[matchedRoute];
      const hasPermission = Object.keys(permissions).some(
        k => k.startsWith(requiredPrefix) && permissions[k] === true
      );

      if (hasPermission) {
        setStatus('allowed');
      } else {
        setStatus('denied');
        // 3 秒后自动跳转到 dashboard
        setTimeout(() => router.push('/dashboard'), 3000);
      }
    } catch {
      setStatus('allowed'); // 解析出错时放行，后端会兜底
    }
  }, [pathname, router]);

  if (status === 'checking') {
    return null; // 极短的检查时间，不需要 loading UI
  }

  if (status === 'denied') {
    return (
      <div 
        style={{ backgroundColor: colors.bg }} 
        className="min-h-screen flex items-center justify-center"
      >
        <div className="text-center max-w-md mx-auto px-6">
          {/* Lock Icon */}
          <div 
            style={{ backgroundColor: `${colors.red}15` }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <svg 
              className="w-10 h-10" 
              fill="none" 
              stroke={colors.red} 
              viewBox="0 0 24 24" 
              strokeWidth={1.5}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" 
              />
            </svg>
          </div>

          <h1 
            style={{ color: colors.text }} 
            className="text-[28px] font-semibold mb-3"
          >
            Access Denied
          </h1>
          <p 
            style={{ color: colors.textSecondary }} 
            className="text-[15px] mb-6"
          >
            You do not have permission to access this module. 
            Contact your administrator if you believe this is an error.
          </p>
          <p 
            style={{ color: colors.textTertiary }} 
            className="text-[13px] mb-8"
          >
            Redirecting to dashboard in 3 seconds...
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ backgroundColor: colors.blue }}
            className="text-white text-[14px] font-medium px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
