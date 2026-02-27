'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useTranslations } from 'next-intl';
import InventoryTabSelector from '../components/InventoryTabSelector';
import { inventoryApi } from '@/lib/api/inventory';
import { productsApi } from '@/lib/api/products';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import type { StocktakeListItem, StocktakeLocationDetailItem, StocktakeItemData } from '@/lib/api/inventory';

// ═══════════════════════════════════════
// Inventory History Page
// List ↔ Detail with slide transition
// Inline edit, delete, add SKU
// ═══════════════════════════════════════

type ViewMode = 'list' | 'detail';

export default function InventoryHistoryPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('inventory.history');

  // ═══════ Core State ═══════
  const [batches, setBatches] = useState<StocktakeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [animating, setAnimating] = useState(false);

  // Detail data
  const [selectedBatch, setSelectedBatch] = useState<StocktakeListItem | null>(null);
  const [details, setDetails] = useState<StocktakeLocationDetailItem[]>([]);
  const [simpleItems, setSimpleItems] = useState<StocktakeItemData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const hasLocationData = details.length > 0;

  // ═══════ Inline Edit State ═══════
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // ═══════ Delete State ═══════
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; sku: string; isLocation: boolean } | null>(null);

  // ═══════ Add SKU State ═══════
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [skuList, setSkuList] = useState<{ id: string; sku: string; name: string | null }[]>([]);

  const [selectedSku, setSelectedSku] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addQtyPerBox, setAddQtyPerBox] = useState('');
  const [addBoxPerCtn, setAddBoxPerCtn] = useState('');
  const [addNumOfCtn, setAddNumOfCtn] = useState('');
  // Location selectors for new format add
  const [addWarehouse, setAddWarehouse] = useState('');
  const [addAisle, setAddAisle] = useState('');
  const [addBay, setAddBay] = useState('');
  const [addLevel, setAddLevel] = useState('');
  const [addBin, setAddBin] = useState('');
  const [addSlot, setAddSlot] = useState('');
  const [warehouseTree, setWarehouseTree] = useState<any>(null);

  // ═══════ Security ═══════
  const pendingActionRef = useRef<{
    type: 'edit' | 'delete' | 'add';
    payload: any;
  } | null>(null);

  const security = useSecurityAction({
    actionKey: 'btn_edit_stocktake',
    level: 'L3',
    onExecute: async (code: string) => {
      const pending = pendingActionRef.current;
      if (!pending || !selectedBatch) return;

      try {
        setSaving(true);
        if (pending.type === 'edit') {
          if (hasLocationData) {
            await inventoryApi.updateLocationDetail(selectedBatch.id, pending.payload.id, {
              ...pending.payload.data, sec_code_l3: code,
            });
          } else {
            await inventoryApi.updateStocktakeItem(selectedBatch.id, pending.payload.id, {
              countedQty: pending.payload.countedQty, sec_code_l3: code,
            });
          }
        } else if (pending.type === 'delete') {
          if (pending.payload.isLocation) {
            await inventoryApi.deleteLocationDetail(selectedBatch.id, pending.payload.id, code);
          } else {
            await inventoryApi.deleteStocktakeItem(selectedBatch.id, pending.payload.id, code);
          }
        } else if (pending.type === 'add') {
          if (hasLocationData) {
            await inventoryApi.addLocationDetail(selectedBatch.id, { ...pending.payload, sec_code_l3: code });
          } else {
            await inventoryApi.addStocktakeItem(selectedBatch.id, { ...pending.payload, sec_code_l3: code });
          }
        }
        // Refresh detail data
        await reloadDetail(selectedBatch);
        setEditingCell(null);
        setDeleteTarget(null);
        setAddModalOpen(false);
        pendingActionRef.current = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : (err as any)?.message || 'Failed';
        security.setError(msg);
      } finally {
        setSaving(false);
      }
    },
  });

  // ═══════ Load batches ═══════
  const loadBatches = useCallback(async () => {
    setLoading(true);
    try { setBatches(await inventoryApi.getStocktakes()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // ═══════ Reload detail ═══════
  const reloadDetail = useCallback(async (batch: StocktakeListItem) => {
    try {
      const locData = await inventoryApi.getStocktakeLocations(batch.id);
      if (locData && locData.length > 0) {
        setDetails(locData);
        setSimpleItems([]);
      } else {
        setDetails([]);
        const detail = await inventoryApi.getStocktake(batch.id);
        setSimpleItems(detail.items || []);
      }
    } catch {
      try {
        setDetails([]);
        const detail = await inventoryApi.getStocktake(batch.id);
        setSimpleItems(detail.items || []);
      } catch { /* ignore */ }
    }
  }, []);

  // ═══════ Open / close detail ═══════
  const openDetail = useCallback(async (batch: StocktakeListItem) => {
    setSelectedBatch(batch);
    setDetailLoading(true);
    setAnimating(true);
    requestAnimationFrame(() => {
      setView('detail');
      setTimeout(() => setAnimating(false), 350);
    });
    await reloadDetail(batch);
    setDetailLoading(false);
  }, [reloadDetail]);

  const goBack = useCallback(() => {
    setAnimating(true);
    setView('list');
    setTimeout(() => {
      setAnimating(false);
      setSelectedBatch(null);
      setDetails([]);
      setSimpleItems([]);
      setEditingCell(null);
    }, 350);
  }, []);

  // ═══════ Click outside ═══════
  const contentRef = useRef<HTMLDivElement>(null);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (view === 'detail' && contentRef.current && !contentRef.current.contains(e.target as Node)) {
      goBack();
    }
  }, [view, goBack]);

  // ═══════ Inline edit handlers ═══════
  const startEdit = (rowId: number, field: string, currentValue: string | number) => {
    setEditingCell({ rowId, field });
    setEditValue(String(currentValue));
  };

  const submitEdit = () => {
    if (!editingCell || !selectedBatch) return;
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0) return;

    if (hasLocationData) {
      pendingActionRef.current = {
        type: 'edit',
        payload: { id: editingCell.rowId, data: { [editingCell.field]: val } },
      };
    } else {
      pendingActionRef.current = {
        type: 'edit',
        payload: { id: editingCell.rowId, countedQty: val },
      };
    }
    security.trigger();
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // ═══════ Delete handler ═══════
  const triggerDelete = (id: number, sku: string, isLocation: boolean) => {
    setDeleteTarget({ id, sku, isLocation });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    pendingActionRef.current = {
      type: 'delete',
      payload: deleteTarget,
    };
    security.trigger();
  };

  // ═══════ Add handler ═══════
  const openAddModal = async () => {
    setAddModalOpen(true);
    setSelectedSku('');
    setAddQty('');
    setAddQtyPerBox('');
    setAddBoxPerCtn('');
    setAddNumOfCtn('');
    setAddWarehouse('');
    setAddAisle('');
    setAddBay('');
    setAddLevel('');
    setAddBin('');
    setAddSlot('');
    try {
      const list = await productsApi.getSkuList();
      setSkuList(list);
    } catch { /* ignore */ }
    if (hasLocationData && !warehouseTree) {
      try {
        const tree = await inventoryApi.getWarehouseTree();
        setWarehouseTree(tree);
      } catch { /* ignore */ }
    }
  };

  const submitAdd = () => {
    if (!selectedSku || !selectedBatch) return;
    if (hasLocationData) {
      const qpb = parseInt(addQtyPerBox, 10);
      const bpc = parseInt(addBoxPerCtn, 10);
      const nc = parseInt(addNumOfCtn, 10);
      if (isNaN(qpb) || qpb < 1 || isNaN(bpc) || bpc < 1 || isNaN(nc) || nc < 1 || !addWarehouse || !addAisle || !addBay || !addLevel) return;
      pendingActionRef.current = {
        type: 'add',
        payload: {
          sku: selectedSku, qtyPerBox: qpb, boxPerCtn: bpc, numOfCtn: nc,
          warehouse: addWarehouse, aisle: addAisle, bay: parseInt(addBay, 10),
          level: addLevel, bin: addBin || '', slot: addSlot || '',
        },
      };
    } else {
      const qty = parseInt(addQty, 10);
      if (isNaN(qty) || qty < 1) return;
      pendingActionRef.current = {
        type: 'add',
        payload: { sku: selectedSku, countedQty: qty },
      };
    }
    security.trigger();
  };

  // ═══════ Computed ═══════
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const isDetail = view === 'detail';

  const warehouseSummary = useMemo(() => {
    if (!details.length) return {};
    const map: Record<string, number> = {};
    for (const d of details) { map[d.warehouse] = (map[d.warehouse] || 0) + 1; }
    return map;
  }, [details]);



  // Warehouse tree helpers
  const warehouses = useMemo(() => warehouseTree?.warehouses?.map((w: any) => w.warehouse) || [], [warehouseTree]);
  const selectedWhNode = useMemo(() => warehouseTree?.warehouses?.find((w: any) => w.warehouse === addWarehouse), [warehouseTree, addWarehouse]);
  const aisles = useMemo(() => selectedWhNode?.aisles?.map((a: any) => a.aisle) || [], [selectedWhNode]);
  const selectedAisleNode = useMemo(() => selectedWhNode?.aisles?.find((a: any) => a.aisle === addAisle), [selectedWhNode, addAisle]);
  const bays = useMemo(() => selectedAisleNode?.bays?.map((b: any) => String(b.bay)) || [], [selectedAisleNode]);
  const selectedBayNode = useMemo(() => selectedAisleNode?.bays?.find((b: any) => String(b.bay) === addBay), [selectedAisleNode, addBay]);
  const levels = useMemo(() => selectedBayNode?.levels?.map((l: any) => l.level) || [], [selectedBayNode]);
  const selectedLevelNode = useMemo(() => selectedBayNode?.levels?.find((l: any) => l.level === addLevel), [selectedBayNode, addLevel]);
  const bins = useMemo(() => selectedLevelNode?.bins?.map((b: any) => b.bin) || [], [selectedLevelNode]);
  const selectedBinNode = useMemo(() => selectedLevelNode?.bins?.find((b: any) => b.bin === addBin), [selectedLevelNode, addBin]);
  const slots = useMemo(() => selectedBinNode?.slots || [], [selectedBinNode]);

  // ═══════ Editable cell renderer ═══════
  const EditableCell = ({ rowId, field, value, align = 'right' }: { rowId: number; field: string; value: number; align?: string }) => {
    const isEditing = editingCell?.rowId === rowId && editingCell?.field === field;
    if (isEditing) {
      return (
        <td className={`px-3 py-1 text-${align}`}>
          <input
            autoFocus
            type="number"
            min={0}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit(); }}
            onBlur={cancelEdit}
            className="w-16 h-6 px-1 text-xs font-mono rounded outline-none text-center"
            style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.controlAccent}`, color: colors.text }}
          />
        </td>
      );
    }
    return (
      <td
        className={`px-3 py-2 text-${align} cursor-pointer transition-colors hover:opacity-70`}
        style={{ color: colors.text }}
        onClick={() => startEdit(rowId, field, value)}
        title={t('clickToEdit')}
      >
        {field === 'totalQty' ? (
          <span className="font-medium" style={{ color: colors.green }}>{value.toLocaleString()}</span>
        ) : value}
      </td>
    );
  };

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: colors.bg }} onClick={handleBackgroundClick}>
      <div className="relative" style={{ minHeight: '100vh' }}>

        {/* ═══════ LIST VIEW ═══════ */}
        <div style={{
          position: isDetail ? 'absolute' : 'relative', inset: 0,
          transform: isDetail ? 'translateX(-30%)' : 'translateX(0)',
          opacity: isDetail ? 0 : 1,
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
          pointerEvents: isDetail ? 'none' : 'auto',
        }}>
          <div className="max-w-[1400px] mx-auto px-6 py-10">
            <div className="mb-8"><InventoryTabSelector /></div>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 rounded-full animate-spin"
                  style={{ borderRightColor: colors.controlAccent, borderBottomColor: colors.controlAccent, borderLeftColor: colors.controlAccent, borderTopColor: 'transparent' }} />
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1} style={{ color: colors.textTertiary }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('noBatches')}</p>
                <p className="text-xs" style={{ color: colors.textTertiary }}>{t('noBatchesDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div key={batch.id} className="rounded-xl p-5 cursor-pointer transition-all duration-200"
                    style={{ background: cardBg, border: `1px solid ${borderColor}` }}
                    onClick={() => openDetail(batch)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.controlAccent; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = borderColor; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${colors.controlAccent}22, ${colors.controlAccent}08)` }}>
                          <span className="text-lg font-bold" style={{ color: colors.controlAccent }}>
                            {new Date(batch.stocktakeDate + 'T00:00:00').getDate()}
                          </span>
                          <span className="text-[9px] font-medium uppercase" style={{ color: colors.controlAccent }}>
                            {new Date(batch.stocktakeDate + 'T00:00:00').toLocaleDateString('en', { month: 'short' })}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-bold" style={{ color: colors.text }}>{batch.stocktakeDate}</div>
                          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: colors.textTertiary }}>
                            <span>{t('skus', { count: batch.itemCount })}</span>
                            <span>ID: {batch.id}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: `${colors.controlAccent}15`, color: colors.controlAccent }}>
                          {t('viewDetails')}
                        </span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: colors.textTertiary }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══════ DETAIL VIEW ═══════ */}
        {(isDetail || animating) && selectedBatch && (
          <div style={{
            position: !isDetail ? 'absolute' : 'relative', inset: 0,
            transform: isDetail ? 'translateX(0)' : 'translateX(100%)',
            opacity: isDetail ? 1 : 0,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
            pointerEvents: isDetail ? 'auto' : 'none',
          }}>
            <div ref={contentRef} className="max-w-[1400px] mx-auto px-6 py-10">
              {/* Back + Add button */}
              <div className="flex items-center justify-between mb-6">
                <button onClick={(e) => { e.stopPropagation(); goBack(); }}
                  className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: colors.controlAccent }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('title')}
                </button>
                <button onClick={openAddModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-white transition-all hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${colors.green}, ${colors.green}dd)` }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  {t('addSku')}
                </button>
              </div>

              {/* Summary card */}
              <div className="rounded-xl mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
                  <div className="flex items-center gap-3">
                    <p className="text-base font-mono font-bold" style={{ color: colors.text }}>{selectedBatch.stocktakeDate}</p>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: `${colors.controlAccent}12`, color: colors.controlAccent }}>
                      {t('skus', { count: selectedBatch.itemCount })}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {t('records', { count: hasLocationData ? details.length : simpleItems.length })}
                  </p>
                </div>
                {Object.keys(warehouseSummary).length > 0 && (
                  <div className="p-5 flex flex-wrap gap-4">
                    {Object.entries(warehouseSummary).map(([wh, count]) => (
                      <div key={wh} className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                          style={{ backgroundColor: `${colors.controlAccent}10`, color: colors.controlAccent }}>{wh}</span>
                        <span className="text-xs" style={{ color: colors.textTertiary }}>{t('records', { count })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail Table */}
              {detailLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin"
                    style={{ borderRightColor: colors.controlAccent, borderBottomColor: colors.controlAccent, borderLeftColor: colors.controlAccent, borderTopColor: 'transparent' }} />
                </div>
              ) : hasLocationData ? (
                /* ═══════ New format: location-level table ═══════ */
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                  <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['#', t('colSku'), t('colQtyPerBox'), t('colBoxPerCtn'), t('colNumOfCtn'), t('colTotal'),
                            t('colWarehouse'), t('colAisle'), t('colBay'), t('colLevel'), t('colBin'), t('colSlot'), ''
                          ].map((col, ci) => (
                            <th key={ci}
                              className={`px-3 py-2.5 font-semibold sticky top-0 z-10 ${ci >= 2 && ci <= 5 ? 'text-right' : ci >= 6 ? 'text-center' : 'text-left'}`}
                              style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((d, i) => (
                          <tr key={d.id} className="transition-colors" style={{ borderTop: `1px solid ${borderColor}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = cardBg}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <td className="px-3 py-2" style={{ color: colors.textTertiary }}>{i + 1}</td>
                            <td className="px-3 py-2 font-mono font-bold" style={{ color: colors.text }}>{d.sku}</td>
                            <EditableCell rowId={d.id} field="qtyPerBox" value={d.qtyPerBox} />
                            <EditableCell rowId={d.id} field="boxPerCtn" value={d.boxPerCtn} />
                            <EditableCell rowId={d.id} field="numOfCtn" value={d.numOfCtn} />
                            <td className="px-3 py-2 text-right font-medium" style={{ color: colors.green }}>{d.totalQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-center font-mono text-[10px]" style={{ color: colors.textSecondary }}>{d.warehouse}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.aisle}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.bay}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.level}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.bin || '-'}</td>
                            <td className="px-3 py-2 text-center" style={{ color: colors.textSecondary }}>{d.slot || '-'}</td>
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => triggerDelete(d.id, d.sku, true)}
                                className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: colors.red }}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : simpleItems.length > 0 ? (
                /* ═══════ Legacy format: SKU + qty only ═══════ */
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                  <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>#</th>
                          <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colSku')}</th>
                          <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}>{t('colTotal')}</th>
                          <th className="px-4 py-2.5 text-center font-semibold sticky top-0 z-10 w-10"
                            style={{ color: colors.textSecondary, backgroundColor: colors.bg }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {simpleItems.map((item, i) => (
                          <tr key={item.id} className="transition-colors" style={{ borderTop: `1px solid ${borderColor}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = cardBg}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <td className="px-4 py-2.5" style={{ color: colors.textTertiary }}>{i + 1}</td>
                            <td className="px-4 py-2.5 font-mono font-bold" style={{ color: colors.text }}>{item.sku}</td>
                            {editingCell?.rowId === item.id && editingCell?.field === 'countedQty' ? (
                              <td className="px-4 py-1 text-right">
                                <input autoFocus type="number" min={1} value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                  onBlur={cancelEdit}
                                  className="w-20 h-6 px-1 text-xs font-mono rounded outline-none text-right"
                                  style={{ backgroundColor: colors.bgTertiary, border: `1px solid ${colors.controlAccent}`, color: colors.text }} />
                              </td>
                            ) : (
                              <td className="px-4 py-2.5 text-right font-medium cursor-pointer hover:opacity-70"
                                style={{ color: colors.green }}
                                onClick={() => startEdit(item.id, 'countedQty', item.countedQty)}
                                title={t('clickToEdit')}>
                                {item.countedQty.toLocaleString()}
                              </td>
                            )}
                            <td className="px-2 py-2.5 text-center">
                              <button onClick={() => triggerDelete(item.id, item.sku, false)}
                                className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: colors.red }}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-sm" style={{ color: colors.textTertiary }}>{t('noBatches')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════ DELETE MODAL ═══════ */}
      {deleteTarget && !security.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
          onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: colors.bgElevated || colors.bg }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.red}15` }}>
                  <svg className="w-5 h-5" fill={colors.red} viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: colors.text }}>{t('deleteTitle')}</h3>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>{t('deleteWarning', { sku: deleteTarget.sku })}</p>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-xl text-center font-mono text-lg font-bold"
                style={{ background: `${colors.red}08`, border: `1px solid ${colors.red}30`, color: colors.red }}>
                {deleteTarget.sku}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 h-11 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: colors.bgTertiary || cardBg, color: colors.text }}>
                {t('cancel')}
              </button>
              <button onClick={confirmDelete}
                className="flex-1 h-11 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: colors.red }}>
                {t('confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD SKU MODAL ═══════ */}
      {addModalOpen && !security.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
          onClick={() => setAddModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: colors.bgElevated || colors.bg }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3">
              <h3 className="text-base font-semibold" style={{ color: colors.text }}>{t('addSku')}</h3>
              <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>{t('addSkuDesc')}</p>
            </div>
            <div className="px-6 pb-6 space-y-4">
              {/* SKU Picker with pagination */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>SKU</label>
                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                  <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                    {skuList.map((s) => (
                      <div key={s.sku}
                        className="px-3 py-2 cursor-pointer transition-colors flex items-center justify-between"
                        style={{
                          backgroundColor: selectedSku === s.sku ? `${colors.controlAccent}15` : 'transparent',
                          borderBottom: `1px solid ${borderColor}`,
                        }}
                        onClick={() => setSelectedSku(s.sku)}>
                        <span className="text-xs font-mono font-bold" style={{ color: selectedSku === s.sku ? colors.controlAccent : colors.text }}>{s.sku}</span>
                        {selectedSku === s.sku && (
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill={colors.controlAccent}>
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </div>
                    ))}
                    {skuList.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs" style={{ color: colors.textTertiary }}>No SKUs available</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quantity / Location inputs */}
              {hasLocationData ? (
                <>
                    <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: colors.textSecondary }}>{t('colQtyPerBox')}</label>
                      <input type="number" min={1} value={addQtyPerBox} onChange={e => setAddQtyPerBox(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                        style={{ backgroundColor: colors.bgTertiary || cardBg, border: `1px solid ${borderColor}`, color: colors.text }} />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: colors.textSecondary }}>{t('colBoxPerCtn')}</label>
                      <input type="number" min={1} value={addBoxPerCtn} onChange={e => setAddBoxPerCtn(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                        style={{ backgroundColor: colors.bgTertiary || cardBg, border: `1px solid ${borderColor}`, color: colors.text }} />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: colors.textSecondary }}>{t('colNumOfCtn')}</label>
                      <input type="number" min={1} value={addNumOfCtn} onChange={e => setAddNumOfCtn(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                        style={{ backgroundColor: colors.bgTertiary || cardBg, border: `1px solid ${borderColor}`, color: colors.text }} />
                    </div>
                  </div>
                  {/* Location selectors */}
                  <div className="grid grid-cols-3 gap-2">
                    <SelectField label={t('colWarehouse')} value={addWarehouse} onChange={v => { setAddWarehouse(v); setAddAisle(''); setAddBay(''); setAddLevel(''); setAddBin(''); setAddSlot(''); }}
                      options={warehouses} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                    <SelectField label={t('colAisle')} value={addAisle} onChange={v => { setAddAisle(v); setAddBay(''); setAddLevel(''); setAddBin(''); setAddSlot(''); }}
                      options={aisles} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                    <SelectField label={t('colBay')} value={addBay} onChange={v => { setAddBay(v); setAddLevel(''); setAddBin(''); setAddSlot(''); }}
                      options={bays} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <SelectField label={t('colLevel')} value={addLevel} onChange={v => { setAddLevel(v); setAddBin(''); setAddSlot(''); }}
                      options={levels} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                    <SelectField label={t('colBin')} value={addBin} onChange={v => { setAddBin(v); setAddSlot(''); }}
                      options={bins} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                    <SelectField label={t('colSlot')} value={addSlot} onChange={setAddSlot}
                      options={slots} colors={colors} borderColor={borderColor} cardBg={cardBg} />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: colors.textSecondary }}>{t('colTotal')}</label>
                  <input type="number" min={1} value={addQty} onChange={e => setAddQty(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-xs font-mono outline-none"
                    style={{ backgroundColor: colors.bgTertiary || cardBg, border: `1px solid ${borderColor}`, color: colors.text }} />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setAddModalOpen(false)}
                  className="flex-1 h-11 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
                  style={{ backgroundColor: colors.bgTertiary || cardBg, color: colors.text }}>
                  {t('cancel')}
                </button>
                <button onClick={submitAdd}
                  disabled={!selectedSku || (hasLocationData ? (!addQtyPerBox || !addBoxPerCtn || !addNumOfCtn || !addWarehouse || !addAisle || !addBay || !addLevel) : !addQty)}
                  className="flex-1 h-11 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: colors.green }}>
                  {t('confirmAdd')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SECURITY CODE DIALOG ═══════ */}
      <SecurityCodeDialog
        isOpen={security.isOpen}
        level={security.level}
        title={pendingActionRef.current?.type === 'delete' ? t('deleteTitle') : pendingActionRef.current?.type === 'add' ? t('addSku') : t('editTitle')}
        description=""
        onConfirm={security.onConfirm}
        onCancel={() => { security.onCancel(); pendingActionRef.current = null; }}
        error={security.error}
      />
    </div>
  );
}

// ═══════ Select Field Component ═══════
function SelectField({ label, value, onChange, options, colors, borderColor, cardBg }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; colors: any; borderColor: string; cardBg: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium mb-1 block" style={{ color: colors.textSecondary }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-8 px-2 rounded-lg text-xs outline-none appearance-none"
        style={{ backgroundColor: colors.bgTertiary || cardBg, border: `1px solid ${borderColor}`, color: colors.text }}>
        <option value="">-</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
