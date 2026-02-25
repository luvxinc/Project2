'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { WarehouseNode } from '@/lib/api/inventory';
import { LEVEL_COLORS } from '../constants';

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
    <div>
      {/* ═══ 3D Card — large rounded card ═══ */}
      <div
        style={{
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
        }}
        className="relative overflow-hidden rounded-[22px] border h-[512px] transition-transform duration-300 hover:scale-[1.01] group cursor-pointer"
        onClick={onEdit}
      >
        {/* 3D Scene filling the entire card */}
        <div className="absolute inset-0">
          <WarehouseScene warehouseData={warehouse} mini />
        </div>

        {/* Warehouse name overlay — top left */}
        <div className="absolute top-4 left-5 z-10">
          <h3
            style={{ color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
            className="text-[26px] font-bold tracking-tight"
          >
            {warehouse.warehouse}
          </h3>
        </div>

        {/* Stats overlay — bottom with gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 px-5 py-3 flex items-center gap-4"
          style={{
            background: theme === 'dark'
              ? 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)'
              : 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)',
          }}
        >
          <div>
            <div className="text-[18px] font-bold text-white">{warehouse.totalLocations}</div>
            <div className="text-[11px] text-white/60">{t('shelf.card.locations')}</div>
          </div>
          <div className="w-px h-6 bg-white/20" />
          <div>
            <div className="text-[18px] font-bold text-white">{aisleCount}</div>
            <div className="text-[11px] text-white/60">{t('shelf.card.aisles')}</div>
          </div>
          <div className="w-px h-6 bg-white/20" />
          <div>
            <div className="text-[18px] font-bold text-white">{bayCount}</div>
            <div className="text-[11px] text-white/60">{t('shelf.card.bays')}</div>
          </div>
          <div className="w-px h-7 bg-white/20" />
          <div>
            <div className="flex items-center gap-1.5">
              {Array.from(levelSet).sort().map(l => (
                <span
                  key={l}
                  style={{ color: LEVEL_COLORS[l] || '#fff' }}
                  className="text-[13px] font-bold"
                >
                  {l}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-white/60">{t('shelf.card.levels')}</div>
          </div>
        </div>
      </div>

      {/* ═══ Info + Actions below card ═══ */}
      <div className="mt-5 px-1">
        {/* Title */}
        <h2
          style={{ color: colors.text }}
          className="text-[20px] font-semibold text-center mb-1"
        >
          {warehouse.warehouse}
        </h2>
        <p style={{ color: colors.textSecondary }} className="text-[13px] text-center mb-4">
          {warehouse.totalLocations} {t('shelf.card.locations')} · {aisleCount} {t('shelf.card.aisles')} · {bayCount} {t('shelf.card.bays')}
        </p>

        {/* Action buttons — one per row, full-width, fixed height */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onEdit}
            className="w-full h-[34px] flex items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: colors.controlAccent, color: '#fff' }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            <span className="truncate">{t('shelf.card.edit')}</span>
          </button>

          <button
            onClick={onDownload}
            className="w-full h-[34px] flex items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-all hover:opacity-80"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="truncate">{t('shelf.card.download')}</span>
          </button>

          <button
            onClick={onCustomDownload}
            className="w-full h-[34px] flex items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-all hover:opacity-80"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            <span className="truncate">{t('shelf.card.customDownload')}</span>
          </button>

          <button
            onClick={onDelete}
            className="w-full h-[34px] flex items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-all hover:opacity-80"
            style={{ backgroundColor: `${colors.red}12`, color: colors.red }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span className="truncate">{t('shelf.card.delete')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
