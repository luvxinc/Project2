'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

interface SpecOption {
  specification: string;
  model: string;
}

interface ReturnableRow {
  serialNo: string;
  batchNo: string;
  recDate: string;
  expDate: string;
  quantity: number;
  specNo: string;
  productType: string;
}

interface ReturnLine {
  id: number;
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
  specNo: string;       // This is the "Model" field
  serialNo: string;
  qty: number;
  maxQty: number;
  batchNo: string;     // Auto — read only
  recDate: string;     // Auto — read only
  expDate: string;     // Auto — read only
  _returnableRows: ReturnableRow[];
  _loadingRows: boolean;
}

function emptyLine(id: number): ReturnLine {
  return {
    id,
    productType: 'PVALVE',
    specNo: '',
    serialNo: '',
    qty: 1,
    maxQty: 1,
    batchNo: '',
    recDate: '',
    expDate: '',
    _returnableRows: [],
    _loadingRows: false,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReturnToChinaModal({ open, onClose, onSuccess }: Props) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  // Header fields
  const [dateShipped, setDateShipped] = useState('');
  const [operator, setOperator] = useState('');

  // Product lines
  const [lines, setLines] = useState<ReturnLine[]>([emptyLine(1)]);
  const [nextId, setNextId] = useState(2);

  // Options
  const [pvalveSpecs, setPvalveSpecs] = useState<SpecOption[]>([]);
  const [dsSpecs, setDsSpecs] = useState<SpecOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);

  // UI
  const [submitting, setSubmitting] = useState(false);

  // Fetch specs + operators on open
  useEffect(() => {
    if (!open) return;
    setDateShipped('');
    setOperator('');
    setLines([emptyLine(1)]);
    setNextId(2);

    const fetchData = async () => {
      try {
        const [pvRes, dsRes, opRes] = await Promise.all([
          fetch(`${API}/vma/inventory-transactions/spec-options?productType=PVALVE`, { headers: getAuthHeaders() }),
          fetch(`${API}/vma/inventory-transactions/spec-options?productType=DELIVERY_SYSTEM`, { headers: getAuthHeaders() }),
          fetch(`${API}/vma/inventory-transactions/operators`, { headers: getAuthHeaders() }),
        ]);
        if (pvRes.ok) setPvalveSpecs(await pvRes.json());
        if (dsRes.ok) setDsSpecs(await dsRes.json());
        if (opRes.ok) setOperatorOptions(await opRes.json());
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, [open]);

  const updateLine = useCallback((id: number, field: string, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      // Reset dependent fields when product type changes
      if (field === 'productType') {
        updated.specNo = '';
        updated.serialNo = '';
        updated.batchNo = '';
        updated.recDate = '';
        updated.expDate = '';
        updated.qty = 1;
        updated.maxQty = 1;
        updated._returnableRows = [];
      }
      return updated;
    }));
  }, []);

  // When Model (specNo) changes, fetch returnable items for that spec
  const handleSpecChange = useCallback(async (lineId: number, specNo: string, productType: string) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      return { ...l, specNo, serialNo: '', batchNo: '', recDate: '', expDate: '', qty: 1, maxQty: 1, _loadingRows: true, _returnableRows: [] };
    }));

    if (!specNo) return;

    try {
      const res = await fetch(
        `${API}/vma/inventory-transactions/returnable?productType=${productType}&specNo=${encodeURIComponent(specNo)}`,
        { headers: getAuthHeaders() },
      );
      if (res.ok) {
        const data: ReturnableRow[] = await res.json();
        setLines(prev => prev.map(l => l.id === lineId ? { ...l, _returnableRows: data, _loadingRows: false } : l));
      } else {
        setLines(prev => prev.map(l => l.id === lineId ? { ...l, _loadingRows: false } : l));
      }
    } catch {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, _loadingRows: false } : l));
    }
  }, []);

  // When Serial No selected, auto-fill batch, recDate, expDate, qty limits
  const handleSerialSelect = useCallback((lineId: number, serialNo: string) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const row = l._returnableRows.find(r => r.serialNo === serialNo);
      if (row) {
        return {
          ...l,
          serialNo,
          batchNo: row.batchNo,
          recDate: row.recDate,
          expDate: row.expDate,
          qty: l.productType === 'PVALVE' ? 1 : 1,
          maxQty: row.quantity,
        };
      }
      return { ...l, serialNo: '', batchNo: '', recDate: '', expDate: '', qty: 1, maxQty: 1 };
    }));
  }, []);

  const addLine = () => {
    setLines(prev => [...prev, emptyLine(nextId)]);
    setNextId(n => n + 1);
  };

  const removeLine = (id: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const handleSubmit = async () => {
    // Validation
    const errors: string[] = [];
    if (!dateShipped) errors.push(t('p_valve.returnToChina.validation.dateRequired'));
    if (!operator) errors.push(t('p_valve.returnToChina.validation.operatorRequired'));

    const validLines = lines.filter(l => l.specNo && l.serialNo);
    if (validLines.length === 0) errors.push(t('p_valve.returnToChina.validation.atLeastOneLine'));

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.specNo) continue; // skip empty lines
      if (!l.serialNo) errors.push(`Row ${i + 1}: ${t('p_valve.returnToChina.validation.serialRequired')}`);
      if (l.qty < 1) errors.push(`Row ${i + 1}: ${t('p_valve.returnToChina.validation.qtyMin')}`);
      if (l.qty > l.maxQty) errors.push(`Row ${i + 1}: ${t('p_valve.returnToChina.validation.qtyExceedsAvailable', { max: l.maxQty })}`);
    }

    if (errors.length > 0) {
      alert(`Please fix:\n• ${errors.join('\n• ')}`);
      return;
    }

    setSubmitting(true);
    try {
      // ── Merge lines with the same serialNo before submitting ──
      const mergedMap = new Map<string, typeof validLines[0]>();
      for (const line of validLines) {
        const key = `${line.productType}::${line.specNo}::${line.serialNo}`;
        const existing = mergedMap.get(key);
        if (existing) {
          existing.qty += line.qty;
        } else {
          mergedMap.set(key, { ...line });
        }
      }
      const mergedLines = Array.from(mergedMap.values());

      // Create one OUT_CN transaction per merged line
      for (const line of mergedLines) {
        const body = {
          date: dateShipped,
          action: 'OUT_CN',
          productType: line.productType,
          specNo: line.specNo,
          serialNo: line.serialNo || undefined,
          qty: line.qty,
          batchNo: line.batchNo || undefined,
          expDate: line.expDate || undefined,
          operator,
          notes: 'Return to China',
        };
        const res = await fetch(`${API}/vma/inventory-transactions`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create transaction');
      }
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert(t('p_valve.returnToChina.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const inputStyle = {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div
        className="w-[95vw] max-w-[1200px] rounded-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, height: '60vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2 className="text-[18px] font-bold" style={{ color: colors.text }}>{t('p_valve.returnToChina.title')}</h2>
          <button onClick={() => !submitting && onClose()} className="text-[13px] font-medium" style={{ color: colors.textTertiary }}>{t('p_valve.returnToChina.cancel')}</button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* ===== Header Fields ===== */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.returnToChina.dateShipped')} *</label>
              <input type="date" value={dateShipped} onChange={e => setDateShipped(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.returnToChina.operator')} *</label>
              <select value={operator} onChange={e => setOperator(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle}>
                <option value="">{t('p_valve.returnToChina.select')}</option>
                {operatorOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ===== Product Lines Table ===== */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  {[t('p_valve.returnToChina.columns.row'), t('p_valve.returnToChina.columns.type'), t('p_valve.returnToChina.columns.model'), t('p_valve.returnToChina.columns.serialNo'), t('p_valve.returnToChina.columns.expDate'), t('p_valve.returnToChina.columns.qty'), t('p_valve.returnToChina.columns.batchNo'), t('p_valve.returnToChina.columns.recDate'), ''].map((h, i, arr) => (
                    <th key={h || 'del'} className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        color: colors.textSecondary,
                        ...(i === 0 ? { borderTopLeftRadius: 12 } : {}),
                        ...(i === arr.length - 1 ? { borderTopRightRadius: 12 } : {}),
                      }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const specs = line.productType === 'PVALVE' ? pvalveSpecs : dsSpecs;
                  const isPValve = line.productType === 'PVALVE';

                  // ── Cross-row serial dedup ──
                  // Calculate how many qty other rows have claimed for each serial
                  const otherClaimedMap = new Map<string, number>();
                  lines.forEach(other => {
                    if (other.id === line.id || !other.serialNo || other.specNo !== line.specNo || other.productType !== line.productType) return;
                    otherClaimedMap.set(other.serialNo, (otherClaimedMap.get(other.serialNo) ?? 0) + other.qty);
                  });

                  // Filter returnable rows for the serial dropdown
                  const filteredRows = line._returnableRows.filter(r => {
                    // Always show the currently selected serial
                    if (r.serialNo === line.serialNo) return true;
                    const claimed = otherClaimedMap.get(r.serialNo) ?? 0;
                    if (isPValve) {
                      // P-Valve: 1 unit per serial — hide if claimed
                      return claimed === 0;
                    } else {
                      // DS: hide if all qty consumed by other rows
                      return r.quantity - claimed > 0;
                    }
                  });

                  // For DS: effective max qty = original qty - qty claimed by other rows
                  const otherClaimedForThisSerial = otherClaimedMap.get(line.serialNo) ?? 0;
                  const effectiveMaxQty = Math.max(0, line.maxQty - otherClaimedForThisSerial);
                  // Auto-clamp qty if it exceeds the effective max
                  if (line.serialNo && line.qty > effectiveMaxQty && effectiveMaxQty > 0) {
                    updateLine(line.id, 'qty', effectiveMaxQty);
                  }

                  return (
                    <tr key={line.id} style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }}>
                      {/* Row # */}
                      <td className="px-2 py-2 text-center font-bold" style={{ color: colors.textTertiary }}>{idx + 1}</td>

                      {/* Type */}
                      <td className="px-1 py-2">
                        <select value={line.productType} onChange={e => updateLine(line.id, 'productType', e.target.value)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="PVALVE">P-Valve</option>
                          <option value="DELIVERY_SYSTEM">Delivery Sys</option>
                        </select>
                      </td>

                      {/* Model (specNo) */}
                      <td className="px-1 py-2">
                        <select value={line.specNo}
                          onChange={e => handleSpecChange(line.id, e.target.value, line.productType)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="">{t('p_valve.returnToChina.select')}</option>
                          {specs.map(s => <option key={s.specification} value={s.specification}>{s.specification}</option>)}
                        </select>
                      </td>

                      {/* Serial No. (auto-populated from returnable rows) */}
                      <td className="px-1 py-2">
                        {line._loadingRows ? (
                          <div className="px-2 py-1.5 rounded text-[11px] border" style={{ ...inputStyle, color: colors.textTertiary }}>{t('p_valve.returnToChina.loading')}</div>
                        ) : filteredRows.length > 0 ? (
                          <select value={line.serialNo}
                            onChange={e => handleSerialSelect(line.id, e.target.value)}
                            className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                            <option value="">{t('p_valve.returnToChina.select')}</option>
                            {filteredRows.map((r, ri) => {
                              const claimed = otherClaimedMap.get(r.serialNo) ?? 0;
                              const remainQty = r.quantity - claimed;
                              return (
                                <option key={ri} value={r.serialNo}>
                                  {r.serialNo || t('p_valve.returnToChina.noSerial')} — Exp: {r.expDate || '?'}, Qty: {remainQty}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <div className="px-2 py-1.5 rounded text-[11px] border" style={{ ...inputStyle, color: colors.textTertiary }}>
                            {line.specNo ? t('p_valve.returnToChina.noReturnableStock') : t('p_valve.returnToChina.selectModelFirst')}
                          </div>
                        )}
                      </td>

                      {/* Exp. Date (auto) */}
                      <td className="px-1 py-2">
                        <div className="px-2 py-1.5 rounded text-[11px]" style={{ backgroundColor: colors.bgTertiary, color: line.expDate ? colors.text : colors.textTertiary }}>
                          {line.expDate || '—'}
                        </div>
                      </td>

                      {/* Qty */}
                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min="1"
                          max={effectiveMaxQty}
                          value={line.qty}
                          disabled={isPValve}
                          onChange={e => {
                            const val = Math.max(1, Math.min(effectiveMaxQty, parseInt(e.target.value) || 1));
                            updateLine(line.id, 'qty', val);
                          }}
                          className="w-16 px-2 py-1.5 rounded text-[11px] border text-center"
                          style={{ ...inputStyle, opacity: isPValve ? 0.5 : 1 }}
                        />
                      </td>

                      {/* Batch# (auto, read-only) */}
                      <td className="px-1 py-2">
                        <div className="px-2 py-1.5 rounded text-[11px] font-mono" style={{ backgroundColor: colors.bgTertiary, color: line.batchNo ? colors.text : colors.textTertiary }}>
                          {line.batchNo || '—'}
                        </div>
                      </td>

                      {/* Rec. Date (auto, read-only) */}
                      <td className="px-1 py-2">
                        <div className="px-2 py-1.5 rounded text-[11px]" style={{ backgroundColor: colors.bgTertiary, color: line.recDate ? colors.text : colors.textTertiary }}>
                          {line.recDate || '—'}
                        </div>
                      </td>

                      {/* Delete row */}
                      <td className="px-1 py-2 text-center">
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(line.id)} className="text-[11px] font-medium" style={{ color: colors.red }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Row */}
          <div className="mt-3">
            <button onClick={addLine} className="text-[12px] font-medium flex items-center gap-1" style={{ color: colors.blue }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('p_valve.returnToChina.addProductLine')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${colors.border}` }}>
          <p className="text-[11px]" style={{ color: colors.textTertiary }}>
            {t('p_valve.returnToChina.readyToReturn', { count: lines.filter(l => l.specNo && l.serialNo).length })}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => !submitting && onClose()}
              className="px-4 py-2 rounded-xl text-[13px] font-medium"
              style={{ color: colors.text, backgroundColor: colors.bgTertiary }}>
              {t('p_valve.returnToChina.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-40"
              style={{ backgroundColor: colors.blue }}
            >
              {submitting ? t('p_valve.returnToChina.processing') : t('p_valve.returnToChina.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
