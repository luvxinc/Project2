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

