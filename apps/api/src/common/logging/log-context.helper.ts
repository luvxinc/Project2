import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { LogWriterService, RequestContext } from './log-writer.service';

/**
 * 请求上下文日志助手 - 在 Service 层方便地记录日志
 * 
 * 用法：
 * 1. 在 Service 中注入 LogContextHelper
 * 2. 调用 logAudit / logBusiness / logError 方法
 * 
 * @example
 * ```typescript
 * @Injectable()
 * export class UsersService {
 *   constructor(private readonly logHelper: LogContextHelper) {}
 *   
 *   async deleteUser(id: string) {
 *     await this.logHelper.logAudit({
 *       module: 'users',
 *       action: 'DELETE_USER',
 *       entityType: 'User',
 *       entityId: id,
 *       riskLevel: 'CRITICAL',
 *     });
 *   }
 * }
 * ```
 */
@Injectable({ scope: Scope.REQUEST })
export class LogContextHelper {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly logWriter: LogWriterService,
  ) {}
  
  /**
   * 获取当前请求上下文
   */
  getContext(): RequestContext {
    const user = (this.request as { user?: { id?: string; username?: string; roles?: string[] } }).user;
    
    return {
      traceId: this.request.traceId || 'unknown',
      method: this.request.method,
      path: this.request.path,
      query: this.request.query as Record<string, unknown>,
      userId: user?.id,
      username: user?.username,
      userRoles: user?.roles,
      sessionId: this.request.cookies?.sessionId,
      ipAddress: this.getClientIP(),
      userAgent: this.request.headers['user-agent'],
    };
  }
  
  /**
   * 记录审计日志
   */
  async logAudit(params: {
    module: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    details?: unknown;
    result?: 'SUCCESS' | 'DENIED' | 'FAILED';
    riskLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }) {
    return this.logWriter.logAudit({
      context: this.getContext(),
      ...params,
    });
  }
  
  /**
   * 记录业务日志
   */
  async logBusiness(params: {
    module: string;
    action: string;
    summary?: string;
    details?: unknown;
    entityType?: string;
    entityId?: string;
    status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  }) {
    return this.logWriter.logBusiness({
      context: this.getContext(),
      ...params,
    });
  }
  
  /**
   * 记录错误日志
   */
  async logError(params: {
    error: Error;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category?: 'DATABASE' | 'NETWORK' | 'VALIDATION' | 'AUTH' | 'BUSINESS' | 'EXTERNAL_API' | 'SYSTEM' | 'UNKNOWN';
    businessContext?: Record<string, unknown>;
  }) {
    const context = this.getContext();
    return this.logWriter.logError({
      error: params.error,
      context,
      severity: params.severity,
      category: params.category,
      businessContext: params.businessContext,
    });
  }
  
  private getClientIP(): string {
    const forwarded = this.request.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return this.request.ip || this.request.socket?.remoteAddress || 'unknown';
  }
}

// ================================
// Static Helpers (无请求上下文时使用)
// ================================

/**
 * 创建手动上下文 - 用于后台任务、定时任务等没有 HTTP 请求的场景
 */
export function createManualContext(params: {
  traceId?: string;
  userId?: string;
  username?: string;
  module?: string;
  operation?: string;
}): RequestContext {
  return {
    traceId: params.traceId || `manual-${Date.now()}`,
    method: 'INTERNAL',
    path: '/internal',
    userId: params.userId,
    username: params.username || 'system',
    module: params.module,
    operation: params.operation,
  };
}

/**
 * 安全执行 - 包装函数，自动捕获并记录错误
 * 
 * @example
 * ```typescript
 * const result = await safeExecute(
 *   async () => await riskyOperation(),
 *   logWriter,
 *   createManualContext({ username: 'scheduler', operation: 'sync_data' })
 * );
 * ```
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  logWriter: LogWriterService,
  context: RequestContext,
  options?: {
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    rethrow?: boolean;
  },
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    await logWriter.logError({
      error: error instanceof Error ? error : new Error(String(error)),
      context,
      severity: options?.severity || 'HIGH',
    });
    
    if (options?.rethrow) {
      throw error;
    }
    return null;
  }
}
