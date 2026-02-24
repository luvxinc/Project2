'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

// 库存模块子导航配置
const inventorySubNav = [
  { key: 'shelf', href: '/inventory/shelf', icon: 'shelf' },
  { key: 'dynamic', href: '/inventory/dynamic', icon: 'dynamic', comingSoon: true },
  { key: 'stocktake', href: '/inventory/stocktake', icon: 'stocktake', comingSoon: true },
];

// Apple 风格粗线条图标
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    shelf: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5M6 6.75v10.5M10 6.75v10.5M14 6.75v10.5M18 6.75v10.5" />
      </svg>
    ),
    dynamic: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M3 20.25h18M3.75 3v.75A.75.75 0 013 4.5h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 4.5v9m18-10.5v.75c0 .414.336.75.75.75h.75" />
      </svg>
    ),
    stocktake: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export function InventoryModuleNav() {
  const t = useTranslations('inventory');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const navRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  // 只在 HUB 页面 (/inventory) 显示图标栏
  const isHubPage = pathname === '/inventory' || pathname?.endsWith('/inventory') || pathname?.match(/^\/[a-z]{2}\/inventory$/);

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
          {/* Inventory Icons - Fixed width items with equal spacing */}
          <div ref={navRef} className="flex items-start justify-center gap-6">
            {inventorySubNav.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

              return (
                <Link
                  key={item.key}
                  href={item.comingSoon ? '#' : item.href}
                  style={{ color: colors.text }}
                  className={`nav-item flex flex-col items-center gap-1 transition-all duration-200 w-[72px] ${
                    isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                  } ${item.comingSoon ? 'pointer-events-none' : 'hover:scale-110'}`}
                  data-active={isActive}
                  onClick={item.comingSoon ? (e) => e.preventDefault() : undefined}
                >
                  <NavIcon name={item.icon} />
                  <span className="text-[10px] text-center leading-tight">
                    {t(`hub.${item.key}.navTitle` as 'hub.shelf.navTitle')}
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
