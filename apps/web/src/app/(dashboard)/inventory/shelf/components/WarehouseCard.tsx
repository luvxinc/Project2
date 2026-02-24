'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { WarehouseNode } from '@/lib/api/inventory';

const WarehouseScene = dynamic(
  () => import('./three/WarehouseScene').then(m => ({ default: m.WarehouseScene })),
  { ssr: false }
);

interface WarehouseCardProps {
  warehouse: WarehouseNode;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCustomDownload: () => void;
}

export function WarehouseCard({
  warehouse,
  onEdit,
  onDelete,
  onDownload,
  onCustomDownload,
}: WarehouseCardProps) {
  const t = useTranslations('inventory');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const aisleCount = warehouse.aisles.length;
  const bayCount = warehouse.aisles.reduce((sum, a) => sum + a.bays.length, 0);
  const levelSet = new Set<string>();
  warehouse.aisles.forEach(a => a.bays.forEach(b => b.levels.forEach(l => levelSet.add(l.level))));

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderColor: colors.border,
      }}
      className="rounded-2xl border overflow-hidden transition-transform duration-200 hover:scale-[1.01]"
    >
      {/* 3D Preview */}
      <div className="h-[180px] relative">
        <WarehouseScene warehouseData={warehouse} mini />
        {/* Warehouse name overlay */}
        <div className="absolute top-3 left-4">
          <h3
            style={{ color: colors.text }}
            className="text-[18px] font-semibold"
          >
            {warehouse.warehouse}
          </h3>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{ borderColor: `${colors.border}60` }}
        className="border-t px-4 py-3"
      >
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div style={{ color: colors.text }} className="text-[16px] font-semibold">
              {warehouse.totalLocations}
            </div>
            <div style={{ color: colors.textTertiary }} className="text-[10px]">
              {t('shelf.card.locations')}
            </div>
          </div>
          <div>
            <div style={{ color: colors.text }} className="text-[16px] font-semibold">
              {aisleCount}
            </div>
            <div style={{ color: colors.textTertiary }} className="text-[10px]">
              {t('shelf.card.aisles')}
            </div>
          </div>
          <div>
            <div style={{ color: colors.text }} className="text-[16px] font-semibold">
              {bayCount}
            </div>
            <div style={{ color: colors.textTertiary }} className="text-[10px]">
              {t('shelf.card.bays')}
            </div>
          </div>
          <div>
            <div style={{ color: colors.text }} className="text-[16px] font-semibold flex items-center justify-center gap-1">
              {Array.from(levelSet).sort().map(l => (
                <span
                  key={l}
                  style={{ color: l === 'G' ? '#4CAF50' : l === 'M' ? '#2196F3' : '#FF9800' }}
                  className="text-[12px] font-bold"
                >
                  {l}
                </span>
              ))}
            </div>
            <div style={{ color: colors.textTertiary }} className="text-[10px]">
              {t('shelf.card.levels')}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{ borderColor: `${colors.border}60` }}
        className="border-t px-4 py-2.5 flex items-center gap-2"
      >
        <button
          onClick={onEdit}
          style={{ color: colors.controlAccent }}
          className="text-[12px] font-medium hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          {t('shelf.card.edit')}
        </button>

        <div style={{ backgroundColor: colors.border }} className="w-px h-3" />

        <button
          onClick={onDelete}
          style={{ color: colors.red }}
          className="text-[12px] font-medium hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {t('shelf.card.delete')}
        </button>

        <div className="flex-1" />

        <button
          onClick={onDownload}
          style={{ color: colors.textSecondary }}
          className="text-[12px] font-medium hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          PDF
        </button>

        <div style={{ backgroundColor: colors.border }} className="w-px h-3" />

        <button
          onClick={onCustomDownload}
          style={{ color: colors.textSecondary }}
          className="text-[12px] font-medium hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          {t('shelf.card.customDownload')}
        </button>
      </div>
    </div>
  );
}
