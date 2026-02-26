'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import type { WarehouseNode } from '@/lib/api/inventory';

const InteractiveWarehouseScene = dynamic(
  () => import('./three/InteractiveWarehouseScene').then(m => ({ default: m.InteractiveWarehouseScene })),
  { ssr: false }
);

interface CustomDownloadViewProps {
  warehouses: WarehouseNode[];
  initialWarehouse?: string;
  onBack: () => void;
}

export function CustomDownloadView({
  warehouses,
  initialWarehouse,
  onBack,
}: CustomDownloadViewProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [selectedWarehouse, setSelectedWarehouse] = useState(
    initialWarehouse || warehouses[0]?.warehouse || ''
  );
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const currentWarehouse = warehouses.find(w => w.warehouse === selectedWarehouse);

  const handleSelectionChange = useCallback((locations: string[]) => {
    setSelectedLocations(locations);
  }, []);

  const handleDownload = async () => {
    if (selectedLocations.length === 0) return;
    setIsDownloading(true);
    try {
      const blob = await inventoryApi.downloadSingleBarcode({ barcodes: selectedLocations });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `barcodes-custom-${selectedWarehouse}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: colors.bg }}
      className="min-h-screen"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBack();
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-20" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ color: colors.text }} className="text-[28px] font-semibold">
              {t('shelf.download.title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-[15px] mt-1">
              {t('shelf.download.subtitle')}
            </p>
          </div>
          <button
            onClick={onBack}
            style={{ color: colors.textSecondary }}
            className="flex items-center gap-2 text-[14px] hover:opacity-70 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {t('shelf.wizard.back')}
          </button>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-6">
          {/* 3D Scene */}
          <div
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            className="rounded-2xl border overflow-hidden h-[500px]"
          >
            {currentWarehouse ? (
              <InteractiveWarehouseScene
                warehouse={currentWarehouse}
                selectedLocations={selectedLocations}
                onSelectionChange={handleSelectionChange}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <span style={{ color: colors.textTertiary }} className="text-[14px]">
                  {t('shelf.empty.title')}
                </span>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Warehouse selector */}
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-2xl border p-4"
            >
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2">
                {t('shelf.wizard.warehouse')}
              </label>
              <select
                value={selectedWarehouse}
                onChange={(e) => {
                  setSelectedWarehouse(e.target.value);
                  setSelectedLocations([]);
                }}
                style={{
                  backgroundColor: colors.bgTertiary,
                  color: colors.text,
                  borderColor: colors.border,
                }}
                className="w-full rounded-lg border px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {warehouses.map(w => (
                  <option key={w.warehouse} value={w.warehouse}>
                    {w.warehouse} ({w.totalLocations})
                  </option>
                ))}
              </select>
            </div>

            {/* Selection info */}
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-2xl border p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: colors.textSecondary }} className="text-[12px]">
                  {t('shelf.download.selectLocations')}
                </span>
                <span style={{ color: colors.controlAccent }} className="text-[13px] font-semibold">
                  {t('shelf.download.selectedCount', { count: selectedLocations.length })}
                </span>
              </div>

              {/* Selected locations list */}
              <div className="max-h-[280px] overflow-y-auto space-y-1">
                {selectedLocations.length === 0 ? (
                  <p style={{ color: colors.textTertiary }} className="text-[12px] text-center py-4">
                    {t('shelf.download.clickToSelect')}
                  </p>
                ) : (
                  selectedLocations.map(loc => (
                    <div
                      key={loc}
                      style={{ backgroundColor: colors.bgTertiary }}
                      className="rounded-lg px-3 py-1.5 flex items-center justify-between"
                    >
                      <span style={{ color: colors.text }} className="text-[12px] font-mono">
                        {loc}
                      </span>
                      <button
                        onClick={() => setSelectedLocations(prev => prev.filter(l => l !== loc))}
                        style={{ color: colors.textTertiary }}
                        className="hover:opacity-70"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={selectedLocations.length === 0 || isDownloading}
              style={{
                backgroundColor: selectedLocations.length > 0 && !isDownloading ? colors.controlAccent : colors.bgTertiary,
                color: selectedLocations.length > 0 && !isDownloading ? '#fff' : colors.textTertiary,
              }}
              className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {isDownloading ? '...' : t('shelf.download.downloadSelected')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
