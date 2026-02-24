'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// 日志模块功能配置 - 5 个功能区（概览已整合到 HUB 页本身）
const logFeatures = [
  {
    key: 'errors',
    href: '/logs/errors',
    icon: 'error',
    accent: '#ff3b30', // Apple Red
  },
  {
    key: 'audits',
    href: '/logs/audits',
    icon: 'shield',
    accent: '#ff9f0a', // Apple Orange
  },
  {
    key: 'business',
    href: '/logs/business',
    icon: 'briefcase',
    accent: '#30d158', // Apple Green
  },
  {
    key: 'access',
    href: '/logs/access',
    icon: 'globe',
    accent: '#5e5ce6', // Apple Indigo
  },
  {
    key: 'maintenance',
    href: '/logs/maintenance',
    icon: 'wrench',
    accent: '#bf5af2', // Apple Purple
  },
];

// Apple 风格大图标
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  const icons: Record<string, React.ReactNode> = {
    error: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    shield: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    briefcase: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
    globe: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    wrench: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function LogsHubPage() {
  const t = useTranslations('logs');
  const tModule = useTranslations('modules.logs');
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

  // Scroll handlers
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // 对齐所有按钮位置 - 以最底部的按钮为基准
  useEffect(() => {
    const alignButtons = () => {
      if (!carouselRef.current) return;
      
      const ctaContainers = carouselRef.current.querySelectorAll('.cta-container');
      if (ctaContainers.length === 0) return;
      
      // 先重置所有 margin-top
      ctaContainers.forEach(container => {
        (container as HTMLElement).style.marginTop = '0';
      });
      
      // 获取每个按钮容器的顶部位置
      let maxTop = 0;
      ctaContainers.forEach(container => {
        const rect = container.getBoundingClientRect();
        if (rect.top > maxTop) {
          maxTop = rect.top;
        }
      });
      
      // 给每个按钮容器增加 margin-top 来对齐到最底部的位置
      ctaContainers.forEach(container => {
        const rect = container.getBoundingClientRect();
        const diff = maxTop - rect.top;
        if (diff > 0) {
          (container as HTMLElement).style.marginTop = `${diff}px`;
        }
      });
    };

    // 延迟执行确保 DOM 渲染完成
    const timer = setTimeout(alignButtons, 50);
    window.addEventListener('resize', alignButtons);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', alignButtons);
    };
  }, []);

  // Apple style: stagger animation
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
      {/* Hero Section */}
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
          
          {logFeatures.map((feature) => (
            <div
              key={feature.key}
              className="feature-item flex-shrink-0 opacity-0 flex flex-col"
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
                      background: `radial-gradient(ellipse at 50% 100%, ${feature.accent}, transparent 60%)` 
                    }}
                  />
                  
                  {/* Icon */}
                  <FeatureIcon name={feature.icon} accent={feature.accent} />
                </div>
              </Link>
              
              {/* Info Below Card */}
              <div className="card-info mt-6 text-center">
                {/* Title */}
                <h2 
                  style={{ color: colors.text }} 
                  className="text-[24px] font-semibold mb-2"
                >
                  {t(`features.${feature.key}.title`)}
                </h2>
                
                {/* Description - Fixed min-height for 3 lines to align buttons */}
                <p 
                  style={{ color: colors.textSecondary }} 
                  className="text-[14px] leading-[1.5] px-2 min-h-[63px]"
                >
                  {t(`features.${feature.key}.description`)}
                </p>
                
                {/* CTA Button (Apple Blue Pill Style) */}
                <div className="cta-container pt-3">
                  <Link 
                    href={feature.href}
                    className="inline-flex items-center justify-center px-5 py-2 rounded-full text-[15px] font-medium transition-all hover:opacity-90"
                    style={{ backgroundColor: colors.blue, color: colors.white }}
                  >
                    {t.has(`features.${feature.key}.cta`) ? t(`features.${feature.key}.cta`) : t('hub.explore')}
                  </Link>
                </div>
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
