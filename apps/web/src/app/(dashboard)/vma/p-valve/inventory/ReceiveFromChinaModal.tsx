'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

// 9 conditional inspection items — keys loaded from i18n
const CONDITIONAL_ITEM_COUNT = 9;

interface SpecOption {
  specification: string;
  model: string;
}

interface ProductLine {
  id: number;
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
  productModel: string;
  serialNo: string;
  qty: number;
  productCondition: 'ACCEPT' | 'REJECT';
  failedNoteIndices: number[];
  result: 'ACCEPT' | 'REJECT';
  expDate: string;
}

function emptyLine(id: number): ProductLine {
  return {
    id,
    productType: 'PVALVE',
    productModel: '',
    serialNo: '',
    qty: 1,
    productCondition: 'ACCEPT',
    failedNoteIndices: [],
    result: 'ACCEPT',
    expDate: '',
  };
}

/**
 * P-Valve serial number → Model auto-match.
 * Pattern: "28P30..." → "P28-30"
 */
function autoMatchModel(serial: string, specOptions: SpecOption[]): string | null {
  if (serial.length < 5) return null;
  const match = serial.match(/^(\d{2})P(\d{2})/);
  if (!match) return null;
  const model = `P${match[1]}-${match[2]}`;
  const found = specOptions.find(s => s.specification === model);
  return found ? found.specification : null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReceiveFromChinaModal({ open, onClose, onSuccess }: Props) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('vma');

  const CONDITIONAL_ITEMS = useMemo(() =>
    Array.from({ length: CONDITIONAL_ITEM_COUNT }, (_, i) =>
      t(`p_valve.receiveFromChina.conditionItems.${i}`)
    ), [t]);

  // Shared fields
  const [batchNo, setBatchNo] = useState('');
  const [poNo, setPoNo] = useState('');
  const [dateShipped, setDateShipped] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [timeReceived, setTimeReceived] = useState('');
  const [operator, setOperator] = useState('');
  const [comments, setComments] = useState('');

  // Product lines
  const [lines, setLines] = useState<ProductLine[]>([emptyLine(1)]);
  const [nextId, setNextId] = useState(2);

  // Spec options
  const [pvalveSpecs, setPvalveSpecs] = useState<SpecOption[]>([]);
  const [dsSpecs, setDsSpecs] = useState<SpecOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [notesDropdownOpen, setNotesDropdownOpen] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const notesBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Fetch spec options + operators, and reset form on open
  useEffect(() => {
    if (!open) return;
    // Reset all form fields
    setBatchNo('');
    setPoNo('');
    setDateShipped('');
    setDateReceived('');
    setTimeReceived('');
    setOperator('');
    setComments('');
    setLines([emptyLine(1)]);
    setNextId(2);
    setNotesDropdownOpen(null);

    const fetchSpecs = async () => {
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
    fetchSpecs();
  }, [open]);

  const updateLine = useCallback((id: number, field: string, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      // Auto-lock qty to 1 for P-Valve
      if (field === 'productType') {
        if (value === 'PVALVE') updated.qty = 1;
        updated.productModel = '';
      }
      return updated;
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

  const toggleNoteIndex = (lineId: number, idx: number) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const set = new Set(l.failedNoteIndices);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      return { ...l, failedNoteIndices: Array.from(set) };
    }));
  };

  const handleSerialChange = (lineId: number, serial: string) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const updated = { ...l, serialNo: serial };
      if (l.productType === 'PVALVE') {
        const matched = autoMatchModel(serial, pvalveSpecs);
        if (matched) updated.productModel = matched;
      }
      return updated;
    }));
  };

  const handleSubmit = async () => {
    // ---- Header validation ----
    const headerErrors: string[] = [];
    if (!batchNo.trim()) headerErrors.push(t('p_valve.receiveFromChina.batchNo'));
    if (!dateShipped) headerErrors.push(t('p_valve.receiveFromChina.dateShipped'));
    if (!dateReceived) headerErrors.push(t('p_valve.receiveFromChina.dateReceived'));
    if (!timeReceived) headerErrors.push(t('p_valve.receiveFromChina.timeReceived'));
    if (!operator) headerErrors.push(t('p_valve.receiveFromChina.operator'));

    if (headerErrors.length > 0) {
      alert(`${t('p_valve.receiveFromChina.validation.headerRequired')}\n• ${headerErrors.join('\n• ')}`);
      return;
    }

    // ---- Product lines validation ----
    if (lines.length === 0) {
      alert(t('p_valve.receiveFromChina.validation.atLeastOneLine'));
      return;
    }

    const lineErrors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const row = `Row ${i + 1}`;
      if (!line.serialNo.trim()) lineErrors.push(`${row}: ${t('p_valve.receiveFromChina.validation.serialRequired')}`);
      if (!line.productModel) lineErrors.push(`${row}: ${t('p_valve.receiveFromChina.validation.modelRequired')}`);
      if (line.qty < 1) lineErrors.push(`${row}: ${t('p_valve.receiveFromChina.validation.qtyMin')}`);
      if (!line.expDate) lineErrors.push(`${row}: ${t('p_valve.receiveFromChina.validation.expDateRequired')}`);
    }

    if (lineErrors.length > 0) {
      alert(`${t('p_valve.receiveFromChina.validation.lineErrors')}\n• ${lineErrors.join('\n• ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        batchNo,
        poNo: poNo || undefined,
        dateShipped,
        dateTimeReceived: `${dateReceived} ${timeReceived} PST`,
        operator,
        comments: comments || undefined,
        products: lines.map(l => ({
          productType: l.productType,
          productModel: l.productModel,
          serialNo: l.serialNo,
          qty: l.qty,
          productCondition: l.productCondition,
          failedNoteIndices: l.failedNoteIndices,
          result: l.result,
          inspectionBy: operator,
          expDate: l.expDate || undefined,
        })),
      };

      const res = await fetch(`${API}/vma/inventory-transactions/receive-from-china`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // Download PDF
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `receiving_inspection_${batchNo}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        onSuccess();
        onClose();
      } else {
        alert(t('p_valve.receiveFromChina.submitFailed'));
      }
    } catch (e) {
      console.error(e);
      alert(t('p_valve.receiveFromChina.networkError'));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: `${colors.bg}66`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div
        className="w-[95vw] max-w-[1400px] rounded-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, height: '65vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2 className="text-[18px] font-bold" style={{ color: colors.text }}>{t('p_valve.receiveFromChina.title')}</h2>
          <button onClick={onClose} className="text-[13px] font-medium" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.cancel')}</button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* ===== Shared Info Section ===== */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.batchNo')} *</label>
              <input type="text" value={batchNo} onChange={e => setBatchNo(e.target.value.replace(/\D/g, ''))}
                placeholder={t('p_valve.receiveFromChina.batchPlaceholder')}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.poNo')}</label>
              <input type="text" value={poNo} onChange={e => setPoNo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.dateShipped')} *</label>
              <input type="date" value={dateShipped} onChange={e => setDateShipped(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.dateReceived')} *</label>
              <input type="date" value={dateReceived} onChange={e => setDateReceived(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.timeReceived')} *</label>
              <input type="time" value={timeReceived} onChange={e => setTimeReceived(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.operator')} *</label>
              <select value={operator} onChange={e => setOperator(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle}>
                <option value="">{t('p_valve.receiveFromChina.select')}</option>
                {operatorOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Comments - batch level */}
          <div className="mb-6">
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.comments')}</label>
            <input type="text" value={comments} onChange={e => setComments(e.target.value)}
              placeholder={t('p_valve.receiveFromChina.commentsPlaceholder')}
              className="w-full px-3 py-2 rounded-lg text-[13px] border" style={inputStyle} />
          </div>

          {/* ===== Product Lines Table ===== */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ backgroundColor: colors.bgTertiary }}>
                  {[t('p_valve.receiveFromChina.columns.row'), t('p_valve.receiveFromChina.columns.type'), t('p_valve.receiveFromChina.columns.serialNo'), t('p_valve.receiveFromChina.columns.model'), t('p_valve.receiveFromChina.columns.qty'), t('p_valve.receiveFromChina.columns.expDate'), t('p_valve.receiveFromChina.columns.condition'), t('p_valve.receiveFromChina.columns.condNotes'), t('p_valve.receiveFromChina.columns.result'), ''].map((h, i, arr) => (
                    <th key={h} className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
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
                  return (
                    <tr key={line.id} style={{ borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none' }}>
                      {/* Row number */}
                      <td className="px-2 py-2 text-center font-bold" style={{ color: colors.textTertiary }}>{idx + 1}</td>

                      {/* Product Type */}
                      <td className="px-1 py-2">
                        <select value={line.productType} onChange={e => updateLine(line.id, 'productType', e.target.value)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="PVALVE">P-Valve</option>
                          <option value="DELIVERY_SYSTEM">Delivery Sys</option>
                        </select>
                      </td>

                      {/* Serial No */}
                      <td className="px-1 py-2">
                        <input type="text" value={line.serialNo}
                          onChange={e => handleSerialChange(line.id, e.target.value)}
                          className="w-full px-2 py-1.5 rounded text-[11px] border" style={inputStyle}
                          placeholder={t('p_valve.receiveFromChina.serialPlaceholder')} />
                      </td>

                      {/* Product Model */}
                      <td className="px-1 py-2">
                        <select value={line.productModel} onChange={e => updateLine(line.id, 'productModel', e.target.value)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="">{t('p_valve.receiveFromChina.select')}</option>
                          {specs.map(s => <option key={s.specification} value={s.specification}>{s.specification}</option>)}
                        </select>
                      </td>

                      {/* Qty */}
                      <td className="px-1 py-2">
                        <input type="number" min="1" value={line.qty}
                          disabled={line.productType === 'PVALVE'}
                          onChange={e => updateLine(line.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-1.5 rounded text-[11px] border text-center"
                          style={{ ...inputStyle, opacity: line.productType === 'PVALVE' ? 0.5 : 1 }} />
                      </td>

                      {/* Exp Date */}
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-1">
                          <input type="date" value={line.expDate}
                            onChange={e => updateLine(line.id, 'expDate', e.target.value)}
                            className="flex-1 min-w-0 px-1 py-1.5 rounded text-[11px] border" style={inputStyle} />
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              if (idx > 0) {
                                updateLine(line.id, 'expDate', lines[idx - 1].expDate);
                              }
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded text-[11px] border shrink-0 transition-colors"
                            style={{
                              ...inputStyle,
                              opacity: idx === 0 ? 0.3 : 0.7,
                              cursor: idx === 0 ? 'default' : 'pointer',
                            }}
                            title={idx === 0 ? '' : t('p_valve.receiveFromChina.copyFromPrev')}
                          >↑</button>
                        </div>
                      </td>

                      {/* Product Condition */}
                      <td className="px-1 py-2">
                        <select value={line.productCondition} onChange={e => updateLine(line.id, 'productCondition', e.target.value)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="ACCEPT">{t('p_valve.receiveFromChina.accept')}</option>
                          <option value="REJECT">{t('p_valve.receiveFromChina.reject')}</option>
                        </select>
                      </td>

                      {/* Conditional Notes - multi-select dropdown */}
                      <td className="px-1 py-2">
                        <button
                          ref={el => { notesBtnRefs.current[line.id] = el; }}
                          onClick={() => {
                            if (notesDropdownOpen === line.id) {
                              setNotesDropdownOpen(null);
                              setDropdownPos(null);
                            } else {
                              const btn = notesBtnRefs.current[line.id];
                              if (btn) {
                                const rect = btn.getBoundingClientRect();
                                setDropdownPos({ top: rect.bottom + 4, left: rect.left });
                              }
                              setNotesDropdownOpen(line.id);
                            }
                          }}
                          className="w-full px-2 py-1.5 rounded text-[11px] border text-left truncate"
                          style={inputStyle}
                        >
                          {line.failedNoteIndices.length > 0
                            ? t('p_valve.receiveFromChina.issueCount', { count: line.failedNoteIndices.length })
                            : t('p_valve.receiveFromChina.allOk')}
                        </button>
                      </td>

                      {/* Result */}
                      <td className="px-1 py-2">
                        <select value={line.result} onChange={e => updateLine(line.id, 'result', e.target.value)}
                          className="w-full px-1 py-1.5 rounded text-[11px] border" style={inputStyle}>
                          <option value="ACCEPT">{t('p_valve.receiveFromChina.accept')}</option>
                          <option value="REJECT">{t('p_valve.receiveFromChina.reject')}</option>
                        </select>
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
              {t('p_valve.receiveFromChina.addProductLine')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${colors.border}` }}>
          <p className="text-[11px]" style={{ color: colors.textTertiary }}>
            {t('p_valve.receiveFromChina.footerInfo', { count: lines.length })}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium" style={{ color: colors.text, backgroundColor: colors.bgTertiary }}>
              {t('p_valve.receiveFromChina.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-[13px] font-medium hover:opacity-90 transition disabled:opacity-40"
              style={{ backgroundColor: colors.blue, color: colors.white }}
            >
              {submitting ? t('p_valve.receiveFromChina.processing') : t('p_valve.receiveFromChina.confirm')}
            </button>
          </div>
        </div>
      </div>

      {/* Conditional Notes Portal Dropdown */}
      {notesDropdownOpen !== null && dropdownPos && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] w-[380px] rounded-xl border shadow-2xl p-3 max-h-[320px] overflow-y-auto"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: colors.textTertiary }}>{t('p_valve.receiveFromChina.condDropdownTitle')}</p>
          {CONDITIONAL_ITEMS.map((item, i) => {
            const line = lines.find(l => l.id === notesDropdownOpen);
            if (!line) return null;
            return (
              <label key={i} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:opacity-80 cursor-pointer" style={{ color: colors.text }}>
                <input
                  type="checkbox"
                  checked={line.failedNoteIndices.includes(i)}
                  onChange={() => toggleNoteIndex(line.id, i)}
                  className="mt-0.5"
                />
                <span className="text-[11px] leading-tight">{item}</span>
              </label>
            );
          })}
          <div className="flex justify-end mt-2 pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
            <button onClick={() => { setNotesDropdownOpen(null); setDropdownPos(null); }} className="text-[11px] px-3 py-1 rounded-lg font-medium" style={{ color: colors.blue }}>
              {t('p_valve.receiveFromChina.condDone')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
