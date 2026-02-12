# 审计模块 (Audit Module)

## 模块路径
- **Django App**: `backend/apps/audit/`
- **URL Prefix**: `/dashboard/audit/`
- **权限前缀**: `module.audit.*`

## 子模块清单

### 1. 业务操作日志 (Business Logs)
**路径**: `/dashboard/audit/logs/business/`
**权限**: `module.audit.logs.business`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 日志列表 | 页面 | P0 | 分页表格 |
| 筛选条件 | 前端 | P0 | 多条件筛选 |
| 日志详情 | Modal | P0 | 弹窗 |
| 导出日志 | API | P2 | CSV 导出 |

**关键表**:
- `log_business` - 业务日志表

**复杂度**: 🟢 低

---

### 2. 数据审计日志 (Audit Logs)
**路径**: `/dashboard/audit/logs/infra/`
**权限**: `module.audit.logs.infra`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 审计日志列表 | 页面 | P0 | 分页表格 |
| 敏感信息脱敏 | 后端 | P0 | AuditMasker |
| 上帝模式 | 页面 | P1 | 显示完整信息 |
| 日志清洗 | API | P2 | Purge 功能 |

**关键表**:
- `log_audit` - 审计日志表

**关键服务**:
- `AuditMasker` - 敏感信息脱敏

**复杂度**: 🟡 中等

---

### 3. 系统故障日志 (System Logs)
**路径**: `/dashboard/audit/logs/system/`
**权限**: `module.audit.logs.system`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 错误日志列表 | 页面 | P1 | 分页表格 |
| 堆栈追踪 | Modal | P1 | 详情展示 |
| 故障标记 | API | P2 | Patch 功能 |

**关键表**:
- `log_error` - 错误日志表

**复杂度**: 🟢 低

---

## 日志架构

```
四表架构
├── log_error    - 系统错误 (Exception)
├── log_audit    - 数据审计 (谁/何时/改了什么)
├── log_business - 业务操作 (用户行为)
└── log_access   - 访问日志 (页面浏览)
```

**日志字段标准**:
| 字段 | 说明 |
|------|------|
| user | 操作用户 |
| action | 操作类型 (VIEW/MODIFY/DELETE/...) |
| target | 操作对象 |
| details | 详细信息 (脱敏后) |
| status | 状态 (SUCCESS/FAIL_PERM/FAIL_SYS) |
| created_at | 创建时间 |

---

## API 端点清单

| Method | Path | 功能 | 优先级 |
|--------|------|------|--------|
| GET | `/audit/` | Hub 页面 | P0 |
| GET | `/audit/logs/business/` | 业务日志 | P0 |
| GET | `/audit/logs/business/api/` | 日志数据 | P0 |
| GET | `/audit/logs/infra/` | 审计日志 | P0 |
| GET | `/audit/logs/infra/api/` | 日志数据 | P0 |
| GET | `/audit/logs/system/` | 系统日志 | P1 |
| POST | `/audit/logs/purge/` | 清洗日志 | P2 |
| POST | `/audit/god_mode/toggle/` | 上帝模式 | P1 |

---

## 迁移注意事项

### 复杂度评估: 🟢 低

| 风险点 | 说明 | 解决方案 |
|--------|------|----------|
| 脱敏逻辑 | 需要移植 | 重写 AuditMasker |
| 日志写入 | 全局中间件 | NestJS Interceptor |

### 建议迁移顺序
1. 先定义日志表结构
2. 实现日志写入中间件
3. 最后实现日志查看 UI

---

*Last Updated: 2026-02-04*
