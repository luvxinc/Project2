'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';

// 用户模块子导航配置
const userSubNav = [
  { key: 'list', href: '/users/list', icon: 'users' },
  { key: 'register', href: '/users/register', icon: 'plus' },
  { key: 'password', href: '/users/password', icon: 'lock' },
  { key: 'capabilities', href: '/users/capabilities', icon: 'settings' },
];

// Apple 风格粗线条图标
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    users: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    plus: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
    lock: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    settings: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export function UserModuleNav() {
  const t = useTranslations('users');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const navRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  // 只在 HUB 页面 (/users) 显示图标栏
  // 可能有 locale 前缀如 /zh/users 或 /en/users
  const isHubPage = pathname === '/users' || pathname?.endsWith('/users') || pathname?.match(/^\/[a-z]{2}\/users$/);
  
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
            {userSubNav.map((item) => {
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
                    {t(`${item.key}.title`)}
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
