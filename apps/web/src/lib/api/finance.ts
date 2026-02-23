/**
 * Finance API Client
 * V1 parity: backend/apps/finance/views/prepay/api.py (11 endpoints)
 */
import { api } from './client';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export interface SupplierBalance {
  supplierCode: string;
  supplierName: string;
  currency: string;
  balance: number;
}

export interface TransactionItem {
  id: number;
  tranNum: string;
  tranDate: string;
  tranCurrReq: string;
  tranCurrUse: string;
  tranAmount: number;
  tranType: string;       // deposit / usage / refund / withdraw / rate
  exchangeRate: number;
  rateMode: string;
  tranSeq: string;
  tranBy: string;
  tranNote: string;
  convertedAmount: number;
  runningBalance: number;
  hasFile: boolean;
  isDeleted: boolean;
}

export interface TransactionListResponse {
  supplierCode: string;
  supplierName: string;
  supplierCurrency: string;
  beginningBalance: number;
  transactions: TransactionItem[];
  filter: {
    dateFrom: string | null;
    dateTo: string | null;
  };
}

export interface CreatePrepaymentRequest {
  supplierCode: string;
  tranDate: string;
  tranCurrReq: string;
  tranCurrUse: string;
  exchangeRate: string;
  rateMode: string;
  amount: string;
  note: string;
}

export interface CreatePrepaymentResponse {
  id: number;
  tranNum: string;
  fileSaved: boolean;
  message: string;
}

export interface FieldChange {
  field: string;
  old: string;
  new: string;
}

export interface StrategyVersionItem {
  seq: string;
  date: string;
  by: string;
  note: string;
  isInitial: boolean;
  effectiveDate: string;
  currency?: string;
  changes: FieldChange[];
}

export interface RateVersionItem {
  seq: string;
  date: string;
  by: string;
  note: string;
  isInitial: boolean;
  exchangeRate: number;
  tranCurrUse: string;
  changes: FieldChange[];
}

export interface AmountVersionItem {
  seq: string;
  date: string;
  by: string;
  note: string;
  isInitial: boolean;
  eventType: string;
  currency: string;
  exchangeRate: number;
  amount?: number;
  usdAmount?: number;
  changes: FieldChange[];
}

export interface PrepaymentHistoryResponse {
  tranNum: string;
  supplierCode: string;
  supplierStrategyVersions: StrategyVersionItem[];
  rateVersions: RateVersionItem[];
  amountVersions: AmountVersionItem[];
}

export interface FileItem {
  name: string;
  size: number;
  modified: number;
}

export interface FileInfoResponse {
  tranNum: string;
  year: string;
  hasFile: boolean;
  latestFile: string | null;
  files: FileItem[];
}

export interface ExchangeRateResponse {
  rate: number;
  source: string;
}

// ═══════════════════════════════════════════════
// LOGISTICS TYPES
// ═══════════════════════════════════════════════

export interface LogisticListItem {
  logisticNum: string;
  isPaid: boolean;
  paymentStatus: string;      // unpaid / paid / partial / deleted
  dateSent: string;
  dateEta: string;
  receiveDate: string;
  etaDays: number | null;
  actualDays: number | null;
  pallets: number;
  priceKg: number;
  totalWeight: number;
  usdRmb: number;
  rateMode: string;
  paymentMode: string;
  totalPriceRmb: number;
  totalPriceUsd: number;
  logisticPaid: number;
  paymentDate: string | null;
  pmtNo: string | null;
  extraPaid: number;
  extraCurrency: string;
  extraPaidUsd: number;
  totalWithExtraUsd: number;
  totalWithExtraRmb: number;
  isChild: boolean;
  hasChildren: boolean;
  children: LogisticListItem[];
  isDeleted: boolean;
}

export interface LogisticListResponse {
  data: LogisticListItem[];
  count: number;
}

export interface SubmitLogisticPaymentRequest {
  logisticNums: string[];
  paymentDate: string;
  usePaymentDateRate: boolean;
  settlementRate?: number;
  rateSource: string;           // original / auto / manual
  extraFee?: {
    amount: number;
    currency: string;
    note: string;
  };
}

