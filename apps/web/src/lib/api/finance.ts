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
// DEPOSIT TYPES
// V1 parity: backend/apps/finance/views/deposit/api.py
// ═══════════════════════════════════════════════

export interface DepositPaymentDetail {
  pmtNo: string;
  depDate: string;
  depCur: string;
  depPaid: number;
  depPaidCur: number;
  depCurMode: string;
  depPrepayAmount: number;
  depOverride: number;
  extraAmount: number;
  extraCur: string;
}

export interface DepositListItem {
  poNum: string;
  poDate: string;
  skuCount: number;
  totalAmount: number;
  totalAmountUsd: number;
  totalAmountRmb: number;
  curCurrency: string;
  curUsdRmb: number;
  rateSource: string;
  rateSourceCode: string;
  depositPar: number;
  depositAmount: number;
  depositAmountUsd: number;
  depositAmountRmb: number;
  actualPaid: number;
  actualPaidUsd: number;
  prepayDeducted: number;
  prepayDeductedUsd: number;
  depositPending: number;
  depositPendingUsd: number;
  balanceRemaining: number;
  balanceRemainingUsd: number;
  paymentStatus: string;      // paid / unpaid / partial
  isPaid: boolean;
  supplierCode: string;
  supplierName: string;
  latestPaymentDate: string;
  extraFeesUsd: number;
  extraFeesRmb: number;
  paymentDetails: DepositPaymentDetail[];
}

export interface DepositListResponse {
  data: DepositListItem[];
  count: number;
}

export interface DepositPaymentItemRequest {
  poNum: string;
  paymentMode: string;         // "original" | "custom"
  customCurrency?: string;
  customAmount?: number;
  prepayAmount?: number;
  coverStandard?: boolean;
}

export interface SubmitDepositPaymentRequest {
  poNums: string[];
  paymentDate: string;
  usePaymentDateRate: boolean;
  settlementRate?: number;
  items: DepositPaymentItemRequest[];
  extraFee?: number;
  extraFeeCurrency?: string;
  extraFeeNote?: string;
}

export interface SubmitDepositPaymentResponse {
  pmtNos: string[];
  count: number;
  prepayCount: number;
  message: string;
}

export interface VendorBalanceResponse {
  supplierCode: string;
  supplierName: string;
  currency: string;
  balanceBase: number;
  balanceUsd: number;
}

export interface DepositStrategyVersion {
  seq: string;
  dateRecord: string;
  byUser: string;
  note: string;
  isInitial: boolean;
  data: Record<string, unknown>;
  changes: FieldChange[];
}

export interface DepositPaymentVersion {
  seq: string;
  dateRecord: string;
  byUser: string;
  note: string;
  isInitial: boolean;
  data: Record<string, unknown>;
  changes: FieldChange[];
}

export interface DepositHistoryResponse {
  strategyVersions: DepositStrategyVersion[];
  paymentVersions: DepositPaymentVersion[];
}

export interface DepositOrderItem {
  sku: string;
  qty: number;
  unitPrice: number;
  currency: string;
  valueRmb: number;
  valueUsd: number;
}

export interface DepositOrderDetail {
  poNum: string;
  supplierCode: string;
  poDate: string;
  depositRmb: number;
  depositUsd: number;
  depositPercent: number;
  currency: string;
  paymentDate: string;
  exchangeRate: number;
  prepayUsedRmb: number;
  actualPaidRmb: number;
  items: DepositOrderItem[];
  totalRmb: number;
  totalUsd: number;
}

export interface DepositOrdersResponse {
  orders: DepositOrderDetail[];
}

// ═══════════════════════════════════════════════
// PO PAYMENT TYPES
// V1 parity: po_payment/api.py
// ═══════════════════════════════════════════════

export interface POPaymentDetail {
  pmtNo: string;
  poDate: string;
  poCur: string;
  poPaid: number;
  poPaidCur: number;
  poCurMode: string;
  poPrepayAmount: number;
  poOverride: number;
  extraAmount: number;
  extraCur: string;
}

export interface POPaymentListItem {
  poNum: string;
  poDate: string;
  skuCount: number;
  totalAmount: number;
  totalAmountUsd: number;
  totalAmountRmb: number;
  curCurrency: string;
  curUsdRmb: number;
  rateSource: string;
  rateSourceCode: string;
  // Deposit info
  depositPar: number;
  depositAmount: number;
  depositPaid: number;
  depositPaidUsd: number;
  depositStatus: string;
  // PO payment info
  poPaid: number;
  poPaidUsd: number;
  balanceRemaining: number;
  balanceRemainingUsd: number;
  // Float
  floatEnabled: boolean;
  floatThreshold: number;
  todayRate: number;
  fluctuationTriggered: boolean;
  adjustedBalance: number;
  adjustedBalanceUsd: number;
  // Diff blocking
  hasUnresolvedDiff: boolean;
  diffCount: number;
  paymentBlocked: boolean;
  // Payment status
  paymentStatus: string;
  isPaid: boolean;
  supplierCode: string;
  supplierName: string;
  latestPaymentDate: string;
  extraFeesUsd: number;
  extraFeesRmb: number;
  paymentDetails: POPaymentDetail[];
  depositDetails: DepositPaymentDetail[];
}

