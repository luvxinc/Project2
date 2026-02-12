'use client';

import { usePathname } from 'next/navigation';
import { AppleNav } from '@/components/layout/AppleNav';
import { UserModuleNav } from '@/components/layout/UserModuleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { ModalProvider } from '@/components/modal/GlobalModal';
import { useEffect, useState } from 'react';

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<'zh' | 'en' | 'vi'>('zh');
  
  // 只在 HUB 页面显示图标栏
  // 可能有 locale 前缀如 /zh/users 或 /en/users
  const isHubPage = pathname === '/users' || pathname?.endsWith('/users') || pathname?.match(/^\/[a-z]{2}\/users$/);
  
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
        <UserModuleNav />
        
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
