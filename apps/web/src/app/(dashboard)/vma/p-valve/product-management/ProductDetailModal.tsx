'use client';

import ValveWireframe from './ValveWireframe';

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
  fits: { id: string; model: string; specification: string }[];
}

interface DeliverySystemProduct {
  id: string;
  model: string;
  specification: string;
  fits: { id: string; model: string; specification: string }[];
}

type ModalProduct =
  | { type: 'pvalve'; product: PValveProduct }
  | { type: 'ds'; product: DeliverySystemProduct };

interface ProductDetailModalProps {
  item: ModalProduct;
  colors: any;
  theme: string;
  onClose: () => void;
}

export default function ProductDetailModal({ item, colors, theme, onClose }: ProductDetailModalProps) {
  const isPValve = item.type === 'pvalve';
  const pv = isPValve ? item.product as PValveProduct : null;
  const ds = !isPValve ? item.product as DeliverySystemProduct : null;

  const pvSpecs = pv ? [
    { label: 'Diameter A (Outflow OD)', value: pv.diameterA, unit: 'mm', desc: '出流端外径', key: 'A' },
    { label: 'Diameter B (Straight Section)', value: pv.diameterB, unit: 'mm', desc: '直段外径', key: 'B' },
    { label: 'Diameter C (Inflow OD)', value: pv.diameterC, unit: 'mm', desc: '入流端外径', key: 'C' },
    { label: 'Expanded Length D', value: pv.expandedLengthD, unit: 'mm', desc: '直段长度', key: 'D' },
    { label: 'Expanded Length E', value: pv.expandedLengthE, unit: 'mm', desc: '展开总长度', key: 'E' },
    { label: 'Crimped Total Length', value: pv.crimpedTotalLength, unit: 'mm', desc: '压握总长度', key: 'F' },
  ] : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* Close button — floating top-right */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
        }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* ESC hint */}
      <span className="absolute top-6 right-[68px] text-[10px] font-medium tracking-wider uppercase" style={{
        color: theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      }}>ESC</span>

      {/* Title — floating top-left */}
      <div className="absolute top-5 left-6 z-10">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider" style={{
            backgroundColor: isPValve ? `${colors.blue}26` : `${colors.indigo}26`,
            color: isPValve ? colors.blue : colors.indigo,
          }}>
            {isPValve ? 'P-Valve' : 'Delivery System'}
          </span>
          <div>
            <h2 className="text-[20px] font-bold" style={{ color: colors.text }}>
              {item.product.specification}
            </h2>
            <p className="text-[13px]" style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
              Model: {item.product.model}
            </p>
          </div>
        </div>
      </div>

      {/* Main content — 50/50 left-right split */}
      <div className="flex w-full h-full pt-16">
        {/* Left: 3D Wireframe — fills entire left half */}
        {isPValve && pv && pv.diameterA && pv.diameterB && pv.diameterC && pv.expandedLengthD && pv.expandedLengthE && pv.crimpedTotalLength ? (
          <div className="w-1/2 flex items-center justify-center" style={{
            background: theme === 'dark'
              ? `radial-gradient(circle at 50% 50%, ${colors.blue}0d, transparent 60%)`
              : `radial-gradient(circle at 50% 50%, ${colors.blue}0a, transparent 60%)`,
          }}>
            <ValveWireframe
              diameterA={pv.diameterA}
              diameterB={pv.diameterB}
              diameterC={pv.diameterC}
              expandedLengthD={pv.expandedLengthD}
              expandedLengthE={pv.expandedLengthE}
              crimpedTotalLength={pv.crimpedTotalLength}
              width={Math.min(700, Math.round(window.innerWidth * 0.42))}
              height={Math.min(800, Math.round(window.innerHeight * 0.78))}
              theme={theme}
            />
          </div>
        ) : <div className="w-1/2" />}

        {/* Right: Specifications panel */}
        <div className="w-1/2 flex items-center">
          <div className="px-10 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 100px)', width: '100%', maxWidth: '420px' }}>
          {isPValve && pv ? (
            <>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{
                color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
              }}>Dimensions</h3>
              <div className="space-y-0">
                {pvSpecs.map((spec, idx) => (
                  <div key={spec.label} className="flex items-center justify-between py-3" style={{
                    borderBottom: idx < pvSpecs.length - 1
                      ? `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
                      : 'none',
                  }}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold" style={{
                        backgroundColor: `${colors.blue}1f`,
                        color: colors.blue,
                      }}>{spec.key}</span>
                      <div>
                        <p className="text-[13px] font-medium" style={{
                          color: colors.text,
                        }}>{spec.label}</p>
                        <p className="text-[11px]" style={{
                          color: theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
                        }}>{spec.desc}</p>
                      </div>
                    </div>
                    <span className="text-[16px] font-bold tabular-nums ml-4" style={{
                      color: colors.blue,
                    }}>
                      {spec.value != null ? `${spec.value} ${spec.unit}` : '—'}
                    </span>
                  </div>
                ))}
              </div>

              <h3 className="text-[11px] font-semibold uppercase tracking-widest mt-6 mb-3" style={{
                color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
              }}>Compatible Delivery Systems</h3>
              <div className="flex flex-wrap gap-2">
                {(pv.fits || []).length > 0 ? pv.fits.map(f => (
                  <span key={f.id} className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{
                    backgroundColor: `${colors.indigo}1f`,
                    color: colors.indigo,
                  }}>
                    {f.specification}
                    <span className="ml-1.5 font-normal text-[11px]" style={{
                      color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                    }}>({f.model})</span>
                  </span>
                )) : (
                  <p className="text-[13px]" style={{
                    color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                  }}>None configured</p>
                )}
              </div>
            </>
          ) : ds ? (
            <>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{
                color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
              }}>Product Details</h3>
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>Model</span>
                  <span className="text-[16px] font-bold" style={{ color: colors.text }}>{ds.model}</span>
                </div>
                <div className="h-px" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>Specification</span>
                  <span className="text-[16px] font-bold" style={{ color: colors.blue }}>{ds.specification}</span>
                </div>
              </div>

              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{
                color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
              }}>Compatible P-Valves</h3>
              <div className="flex flex-wrap gap-2">
                {(ds.fits || []).length > 0 ? ds.fits.map(f => (
                  <span key={f.id} className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{
                    backgroundColor: `${colors.blue}1f`,
                    color: colors.blue,
                  }}>
                    {f.specification}
                    <span className="ml-1.5 font-normal text-[11px]" style={{
                      color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                    }}>({f.model})</span>
                  </span>
                )) : (
                  <p className="text-[13px]" style={{
                    color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                  }}>None configured</p>
                )}
              </div>
            </>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