export interface POPaymentListResponse {
  data: POPaymentListItem[];
  count: number;
}

export interface POPaymentItemRequest {
  poNum: string;
  paymentMode: string;
  customCurrency?: string;
  customAmount?: number;
  prepayAmount?: number;
  coverStandard?: boolean;
}

export interface SubmitPOPaymentRequest {
  poNums: string[];
  paymentDate: string;
  usePaymentDateRate: boolean;
  settlementRate?: number;
  items: POPaymentItemRequest[];
  extraFee?: number;
  extraFeeCurrency?: string;
  extraFeeNote?: string;
}

export interface SubmitPOPaymentResponse {
  pmtNos: string[];
  count: number;
  prepayCount: number;
  message: string;
}

export interface POPaymentHistoryResponse {
  strategyVersions: DepositStrategyVersion[];
  depositPaymentVersions: DepositPaymentVersion[];
  poPaymentVersions: DepositPaymentVersion[];
}

export interface POPaymentOrdersResponse {
  orders: DepositOrderDetail[];
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

  // ═══════════════════════════════════════════════
  // DEPOSIT PAYMENT API
  // V1 parity: deposit/api.py (10 endpoints)
  // ═══════════════════════════════════════════════

  // 23. Deposit list
  getDepositList: (params?: { sortBy?: string; sortOrder?: string }) => {
    const query = new URLSearchParams();
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const qs = query.toString();
    return api.get<DepositListResponse>(`/finance/deposits${qs ? `?${qs}` : ''}`);
  },

  // 24. Submit deposit batch payment
  // Security: L2 (modify)
  submitDepositPayment: (data: SubmitDepositPaymentRequest, sec_code_l2: string) =>
    api.post<SubmitDepositPaymentResponse>('/finance/deposits/payments', {
      ...data,
      sec_code_l2,
    }),

  // 25. Delete deposit payment
  // Security: L3 (db)
  deleteDepositPayment: (pmtNo: string, sec_code_l3: string) =>
    api.delete<{ pmtNo: string; affectedCount: number; message: string }>(
      `/finance/deposits/payments/${encodeURIComponent(pmtNo)}`,
      { sec_code_l3 }
    ),

  // 26. Vendor balance (for deposit wizard)
  getVendorBalance: (supplierCode: string, paymentDate?: string) => {
    const query = new URLSearchParams({ supplierCode });
    if (paymentDate) query.set('paymentDate', paymentDate);
    return api.get<VendorBalanceResponse>(`/finance/deposits/vendor-balance?${query}`);
  },

  // 27. Deposit payment history
  getDepositPaymentHistory: (pmtNo: string, poNum: string) =>
    api.get<DepositHistoryResponse>(
      `/finance/deposits/payments/${encodeURIComponent(pmtNo)}/history?poNum=${encodeURIComponent(poNum)}`
    ),

  // 28. Deposit payment orders
  getDepositPaymentOrders: (pmtNo: string) =>
    api.get<DepositOrdersResponse>(
      `/finance/deposits/payments/${encodeURIComponent(pmtNo)}/orders`
    ),

  // 29. Deposit payment files
  getDepositPaymentFiles: (pmtNo: string) =>
    api.get<FileInfoResponse>(
      `/finance/deposits/payments/${encodeURIComponent(pmtNo)}/files`
    ),

