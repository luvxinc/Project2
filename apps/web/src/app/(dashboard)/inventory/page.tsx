'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// 库存模块功能卡片配置
const inventoryFeatures = [
  {
    key: 'shelf',
    href: '/inventory/shelf',
    icon: 'shelf',
    accent: '#0071e3', // Apple Blue
  },
  {
    key: 'dynamic',
    href: '/inventory/dynamic',
    icon: 'dynamic',
    accent: '#30d158', // Apple Green
  },
  {
    key: 'stocktake',
    href: '/inventory/stocktake',
    icon: 'stocktake',
    accent: '#ff9f0a', // Apple Orange
  },
];

// Apple 风格大图标
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  const icons: Record<string, React.ReactNode> = {
    shelf: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5M6 6.75v10.5M10 6.75v10.5M14 6.75v10.5M18 6.75v10.5" />
      </svg>
    ),
    dynamic: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M3 20.25h18M3.75 3v.75A.75.75 0 013 4.5h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 4.5v9m18-10.5v.75c0 .414.336.75.75.75h.75" />
      </svg>
    ),
    stocktake: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function InventoryHubPage() {
  const t = useTranslations('inventory');
  const tModule = useTranslations('modules.inventory');
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

          {inventoryFeatures.map((feature) => (
            <div
              key={feature.key}
              className="feature-item flex-shrink-0 opacity-0"
              style={{ width: '240px' }}
            >
              {/* Card */}
              <Link
                href={feature.href}
                className="block group"
              >
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
                  {t(`hub.${feature.key}.title` as 'hub.shelf.title')}
                </h2>

                <p
                  style={{ color: colors.textSecondary }}
                  className="text-[13px] leading-relaxed mb-3 px-1"
                >
                  {t(`hub.${feature.key}.description` as 'hub.shelf.description')}
                </p>

                <Link
                  href={feature.href}
                  className="inline-flex items-center justify-center px-5 py-2 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.controlAccent, color: '#ffffff' }}
                >
                  {t(`hub.${feature.key}.cta` as 'hub.shelf.cta')}
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
