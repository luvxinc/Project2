'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// Sales HUB 卡片配置
const salesFeatures = [
  {
    key: 'upload',
    href: '/sales/etl',
    icon: 'upload',
    accent: '#0071e3', // Apple Blue
  },
  {
    key: 'reports',
    href: '/sales/reports',
    icon: 'reports',
    accent: '#30d158', // Apple Green
  },
  {
    key: 'visuals',
    href: '/sales/visuals',
    icon: 'visuals',
    accent: '#bf5af2', // Apple Purple
  },
];

// Apple 风格大图标
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  const icons: Record<string, React.ReactNode> = {
    upload: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    reports: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    visuals: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function SalesHubPage() {
  const t = useTranslations('sales');
  const tModule = useTranslations('modules.sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const SCROLL_AMOUNT = 300;

  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

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

          {/* Navigation Arrows */}
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

      {/* Feature Cards Carousel */}
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

          {salesFeatures.map((feature) => (
            <div
              key={feature.key}
              className="feature-item flex-shrink-0 opacity-0"
              style={{ width: '240px' }}
            >
              {/* Card */}
              <Link href={feature.href} className="block group">
                <div
                  style={{
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  }}
                  className="relative overflow-hidden rounded-[28px] border h-[320px] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]"
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
              <div className="mt-5 text-center">
                <h2
                  style={{ color: colors.text }}
                  className="text-[22px] font-semibold mb-2"
                >
                  {t(`hub.${feature.key}.title` as 'title')}
                </h2>

                <p
                  style={{ color: colors.textSecondary }}
                  className="text-[13px] leading-relaxed mb-3 px-1"
                >
                  {t(`hub.${feature.key}.description` as 'title')}
                </p>

                <Link
                  href={feature.href}
                  className="inline-flex items-center justify-center px-5 py-2 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.controlAccent, color: '#ffffff' }}
                >
                  {t(`hub.${feature.key}.cta` as 'title')}
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
