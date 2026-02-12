'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import PValveTabSelector from '../components/PValveTabSelector';

export default function FridgeShelfPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Apple 风格 Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      {/* Content Area */}
      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <p style={{ color: colors.textSecondary }} className="text-sm">
            Fridge Shelf Visualization
          </p>
        </div>

        {/* Empty State */}
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="rounded-2xl border overflow-hidden"
        >
          <div className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
            <div className="flex flex-col items-center gap-3">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <p className="text-[15px] font-medium">No fridge shelf data yet</p>
              <p className="text-[13px]">Fridge shelf visualization will display product placement across storage units</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
