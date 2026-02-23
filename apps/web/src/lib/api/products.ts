/**
 * Products API
 * 产品管理 API 接口
 */
import { api, ApiResponse } from './client';
import { getApiBaseUrlCached } from '@/lib/api-url';

export interface Product {
  id: string;
  sku: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  type: string | null;
  cost: number;
  freight: number;
  cogs: number;
  weight: number;
  upc: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}


export interface ProductsResponse {
  data: Product[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateProductDto {
  sku: string;
  name?: string;
  category?: string;
  subcategory?: string;
  type?: string;
  cost?: number;
  freight?: number;
  weight?: number;
  cogs?: number;
  upc?: string;
}

export interface UpdateProductDto {
  name?: string;
  category?: string;
  subcategory?: string;
  type?: string;
  cost?: number;
  freight?: number;
  weight?: number;
  cogs?: number;
  upc?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

// Hierarchy: { category: { subcategory: [type] } }
export type CategoryHierarchy = Record<string, Record<string, string[]>>;

export interface BatchUpdateCogsDto {
  items: { id: string; cogs: number }[];
}

export interface BatchUpdateResult {
  total: number;
  success: number;
  failed: number;
  results: { id: string; sku: string; success: boolean; error?: string }[];
}

export interface GenerateBarcodeDto {
  items: {
    sku: string;
    qtyPerBox: number;
    boxPerCtn: number;
  }[];
}

export const productsApi = {
  /**
   * 获取产品列表
   */
  findAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.status) query.set('status', params.status);
    const queryStr = query.toString();
    return api.get<ProductsResponse>(`/products${queryStr ? `?${queryStr}` : ''}`);
  },

  /**
   * 获取单个产品
   */
  findOne: (id: string) => api.get<Product>(`/products/${id}`),

  /**
   * 通过 SKU 获取产品
   */
  findBySku: (sku: string) => api.get<Product>(`/products/sku/${sku}`),

  /**
   * 获取 SKU 列表 (用于下拉选择)
   */
  getSkuList: () => api.get<{ id: string; sku: string; name: string | null }[]>('/products/sku-list'),

  /**
   * 获取分类列表
   */
  getCategories: () => api.get<string[]>('/products/categories'),

  /**
   * 获取分类层级 (Category → SubCategory → Type)
   */
  getHierarchy: () => api.get<CategoryHierarchy>('/products/hierarchy'),

  /**
   * 创建产品 (需要 L2 安全码)
   */
  create: (data: CreateProductDto & { sec_code_l2: string }) => api.post<Product>('/products', data),

  /**
   * 更新产品 (需要 L2 安全码)
   */
  update: (id: string, data: UpdateProductDto & { sec_code_l2: string }) =>
    api.patch<Product>(`/products/${id}`, data),

  /**
   * 更新单个产品 (COGS 编辑 Modal)
   */
  updateProduct: (id: string, data: UpdateProductDto & { sec_code_l2: string }) =>
    api.patch<Product>(`/products/${id}`, data),

  /**
   * 批量更新 COGS (需要 L2 安全码)
   */
  batchUpdateCogs: (data: BatchUpdateCogsDto & { sec_code_l2: string }) =>
    api.post<BatchUpdateResult>('/products/cogs/batch', data),

  /**
   * 删除产品 (需要 L3 安全码)
   */
  delete: (id: string, sec_code_l3: string) =>
    api.delete<{ success: boolean }>(`/products/${id}`, { sec_code_l3 }),

  /**
   * 生成条形码 PDF (返回 Blob)
   */
  generateBarcodePdf: async (data: GenerateBarcodeDto & Record<string, unknown>): Promise<Blob> => {
    const API_BASE_URL = getApiBaseUrlCached();
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    
    const response = await fetch(`${API_BASE_URL}/products/barcode/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let message = `HTTP ${response.status}: `;
      try {
        const json = JSON.parse(errorBody);
        message += json.message || json.error || errorBody;
      } catch {
        message += errorBody || 'Failed to generate barcodes';
      }
      console.error('[Barcode API]', message, { status: response.status, body: errorBody });
      throw new Error(message);
    }

    return response.blob();
  },
};
