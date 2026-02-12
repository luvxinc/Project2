import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LogWriterService, RequestContext } from '../logging';
import * as crypto from 'crypto';

/**
 * 全局异常过滤器 - 捕获所有未处理异常并记录完整上下文
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly logWriter: LogWriterService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 确定状态码
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 构建错误对象
    const error = exception instanceof Error ? exception : new Error(String(exception));

    // 提取用户信息
    const user = (request as { user?: { id?: string; username?: string; roles?: string[] } }).user;

    // 构建请求上下文
    const context: RequestContext = {
      traceId: (request.headers['x-trace-id'] as string) || this.generateTraceId(),
      method: request.method,
      path: request.path,
      query: request.query as Record<string, unknown>,
      queryString: request.url.split('?')[1],
      body: request.body,
      headers: request.headers as Record<string, unknown>,
      userId: user?.id,
      username: user?.username,
      userRoles: user?.roles,
      sessionId: request.cookies?.sessionId,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
      module: this.extractModule(request.path),
      operation: this.extractOperation(request.method, request.path),
    };

    // 确定错误严重度
    const severity = status >= 500 ? 'HIGH' : status >= 400 ? 'MEDIUM' : 'LOW';

    // 异步写入日志 (Fire-and-Forget, 不阻塞响应)
    this.logWriter.logError({
      error,
      context,
      severity: severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    });

    // 构建响应
    const errorResponse: Record<string, unknown> = {
      success: false,
      statusCode: status,
      message: this.getErrorMessage(exception),
      error: error.name,
      traceId: context.traceId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // 🔒 Phase 1 & 2: 提取安全相关字段 (支持前端 i18n)
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const securityFields = exceptionResponse as {
          errorCode?: string;
          remainingAttempts?: number;
          remainingSeconds?: number;
        };
        
        if (securityFields.errorCode) {
          errorResponse.errorCode = securityFields.errorCode;
        }
        if (typeof securityFields.remainingAttempts === 'number') {
          errorResponse.remainingAttempts = securityFields.remainingAttempts;
        }
        if (typeof securityFields.remainingSeconds === 'number') {
          errorResponse.remainingSeconds = securityFields.remainingSeconds;
        }
      }
    }

    // 🔒 仅在明确开启调试时才返回堆栈 (防止公网暴露文件路径)
    // 设置 EXPOSE_STACK=true 才会返回, 默认不返回
    if (process.env.EXPOSE_STACK === 'true') {
      (errorResponse as { stack?: string }).stack = error.stack;
    }

    response.status(status).json(errorResponse);
  }

  /**
   * 生成 TraceId
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 获取客户端 IP
   */
  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * 从路径提取模块名
   */
  private extractModule(path: string): string {
    // /api/users/123 -> users
    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'api' && segments[1]) {
      return segments[1];
    }
    return segments[0] || 'unknown';
  }

  /**
   * 从方法和路径提取操作名
   */
  private extractOperation(method: string, path: string): string {
    const module = this.extractModule(path);
    const methodMap: Record<string, string> = {
      GET: 'read',
      POST: 'create',
      PUT: 'update',
      PATCH: 'patch',
      DELETE: 'delete',
    };
    return `${methodMap[method] || method.toLowerCase()}_${module}`;
  }

  /**
   * 获取用户友好的错误消息
   */
  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && response !== null) {
        const msg = (response as { message?: string | string[] }).message;
        return Array.isArray(msg) ? msg.join(', ') : msg || exception.message;
      }
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }
}
