'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// 用户模块功能配置
const userFeatures = [
  {
    key: 'list',
    href: '/users/list',
    icon: 'users',
    accentKey: 'blue' as const,
  },
  {
    key: 'register',
    href: '/users/register',
    icon: 'plus',
    accentKey: 'green' as const,
  },
  {
    key: 'password',
    href: '/users/password',
    icon: 'lock',
    accentKey: 'orange' as const,
  },
  {
    key: 'capabilities',
    href: '/users/capabilities',
    icon: 'settings',
    accentKey: 'purple' as const,
  },
];

// Apple 风格大图标
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  const icons: Record<string, React.ReactNode> = {
    users: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    plus: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
    lock: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    settings: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function UsersHubPage() {
  const t = useTranslations('users');
  const tModule = useTranslations('modules.users');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // 平滑滚动量
  const SCROLL_AMOUNT = 300;

  // Check scroll position
  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  // Scroll handlers - 平滑移动
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Apple style: stagger animation from left to right with slide up
  useEffect(() => {
    if (carouselRef.current) {
      const cards = carouselRef.current.querySelectorAll('.feature-item');
      animate(cards, {
        opacity: [0, 1],
        translateY: [50, 0],
        delay: stagger(120, { start: 200 }),
        duration: 700,
        ease: 'out(3)',
      });
    }
    updateScrollButtons();
  }, [updateScrollButtons]);

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Hero Section - Fixed Title with Navigation */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-6">
        <div className="flex items-end justify-between">
          {/* Left: Title & Subtitle */}
          <div>
            <h1 
              style={{ color: colors.text }} 
              className="text-[48px] font-semibold tracking-tight leading-none mb-2"
            >
              {tModule('title')}
            </h1>
            <p 
              style={{ color: colors.textSecondary }} 
              className="text-[21px]"
            >
              {tModule('description')}
            </p>
          </div>
          
          {/* Right: Navigation Arrows */}
          <div className="flex items-center gap-2 pb-1">
            <button
              onClick={() => scrollCarousel('left')}
              disabled={!canScrollLeft}
              style={{ 
                backgroundColor: canScrollLeft ? colors.bgTertiary : `${colors.bgTertiary}60`,
                color: canScrollLeft ? colors.text : colors.textTertiary,
              }}
              className={`
                w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200
                ${canScrollLeft ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => scrollCarousel('right')}
              disabled={!canScrollRight}
              style={{ 
                backgroundColor: canScrollRight ? colors.bgTertiary : `${colors.bgTertiary}60`,
                color: canScrollRight ? colors.text : colors.textTertiary,
              }}
              className={`
                w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200
                ${canScrollRight ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Feature Cards Carousel (Apple iPad Style) */}
      <section className="pb-20 overflow-hidden pt-6">
        <div 
          ref={carouselRef}
          onScroll={updateScrollButtons}
          className="flex gap-4 overflow-x-auto px-6 pt-4 pb-6 cursor-grab active:cursor-grabbing"
          style={{ 
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Left spacer */}
          <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />
          
          {userFeatures.map((feature) => (
            <div
              key={feature.key}
              className="feature-item flex-shrink-0 opacity-0"
              style={{ width: '280px' }}
            >
              {/* Card - Product Image Area */}
              <Link href={feature.href} className="block group">
                <div 
                  style={{ 
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  }}
                  className="relative overflow-hidden rounded-[28px] border h-[360px] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]"
                >
                  {/* Gradient Background */}
                  <div 
                    className="absolute inset-0 opacity-[0.08]"
                    style={{ 
                      background: `radial-gradient(ellipse at 50% 100%, ${colors[feature.accentKey]}, transparent 60%)` 
                    }}
                  />
                  
                  {/* Icon */}
                  <FeatureIcon name={feature.icon} accent={colors[feature.accentKey]} />
                </div>
              </Link>
              
              {/* Info Below Card */}
              <div className="mt-6 text-center">
                {/* Title */}
                <h2 
                  style={{ color: colors.text }} 
                  className="text-[24px] font-semibold mb-2"
                >
                  {t(`${feature.key}.title`)}
                </h2>
                
                {/* Description */}
                <p 
                  style={{ color: colors.textSecondary }} 
                  className="text-[14px] leading-relaxed mb-4 px-2"
                >
                  {t(`${feature.key}.description`)}
                </p>
                
                {/* CTA Button (Apple Blue Pill Style) */}
                <Link 
                  href={feature.href}
                  className="inline-flex items-center justify-center px-5 py-2 rounded-full text-[15px] font-medium transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.blue, color: colors.white }}
                >
                  {t.has(`${feature.key}.cta`) ? t(`${feature.key}.cta`) : t('hub.explore')}
                </Link>
              </div>
            </div>
          ))}
          
          {/* Right spacer */}
          <div className="flex-shrink-0 w-[max(24px,calc((100vw-1200px)/2))]" />
        </div>
      </section>

      {/* Hide scrollbar */}
      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
