/**
 * Roles API - V2 职能角色管理 API
 */
import { api, ApiResponse } from './client';

// ============ 类型定义 ============

export type BoundaryType = 'ALLOWED' | 'DENIED' | 'INHERITED';

export interface Role {
  id: string;
  name: string;
  displayName: string;
  level: number;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  boundaries?: RolePermissionBoundary[];
  _count?: {
    boundaries: number;
  };
}

export interface RolePermissionBoundary {
  id: string;
  roleId: string;
  permissionKey: string;
  boundaryType: BoundaryType;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleDto {
  name: string;
  displayName: string;
  level: number;
  description?: string;
  color?: string;
}

export interface UpdateRoleDto {
  name?: string;
  displayName?: string;
  level?: number;
  description?: string;
  color?: string;
}

export interface BoundaryDto {
  permissionKey: string;
  boundaryType: BoundaryType;
  description?: string;
}

// ============ API 函数 ============

export const rolesApi = {
  /**
   * 获取所有职能角色
   */
  findAll: () => api.get<Role[]>('/roles'),

  /**
   * 获取单个职能角色
   */
  findOne: (id: string) => api.get<Role>(`/roles/${id}`),

  /**
   * 创建新职能
   */
  create: (data: CreateRoleDto & { sec_code_l3: string }) =>
    api.post<Role>('/roles', data),

  /**
   * 更新职能信息
   */
  update: (id: string, data: UpdateRoleDto & { sec_code_l3: string }) =>
    api.patch<Role>(`/roles/${id}`, data),

  /**
   * 删除职能
   */
  delete: (id: string, data: { sec_code_l4: string }) =>
    api.delete<void>(`/roles/${id}`),

  // ============ 权限边界管理 ============

  /**
   * 获取角色的权限边界
   */
  getBoundaries: (roleId: string) =>
    api.get<RolePermissionBoundary[]>(`/roles/${roleId}/boundaries`),

  /**
   * 批量设置权限边界 (需要 L1 + L4 安全码)
   */
  setBoundaries: (
    roleId: string,
    boundaries: BoundaryDto[],
    data: { sec_code_l1: string; sec_code_l4: string }
  ) =>
    api.put<RolePermissionBoundary[]>(`/roles/${roleId}/boundaries`, {
      ...data,
      boundaries,
    }),

  /**
   * 添加单个权限边界
   */
  addBoundary: (roleId: string, boundary: BoundaryDto & { sec_code_l2: string }) =>
    api.post<RolePermissionBoundary>(`/roles/${roleId}/boundaries`, boundary),

  /**
   * 删除权限边界
   */
  removeBoundary: (
    roleId: string,
    permissionKey: string,
    data: { sec_code_l3: string }
  ) => api.delete<void>(`/roles/${roleId}/boundaries/${encodeURIComponent(permissionKey)}`),

  /**
   * 初始化系统角色 (Seed)
   */
  seed: (data: { sec_code_l4: string }) => api.post<{ seeded: number }>('/roles/seed', data),
};

export default rolesApi;
