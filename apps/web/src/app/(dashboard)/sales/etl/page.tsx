'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesApi } from '@/lib/api/sales';
import type { DataRangeResponse } from '@/lib/api/sales';
import SalesTabSelector from '../components/SalesTabSelector';
import ApiTab from './components/ApiTab';
import CsvTab from './components/CsvTab';
import CorrectionsTab from './components/CorrectionsTab';

// ═══════════════════════════════════════
// Main ETL Page — 3-Tab Shell
// ═══════════════════════════════════════

type MainTab = 'api' | 'csv' | 'corrections';

export default function SalesEtlPage() {
  const t = useTranslations('sales');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [mainTab, setMainTab] = useState<MainTab>('api');
  const [analysisMode, setAnalysisMode] = useState<'api' | 'csv'>('api');
  const [dataRange, setDataRange] = useState<DataRangeResponse | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    salesApi.getDataRange()
      .then(data => { setDataRange(data); setAnalysisMode(data.dataSource); })
      .catch(() => {});
    salesApi.getPendingSkus()
      .then(data => setPendingCount(data.count))
      .catch(() => {});
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-CA'); } catch { return iso; }
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Apple Pill Tab Selector */}
      <section className="pt-12 pb-4 px-6">
        <div className="max-w-[900px] mx-auto"><SalesTabSelector /></div>
      </section>

      <div className="max-w-[900px] mx-auto px-6 py-2">
        {/* ═══ Top Bar: 3 Tabs + Analysis Switch ═══ */}
        <div className="flex items-center justify-between mb-4">
          {/* 3 Main Tabs */}
          <div className="flex rounded-xl p-1" style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}>
            {(['api', 'csv', 'corrections'] as MainTab[]).map(tab => (
              <button
                key={tab}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  backgroundColor: mainTab === tab ? colors.controlAccent : 'transparent',
                  color: mainTab === tab ? '#fff' : colors.textSecondary,
                }}
                onClick={() => setMainTab(tab)}
              >
                {tab === 'api' ? t('etl.apiSync.apiMode')
                  : tab === 'csv' ? t('etl.apiSync.csvMode')
                  : t('etl.apiSync.correctionsMode')}
                {tab === 'api' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-[9px] text-white flex items-center justify-center font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Analysis Source Switch */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              {t('etl.apiSync.analysisSwitch')}
            </span>
            <div className="flex rounded-full p-0.5" style={{ backgroundColor: colors.bgTertiary }}>
              <button
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                style={{ backgroundColor: analysisMode === 'api' ? colors.controlAccent : 'transparent', color: analysisMode === 'api' ? '#fff' : colors.textSecondary }}
                onClick={() => setAnalysisMode('api')}
              >API</button>
              <button
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                style={{ backgroundColor: analysisMode === 'csv' ? '#FF9500' : 'transparent', color: analysisMode === 'csv' ? '#fff' : colors.textSecondary }}
                onClick={() => setAnalysisMode('csv')}
              >CSV</button>
            </div>
          </div>
        </div>

        {/* ═══ Tab Content ═══ */}
        {mainTab === 'api' && (
          <ApiTab colors={colors} dataRange={dataRange} setDataRange={setDataRange} formatDate={formatDate} />
        )}
        {mainTab === 'csv' && (
          <CsvTab colors={colors} dataRange={dataRange} formatDate={formatDate} />
        )}
        {mainTab === 'corrections' && (
          <CorrectionsTab colors={colors} />
        )}
      </div>
    </div>
  );
}
