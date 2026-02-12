'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';

// VMA 模块子导航配置
const vmaSubNav = [
  { key: 'truvalve', href: '/vma/truvalve', icon: 'truvalve' },
  { key: 'p_valve', href: '/vma/p-valve', icon: 'pvalve' },
  { key: 'employees', href: '/vma/employees', icon: 'employees' },
  { key: 'duties', href: '/vma/duties', icon: 'duties' },
  { key: 'training', href: '/vma/training', icon: 'training' },
];

// Apple 风格粗线条图标
function NavIcon({ name }: { name: string }) {
  const logoMap: Record<string, string> = {
    truvalve: '/images/vma/truvalve-logo.png',
    pvalve: '/images/vma/pvalve-logo.png',
  };
  if (logoMap[name]) {
    const isWide = name === 'pvalve';
    return (
      <div className={`${isWide ? 'w-14' : 'w-7'} h-7 relative`}>
        <Image src={logoMap[name]} alt={name} fill className="object-contain" sizes={isWide ? '56px' : '28px'} />
      </div>
    );
  }

  const icons: Record<string, React.ReactNode> = {
    employees: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    duties: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    training: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.75m0 0l5.25 3.163L17.25 11.25" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export function VmaModuleNav() {
  const t = useTranslations('vma');
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const navRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  // 只在 HUB 页面 (/vma) 显示图标栏
  const isHubPage = pathname === '/vma' || pathname?.endsWith('/vma') || pathname?.match(/^\/[a-z]{2}\/vma$/);
  
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
          {/* VMA Icons - Fixed width items with equal spacing */}
          <div ref={navRef} className="flex items-start justify-center gap-6">
            {vmaSubNav.map((item) => {
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
