'use client';

import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import PValveTabSelector from '../components/PValveTabSelector';

// ═══════════════ Types ═══════════════

interface FridgeSlot {
  id: string;
  shelfNo: number;
  rowNo: number;
  colNo: number;
  productType: string;
  specNo: string;
  serialNo: string | null;
  batchNo: string | null;
  expDate: string | null;
  placedAt: string;
  placedBy: string | null;
}

interface SpecOption {
  specification: string;
  model: string;
}

/** Eligible product from GET /vma/fridge-slots/eligible */
interface EligibleProduct {
  specNo: string;
  serialNo: string;
  expDate: string | null;
  batchNo: string | null;
  status: string;         // AVAILABLE, NEAR_EXP, EXPIRED, DEMO
  alreadyInFridge: boolean;
}

// ═══════════════ Constants ═══════════════

// Left door shelves (odd): 1,3,5,7,9 — top to bottom
const LEFT_SHELVES = [1, 3, 5, 7, 9];
// Right door shelves (even): 2,4,6,8,10 — top to bottom
const RIGHT_SHELVES = [2, 4, 6, 8, 10];
const ROWS = 3;
const COLS = 4;

// ═══════════════ Component ═══════════════

export default function FridgeShelfPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  const [slots, setSlots] = useState<FridgeSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<{
    type: 'place' | 'view';
    shelfNo: number;
    rowNo: number;
    colNo: number;
    slot?: FridgeSlot;
  } | null>(null);

  // Place form state — P-Valve only (fridge is exclusively for P-Valve)
  const PRODUCT_TYPE = 'PVALVE';
  const [placeSpec, setPlaceSpec] = useState('');
  const [placeSerial, setPlaceSerial] = useState('');
  const [saving, setSaving] = useState(false);

  // Eligible products data (from new endpoint)
  const [eligibleMap, setEligibleMap] = useState<Record<string, EligibleProduct[]>>({});
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [specOptions, setSpecOptions] = useState<SpecOption[]>([]);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Data Fetching ───

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers as Record<string, string> || {}) }, credentials: 'include' });
    // 401 → JWT expired — force redirect to login
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      document.cookie = 'auth_session=; path=/; max-age=0';
      if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return res;
  }, []);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/vma/fridge-slots`);
      if (res.ok) setSlots(await res.json());
    } catch (e) {
      console.error('Failed to fetch fridge slots', e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const fetchEligibleProducts = useCallback(async () => {
    setLoadingEligible(true);
    try {
      const [eligRes, specRes] = await Promise.all([
        apiFetch(`${API}/vma/fridge-slots/eligible`),
        apiFetch(`${API}/vma/inventory-transactions/spec-options?productType=PVALVE`),
      ]);
      if (eligRes.ok) setEligibleMap(await eligRes.json());
      if (specRes.ok) setSpecOptions(await specRes.json());
    } catch (e) {
      console.error('Failed to fetch eligible products', e);
    } finally {
      setLoadingEligible(false);
    }
  }, [apiFetch]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // ─── Slot helpers ───

  const getSlot = (shelfNo: number, rowNo: number, colNo: number): FridgeSlot | undefined =>
    slots.find(s => s.shelfNo === shelfNo && s.rowNo === rowNo && s.colNo === colNo);

  const usedCount = slots.length;
  const totalCount = 10 * ROWS * COLS;

  // Selected serial's info (auto-fill)
  const selectedProduct = placeSpec && placeSerial
    ? eligibleMap[placeSpec]?.find(p => p.serialNo === placeSerial)
    : null;

  // ─── Actions ───

  const handleSlotClick = (shelfNo: number, rowNo: number, colNo: number) => {
    const existing = getSlot(shelfNo, rowNo, colNo);
    if (existing) {
      setModal({ type: 'view', shelfNo, rowNo, colNo, slot: existing });
    } else {
      setPlaceSpec('');
      setPlaceSerial('');
      fetchEligibleProducts();
      setModal({ type: 'place', shelfNo, rowNo, colNo });
    }
  };

  const handlePlace = async () => {
    if (!modal || !placeSpec) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/vma/fridge-slots`, {
        method: 'POST',
        body: JSON.stringify({
          shelfNo: modal.shelfNo,
          rowNo: modal.rowNo,
          colNo: modal.colNo,
          productType: PRODUCT_TYPE,
          specNo: placeSpec,
          serialNo: placeSerial,
        }),
      });
      if (res.ok) {
        showToast(t('p_valve.fridgeShelf.placed'), 'ok');
        setModal(null);
        fetchSlots();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'Failed to place', 'err');
      }
    } catch {
      showToast('Network error', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await apiFetch(`${API}/vma/fridge-slots/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(t('p_valve.fridgeShelf.removed'), 'ok');
        setModal(null);
        fetchSlots();
      }
    } catch {
      showToast('Failed to remove', 'err');
    }
  };

  // ─── Print ───

  const handlePrint = () => {
    const getSlotForPrint = (shelfNo: number, rowNo: number, colNo: number) =>
      slots.find(s => s.shelfNo === shelfNo && s.rowNo === rowNo && s.colNo === colNo);

    const renderShelfHTML = (shelfNo: number) => {
      const shelfSlots = slots.filter(s => s.shelfNo === shelfNo);
      let rows = '';
      for (let c = 1; c <= COLS; c++) {
        let cells = '';
        for (let r = 1; r <= ROWS; r++) {
          const slot = getSlotForPrint(shelfNo, r, c);
          if (slot) {
            const isExpired = slot.expDate ? slot.expDate < new Date().toISOString().slice(0, 10) : false;
            cells += `
              <td class="slot occupied ${isExpired ? 'expired' : ''}">
                <div class="spec">${slot.specNo}</div>
                <div class="sn">SN: ${slot.serialNo || '—'}</div>
                <div class="meta">${slot.batchNo ? 'Batch: ' + slot.batchNo : ''}</div>
                <div class="meta exp">${slot.expDate ? 'Exp: ' + slot.expDate : ''}</div>
              </td>`;
          } else {
            cells += '<td class="slot empty"></td>';
          }
        }
        rows += `<tr>${cells}</tr>`;
      }
      return `
        <div class="shelf">
          <div class="shelf-label">Shelf ${shelfNo} <span class="shelf-count">(${shelfSlots.length}/${ROWS * COLS})</span></div>
          <table class="shelf-grid"><tbody>${rows}</tbody></table>
        </div>`;
    };

    const renderDoorHTML = (shelves: number[], label: string) => {
      return `
        <div class="door">
          <div class="door-label">${label}</div>
          ${shelves.map(s => renderShelfHTML(s)).join('')}
        </div>`;
    };

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Fridge Shelf Layout — ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #1d1d1f; padding: 20px; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print { body { padding: 0; } .no-print { display: none !important; } }
    .header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e5e5; }
    .header h1 { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
    .header .subtitle { font-size: 11px; color: #86868b; margin-top: 4px; }
    .header .stats { display: flex; justify-content: center; gap: 32px; margin-top: 8px; font-size: 12px; }
    .header .stats .stat-val { font-size: 16px; font-weight: 700; }
    .header .stats .stat-label { color: #86868b; font-size: 10px; }
    .fridge { display: flex; gap: 16px; }
    .door { flex: 1; }
    .door-label { text-align: center; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #86868b; margin-bottom: 8px; }
    .shelf { margin-bottom: 8px; }
    .shelf-label { font-size: 9px; font-weight: 600; color: #6e6e73; margin-bottom: 2px; }
    .shelf-label .shelf-count { font-weight: 400; color: #aeaeb2; }
    .shelf-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .slot { border: 1px solid #d2d2d7; height: 52px; vertical-align: top; padding: 3px 4px; font-size: 8px; }
    .slot.empty { background: #f5f5f7; }
    .slot.occupied { background: #e8f0fe; border-color: #b8d4f0; }
    .slot.expired { background: #fef0ef; border-color: #f0b8b8; }
    .slot .spec { font-weight: 700; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .slot .sn { color: #424245; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .slot .meta { color: #86868b; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .slot .meta.exp { color: #e8590c; font-weight: 500; }
    .slot.expired .meta.exp { color: #d32f2f; font-weight: 700; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .shelf { margin-bottom: 8px; page-break-inside: avoid; }
  </style>
</head>
<body>
  <!-- Page 1: Shelves 3,4,5,6 -->
  <div class="page">
    <div class="header">
      <h1>VMA Fridge — Shelf Layout</h1>
      <div class="subtitle">${dateStr} at ${timeStr}</div>
      <div class="stats">
        <div><div class="stat-val">${totalCount}</div><div class="stat-label">Total Slots</div></div>
        <div><div class="stat-val" style="color:#0071e3">${usedCount}</div><div class="stat-label">Used</div></div>
        <div><div class="stat-val" style="color:#30d158">${totalCount - usedCount}</div><div class="stat-label">Available</div></div>
      </div>
    </div>
    <div class="fridge">
      ${renderDoorHTML([3, 5], 'Left Door (S3, S5)')}
      ${renderDoorHTML([4, 6], 'Right Door (S4, S6)')}
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-swatch" style="background:#e8f0fe;border-color:#b8d4f0"></div> Occupied</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#fef0ef;border-color:#f0b8b8"></div> Expired</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#f5f5f7"></div> Empty</div>
    </div>
  </div>

  <!-- Page 2: Shelves 7,8,9,10 -->
  <div class="page">
    <div class="header">
      <h1>VMA Fridge — Shelf Layout (cont.)</h1>
      <div class="subtitle">${dateStr} at ${timeStr}</div>
    </div>
    <div class="fridge">
      ${renderDoorHTML([7, 9], 'Left Door (S7, S9)')}
      ${renderDoorHTML([8, 10], 'Right Door (S8, S10)')}
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-swatch" style="background:#e8f0fe;border-color:#b8d4f0"></div> Occupied</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#fef0ef;border-color:#f0b8b8"></div> Expired</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#f5f5f7"></div> Empty</div>
    </div>
    <div class="footer">Generated by MGMT ERP — VMA</div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  // ─── Rendering ───

  const renderSlotCell = (shelfNo: number, rowNo: number, colNo: number, isFrontRow: boolean) => {
    const slot = getSlot(shelfNo, rowNo, colNo);
    const occupied = !!slot;
    const frontTint = isFrontRow && !occupied
      ? (theme === 'dark' ? 'rgba(0, 113, 227, 0.10)' : 'rgba(0, 113, 227, 0.06)')
      : undefined;
    const frontBorder = isFrontRow && !occupied
      ? 'rgba(0, 113, 227, 0.25)'
      : undefined;

    // — Occupied: business card style —
    if (occupied) {
      const isExpired = slot.expDate ? slot.expDate < new Date().toISOString().slice(0, 10) : false;
      return (
        <button
          key={`${shelfNo}-${rowNo}-${colNo}`}
          onClick={() => handleSlotClick(shelfNo, rowNo, colNo)}
          title={`${slot.specNo} · ${slot.serialNo || ''}`}
          className="w-full rounded-lg border overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:shadow-xl cursor-pointer text-left"
          style={{
            position: 'relative',
            zIndex: 1,
            background: theme === 'dark'
              ? 'linear-gradient(135deg, rgba(0,113,227,0.18) 0%, rgba(0,60,140,0.12) 100%)'
              : 'linear-gradient(135deg, rgba(0,113,227,0.10) 0%, rgba(0,80,180,0.05) 100%)',
            borderColor: 'rgba(0, 113, 227, 0.35)',
            height: '68px',
          }}
        >
          <div className="flex h-full">
            {/* Left accent bar */}
            <div className="w-[3px] rounded-l-lg flex-shrink-0" style={{ backgroundColor: isExpired ? colors.red : colors.blue }} />
            <div className="flex-1 px-2 py-1.5 flex flex-col justify-between min-w-0">
              {/* Spec + Batch (same line) */}
              <div className="flex items-center gap-1 leading-tight min-w-0">
                <span className="font-bold text-[11px] truncate" style={{ color: colors.text }}>
                  {slot.specNo}
                </span>
                {slot.batchNo && (
                  <span className="text-[8px] px-1 py-[0.5px] rounded border flex-shrink-0" style={{
                    borderColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                    color: colors.textSecondary,
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  }}>
                    {slot.batchNo}
                  </span>
                )}
              </div>
              {/* Serial */}
              {slot.serialNo && (
                <div className="text-[10px] truncate leading-tight mt-0.5" style={{ color: colors.textSecondary }}>
                  SN: …{slot.serialNo.slice(-4)}
                </div>
              )}
              {/* Bottom row: batch + exp */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {slot.expDate && (
                  <span className="text-[9px] px-1 py-[1px] rounded font-medium" style={{
                    backgroundColor: isExpired ? 'rgba(255,69,58,0.12)' : 'rgba(255,159,10,0.10)',
                    color: isExpired ? colors.red : colors.orange,
                  }}>
                    {slot.expDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      );
    }

    // — Empty slot —
    return (
      <button
        key={`${shelfNo}-${rowNo}-${colNo}`}
        onClick={() => handleSlotClick(shelfNo, rowNo, colNo)}
        title={`${t('p_valve.fridgeShelf.shelf')} ${shelfNo} R${rowNo}C${colNo}`}
        style={{
          position: 'relative',
          zIndex: 1,
          backgroundColor: frontTint || (theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
          borderColor: frontBorder || (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
          height: '68px',
        }}
        className="w-full rounded-lg border flex items-center justify-center transition-all duration-200 hover:scale-[1.03] hover:shadow-lg cursor-pointer"
      >
        <span className="text-[12px]" style={{ color: isFrontRow ? 'rgba(0,113,227,0.5)' : colors.textTertiary }}>
          {isFrontRow ? '▸' : '+'}
        </span>
      </button>
    );
  };

  const renderShelf = (shelfNo: number) => {
    const shelfSlotCount = slots.filter(s => s.shelfNo === shelfNo).length;
    return (
      <div key={shelfNo} className="mb-1">
        {/* Shelf label */}
        <div className="flex items-center justify-between px-1 mb-0.5">
          <span className="text-[9px] font-semibold" style={{ color: colors.textSecondary }}>
            S{shelfNo}
          </span>
          <span className="text-[8px]" style={{ color: colors.textTertiary }}>
            {shelfSlotCount}/{ROWS * COLS}
          </span>
        </div>
        {/* Shelf grid — transposed: COLS deep (rows) × ROWS wide (cols) */}
        <div
          className="grid gap-[2px] p-1 rounded-lg"
          style={{
            gridTemplateColumns: `repeat(${ROWS}, 1fr)`,
            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
          }}
        >
          {Array.from({ length: COLS }, (_, c) =>
            Array.from({ length: ROWS }, (_, r) =>
              renderSlotCell(shelfNo, r + 1, c + 1, c === COLS - 1)
            )
          ).flat()}
        </div>
        {/* Front row indicator */}
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(0,113,227,0.4)' }} />
          <span className="text-[7px]" style={{ color: colors.textTertiary }}>
            ← {t('p_valve.fridgeShelf.frontRow')}
          </span>
        </div>
      </div>
    );
  };

  const renderFridgeDoor = (shelves: number[], label: string) => (
    <div className="flex-1 min-w-[200px]">
      {/* Door header */}
      <div className="text-center mb-2">
        <span className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: colors.textSecondary }}>
          {label}
        </span>
      </div>
      {/* Glass door panel */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(180deg, rgba(58,68,84,0.5) 0%, rgba(38,48,64,0.7) 100%)'
            : 'linear-gradient(180deg, rgba(220,230,240,0.7) 0%, rgba(200,210,220,0.8) 100%)',
          border: `2px solid ${theme === 'dark' ? 'rgba(140,150,160,0.3)' : 'rgba(180,190,200,0.6)'}`,
          boxShadow: theme === 'dark'
            ? 'inset 0 1px 1px rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.3)'
            : 'inset 0 1px 2px rgba(255,255,255,0.5), 0 4px 20px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="p-2 flex flex-col gap-1">
          {shelves.map(s => renderShelf(s))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Stats bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[22px] font-semibold" style={{ color: colors.text }}>
              {t('p_valve.fridgeShelf.title')}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>
              {t('p_valve.fridgeShelf.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
            <div className="text-center">
              <div className="font-semibold text-[18px]" style={{ color: colors.text }}>{totalCount}</div>
              <div style={{ color: colors.textTertiary }}>{t('p_valve.fridgeShelf.totalSlots')}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-[18px]" style={{ color: colors.blue }}>{usedCount}</div>
              <div style={{ color: colors.textTertiary }}>{t('p_valve.fridgeShelf.usedSlots')}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-[18px]" style={{ color: colors.green }}>{totalCount - usedCount}</div>
              <div style={{ color: colors.textTertiary }}>{t('p_valve.fridgeShelf.availableSlots')}</div>
            </div>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="ml-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 7.131H5.25" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* 3D Fridge */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${colors.textTertiary} transparent ${colors.textTertiary} ${colors.textTertiary}` }} />
          </div>
        ) : (
          <div style={{ perspective: '1200px' }} className="flex justify-center">
            <div
              className="w-full max-w-[700px]"
              style={{
                transform: 'rotateX(2deg)',
              }}
            >
              {/* Fridge body */}
              <div
                className="rounded-2xl overflow-clip"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(180deg, #3a4050 0%, #2a3040 50%, #252a35 100%)'
                    : 'linear-gradient(180deg, #d8dce5 0%, #c8ccd5 50%, #b8bcc5 100%)',
                  border: `3px solid ${colors.deviceBorder}`,
                  boxShadow: theme === 'dark'
                    ? '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
                    : '0 20px 60px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.6)',
                }}
              >
                {/* Brand strip */}
                <div className="py-3 text-center" style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4))',
                }}>
                  <span className="text-[11px] font-bold tracking-[3px] uppercase" style={{
                    color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'
                  }}>
                    TruValve Medical Fridge
                  </span>
                </div>

                {/* Two-door glass panel */}
                <div className="flex gap-1 px-2 pb-2">
                  {renderFridgeDoor(LEFT_SHELVES, t('p_valve.fridgeShelf.leftDoor'))}

                  {/* Center divider (handle) */}
                  <div className="w-[2px] flex flex-col items-center justify-center gap-6"
                    style={{
                      background: theme === 'dark'
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
                        : 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.02))',
                    }}
                  >
                    {/* Door handles */}
                    <div className="w-[3px] h-16 rounded-full" style={{
                      backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                    }} />
                    <div className="w-[3px] h-16 rounded-full" style={{
                      backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                    }} />
                  </div>

                  {renderFridgeDoor(RIGHT_SHELVES, t('p_valve.fridgeShelf.rightDoor'))}
                </div>

                {/* Bottom base (compressor) */}
                <div className="h-10 rounded-b-xl flex items-center justify-center" style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(180deg, #353a45, #2a2f38)'
                    : 'linear-gradient(180deg, #c0c5ce, #b0b5be)',
                  borderTop: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                }}>
                  {/* Vent slits */}
                  <div className="flex gap-1">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="w-6 h-[2px] rounded-full" style={{
                        backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)',
                      }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4 text-[11px]" style={{ color: colors.textSecondary }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0, 113, 227, 0.4)', border: '1px solid rgba(0, 113, 227, 0.6)' }} />
                  <span>P-Valve</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                  }} />
                  <span>{t('p_valve.fridgeShelf.empty')}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ Place Product Modal ═══════════ */}
      {modal?.type === 'place' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="absolute inset-0 backdrop-blur-md" />
          <div
            className="relative rounded-2xl shadow-2xl w-full max-w-[420px] mx-4 overflow-hidden"
            style={{
              backgroundColor: colors.bgSecondary,
              border: `2px solid #0071e3`,
            }}
          >
            <div className="p-6">
              <h3 className="text-[18px] font-semibold mb-1" style={{ color: colors.text }}>
                {t('p_valve.fridgeShelf.placeProduct')}
              </h3>
              <p className="text-[13px] mb-5" style={{ color: colors.textSecondary }}>
                {t('p_valve.fridgeShelf.shelf')} {modal.shelfNo} — R{modal.rowNo}C{modal.colNo}
              </p>

              {/* P-Valve only indicator */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg mb-4"
                style={{ backgroundColor: 'rgba(0, 113, 227, 0.1)', border: '1px solid rgba(0, 113, 227, 0.3)' }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.blue }} />
                <span className="text-[12px] font-medium" style={{ color: colors.blue }}>P-Valve</span>
              </div>

              {loadingEligible ? (
                <div className="h-[80px] flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${colors.textTertiary} transparent` }} />
                </div>
              ) : (
                <>
                  {/* Step 1: Spec Selection */}
                  <label className="block text-[12px] mb-1" style={{ color: colors.textSecondary }}>
                    {t('p_valve.fridgeShelf.specNo')}
                  </label>
                  <select
                    value={placeSpec}
                    onChange={(e) => { setPlaceSpec(e.target.value); setPlaceSerial(''); }}
                    className="w-full h-[44px] px-3 rounded-xl border text-[14px] mb-4 appearance-none"
                    style={{
                      backgroundColor: colors.bgTertiary,
                      borderColor: colors.border,
                      color: colors.text,
                    }}
                  >
                    <option value="">{t('p_valve.fridgeShelf.selectSpec')}</option>
                    {(Object.keys(eligibleMap).length > 0
                      ? specOptions.filter(s => eligibleMap[s.specification]?.some(p => !p.alreadyInFridge))
                      : specOptions
                    ).map(s => (
                        <option key={s.specification} value={s.specification}>
                          {s.model} — {s.specification}
                        </option>
                      ))
                    }
                  </select>

                  {/* Step 2: Serial Selection */}
                  {placeSpec && (
                    <>
                      <label className="block text-[12px] mb-1" style={{ color: colors.textSecondary }}>
                        {t('p_valve.fridgeShelf.serialNo')}
                      </label>
                      {(eligibleMap[placeSpec] || []).filter(p => !p.alreadyInFridge).length === 0 ? (
                        <p className="text-[13px] py-2" style={{ color: colors.textTertiary }}>
                          {t('p_valve.fridgeShelf.noInventory')}
                        </p>
                      ) : (
                        <select
                          value={placeSerial}
                          onChange={(e) => setPlaceSerial(e.target.value)}
                          className="w-full h-[44px] px-3 rounded-xl border text-[14px] mb-4 appearance-none"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: colors.border,
                            color: colors.text,
                          }}
                        >
                          <option value="">{t('p_valve.fridgeShelf.selectSerial')}</option>
                          {(eligibleMap[placeSpec] || [])
                            .filter(p => !p.alreadyInFridge)
                            .map((p, idx) => (
                              <option key={`${p.serialNo}-${p.status}-${idx}`} value={p.serialNo}>
                                {p.serialNo} · {p.status}{p.expDate ? ` · Exp: ${p.expDate}` : ''}
                              </option>
                            ))
                          }
                        </select>
                      )}
                    </>
                  )}

                  {/* Step 3: Auto-filled info */}
                  {selectedProduct && (
                    <div className="rounded-xl p-3 mb-4 space-y-2" style={{
                      backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${colors.border}`,
                    }}>
                      <div className="flex justify-between text-[13px]">
                        <span style={{ color: colors.textSecondary }}>Status</span>
                        <span className="font-medium" style={{
                          color: selectedProduct.status === 'AVAILABLE' ? colors.green
                            : selectedProduct.status === 'NEAR_EXP' ? colors.orange
                            : selectedProduct.status === 'EXPIRED' ? colors.red
                            : colors.purple,
                        }}>
                          {selectedProduct.status === 'AVAILABLE' ? 'Available'
                            : selectedProduct.status === 'NEAR_EXP' ? 'Near Expiry'
                            : selectedProduct.status === 'EXPIRED' ? 'Expired'
                            : 'Demo'}
                        </span>
                      </div>
                      {selectedProduct.expDate && (
                        <div className="flex justify-between text-[13px]">
                          <span style={{ color: colors.textSecondary }}>Exp Date</span>
                          <span style={{ color: colors.text }}>{selectedProduct.expDate}</span>
                        </div>
                      )}
                      {selectedProduct.batchNo && (
                        <div className="flex justify-between text-[13px]">
                          <span style={{ color: colors.textSecondary }}>Batch</span>
                          <span style={{ color: colors.text }}>{selectedProduct.batchNo}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 h-[44px] rounded-xl text-[15px] font-medium transition-colors hover:opacity-80"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                >
                  {t('p_valve.fridgeShelf.cancel')}
                </button>
                <button
                  onClick={handlePlace}
                  disabled={!placeSpec || !placeSerial || saving}
                  className="flex-1 h-[44px] rounded-xl text-[15px] font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center"
                  style={{ backgroundColor: colors.blue }}
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    t('p_valve.fridgeShelf.confirm')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ View Slot Modal ═══════════ */}
      {modal?.type === 'view' && modal.slot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="absolute inset-0 backdrop-blur-md" />
          <div
            className="relative rounded-2xl shadow-2xl w-full max-w-[380px] mx-4 overflow-hidden"
            style={{
              backgroundColor: colors.bgSecondary,
              border: `2px solid #0071e3`,
            }}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.blue }} />
                <h3 className="text-[18px] font-semibold" style={{ color: colors.text }}>
                  {t('p_valve.fridgeShelf.shelf')} {modal.slot.shelfNo} — R{modal.slot.rowNo}C{modal.slot.colNo}
                </h3>
              </div>

              <div className="space-y-3 mb-6">
                {[
                  [t('p_valve.fridgeShelf.productType'), 'P-Valve'],
                  [t('p_valve.fridgeShelf.specNo'), modal.slot.specNo],
                  [t('p_valve.fridgeShelf.serialNo'), modal.slot.serialNo || '—'],
                  [t('p_valve.fridgeShelf.placedAt'), new Date(modal.slot.placedAt).toLocaleString()],
                  [t('p_valve.fridgeShelf.placedBy'), modal.slot.placedBy || '—'],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between items-center">
                    <span className="text-[13px]" style={{ color: colors.textSecondary }}>{label}</span>
                    <span className="text-[14px] font-medium" style={{ color: colors.text }}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 h-[44px] rounded-xl text-[15px] font-medium transition-colors hover:opacity-80"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                >
                  {t('p_valve.fridgeShelf.close')}
                </button>
                <button
                  onClick={() => handleRemove(modal.slot!.id)}
                  className="flex-1 h-[44px] rounded-xl text-[15px] font-medium text-white transition-colors"
                  style={{ backgroundColor: colors.red }}
                >
                  {t('p_valve.fridgeShelf.removeProduct')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-2xl text-[14px] font-medium text-white"
          style={{
            backgroundColor: toast.type === 'ok' ? colors.green : colors.red,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
