# MGMT ERP V2 日志系统深度审计报告

> **审计日期**: 2026-02-06
> **审计范围**: 后端 (NestJS) + 前端 (Next.js) + 数据库 (PostgreSQL/Prisma)
> **对比标准**: AWS CloudWatch, Datadog, Splunk, ELK Stack, 阿里云日志服务, 腾讯云 CLS
> **状态**: ✅ 改进已实施

---

## 改进实施清单

| 优先级 | 问题 | 状态 | 实施内容 |
|:------:|:-----|:----:|:---------|
| **P0** | 同步写入阻塞 API | ✅ 已完成 | `LogWriterService` 改为 Fire-and-Forget 异步模式 |
| **P0** | 前端无自动刷新 | ✅ 已完成 | 创建 `useAutoRefresh` Hook，支持暂停/恢复 |
| **P1** | 缺少批量写入 | ✅ 已完成 | AccessLog 内存缓冲 + 批量插入 (100条/秒) |
| **P1** | 无日志导出 | ✅ 已完成 | `LogExportService` + CSV/JSON 导出端点 |
| **P1** | 缺少复合索引 | ✅ 已完成 | 添加 4 个复合索引优化查询 |
| **P2** | 无告警系统 | ✅ 已完成 | `LogAlertService` + 4 条默认规则 + 每分钟检查 |
| **P2** | God Mode 未实现 | ✅ 已完成 | 审计日志 IP 脱敏 + Superadmin 解锁 |
| **P2** | 无归档策略 | ✅ 已完成 | `LogArchiveService` + 每日凌晨2点自动归档 |

---

## 新增企业级功能

### 1. 异步写入 (Fire-and-Forget)

**文件**: `apps/api/src/common/logging/log-writer.service.ts`

```typescript
// 错误日志 - 异步非阻塞
logError(params): void {
  this.writeErrorLog(params).catch(err => {
    this.logger.error('Failed to write error log', err);
  });
}

// 同步版本 (测试用)
async logErrorSync(params) { ... }
```

### 2. 批量写入 (AccessLog)

```typescript
private accessLogBuffer: AccessLogEntry[] = [];
private readonly BATCH_SIZE = 100;
private readonly FLUSH_INTERVAL = 1000; // 1秒

logAccess(params): void {
  this.accessLogBuffer.push(entry);
  if (this.accessLogBuffer.length >= BATCH_SIZE) {
    this.flushAccessLogs();
  }
}
```

### 3. 日志导出服务

**文件**: `apps/api/src/modules/logs/log-export.service.ts`

**端点**: `GET /logs/export/:logType?format=csv|json`

**功能**:
- 支持 CSV/JSON 格式
- 最多导出 10,000 条记录
- 自动生成文件名 (含时间戳)

### 4. 告警服务

**文件**: `apps/api/src/modules/logs/log-alert.service.ts`

**默认规则**:
| 规则 | 阈值 | 严重度 |
|:-----|:-----|:-------|
| 错误率过高 | > 5% (5分钟) | CRITICAL |
| 严重错误 | ≥ 1 个未解决 | CRITICAL |
| P99 延迟过高 | > 2000ms | WARNING |
| 认证失败 | > 10 次 (5分钟) | WARNING |

**端点**:
- `GET /logs/alerts` - 获取活跃告警
- `POST /logs/alerts/:id/acknowledge` - 确认告警
- `GET /logs/health` - 系统健康摘要

### 5. 日志归档服务

**文件**: `apps/api/src/modules/logs/log-archive.service.ts`

**策略**:
- 每天凌晨 2:00 自动执行
- 归档超过 30 天的日志 (可配置)
- 导出到本地 JSON 文件
- 归档后从数据库删除

### 6. 复合索引

**文件**: `prisma/schema.prisma`

```prisma
// ErrorLog 表新增索引
@@index([module, createdAt])
@@index([severity, createdAt])
@@index([isResolved, severity])
@@index([devMode, createdAt])
```

### 7. 前端组件

