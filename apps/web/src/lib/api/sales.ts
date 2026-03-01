import { api } from './client';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface EtlUploadRequest {
  seller: string;
  fifoRatioRe: number;
  fifoRatioCr: number;
  fifoRatioCc: number;
  transactions: CsvTransactionRow[];
  earnings: CsvEarningRow[];
}

export interface CsvTransactionRow {
  transactionCreationDate?: string;
  type?: string;
  referenceId?: string;
  description?: string;
  orderNumber?: string;
  itemId?: string;
  itemTitle?: string;
  customLabel?: string;
  quantity?: string;
  itemSubtotal?: string;
  shippingAndHandling?: string;
  sellerCollectedTax?: string;
  ebayCollectedTax?: string;
  finalValueFeeFixed?: string;
  finalValueFeeVariable?: string;
  regulatoryOperatingFee?: string;
  internationalFee?: string;
  promotedListingsFee?: string;
  paymentsDisputeFee?: string;
  grossTransactionAmount?: string;
  refund?: string;
  buyerUsername?: string;
  shipToCity?: string;
  shipToCountry?: string;
  netAmount?: string;
  /** P12: per-row seller from CSV file metadata */
  seller?: string;
}

export interface CsvEarningRow {
  orderCreationDate?: string;
  orderNumber?: string;
  itemId?: string;
  itemTitle?: string;
  buyerName?: string;
  customLabel?: string;
  shippingLabels?: string;
  /** P12: per-row seller from CSV file metadata */
  seller?: string;
}

export interface EtlUploadResponse {
  batchId: string;
  transCount: number;
  earnCount: number;
  duplicateTransCount: number;
  duplicateEarnCount: number;
}

export interface EtlBatchStatus {
  batchId: string;
  status: string;
  progress: number;
  stageMessage: string | null;
  stats: string | null;
  errorMessage: string | null;
}

export interface ParseResult {
  batchId: string;
  totalRows: number;
  parsedOk: number;
  needsFix: number;
  pendingItems: PendingSkuItem[];
}

export interface PendingSkuItem {
  transactionId: number;
  customLabel: string;
  badSku: string;
  badQty: string | null;
  suggestions: string[];
  autoFixed: boolean;
  autoFixSku: string | null;
}

export interface SkuFixRequest {
  fixes: SkuFixItem[];
  sec_code_l3?: string;
}

export interface SkuFixItem {
  transactionId: number;
  customLabel: string;
  badSku: string;
  badQty: string | null;
  correctSku: string;
  correctQty: string | null;
}

export interface TransformResult {
  transform: {
    batchId: string;
    cleanedCount: number;
    actionBreakdown: Record<string, number>;
    fifoOutCount: number;
    fifoReturnCount: number;
  };
  fifo: {
    outCount: number;
    returnCount: number;
    skippedCount: number;
    errors: string[];
  };
}

// ═══════════════════════════════════════════════
// Report Types
// ═══════════════════════════════════════════════

export interface ReportFile {
  name: string;
  size: number;
  sizeDisplay: string;
  modified: string;
  fileType: string;
}

export interface ReportGenerateRequest {
  startDate: string;
  endDate: string;
  lrCase?: number;
  lrRequest?: number;
  lrReturn?: number;
  lrDispute?: number;
  leadTime?: number;
  safetyStock?: number;
}

export interface ReportGenerateResult {
  success: boolean;
  successCount: number;
  totalTasks: number;
  fileCount: number;
  errors: string[];
}

export interface PreviewTable {
  title: string;
  rows: number;
  columns: string[];
  data: string[][];
}

export interface ReportPreviewResult {
  fileType: string;
  filename: string;
  previewAvailable: boolean;
  message?: string;
  tables?: PreviewTable[];
}

// ═══════════════════════════════════════════════
// eBay Sync Types
// ═══════════════════════════════════════════════

export interface DataRangeInfo {
  minDate: string | null;
  maxDate: string | null;
  totalRows: number;
}

export interface DataRangeResponse {
  dataSource: 'api' | 'csv';
  api: DataRangeInfo;
  csv: DataRangeInfo;
}

