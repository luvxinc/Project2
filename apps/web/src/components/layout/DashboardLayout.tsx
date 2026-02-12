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
  { key: 'purchase', href: '/purchase', disabled: true },
];

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  return (
    <>
      {/* Toggle */}
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

      {/* Sidebar */}
      <aside 
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className={`fixed left-0 top-0 h-full w-60 border-r flex flex-col z-40 transition-transform duration-200 ${
          collapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Header */}
        <div style={{ borderColor: colors.border }} className="h-12 flex items-center px-5 border-b">
          <Link href="/" style={{ color: colors.text }} className="text-[17px] font-semibold">
            MGMT
          </Link>
        </div>

        {/* Nav */}
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
                  color: isActive ? '#ffffff' : colors.textSecondary
                }}
                className="block mx-2 px-3 py-2 rounded-md text-[15px] transition-colors hover:opacity-80"
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ borderColor: colors.border }} className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div 
              style={{ backgroundColor: colors.bgTertiary }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
            >
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const checkCollapsed = () => {
      setCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
    };
    checkCollapsed();
    const interval = setInterval(checkCollapsed, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <header 
      style={{ 
        backgroundColor: theme === 'dark' ? 'rgba(28, 28, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)', 
        borderColor: colors.border 
      }}
      className={`fixed top-0 right-0 h-12 backdrop-blur-xl border-b flex items-center justify-end px-4 z-30 transition-all duration-200 ${
        collapsed ? 'left-0' : 'left-60'
      }`}
    >
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
