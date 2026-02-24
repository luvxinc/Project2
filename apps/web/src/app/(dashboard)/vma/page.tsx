'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// VMA 模块功能配置
const vmaFeatures = [
  {
    key: 'truvalve',
    href: '/vma/truvalve',
    icon: 'truvalve',
    accent: '#0071e3', // Apple Blue
  },
  {
    key: 'p_valve',
    href: '/vma/p-valve',
    icon: 'pvalve',
    accent: '#bf5af2', // Apple Purple
  },
  {
    key: 'management',
    href: '/vma/employees',
    icon: 'management',
    accent: '#ff9f0a', // Apple Orange
  },
];

// 公司 Logo 路径
const LOGO_MAP: Record<string, string> = {
  truvalve: '/images/vma/truvalve-logo.png',
  pvalve: '/images/vma/pvalve-logo.png',
};

// Apple 风格大图标 (公司 Logo 用图片，其他用 SVG)
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  if (LOGO_MAP[name]) {
    return (
      <div className="w-28 h-28 relative">
        <Image
          src={LOGO_MAP[name]}
          alt={name}
          fill
          className="object-contain"
          sizes="112px"
        />
      </div>
    );
  }

  const icons: Record<string, React.ReactNode> = {
    management: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function VmaHubPage() {
  const t = useTranslations('vma');
  const tModule = useTranslations('modules.vma');
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
          {/* Left: VMA Logo + Subtitle */}
          <div>
            <div className="mb-3">
              <Image
                src="/images/vma/pvalve-logo.png"
                alt="VMA"
                width={180}
                height={60}
                className="object-contain"
                priority
              />
            </div>
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
          
          {vmaFeatures.map((feature) => (
            <div
              key={feature.key}
              className="feature-item flex-shrink-0 opacity-0"
              style={{ width: '280px' }}
            >
              {/* Card - Feature Visual Area */}
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
              <div className="mt-6 text-center">
                {/* Title */}
                <h2 
                  style={{ color: colors.text }} 
                  className="text-[24px] font-semibold mb-2"
                >
                  {t(`hub.${feature.key}.title`)}
                </h2>
                
                {/* Description */}
                <p 
                  style={{ color: colors.textSecondary }} 
                  className="text-[14px] leading-relaxed mb-4 px-2"
                >
                  {t(`hub.${feature.key}.description`)}
                </p>
                
                {/* CTA Button (Apple Blue Pill Style) */}
                <Link 
                  href={feature.href}
                  className="inline-flex items-center justify-center px-5 py-2 rounded-full text-[15px] font-medium transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.controlAccent, color: colors.white }}
                >
                  {t(`hub.${feature.key}.cta`)}
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
