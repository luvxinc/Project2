'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import PValveTabSelector from '../components/PValveTabSelector';
import ProductDetailModal from './ProductDetailModal';

type SubTab = 'pvalve' | 'deliverySystem' | 'fitMatrix';

interface PValveProduct {
  id: string;
  model: string;
  specification: string;
  diameterA: number | null;
  diameterB: number | null;
  diameterC: number | null;
  expandedLengthD: number | null;
  expandedLengthE: number | null;
  crimpedTotalLength: number | null;
  deliverySystemFits: { deliverySystem: { id: string; model: string; specification: string } }[];
}

interface DeliverySystemProduct {
  id: string;
  model: string;
  specification: string;
  pvalveFits: { pvalve: { id: string; model: string; specification: string } }[];
}

export default function ProductManagementPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  const [subTab, setSubTab] = useState<SubTab>('pvalve');
  const [pvalveProducts, setPValveProducts] = useState<PValveProduct[]>([]);
  const [dsProducts, setDsProducts] = useState<DeliverySystemProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalItem, setModalItem] = useState<{ type: 'pvalve'; product: PValveProduct } | { type: 'ds'; product: DeliverySystemProduct } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pvRes, dsRes] = await Promise.all([
        fetch(`${API}/vma/pvalve-products`, { headers: getAuthHeaders(), credentials: 'include' }),
        fetch(`${API}/vma/delivery-system-products`, { headers: getAuthHeaders(), credentials: 'include' }),
      ]);
      if (pvRes.ok) setPValveProducts(await pvRes.json());
      if (dsRes.ok) setDsProducts(await dsRes.json());
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'pvalve', label: 'P-Valve' },
    { key: 'deliverySystem', label: 'Delivery System' },
    { key: 'fitMatrix', label: 'Fit Matrix' },
  ];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Apple 风格 Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      {/* Sub-Pill Selector */}
      <div className="max-w-[1200px] mx-auto px-6 mb-6">
        <div
          className="inline-flex items-center rounded-xl"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f0f0f5',
            padding: '3px',
          }}
        >
          {subTabs.map((tab) => {
            const isActive = subTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSubTab(tab.key)}
                className="relative rounded-lg select-none whitespace-nowrap transition-all duration-200"
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                  color: isActive
                    ? (theme === 'dark' ? '#ffffff' : '#1d1d1f')
                    : (theme === 'dark' ? 'rgba(255,255,255,0.45)' : '#86868b'),
                  backgroundColor: isActive
                    ? (theme === 'dark' ? 'rgba(255,255,255,0.12)' : '#ffffff')
                    : 'transparent',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: colors.textTertiary }}>
            <span className="text-[15px]">Loading product catalog...</span>
          </div>
        ) : subTab === 'pvalve' ? (
          <PValveTable products={pvalveProducts} colors={colors} theme={theme} onRowClick={(p) => setModalItem({ type: 'pvalve', product: p })} />
        ) : subTab === 'deliverySystem' ? (
          <DeliverySystemTable products={dsProducts} colors={colors} theme={theme} onRowClick={(p) => setModalItem({ type: 'ds', product: p })} />
        ) : (
          <FitMatrixView pvalves={pvalveProducts} deliverySystems={dsProducts} colors={colors} theme={theme} />
        )}
      </div>

      {modalItem && (
        <ProductDetailModal
          item={modalItem}
          colors={colors}
          theme={theme}
          onClose={() => setModalItem(null)}
        />
      )}
    </div>
  );
}