export interface SubmitLogisticPaymentResponse {
  successCount: number;
  totalCount: number;
  pmtNo: string;
}

export interface LogisticPaymentHistoryResponse {
  pmtNo: string;
  logisticNums: string[];
  sendVersions: LogisticSendVersion[];
  paymentVersions: LogisticPaymentVersion[];
}

export interface LogisticSendVersion {
  logisticNum: string;
  isInitial: boolean;
  seq: string;
  dateRecord: string;
  byUser: string;
  note: string;
  data: {
    dateSent: string;
    priceKg: number;
    totalWeight: number;
    totalPrice: number;
    pallets: number;
  };
  changes: FieldChange[];
}

export interface LogisticPaymentVersion {
  logisticNum: string;
  isInitial: boolean;
  seq: string;
  dateRecord: string;
  dateSent: string;
  paymentDate: string;
  logisticPaid: number;
  extraPaid: number;
  extraCurrency: string;
  extraNote: string;
  note: string;
  byUser: string;
  usdRmb: number;
  mode: string;
  changes: FieldChange[];
}

export interface LogisticPaymentOrdersResponse {
  pmtNo: string;
  logisticNums: string[];
  orders: LogisticPaymentOrder[];
}

export interface LogisticPaymentOrder {
  poNum: string;
  supplierCode: string;
  orderDate: string;
  currency: string;
  exchangeRate: number;
  items: { sku: string; qty: number; unitPrice: number; currency: string; valueRmb: number; valueUsd: number }[];
  totalRmb: number;
  totalUsd: number;
}

// ═══════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════