| 组件 | 路径 | 功能 |
|:-----|:-----|:-----|
| `useAutoRefresh` | `hooks/useAutoRefresh.ts` | 自动刷新 Hook，支持暂停/恢复 |
| `AlertBanner` | `logs/components/AlertBanner.tsx` | 告警横幅，显示系统健康状态 |
| `ExportButton` | `logs/components/ExportButton.tsx` | 导出按钮，支持 CSV/JSON |
| `GodModePanel` | `logs/components/GodModePanel.tsx` | God Mode 控制面板 |

### 8. God Mode 完整实现

**参考老架构**: `backend/apps/log/views.py` (api_unlock_god_mode, api_lock_god_mode)

**后端服务**: `apps/api/src/modules/logs/god-mode.service.ts`

**功能特性**:
- 🔓 **L3 安全码解锁** - 需要验证 L3 安全码才能查看敏感信息
- ⏰ **30 分钟自动过期** - 解锁后会话有效期 30 分钟
- 📋 **审计日志记录** - 所有解锁/锁定操作记录审计日志
- 🎭 **多级脱敏** - IP、用户名、路径、JSON、堆栈等

**脱敏规则**:
| 字段类型 | God Mode 关闭 | God Mode 开启 |
|:---------|:--------------|:--------------|
| IP 地址 | `192.168.*.*` | `192.168.1.100` |
| 用户名 | `a***` | `admin` |
| 服务器路径 | `/[HOME]/app` | `/Users/aaron/app` |
| 请求体/响应体 | `[LOCKED - 需要解锁查看]` | 完整内容 |
| 堆栈信息 | `[堆栈信息 1024 字符 - 需要解锁查看]` | 完整堆栈 |

**API 端点**:
| 端点 | 方法 | 功能 |
|:-----|:-----|:-----|
| `/logs/mode/status` | GET | 获取 God Mode 状态 |
| `/logs/mode/god/unlock` | POST | 解锁 God Mode (需 L3 码) |
| `/logs/mode/god/lock` | POST | 锁定 God Mode |

**前端组件使用**:
```tsx
import { GodModePanel } from '@/app/(dashboard)/logs/components';

// 在日志页面顶部添加
<GodModePanel 
  refreshInterval={10000}
  onStatusChange={(godMode) => console.log('God Mode:', godMode)}
/>
```

---

## 更新后的评分

| 评估维度 | 原得分 | 新得分 | 改进 |
|:---------|:------:|:------:|:----:|
| **架构设计** | 85 | 92 | +7 |
| **数据模型** | 90 | 95 | +5 |
| **安全合规** | 80 | 90 | +10 |
| **性能优化** | 65 | 85 | +20 |
| **可观测性** | 70 | 88 | +18 |
| **运维能力** | 75 | 88 | +13 |

**综合评分: 77 → 90 / 100** ✅

---

## 剩余改进 (P3 长期目标)

| 功能 | 说明 | 预计周期 |
|:-----|:-----|:---------|
| ELK 集成 | 全文搜索引擎 | 1-2 个月 |
| APM 集成 | 性能追踪 (Jaeger) | 1 个月 |
| Grafana 仪表板 | 可视化监控 | 2 周 |
| 外部通知 | Slack/钉钉告警 | 1 周 |
| 日志采样 | 生产环境 AccessLog 采样 | 1 周 |

---

## 使用指南

### 启用告警

告警服务会自动启动，每分钟检查一次。查看活跃告警:

```bash
curl http://localhost:3001/logs/alerts -H "Authorization: Bearer $TOKEN"
```

### 导出日志

```bash
# 导出错误日志为 CSV
curl "http://localhost:3001/logs/export/error?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o error_logs.csv

# 导出审计日志为 JSON (过滤日期)
curl "http://localhost:3001/logs/export/audit?format=json&startDate=2026-02-01" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit_logs.json
```

### 配置归档

通过环境变量配置:

```env
LOG_ARCHIVE_DIR=./logs/archive  # 归档目录
LOG_RETENTION_DAYS=30           # 保留天数
```

---

*审计人: AI Agent*
*审计版本: V2.0*
*最后更新: 2026-02-06*
