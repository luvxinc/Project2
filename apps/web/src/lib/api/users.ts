/**
 * Users API - V2 用户管理 API
 */
import { api, ApiResponse } from './client';

// ============ 类型定义 ============

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';
export type UserRole = 'superuser' | 'admin' | 'staff' | 'manager' | 'operator' | 'viewer';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  roles: UserRole[];
  permissions?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  roles?: UserRole[];
  permissions?: Record<string, unknown>;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  displayName?: string;
}

export interface UpdatePermissionsDto {
  permissions: Record<string, unknown>;
  roles?: UserRole[];
}

export interface ResetPasswordDto {
  newPassword: string;
}

// ============ API 函数 ============

export const usersApi = {
  /**
   * 获取用户列表
   * V3 returns: { users: [...], total, page, totalPages } after unwrap
   */
  findAll: async (params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<User[]>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    
    const queryString = query.toString();
    const raw = await api.get<Record<string, unknown>>(`/users${queryString ? `?${queryString}` : ''}`);
    
    // Normalize: V3 returns { users: [...], total, page, totalPages }
    // Frontend expects: { data: User[], meta: { total, page, limit, totalPages } }
    if (Array.isArray(raw.users)) {
      return {
        data: raw.users as User[],
        meta: {
          total: Number(raw.total ?? 0),
          page: Number(raw.page ?? 1),
          limit: Number(raw.limit ?? raw.totalPages ?? 20),
          totalPages: Number(raw.totalPages ?? 1),
        },
      };
    }
    // Already in expected format
    if (Array.isArray(raw.data)) {
      return raw as unknown as ApiResponse<User[]>;
    }
    // Fallback
    return { data: [] };
  },

  /**
   * 获取单个用户
   */
  findOne: (id: string) => api.get<User>(`/users/${id}`),

  /**
   * 创建用户
   */
  create: (data: CreateUserDto & { sec_code_l2: string }) =>
    api.post<User>('/users', data),

  /**
   * 更新用户
   */
  update: (id: string, data: UpdateUserDto & { sec_code_l2: string }) =>
    api.patch<User>(`/users/${id}`, data),

  /**
   * 删除用户
   */
  delete: (id: string, securityCode: string, reason: string = '管理员删除用户') =>
    api.delete<void>(`/users/${id}`, { sec_code_l4: securityCode, reason }),

  /**
   * 锁定用户
   */
  lock: (id: string, securityCode: string) =>
    api.post<User>(`/users/${id}/lock`, { sec_code_l2: securityCode }),

  /**
   * 解锁用户
   */
  unlock: (id: string, securityCode: string) =>
    api.post<User>(`/users/${id}/unlock`, { sec_code_l2: securityCode }),

  /**
   * 更新权限
   */
  updatePermissions: (
    id: string,
    data: UpdatePermissionsDto & { sec_code_l2: string }
  ) => api.put<User>(`/users/${id}/permissions`, data),

  /**
   * 重置密码
   */
  resetPassword: (id: string, data: ResetPasswordDto & { sec_code_l2: string }) =>
    api.post<User>(`/users/${id}/reset-password`, data),

  /**
   * 变更用户角色 (升级/降级)
   */
  changeRole: (id: string, data: { roles: UserRole[]; sec_code_l2: string }) =>
    api.put<User>(`/users/${id}/permissions`, { permissions: {}, roles: data.roles, sec_code_l2: data.sec_code_l2 }),

  /**
   * 检查用户名是否可用
   */
  checkUsername: (username: string) =>
    api.get<{ username: string; available: boolean }>(`/users/check-username?username=${encodeURIComponent(username)}`),

  /**
   * 检查当前用户角色状态（轻量级轮询）
   * V1 parity: check_role_version
   */
  roleCheck: () =>
    api.get<{ userId: string; roles: string[]; status: string }>('/auth/role-check'),
};

export default usersApi;
