import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@mgmt/shared';

export const ROLES_KEY = 'roles';

/**
 * 指定端点需要的角色
 * @param roles 允许访问的角色列表
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
