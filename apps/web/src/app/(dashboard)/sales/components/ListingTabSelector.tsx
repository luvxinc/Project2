'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useRef, useEffect, useState, useCallback } from 'react';

// ================================
// Listing Module Pill Tab Definitions
//   Listings → Offers
// ================================

type ListingTab = 'listings' | 'offers' | 'orders' | 'messages' | 'afterSales' | 'automation' | 'log';

const listingTabs: ListingTab[] = ['listings', 'offers', 'orders', 'messages', 'afterSales', 'automation', 'log'];

const listingTabPaths: Record<ListingTab, string> = {
  listings: '/sales/listings',
  offers: '/sales/offers',
  orders: '/sales/orders',
  messages: '/sales/messages',
  afterSales: '/sales/after-sales',
  automation: '/sales/automation',
  log: '/sales/log',
};

// ================================
// ListingTabSelector Component
// Apple Mac Toggle 风格滑块 — 独立 pill 导航
// ================================

export default function ListingTabSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.listings');

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 滑块状态
  const [pillPos, setPillPos] = useState({ left: 0, width: 100 });
  const [ready, setReady] = useState(false);

  // 确定当前选中的 tab
  const getCurrentTab = useCallback((): ListingTab => {
    if (pathname?.includes('/sales/offers')) return 'offers';
    if (pathname?.includes('/sales/orders')) return 'orders';
    if (pathname?.includes('/sales/messages')) return 'messages';
    if (pathname?.includes('/sales/after-sales')) return 'afterSales';
    if (pathname?.includes('/sales/automation')) return 'automation';
    if (pathname?.includes('/sales/log')) return 'log';
    return 'listings';
  }, [pathname]);

  const currentTab = getCurrentTab();
  const currentIndex = listingTabs.indexOf(currentTab);

  // 计算滑块位置
  const updatePillPosition = useCallback(() => {
    const container = containerRef.current;
    const button = buttonRefs.current[currentIndex];

    if (!container || !button) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();

    setPillPos({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [currentIndex]);

  // 初始化
  useEffect(() => {
    const timer = setTimeout(() => {
      updatePillPosition();
      setReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [updatePillPosition]);

  // 监听变化
  useEffect(() => {
    updatePillPosition();
  }, [currentIndex, updatePillPosition]);

  // 窗口变化
  useEffect(() => {
    window.addEventListener('resize', updatePillPosition);
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [updatePillPosition]);

  // 点击处理
  const handleClick = (tab: ListingTab, index: number) => {
    if (tab === currentTab) return;

    const button = buttonRefs.current[index];
    const container = containerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setPillPos({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }

    setTimeout(() => {
      router.push(listingTabPaths[tab]);
    }, 100);
  };

  const tabLabels: Record<ListingTab, string> = {
    listings: t('tabListings'),
    offers: t('tabOffers'),
    orders: t('tabOrders'),
    messages: t('tabMessages'),
    afterSales: t('tabAfterSales'),
    automation: t('tabAutomation'),
    log: t('tabLog'),
  };

  return (
    <div className="flex flex-col items-start">
      <div
        ref={containerRef}
        className="relative inline-flex items-center rounded-full"
        style={{
          backgroundColor: colors.gray5,
          padding: '4px',
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            top: '4px',
            bottom: '4px',
            left: `${pillPos.left}px`,
            width: `${pillPos.width}px`,
            backgroundColor: colors.text,
            transition: ready
              ? 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.15s ease'
              : 'none',
            zIndex: 1,
          }}
        />

        {listingTabs.map((tab, index) => {
          const isActive = currentTab === tab;

          return (
            <button
              key={tab}
              type="button"
              ref={el => { buttonRefs.current[index] = el; }}
              onClick={() => handleClick(tab, index)}
              className="relative rounded-full select-none whitespace-nowrap"
              style={{
                zIndex: 2,
                padding: '10px 28px',
                color: isActive
                  ? colors.bg
                  : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : colors.gray),
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                transition: 'color 0.2s ease',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
              }}
            >
              {tabLabels[tab]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
