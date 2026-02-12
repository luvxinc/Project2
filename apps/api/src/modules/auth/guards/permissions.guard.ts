import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../../common/prisma';
import { CacheService } from '../../../common/redis';

/**
 * 🔒 权限守卫 - 动态权限检查
 * 
 * 权限读取策略（按优先级）：
 * 1. Redis 缓存（5分钟 TTL）- 性能优化
 * 2. 数据库实时查询 - 确保权限变更立即生效
 * 
 * 当管理员修改用户权限后，只需清除该用户的 Redis 缓存即可立即生效
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 如果没有指定权限要求，则允许访问
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    if (!user || !user.userId) {
      throw new ForbiddenException('无访问权限');
    }

    // � Superuser 绕过权限检查 - 拥有所有权限
    const userRoles = user.roles || [];
    if (userRoles.includes('superuser')) {
      this.logger.debug(`Superuser ${user.userId} bypasses permission check`);
      // 设置完整权限供后续使用
      request.user.permissions = { modules: { '*': { '*': ['*'] } } };
      return true;
    }

    // �🔄 动态获取用户权限（优先 Redis，回退数据库）
    const permissions = await this.getDynamicPermissions(user.userId);
    
    if (!permissions) {
      throw new ForbiddenException('无访问权限');
    }

    // 检查每个必需的权限
    const hasAllPermissions = requiredPermissions.every((permission) => 
      this.checkPermission(permissions, permission)
    );

    if (!hasAllPermissions) {
      this.logger.warn(`Permission denied for user ${user.userId}: requires ${requiredPermissions.join(', ')}`);
      throw new ForbiddenException('权限不足');
    }

    // 将动态权限附加到请求对象，供后续中间件使用
    request.user.permissions = permissions;

    return true;
  }

  /**
   * 动态获取用户权限
   * 优先从 Redis 缓存读取，缓存未命中则从数据库读取并缓存
   * 
   * 注意: 缓存键必须与 CacheService.invalidateUserPermissions 使用的一致
   */
  private async getDynamicPermissions(userId: string): Promise<any> {
    // 使用与 CacheService 一致的缓存键格式: perm:{userId}
    const cacheKey = `perm:${userId}`;
    
    // 尝试从 Redis 获取
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库读取
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { permissions: true, status: true },
    });

    if (!user) {
      return null;
    }

    // 检查用户状态
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('账户状态异常');
    }

    // 缓存到 Redis (5分钟 TTL)
    if (user.permissions) {
      await this.cacheService.set(cacheKey, user.permissions, 300);
    }

    return user.permissions || {};
  }

  /**
   * 检查用户是否拥有指定权限
   * 
   * 支持两种权限存储格式:
   * 1. 扁平 key 格式 (前端权限配置页保存):
   *    { "module.vma.employees.manage": true, "module.products.catalog": true }
   * 2. 嵌套格式 (遗留):
   *    { modules: { vma: { employees: ["manage"] } } }
   * 
   * @Permissions 装饰器格式: 'vma.employees.manage'
   * 扁平 key 格式: 'module.vma.employees.manage'
   */
  private checkPermission(userPermissions: any, requiredPermission: string): boolean {
    if (!userPermissions) return false;

    const parts = requiredPermission.split('.');
    if (parts.length < 2) {
      return false;
    }

    // ===== 策略1: 扁平 key 匹配 (前端保存格式) =====
    // @Permissions('vma.employees.manage') → 匹配 key "module.vma.employees.manage"
    const flatKey = `module.${requiredPermission}`;
    if (userPermissions[flatKey] === true) {
      return true;
    }

    // 还要检查父级 key — 如果用户有 "module.vma" 权限，则所有 vma.* 子权限都通过
    const module = parts[0];
    if (userPermissions[`module.${module}`] === true) {
      return true;
    }

    // 检查中间层级 — "module.vma.employees" 覆盖 "vma.employees.*"
    for (let i = 2; i <= parts.length; i++) {
      const parentKey = `module.${parts.slice(0, i).join('.')}`;
      if (userPermissions[parentKey] === true) {
        return true;
      }
    }

    // ===== 策略2: 嵌套格式匹配 (遗留兼容) =====
    const [mod, ...rest] = parts;
    const submodule = rest.slice(0, -1).join('.') || '*';
    const action = rest[rest.length - 1];

    const modulePerms = userPermissions?.modules?.[mod];
    if (!modulePerms) {
      return false;
    }

    // 检查通配符权限
    if (modulePerms['*']?.includes('*')) {
      return true;
    }

    const submodulePerms = modulePerms[submodule];
    if (!submodulePerms) {
      // 检查模块级通配符
      return modulePerms['*']?.includes(action) || modulePerms['*']?.includes('*');
    }

    return submodulePerms.includes(action) || submodulePerms.includes('*');
  }
}
