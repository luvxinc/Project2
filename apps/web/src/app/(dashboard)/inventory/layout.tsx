'use client';

import { usePathname } from 'next/navigation';
import { AppleNav } from '@/components/layout/AppleNav';
import { InventoryModuleNav } from '@/components/layout/InventoryModuleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { ModalProvider } from '@/components/modal/GlobalModal';
import { useState } from 'react';

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [locale] = useState<'zh' | 'en' | 'vi'>(() => {
    if (typeof document === 'undefined') return 'zh';
    const savedLocale = document.cookie.split('; ').find(row => row.startsWith('locale='))?.split('=')[1];
    return savedLocale === 'en' || savedLocale === 'vi' ? savedLocale : 'zh';
  });

  // 只在 HUB 页面显示图标栏
  const isHubPage = pathname === '/inventory' || pathname?.endsWith('/inventory') || pathname?.match(/^\/[a-z]{2}\/inventory$/);

  return (
    <ModalProvider>
      <ThemedBackground>
        {/* Apple Global Nav - Fixed at top */}
        <AppleNav locale={locale} />

        {/* Module Sub Nav - Only on HUB page */}
        <InventoryModuleNav />

        {/* Content - Padding depends on whether nav bar is shown */}
        {/* HUB page: 44px (AppleNav) + 60px (ModuleNav) = 104px */}
        {/* Sub-pages: 44px (AppleNav only) */}
        <main className={isHubPage ? 'pt-[104px]' : 'pt-11'}>
          {children}
        </main>
      </ThemedBackground>
    </ModalProvider>
  );
}
