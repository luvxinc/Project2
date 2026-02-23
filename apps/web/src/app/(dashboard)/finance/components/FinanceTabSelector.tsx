'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useRef, useEffect, useState, useCallback } from 'react';

// ================================
// Finance Module Tab Definitions
// Only the 4 payment-flow pages — order from user spec:
//   预付款 → 定金 → 采购 → 物流
// ================================

type FinanceTab = 'prepay' | 'deposit' | 'poPayment' | 'logistic';

const financeTabs: FinanceTab[] = ['prepay', 'deposit', 'poPayment', 'logistic'];

const financeTabPaths: Record<FinanceTab, string> = {
  prepay: '/finance/prepay',
  deposit: '/finance/deposit',
  poPayment: '/finance/po-payment',
  logistic: '/finance/logistic',
};

// ================================
// FinanceTabSelector Component
// Apple Mac Toggle 风格滑块 — 复刻 PurchaseTabSelector
// ================================

export default function FinanceTabSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('finance');

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 滑块状态
  const [pillPos, setPillPos] = useState({ left: 0, width: 100 });
  const [ready, setReady] = useState(false);

  // 确定当前选中的 tab
  const getCurrentTab = useCallback((): FinanceTab => {
    if (pathname?.includes('/finance/prepay')) return 'prepay';
    if (pathname?.includes('/finance/deposit')) return 'deposit';
    if (pathname?.includes('/finance/po-payment')) return 'poPayment';
    if (pathname?.includes('/finance/logistic')) return 'logistic';
    // Default: first tab
    return 'prepay';
  }, [pathname]);

  const currentTab = getCurrentTab();
  const currentIndex = financeTabs.indexOf(currentTab);

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
  const handleClick = (tab: FinanceTab, index: number) => {
    if (tab === currentTab) return;

    // 先更新滑块位置
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

    // 延迟跳转让动画先播放
    setTimeout(() => {
      router.push(financeTabPaths[tab]);
    }, 100);
  };

  return (
    <div className="flex flex-col items-start">
      <h1
        className="text-[48px] font-semibold tracking-tight mb-6"
        style={{
          color: colors.text,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}
      >
        {t(`hub.${currentTab}.title` as 'title')}
      </h1>

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

        {financeTabs.map((tab, index) => {
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
                padding: '10px 24px',
                color: isActive
                  ? colors.bg
                  : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : colors.gray),
                fontSize: '14px',
                fontWeight: 400,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                transition: 'color 0.2s ease',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
              }}
            >
              {t(`hub.${tab}.navTitle` as 'title')}
            </button>
          );
        })}
      </div>

      <p
        className="text-[17px] mt-4"
        style={{ color: colors.textSecondary }}
      >
        {t(`hub.${currentTab}.description` as 'title')}
      </p>
    </div>
  );
}
