import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as os from 'os';

// ================================
// Types
// ================================

export interface RequestContext {
  traceId: string;
  method: string;
  path: string;
  query?: Record<string, unknown>;
  queryString?: string;
  body?: unknown;
  headers?: Record<string, unknown>;
  userId?: string;
  username?: string;
  userRoles?: string[];
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  module?: string;
  operation?: string;
  entityType?: string;
  entityId?: string;
}

type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ErrorCategory = 'DATABASE' | 'NETWORK' | 'VALIDATION' | 'AUTH' | 'BUSINESS' | 'EXTERNAL_API' | 'SYSTEM' | 'UNKNOWN';
type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILED';
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type LogStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

// Access Log Buffer Entry
interface AccessLogEntry {
  traceId?: string;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  method: string;
  path: string;
  queryParams?: string;
  statusCode: number;
  responseTime: number;
  responseSize?: number;
  devMode: boolean;
}

// ================================
// LogWriterService (Enterprise-Grade)
// ================================

@Injectable()
export class LogWriterService implements OnModuleDestroy {
  private readonly logger = new Logger(LogWriterService.name);
  
  // ========== 配置 ==========
  private readonly SENSITIVE_FIELDS = [
    'password', 'passwd', 'pwd',
    'token', 'authorization', 'secret', 
    'apiKey', 'api_key', 'accessToken', 'refreshToken',
    'creditCard', 'cardNumber', 'cvv',
    'ssn', 'socialSecurity',
  ];

