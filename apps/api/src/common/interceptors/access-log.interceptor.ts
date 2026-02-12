import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LogWriterService, RequestContext } from '../logging';

/**
 * Access Log 拦截器 - 记录所有 HTTP 请求访问日志
 * 
 * 记录内容：
 * - 请求方法、路径、查询参数
 * - 响应状态码、响应时间、响应大小
 * - 用户信息、IP地址、User-Agent
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessLogInterceptor.name);
  
  // 不记录日志的路径 (健康检查等)
  private readonly EXCLUDED_PATHS = [
    '/health',
    '/healthz',
    '/ready',
    '/metrics',
    '/favicon.ico',
  ];

  constructor(private readonly logWriter: LogWriterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    
    // 跳过排除的路径
    if (this.shouldSkip(request.path)) {
      return next.handle();
    }
    
    const startTime = request.requestStartTime || Date.now();
    
    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logAccess(request, response, startTime, data);
        },
        error: () => {
          // 错误由 AllExceptionsFilter 处理，这里只记录访问
          this.logAccess(request, response, startTime, null);
        },
      }),
    );
  }
  
  private shouldSkip(path: string): boolean {
    return this.EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
  }
  
  private async logAccess(
    request: Request,
    response: Response,
    startTime: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _responseData: unknown,
  ) {
    const responseTime = Date.now() - startTime;
    const user = (request as { user?: { id?: string; username?: string } }).user;
    
    const context: RequestContext = {
      traceId: request.traceId || 'unknown',
      method: request.method,
      path: request.path,
      queryString: request.url.split('?')[1],
      userId: user?.id,
      username: user?.username,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
    };
    
    try {
      await this.logWriter.logAccess({
        context,
        statusCode: response.statusCode,
        responseTime,
        // responseSize 可通过 response 事件获取，这里简化处理
      });
    } catch (error) {
      this.logger.warn(`Failed to write access log: ${error.message}`);
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
