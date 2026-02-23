/**
 * VMA React Query Hooks (F-2)
 *
 * Centralized data fetching for VMA module using @tanstack/react-query.
 * Replaces raw fetch + useState + useEffect + useCallback patterns.
 *
 * Benefits:
 * - Automatic caching & deduplication
 * - Background refetching
 * - Loading/error states managed by RQ
 * - Automatic retry on failure
 * - Mutation with cache invalidation
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VMA_API, getAuthHeaders } from '@/lib/vma-api';

// ================================
// Shared fetcher
// ================================
async function vmaFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${VMA_API}${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers || {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    // 401 → JWT expired — clear auth state and redirect to login
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      document.cookie = 'auth_session=; path=/; max-age=0';
      if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

async function vmaMutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  return vmaFetch<T>(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ================================
// Query Keys (centralized for cache invalidation)
// ================================
export const vmaKeys = {
  // Employees
  employees: {
    all: ['vma', 'employees'] as const,
    list: (params?: Record<string, string>) => ['vma', 'employees', 'list', params] as const,
    detail: (id: string) => ['vma', 'employees', 'detail', id] as const,
  },
  // Departments
  departments: {
    all: ['vma', 'departments'] as const,
    list: () => ['vma', 'departments', 'list'] as const,
  },
  // Inventory
  inventory: {
    all: ['vma', 'inventory'] as const,
    transactions: (type?: string) => ['vma', 'inventory', 'transactions', type] as const,
    summary: (type: string) => ['vma', 'inventory', 'summary', type] as const,
    detail: (type: string, spec: string) => ['vma', 'inventory', 'detail', type, spec] as const,
    demo: () => ['vma', 'inventory', 'demo'] as const,
    operators: () => ['vma', 'inventory', 'operators'] as const,
    specs: (type: string) => ['vma', 'inventory', 'specs', type] as const,
  },
  // Clinical Cases
  clinical: {
    all: ['vma', 'clinical'] as const,
    list: (params?: Record<string, string>) => ['vma', 'clinical', 'list', params] as const,
    detail: (id: string) => ['vma', 'clinical', 'detail', id] as const,
  },
  // Training SOP
  trainingSop: {
    all: ['vma', 'training-sop'] as const,
    list: () => ['vma', 'training-sop', 'list'] as const,
  },
  // Training Records
  trainingRecords: {
    all: ['vma', 'training-records'] as const,
    list: () => ['vma', 'training-records', 'list'] as const,
    sessions: () => ['vma', 'training-records', 'sessions'] as const,
  },
  // Products
  products: {
    pvalve: () => ['vma', 'products', 'pvalve'] as const,
    deliverySystem: () => ['vma', 'products', 'delivery-system'] as const,
    fits: () => ['vma', 'products', 'fits'] as const,
  },
  // Sites
  sites: {
    all: ['vma', 'sites'] as const,
    list: () => ['vma', 'sites', 'list'] as const,
  },
  // Overview
  overview: {
    summary: () => ['vma', 'overview', 'summary'] as const,
  },
};

// ================================
// Employee Hooks
// ================================
interface EmployeeListParams {
  search?: string;
  departmentId?: string;
  status?: string;
}

export function useEmployees(params?: EmployeeListParams) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.departmentId) searchParams.set('departmentId', params.departmentId);
  if (params?.status) searchParams.set('status', params.status);
  const qs = searchParams.toString();

  return useQuery({
    queryKey: vmaKeys.employees.list(params as Record<string, string>),
    queryFn: () => vmaFetch<{ data: any[]; total: number }>(`/vma/employees${qs ? `?${qs}` : ''}`),
  });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: vmaKeys.employees.detail(id || ''),
    queryFn: () => vmaFetch<any>(`/vma/employees/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/employees', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.employees.all }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      vmaMutate(`/vma/employees/${id}`, 'PATCH', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.employees.all }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vmaMutate(`/vma/employees/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.employees.all }),
  });
}

// ================================
// Department Hooks
// ================================
export function useDepartments() {
  return useQuery({
    queryKey: vmaKeys.departments.list(),
    queryFn: () => vmaFetch<any[]>('/vma/departments'),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/departments', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.departments.all }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      vmaMutate(`/vma/departments/${id}`, 'PATCH', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.departments.all }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vmaMutate(`/vma/departments/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.departments.all }),
  });
}

// ================================
// Inventory Hooks
// ================================
export function useInventoryTransactions(productType?: string) {
  return useQuery({
    queryKey: vmaKeys.inventory.transactions(productType),
    queryFn: () => vmaFetch<any[]>(
      `/vma/inventory-transactions${productType ? `?productType=${productType}` : ''}`
    ),
  });
}

export function useInventorySummary(productType: string) {
  return useQuery({
    queryKey: vmaKeys.inventory.summary(productType),
    queryFn: () => vmaFetch<any[]>(`/vma/inventory-transactions/summary?productType=${productType}`),
  });
}

export function useInventoryDetail(productType: string, specNo: string | null) {
  return useQuery({
    queryKey: vmaKeys.inventory.detail(productType, specNo || ''),
    queryFn: () => vmaFetch<any>(`/vma/inventory-transactions/detail?specNo=${encodeURIComponent(specNo!)}&productType=${productType}`),
    enabled: !!specNo,
  });
}

export function useDemoInventory() {
  return useQuery({
    queryKey: vmaKeys.inventory.demo(),
    queryFn: () => vmaFetch<any[]>('/vma/inventory-transactions/demo'),
  });
}

export function useActiveOperators() {
  return useQuery({
    queryKey: vmaKeys.inventory.operators(),
    queryFn: () => vmaFetch<string[]>('/vma/inventory-transactions/operators'),
  });
}

export function useSpecOptions(productType: string) {
  return useQuery({
    queryKey: vmaKeys.inventory.specs(productType),
    queryFn: () => vmaFetch<any[]>(`/vma/inventory-transactions/spec-options?productType=${productType}`),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/inventory-transactions', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.inventory.all }),
  });
}

// ================================
// Clinical Case Hooks
// ================================
export function useClinicalCases(params?: Record<string, string>) {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: vmaKeys.clinical.list(params),
    queryFn: () => vmaFetch<any[]>(`/vma/clinical-cases${qs ? `?${qs}` : ''}`),
  });
}

export function useClinicalCase(caseId: string | null) {
  return useQuery({
    queryKey: vmaKeys.clinical.detail(caseId || ''),
    queryFn: () => vmaFetch<any>(`/vma/clinical-cases/${caseId}`),
    enabled: !!caseId,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/clinical-cases', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.clinical.all }),
  });
}

export function useCompleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: any }) =>
      vmaMutate(`/vma/clinical-cases/${caseId}/complete`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmaKeys.clinical.all });
      qc.invalidateQueries({ queryKey: vmaKeys.inventory.all });
    },
  });
}

export function useReverseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      vmaMutate(`/vma/clinical-cases/${caseId}/reverse`, 'POST'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmaKeys.clinical.all });
      qc.invalidateQueries({ queryKey: vmaKeys.inventory.all });
    },
  });
}

// ================================
// Training SOP Hooks
// ================================
export function useTrainingSops() {
  return useQuery({
    queryKey: vmaKeys.trainingSop.list(),
    queryFn: () => vmaFetch<any[]>('/vma/training-sops'),
  });
}

export function useCreateTrainingSop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/training-sops', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.trainingSop.all }),
  });
}

export function useUpdateTrainingSop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      vmaMutate(`/vma/training-sops/${id}`, 'PATCH', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.trainingSop.all }),
  });
}

// ================================
// Training Records Hooks
// ================================
export function useTrainingRecords() {
  return useQuery({
    queryKey: vmaKeys.trainingRecords.list(),
    queryFn: () => vmaFetch<any[]>('/vma/training-records'),
  });
}

export function useTrainingSessions() {
  return useQuery({
    queryKey: vmaKeys.trainingRecords.sessions(),
    queryFn: () => vmaFetch<any[]>('/vma/training-records/sessions'),
  });
}

// ================================
// Product Hooks
// ================================
export function usePValveProducts() {
  return useQuery({
    queryKey: vmaKeys.products.pvalve(),
    queryFn: () => vmaFetch<any[]>('/vma/pvalve-products'),
  });
}

export function useDeliverySystemProducts() {
  return useQuery({
    queryKey: vmaKeys.products.deliverySystem(),
    queryFn: () => vmaFetch<any[]>('/vma/delivery-system-products'),
  });
}

export function useDeliverySystemFits() {
  return useQuery({
    queryKey: vmaKeys.products.fits(),
    queryFn: () => vmaFetch<any[]>('/vma/fit-matrix'),
  });
}

// ================================
// Site Hooks
// ================================
export function useSites() {
  return useQuery({
    queryKey: vmaKeys.sites.list(),
    queryFn: () => vmaFetch<any[]>('/vma/sites'),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => vmaMutate('/vma/sites', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.sites.all }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, data }: { siteId: string; data: any }) =>
      vmaMutate(`/vma/sites/${siteId}`, 'PATCH', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: vmaKeys.sites.all }),
  });
}

// ================================
// Re-export for convenience
// ================================
export { vmaFetch, vmaMutate };