  // ========== 批量写入缓冲区 (AccessLog) ==========
  private accessLogBuffer: AccessLogEntry[] = [];
  private readonly BATCH_SIZE = 100;           // 批量大小
  private readonly FLUSH_INTERVAL = 1000;      // 刷新间隔 (ms)
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private readonly prisma: PrismaService) {
    // 启动定时刷新
    this.startFlushTimer();
  }

  // ========== 生命周期 ==========
  async onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    // 确保所有缓冲日志写入
    await this.flushAccessLogs();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(async () => {
      if (this.accessLogBuffer.length > 0) {
        await this.flushAccessLogs();
      }
    }, this.FLUSH_INTERVAL);
  }

  // ============================================================
  // Error Log (Fire-and-Forget 异步模式)
  // ============================================================
  
  /**
   * 记录错误日志 - 异步非阻塞
   * 使用 Fire-and-Forget 模式，不等待写入完成
   */
  logError(params: {
    error: Error;
    context: RequestContext;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    businessContext?: Record<string, unknown>;
  }): void {
    // Fire-and-Forget: 不 await，让调用方立即返回
    this.writeErrorLog(params).catch(err => {
      this.logger.error('Failed to write error log (async)', err);
    });
  }

  /**
   * 记录错误日志 - 同步等待版本 (用于测试或特殊场景)
   */
  async logErrorSync(params: {
    error: Error;
    context: RequestContext;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    businessContext?: Record<string, unknown>;
  }) {
    return this.writeErrorLog(params);
  }

  private async writeErrorLog(params: {
    error: Error;
    context: RequestContext;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    businessContext?: Record<string, unknown>;
  }) {
    const { error, context, severity, category, businessContext } = params;
    
    try {
      // 生成错误指纹 (用于聚合)
      const errorHash = this.generateErrorHash(error);
      
      // 检查是否已存在相同错误 (聚合)
      const existing = await this.prisma.errorLog.findFirst({
        where: { errorHash, isResolved: false },
        orderBy: { createdAt: 'desc' },
      });
      
      if (existing) {
        // 更新现有错误的出现次数
        return await this.prisma.errorLog.update({
          where: { id: existing.id },
          data: {
            occurrences: { increment: 1 },
            lastSeenAt: new Date(),
          },
        });
      }
      
      // 收集系统上下文
      const systemContext = this.collectSystemContext();
      
      // 创建新错误日志
      return await this.prisma.errorLog.create({
        data: {
          traceId: context.traceId,
          
          // 错误核心
          errorType: error.name || 'Error',
          errorCode: (error as { code?: string }).code || null,
          errorMessage: error.message,
          stackTrace: error.stack || null,
          rootCause: this.extractRootCause(error),
          
          // 请求上下文
          requestMethod: context.method,
          requestPath: context.path,
          requestQuery: context.query ? this.toJsonValue(this.sanitize(context.query)) : undefined,
          requestBody: context.body ? this.toJsonValue(this.sanitize(context.body)) : undefined,
          requestHeaders: context.headers ? this.toJsonValue(this.sanitizeHeaders(context.headers)) : undefined,
          
          // 用户上下文
          userId: context.userId,
          username: context.username,
          userRoles: context.userRoles || [],
          sessionId: context.sessionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          
          // 系统环境
          hostname: systemContext.hostname,
          appVersion: systemContext.appVersion,
          nodeEnv: systemContext.nodeEnv,
          systemContext: this.toJsonValue(systemContext.metrics),
          
          // 业务上下文
          module: context.module,
          operation: context.operation,
          entityType: context.entityType,
          entityId: context.entityId,
          businessContext: businessContext ? this.toJsonValue(this.sanitize(businessContext)) : undefined,
          
          // 诊断
          severity: severity || this.determineSeverity(error),
          category: category || this.determineCategory(error),
          errorHash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          
          // 环境
          devMode: process.env.NODE_ENV !== 'production',
        },
      });
    } catch (writeError) {
      this.logger.error('Failed to write error log', writeError);
      // 降级: 输出到 stdout
      console.error('[LOG_WRITE_FAILED]', JSON.stringify({
        error: error.message,
        context: { traceId: context.traceId, path: context.path },
      }));
      return null;
    }
  }

  // ============================================================
  // Audit Log (Fire-and-Forget 异步模式)
  // ============================================================
  
  /**
   * 记录审计日志 - 异步非阻塞
   */
  logAudit(params: {
    context: RequestContext;
    module: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    details?: unknown;
    result?: AuditResult;
    riskLevel?: RiskLevel;
  }): void {
    this.writeAuditLog(params).catch(err => {
      this.logger.error('Failed to write audit log (async)', err);
    });
  }

  /**
   * 记录审计日志 - 同步等待版本
   */
  async logAuditSync(params: {
    context: RequestContext;
    module: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    details?: unknown;
    result?: AuditResult;
    riskLevel?: RiskLevel;
  }) {
    return this.writeAuditLog(params);
  }

  private async writeAuditLog(params: {
    context: RequestContext;
    module: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    details?: unknown;
    result?: AuditResult;
    riskLevel?: RiskLevel;
  }) {
    const { context, module, action, entityType, entityId, oldValue, newValue, details, result, riskLevel } = params;
    
    try {
      return await this.prisma.auditLog.create({
        data: {
          traceId: context.traceId,
          userId: context.userId,
          username: context.username,
          sessionId: context.sessionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          module,
          action,
          entityType,
          entityId,
          oldValue: oldValue ? this.toJsonValue(this.sanitize(oldValue)) : undefined,
          newValue: newValue ? this.toJsonValue(this.sanitize(newValue)) : undefined,
          details: details ? this.toJsonValue(this.sanitize(details)) : undefined,
          result: result || 'SUCCESS',
          riskLevel: riskLevel || this.determineRiskLevel(action),
        },
      });
    } catch (writeError) {
      this.logger.error('Failed to write audit log', writeError);
      return null;
    }
  }

  // ============================================================
  // Business Log (Fire-and-Forget 异步模式)
  // ============================================================
  
  /**
   * 记录业务日志 - 异步非阻塞
   */
  logBusiness(params: {
    context: RequestContext;
    module: string;
    action: string;
    summary?: string;
    details?: unknown;
    entityType?: string;
    entityId?: string;
    status?: LogStatus;
  }): void {
    this.writeBusinessLog(params).catch(err => {
      this.logger.error('Failed to write business log (async)', err);
    });
  }

  /**
   * 记录业务日志 - 同步等待版本
   */
  async logBusinessSync(params: {
    context: RequestContext;
    module: string;
    action: string;
    summary?: string;
    details?: unknown;
    entityType?: string;
    entityId?: string;
    status?: LogStatus;
  }) {
    return this.writeBusinessLog(params);
  }

  private async writeBusinessLog(params: {
    context: RequestContext;
    module: string;
    action: string;
    summary?: string;
    details?: unknown;
    entityType?: string;
    entityId?: string;
    status?: LogStatus;
  }) {
    const { context, module, action, summary, details, entityType, entityId, status } = params;
    
    try {
      return await this.prisma.businessLog.create({
        data: {
          traceId: context.traceId,
          userId: context.userId,
          username: context.username,
          ipAddress: context.ipAddress,
          module,
          action,
          summary,
          details: details ? this.toJsonValue(this.sanitize(details)) : undefined,
          entityType,
          entityId,
          status: status || 'SUCCESS',
          devMode: process.env.NODE_ENV !== 'production',
        },
      });
    } catch (writeError) {
      this.logger.error('Failed to write business log', writeError);
      return null;
    }
  }

  // ============================================================
  // Access Log (批量写入模式)
  // ============================================================
  
  /**
   * 记录访问日志 - 缓冲批量写入
   * 日志会先进入内存缓冲区，达到 BATCH_SIZE 或 FLUSH_INTERVAL 后批量写入
   */
  logAccess(params: {
    context: RequestContext;
    statusCode: number;
    responseTime: number;
    responseSize?: number;
  }): void {
    const { context, statusCode, responseTime, responseSize } = params;
    
    // 添加到缓冲区
    this.accessLogBuffer.push({
      traceId: context.traceId,
      userId: context.userId,
      username: context.username,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      method: context.method,
      path: context.path,
      queryParams: context.queryString,
      statusCode,
      responseTime,
      responseSize,
      devMode: process.env.NODE_ENV !== 'production',
    });

    // 如果达到批量大小，立即刷新
    if (this.accessLogBuffer.length >= this.BATCH_SIZE) {
      this.flushAccessLogs().catch(err => {
        this.logger.error('Failed to flush access logs', err);
      });
    }
  }

  /**
   * 刷新访问日志缓冲区
   */
  private async flushAccessLogs(): Promise<void> {
    if (this.accessLogBuffer.length === 0) return;

    // 取出当前缓冲区的所有日志
    const logsToWrite = this.accessLogBuffer.splice(0, this.accessLogBuffer.length);
    
    try {
      await this.prisma.accessLog.createMany({
        data: logsToWrite,
        skipDuplicates: true,
      });
      
      if (!this.isShuttingDown) {
        this.logger.debug(`Flushed ${logsToWrite.length} access logs`);
      }
    } catch (writeError) {
      this.logger.error(`Failed to flush ${logsToWrite.length} access logs`, writeError);
      // 降级: 输出到 stdout
      console.error('[ACCESS_LOG_FLUSH_FAILED]', JSON.stringify({
        count: logsToWrite.length,
        error: (writeError as Error).message,
      }));
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================
  
  /**
   * 获取当前缓冲区状态 (用于监控)
   */
  getBufferStats() {
    return {
      accessLogBufferSize: this.accessLogBuffer.length,
      batchSize: this.BATCH_SIZE,
      flushInterval: this.FLUSH_INTERVAL,
    };
  }
  
  /**
   * 生成错误指纹 (用于聚合相同错误)
   */
  private generateErrorHash(error: Error): string {
    const content = `${error.name}:${error.message}:${this.extractErrorLocation(error.stack)}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }
  
  /**
   * 提取错误发生位置 (文件:行号)
   */
  private extractErrorLocation(stack?: string): string {
    if (!stack) return 'unknown';
    const lines = stack.split('\n');
    const firstStackLine = lines.find(line => line.includes('at ') && !line.includes('node_modules'));
    if (!firstStackLine) return 'unknown';
    const match = firstStackLine.match(/\((.+):(\d+):(\d+)\)/);
    return match ? `${match[1]}:${match[2]}` : 'unknown';
  }
  
  /**
   * 提取根因
   */
  private extractRootCause(error: Error): string | null {
    let cause = (error as { cause?: { cause?: unknown; message?: string } }).cause;
    while (cause && typeof cause === 'object' && 'cause' in cause) {
      cause = (cause as { cause?: { message?: string } }).cause as { cause?: unknown; message?: string } | undefined;
    }
    return cause?.message || null;
  }
  
  /**
   * 敏感数据脱敏
   */
  private sanitize(data: unknown): unknown {
    if (!data) return data;
    if (typeof data !== 'object') return data;
    
    const sanitized = Array.isArray(data) ? [...data] : { ...(data as Record<string, unknown>) };
    
    for (const key of Object.keys(sanitized as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const obj = sanitized as Record<string, unknown>;
      
      // 检查是否为敏感字段
      if (this.SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = this.sanitize(obj[key]);
      }
    }
    
    return sanitized;
  }
  
  /**
   * 脱敏 HTTP Headers
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const safeHeaders: Record<string, unknown> = {};
    const allowedHeaders = ['content-type', 'accept', 'user-agent', 'origin', 'referer', 'x-trace-id'];
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        safeHeaders[key] = value;
      } else if (lowerKey === 'authorization') {
        safeHeaders[key] = value ? '[BEARER TOKEN]' : null;
      }
    }
    
    return safeHeaders;
  }
  
  /**
   * 转换为 Prisma JsonValue 类型
   */
  private toJsonValue(data: unknown): Prisma.InputJsonValue | undefined {
    if (data === undefined || data === null) return undefined;
    return data as Prisma.InputJsonValue;
  }
  
  /**
   * 收集系统上下文
   */
  private collectSystemContext() {
    const memUsage = process.memoryUsage();
    
    return {
      hostname: os.hostname(),
      appVersion: process.env.APP_VERSION || '1.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      metrics: {
        memoryUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        memoryTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
      },
    };
  }
  
  /**
   * 自动判断错误严重度
   */
  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    if (message.includes('crash') || message.includes('fatal') || name.includes('fatal')) {
      return 'CRITICAL';
    }
    if (message.includes('database') || message.includes('connection') || name.includes('database')) {
      return 'HIGH';
    }
    if (name.includes('validation') || name.includes('badrequest')) {
      return 'LOW';
    }
    return 'MEDIUM';
  }
  
  /**
   * 自动判断错误分类
   */
  private determineCategory(error: Error): ErrorCategory {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    
    if (name.includes('prisma') || message.includes('database') || message.includes('sql')) {
      return 'DATABASE';
    }
    if (name.includes('validation') || name.includes('badrequest')) {
      return 'VALIDATION';
    }
    if (name.includes('unauthorized') || name.includes('forbidden')) {
      return 'AUTH';
    }
    if (name.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
      return 'NETWORK';
    }
    if (message.includes('api') || message.includes('external')) {
      return 'EXTERNAL_API';
    }
    return 'UNKNOWN';
  }
  
  /**
   * 判断操作风险等级
   */
  private determineRiskLevel(action: string): RiskLevel {
    const criticalActions = ['DELETE_USER', 'CLEAR_DATA', 'UPDATE_PERMISSIONS', 'GOD_MODE', 'RESET_PASSWORD'];
    const highActions = ['CREATE_USER', 'UPDATE_USER', 'CHANGE_ROLE', 'UPDATE_CONFIG', 'UPDATE_SECURITY'];
    const mediumActions = ['UPDATE', 'EDIT', 'MODIFY'];
    
    const upperAction = action.toUpperCase();
    
    if (criticalActions.some(a => upperAction.includes(a))) return 'CRITICAL';
    if (highActions.some(a => upperAction.includes(a))) return 'HIGH';
    if (mediumActions.some(a => upperAction.includes(a))) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * 生成 TraceId
   */
  static generateTraceId(): string {
    return `trace-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }
}
