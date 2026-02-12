# MGMT ERP 日志系统 V2 - 企业级设计规范

> **版本**: 2.0.0  
> **创建日期**: 2026-02-05  
> **状态**: 待实施  
> **负责人**: Development Team

---

## 📋 目录

1. [系统概述](#1-系统概述)
2. [架构设计](#2-架构设计)
3. [数据模型](#3-数据模型)
4. [日志写入服务](#4-日志写入服务)
5. [全局异常捕获](#5-全局异常捕获)
6. [数据存储策略](#6-数据存储策略)
7. [归档与清理](#7-归档与清理)
8. [查询与过滤](#8-查询与过滤)
9. [前端展示](#9-前端展示)
10. [性能优化](#10-性能优化)
11. [高可用与容错](#11-高可用与容错)
12. [安全与合规](#12-安全与合规)
13. [监控与告警](#13-监控与告警)
14. [日志导出](#14-日志导出)
15. [实施计划](#15-实施计划)
16. [测试验证](#16-测试验证)

---

## 1. 系统概述

### 1.1 设计目标

**核心原则：一站式错误诊断**

工程师看一条错误日志就能获得 100% 所需信息，无需查询其他系统。

### 1.2 日志分类

| 日志类型 | 英文名 | 用途 | 保留策略 |
|---------|--------|------|---------|
| **错误日志** | ErrorLog | 系统异常、未处理错误、业务异常 | 生产 90 天，开发 7 天 |
| **审计日志** | AuditLog | 敏感操作、权限变更、安全事件 | 生产 365 天 (合规要求) |
| **业务日志** | BusinessLog | 业务操作追踪、数据变更 | 生产 90 天，开发 7 天 |
| **访问日志** | AccessLog | HTTP 请求记录、性能监控 | 生产 30 天，开发 3 天 |

### 1.3 核心特性

- ✅ **分布式追踪**: 通过 `traceId` 关联全链路日志
- ✅ **错误聚合**: 通过 `errorHash` 合并重复错误
- ✅ **敏感脱敏**: 自动脱敏密码、Token、身份证等
- ✅ **环境隔离**: `devMode` 区分开发/生产数据
- ✅ **自动归档**: 定时归档历史数据
- ✅ **智能告警**: 关键错误触发通知
- ✅ **异步写入**: 不阻塞业务请求
- ✅ **批量处理**: 高流量时批量入库
- ✅ **降级容错**: 日志服务故障不影响业务

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Controllers  │  │  Services    │  │  Guards      │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              RequestContext Middleware                    │    │
│  │   (生成 traceId, 提取用户信息, 收集请求上下文)             │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │ Logging     │   │ All-        │   │ Audit       │           │
│  │ Interceptor │   │ Exceptions  │   │ Interceptor │           │
│  │ (AccessLog) │   │ Filter      │   │ (AuditLog)  │           │
│  └──────┬──────┘   │ (ErrorLog)  │   └──────┬──────┘           │
│         │          └──────┬──────┘          │                   │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   LogWriterService                        │    │
│  │   (统一日志写入, 脱敏处理, 错误聚合, 异步批量写入)         │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     PostgreSQL                            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ErrorLogs │ │AuditLogs │ │Business- │ │Access-   │    │    │
│  │  │          │ │          │ │Logs      │ │Logs      │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 组件职责

| 组件 | 文件路径 | 职责 |
|------|---------|------|
| **RequestContextMiddleware** | `common/middleware/request-context.middleware.ts` | 生成 traceId, 提取用户/请求信息 |
| **LoggingInterceptor** | `common/interceptors/logging.interceptor.ts` | 记录 AccessLog, 计算响应时间 |
| **AllExceptionsFilter** | `common/filters/all-exceptions.filter.ts` | 捕获所有异常, 写入 ErrorLog |
| **AuditInterceptor** | `common/interceptors/audit.interceptor.ts` | 记录敏感操作 AuditLog |
| **LogWriterService** | `common/logging/log-writer.service.ts` | 统一日志写入, 脱敏, 聚合 |

---

## 3. 数据模型

### 3.1 ErrorLog (错误日志) - 完整结构

```prisma
model ErrorLog {
  id            String   @id @default(uuid())
  
  // ========== 基础标识 ==========
  traceId       String?  @map("trace_id")      // 分布式追踪ID
  timestamp     DateTime @default(now())       // 精确时间戳
  
  // ========== 错误核心 ==========
  errorType     String   @map("error_type")    // Error类型: TypeError, ValidationError
  errorCode     String?  @map("error_code")    // 业务错误码: ERR_USER_001
  errorMessage  String   @map("error_message") // 错误消息
  stackTrace    String?  @map("stack_trace") @db.Text  // 完整堆栈
  rootCause     String?  @map("root_cause")    // 根因分析
  
  // ========== 请求上下文 ==========
  requestMethod String?  @map("request_method")  // GET/POST/PUT/DELETE
  requestPath   String?  @map("request_path")    // /api/users/123
  requestQuery  Json?    @map("request_query")   // {page: 1, limit: 10}
  requestBody   Json?    @map("request_body")    // 脱敏后的请求体
  requestHeaders Json?   @map("request_headers") // 关键headers (脱敏)
  
  // ========== 用户上下文 ==========
  userId        String?  @map("user_id")
  username      String?
  userRoles     String[] @default([])
  sessionId     String?  @map("session_id")
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  
  // ========== 系统环境 ==========
  hostname      String?                         // 服务器主机名
  appVersion    String?  @map("app_version")    // 应用版本
  nodeEnv       String?  @map("node_env")       // development/production
  systemContext Json?    @map("system_context") // 内存/CPU快照
  
  // ========== 业务上下文 ==========
  module        String?                         // 业务模块: users, sales
  operation     String?                         // 操作名: createUser
  entityType    String?  @map("entity_type")    // 实体类型: User, Order
  entityId      String?  @map("entity_id")      // 实体ID
  businessContext Json?  @map("business_context") // 业务相关数据

  // ========== 诊断分类 ==========
  severity      ErrorSeverity @default(MEDIUM)
  category      ErrorCategory @default(UNKNOWN)
  errorHash     String?  @map("error_hash")     // 错误指纹 (MD5)
  occurrences   Int      @default(1)            // 重复次数
  firstSeenAt   DateTime? @map("first_seen_at") // 首次出现
  lastSeenAt    DateTime? @map("last_seen_at")  // 最后出现
  
  // ========== 问题追踪 ==========
  isResolved    Boolean  @default(false) @map("is_resolved")
  resolvedAt    DateTime? @map("resolved_at")
  resolvedBy    String?  @map("resolved_by")
  resolution    String?  @db.Text               // 解决方案描述
  
  // ========== 环境标识 ==========
  devMode       Boolean  @default(false) @map("dev_mode")
  
  createdAt     DateTime @default(now()) @map("created_at")
  
  // ========== 索引 ==========
  @@index([traceId])
  @@index([errorHash])
  @@index([severity])
  @@index([category])
  @@index([module])
  @@index([isResolved])
  @@index([createdAt])
  @@index([devMode])
  @@map("error_logs")
}

enum ErrorSeverity {
  CRITICAL   // 系统崩溃级别
  HIGH       // 功能不可用
  MEDIUM     // 功能受限
  LOW        // 轻微问题
}

enum ErrorCategory {
  DATABASE      // 数据库错误
  NETWORK       // 网络错误
  VALIDATION    // 验证错误
  AUTH          // 认证授权错误
  BUSINESS      // 业务逻辑错误
  EXTERNAL_API  // 外部API错误
  SYSTEM        // 系统错误
  UNKNOWN       // 未分类
}
```

### 3.2 AuditLog (审计日志) - 增强结构

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  traceId     String?  @map("trace_id")        // NEW: 关联追踪
  
  // ========== 操作人 ==========
  userId      String?  @map("user_id")
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  username    String?
  sessionId   String?  @map("session_id")
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  
  // ========== 操作信息 ==========
  module      String                            // 模块: users, security
  action      String                            // 动作: UPDATE_PERMISSIONS
  entityType  String?  @map("entity_type")
  entityId    String?  @map("entity_id")
  
  // ========== 变更详情 ==========
  oldValue    Json?    @map("old_value")       // NEW: 变更前
  newValue    Json?    @map("new_value")       // NEW: 变更后
  details     Json?                            // 附加详情
  
  // ========== 结果与风险 ==========
  result      AuditResult @default(SUCCESS)    // NEW: 操作结果
  riskLevel   RiskLevel @default(LOW)          // NEW: 风险等级
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([traceId])
  @@index([userId])
  @@index([module])
  @@index([action])
  @@index([riskLevel])
  @@index([createdAt])
  @@map("audit_logs")
}

enum AuditResult {
  SUCCESS    // 成功
  DENIED     // 被拒绝 (权限不足)
  FAILED     // 失败 (执行错误)
}

enum RiskLevel {
  CRITICAL   // 极高风险: 删除数据, 权限变更
  HIGH       // 高风险: 用户管理, 配置变更
  MEDIUM     // 中风险: 数据修改
  LOW        // 低风险: 查询操作
}
```

### 3.3 BusinessLog (业务日志)

```prisma
model BusinessLog {
  id          String   @id @default(uuid())
  traceId     String?  @map("trace_id")
  
  // ========== 操作人 ==========
  username    String?
  ipAddress   String?  @map("ip_address")
  
  // ========== 业务信息 ==========
  module      String                  // sales, purchase, inventory
  action      String                  // CREATE_PO, UPDATE_SUPPLIER
  summary     String?                 // 操作摘要
  details     Json?                   // 详细数据
  
  // ========== 目标实体 ==========
  entityType  String?  @map("entity_type")
  entityId    String?  @map("entity_id")
  
  // ========== 状态 ==========
  status      LogStatus @default(SUCCESS)
  
  // ========== 环境 ==========
  devMode     Boolean  @default(false) @map("dev_mode")
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([traceId])
  @@index([module])
  @@index([action])
  @@index([status])
  @@index([createdAt])
  @@index([devMode])
  @@map("business_logs")
}
```

### 3.4 AccessLog (访问日志)

```prisma
model AccessLog {
  id            String   @id @default(uuid())
  traceId       String?  @map("trace_id")
  
  // ========== 请求信息 ==========
  username      String?
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  
  // ========== HTTP 信息 ==========
  method        String
  path          String
  queryParams   String?  @map("query_params")
  statusCode    Int      @map("status_code")
  
  // ========== 性能指标 ==========
  responseTime  Int?     @map("response_time")   // 毫秒
  responseSize  Int?     @map("response_size")   // 字节
  
  // ========== 环境 ==========
  devMode       Boolean  @default(false) @map("dev_mode")
  
  createdAt     DateTime @default(now()) @map("created_at")
  
  @@index([traceId])
  @@index([path])
  @@index([statusCode])
  @@index([createdAt])
  @@index([devMode])
  @@map("access_logs")
}
```

---

## 4. 日志写入服务

### 4.1 LogWriterService 完整实现

**文件路径**: `apps/api/src/common/logging/log-writer.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import * as crypto from 'crypto';

@Injectable()
export class LogWriterService {
  private readonly logger = new Logger(LogWriterService.name);
  private readonly SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'secret', 'apiKey', 'creditCard'];

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Error Log
  // ============================================================
  
  async logError(params: {
    error: Error;
    context: RequestContext;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    businessContext?: Record<string, any>;
  }) {
    const { error, context, severity, category, businessContext } = params;
    
    // 生成错误指纹 (用于聚合)
    const errorHash = this.generateErrorHash(error);
    
    // 检查是否已存在相同错误
    const existing = await this.prisma.errorLog.findFirst({
      where: { errorHash, isResolved: false },
      orderBy: { createdAt: 'desc' },
    });
    
    if (existing) {
      // 更新现有错误的出现次数
      return this.prisma.errorLog.update({
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
    return this.prisma.errorLog.create({
      data: {
        traceId: context.traceId,
        
        // 错误核心
        errorType: error.name || 'Error',
        errorCode: (error as any).code || null,
        errorMessage: error.message,
        stackTrace: error.stack,
        rootCause: this.extractRootCause(error),
        
        // 请求上下文
        requestMethod: context.method,
        requestPath: context.path,
        requestQuery: context.query ? this.sanitize(context.query) : null,
        requestBody: context.body ? this.sanitize(context.body) : null,
        requestHeaders: context.headers ? this.sanitizeHeaders(context.headers) : null,
        
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
        systemContext: systemContext.metrics,
        
        // 业务上下文
        module: context.module,
        operation: context.operation,
        entityType: context.entityType,
        entityId: context.entityId,
        businessContext: businessContext ? this.sanitize(businessContext) : null,
        
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
  }

  // ============================================================
  // Audit Log
  // ============================================================
  
  async logAudit(params: {
    context: RequestContext;
    module: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: any;
    newValue?: any;
    details?: any;
    result?: AuditResult;
    riskLevel?: RiskLevel;
  }) {
    const { context, module, action, entityType, entityId, oldValue, newValue, details, result, riskLevel } = params;
    
    return this.prisma.auditLog.create({
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
        oldValue: oldValue ? this.sanitize(oldValue) : null,
        newValue: newValue ? this.sanitize(newValue) : null,
        details: details ? this.sanitize(details) : null,
        result: result || 'SUCCESS',
        riskLevel: riskLevel || this.determineRiskLevel(action),
      },
    });
  }

  // ============================================================
  // Business Log
  // ============================================================
  
  async logBusiness(params: {
    context: RequestContext;
    module: string;
    action: string;
    summary?: string;
    details?: any;
    entityType?: string;
    entityId?: string;
    status?: LogStatus;
  }) {
    const { context, module, action, summary, details, entityType, entityId, status } = params;
    
    return this.prisma.businessLog.create({
      data: {
        traceId: context.traceId,
        username: context.username,
        ipAddress: context.ipAddress,
        module,
        action,
        summary,
        details: details ? this.sanitize(details) : null,
        entityType,
        entityId,
        status: status || 'SUCCESS',
        devMode: process.env.NODE_ENV !== 'production',
      },
    });
  }

  // ============================================================
  // Access Log
  // ============================================================
  
  async logAccess(params: {
    context: RequestContext;
    statusCode: number;
    responseTime: number;
    responseSize?: number;
  }) {
    const { context, statusCode, responseTime, responseSize } = params;
    
    return this.prisma.accessLog.create({
      data: {
        traceId: context.traceId,
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
      },
    });
  }

  // ============================================================
  // 工具方法
  // ============================================================
  
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
    let cause = (error as any).cause;
    while (cause?.cause) {
      cause = cause.cause;
    }
    return cause?.message || null;
  }
  
  /**
   * 敏感数据脱敏
   */
  private sanitize(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') return data;
    
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      
      // 检查是否为敏感字段
      if (this.SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    
    return sanitized;
  }
  
  /**
   * 脱敏 HTTP Headers
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const safeHeaders: Record<string, any> = {};
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
   * 收集系统上下文
   */
  private collectSystemContext() {
    const memUsage = process.memoryUsage();
    
    return {
      hostname: require('os').hostname(),
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
    const criticalActions = ['DELETE_USER', 'CLEAR_DATA', 'UPDATE_PERMISSIONS', 'GOD_MODE'];
    const highActions = ['CREATE_USER', 'UPDATE_USER', 'CHANGE_ROLE', 'UPDATE_CONFIG'];
    const mediumActions = ['UPDATE', 'EDIT', 'MODIFY'];
    
    action = action.toUpperCase();
    
    if (criticalActions.some(a => action.includes(a))) return 'CRITICAL';
    if (highActions.some(a => action.includes(a))) return 'HIGH';
    if (mediumActions.some(a => action.includes(a))) return 'MEDIUM';
    return 'LOW';
  }
}

// ============================================================
// Types
// ============================================================

export interface RequestContext {
  traceId: string;
  method: string;
  path: string;
  query?: Record<string, any>;
  queryString?: string;
  body?: any;
  headers?: Record<string, any>;
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
```

---

## 5. 全局异常捕获

### 5.1 AllExceptionsFilter 实现

**文件路径**: `apps/api/src/common/filters/all-exceptions.filter.ts`

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LogWriterService } from '../logging/log-writer.service';

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

    // 提取请求上下文
    const context = {
      traceId: request.headers['x-trace-id'] as string || this.generateTraceId(),
      method: request.method,
      path: request.path,
      query: request.query,
      queryString: request.url.split('?')[1],
      body: request.body,
      headers: request.headers,
      userId: (request as any).user?.id,
      username: (request as any).user?.username,
      userRoles: (request as any).user?.roles,
      sessionId: request.cookies?.sessionId,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
    };

    // 异步写入日志 (不阻塞响应)
    this.logWriter.logError({
      error,
      context,
      severity: status >= 500 ? 'HIGH' : 'MEDIUM',
    }).catch(err => {
      this.logger.error('Failed to write error log', err);
    });

    // 返回标准化错误响应
    const errorResponse = {
      success: false,
      error: {
        code: (error as any).code || 'INTERNAL_ERROR',
        message: status < 500 ? error.message : 'Internal server error',
        traceId: context.traceId,
        timestamp: new Date().toISOString(),
      },
    };

    // 开发环境返回更多信息
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.error['stack'] = error.stack;
      errorResponse.error['details'] = exception instanceof HttpException 
        ? exception.getResponse() 
        : null;
    }

    response.status(status).json(errorResponse);
  }

  private getClientIP(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 5.2 注册全局 Filter

**文件路径**: `apps/api/src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LogWriterService } from './common/logging/log-writer.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局异常过滤器
  const logWriter = app.get(LogWriterService);
  app.useGlobalFilters(new AllExceptionsFilter(logWriter));
  
  await app.listen(3000);
}
bootstrap();
```

---

## 6. 数据存储策略

### 6.1 数据库选择

| 数据类型 | 存储引擎 | 说明 |
|---------|---------|------|
| **ErrorLog** | PostgreSQL | 主库存储，支持复杂查询 |
| **AuditLog** | PostgreSQL | 主库存储，合规要求长期保留 |
| **BusinessLog** | PostgreSQL | 主库存储 |
| **AccessLog** | PostgreSQL | 主库存储 (可考虑未来迁移到 TimescaleDB) |

### 6.2 表分区策略 (可选)

对于高流量场景，可按月分区：

```sql
-- 按月分区 AccessLog
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ...
) PARTITION BY RANGE (created_at);

-- 创建分区
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 6.3 索引策略

```sql
-- ErrorLog 常用查询优化
CREATE INDEX CONCURRENTLY idx_error_logs_unresolved 
  ON error_logs (created_at DESC) 
  WHERE is_resolved = false;

CREATE INDEX CONCURRENTLY idx_error_logs_critical 
  ON error_logs (created_at DESC) 
  WHERE severity = 'CRITICAL';

-- AuditLog 用户查询优化
CREATE INDEX CONCURRENTLY idx_audit_logs_user_action 
  ON audit_logs (user_id, created_at DESC);

-- AccessLog 性能分析
CREATE INDEX CONCURRENTLY idx_access_logs_slow 
  ON access_logs (response_time DESC) 
  WHERE response_time > 1000;
```

---

## 7. 归档与清理

### 7.1 归档策略

| 日志类型 | 热数据 (主库) | 冷数据 (归档) | 归档存储 |
|---------|--------------|--------------|---------|
| **ErrorLog** | 90 天 | 2 年 | S3/OSS JSON.gz |
| **AuditLog** | 365 天 | 7 年 (合规) | S3/OSS JSON.gz |
| **BusinessLog** | 90 天 | 1 年 | S3/OSS JSON.gz |
| **AccessLog** | 30 天 | 90 天 | S3/OSS Parquet |

### 7.2 归档脚本

**文件路径**: `apps/api/src/common/logging/archive.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';
import * as zlib from 'zlib';
import * as fs from 'fs';

@Injectable()
export class LogArchiveService {
  private readonly logger = new Logger(LogArchiveService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 每天凌晨 3 点执行归档
   */
  @Cron('0 3 * * *')
  async archiveLogs() {
    this.logger.log('Starting daily log archive...');
    
    const now = new Date();
    
    await Promise.all([
      this.archiveErrorLogs(now),
      this.archiveBusinessLogs(now),
      this.archiveAccessLogs(now),
    ]);
    
    this.logger.log('Daily log archive completed');
  }

  private async archiveErrorLogs(now: Date) {
    const cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90天前
    
    // 1. 查询需要归档的数据
    const logsToArchive = await this.prisma.errorLog.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        devMode: false, // 只归档生产数据
      },
      take: 10000, // 分批处理
    });
    
    if (logsToArchive.length === 0) return;
    
    // 2. 写入归档文件
    const archiveDate = cutoffDate.toISOString().split('T')[0];
    const archivePath = `/archives/error_logs/${archiveDate}.json.gz`;
    
    const jsonData = JSON.stringify(logsToArchive);
    const compressed = zlib.gzipSync(jsonData);
    
    // 这里应该上传到 S3/OSS，简化示例写入本地
    fs.writeFileSync(archivePath, compressed);
    
    // 3. 删除已归档数据
    const ids = logsToArchive.map(log => log.id);
    await this.prisma.errorLog.deleteMany({
      where: { id: { in: ids } },
    });
    
    this.logger.log(`Archived ${logsToArchive.length} error logs to ${archivePath}`);
  }

  private async archiveBusinessLogs(now: Date) {
    // 类似实现...
  }

  private async archiveAccessLogs(now: Date) {
    // 类似实现...
  }

  /**
   * 清理开发环境日志 (每周一次)
   */
  @Cron('0 4 * * 0') // 每周日凌晨4点
  async cleanDevLogs() {
    const devCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7天前
    
    const [errors, business, access] = await Promise.all([
      this.prisma.errorLog.deleteMany({
        where: { devMode: true, createdAt: { lt: devCutoff } },
      }),
      this.prisma.businessLog.deleteMany({
        where: { devMode: true, createdAt: { lt: devCutoff } },
      }),
      this.prisma.accessLog.deleteMany({
        where: { devMode: true, createdAt: { lt: devCutoff } },
      }),
    ]);
    
    this.logger.log(`Cleaned dev logs: ${errors.count} errors, ${business.count} business, ${access.count} access`);
  }
}
```

### 7.3 手动清理接口

```typescript
// logs.controller.ts
@Delete('maintenance/dev-logs')
@RequireSecurityLevel(4) // 需要 L4 安全码
async clearDevLogs() {
  return this.logsService.clearDevLogs();
}

@Delete('maintenance/archive-old')
@RequireSecurityLevel(4)
async archiveOldLogs(@Query('days') days: number = 90) {
  return this.archiveService.archiveLogsOlderThan(days);
}
```

---

## 8. 查询与过滤

### 8.1 高级过滤 DTO

```typescript
// log-query.dto.ts
export class ErrorLogQueryDto {
  // 分页
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) pageSize?: number = 20;
  
  // 时间范围
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  
  // 严重度过滤
  @IsOptional() @IsEnum(ErrorSeverity) severity?: ErrorSeverity;
  @IsOptional() @IsArray() severities?: ErrorSeverity[];
  
  // 分类过滤
  @IsOptional() @IsEnum(ErrorCategory) category?: ErrorCategory;
  
  // 状态过滤
  @IsOptional() @Transform(v => v === 'true') isResolved?: boolean;
  
  // 环境过滤
  @IsOptional() @Transform(v => v === 'true') devMode?: boolean;
  
  // 模块过滤
  @IsOptional() @IsString() module?: string;
  
  // 全文搜索
  @IsOptional() @IsString() search?: string;
  
  // 追踪 ID
  @IsOptional() @IsString() traceId?: string;
  
  // 用户过滤
  @IsOptional() @IsString() username?: string;
  
  // 排序
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsEnum(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'desc';
}
```

### 8.2 全链路追踪查询

```typescript
// logs.service.ts
async getTraceTimeline(traceId: string) {
  const [errors, audits, business, access] = await Promise.all([
    this.prisma.errorLog.findMany({ where: { traceId }, orderBy: { createdAt: 'asc' } }),
    this.prisma.auditLog.findMany({ where: { traceId }, orderBy: { createdAt: 'asc' } }),
    this.prisma.businessLog.findMany({ where: { traceId }, orderBy: { createdAt: 'asc' } }),
    this.prisma.accessLog.findMany({ where: { traceId }, orderBy: { createdAt: 'asc' } }),
  ]);
  
  // 合并并按时间排序
  const timeline = [
    ...errors.map(e => ({ type: 'error', ...e })),
    ...audits.map(a => ({ type: 'audit', ...a })),
    ...business.map(b => ({ type: 'business', ...b })),
    ...access.map(a => ({ type: 'access', ...a })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  return { traceId, timeline };
}
```

---

## 9. 前端展示

### 9.1 错误详情页面设计

错误详情页应展示以下区块：

```
┌─────────────────────────────────────────────────────────────────┐
│ [返回] 错误详情                            [标记已解决] [删除]   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 错误概要                                                    │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ 类型: TypeError          严重度: [🔴 CRITICAL]             │ │
│ │ 消息: Cannot read property 'id' of undefined               │ │
│ │ 发生时间: 2026-02-05 22:50:00                              │ │
│ │ TraceID: abc-123-def-456                                   │ │
│ │ 出现次数: 15 次   首次: 2026-02-05 10:00   末次: 22:50     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 堆栈跟踪                                              [复制] │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ at UsersService.findById (users.service.ts:45:12)          │ │
│ │ at UsersController.getUser (users.controller.ts:23:5)      │ │
│ │ at ...                                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 请求信息                                                    │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ 方法: GET    路径: /api/users/123                          │ │
│ │ Query: ?include=roles                                       │ │
│ │ Body: -                                                     │ │
│ │ Headers: Content-Type: application/json                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 用户信息                                                    │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ 用户: admin (ID: user-123)    角色: [admin, editor]        │ │
│ │ IP: 192.168.1.100             UA: Chrome/120.0              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 系统环境                                                    │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ 主机: server-01    版本: 1.2.3    环境: production         │ │
│ │ 内存: 256MB / 512MB    运行时间: 3600s                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 解决方案                                                    │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ 状态: 未解决                                                │ │
│ │ [输入解决方案...]                                           │ │
│ │                                           [标记为已解决]    │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. 性能优化

### 10.1 异步写入

日志写入不阻塞业务请求，使用 Fire-and-Forget 模式：

```typescript
// 异步写入示例 - 不等待结果
this.logWriter.logError({ error, context }).catch(err => {
  this.logger.error('Log write failed', err);
});

// 业务响应立即返回
return response;
```

### 10.2 批量写入 (高流量场景)

当 QPS 较高时，使用内存队列 + 批量入库：

```typescript
// log-buffer.service.ts
@Injectable()
export class LogBufferService {
  private buffer: LogEntry[] = [];
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 1000;

  constructor(private readonly prisma: PrismaService) {
    // 定时刷新
    setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  add(entry: LogEntry) {
    this.buffer.push(entry);
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    
    const entries = this.buffer.splice(0);
    
    try {
      await this.prisma.accessLog.createMany({ data: entries });
    } catch (error) {
      // 失败时写入备份队列
      await this.writeToBackup(entries);
    }
  }
}
```

### 10.3 索引优化

确保高频查询字段有适当索引：

```sql
-- 复合索引优化常用查询
CREATE INDEX CONCURRENTLY idx_error_logs_module_severity_created 
  ON error_logs (module, severity, created_at DESC);

-- 部分索引减少索引大小
CREATE INDEX CONCURRENTLY idx_error_logs_unresolved_critical 
  ON error_logs (created_at DESC) 
  WHERE is_resolved = false AND severity = 'CRITICAL';

-- 表达式索引加速全文搜索
CREATE INDEX CONCURRENTLY idx_error_logs_message_gin
  ON error_logs USING gin(to_tsvector('english', error_message));
```

### 10.4 分页优化

大数据量分页使用游标而非 offset：

```typescript
// 低效: offset 分页
const logs = await prisma.errorLog.findMany({
  skip: (page - 1) * pageSize,  // page=1000 时性能极差
  take: pageSize,
});

// 高效: 游标分页
const logs = await prisma.errorLog.findMany({
  take: pageSize,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { createdAt: 'desc' },
});
```

---

## 11. 高可用与容错

### 11.1 日志写入失败降级策略

```typescript
// log-writer.service.ts
async logError(params: LogErrorParams) {
  try {
    // 主写入: PostgreSQL
    return await this.prisma.errorLog.create({ data: params });
  } catch (primaryError) {
    this.logger.error('Primary log write failed', primaryError);
    
    try {
      // 备份写入: 本地文件
      await this.writeToLocalFile(params);
    } catch (backupError) {
      // 最终降级: 仅输出到 stdout
      console.error('[EMERGENCY LOG]', JSON.stringify(params));
    }
  }
}

private async writeToLocalFile(data: any) {
  const logPath = `/var/log/mgmt/fallback-${new Date().toISOString().split('T')[0]}.jsonl`;
  await fs.appendFile(logPath, JSON.stringify(data) + '\n');
}
```

### 11.2 数据库连接池配置

```typescript
// prisma/client.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // 连接池配置
  log: ['error', 'warn'],
  errorFormat: 'minimal',
});

// 处理连接失败
prisma.$on('error', (e) => {
  console.error('Prisma connection error', e);
});
```

### 11.3 重试机制

```typescript
// utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 100
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await sleep(delayMs * attempt); // 指数退避
      }
    }
  }
  
  throw lastError;
}

// 使用示例
await withRetry(() => this.prisma.errorLog.create({ data }));
```

### 11.4 健康检查

```typescript
// logs/logs.controller.ts
@Get('health')
async healthCheck() {
  const checks = {
    database: false,
    diskSpace: false,
  };
  
  try {
    await this.prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {}
  
  try {
    const stats = await fs.stat('/var/log/mgmt');
    checks.diskSpace = true; // 检查日志目录可写
  } catch {}
  
  const healthy = Object.values(checks).every(v => v);
  
  return {
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  };
}
```

---

## 12. 安全与合规

### 12.1 敏感数据脱敏规则

| 字段类型 | 脱敏规则 | 示例 |
|---------|---------|------|
| **密码** | 完全隐藏 | `[REDACTED]` |
| **Token/API Key** | 完全隐藏 | `[REDACTED]` |
| **Authorization Header** | 显示类型 | `[BEARER TOKEN]` |
| **手机号** | 部分显示 | `138****1234` |
| **身份证** | 部分显示 | `310***********1234` |
| **邮箱** | 部分显示 | `a***n@example.com` |
| **银行卡** | 仅显示后四位 | `****1234` |
| **IP 地址** | 保留 | (审计需要) |

### 12.2 敏感字段扩展

```typescript
// common/logging/sanitizer.ts
const SANITIZE_RULES = {
  // 完全隐藏
  REDACT: [
    'password', 'passwd', 'pwd',
    'secret', 'token', 'apiKey', 'api_key',
    'accessToken', 'refreshToken',
    'creditCard', 'cardNumber', 'cvv',
    'ssn', 'socialSecurity',
  ],
  // 部分显示 (手机)
  MASK_PHONE: ['phone', 'mobile', 'tel'],
  // 部分显示 (邮箱)
  MASK_EMAIL: ['email', 'mail'],
  // 部分显示 (身份证)
  MASK_ID: ['idCard', 'idNumber', 'nationalId'],
};

export function sanitizeValue(key: string, value: any): any {
  const lowerKey = key.toLowerCase();
  
  if (SANITIZE_RULES.REDACT.some(f => lowerKey.includes(f))) {
    return '[REDACTED]';
  }
  
  if (SANITIZE_RULES.MASK_PHONE.some(f => lowerKey.includes(f)) && typeof value === 'string') {
    return value.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }
  
  if (SANITIZE_RULES.MASK_EMAIL.some(f => lowerKey.includes(f)) && typeof value === 'string') {
    return value.replace(/^(.).*(.@.*)$/, '$1***$2');
  }
  
  return value;
}
```

### 12.3 日志访问权限控制

| 角色 | ErrorLog | AuditLog | BusinessLog | AccessLog | 清理/归档 |
|------|----------|----------|-------------|-----------|-----------|
| **superuser** | ✅ 全部 | ✅ 全部 | ✅ 全部 | ✅ 全部 | ✅ |
| **admin** | ✅ 生产 | ✅ 生产 | ✅ 生产 | ✅ 生产 | ❌ |
| **staff** | ✅ 关联 | ❌ | ✅ 关联 | ❌ | ❌ |
| **viewer** | ❌ | ❌ | ❌ | ❌ | ❌ |

### 12.4 合规要求

| 要求 | 实现 |
|------|------|
| **审计追溯** | AuditLog 保留 365 天，不可删除 |
| **变更记录** | 记录 oldValue/newValue |
| **访问记录** | 记录所有敏感操作的 IP、时间、用户 |
| **数据不可篡改** | 生产日志禁止 UPDATE/DELETE (应用层控制) |
| **加密存储** | 敏感字段在 details JSON 中加密 (可选) |

### 12.5 日志自身安全

```typescript
// 防止日志注入攻击
function sanitizeLogContent(content: string): string {
  return content
    .replace(/[\r\n]/g, ' ')  // 移除换行
    .slice(0, 10000);          // 限制长度
}

// 限制 JSON 深度
function safeStringify(obj: any, maxDepth = 5): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}
```

---

## 13. 监控与告警

### 13.1 告警规则配置

| 告警级别 | 触发条件 | 通知渠道 | 响应时间 |
|---------|---------|---------|---------|
| **P0 紧急** | CRITICAL 错误 或 5分钟内 > 50 个 HIGH 错误 | 电话 + 短信 + 邮件 | 5 分钟 |
| **P1 严重** | 5分钟内 > 20 个 MEDIUM 错误 | 短信 + 邮件 | 15 分钟 |
| **P2 警告** | 1小时内 > 100 个任意错误 | 邮件 | 1 小时 |
| **P3 提示** | 数据库连接池 > 80% | 日报 | 次日 |

### 13.2 告警服务实现

```typescript
// common/logging/alert.service.ts
@Injectable()
export class LogAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('*/5 * * * *') // 每5分钟检查
  async checkAlertConditions() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // P0: CRITICAL 错误
    const criticalErrors = await this.prisma.errorLog.count({
      where: {
        severity: 'CRITICAL',
        isResolved: false,
        createdAt: { gte: fiveMinutesAgo },
      },
    });
    
    if (criticalErrors > 0) {
      await this.sendAlert({
        level: 'P0',
        title: '🚨 CRITICAL 错误告警',
        message: `检测到 ${criticalErrors} 个 CRITICAL 级别错误`,
        channels: ['phone', 'sms', 'email'],
      });
    }
    
    // P1: HIGH 错误阈值
    const highErrors = await this.prisma.errorLog.count({
      where: {
        severity: 'HIGH',
        isResolved: false,
        createdAt: { gte: fiveMinutesAgo },
      },
    });
    
    if (highErrors > 50) {
      await this.sendAlert({
        level: 'P1',
        title: '⚠️ 高频 HIGH 错误',
        message: `5分钟内检测到 ${highErrors} 个 HIGH 级别错误`,
        channels: ['sms', 'email'],
      });
    }
  }

  private async sendAlert(params: AlertParams) {
    // 防重复告警: 检查最近是否已发送过相同告警
    const recentAlert = await this.checkRecentAlert(params.title);
    if (recentAlert) return;
    
    await this.notificationService.send(params);
  }
}
```

### 13.3 Dashboard 监控指标

```
┌─────────────────────────────────────────────────────────────────┐
│                        日志监控 Dashboard                        │
├─────────────────────────────────────────────────────────────────┤
│  错误概览                    今日访问                           │
│  ┌─────────────────────┐   ┌─────────────────────┐             │
│  │ 🔴 CRITICAL: 0      │   │ 总请求: 12,345      │             │
│  │ 🟠 HIGH: 5          │   │ 成功率: 99.8%       │             │
│  │ 🟡 MEDIUM: 23       │   │ 平均响应: 45ms      │             │
│  │ 🟢 LOW: 156         │   │ P99 响应: 230ms     │             │
│  └─────────────────────┘   └─────────────────────┘             │
│                                                                  │
│  错误趋势 (7天)                                                  │
│  ▃▅█▅▃▂▁                                                        │
│  M T W T F S S                                                  │
│                                                                  │
│  Top 5 错误类型                                                  │
│  1. ValidationError (45%)                                        │
│  2. DatabaseError (20%)                                          │
│  3. AuthorizationError (15%)                                    │
│  4. NetworkError (12%)                                          │
│  5. UnknownError (8%)                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. 日志导出

### 14.1 导出格式支持

| 格式 | 用途 | 大小 |
|------|------|------|
| **JSON** | 程序处理、API 集成 | 中 |
| **CSV** | Excel 分析 | 小 |
| **Parquet** | 大数据分析 | 最小 |
| **JSONL** | 流式处理 | 中 |

### 14.2 导出接口

```typescript
// logs.controller.ts
@Get('export')
@RequireRole('admin')
async exportLogs(
  @Query() query: LogExportDto,
  @Res() res: Response,
) {
  const { logType, format, startDate, endDate } = query;
  
  // 限制导出范围
  const maxRange = 30 * 24 * 60 * 60 * 1000; // 30天
  if (new Date(endDate).getTime() - new Date(startDate).getTime() > maxRange) {
    throw new BadRequestException('Export range cannot exceed 30 days');
  }
  
  const logs = await this.logsService.findForExport(logType, startDate, endDate);
  
  switch (format) {
    case 'json':
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${logType}_${startDate}_${endDate}.json"`);
      res.send(JSON.stringify(logs, null, 2));
      break;
      
    case 'csv':
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${logType}_${startDate}_${endDate}.csv"`);
      res.send(this.convertToCSV(logs));
      break;
      
    case 'jsonl':
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${logType}_${startDate}_${endDate}.jsonl"`);
      res.send(logs.map(l => JSON.stringify(l)).join('\n'));
      break;
  }
}
```

### 14.3 大数据量流式导出

```typescript
// 避免内存溢出的流式导出
@Get('export/stream')
async streamExportLogs(
  @Query() query: LogExportDto,
  @Res() res: Response,
) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  const cursor = await this.prisma.errorLog.findMany({
    where: { createdAt: { gte: query.startDate, lte: query.endDate } },
    take: 1000, // 分批
  });
  
  let lastId = null;
  
  while (true) {
    const batch = await this.prisma.errorLog.findMany({
      where: { createdAt: { gte: query.startDate, lte: query.endDate } },
      take: 1000,
      cursor: lastId ? { id: lastId } : undefined,
      skip: lastId ? 1 : 0,
    });
    
    if (batch.length === 0) break;
    
    for (const log of batch) {
      res.write(JSON.stringify(log) + '\n');
    }
    
    lastId = batch[batch.length - 1].id;
  }
  
  res.end();
}
```

### 14.4 导出安全控制

- ✅ 需要 `admin` 以上角色
- ✅ 需要 L2 安全码验证 (超过 1000 条)
- ✅ 导出操作记入 AuditLog
- ✅ 限制单次导出最大范围 (30 天)
- ✅ 敏感字段自动脱敏

---

## 15. 实施计划

### Phase 1: 数据模型增强 (Day 1)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 1.1 | 更新 ErrorLog Schema | `prisma/schema.prisma` |
| 1.2 | 更新 AuditLog Schema | `prisma/schema.prisma` |
| 1.3 | 添加新枚举类型 | `prisma/schema.prisma` |
| 1.4 | 运行 Migration | `npx prisma migrate dev --name enhance_logs` |
| 1.5 | 更新 DTO 类型 | `logs/dto/log-query.dto.ts` |

### Phase 2: 日志写入服务 (Day 2)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 2.1 | 创建 LogWriterService | `common/logging/log-writer.service.ts` |
| 2.2 | 创建 LoggingModule | `common/logging/logging.module.ts` |
| 2.3 | 实现敏感数据脱敏 | `common/logging/sanitizer.ts` |
| 2.4 | 注册全局 Module | `app.module.ts` |

### Phase 3: 全局异常捕获 (Day 2)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 3.1 | 创建 AllExceptionsFilter | `common/filters/all-exceptions.filter.ts` |
| 3.2 | 创建 RequestContextMiddleware | `common/middleware/request-context.middleware.ts` |
| 3.3 | 注册全局 Filter | `main.ts` |
| 3.4 | 测试异常捕获 | 手动触发各类错误 |

### Phase 4: 访问日志拦截器 (Day 3)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 4.1 | 创建 LoggingInterceptor | `common/interceptors/logging.interceptor.ts` |
| 4.2 | 注册全局 Interceptor | `main.ts` |

### Phase 5: 归档与清理 (Day 3)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 5.1 | 创建 LogArchiveService | `common/logging/archive.service.ts` |
| 5.2 | 配置 Cron 定时任务 | `app.module.ts` |
| 5.3 | 添加手动清理接口 | `logs.controller.ts` |

### Phase 6: 前端更新 (Day 4)

| 步骤 | 任务 | 文件 |
|------|------|------|
| 6.1 | 更新错误列表页 | `logs/errors/page.tsx` |
| 6.2 | 创建错误详情页 | `logs/errors/[id]/page.tsx` |
| 6.3 | 添加高级过滤器 | `logs/components/LogFilters.tsx` |
| 6.4 | 添加全链路追踪视图 | `logs/trace/[traceId]/page.tsx` |

---

## 16. 测试验证

### 11.1 错误日志测试用例

```typescript
describe('ErrorLog', () => {
  it('should capture unhandled exceptions', async () => {
    // 触发未处理异常
    await request(app).get('/api/test/throw-error').expect(500);
    
    // 验证日志记录
    const log = await prisma.errorLog.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(log).toBeDefined();
    expect(log.errorMessage).toContain('Test error');
    expect(log.stackTrace).toBeDefined();
    expect(log.requestPath).toBe('/api/test/throw-error');
  });
  
  it('should aggregate duplicate errors', async () => {
    // 触发相同错误多次
    for (let i = 0; i < 5; i++) {
      await request(app).get('/api/test/same-error');
    }
    
    // 验证聚合
    const logs = await prisma.errorLog.findMany({ where: { errorMessage: 'Same error' } });
    expect(logs.length).toBe(1);
    expect(logs[0].occurrences).toBe(5);
  });
  
  it('should sanitize sensitive data', async () => {
    await request(app)
      .post('/api/test/with-password')
      .send({ username: 'test', password: 'secret123' });
    
    const log = await prisma.errorLog.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(log.requestBody).not.toContain('secret123');
    expect(log.requestBody).toContain('[REDACTED]');
  });
});
```

### 11.2 验收清单

- [ ] ErrorLog 包含完整上下文信息
- [ ] 敏感数据已脱敏
- [ ] 错误聚合正常工作
- [ ] TraceId 全链路关联
- [ ] 归档任务正常执行
- [ ] 前端可查看完整错误详情
- [ ] L4 安全保护清理功能

---

## 附录

### A. 错误码规范

| 前缀 | 模块 | 示例 |
|------|------|------|
| ERR_AUTH_ | 认证授权 | ERR_AUTH_001 登录失败 |
| ERR_USER_ | 用户管理 | ERR_USER_001 用户不存在 |
| ERR_DB_ | 数据库 | ERR_DB_001 连接失败 |
| ERR_VAL_ | 验证 | ERR_VAL_001 参数错误 |
| ERR_SYS_ | 系统 | ERR_SYS_001 内存不足 |

### B. 相关文档

- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [日志最佳实践 RFC](https://datatracker.ietf.org/doc/html/rfc5424)
