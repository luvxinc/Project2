'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';

// 产品模块子导航配置
const productSubNav = [
  { key: 'cogs', href: '/products/cogs', icon: 'cogs' },
  { key: 'create', href: '/products/create', icon: 'plus' },
  { key: 'barcode', href: '/products/barcode', icon: 'barcode' },
];

// Apple 风格粗线条图标
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    cogs: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    plus: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    barcode: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export function ProductModuleNav() {
  const t = useTranslations('products');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const navRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  // 只在 HUB 页面 (/products) 显示图标栏
  // 可能有 locale 前缀如 /zh/products 或 /en/products
  const isHubPage = pathname === '/products' || pathname?.endsWith('/products') || pathname?.match(/^\/[a-z]{2}\/products$/);
  
  // Stagger animation on mount (Apple style: left to right fade in)
  useEffect(() => {
    if (navRef.current && !animated && isHubPage) {
      setAnimated(true);
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
  }, [isHubPage, animated]);

  // 当离开 HUB 页面时重置动画状态
  useEffect(() => {
    if (!isHubPage) {
      setAnimated(false);
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
          {/* Product Icons - Fixed width items with equal spacing */}
          <div ref={navRef} className="flex items-start justify-center gap-6">
            {productSubNav.map((item) => {
              const isActive = pathname === item.href;

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
                    {t(`hub.${item.key}.title`)}
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
