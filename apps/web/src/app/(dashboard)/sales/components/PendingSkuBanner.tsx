'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi } from '@/lib/api/sales';

/**
 * PendingSkuBanner — Shows a warning banner on Reports/Visuals pages
 * when there are unresolved API SKU issues.
 * Links to /sales/etl for resolution.
 */
export default function PendingSkuBanner() {
  const t = useTranslations('sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    salesApi.getPendingSkus()
      .then(data => setPendingCount(data.count))
      .catch(() => {});
  }, []);

  if (pendingCount === 0) return null;

  return (
    <div
      className="rounded-xl mb-4 px-5 py-3 flex items-center gap-3 cursor-pointer transition-all hover:brightness-110"
      style={{
        backgroundColor: '#FF950012',
        border: '1px solid #FF950040',
      }}
      onClick={() => router.push('/sales/etl')}
    >
      <span className="text-sm">⚠️</span>
      <span className="text-sm font-medium flex-1" style={{ color: '#FF9500' }}>
        {t('etl.pendingSku.blockMsg')}
      </span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">
        {t('etl.pendingSku.badge', { count: pendingCount })}
      </span>
      <svg className="w-4 h-4" style={{ color: '#FF9500' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
