import { SetMetadata, applyDecorators, UseInterceptors } from '@nestjs/common';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { LogWriterService, RequestContext } from '../logging';

// ================================
// Metadata Keys
// ================================

export const AUDIT_LOG_KEY = 'audit_log';
export const BUSINESS_LOG_KEY = 'business_log';

// ================================
// Audit Log Decorator & Interceptor
// ================================

export interface AuditLogOptions {
  module: string;
  action: string;
  entityType?: string;
  // 如果为 true, 会从请求 body 中提取 entityId
  extractEntityId?: boolean;
  // 风险等级 (可选，否则自动判定)
  riskLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  // 是否记录请求体作为 newValue
  logRequestBody?: boolean;
}

/**
 * 审计日志装饰器
 * 
 * @example
 * ```typescript
 * @Post()
 * @AuditLog({ module: 'users', action: 'CREATE_USER', entityType: 'User', extractEntityId: true })
 * async createUser(@Body() dto: CreateUserDto) { ... }
 * ```
 */
export function AuditLog(options: AuditLogOptions) {
  return applyDecorators(
    SetMetadata(AUDIT_LOG_KEY, options),
    UseInterceptors(AuditLogInterceptor),
  );
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly logWriter: LogWriterService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );
    
    if (!options) {
      return next.handle();
    }
    
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as { user?: { id?: string; username?: string; roles?: string[] } }).user;
    
    const requestContext: RequestContext = {
      traceId: request.traceId || 'unknown',
      method: request.method,
      path: request.path,
      userId: user?.id,
      username: user?.username,
      userRoles: user?.roles,
      sessionId: request.cookies?.sessionId,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
    };
    
    // 提取 entityId
    const entityId = options.extractEntityId
      ? (request.params?.id || request.body?.id)
      : undefined;
    
    return next.handle().pipe(
      tap({
        next: (result) => {
          this.writeAuditLog(options, requestContext, entityId, 'SUCCESS', result);
        },
        error: (err) => {
          this.writeAuditLog(options, requestContext, entityId, 'FAILED', null, err);
        },
      }),
    );
  }
  
  private async writeAuditLog(
    options: AuditLogOptions,
    context: RequestContext,
    entityId: string | undefined,
    result: 'SUCCESS' | 'FAILED' | 'DENIED',
    responseData?: unknown,
    error?: Error,
  ) {
    try {
      await this.logWriter.logAudit({
        context,
        module: options.module,
        action: options.action,
        entityType: options.entityType,
        entityId,
        newValue: responseData,
        details: error ? { errorMessage: error.message } : undefined,
        result,
        riskLevel: options.riskLevel,
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log: ${err.message}`);
    }
  }
  
  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}

// ================================
// Business Log Decorator & Interceptor
// ================================

export interface BusinessLogOptions {
  module: string;
  action: string;
  // 操作摘要模板, 支持 {username}, {entityId} 等占位符
  summaryTemplate?: string;
  entityType?: string;
  extractEntityId?: boolean;
}

/**
 * 业务日志装饰器
 * 
 * @example
 * ```typescript
 * @Post('upload')
 * @BusinessLog({ module: 'sales', action: 'UPLOAD_TRANSACTIONS', summaryTemplate: '{username} 上传了交易数据' })
 * async uploadTransactions(@Body() dto: UploadDto) { ... }
 * ```
 */
export function BusinessLog(options: BusinessLogOptions) {
  return applyDecorators(
    SetMetadata(BUSINESS_LOG_KEY, options),
    UseInterceptors(BusinessLogInterceptor),
  );
}

@Injectable()
export class BusinessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BusinessLogInterceptor.name);

  constructor(
    private readonly logWriter: LogWriterService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<BusinessLogOptions>(
      BUSINESS_LOG_KEY,
      context.getHandler(),
    );
    
    if (!options) {
      return next.handle();
    }
    
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as { user?: { id?: string; username?: string } }).user;
    
    const requestContext: RequestContext = {
      traceId: request.traceId || 'unknown',
      method: request.method,
      path: request.path,
      userId: user?.id,
      username: user?.username,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
    };
    
    const entityId = options.extractEntityId
      ? (request.params?.id || request.body?.id)
      : undefined;
    
    return next.handle().pipe(
      tap({
        next: (result) => {
          this.writeBusinessLog(options, requestContext, entityId, 'SUCCESS', result);
        },
        error: () => {
          this.writeBusinessLog(options, requestContext, entityId, 'FAILED');
        },
      }),
    );
  }
  
  private async writeBusinessLog(
    options: BusinessLogOptions,
    context: RequestContext,
    entityId: string | undefined,
    status: 'SUCCESS' | 'FAILED' | 'PENDING',
    responseData?: unknown,
  ) {
    try {
      // 渲染摘要模板
      const summary = options.summaryTemplate
        ? this.renderTemplate(options.summaryTemplate, {
            username: context.username || 'Unknown',
            entityId: entityId || 'N/A',
          })
        : undefined;
      
      await this.logWriter.logBusiness({
        context,
        module: options.module,
        action: options.action,
        summary,
        details: responseData,
        entityType: options.entityType,
        entityId,
        status,
      });
    } catch (err) {
      this.logger.warn(`Failed to write business log: ${err.message}`);
    }
  }
  
  private renderTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
  
  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
