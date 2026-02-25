'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import SalesTabSelector from '../components/SalesTabSelector';

export default function SalesVisualsPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales');

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Apple Pill Tab Selector */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[1400px] mx-auto">
          <SalesTabSelector />
        </div>
      </section>

      {/* Content */}
      <section className="max-w-[1400px] mx-auto px-6 pt-6">
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="rounded-xl border p-12 text-center"
        >
          <svg className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p style={{ color: colors.textSecondary }} className="text-lg font-medium">
            {t('hub.visuals.title')}
          </p>
          <p style={{ color: colors.textTertiary }} className="text-sm mt-1">
            Coming soon
          </p>
        </div>
      </section>
    </div>
  );
}
