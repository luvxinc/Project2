import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

/**
 * 🔒 缓存服务
 * 
 * 提供统一的缓存操作接口，封装 Redis 操作细节。
 * 所有业务模块通过此服务访问缓存，确保命名空间和 TTL 策略一致。
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private isConnected = false;

  // ===========================
  // 命名空间常量
  // ===========================
  private readonly NAMESPACES = {
    SESSION: 'sess:',           // sess:{userId} → session data
    REFRESH_TOKEN: 'rt:',       // rt:{token} → userId
    USER_PERMISSIONS: 'perm:',  // perm:{userId} → permissions JSON
    ROLE_BOUNDARIES: 'role:',   // role:{roleId} → boundaries JSON
    SKU_INFO: 'sku:',           // sku:{sku} → product info
    FIFO_SUMMARY: 'fifo:',      // fifo:{sku} → { qty, avgCost }
    RATE_LIMIT: 'rl:',          // rl:{ip}:{action} → counter
    LOCK: 'lock:',              // lock:{resource} → holder
    JOB_STATUS: 'job:',         // job:{jobId} → { status, progress }
    // 🔒 安全防护命名空间
    LOGIN_FAIL: 'login_fail:',       // login_fail:{username} → 失败次数
    ACCOUNT_LOCK: 'account_lock:',   // account_lock:{username} → 锁定标记
    IP_BLACKLIST: 'ip_blacklist:',   // ip_blacklist:{ip} → 封禁标记
    IP_ATTACK: 'ip_attack:',         // ip_attack:{ip} → 攻击计数
    SECURITY_FAIL: 'sec_fail:',      // sec_fail:{userId}:{level} → 安全码验证失败次数
  };

  // ===========================
  // TTL 常量 (秒)
  // ===========================
  private readonly TTL = {
    SESSION: 6 * 60 * 60,       // 6小时
    REFRESH_TOKEN: 7 * 24 * 60 * 60, // 7天
    PERMISSIONS: 5 * 60,        // 5分钟
    ROLE_BOUNDARIES: 15 * 60,   // 15分钟
    SKU_INFO: 60 * 60,          // 1小时
    FIFO_SUMMARY: 5 * 60,       // 5分钟
    RATE_LIMIT: 60,             // 1分钟
    LOCK: 30,                   // 30秒
    JOB_STATUS: 60 * 60,        // 1小时
    // 🔒 安全防护 TTL
    LOGIN_FAIL: 15 * 60,        // 15分钟窗口
    ACCOUNT_LOCK: 15 * 60,      // 锁定15分钟
    IP_BLACKLIST: 60 * 60,      // 封禁1小时
    IP_ATTACK: 60 * 60,         // 攻击计数窗口1小时
    SECURITY_FAIL: 30 * 60,     // 安全码失败窗口30分钟
  };

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // ioredis 默认自动连接，不需要手动调用 connect()
    // 监听连接事件来更新状态
    this.redis.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis connection ready');
    });
    
    this.redis.on('error', () => {
      this.isConnected = false;
    });
    
    this.redis.on('close', () => {
      this.isConnected = false;
    });
    
    // 检查初始状态
    if (this.redis.status === 'ready') {
      this.isConnected = true;
    }
  }

  /**
   * 检查 Redis 是否可用，如果不可用则优雅降级
   */
  private checkConnection(): boolean {
    // 动态检查 Redis 连接状态
    if (this.redis.status !== 'ready') {
      return false;
    }
    return true;
  }

  // ===========================
  // 基础操作
  // ===========================

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.checkConnection()) return null;
    
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      this.logger.error(`Failed to get key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.checkConnection()) return;
    
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Failed to set key ${key}: ${error}`);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    if (!this.checkConnection()) return;
    
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key}: ${error}`);
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    if (!this.checkConnection()) return false;
    
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check existence of key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * 按模式删除多个键
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.checkConnection()) return 0;
    
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.redis.del(...keys);
    } catch (error) {
      this.logger.error(`Failed to delete keys by pattern ${pattern}: ${error}`);
      return 0;
    }
  }

  // ===========================
  // 权限缓存专用方法
  // ===========================

  /**
   * 缓存用户权限
   */
  async setUserPermissions(userId: string, permissions: string[]): Promise<void> {
    const key = `${this.NAMESPACES.USER_PERMISSIONS}${userId}`;
    await this.set(key, permissions, this.TTL.PERMISSIONS);
  }

  /**
   * 获取用户权限缓存
   */
  async getUserPermissions(userId: string): Promise<string[] | null> {
    const key = `${this.NAMESPACES.USER_PERMISSIONS}${userId}`;
    return await this.get<string[]>(key);
  }

  /**
   * 清除用户权限缓存（权限变更时调用）
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    const key = `${this.NAMESPACES.USER_PERMISSIONS}${userId}`;
    await this.del(key);
  }

  /**
   * 清除所有用户权限缓存（角色边界变更时调用）
   */
  async invalidateAllUserPermissions(): Promise<number> {
    return await this.delByPattern(`${this.NAMESPACES.USER_PERMISSIONS}*`);
  }

  // ===========================
  // 角色边界缓存专用方法
  // ===========================

  /**
   * 缓存角色权限边界
   */
  async setRoleBoundaries(roleId: string, boundaries: object): Promise<void> {
    const key = `${this.NAMESPACES.ROLE_BOUNDARIES}${roleId}`;
    await this.set(key, boundaries, this.TTL.ROLE_BOUNDARIES);
  }

  /**
   * 获取角色权限边界缓存
   */
  async getRoleBoundaries(roleId: string): Promise<object | null> {
    const key = `${this.NAMESPACES.ROLE_BOUNDARIES}${roleId}`;
    return await this.get<object>(key);
  }

  /**
   * 清除角色权限边界缓存
   */
  async invalidateRoleBoundaries(roleId: string): Promise<void> {
    const key = `${this.NAMESPACES.ROLE_BOUNDARIES}${roleId}`;
    await this.del(key);
  }

  // ===========================
  // Refresh Token 专用方法
  // ===========================

  /**
   * 存储 Refresh Token 映射
   */
  async setRefreshToken(token: string, userId: string): Promise<void> {
    const key = `${this.NAMESPACES.REFRESH_TOKEN}${token}`;
    await this.set(key, userId, this.TTL.REFRESH_TOKEN);
  }

  /**
   * 获取 Refresh Token 对应的用户ID
   */
  async getRefreshTokenUserId(token: string): Promise<string | null> {
    const key = `${this.NAMESPACES.REFRESH_TOKEN}${token}`;
    return await this.get<string>(key);
  }

  /**
   * 撤销 Refresh Token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    const key = `${this.NAMESPACES.REFRESH_TOKEN}${token}`;
    await this.del(key);
  }

  // ===========================
  // 会话管理
  // ===========================

  /**
   * 设置用户会话
   */
  async setSession(userId: string, sessionData: object): Promise<void> {
    const key = `${this.NAMESPACES.SESSION}${userId}`;
    await this.set(key, sessionData, this.TTL.SESSION);
  }

  /**
   * 获取用户会话
   */
  async getSession(userId: string): Promise<object | null> {
    const key = `${this.NAMESPACES.SESSION}${userId}`;
    return await this.get<object>(key);
  }

  /**
   * 清除用户会话
   */
  async clearSession(userId: string): Promise<void> {
    const key = `${this.NAMESPACES.SESSION}${userId}`;
    await this.del(key);
  }

  // ===========================
  // 限流器
  // ===========================

  /**
   * 增加限流计数器
   * @returns 当前计数值
   */
  async incrementRateLimit(ip: string, action: string): Promise<number> {
    if (!this.checkConnection()) return 0;
    
    try {
      const key = `${this.NAMESPACES.RATE_LIMIT}${ip}:${action}`;
      const count = await this.redis.incr(key);
      if (count === 1) {
        // 首次设置 TTL
        await this.redis.expire(key, this.TTL.RATE_LIMIT);
      }
      return count;
    } catch (error) {
      this.logger.error(`Failed to increment rate limit: ${error}`);
      return 0;
    }
  }

  /**
   * 获取当前限流计数
   */
  async getRateLimitCount(ip: string, action: string): Promise<number> {
    if (!this.checkConnection()) return 0;
    
    try {
      const key = `${this.NAMESPACES.RATE_LIMIT}${ip}:${action}`;
      const value = await this.redis.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      this.logger.error(`Failed to get rate limit count: ${error}`);
      return 0;
    }
  }

  // ===========================
  // 分布式锁
  // ===========================

  /**
   * 获取分布式锁
   * @returns 是否成功获取锁
   */
  async acquireLock(resource: string, holder: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.checkConnection()) return true; // 降级模式下直接放行
    
    try {
      const key = `${this.NAMESPACES.LOCK}${resource}`;
      const ttl = ttlSeconds || this.TTL.LOCK;
      // SETNX with TTL
      const result = await this.redis.set(key, holder, 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire lock: ${error}`);
      return true; // 降级模式下直接放行
    }
  }

  /**
   * 释放分布式锁
   * @returns 是否成功释放（只有持有者才能释放）
   */
  async releaseLock(resource: string, holder: string): Promise<boolean> {
    if (!this.checkConnection()) return true;
    
    try {
      const key = `${this.NAMESPACES.LOCK}${resource}`;
      const currentHolder = await this.redis.get(key);
      if (currentHolder === holder) {
        await this.redis.del(key);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to release lock: ${error}`);
      return false;
    }
  }

  // ===========================
  // 🔒 账户锁定 (防暴力破解)
  // ===========================

  private readonly MAX_LOGIN_ATTEMPTS = 5;

  /**
   * 记录登录失败
   * @returns { remainingAttempts, locked }
   */
  async recordLoginFailure(username: string): Promise<{ remainingAttempts: number; locked: boolean }> {
    if (!this.checkConnection()) {
      return { remainingAttempts: this.MAX_LOGIN_ATTEMPTS, locked: false };
    }

    try {
      const failKey = `${this.NAMESPACES.LOGIN_FAIL}${username}`;
      const lockKey = `${this.NAMESPACES.ACCOUNT_LOCK}${username}`;

      // 检查是否已锁定
      const isLocked = await this.redis.get(lockKey);
      if (isLocked) {
        return { remainingAttempts: 0, locked: true };
      }

      // 增加失败计数
      const failures = await this.redis.incr(failKey);

      // 首次失败设置过期时间
      if (failures === 1) {
        await this.redis.expire(failKey, this.TTL.LOGIN_FAIL);
      }

      // 达到阈值则锁定
      if (failures >= this.MAX_LOGIN_ATTEMPTS) {
        await this.redis.set(lockKey, '1', 'EX', this.TTL.ACCOUNT_LOCK);
        this.logger.warn(`🔒 Account locked: ${username} (${this.MAX_LOGIN_ATTEMPTS} failed attempts)`);
        return { remainingAttempts: 0, locked: true };
      }

      return {
        remainingAttempts: this.MAX_LOGIN_ATTEMPTS - failures,
        locked: false,
      };
    } catch (error) {
      this.logger.error(`Failed to record login failure: ${error}`);
      return { remainingAttempts: this.MAX_LOGIN_ATTEMPTS, locked: false };
    }
  }

  /**
   * 检查账户是否锁定
   */
  async isAccountLocked(username: string): Promise<boolean> {
    if (!this.checkConnection()) return false;

    try {
      const lockKey = `${this.NAMESPACES.ACCOUNT_LOCK}${username}`;
      const result = await this.redis.get(lockKey);
      return result === '1';
    } catch (error) {
      this.logger.error(`Failed to check account lock: ${error}`);
      return false;
    }
  }

  /**
   * 获取锁定剩余时间
   */
  async getAccountLockTTL(username: string): Promise<number> {
    if (!this.checkConnection()) return 0;

    try {
      const lockKey = `${this.NAMESPACES.ACCOUNT_LOCK}${username}`;
      const ttl = await this.redis.ttl(lockKey);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      this.logger.error(`Failed to get account lock TTL: ${error}`);
      return 0;
    }
  }

  /**
   * 登录成功后清除失败计数
   */
  async clearLoginFailures(username: string): Promise<void> {
    if (!this.checkConnection()) return;

    try {
      const failKey = `${this.NAMESPACES.LOGIN_FAIL}${username}`;
      await this.redis.del(failKey);
    } catch (error) {
      this.logger.error(`Failed to clear login failures: ${error}`);
    }
  }

  // ===========================
  // 🔒 IP 黑名单 (防恶意攻击)
  // ===========================

  private readonly MAX_ATTACKS = 10;

  /**
   * 记录可疑行为并检查是否需要封禁
   * @returns 是否已被封禁
   */
  async recordSuspiciousActivity(ip: string, reason?: string): Promise<boolean> {
    if (!this.checkConnection()) return false;

    try {
      const attackKey = `${this.NAMESPACES.IP_ATTACK}${ip}`;
      const blacklistKey = `${this.NAMESPACES.IP_BLACKLIST}${ip}`;

      // 检查是否已在黑名单
      const isBlacklisted = await this.redis.get(blacklistKey);
      if (isBlacklisted) {
        return true;
      }

      // 增加攻击计数
      const count = await this.redis.incr(attackKey);

      if (count === 1) {
        await this.redis.expire(attackKey, this.TTL.IP_ATTACK);
      }

      // 达到阈值则封禁
      if (count >= this.MAX_ATTACKS) {
        await this.redis.set(blacklistKey, reason || 'suspicious_activity', 'EX', this.TTL.IP_BLACKLIST);
        this.logger.warn(`🚫 IP blacklisted: ${ip} (reason: ${reason || 'max attacks'})`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to record suspicious activity: ${error}`);
      return false;
    }
  }

  /**
   * 检查 IP 是否在黑名单
   */
  async isIpBlacklisted(ip: string): Promise<boolean> {
    if (!this.checkConnection()) return false;

    try {
      const blacklistKey = `${this.NAMESPACES.IP_BLACKLIST}${ip}`;
      const result = await this.redis.get(blacklistKey);
      return !!result;
    } catch (error) {
      this.logger.error(`Failed to check IP blacklist: ${error}`);
      return false;
    }
  }

  /**
   * 获取 IP 黑名单剩余时间
   */
  async getIpBlacklistTTL(ip: string): Promise<number> {
    if (!this.checkConnection()) return 0;

    try {
      const blacklistKey = `${this.NAMESPACES.IP_BLACKLIST}${ip}`;
      const ttl = await this.redis.ttl(blacklistKey);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      this.logger.error(`Failed to get IP blacklist TTL: ${error}`);
      return 0;
    }
  }

  // ===========================
  // 🔒 安全码验证失败计数
  // ===========================

  private readonly MAX_SECURITY_ATTEMPTS = 3;

  /**
   * 记录安全码验证失败
   * @returns { remainingAttempts, blocked }
   */
  async recordSecurityFailure(userId: string, level: string): Promise<{ remainingAttempts: number; blocked: boolean }> {
    if (!this.checkConnection()) {
      return { remainingAttempts: this.MAX_SECURITY_ATTEMPTS, blocked: false };
    }

    try {
      const key = `${this.NAMESPACES.SECURITY_FAIL}${userId}:${level}`;
      const failures = await this.redis.incr(key);

      if (failures === 1) {
        await this.redis.expire(key, this.TTL.SECURITY_FAIL);
      }

      if (failures >= this.MAX_SECURITY_ATTEMPTS) {
        this.logger.warn(`🔒 Security code blocked: user ${userId}, level ${level}`);
        return { remainingAttempts: 0, blocked: true };
      }

      return {
        remainingAttempts: this.MAX_SECURITY_ATTEMPTS - failures,
        blocked: false,
      };
    } catch (error) {
      this.logger.error(`Failed to record security failure: ${error}`);
      return { remainingAttempts: this.MAX_SECURITY_ATTEMPTS, blocked: false };
    }
  }

  /**
   * 检查安全码是否被阻止
   */
  async isSecurityBlocked(userId: string, level: string): Promise<boolean> {
    if (!this.checkConnection()) return false;

    try {
      const key = `${this.NAMESPACES.SECURITY_FAIL}${userId}:${level}`;
      const value = await this.redis.get(key);
      return value ? parseInt(value, 10) >= this.MAX_SECURITY_ATTEMPTS : false;
    } catch (error) {
      this.logger.error(`Failed to check security block: ${error}`);
      return false;
    }
  }

  /**
   * 安全码验证成功后清除失败计数
   */
  async clearSecurityFailures(userId: string, level: string): Promise<void> {
    if (!this.checkConnection()) return;

    try {
      const key = `${this.NAMESPACES.SECURITY_FAIL}${userId}:${level}`;
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to clear security failures: ${error}`);
    }
  }

  // ===========================
  // 健康检查
  // ===========================

  /**
   * 检查 Redis 连接是否正常
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // ===========================
  // 生命周期
  // ===========================

  async onModuleDestroy() {
    try {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    } catch (error) {
      this.logger.error(`Error closing Redis connection: ${error}`);
    }
  }
}
