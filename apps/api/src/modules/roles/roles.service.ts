/**
 * Roles Service - 职能角色管理
 * 
 * 功能:
 * 1. 动态管理职能列表（增加/减少/命名修改）
 * 2. 配置不同职能的权限边界
 * 
 * 安全:
 * - 仅 superuser 可以操作
 * - 系统角色不可删除
 * - 🔒 职能边界变更后会强制登出相关用户
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CacheService } from '../../common/redis';

// 系统保护的角色名称 (superuser 不可删除)
const SYSTEM_ROLES = ['superuser'];

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 获取所有职能角色
   */
  async findAll() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      orderBy: { level: 'asc' },
      include: {
        boundaries: {
          select: {
            id: true,
            permissionKey: true,
            boundaryType: true,
          },
        },
        _count: {
          select: { boundaries: true },
        },
      },
    });
  }

  /**
   * 获取单个职能角色详情
   */
  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        boundaries: true,
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found',
      });
    }

    return role;
  }

  /**
   * 根据角色名获取角色
   */
  async findByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
      include: { boundaries: true },
    });
  }

  /**
   * 创建新职能
   * 仅 superuser
   */
  async create(dto: CreateRoleDto, actorId: string) {
    await this.checkSuperuserAccess(actorId);

    // 检查名称冲突
    const existing = await this.prisma.role.findFirst({
      where: {
        OR: [{ name: dto.name }, { level: dto.level }],
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'ROLE_CONFLICT',
        message: existing.name === dto.name 
          ? 'Role name already exists'
          : 'Role level already exists',
      });
    }

    return this.prisma.role.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        level: dto.level,
        description: dto.description,
        color: dto.color,
        isSystem: false,
      },
    });
  }

  /**
   * 更新职能信息
   * 仅 superuser
   */
  async update(id: string, dto: UpdateRoleDto, actorId: string) {
    await this.checkSuperuserAccess(actorId);

    const role = await this.findOne(id);

    // 系统角色的 name 和 level 不可修改
    if (role.isSystem) {
      if (dto.name && dto.name !== role.name) {
        throw new ForbiddenException({
          code: 'SYSTEM_ROLE_PROTECTED',
          message: 'Cannot change name of system role',
        });
      }
      if (dto.level && dto.level !== role.level) {
        throw new ForbiddenException({
          code: 'SYSTEM_ROLE_PROTECTED',
          message: 'Cannot change level of system role',
        });
      }
    }

    // 检查 level 冲突
    if (dto.level && dto.level !== role.level) {
      const conflicting = await this.prisma.role.findFirst({
        where: { level: dto.level, id: { not: id } },
      });
      if (conflicting) {
        throw new ConflictException({
          code: 'ROLE_LEVEL_CONFLICT',
          message: 'Role level already exists',
        });
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.level && { level: dto.level }),
        ...(dto.name && { name: dto.name }),
      },
    });
  }

  /**
   * 删除职能
   * 仅 superuser，系统角色不可删除
   */
  async delete(id: string, actorId: string) {
    await this.checkSuperuserAccess(actorId);

    const role = await this.findOne(id);

    if (role.isSystem) {
      throw new ForbiddenException({
        code: 'SYSTEM_ROLE_PROTECTED',
        message: 'Cannot delete system role',
      });
    }

    // 检查是否有用户使用此角色
    const usersWithRole = await this.prisma.user.count({
      where: {
        roles: { has: role.name },
      },
    });

    if (usersWithRole > 0) {
      throw new BadRequestException({
        code: 'ROLE_IN_USE',
        message: `Cannot delete role, ${usersWithRole} users are using it`,
        usersCount: usersWithRole,
      });
    }

    return this.prisma.role.delete({
      where: { id },
    });
  }

  // ================================
  // 权限边界管理
  // ================================

  /**
   * 获取某个角色的权限边界
   */
  async getBoundaries(roleId: string) {
    await this.findOne(roleId);

    return this.prisma.rolePermissionBoundary.findMany({
      where: { roleId },
      orderBy: { permissionKey: 'asc' },
    });
  }

  /**
   * 设置角色的权限边界
   * 批量更新
   * 🔒 边界变更后强制登出该角色的所有用户
   */
  async setBoundaries(roleId: string, boundaries: BoundaryDto[], actorId: string) {
    await this.checkSuperuserAccess(actorId);
    const role = await this.findOne(roleId);

    // 使用事务批量更新
    const result = await this.prisma.$transaction(async (tx: typeof this.prisma) => {
      // 删除现有边界
      await tx.rolePermissionBoundary.deleteMany({
        where: { roleId },
      });

      // 创建新边界
      if (boundaries.length > 0) {
        await tx.rolePermissionBoundary.createMany({
          data: boundaries.map((b) => ({
            roleId,
            permissionKey: b.permissionKey,
            boundaryType: b.boundaryType,
            description: b.description,
          })),
        });
      }

      return tx.rolePermissionBoundary.findMany({
        where: { roleId },
      });
    });

    // 🔄 清除该角色所有用户的权限缓存 → 即时生效（无需重新登录）
    const affectedUsers = await this.invalidatePermissionsByRole(role.name);
    this.logger.log(`Role ${role.name} boundaries updated, ${affectedUsers} users cache invalidated (instant effect)`);

    return result;
  }

  /**
   * 添加单个权限边界
   */
  async addBoundary(roleId: string, dto: BoundaryDto, actorId: string) {
    await this.checkSuperuserAccess(actorId);
    await this.findOne(roleId);

    // 检查是否已存在
    const existing = await this.prisma.rolePermissionBoundary.findFirst({
      where: { roleId, permissionKey: dto.permissionKey },
    });

    if (existing) {
      // 更新
      return this.prisma.rolePermissionBoundary.update({
        where: { id: existing.id },
        data: {
          boundaryType: dto.boundaryType,
          description: dto.description,
        },
      });
    }

    return this.prisma.rolePermissionBoundary.create({
      data: {
        roleId,
        permissionKey: dto.permissionKey,
        boundaryType: dto.boundaryType,
        description: dto.description,
      },
    });
  }

  /**
   * 删除权限边界
   */
  async removeBoundary(roleId: string, permissionKey: string, actorId: string) {
    await this.checkSuperuserAccess(actorId);

    const boundary = await this.prisma.rolePermissionBoundary.findFirst({
      where: { roleId, permissionKey },
    });

    if (!boundary) {
      throw new NotFoundException({
        code: 'BOUNDARY_NOT_FOUND',
        message: 'Permission boundary not found',
      });
    }

    return this.prisma.rolePermissionBoundary.delete({
      where: { id: boundary.id },
    });
  }

  // ================================
  // 辅助方法
  // ================================

  /**
   * 获取角色的有效权限边界（包括继承）
   * 数值越小权限越高，所以 gte 获取同级或比自己权限低的角色边界
   */
  async getEffectiveBoundaries(roleName: string): Promise<Set<string>> {
    const role = await this.findByName(roleName);
    if (!role) {
      return new Set();
    }

    // 获取此角色及所有更低权限级别角色的边界 (level >= role.level)
    const roles = await this.prisma.role.findMany({
      where: { level: { gte: role.level }, isActive: true },
      include: { boundaries: true },
      orderBy: { level: 'asc' },
    });

    const allowedPerms = new Set<string>();
    const deniedPerms = new Set<string>();

    for (const r of roles) {
      for (const b of r.boundaries) {
        if (b.boundaryType === 'ALLOWED') {
          allowedPerms.add(b.permissionKey);
        } else if (b.boundaryType === 'DENIED') {
          deniedPerms.add(b.permissionKey);
        }
      }
    }

    // DENIED 优先级高于 ALLOWED
    for (const denied of deniedPerms) {
      allowedPerms.delete(denied);
    }

    return allowedPerms;
  }

  /**
   * 验证用户是否为 superuser
   */
  private async checkSuperuserAccess(actorId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { roles: true },
    });

    if (!actor?.roles.includes('superuser')) {
      throw new ForbiddenException({
        code: 'SUPERUSER_REQUIRED',
        message: 'Only superuser can manage roles',
      });
    }
  }

  /**
   * 初始化系统角色（用于数据库迁移/Seed）
   */
  async seedSystemRoles() {
    // L0=超管(不显示), L1=管理员, L2=员工, L3=编辑
    const systemRoles = [
      { name: 'superuser', displayName: '超级管理员', level: 0, color: '#EF4444', isSystem: true },
      { name: 'admin', displayName: '管理员', level: 1, color: '#F59E0B', isSystem: false },
      { name: 'staff', displayName: '员工', level: 2, color: '#34D399', isSystem: false },
      { name: 'editor', displayName: '编辑', level: 3, color: '#60A5FA', isSystem: false },
    ];

    for (const role of systemRoles) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: { displayName: role.displayName, color: role.color },
        create: role,
      });
    }

    return { seeded: systemRoles.length };
  }

  /**
   * 🔒 强制登出某个角色的所有用户
   * 用于职能边界变更后影响所有相关用户
   */
  private async forceLogoutUsersByRole(roleName: string): Promise<number> {
    // 1. 查找所有包含该角色的用户
    const users = await this.prisma.user.findMany({
      where: {
        roles: { has: roleName },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    // 2. 批量撤销 refresh tokens
    if (users.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: { in: users.map((u: { id: string }) => u.id) },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      // 3. 清除 Redis 权限缓存
      for (const user of users) {
        await this.cacheService.clearSession(user.id);
        await this.cacheService.invalidateUserPermissions(user.id);
      }
    }

    return users.length;
  }

  /**
   * 🔄 仅清除某个角色所有用户的权限缓存
   * 不会强制登出，但权限变更会在下次请求时即时生效
   */
  private async invalidatePermissionsByRole(roleName: string): Promise<number> {
    // 查找所有包含该角色的用户
    const users = await this.prisma.user.findMany({
      where: {
        roles: { has: roleName },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    // 批量清除 Redis 权限缓存
    for (const user of users) {
      await this.cacheService.invalidateUserPermissions(user.id);
    }

    return users.length;
  }
}

// ================================
// DTOs
// ================================

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
  boundaryType: 'ALLOWED' | 'DENIED' | 'INHERITED';
  description?: string;
}