  // 30. Upload deposit file
  // Security: L2 (modify)
  uploadDepositPaymentFile: async (pmtNo: string, file: File, sec_code_l2: string) => {
    const { getApiBaseUrlCached } = await import('@/lib/api-url');
    const base = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(
      `${base}/finance/deposits/payments/${encodeURIComponent(pmtNo)}/files`,
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

  // 31. Delete deposit file
  // Security: L2 (modify)
  deleteDepositPaymentFile: (pmtNo: string, filename: string, sec_code_l2: string) =>
    api.delete<{ message: string }>(
      `/finance/deposits/payments/${encodeURIComponent(pmtNo)}/files/${encodeURIComponent(filename)}`,
      { sec_code_l2 }
    ),

  // 32. Serve deposit file (returns URL)
  serveDepositPaymentFile: (pmtNo: string, filename: string) =>
    `/finance/deposits/payments/${encodeURIComponent(pmtNo)}/files/${encodeURIComponent(filename)}`,

  // ═══════════════════════════════════════════════
  // PO PAYMENT API
  // V1 parity: po_payment/api.py (10 endpoints)
  // ═══════════════════════════════════════════════

  // 33. PO payment list
  getPOPaymentList: (params?: { sortBy?: string; sortOrder?: string }) => {
    const query = new URLSearchParams();
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const qs = query.toString();
    return api.get<POPaymentListResponse>(`/finance/po-payments${qs ? `?${qs}` : ''}`);
  },

  // 34. Submit PO payment
  // Security: L2 (modify)
  submitPOPayment: (data: SubmitPOPaymentRequest, sec_code_l2: string) =>
    api.post<SubmitPOPaymentResponse>('/finance/po-payments/payments', {
      ...data,
      sec_code_l2,
    }),

  // 35. Delete PO payment
  // Security: L3 (db)
  deletePOPayment: (pmtNo: string, sec_code_l3: string) =>
    api.delete<{ pmtNo: string; affectedCount: number; message: string }>(
      `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}`,
      { sec_code_l3 }
    ),

  // 36. Vendor balance for PO payments
  getPOPaymentVendorBalance: (supplierCode: string, paymentDate?: string) => {
    const query = new URLSearchParams({ supplierCode });
    if (paymentDate) query.set('paymentDate', paymentDate);
    return api.get<VendorBalanceResponse>(`/finance/po-payments/vendor-balance?${query}`);
  },

  // 37. PO payment history
  getPOPaymentHistory: (pmtNo: string, poNum: string) =>
    api.get<POPaymentHistoryResponse>(
      `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/history?poNum=${encodeURIComponent(poNum)}`
    ),

  // 38. PO payment orders
  getPOPaymentOrders: (pmtNo: string) =>
    api.get<POPaymentOrdersResponse>(
      `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/orders`
    ),

  // 39. PO payment files
  getPOPaymentFiles: (pmtNo: string) =>
    api.get<FileInfoResponse>(
      `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/files`
    ),

  // 40. Upload PO payment file
  // Security: L2 (modify)
  uploadPOPaymentFile: async (pmtNo: string, file: File, sec_code_l2: string) => {
    const { getApiBaseUrlCached } = await import('@/lib/api-url');
    const base = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(
      `${base}/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/files`,
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

  // 41. Delete PO payment file
  // Security: L2 (modify)
  deletePOPaymentFile: (pmtNo: string, filename: string, sec_code_l2: string) =>
    api.delete<{ message: string }>(
      `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/files/${encodeURIComponent(filename)}`,
      { sec_code_l2 }
    ),

  // 42. Serve PO payment file (returns URL)
  servePOPaymentFile: (pmtNo: string, filename: string) =>
    `/finance/po-payments/payments/${encodeURIComponent(pmtNo)}/files/${encodeURIComponent(filename)}`,

  // ═══════════════════════════════════════════════
  // FLOW OVERVIEW API (订收发总览)
  // V1 parity: flow/api.py (proxied through V3)
  // ═══════════════════════════════════════════════

  // 43. Flow list — full lifecycle overview of all POs
  getFlowList: () =>
    api.get<FlowListResponse>('/finance/flow'),

  // 44. Flow detail — per-PO logistics breakdown with landed prices
  getFlowDetail: (poNum: string) =>
    api.get<FlowDetailResponse>(`/finance/flow/${encodeURIComponent(poNum)}`),
};

// ═══════════════════════════════════════════════
// FLOW OVERVIEW TYPES
// ═══════════════════════════════════════════════

export interface FlowOrderItem {
  poNum: string;
  poDate: string;
  skuCount: number;
  curCurrency: string;
  curUsdRmb: number;
  totalAmount: number;
  totalAmountUsd: number;
  depositRequiredUsd: number;
  depositPar: number;
  depositStatus: string;
  depositStatusText: string;
  depPaidUsd: number;
  pmtPaid: number;
  pmtPaidUsd: number;
  balanceRemaining: number;
  balanceRemainingUsd: number;
  actualPaid: number;
  actualPaidUsd: number;
  waiverUsd: number;
  depExtraUsd: number;
  pmtExtraUsd: number;
  logisticsExtraUsd: number;
  totalExtra: number;
  totalExtraUsd: number;
  logisticsList: string[];
  orderWeightKg: number;
  logisticsApportioned: number;
  logisticsApportionedUsd: number;
  logisticsCurrency: string;
  logisticsUsdRmb: number;
  totalCost: number;
  totalCostUsd: number;
  orderStatus: string;
  orderStatusText: string;
  hasDiff: boolean;
  logisticsStatus: string;
  logisticsPaymentStatus: string;
  paymentStatusText: string;
  curFloat: boolean;
  curExFloat: number;
  fluctuationTriggered: boolean;
}

export interface FlowListResponse {
  data: FlowOrderItem[];
  count: number;
}

export interface FlowSkuDetail {
  sku: string;
  priceOriginal: number;
  priceUsd: number;
  actualPrice: number;
  actualPriceUsd: number;
  feeApportioned: number;
  feeApportionedUsd: number;
  landedPrice: number;
  landedPriceUsd: number;
  qty: number;
  totalUsd: number;
}

export interface FlowLogisticsBlock {
  logisticNum: string;
  currency: string;
  usdRmb: number;
  logPriceRmb: number;
  logPriceUsd: number;
  isPaid: boolean;
  skus: FlowSkuDetail[];
}

export interface FlowDetailMeta {
  totalCostUsd: number;
  totalCostRmb: number;
}

export interface FlowDetailResponse {
  data: FlowLogisticsBlock[];
  count: number;
  meta: FlowDetailMeta | null;
}