// ================================
// P-Valve Table Component
// ================================
function PValveTable({ products, colors, theme, onRowClick }: { products: PValveProduct[]; colors: any; theme: string; onRowClick: (p: PValveProduct) => void }) {
  const columns = ['Model', 'Specification', 'Dia. A', 'Dia. B', 'Dia. C', 'Exp. D', 'Exp. E', 'Crimped', 'Fits DS'];

  return (
    <div
      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      className="rounded-2xl border overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bgTertiary }}>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.textSecondary }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                <p className="text-[15px] font-medium">No P-Valve products</p>
              </td>
            </tr>
          ) : (
            products.map((p, idx) => (
              <tr
                key={p.id}
                style={{
                  borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none',
                  cursor: 'pointer',
                }}
                className="hover:opacity-80 transition-opacity"
                onClick={() => onRowClick(p)}
              >
                <td className="px-4 py-3 text-[13px] font-medium" style={{ color: colors.text }}>{p.model}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.controlAccent, fontWeight: 600 }}>{p.specification}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.diameterA ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.diameterB ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.diameterC ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.expandedLengthD ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.expandedLengthE ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.text }}>{p.crimpedTotalLength ?? '—'}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                  {p.deliverySystemFits.length > 0
                    ? p.deliverySystemFits.map(f => f.deliverySystem.specification).join(', ')
                    : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ================================
// Delivery System Table Component
// ================================
function DeliverySystemTable({ products, colors, theme, onRowClick }: { products: DeliverySystemProduct[]; colors: any; theme: string; onRowClick: (p: DeliverySystemProduct) => void }) {
  const columns = ['Model', 'Specification', 'Fits P-Valve(s)'];

  return (
    <div
      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      className="rounded-2xl border overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bgTertiary }}>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.textSecondary }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                <p className="text-[15px] font-medium">No Delivery System products</p>
              </td>
            </tr>
          ) : (
            products.map((p, idx) => (
              <tr
                key={p.id}
                style={{
                  borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none',
                  cursor: 'pointer',
                }}
                className="hover:opacity-80 transition-opacity"
                onClick={() => onRowClick(p)}
              >
                <td className="px-4 py-3 text-[13px] font-medium" style={{ color: colors.text }}>{p.model}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.controlAccent, fontWeight: 600 }}>{p.specification}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                  {p.pvalveFits.length > 0
                    ? p.pvalveFits.map(f => f.pvalve.specification).join(', ')
                    : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ================================
// Fit Matrix View Component
// ================================
function FitMatrixView({
  pvalves,
  deliverySystems,
  colors,
  theme,
}: {
  pvalves: PValveProduct[];
  deliverySystems: DeliverySystemProduct[];
  colors: any;
  theme: string;
}) {
  // Build a fit lookup: DS spec → Set<PV spec>
  const fitLookup = new Map<string, Set<string>>();
  deliverySystems.forEach(ds => {
    const pvSpecs = new Set(ds.pvalveFits.map(f => f.pvalve.specification));
    fitLookup.set(ds.specification, pvSpecs);
  });

  return (
    <div
      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      className="rounded-2xl border overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: colors.bgTertiary }}>
              <th
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-0"
                style={{ color: colors.textSecondary, backgroundColor: colors.bgTertiary }}
              >
                P-Valve ↓ / DS →
              </th>
              {deliverySystems.map(ds => (
                <th
                  key={ds.id}
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  <div>{ds.specification}</div>
                  <div className="font-normal normal-case mt-0.5" style={{ color: colors.textTertiary, fontSize: '11px' }}>
                    {ds.model}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pvalves.map((pv, idx) => (
              <tr
                key={pv.id}
                style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }}
              >
                <td
                  className="px-4 py-3 text-[13px] font-medium sticky left-0"
                  style={{ color: colors.text, backgroundColor: colors.bgSecondary }}
                >
                  <span style={{ color: colors.controlAccent, fontWeight: 600 }}>{pv.specification}</span>
                  <span style={{ color: colors.textTertiary }} className="ml-2 text-[11px]">({pv.model})</span>
                </td>
                {deliverySystems.map(ds => {
                  const fits = fitLookup.get(ds.specification)?.has(pv.specification);
                  return (
                    <td key={ds.id} className="px-4 py-3 text-center">
                      {fits ? (
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-bold"
                          style={{
                            backgroundColor: theme === 'dark' ? 'rgba(52, 199, 89, 0.2)' : 'rgba(52, 199, 89, 0.12)',
                            color: '#34c759',
                          }}
                        >
                          ✓
                        </span>
                      ) : (
                        <span style={{ color: colors.textTertiary, fontSize: '13px' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
