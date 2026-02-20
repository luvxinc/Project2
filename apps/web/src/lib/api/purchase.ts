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
  type: string | null;
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
  type?: string;
  currency?: string;
  floatCurrency?: boolean;
  floatThreshold?: number;
  requireDeposit?: boolean;
  depositRatio?: number;
}

export interface ModifyStrategyDto {
  supplierCode: string;
  category?: string;
  type?: string;
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
};
