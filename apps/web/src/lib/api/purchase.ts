/**
 * Purchase API
 * 采购管理 API 接口
 */
import { api } from './client';

// ═══════════ Types ═══════════

export interface Supplier {
  id: number;
  supplierCode: string;
  supplierName: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierStrategy {
  id: number;
  supplierId: number;
  supplierCode: string;
  category: string;
  currency: string;
  floatCurrency: boolean;
  floatThreshold: number;
  requireDeposit: boolean;
  depositRatio: number;
  effectiveDate: string;
  note: string | null;
  contractFile: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierWithStrategy {
  id: number;
  supplierCode: string;
  supplierName: string;
  status: boolean;
  latestStrategy: SupplierStrategy | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  supplierCode: string;
  supplierName: string;
  category?: string;
  currency?: string;
  floatCurrency?: boolean;
  floatThreshold?: number;
  requireDeposit?: boolean;
  depositRatio?: number;
}

export interface ModifyStrategyDto {
  supplierCode: string;
  category?: string;
  currency?: string;
  floatCurrency?: boolean;
  floatThreshold?: number;
  requireDeposit?: boolean;
  depositRatio?: number;
  effectiveDate: string;
  note?: string;
  status?: boolean;
  supplierName?: string;
  override?: boolean;
}

// ═══════════ PURCHASE ORDER Types ═══════════

export interface PurchaseOrder {
  id: number;
  poNum: string;
  supplierId: number;
  supplierCode: string;
  poDate: string;
  status: string;
  // V1 parity: summary fields from list endpoint
  itemCount?: number;
  totalAmount?: number;
  totalRmb?: number;
  totalUsd?: number;
  currency?: string;
  exchangeRate?: number;
  isDeleted?: boolean;
  shippingStatus?: string;
  detailSeq?: string;
  strategySeq?: string;
  createdBy?: string;
  updatedBy?: string;
  // Detail fields
  items?: PurchaseOrderItem[];
  strategy?: POStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: number;
  sku: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  exchangeRate: number;
  note: string | null;
}

export interface POStrategy {
  id: number;
  strategyDate: string;
  currency: string;
  exchangeRate: number;
  rateMode: string;
  floatEnabled: boolean;
  floatThreshold: number;
  requireDeposit: boolean;
  depositRatio: number;
  note: string | null;
}

export interface POListResponse {
  data: PurchaseOrder[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreatePORequest {
  supplierCode: string;
  poDate: string;
  items: CreatePOItemInput[];
  strategy: CreatePOStrategyInput;
}

export interface CreatePOItemInput {
  sku: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
  exchangeRate?: number;
  note?: string;
}

export interface CreatePOStrategyInput {
  strategyDate: string;
  currency?: string;
  exchangeRate?: number;
  rateMode?: string;
  floatEnabled?: boolean;
  floatThreshold?: number;
  requireDeposit?: boolean;
  depositRatio?: number;
  note?: string;
}

export interface UpdatePORequest {
  status?: string;
  items?: CreatePOItemInput[];
  strategy?: CreatePOStrategyInput;
}

export interface POListParams {
  page?: number;
  limit?: number;
  search?: string;
  supplierCode?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ═══════════ SHIPMENT Types ═══════════

export interface Shipment {
  id: number;
  logisticNum: string;
  sentDate: string;
  etaDate: string | null;
  pallets: number;
  totalWeight: number;
  priceKg: number;
  logisticsCost: number;
  exchangeRate: number;
  /** V1: in_send.mode — 'A' = auto, 'M' = manual */
  rateMode?: string;
  status: string;
  /** V1 parity: computed receive status — IN_TRANSIT | ALL_RECEIVED | DIFF_UNRESOLVED | DIFF_RESOLVED */
  receiveStatus?: string;
  note: string | null;
  itemCount?: number;
  totalValue?: number;
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
  items?: ShipmentItemDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentItemDetail {
  id: number;
  poNum: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  poChange: boolean;
  note: string | null;
  /** V1 parity: ordered qty from PO */
  orderedQty?: number;
  /** V1 parity: total shipped across ALL shipments for this (poNum, sku) */
  totalShipped?: number;
}

export interface ShipmentListResponse {
  data: Shipment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ShipmentListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  includeDeleted?: boolean;
}

export interface CreateShipmentRequest {
  logisticNum: string;
  sentDate: string;
  etaDate?: string;
  pallets?: number;
  totalWeight?: number;
  priceKg?: number;
  logisticsCost?: number;
  exchangeRate?: number;
  note?: string;
  items: CreateShipmentItemInput[];
}

export interface CreateShipmentItemInput {
  poNum: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  poChange?: boolean;
  note?: string;
}

export interface UpdateShipmentRequest {
  etaDate?: string;
  pallets?: number;
  totalWeight?: number;
  priceKg?: number;
  exchangeRate?: number;
  note?: string;
  /** V1 parity: optional item edits — full replacement of items list */
  items?: UpdateShipmentItemRequest[];
}

export interface UpdateShipmentItemRequest {
  id?: number;
  poNum: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  poChange?: boolean;
}

export interface ShipmentAvailablePo {
  poId: number;
  poNum: string;
  supplierCode: string;
  poDate: string;
  items: ShipmentAvailablePoItem[];
}

export interface ShipmentAvailablePoItem {
  sku: string;
  orderedQty: number;
  shippedQty: number;
  remainingQty: number;
  unitPrice: number;
  currency: string;
}

export interface ShipmentEvent {
  id: number;
  shipmentId: number;
  logisticNum: string;
  eventType: string;
  eventSeq: number;
  changes: string;
  note: string | null;
  operator: string;
  createdAt: string;
}

// ═══════════ API ═══════════

export const purchaseApi = {
  // ─── Suppliers ───
  getSuppliers: () =>
    api.get<SupplierWithStrategy[]>('/purchase/suppliers'),

  getActiveSuppliers: () =>
    api.get<Supplier[]>('/purchase/suppliers/active'),

  getSupplier: (id: number) =>
    api.get<Supplier>(`/purchase/suppliers/${id}`),

  checkCodeExists: (code: string) =>
    api.get<{ exists: boolean }>(`/purchase/suppliers/code-exists?code=${code}`),

  createSupplier: (data: CreateSupplierDto & { sec_code_l3: string }) =>
    api.post<Supplier>('/purchase/suppliers', data),

  updateSupplier: (id: number, data: { supplierName?: string; status?: boolean }) =>
    api.patch<Supplier>(`/purchase/suppliers/${id}`, data),

  deleteSupplier: (id: number, sec_code_l3: string) =>
    api.delete<{ success: boolean }>(`/purchase/suppliers/${id}`, { sec_code_l3 }),

  // ─── Strategies ───
  getStrategies: (supplierId: number) =>
    api.get<SupplierStrategy[]>(`/purchase/suppliers/${supplierId}/strategies`),

  modifyStrategy: (data: ModifyStrategyDto & { sec_code_l3: string }) =>
    api.post<SupplierStrategy>('/purchase/suppliers/strategies', data),

  checkConflict: (supplierCode: string, date: string) =>
    api.get<{ conflict: boolean }>(`/purchase/suppliers/strategies/check-conflict?supplierCode=${supplierCode}&effectiveDate=${date}`),

  getEffectiveStrategy: (supplierCode: string, date: string) =>
    api.get<SupplierStrategy | null>(`/purchase/suppliers/strategies/effective?supplierCode=${supplierCode}&date=${date}`),

  // ─── Purchase Orders ───
  getOrders: (params: POListParams = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.supplierCode) qs.set('supplierCode', params.supplierCode);
    if (params.status) qs.set('status', params.status);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    const q = qs.toString();
    return api.get<POListResponse>(`/purchase/orders${q ? `?${q}` : ''}`);
  },

  getOrder: (id: number) =>
    api.get<PurchaseOrder>(`/purchase/orders/${id}`),

  createOrder: (data: CreatePORequest & { sec_code_l3: string }) =>
    api.post<PurchaseOrder>('/purchase/orders', data),

  updateOrder: (id: number, data: UpdatePORequest) =>
    api.patch<PurchaseOrder>(`/purchase/orders/${id}`, data),

  deleteOrder: (id: number, sec_code_l3: string) =>
    api.delete<{ success: boolean }>(`/purchase/orders/${id}`, { sec_code_l3 }),

  restoreOrder: (id: number, sec_code_l2: string) =>
    api.post<PurchaseOrder>(`/purchase/orders/${id}/restore`, { sec_code_l2 }),

  // ─── SKU List (V1 parity: dropdown for manual entry) ───
  getSkuList: () =>
    api.get<{ id: string; sku: string; name: string }[]>('/products/sku-list'),

  // ─── Excel (V1 parity: backend-generated with Apache POI) ───

  /** Download pre-filled template (V1 template file + formatting + protection) */
  getTemplateUrl: (supplierCode: string, date: string, currency: string, opts?: {
    exchangeRate?: number; floatEnabled?: boolean; floatThreshold?: number;
    depositEnabled?: boolean; depositRatio?: number;
  }) => {
    const qs = new URLSearchParams({
      supplierCode, date, currency,
      exchangeRate: String(opts?.exchangeRate || 0),
      floatEnabled: String(opts?.floatEnabled || false),
      floatThreshold: String(opts?.floatThreshold || 0),
      depositEnabled: String(opts?.depositEnabled || false),
      depositRatio: String(opts?.depositRatio || 0),
    });
    return `/purchase/orders/template?${qs.toString()}`;
  },

  /** Export PO as formatted Excel */
  getExportUrl: (id: number) =>
    `/purchase/orders/${id}/export`,

  /** Get PO event history (audit trail) */
  getHistory: (id: number) =>
    api.get<{ id: number; eventType: string; eventSeq: number; changes: string; note: string | null; operator: string; createdAt: string }[]>(`/purchase/orders/${id}/history`),

  // ─── Shipments ───

  getShipments: (params: ShipmentListParams = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.includeDeleted) qs.set('includeDeleted', String(params.includeDeleted));
    const q = qs.toString();
    return api.get<ShipmentListResponse>(`/purchase/shipments${q ? `?${q}` : ''}`);
  },

  getShipment: (id: number) =>
    api.get<Shipment>(`/purchase/shipments/${id}`),

  createShipment: (data: CreateShipmentRequest & { sec_code_l3: string }) =>
    api.post<Shipment>('/purchase/shipments', data),

  updateShipment: (id: number, data: UpdateShipmentRequest) =>
    api.patch<Shipment>(`/purchase/shipments/${id}`, data),

  deleteShipment: (id: number, sec_code_l3: string) =>
    api.delete<{ success: boolean }>(`/purchase/shipments/${id}`, { sec_code_l3 }),

  restoreShipment: (id: number) =>
    api.post<Shipment>(`/purchase/shipments/${id}/restore`, {}),

  getAvailablePos: (sentDate?: string) => {
    const qs = sentDate ? `?sentDate=${sentDate}` : '';
    return api.get<ShipmentAvailablePo[]>(`/purchase/shipments/available-pos${qs}`);
  },

  getShipmentTemplateUrl: (sentDate: string) =>
    `/purchase/shipments/template?sentDate=${sentDate}`,

  getShipmentExportUrl: (id: number, type: 'mgmt' | 'warehouse' = 'mgmt') =>
    `/purchase/shipments/${id}/export?type=${type}`,

  getShipmentHistory: (id: number) =>
    api.get<ShipmentEvent[]>(`/purchase/shipments/${id}/history`),

  // ─── Receive Goods (货物入库) ───

  /**
   * V1: get_pending_shipments_api
   * Shipments with sent_date <= receiveDate that haven't been received yet.
   */
  getPendingShipments: (receiveDate: string) =>
    api.get<PendingShipment[]>(`/purchase/receives/pending-shipments?receiveDate=${receiveDate}`),

  /**
   * V1: get_shipment_items_api
   * Items for a given logistic_num (grouped by po_num + sku).
   */
  getShipmentItems: (logisticNum: string) =>
    api.get<ShipmentItem[]>(`/purchase/receives/shipment-items?logisticNum=${encodeURIComponent(logisticNum)}`),

  /**
   * V1: submit_receive_api
   * Submit inbound receiving for a shipment.
   */
  submitReceive: (data: SubmitReceiveDto) =>
    api.post<ReceiveRecord[]>('/purchase/receives', data),

  // ─── Receiving Management (入库管理) ───

  /**
   * V1: receive_list_api — All logistic nums with computed status.
   * V1 parity P1-3: supports sortBy / sortOrder parameters.
   */
  getReceiveManagementList: (sortBy = 'receiveDate', sortOrder = 'desc') =>
    api.get<ReceiveManagementItem[]>(`/purchase/receives/management?sort_by=${sortBy}&sort_order=${sortOrder}`),


  /**
   * V1: receive_detail_api
   * Full detail for one logistic_num.
   */
  getReceiveManagementDetail: (logisticNum: string) =>
    api.get<ReceiveManagementDetail>(`/purchase/receives/management/${encodeURIComponent(logisticNum)}`),

  /**
   * V1: receive_edit_submit_api
   * Adjust receive_quantity per SKU.
   */
  editReceive: (logisticNum: string, data: EditReceiveDto) =>
    api.put<{ updatedRows: number; diffRows: number }>(`/purchase/receives/management/${encodeURIComponent(logisticNum)}`, data),

  /**
   * V1: submit_receive_delete_api — Soft-delete all receive records for a logistic_num.
   * V1 parity P0-7: note is REQUIRED (blank note → 400).
   */
  deleteReceive: (logisticNum: string, note: string) =>
    api.delete<{ success: boolean }>(`/purchase/receives/management/${encodeURIComponent(logisticNum)}`, { note }),


  /**
   * V1: submit_receive_undelete_api
   * Restore soft-deleted receive records.
   */
  restoreReceive: (logisticNum: string) =>
    api.post<{ success: boolean }>(`/purchase/receives/management/${encodeURIComponent(logisticNum)}/restore`, {}),

  /**
   * V1: get_receive_history_api
   * All revision history for a logistic_num.
   */
  getReceiveHistory: (logisticNum: string) =>
    api.get<ReceiveHistoryResponse>(`/purchase/receives/management/${encodeURIComponent(logisticNum)}/history`),

  // ─── Diffs (差异管理) ───
  getPendingDiffs: () =>
    api.get<ReceiveDiff[]>('/purchase/receives/diffs/pending'),

  getDiffsByReceive: (id: number) =>
    api.get<ReceiveDiff[]>(`/purchase/receives/${id}/diffs`),

  resolveDiff: (diffId: number, resolutionNote: string) =>
    api.post<ReceiveDiff>(`/purchase/receives/diffs/${diffId}/resolve`, { resolutionNote }),
};

// ═══════════ Receive Types ═══════════

export interface ReceiveRecord {
  id: number;
  shipmentId: number;
  logisticNum: string;
  poNum: string;
  sku: string;
  unitPrice: number;
  sentQuantity: number;
  receiveQuantity: number;
  receiveDate: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiveDiff {
  id: number;
  receiveId: number;
  logisticNum: string;
  poNum: string;
  sku: string;
  poQuantity: number;
  sentQuantity: number;
  receiveQuantity: number;
  diffQuantity: number;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendingShipment {
  id: number;
  logisticNum: string;
  sentDate: string;
  etaDate: string | null;
  pallets: number;
  logisticsCost: number;
  exchangeRate: number;
  status: string;
  note: string | null;
  items: ShipmentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentItem {
  id: number;
  poNum: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  poChange: boolean;
  note: string | null;
}

export interface SubmitReceiveDto {
  logisticNum: string;
  items: SubmitReceiveItemInput[];
}

export interface SubmitReceiveItemInput {
  sku: string;
  unitPrice: number;
  receiveQuantity: number;
  receiveDate: string;
  note?: string;
}

// ─── Receive Management ───

export interface ReceiveManagementItem {
  logisticNum: string;
  sentDate: string;            // 发货日期
  receiveDate: string;
  detailSeq: string;           // V1 parity: current version number e.g. "V01", "V02"
  updateDate: string;          // V1 parity: most recent update timestamp
  status: 'IN_TRANSIT' | 'ALL_RECEIVED' | 'DIFF_UNRESOLVED' | 'DIFF_RESOLVED' | 'DELETED';
  canModify: boolean;
  canDelete: boolean;
  isDeleted: boolean;
}


export interface ReceiveManagementDetail {
  logisticNum: string;
  receiveDate: string;
  etaDate: string;
  pallets: number;
  receiveStatus: string;
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  items: ReceiveDetailItem[];
  diffs: ReceiveDiff[];
}

export interface ReceiveDetailItem {
  poNum: string;
  sku: string;
  sentQuantity: number;
  receiveQuantity: number;
  diff: number;
  itemStatus: 'normal' | 'deficit' | 'excess';
}

export interface EditReceiveDto {
  note?: string;
  items: EditReceiveItemInput[];
}

export interface EditReceiveItemInput {
  poNum: string;
  sku: string;
  receiveQuantity: number;
}

// ─── Shipment Items (grouped by po_num+sku, V1 query.py L267-286) ───

/**
 * V1 parity: get_shipment_items_api — items grouped by (po_num, po_sku) with SUM(sent_quantity).
 * Different price tiers of same SKU are merged into one row.
 */
export interface ShipmentItemGrouped {
  poNum: string;
  sku: string;
  sentQuantity: number;  // SUM across price tiers
  unitPrice: number;     // representative price for display
}

// ─── Receive History (V1 parity history.py) ───

export interface ReceiveHistoryResponse {
  logisticNum: string;
  receiveVersions: ReceiveHistoryVersion[];  // V1: receive_versions — grouped by seq
  diffVersions: ReceiveDiffHistoryVersion[]; // V1: diff_versions — grouped by seq
}

export interface ReceiveHistoryVersion {
  seq: string;           // V1: seq e.g. "V01", "R02"
  versionDate: string;   // V1: receive_date
  updatedAt: string;     // V1: update_date
  updatedBy: string;     // V1: by
  note: string;
  isInitial: boolean;    // V1: is_initial (first version)
  isActive: boolean;     // not soft-deleted
  items: ReceiveHistoryItem[];     // populated for isInitial=true only
  changes: ReceiveHistoryChange[]; // populated for isInitial=false only
}

export interface ReceiveHistoryChange {
  type: 'adjust' | 'delete' | 'restore';
  poNum: string;
  sku: string;
  unitPrice: number;
  fields: ReceiveHistoryFieldChange[];
}

export interface ReceiveHistoryFieldChange {
  field: string;  // e.g. "入库数量"
  old: number;
  new: number;
}

export interface ReceiveHistoryItem {
  poNum: string;
  sku: string;
  unitPrice: number;
  sentQuantity: number;
  receiveQuantity: number;
  action: 'new' | 'adjust';  // V1: action field
}

export interface ReceiveDiffHistoryVersion {
  seq: string;         // V1: seq e.g. "D01"
  receiveDate: string;
  updatedBy: string;
  note: string;
  isInitial: boolean;
  items: ReceiveDiffHistoryItem[];
  changes: ReceiveDiffHistoryChange[];
}

export interface ReceiveDiffHistoryItem {
  poNum: string;
  sku: string;
  poQuantity: number;
  sentQuantity: number;
  receiveQuantity: number;
  diffQuantity: number;
  status: string;
  action: 'new' | 'adjust';
  resolutionNote: string | null;
  updatedAt: string;
}

export interface ReceiveDiffHistoryChange {
  type: 'adjust';
  poNum: string;
  sku: string;
  fields: ReceiveHistoryFieldChange[];
}


