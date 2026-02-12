'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

export default function TruValvePage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6 pt-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 mb-8">
          <Link 
            href="/vma"
            style={{ color: colors.blue }}
            className="text-[13px] hover:underline"
          >
            VMA
          </Link>
          <span style={{ color: colors.textTertiary }} className="text-[13px]">/</span>
          <span style={{ color: colors.textSecondary }} className="text-[13px]">
            {t('truvalve.title')}
          </span>
        </nav>

        {/* Page Header */}
        <div className="mb-10">
          <h1 
            style={{ color: colors.text }} 
            className="text-[34px] font-bold tracking-tight mb-2"
          >
            {t('truvalve.title')}
          </h1>
          <p 
            style={{ color: colors.textSecondary }} 
            className="text-[17px]"
          >
            {t('truvalve.description')}
          </p>
        </div>

        {/* Coming Soon Placeholder */}
        <div 
          style={{ 
            backgroundColor: colors.bgSecondary, 
            borderColor: colors.border 
          }}
          className="rounded-2xl border p-12 text-center"
        >
          <div style={{ color: colors.textTertiary }} className="mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 
            style={{ color: colors.textSecondary }} 
            className="text-[20px] font-semibold mb-2"
          >
            TruValve
          </h2>
          <p 
            style={{ color: colors.textTertiary }} 
            className="text-[15px]"
          >
            功能开发中，敬请期待
          </p>
        </div>
      </div>
    </div>
  );
}
