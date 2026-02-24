'use client';

import { usePathname } from 'next/navigation';
import { AppleNav } from '@/components/layout/AppleNav';
import { LogModuleNav } from './components/LogModuleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { ModalProvider } from '@/components/modal/GlobalModal';
import { useEffect, useState } from 'react';

export default function LogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<'zh' | 'en' | 'vi'>('zh');
  
  // 只在 HUB 页面显示模块导航栏
  const isHubPage = pathname === '/logs' || pathname?.endsWith('/logs') || pathname?.match(/^\/[a-z]{2}\/logs$/);
  
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
        
        {/* Module Sub Nav */}
        <LogModuleNav />
        
        {/* Content */}
        <main className={isHubPage ? 'pt-[104px]' : 'pt-11'}>
          {children}
        </main>
      </ThemedBackground>
    </ModalProvider>
  );
}
