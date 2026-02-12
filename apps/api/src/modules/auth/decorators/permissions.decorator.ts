import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 指定端点需要的权限
 * @param permissions 需要的权限，格式: 'module.submodule.action'
 */
export const Permissions = (...permissions: string[]) => 
  SetMetadata(PERMISSIONS_KEY, permissions);
