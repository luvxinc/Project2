'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'animejs';

// 采购模块功能卡片配置
const purchaseFeatures = [
  {
    key: 'suppliers',
    href: '/purchase/suppliers',
    icon: 'suppliers',
    accent: '#0071e3', // Apple Blue
  },
  {
    key: 'orders',
    href: '/purchase/orders',
    icon: 'orders',
    accent: '#30d158', // Apple Green
  },
  {
    key: 'shipments',
    href: '/purchase/shipments',
    icon: 'shipments',
    accent: '#ff9f0a', // Apple Orange
  },
  {
    key: 'receives',
    href: '/purchase/receives',
    icon: 'receives',
    accent: '#bf5af2', // Apple Purple
  },
  {
    key: 'abnormal',
    href: '/purchase/abnormal',
    icon: 'abnormal',
    accent: '#ff453a', // Apple Red
  },
];

// Apple 风格大图标
function FeatureIcon({ name, accent }: { name: string; accent: string }) {
  const icons: Record<string, React.ReactNode> = {
    suppliers: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    orders: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    shipments: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    receives: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    abnormal: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  };
  return <div style={{ color: accent }}>{icons[name] || null}</div>;
}

export default function PurchaseHubPage() {
  const t = useTranslations('purchase');
  const tModule = useTranslations('modules.purchase');
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

          {purchaseFeatures.map((feature) => (
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
