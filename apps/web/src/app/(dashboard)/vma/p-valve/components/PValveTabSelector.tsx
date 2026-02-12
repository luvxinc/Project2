'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useRef, useEffect, useState, useCallback } from 'react';

// ================================
// P-Valve Sub-Module Tab Definitions
// ================================

type PValveTab = 'inventory' | 'clinicalCase' | 'overview' | 'demoInventory' | 'fridgeShelf' | 'productManagement' | 'siteManagement';

const pValveTabs: PValveTab[] = ['inventory', 'clinicalCase', 'overview', 'demoInventory', 'fridgeShelf', 'productManagement', 'siteManagement'];

const pValveTabPaths: Record<PValveTab, string> = {
  inventory: '/vma/p-valve/inventory',
  clinicalCase: '/vma/p-valve/clinical-case',
  overview: '/vma/p-valve/overview',
  demoInventory: '/vma/p-valve/demo-inventory',
  fridgeShelf: '/vma/p-valve/fridge-shelf',
  productManagement: '/vma/p-valve/product-management',
  siteManagement: '/vma/p-valve/site-management',
};

// ================================
// PValveTabSelector Component
// Apple Mac Toggle 风格滑块 - 复刻 VmaTabSelector
// ================================

export default function PValveTabSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  // 滑块状态
  const [pillPos, setPillPos] = useState({ left: 0, width: 100 });
  const [ready, setReady] = useState(false);
  
  // 确定当前选中的 tab
  const getCurrentTab = useCallback((): PValveTab => {
    if (pathname?.includes('/clinical-case')) return 'clinicalCase';
    if (pathname?.includes('/overview')) return 'overview';
    if (pathname?.includes('/demo-inventory')) return 'demoInventory';
    if (pathname?.includes('/fridge-shelf')) return 'fridgeShelf';
    if (pathname?.includes('/product-management')) return 'productManagement';
    if (pathname?.includes('/site-management')) return 'siteManagement';
    if (pathname?.includes('/inventory')) return 'inventory';
    // Default: first tab
    return 'inventory';
  }, [pathname]);
  
  const currentTab = getCurrentTab();
  const currentIndex = pValveTabs.indexOf(currentTab);
  
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
  const handleClick = (tab: PValveTab, index: number) => {
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
      router.push(pValveTabPaths[tab]);
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
        {t(`p_valve.tabs.${currentTab}.title`)}
      </h1>
      
      <div 
        ref={containerRef}
        className="relative inline-flex items-center rounded-full"
        style={{ 
          backgroundColor: theme === 'dark' 
            ? 'rgba(255,255,255,0.1)' 
            : '#e8e8ed',
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
            backgroundColor: theme === 'dark' ? '#ffffff' : '#1d1d1f',
            transition: ready 
              ? 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.15s ease' 
              : 'none',
            zIndex: 1,
          }}
        />
        
        {pValveTabs.map((tab, index) => {
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
                  ? (theme === 'dark' ? '#1d1d1f' : '#ffffff')
                  : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : '#6e6e73'),
                fontSize: '14px',
                fontWeight: 400,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                transition: 'color 0.2s ease',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
              }}
            >
              {t(`p_valve.tabs.${tab}.title`)}
            </button>
          );
        })}
      </div>
      
      <p 
        className="text-[17px] mt-4"
        style={{ color: colors.textSecondary }}
      >
        {t(`p_valve.tabs.${currentTab}.description`)}
      </p>
    </div>
  );
}
