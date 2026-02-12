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
    key: 'employees',
    href: '/vma/employees',
    icon: 'employees',
    accent: '#ff9f0a', // Apple Orange
  },
  {
    key: 'duties',
    href: '/vma/duties',
    icon: 'duties',
    accent: '#ff453a', // Apple Red
  },
  {
    key: 'training',
    href: '/vma/training',
    icon: 'training',
    accent: '#30d158', // Apple Green
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
    employees: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    duties: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    training: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.75m0 0l5.25 3.163L17.25 11.25" />
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
                  style={{ backgroundColor: '#0071e3', color: '#ffffff' }}
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
      <style jsx>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