export const financeApi = {

  // 1. All supplier prepayment balances
  getBalances: () =>
    api.get<SupplierBalance[]>('/finance/prepayments/balances'),

  // 2. Transaction list with filters
  getTransactions: (supplierCode: string, params?: {
    dateFrom?: string;
    dateTo?: string;
    preset?: string;
  }) => {
    const query = new URLSearchParams({ supplierCode });
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.preset) query.set('preset', params.preset);
    return api.get<TransactionListResponse>(`/finance/prepayments/transactions?${query}`);
  },

  // 3. Create new prepayment (JSON)
  // Security: L2 (modify) — matches Purchase createOrder pattern
  createPrepayment: (data: CreatePrepaymentRequest, sec_code_l2: string) =>
    api.post<CreatePrepaymentResponse>('/finance/prepayments', {
      ...data,
      sec_code_l2,
    }),

  // 4. History (3-column layout)
  getHistory: (paymentNo: string) =>
    api.get<PrepaymentHistoryResponse>(`/finance/prepayments/${encodeURIComponent(paymentNo)}/history`),

  // 5. Soft delete
  // Security: L3 (db) — matches Purchase deleteOrder pattern
  deletePrepayment: (id: number, sec_code_l3: string) =>
    api.delete<{ success: boolean; message: string }>(`/finance/prepayments/${id}`, { sec_code_l3 }),

  // 6. Restore
  // Security: L2 (modify) — matches Purchase restoreOrder pattern
  restorePrepayment: (id: number, sec_code_l2: string) =>
    api.post<{ success: boolean; message: string }>(`/finance/prepayments/${id}/restore`, { sec_code_l2 }),

  // 7. File info
  getFileInfo: (paymentNo: string) =>
    api.get<FileInfoResponse>(`/finance/prepayments/${encodeURIComponent(paymentNo)}/files`),

  // 8. Serve file (returns URL for download/preview)
  getFileUrl: (paymentNo: string, filename: string) =>
    `/finance/prepayments/${encodeURIComponent(paymentNo)}/files/${encodeURIComponent(filename)}`,

  // 9. Delete file
  // Security: L2 (modify) — matches Purchase deleteSupplier pattern
  deleteFile: (paymentNo: string, filename: string, sec_code_l2: string) =>
    api.delete<{ message: string }>(
      `/finance/prepayments/${encodeURIComponent(paymentNo)}/files/${encodeURIComponent(filename)}`,
      { sec_code_l2 }
    ),

  // 10. Exchange rate
  getExchangeRate: () =>
    api.get<ExchangeRateResponse>('/finance/exchange-rate'),

  // ═══════════════════════════════════════════════
  // LOGISTICS COST API
  // V1 parity: logistic.py + payment/*.py
  // ═══════════════════════════════════════════════

  // 11. Logistics cost list
  getLogisticList: (params?: { sortBy?: string; sortOrder?: string }) => {
    const query = new URLSearchParams();
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const qs = query.toString();
    return api.get<LogisticListResponse>(`/finance/logistics${qs ? `?${qs}` : ''}`);
  },

  // 12. Submit logistics batch payment
  // Security: L2 (modify)
  submitLogisticPayment: (data: SubmitLogisticPaymentRequest, sec_code_l2: string) =>
    api.post<SubmitLogisticPaymentResponse>('/finance/logistics/payments', {
      ...data,
      sec_code_l2,
    }),

  // 13. Delete logistics payment
  // Security: L3 (db)
  deleteLogisticPayment: (paymentNo: string, sec_code_l3: string) =>
    api.delete<{ pmtNo: string; affectedCount: number }>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}`,
      { sec_code_l3 }
    ),

  // 14. Restore logistics payment
  // Security: L2 (modify)
  restoreLogisticPayment: (paymentNo: string, sec_code_l2: string) =>
    api.post<{ pmtNo: string; affectedCount: number }>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/restore`,
      { sec_code_l2 }
    ),

  // 15. Payment history
  // logisticNum: optional filter to narrow results to a single logistic
  getLogisticPaymentHistory: (paymentNo: string, logisticNum?: string) =>
    api.get<LogisticPaymentHistoryResponse>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/history${logisticNum ? `?logisticNum=${encodeURIComponent(logisticNum)}` : ''}`
    ),

  // 16. Payment orders
  // logisticNum: optional filter to narrow results to a single logistic
  getLogisticPaymentOrders: (paymentNo: string, logisticNum?: string) =>
    api.get<LogisticPaymentOrdersResponse>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/orders${logisticNum ? `?logisticNum=${encodeURIComponent(logisticNum)}` : ''}`
    ),

  // 17. Payment file info
  getLogisticPaymentFiles: (paymentNo: string) =>
    api.get<FileInfoResponse>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/files`
    ),

  // 18. Upload file
  // Security: L2 (modify)
  uploadLogisticPaymentFile: async (paymentNo: string, file: File, sec_code_l2: string) => {
    const { getApiBaseUrlCached } = await import('@/lib/api-url');
    const base = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(
      `${base}/finance/logistics/payments/${encodeURIComponent(paymentNo)}/files`,
      {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Security-Code': sec_code_l2,
          'X-Security-Level': 'L2',
        },
        body: formData,
      }
    );
    if (!res.ok) throw await res.json();
    const json = await res.json();
    return json.data || json;
  },

  // 19. Delete file
  // Security: L2 (modify)
  deleteLogisticPaymentFile: (paymentNo: string, filename: string, sec_code_l2: string) =>
    api.delete<{ message: string }>(
      `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/files/${encodeURIComponent(filename)}`,
      { sec_code_l2 }
    ),

  // 20. Serve file (returns URL)
  serveLogisticPaymentFile: (paymentNo: string, filename: string) =>
    `/finance/logistics/payments/${encodeURIComponent(paymentNo)}/files/${encodeURIComponent(filename)}`,

  // 21. Shipment history (by logisticNum, for unpaid items without paymentNo)
  getLogisticShipmentHistory: (logisticNum: string) =>
    api.get<LogisticPaymentHistoryResponse>(
      `/finance/logistics/${encodeURIComponent(logisticNum)}/history`
    ),

  // 22. Shipment orders (by logisticNum, for unpaid items without paymentNo)
  getLogisticShipmentOrders: (logisticNum: string) =>
    api.get<LogisticPaymentOrdersResponse>(
      `/finance/logistics/${encodeURIComponent(logisticNum)}/orders`
    ),
};
