# 日志系统 V2 - 使用指南

## 📋 快速开始

日志系统已在应用启动时自动配置，包含：
- **TraceId 中间件**: 为每个请求生成唯一追踪ID
- **Access Log 拦截器**: 自动记录每个请求的访问日志
- **全局异常过滤器**: 自动捕获并记录所有未处理异常

## 🔧 在 Controller 中使用

### 1. 使用装饰器 (推荐)

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { AuditLog, BusinessLog } from '@/common/decorators';

@Controller('users')
export class UsersController {
  
  // 审计日志 - 用于敏感操作
  @Post()
  @AuditLog({ 
    module: 'users', 
    action: 'CREATE_USER', 
    entityType: 'User',
    riskLevel: 'HIGH',
  })
  async createUser(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
  
  // 业务日志 - 用于业务操作追踪
  @Post('upload')
  @BusinessLog({ 
    module: 'users', 
    action: 'BULK_IMPORT',
    summaryTemplate: '{username} 批量导入了用户数据',
  })
  async bulkImport(@Body() dto: BulkImportDto) {
    return this.usersService.bulkImport(dto);
  }
}
```

## 🔧 在 Service 中使用

### 1. 使用 LogContextHelper (推荐)

```typescript
import { Injectable } from '@nestjs/common';
import { LogContextHelper } from '@/common/logging';

@Injectable()
export class UsersService {
  constructor(
    private readonly logHelper: LogContextHelper,
    private readonly prisma: PrismaService,
  ) {}
  
  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    
    // 记录审计日志
    await this.logHelper.logAudit({
      module: 'users',
      action: 'DELETE_USER',
      entityType: 'User',
      entityId: id,
      oldValue: user,
      riskLevel: 'CRITICAL',
    });
    
    await this.prisma.user.delete({ where: { id } });
  }
  
  async updatePermissions(userId: string, permissions: string[]) {
    const oldUser = await this.prisma.user.findUnique({ where: { id: userId } });
    
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { permissions },
    });
    
    // 记录变更前后值对比
    await this.logHelper.logAudit({
      module: 'users',
      action: 'UPDATE_PERMISSIONS',
      entityType: 'User',
      entityId: userId,
      oldValue: { permissions: oldUser.permissions },
      newValue: { permissions },
      riskLevel: 'CRITICAL',
    });
    
    return updated;
  }
}
```

### 2. 直接使用 LogWriterService

```typescript
import { Injectable } from '@nestjs/common';
import { LogWriterService, createManualContext } from '@/common/logging';

@Injectable()
export class SchedulerService {
  constructor(private readonly logWriter: LogWriterService) {}
  
  // 后台任务 (无 HTTP 请求上下文)
  async syncData() {
    const context = createManualContext({
      username: 'scheduler',
      operation: 'sync_external_data',
    });
    
    try {
      await this.performSync();
      
      await this.logWriter.logBusiness({
        context,
        module: 'scheduler',
        action: 'SYNC_DATA',
        summary: '数据同步成功',
        status: 'SUCCESS',
      });
    } catch (error) {
      await this.logWriter.logError({
        error,
        context,
        severity: 'HIGH',
        category: 'EXTERNAL_API',
      });
    }
  }
}
```

### 3. 使用 safeExecute 包装器

```typescript
import { safeExecute, createManualContext, LogWriterService } from '@/common/logging';

// 自动捕获错误并记录日志
const result = await safeExecute(
  async () => await this.riskyOperation(),
  this.logWriter,
  createManualContext({ username: 'system', operation: 'risky_op' }),
  { severity: 'HIGH', rethrow: false }
);
```

## 📊 日志类型说明

| 类型 | 表名 | 用途 | 保留时间 |
|------|------|------|----------|
| Error Log | `error_logs` | 系统异常、错误追踪 | 90天 |
| Audit Log | `audit_logs` | 敏感操作审计 (合规) | 365天 |
| Business Log | `business_logs` | 业务操作追踪 | 180天 |
| Access Log | `access_logs` | HTTP 访问记录 | 30天 |

## 🔑 TraceId 传播

所有日志共享 `traceId`，可用于：
- 在错误发生时查找相关的访问日志
- 追踪单个请求的完整生命周期
- 跨服务分布式追踪

```typescript
// 从请求中获取 traceId
const traceId = request.traceId;

// 前端可从响应头获取
fetch('/api/users', { ... })
  .then(res => {
    const traceId = res.headers.get('X-Trace-Id');
    console.log('Request traced as:', traceId);
  });
```

## ⚠️ 敏感数据处理

日志系统自动脱敏以下字段：
- `password`, `passwd`, `pwd`
- `token`, `authorization`, `secret`
- `apiKey`, `api_key`, `accessToken`, `refreshToken`
- `creditCard`, `cardNumber`, `cvv`
- `ssn`, `socialSecurity`

```typescript
// 输入
{ username: 'admin', password: '123456', token: 'xyz' }

// 日志中记录为
{ username: 'admin', password: '[REDACTED]', token: '[REDACTED]' }
```

## 🏷️ 风险等级自动判定

审计日志会根据 action 自动判定风险等级：

| 等级 | 操作示例 |
|------|---------|
| CRITICAL | DELETE_USER, CLEAR_DATA, UPDATE_PERMISSIONS, RESET_PASSWORD |
| HIGH | CREATE_USER, UPDATE_USER, CHANGE_ROLE, UPDATE_CONFIG |
| MEDIUM | UPDATE, EDIT, MODIFY |
| LOW | 其他操作 |

## 📁 文件结构

```
apps/api/src/common/
├── logging/
│   ├── log-writer.service.ts    # 核心写入服务
│   ├── log-context.helper.ts    # 请求上下文助手
│   ├── logging.module.ts        # 模块定义
│   └── index.ts
├── decorators/
│   ├── log.decorators.ts        # @AuditLog, @BusinessLog
│   └── index.ts
├── filters/
│   ├── all-exceptions.filter.ts # 全局异常过滤器
│   └── index.ts
├── interceptors/
│   ├── access-log.interceptor.ts # Access Log 拦截器
│   └── index.ts
└── middleware/
    ├── trace-id.middleware.ts    # TraceId 中间件
    └── index.ts
```
