'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

// 财务模块子导航配置 — 所有独立路由
const financeSubNav = [
  { key: 'prepay', href: '/finance/prepay', icon: 'prepay' },
  { key: 'deposit', href: '/finance/deposit', icon: 'deposit' },
  { key: 'poPayment', href: '/finance/po-payment', icon: 'poPayment' },
  { key: 'logistic', href: '/finance/logistic', icon: 'logistic' },
  { key: 'flow', href: '/finance/flow', icon: 'flow' },
];

// Apple 风格粗线条图标
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    prepay: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    deposit: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    poPayment: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    logistic: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    flow: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export function FinanceModuleNav() {
  const t = useTranslations('finance');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const navRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  // 只在 HUB 页面 (/finance) 显示图标栏
  const isHubPage = pathname === '/finance' || pathname?.endsWith('/finance') || pathname?.match(/^\/[a-z]{2}\/finance$/);

  // Stagger animation on mount (Apple style: left to right fade in)
  useEffect(() => {
    if (navRef.current && !animatedRef.current && isHubPage) {
      animatedRef.current = true;
      const items = navRef.current.querySelectorAll('.nav-item');

      // 先设置初始状态
      items.forEach((item) => {
        (item as HTMLElement).style.opacity = '0';
        (item as HTMLElement).style.transform = 'translateY(8px)';
      });

      // 执行动画
      animate(items, {
        opacity: [0, 1],
        translateY: [8, 0],
        delay: stagger(80, { start: 100 }),
        duration: 400,
        ease: 'out(3)',
        complete: () => {
          // 动画结束后，设置非活动项的 opacity
          items.forEach((item) => {
            const isActive = item.getAttribute('data-active') === 'true';
            (item as HTMLElement).style.opacity = isActive ? '1' : '0.4';
          });
        }
      });
    }
  }, [isHubPage]);

  // 当离开 HUB 页面时重置动画状态
  useEffect(() => {
    if (!isHubPage) {
      animatedRef.current = false;
    }
  }, [isHubPage]);

  // 功能页面不显示图标栏
  if (!isHubPage) {
    return null;
  }

  return (
    <div style={{ backgroundColor: `${colors.bgTertiary}e6` }} className="fixed top-11 left-0 right-0 z-30 backdrop-blur-xl">
      <div className="max-w-[1024px] mx-auto px-6">
        {/* Apple style: icons with labels, centered */}
        <nav className="flex items-center justify-center py-3">
          {/* Finance Icons - Fixed width items with equal spacing */}
          <div ref={navRef} className="flex items-start justify-center gap-6">
            {financeSubNav.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  style={{ color: colors.text }}
                  className={`nav-item flex flex-col items-center gap-1 transition-all duration-200 w-[72px] ${
                    isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                  } hover:scale-110`}
                  data-active={isActive}
                >
                  <NavIcon name={item.icon} />
                  <span className="text-[10px] text-center leading-tight">
                    {t(`hub.${item.key}.navTitle` as 'title')}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