export interface AutoSyncResult {
  status: string;
  sellers: Array<{
    seller: string;
    fromDate: string;
    toDate: string;
    transactionsFetched: number;
    ordersFetched: number;
    cleanedProduced: number;
    status: string;
    error: string;
  }>;
}

export interface PendingSkuRow {
  id: number;
  orderNumber: string;
  fullSku: string;
  currentSku1: string;
  itemTitle: string;
  orderDate: string;
  seller: string;
  quantity: number;
  quantity1: number;
  autoFix: string | null;
  suggestions: string[];
  issueType: 'bad_sku' | 'bad_qty';
  affectedCount: number;
}

export interface PendingSkuResponse {
  count: number;
  groups: number;
  pending: PendingSkuRow[];
  validSkus: string[];
}

export interface ApiSkuFix {
  id: number;
  fullSku: string;
  badSku: string;
  correctSku: string;
  correctQty?: string;
}

export interface SkuCorrectionRule {
  id: number;
  customLabel: string;
  badSku: string;
  correctSku: string;
  correctQty: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════
// Listing Management Types
// ═══════════════════════════════════════════════

export interface ListingItem {
  itemId: string;
  title: string;
  sku: string;
  currentPrice: number;
  currency: string;
  totalQuantity: number;
  availableQuantity: number;
  soldQuantity: number;
  listingType: string;
  galleryUrl: string | null;
  watchCount: number;
  viewItemUrl: string | null;
  hasVariations: boolean;
  variationSkus: string[] | null;
  promoted: boolean;
  adRate: number | null;
  suggestedAdRate: number | null;
  seller?: string;
}

export interface BulkActionResult {
  success: number;
  failed: number;
  total: number;
  errors?: string[];
  campaignId?: string;
}

export interface ListingsResponse {
  items: ListingItem[];
  totalEntries: number;
  pageNumber: number;
  entriesPerPage: number;
  totalPages: number;
  seller: string;
  fetchedAt: string;
  stats?: {
    outOfStock: number;
    lowStock: number;
    inStock: number;
    promotedActive: number;
    promotedOff: number;
  };
}

export interface ListingSummary {
  totalActiveListings: number;
  fetchedAt: string;
}

// ═══════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════

export const salesApi = {
  /** Upload CSV data (JSON rows) */
  upload: (data: EtlUploadRequest) =>
    api.post<EtlUploadResponse>('/sales/etl/upload', data),

  /** Trigger SKU parsing */
  parse: (batchId: string) =>
    api.post<ParseResult>(`/sales/etl/${batchId}/parse`),

  /** Get pending SKU corrections */
  getPending: (batchId: string) =>
    api.get<PendingSkuItem[]>(`/sales/etl/${batchId}/pending`),

  /** Submit SKU corrections */
  fixSku: (batchId: string, data: SkuFixRequest) =>
    api.post<{ fixedCount: number }>(`/sales/etl/${batchId}/fix-sku`, data),

  /** Confirm transform + FIFO sync */
  transform: (batchId: string, secCodeL3?: string) =>
    api.post<TransformResult>(`/sales/etl/${batchId}/transform`, { sec_code_l3: secCodeL3 }),

  /** Poll batch status */
  getStatus: (batchId: string) =>
    api.get<EtlBatchStatus>(`/sales/etl/${batchId}/status`),

  // ═══ Report Center APIs ═══

  /** List generated report files */
  getReportFiles: () =>
    api.get<ReportFile[]>('/sales/reports/files'),

  /** Start report generation */
  generateReports: (data: ReportGenerateRequest) =>
    api.post<ReportGenerateResult>('/sales/reports/generate', data),

  /** Clear all report files */
  clearReports: () =>
    api.post<{ cleared: boolean }>('/sales/reports/clear'),

  /** Preview a CSV report file */
  previewReport: (filename: string) =>
    api.get<ReportPreviewResult>(`/sales/reports/preview/${encodeURIComponent(filename)}`),

  /** Generate SKU profit report (REST API) */
  generateProfitReport: (startDate?: string, endDate?: string) =>
    api.post<any>('/sales/reports/api/profit', { startDate, endDate }),

  // ═══ Visuals APIs ═══

  /** Get chart data for line or pie visualization */
  getChartData: (params: ChartDataRequest) => {
    const qs = new URLSearchParams();
    qs.set('start', params.start);
    qs.set('end', params.end);
    qs.set('stores', params.stores.join(','));
    qs.set('type', params.chartType);
    qs.set('mode', params.mode);
    qs.set('actions', params.actions.join(','));
    qs.set('ships', params.ships.join(','));
    qs.set('fees', params.fees.join(','));
    return api.get<ChartDataResponse>(`/sales/visuals/chart-data?${qs.toString()}`);
  },

  // ═══ eBay API Sync ═══

  /** Get data coverage range for API and CSV */
  getDataRange: () =>
    api.get<DataRangeResponse>('/ebay/sync/data-range'),

  /** Trigger auto-sync (incremental from watermark) */
  triggerAutoSync: () =>
    api.post<AutoSyncResult>('/ebay/sync/auto'),

  /** Get pending (bad) SKUs from API pipeline */
  getPendingSkus: () =>
    api.get<PendingSkuResponse>('/ebay/sync/pending-skus'),

  /** Fix bad SKUs in API pipeline */
  fixApiSkus: (fixes: ApiSkuFix[]) =>
    api.post<{ status: string; fixedCount: number }>('/ebay/sync/fix-sku', { fixes }),

  /** List all SKU correction rules */
  getSkuCorrections: () =>
    api.get<SkuCorrectionRule[]>('/ebay/sync/sku-corrections'),

  /** Update a correction rule */
  updateSkuCorrection: (data: { id: number; correctSku: string; correctQty?: string }) =>
    api.put<{ status: string }>('/ebay/sync/sku-corrections', data),

  /** Delete a correction rule */
  deleteSkuCorrection: (id: number) =>
    api.delete<{ status: string }>(`/ebay/sync/sku-corrections/${id}`),

  // ═══ Listing Management ═══

  /** Get cached listings from database (instant, no eBay API call) */
  getActiveListings: (params: { seller?: string }) => {
    const qs = new URLSearchParams();
    if (params.seller) qs.set('seller', params.seller);
    return api.get<ListingsResponse>(`/ebay/sync/listings?${qs.toString()}`);
  },

  /** Refresh listings from eBay API and save to cache */
  refreshListings: (params: { seller?: string }) => {
    const qs = new URLSearchParams();
    if (params.seller) qs.set('seller', params.seller);
    return api.post<ListingsResponse>(`/ebay/sync/listings/refresh?${qs.toString()}`, {});
  },

  /** Get listing summary stats */
  getListingSummary: (seller?: string) =>
    api.get<ListingSummary>(`/ebay/sync/listings/summary${seller ? `?seller=${seller}` : ''}`),

  /** Get warehouse stock qty map by SKU */
  getStockMap: () =>
    api.get<{ stockMap: Record<string, number> }>('/ebay/sync/listings/stock-map'),

  /** Partial refresh — re-fetch only specific listings by itemId */
  partialRefresh: (params: { seller: string; itemIds: string[] }) =>
    api.post<{ items: ListingItem[]; total: number; fetchedAt: string }>(
      '/ebay/sync/listings/partial-refresh', params
    ),

  // ═══ Bulk Actions ═══

  /** Bulk restock — update inventory quantity */
  bulkRestock: (data: { seller: string; items: { itemId: string; sku?: string; soldQuantity: number }[] }) =>
    api.post<BulkActionResult>('/ebay/sync/listings/bulk-restock', data),

  /** Bulk reprice — update price */
  bulkReprice: (data: { seller: string; price: number; items: { itemId: string; sku?: string }[] }) =>
    api.post<BulkActionResult>('/ebay/sync/listings/bulk-reprice', data),

  /** Bulk promote — add to CPS campaign */
  bulkPromote: (data: { seller: string; items: { listingId: string; bidPercentage: string }[] }) =>
    api.post<BulkActionResult>('/ebay/sync/listings/bulk-promote', data),

  /** Update a listing's custom label (SKU) via Trading API ReviseItem */
  updateSku: (data: { seller: string; itemId: string; newSku: string }) =>
    api.post<{ success: boolean; itemId: string; newSku: string }>('/ebay/sync/listings/update-sku', data),

  // ═══ Offers ═══

  /** Get all offers from database/cache */
  getOffers: (params: { seller?: string }) => {
    const qs = new URLSearchParams();
    if (params.seller) qs.set('seller', params.seller);
    return api.get<OffersResponse>(`/ebay/sync/offers?${qs.toString()}`);
  },

  /** Refresh offers from eBay API */
  refreshOffers: (params: { seller?: string }) => {
    const qs = new URLSearchParams();
    if (params.seller) qs.set('seller', params.seller);
    return api.post<OffersResponse>(`/ebay/sync/offers/refresh?${qs.toString()}`, {});
  },

  /** Get items eligible for seller-initiated offers */
  getEligibleItems: (params: { seller?: string }) => {
    const qs = new URLSearchParams();
    if (params.seller) qs.set('seller', params.seller);
    return api.get<{ items: any[]; total: number }>(`/ebay/sync/offers/eligible?${qs.toString()}`);
  },

  /** Respond to Best Offers (Accept/Decline/Counter) */
  respondToOffers: (request: RespondToOffersRequest) => {
    return api.post<RespondToOffersResponse>('/ebay/sync/offers/respond', request);
  },
};

// ═══════════════════════════════════════════════
// Visual Types
// ═══════════════════════════════════════════════

export interface ChartDataRequest {
  start: string;
  end: string;
  stores: string[];
  chartType: 'line' | 'pie';
  mode: 'Amount' | 'Quantity' | 'Order' | 'Percentage';
  actions: string[];
  ships: string[];
  fees: string[];
}

export interface ChartSeries {
  name: string;
  data: number[];
}

export interface PieSlice {
  name: string;
  value: number;
  percentage: number;
  details: Record<string, number>;
}

export interface ChartDataResponse {
  categories?: string[];
  series?: ChartSeries[];
  pie_data?: PieSlice[];
}

// ═══ Offer Types ═══

export interface OfferItem {
  bestOfferId?: string;
  itemId?: string;
  itemTitle?: string;
  buyerUserId?: string;
  buyerEmail?: string;
  offerPrice?: number;
  offerCurrency?: string;
  quantity?: number;
  status?: string;
  expirationTime?: string;
  creationTime?: string;
  callStatus?: string;
  buyerMessage?: string;
  bestOfferCodeType?: string;
  seller?: string;
  buyItNowPrice?: number;
}

export interface OffersResponse {
  items: OfferItem[];
  total: number;
  fetchedAt: string;
}

export interface OfferActionItem {
  bestOfferId: string;
  itemId: string;
  action: string;  // Accept, Decline, Counter
  counterPrice?: number;
  quantity?: number;
  sellerMessage?: string;
}

export interface RespondToOffersRequest {
  offers: OfferActionItem[];
  seller: string;
}

export interface RespondToOffersResponse {
  results: { bestOfferId: string; action: string; success: boolean; error?: string }[];
  total: number;
  successCount: number;
  failCount: number;
}

// ═══════════════════════════════════════════════
// Action Log Types
// ═══════════════════════════════════════════════

export interface ActionLogEntry {
  id: number;
  module: string;
  action_type: string;
  trigger_type: string;
  seller: string | null;
  summary: string;
  total_count: number | null;
  success_count: number | null;
  failed_count: number | null;
  detail: string | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ActionLogResponse {
  logs: ActionLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ═══════════════════════════════════════════════
// Action Log API
// ═══════════════════════════════════════════════

export const salesActionLogApi = {
  getLogs: (params: {
    module?: string;
    actionType?: string;
    triggerType?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.module) searchParams.set('module', params.module);
    if (params.actionType) searchParams.set('actionType', params.actionType);
    if (params.triggerType) searchParams.set('triggerType', params.triggerType);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.offset) searchParams.set('offset', params.offset.toString());
    const qs = searchParams.toString();
    return api.get<ActionLogResponse>(`/ebay/sync/action-log${qs ? `?${qs}` : ''}`);
  },
};

// ═══════════════════════════════════════════════
// Auto-Ops Toggle API
// ═══════════════════════════════════════════════

export const autoOpsApi = {
  getStatus: () => api.get<{ enabled: boolean }>('/automation/auto-ops'),
  setStatus: (enabled: boolean) => api.put<{ enabled: boolean }>('/automation/auto-ops', { enabled }),
};
