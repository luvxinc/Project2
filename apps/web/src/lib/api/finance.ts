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
};
