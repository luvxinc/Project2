/**
 * Inventory API Client
 * Warehouse Shelf Code Management
 */
import { api } from './client';
import { getApiBaseUrlCached } from '@/lib/api-url';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export interface BayConfig {
  bayCount: number;
  levels: string[];      // e.g. ["G", "M", "T"]
  binCount: number;
  slotCount: number;
}

export interface AisleConfig {
  aisle: string;         // e.g. "A"
  bayConfig: BayConfig;
}

export interface WarehouseNode {
  warehouse: string;
  totalLocations: number;
  aisles: AisleNode[];
}

export interface AisleNode {
  aisle: string;
  bays: BayNode[];
}

export interface BayNode {
  bay: number;
  levels: LevelNode[];
}

export interface LevelNode {
  level: string;
  bins: BinNode[];
}

export interface BinNode {
  bin: number;
  slots: string[];       // full location codes
}

export interface WarehouseTreeResponse {
  warehouses: WarehouseNode[];
  totalWarehouses: number;
  totalLocations: number;
}

export interface WarehouseStats {
  warehouse: string;
  totalLocations: number;
  aisleCount: number;
  bayCount: number;
  levelCount: number;
}

export interface BatchCreateWarehouseRequest {
  warehouse: string;
  aisles: AisleConfig[];
}

export interface DownloadBarcodeRequest {
  locations: string[];
}

// ═══════════════════════════════════════════════
// STOCKTAKE TYPES
// ═══════════════════════════════════════════════

export interface StocktakeListItem {
  id: number;
  stocktakeDate: string; // YYYY-MM-DD
  note: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StocktakeItemData {
  id: number;
  sku: string;
  countedQty: number;
}

export interface StocktakeDetail {
  id: number;
  stocktakeDate: string;
  note: string | null;
  items: StocktakeItemData[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateStocktakeItemRequest {
  sku: string;
  countedQty: number;
}

export interface CreateStocktakeRequest {
  stocktakeDate: string;
  note?: string;
  items: CreateStocktakeItemRequest[];
  sec_code_l3?: string;
}

export interface UpdateStocktakeRequest {
  note?: string;
  items?: CreateStocktakeItemRequest[];
  sec_code_l3?: string;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchBlob(url: string, options?: RequestInit): Promise<Blob> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}: `;
    try {
      const json = JSON.parse(text);
      message += json.message || json.error || text;
    } catch {
      message += text || 'Download failed';
    }
    throw new Error(message);
  }
  return res.blob();
}

// ═══════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════

export const inventoryApi = {
  // 1. Get full warehouse tree
  getWarehouseTree: () =>
    api.get<WarehouseTreeResponse>('/inventory/warehouse-shelves'),

  // 2. Get warehouse names list
  getWarehouseNames: () =>
    api.get<string[]>('/inventory/warehouse-shelves/warehouses'),

  // 3. Create warehouse (requires security code)
  createWarehouse: (data: BatchCreateWarehouseRequest, securityCode: string) =>
    api.post<WarehouseNode>('/inventory/warehouse-shelves', {
      ...data,
      sec_code_l2: securityCode,
    }),

  // 4. Update warehouse (requires security code)
  updateWarehouse: (warehouse: string, data: BatchCreateWarehouseRequest, securityCode: string) =>
    api.put<WarehouseNode>(
      `/inventory/warehouse-shelves/${encodeURIComponent(warehouse)}`,
      { ...data, sec_code_l2: securityCode }
    ),

  // 5. Delete warehouse (requires security code)
  deleteWarehouse: (warehouse: string, securityCode: string) =>
    api.delete<{ message: string }>(
      `/inventory/warehouse-shelves/${encodeURIComponent(warehouse)}`,
      { sec_code_l3: securityCode }
    ),

  // 6. Download single barcode PDF (selected locations)
  downloadSingleBarcode: (data: DownloadBarcodeRequest): Promise<Blob> => {
    const base = getApiBaseUrlCached();
    return fetchBlob(`${base}/inventory/warehouse-shelves/barcode/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // 7. Download batch ZIP (all warehouses)
  downloadBatchZip: (): Promise<Blob> => {
    const base = getApiBaseUrlCached();
    return fetchBlob(`${base}/inventory/warehouse-shelves/barcode/batch`);
  },

  // 8. Download warehouse barcode PDF
  downloadWarehouseBarcode: (warehouse: string): Promise<Blob> => {
    const base = getApiBaseUrlCached();
    return fetchBlob(
      `${base}/inventory/warehouse-shelves/barcode/${encodeURIComponent(warehouse)}`
    );
  },

  // ═══════════════════ STOCKTAKE ═══════════════════

  // List all stocktakes (sorted by date desc)
  getStocktakes: () =>
    api.get<StocktakeListItem[]>('/inventory/stocktakes'),

  // Get single stocktake with items
  getStocktake: (id: number) =>
    api.get<StocktakeDetail>(`/inventory/stocktakes/${id}`),

  // Create (with security code)
  createStocktake: (data: CreateStocktakeRequest) =>
    api.post<StocktakeDetail>('/inventory/stocktakes', data),

  // Update (replace items)
  updateStocktake: (id: number, data: UpdateStocktakeRequest) =>
    api.put<StocktakeDetail>(`/inventory/stocktakes/${id}`, data),

  // Delete (cascade)
  deleteStocktake: (id: number, securityCode: string) =>
    api.delete<{ success: boolean }>(`/inventory/stocktakes/${id}`, {
      sec_code_l3: securityCode,
    }),
};

// ═══════════════════════════════════════════════
// DYNAMIC INVENTORY TYPES & API
// ═══════════════════════════════════════════════

export interface DynamicInvRow {
  sku: string;
  avgCost: number;
  currentCost: number;
  actualQty: number;
  theoryQty: number;
  invValue: number;
  orderQty: number;
  orderValue: number;
  transitQty: number;
  transitValue: number;
}

export interface DynamicInvResponse {
  date: string;
  matchedStocktakeDate: string | null;
  data: DynamicInvRow[];
}

export const dynamicInventoryApi = {
  getDynamicInventory: (date?: string) =>
    api.get<DynamicInvResponse>(`/inventory/dynamic${date ? `?date=${date}` : ''}`),
};

