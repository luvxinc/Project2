'use client';

import { AppleNav } from '@/components/layout/AppleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { ModalProvider } from '@/components/modal/GlobalModal';
import { useState } from 'react';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const [locale] = useState<'zh' | 'en' | 'vi'>(() => {
    if (typeof document === 'undefined') return 'zh';
    const savedLocale = document.cookie.split('; ').find(row => row.startsWith('locale='))?.split('=')[1];
    return savedLocale === 'en' || savedLocale === 'vi' ? savedLocale : 'zh';
  });

  return (
    <ModalProvider>
      <ThemedBackground>
        <AppleNav locale={locale} />
        <main className="pt-11">
          {children}
        </main>
      </ThemedBackground>
    </ModalProvider>
  );
}
