/**
 * Users Service - 用户管理业务逻辑
 * 
 * 安全规则:
 * - 所有敏感操作需要 SecurityLevel 验证
 * - 层级保护: 只能操作低于自己角色的用户
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CacheService } from '../../common/redis';
import * as bcrypt from 'bcrypt';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdatePermissionsDto,
} from './dto/users.dto';

// 角色层级定义 (数值越小权限越高: L0=超管, L1=管理员, L2=员工, L3=编辑)
const ROLE_HIERARCHY: Record<string, number> = {
  superuser: 0,
  admin: 1,
  staff: 2,
  editor: 3,
};

// [S-04] 权限白名单 - 与老架构 SecurityInventory.WHITELIST_PERMISSIONS 一致
const WHITELIST_PERMISSIONS = new Set<string>([
  // 销售板块 - 4个tab
  'module.sales.transactions.upload',
  'module.sales.reports.generate',
  'module.sales.reports.center',
  'module.sales.visuals.dashboard',
  
  // 采购板块 - 9个tab
  'module.purchase.supplier.add',
  'module.purchase.supplier.strategy',
  'module.purchase.po.add',
  'module.purchase.po.mgmt',
  'module.purchase.send.add',
  'module.purchase.send.mgmt',
  'module.purchase.receive',
  'module.purchase.receive.mgmt',
  'module.purchase.abnormal.manage',
  
  // 财务板块 - 5个tab
  'module.finance.flow.view',
  'module.finance.logistic.manage',
  'module.finance.prepay.manage',
  'module.finance.deposit.manage',
  'module.finance.po.manage',
  
  // 库存板块 - 4个tab
  'module.inventory.stocktake.upload',
  'module.inventory.stocktake.modify',
  'module.inventory.dynamic.view',
  'module.inventory.shelf.manage',
  
  // 产品板块 - 3个tab
  'module.products.catalog.cogs',
  'module.products.catalog.create',
  'module.products.barcode.generate',
  
  // 数据库运维 - 4个tab
  'module.db_admin.backup.create',
  'module.db_admin.backup.restore',
  'module.db_admin.backup.manage',
  'module.db_admin.cleanup.delete',
  
  // 用户权限管理 - 2个submodule
  'module.user_admin.users',
  'module.user_admin.register',
  
  // 安全审计日志 - 3个tab
  'module.audit.logs.business',
  'module.audit.logs.infra',
  'module.audit.logs.system',
  
  // VMA 模块 - 4个tab
  'module.vma.employees.manage',
  'module.vma.departments.manage',
  'module.vma.training_sop.manage',
  'module.vma.training.manage',
]);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 获取用户列表
   */
  async findAll(options?: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = options || {};
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { displayName: { contains: search, mode: 'insensitive' as const } },
          ],
          deletedAt: null,
        }
      : { deletedAt: null };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          status: true,
          roles: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取单个用户
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        status: true,
        roles: true,
        permissions: true,
        settings: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  /**
   * 创建用户
   * 安全等级: L2 (需要安全码验证)
   * 
   * 安全规则:
   * 1. 禁止创建 superuser 角色
   * 2. 非 superuser 只能创建 editor/staff 角色
   */
  async create(dto: CreateUserDto, actorId?: string) {
    // [S-03] 角色提权保护
    const requestedRoles = dto.roles || ['editor'];
    
    // 1. 绝对禁止创建 superuser
    if (requestedRoles.includes('superuser')) {
      throw new ForbiddenException({
        code: 'ROLE_ESCALATION_BLOCKED',
        message: '无法创建 superuser 角色用户',
      });
    }
    
    // 2. 非 superuser 不能创建 admin
    if (actorId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { roles: true },
      });
      
      const isSuperuser = actor?.roles.includes('superuser');
      
      if (!isSuperuser && requestedRoles.includes('admin')) {
        throw new ForbiddenException({
          code: 'ROLE_ESCALATION_BLOCKED',
          message: '非超级管理员无法创建管理员账户',
        });
      }
    }

    // 检查用户名和邮箱是否存在
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });

    if (existingUser) {
      if (existingUser.username === dto.username) {
        throw new ConflictException('用户名已存在');
      }
      throw new ConflictException('邮箱已被使用');
    }

    // 密码哈希
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    // 创建用户 - 默认角色为 editor
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        roles: requestedRoles,
        permissions: dto.permissions || {},
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        status: true,
        roles: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * 更新用户基本信息
   * 安全等级: L2 (需要安全码验证)
   */
  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.findOne(id);
    
    // 层级检查
    await this.checkHierarchy(actorId, id, 'update');

    // 如果更新用户名或邮箱，检查是否冲突
    if (dto.username || dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [
            dto.username ? { username: dto.username } : {},
            dto.email ? { email: dto.email } : {},
          ].filter((o) => Object.keys(o).length > 0),
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('用户名或邮箱已被使用');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.username && { username: dto.username }),
        ...(dto.email && { email: dto.email }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        status: true,
        roles: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 删除用户 (软删除)
   * 安全等级: L3 (高风险操作)
   * 
   * 安全规则:
   * 1. 禁止删除自己
   * 2. 禁止删除 SuperAdmin
   * 3. 必须提供删除原因
   * 4. 层级检查
   */
  async delete(id: string, actorId: string, reason?: string) {
    const user = await this.findOne(id);
    
    // [S-06] 删除原因必填
    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: '请提供删除原因',
      });
    }
    
    // 层级检查
    await this.checkHierarchy(actorId, id, 'delete');

    // 禁止删除自己
    if (id === actorId) {
      throw new ForbiddenException('不能删除自己');
    }

    // [S-02] SuperAdmin 保护
    await this.checkProtectedUser(id, 'delete');

    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DISABLED',
      },
    });
  }

  /**
   * 锁定用户
   * 安全等级: L2
   * 
   * 安全规则:
   * 1. 禁止锁定自己
   * 2. 禁止锁定 SuperAdmin
   * 3. 层级检查
   */
  async lock(id: string, actorId: string) {
    const user = await this.findOne(id);
    
    // 层级检查
    await this.checkHierarchy(actorId, id, 'lock');

    // 禁止锁定自己
    if (id === actorId) {
      throw new ForbiddenException('不能锁定自己');
    }

    // [S-02] SuperAdmin 保护
    await this.checkProtectedUser(id, 'lock');

    if (user.status === 'LOCKED') {
      throw new BadRequestException('用户已被锁定');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: 'LOCKED' },
      select: {
        id: true,
        username: true,
        status: true,
      },
    });
  }

  /**
   * 解锁用户
   * 安全等级: L2
   * 
   * 安全规则:
   * 1. 层级检查
   * 2. 禁止解锁 SuperAdmin (理论上不应该被锁定)
   */
  async unlock(id: string, actorId: string) {
    const user = await this.findOne(id);
    
    // 层级检查
    await this.checkHierarchy(actorId, id, 'unlock');

    // [S-02] SuperAdmin 保护 (以防万一)
    await this.checkProtectedUser(id, 'unlock');

    if (user.status !== 'LOCKED') {
      throw new BadRequestException('用户未被锁定');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: {
        id: true,
        username: true,
        status: true,
      },
    });
  }

  /**
   * 更新用户权限
   * 安全等级: L2
   * 
   * 安全规则:
   * 1. 层级检查: 操作者角色必须高于目标用户
   * 2. 权限穿透: 非 superuser 只能授予自己拥有的权限
   * 3. 白名单验证: 只接受合法的权限 key
   */
  async updatePermissions(
    id: string,
    dto: UpdatePermissionsDto,
    actorId: string,
  ) {
    await this.findOne(id);
    
    // 1. 层级检查
    await this.checkHierarchy(actorId, id, 'update permissions');

    // 2. 权限穿透验证 (Permission Passthrough)
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { roles: true, permissions: true },
    });

    if (!actor) {
      throw new NotFoundException('操作者用户不存在');
    }

    const isSuperuser = actor.roles.includes('superuser');
    
    if (!isSuperuser) {
      // 获取操作者的权限集合
      const actorPerms = new Set<string>(
        actor.permissions 
          ? Object.keys(actor.permissions as Record<string, unknown>).filter(
              k => (actor.permissions as Record<string, boolean>)[k] === true
            )
          : []
      );
      
      // 获取请求授予的权限集合 (值为 true 的)
      const requestedPerms = new Set<string>(
        dto.permissions
          ? Object.keys(dto.permissions).filter(k => dto.permissions[k] === true)
          : []
      );
      
      // 检查是否有超出操作者权限范围的项
      const forbiddenPerms = [...requestedPerms].filter(p => !actorPerms.has(p));
      
      if (forbiddenPerms.length > 0) {
        throw new ForbiddenException({
          code: 'PERMISSION_PASSTHROUGH_VIOLATION',
          message: '权限穿透违规: 包含超出当前操作者权限范围的项',
          forbiddenCount: forbiddenPerms.length,
          // 仅在开发环境返回具体项 (生产环境安全考虑)
          ...(process.env.NODE_ENV !== 'production' && { 
            forbiddenKeys: forbiddenPerms.slice(0, 5) 
          }),
        });
      }
    }

    // 3. [S-04] 白名单验证 - 拒绝非法权限 key
    const allRequestedKeys = dto.permissions ? Object.keys(dto.permissions) : [];
    const invalidKeys = allRequestedKeys.filter(k => !WHITELIST_PERMISSIONS.has(k));
    
    if (invalidKeys.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION_KEYS',
        message: '包含未知权限项，已拒绝保存',
        invalidCount: invalidKeys.length,
        // 仅在开发环境返回具体项
        ...(process.env.NODE_ENV !== 'production' && { 
          invalidKeys: invalidKeys.slice(0, 5) 
        }),
      });
    }

    // 4. 保存权限
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        permissions: dto.permissions,
        ...(dto.roles && { roles: dto.roles }),
      },
      select: {
        id: true,
        username: true,
        roles: true,
        permissions: true,
        updatedAt: true,
      },
    });

    // 5. 🔄 清除权限缓存 → 下次请求即时生效（无需重新登录）
    // PermissionsGuard 会从数据库动态读取最新权限
    await this.cacheService.invalidateUserPermissions(id);
    this.logger.log(`User ${id} permissions updated, cache invalidated (instant effect)`);

    return updatedUser;
  }

  /**
   * 重置用户密码 (管理员操作他人密码)
   * 安全等级: L2
   * 
   * 安全规则:
   * 1. 禁止用此方法修改自己的密码 (需使用 changeOwnPassword)
   * 2. 层级检查
   * 3. SuperAdmin 保护
   */
  async resetPassword(id: string, newPassword: string, actorId: string) {
    await this.findOne(id);
    
    // [S-05] 禁止用此方法修改自己的密码
    if (id === actorId) {
      throw new BadRequestException({
        code: 'USE_CHANGE_OWN_PASSWORD',
        message: '修改自己的密码请使用专用接口，需验证当前密码',
      });
    }
    
    // 层级检查
    await this.checkHierarchy(actorId, id, 'reset password');

    // SuperAdmin 保护
    await this.checkProtectedUser(id, 'reset password');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const result = await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: {
        id: true,
        username: true,
        updatedAt: true,
      },
    });

    // 🔒 强制登出被修改密码的用户
    await this.forceLogoutUser(id);
    this.logger.log(`User ${id} password reset, forced logout`);

    return result;
  }

  /**
   * [S-05] 修改自己的密码 (需验证旧密码)
   * 安全等级: L1 (仅需登录)
   * 
   * 安全规则:
   * 1. 必须验证旧密码
   * 2. 新密码和确认密码必须匹配
   */
  async changeOwnPassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    // 1. 验证新密码匹配
    if (newPassword !== confirmPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_MISMATCH',
        message: '两次输入的新密码不一致',
      });
    }

    // 2. 获取用户并验证旧密码
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 3. 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new ForbiddenException({
        code: 'INVALID_OLD_PASSWORD',
        message: '当前密码不正确',
      });
    }

    // 4. 更新密码
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: {
        id: true,
        username: true,
        updatedAt: true,
      },
    });

    // 🔒 强制登出自己，要求重新登录
    await this.forceLogoutUser(userId);
    this.logger.log(`User ${userId} changed own password, forced logout`);

    return result;
  }

  /**
   * 层级检查 - 确保操作者角色高于目标用户
   */
  private async checkHierarchy(
    actorId: string,
    targetId: string,
    action: string,
  ): Promise<void> {
    if (actorId === targetId) {
      return; // 操作自己不需要层级检查
    }

    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { roles: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: { roles: true },
      }),
    ]);

    if (!actor || !target) {
      throw new NotFoundException('用户不存在');
    }

    const actorLevel = this.getHighestRoleLevel(actor.roles);
    const targetLevel = this.getHighestRoleLevel(target.roles);

    // 数值越小权限越高，所以 actorLevel >= targetLevel 表示权限不足
    if (actorLevel >= targetLevel) {
      throw new ForbiddenException(
        `权限不足: 无法对同级或更高级别用户执行 ${action} 操作`,
      );
    }
  }

  /**
   * 获取用户最高角色等级 (数值越小权限越高)
   */
  private getHighestRoleLevel(roles: string[]): number {
    if (!roles || roles.length === 0) {
      return 999; // 无角色时返回最低权限
    }
    // 返回最小值（权限最高）
    return Math.min(...roles.map((role) => ROLE_HIERARCHY[role] ?? 999));
  }

  /**
   * [S-02] SuperAdmin 保护 - 禁止对 SuperAdmin 执行敏感操作
   */
  private async checkProtectedUser(targetId: string, action: string): Promise<void> {
    const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
    
    if (SUPER_ADMIN_ID && targetId === SUPER_ADMIN_ID) {
      throw new ForbiddenException({
        code: 'PROTECTED_USER',
        message: `无法对系统管理员账户执行 ${action} 操作`,
      });
    }

    // 额外检查: 如果目标用户包含 superuser 角色，也受保护
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { roles: true },
    });

    if (target?.roles.includes('superuser')) {
      throw new ForbiddenException({
        code: 'PROTECTED_USER',
        message: `无法对超级管理员执行 ${action} 操作`,
      });
    }
  }

  // ================================
  // 🔒 强制登出相关方法
  // ================================

  /**
   * 强制登出单个用户
   * 1. 撤销所有 refresh tokens
   * 2. 清除 Redis 会话缓存
   * 3. 清除权限缓存
   */
  async forceLogoutUser(userId: string): Promise<void> {
    // 1. 撤销所有 refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 2. 清除 Redis 缓存
    await this.cacheService.clearSession(userId);
    await this.cacheService.invalidateUserPermissions(userId);

    this.logger.log(`🔒 Forced logout: user ${userId}`);
  }

  /**
   * 强制登出某个角色的所有用户
   * 用于职能边界变更后影响所有相关用户
   */
  async forceLogoutUsersByRole(roleName: string): Promise<number> {
    // 1. 查找所有包含该角色的用户
    const users = await this.prisma.user.findMany({
      where: {
        roles: { has: roleName },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    // 2. 批量强制登出
    for (const user of users) {
      await this.forceLogoutUser(user.id);
    }

    this.logger.log(`🔒 Forced logout ${users.length} users with role: ${roleName}`);
    return users.length;
  }

  /**
   * 强制登出所有用户
   * 用于安全策略矩阵变更等全局配置更新
   */
  async forceLogoutAllUsers(): Promise<number> {
    // 1. 撤销所有未撤销的 refresh tokens
    const result = await this.prisma.refreshToken.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 2. 清除所有用户权限缓存
    await this.cacheService.invalidateAllUserPermissions();

    this.logger.warn(`⚠️ Forced logout ALL users (${result.count} tokens revoked)`);
    return result.count;
  }
}
