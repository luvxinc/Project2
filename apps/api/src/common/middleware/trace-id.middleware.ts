import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      traceId: string;
      requestStartTime: number;
    }
  }
}

/**
 * TraceId 中间件 - 为每个请求生成唯一追踪ID
 * 
 * 用途：
 * - 分布式追踪：同一请求的所有日志共享 traceId
 * - 错误关联：可以通过 traceId 查找相关的 Access, Audit, Business, Error 日志
 * - 性能分析：结合 requestStartTime 计算响应时间
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 优先使用客户端传入的 traceId (用于跨服务追踪)
    const existingTraceId = req.headers['x-trace-id'] as string;
    
    // 生成或使用现有 traceId
    const traceId = existingTraceId || this.generateTraceId();
    
    // 附加到请求对象
    req.traceId = traceId;
    req.requestStartTime = Date.now();
    
    // 设置响应头，方便客户端关联
    res.setHeader('X-Trace-Id', traceId);
    
    next();
  }
  
  private generateTraceId(): string {
    // 格式: trace-{timestamp}-{random}
    return `trace-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }
}

/**
 * 从请求中提取 TraceId（供其他模块使用）
 */
export function getTraceId(req: Request): string {
  return req.traceId || 'unknown';
}

/**
 * 从请求中获取请求开始时间
 */
export function getRequestStartTime(req: Request): number {
  return req.requestStartTime || Date.now();
}
