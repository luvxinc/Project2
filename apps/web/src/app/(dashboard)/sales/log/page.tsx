'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import ListingTabSelector from '../components/ListingTabSelector';
import ActionLogPanel from '../components/ActionLogPanel';
import { useTranslations } from 'next-intl';

export default function ActionLogPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('sales.listings');

  return (
    <div
      className="min-h-screen pb-20"
      style={{ backgroundColor: colors.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
    >
      <section className="max-w-[1800px] mx-auto px-6 pt-10 pb-6">
        <ListingTabSelector />
        <p style={{ color: colors.textSecondary }} className="text-[15px] mt-3">
          {t('tabLogDesc')}
        </p>
      </section>

      <section className="max-w-[1800px] mx-auto px-6">
        <div className="rounded-2xl border p-6" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
          <ActionLogPanel module="all" />
        </div>
      </section>
    </div>
  );
}
