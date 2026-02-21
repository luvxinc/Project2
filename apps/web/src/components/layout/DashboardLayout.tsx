'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

const navItems = [
  { key: 'users', href: '/users' },
  { key: 'products', href: '/products' },
  { key: 'inventory', href: '/inventory', disabled: true },
  { key: 'purchase', href: '/purchase' },
];

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
    window.dispatchEvent(new Event('sidebar-collapsed-change'));
  };

  return (
    <>
      <button
        onClick={toggleSidebar}
        style={{ color: colors.textTertiary }}
        className={`fixed top-[14px] z-50 hover:opacity-70 transition-colors ${
          collapsed ? 'left-4' : 'left-[216px]'
        }`}
      >
        <svg className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      <aside
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className={`fixed left-0 top-0 h-full w-60 border-r flex flex-col z-40 transition-transform duration-200 ${
          collapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        <div style={{ borderColor: colors.border }} className="h-12 flex items-center px-5 border-b">
          <Link href="/" style={{ color: colors.text }} className="text-[17px] font-semibold">MGMT</Link>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            if (item.disabled) {
              return (
                <div
                  key={item.key}
                  style={{ color: colors.textTertiary }}
                  className="mx-2 px-3 py-2 text-[15px] cursor-not-allowed"
                >
                  {t(item.key)}
                </div>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  backgroundColor: isActive ? colors.blue : 'transparent',
                  color: isActive ? '#ffffff' : colors.textSecondary,
                }}
                className="block mx-2 px-3 py-2 rounded-md text-[15px] transition-colors hover:opacity-80"
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div style={{ borderColor: colors.border }} className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: colors.bgTertiary }} className="w-8 h-8 rounded-full flex items-center justify-center">
              <span style={{ color: colors.text }} className="text-[13px] font-medium">A</span>
            </div>
            <div>
              <p style={{ color: colors.text }} className="text-[13px]">admin</p>
              <p style={{ color: colors.textTertiary }} className="text-[11px]">Superuser</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Header({ locale }: { locale: 'zh' | 'en' | 'vi' }) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  useEffect(() => {
    const onSidebarCollapsedChange = () => {
      setCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
    };

    window.addEventListener('sidebar-collapsed-change', onSidebarCollapsedChange);
    window.addEventListener('storage', onSidebarCollapsedChange);

    return () => {
      window.removeEventListener('sidebar-collapsed-change', onSidebarCollapsedChange);
      window.removeEventListener('storage', onSidebarCollapsedChange);
    };
  }, []);

  return (
    <header
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(28, 28, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        borderColor: colors.border,
      }}
      className={`fixed top-0 right-0 h-12 backdrop-blur-xl border-b flex items-center justify-end px-4 z-30 transition-all duration-200 ${
        collapsed ? 'left-0' : 'left-60'
      }`}
    >
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
