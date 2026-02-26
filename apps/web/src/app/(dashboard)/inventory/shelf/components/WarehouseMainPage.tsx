'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { inventoryApi } from '@/lib/api/inventory';
import { hexToRgba } from '@/lib/status-colors';
import type {
  WarehouseNode,
  WarehouseInventoryResponse,
  WarehouseProductListResponse,
} from '@/lib/api/inventory';
import type { InventoryIndex, LocationInventoryData } from './three/ShelfBay';

const WarehouseScene = dynamic(
  () => import('./three/WarehouseScene').then(m => ({ default: m.WarehouseScene })),
  { ssr: false }
);

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════
interface WarehouseMainPageProps {
  warehouse: WarehouseNode;
  onBack: () => void;
  onEdit: (wh: WarehouseNode) => void;
}

// ═══════════════════════════════════════
// Component
// ═══════════════════════════════════════
export function WarehouseMainPage({ warehouse, onBack, onEdit }: WarehouseMainPageProps) {
  const t = useTranslations('inventory.shelf.main');
  const tShelf = useTranslations('inventory.shelf');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // State
  const [inventory, setInventory] = useState<WarehouseInventoryResponse | null>(null);
  const [products, setProducts] = useState<WarehouseProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverData, setHoverData] = useState<LocationInventoryData | null>(null);
  const [hoverLabel, setHoverLabel] = useState('');

  const handleHoverLocation = useCallback((data: LocationInventoryData | null, label: string) => {
    setHoverData(data);
    setHoverLabel(label);
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, prod] = await Promise.all([
        inventoryApi.getWarehouseInventory(warehouse.warehouse),
        inventoryApi.getWarehouseProducts(warehouse.warehouse),
      ]);
      console.log('[WarehouseMainPage] inventory loaded:', inv?.locations?.length, 'locations, occupied:', inv?.occupiedLocations);
      console.log('[WarehouseMainPage] products loaded:', prod?.products?.length, 'products');
      setInventory(inv);
      setProducts(prod);
    } catch (err) {
      console.error('[WarehouseMainPage] API FAILED:', err);
    } finally {
      setLoading(false);
    }
  }, [warehouse.warehouse]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build InventoryIndex for 3D scene hover
  // Key format: "aisle_bay_level_bin_slot" (exact) or "aisle_bay_level_bin_" (bin-level fallback)
  const inventoryIndex: InventoryIndex = useMemo(() => {
    const idx: InventoryIndex = new Map();
    if (!inventory) return idx;

    // First pass: index exact location keys
    for (const loc of inventory.locations) {
      const key = `${loc.aisle}_${loc.bay}_${loc.level}_${loc.bin || ''}_${loc.slot || ''}`;
      if (loc.items.length > 0) {
        idx.set(key, {
          items: loc.items.map(item => ({
            sku: item.sku,
            qtyPerBox: item.qtyPerBox,
            numOfBox: item.numOfBox,
            totalQty: item.totalQty,
          })),
        });
      }
    }

    // Second pass: aggregate at bin level (aisle_bay_level_bin_)
    // So when ShelfBay queries a slot that has no data, it can fallback to the bin aggregate
    const binAgg = new Map<string, Map<string, { sku: string; qtyPerBox: number; numOfBox: number; totalQty: number }>>();
    for (const loc of inventory.locations) {
      if (loc.items.length === 0) continue;
      const binKey = `${loc.aisle}_${loc.bay}_${loc.level}_${loc.bin || ''}_`;
      if (!binAgg.has(binKey)) binAgg.set(binKey, new Map());
      const skuMap = binAgg.get(binKey)!;
      for (const item of loc.items) {
        if (skuMap.has(item.sku)) {
          const existing = skuMap.get(item.sku)!;
          existing.numOfBox += item.numOfBox;
          existing.totalQty += item.totalQty;
        } else {
          skuMap.set(item.sku, { ...item });
        }
      }
    }
    for (const [binKey, skuMap] of binAgg) {
      if (!idx.has(binKey)) {
        idx.set(binKey, { items: [...skuMap.values()] });
      }
    }

    console.log('[InventoryIndex]', idx.size, 'entries. Sample keys:', [...idx.keys()].slice(0, 8));
    return idx;
  }, [inventory]);

  const cardBg = colors.bgSecondary;
  const borderColor = colors.separator;

  return (
    <div className="animate-slide-in space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
            style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
              style={{ color: colors.textSecondary }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold" style={{ color: colors.text }}>
              {warehouse.warehouse}
            </h2>
            <p className="text-xs" style={{ color: colors.textTertiary }}>
              {warehouse.totalLocations} {tShelf('card.locations')}
              {inventory && ` · ${inventory.occupiedLocations} occupied`}
            </p>
          </div>
        </div>

        {/* Edit button — disabled if has inventory */}
        <button
          onClick={() => onEdit(warehouse)}
          disabled={warehouse.hasInventory}
          className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: warehouse.hasInventory ? colors.bgTertiary : hexToRgba(colors.controlAccent, 0.1),
            color: warehouse.hasInventory ? colors.textTertiary : colors.controlAccent,
            border: `1px solid ${warehouse.hasInventory ? borderColor : hexToRgba(colors.controlAccent, 0.3)}`,
          }}
          title={warehouse.hasInventory ? t('hasInventoryLocked') : ''}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          {t('editBtn')}
          {warehouse.hasInventory && (
            <svg className="w-3.5 h-3.5 ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {/* ═══ 3D Inventory Map + Side Panel ═══ */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#1a1d24', border: `1px solid ${borderColor}` }}>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${borderColor}`, background: cardBg }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{t('inventoryTitle')}</h3>
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('inventorySubtitle')}</p>
          </div>
          {inventory && (
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2 py-1 rounded-lg" style={{ background: hexToRgba(colors.green, 0.1), color: colors.green }}>
                {inventory.occupiedLocations} occupied
              </span>
              <span className="px-2 py-1 rounded-lg" style={{ background: hexToRgba(colors.textTertiary, 0.08), color: colors.textTertiary }}>
                {inventory.totalLocations - inventory.occupiedLocations} empty
              </span>
            </div>
          )}
        </div>

        {/* Split: Left 2/3 = 3D, Right 1/3 = Details Panel */}
        <div className="flex" style={{ height: '500px' }}>
          {/* Left: 3D Scene */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: colors.controlAccent, borderTopColor: 'transparent' }} />
              </div>
            ) : (
              <WarehouseScene
                warehouseData={warehouse}
                mini={false}
                inventoryIndex={inventoryIndex}
                showInventory={true}
                onHoverLocation={handleHoverLocation}
              />
            )}
          </div>

          {/* Right: Location Detail Panel */}
          <div className="flex-shrink-0 overflow-y-auto"
            style={{
              width: '33.333%',
              borderLeft: `1px solid ${borderColor}`,
              background: cardBg,
            }}>
            {hoverData && hoverData.items.length > 0 ? (
              <div className="p-4 space-y-3">
                {/* Location header */}
                <div className="flex items-center gap-2 pb-2" style={{ borderBottom: `1px solid ${borderColor}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: hexToRgba(colors.controlAccent, 0.15) }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                      style={{ color: colors.controlAccent }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-bold font-mono" style={{ color: colors.controlAccent }}>
                      {warehouse.warehouse} {hoverLabel}
                    </div>
                    <div className="text-[10px]" style={{ color: colors.textTertiary }}>
                      {hoverData.items.length} SKU{hoverData.items.length > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Product list */}
                <div className="space-y-2">
                  {hoverData.items.map((item, idx) => (
                    <div key={idx} className="rounded-lg p-3"
                      style={{ background: hexToRgba(colors.bgTertiary, 0.5), border: `1px solid ${hexToRgba(borderColor, 0.5)}` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold font-mono" style={{ color: colors.text }}>{item.sku}</span>
                        <span className="text-sm font-bold" style={{ color: colors.green }}>{item.totalQty}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: colors.textTertiary }}>
                        <span>{item.qtyPerBox}/box</span>
                        <span>x {item.numOfBox} boxes</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${borderColor}` }}>
                  <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total</span>
                  <span className="text-sm font-bold" style={{ color: colors.text }}>
                    {hoverData.items.reduce((sum, i) => sum + i.totalQty, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: hexToRgba(colors.textTertiary, 0.06) }}>
                  <svg className="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}
                    style={{ color: colors.textTertiary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Hover a location</p>
                  <p className="text-[10px]" style={{ color: colors.textTertiary }}>Move your cursor over a shelf to see product details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Product Summary Table ═══ */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{t('productListTitle')}</h3>
            <p className="text-xs" style={{ color: colors.textTertiary }}>{t('productListSubtitle')}</p>
          </div>
          {products && (
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2.5 py-1 rounded-lg font-medium" style={{ background: hexToRgba(colors.blue, 0.1), color: colors.blue }}>
                {t('totalSkus')}: {products.totalSkus}
              </span>
              <span className="px-2.5 py-1 rounded-lg font-medium" style={{ background: hexToRgba(colors.green, 0.1), color: colors.green }}>
                {t('totalQty')}: {products.totalQuantity.toLocaleString()}
              </span>
              <span className="px-2.5 py-1 rounded-lg font-medium" style={{ background: hexToRgba(colors.orange, 0.1), color: colors.orange }}>
                {t('totalValue')}: ${products.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: colors.controlAccent, borderTopColor: 'transparent' }} />
            </div>
          ) : !products || products.products.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center gap-2">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}
                style={{ color: colors.textTertiary }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="text-xs" style={{ color: colors.textTertiary }}>{t('noInventory')}</p>
              <p className="text-[10px]" style={{ color: colors.textTertiary }}>{t('noInventoryDesc')}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: hexToRgba(colors.bgTertiary, 0.5) }}>
                  <th className="px-4 py-2.5 text-left font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: cardBg }}>#</th>
                  <th className="px-4 py-2.5 text-left font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: cardBg }}>{t('sku')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: cardBg }}>{t('qty')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: cardBg }}>{t('fifoCost')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0"
                    style={{ color: colors.textSecondary, backgroundColor: cardBg }}>{t('value')}</th>
                </tr>
              </thead>
              <tbody>
                {products.products.map((p, i) => (
                  <tr key={p.sku}
                    className="transition-colors hover:opacity-90"
                    style={{ borderTop: `1px solid ${borderColor}` }}>
                    <td className="px-4 py-2" style={{ color: colors.textTertiary }}>{i + 1}</td>
                    <td className="px-4 py-2 font-mono font-bold" style={{ color: colors.text }}>{p.sku}</td>
                    <td className="px-4 py-2 text-right font-medium" style={{ color: colors.text }}>
                      {p.totalQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right" style={{ color: colors.textSecondary }}>
                      ${p.fifoCost.toFixed(4)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium" style={{ color: colors.green }}>
                      ${p.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══ CSS Animation ═══ */}
      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in { animation: slideIn 0.4s ease-out; }
      `}</style>
    </div>
  );
}
