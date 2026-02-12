'use client';

import { usePathname } from 'next/navigation';
import { AppleNav } from '@/components/layout/AppleNav';
import { VmaModuleNav } from '@/components/layout/VmaModuleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { ModalProvider } from '@/components/modal/GlobalModal';
import { useEffect, useState } from 'react';

export default function VmaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<'zh' | 'en' | 'vi'>('zh');
  
  // 只在 HUB 页面显示图标栏
  const isHubPage = pathname === '/vma' || pathname?.endsWith('/vma') || pathname?.match(/^\/[a-z]{2}\/vma$/);
  
  // 获取 locale
  useEffect(() => {
    const savedLocale = document.cookie.split('; ').find(row => row.startsWith('locale='))?.split('=')[1];
    setLocale((savedLocale as 'zh' | 'en' | 'vi') || 'zh');
  }, []);

  return (
    <ModalProvider>
      <ThemedBackground>
        {/* Apple Global Nav - Fixed at top */}
        <AppleNav locale={locale} />
        
        {/* Module Sub Nav - Only on HUB page */}
        <VmaModuleNav />
        
        {/* Content - Padding depends on whether nav bar is shown */}
        {/* HUB page: 44px (AppleNav) + 60px (ModuleNav) = 104px */}
        {/* Detail page: 44px (AppleNav only) */}
        <main className={isHubPage ? 'pt-[104px]' : 'pt-11'}>
          {children}
        </main>
      </ThemedBackground>
    </ModalProvider>
  );
}
