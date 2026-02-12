# Phase 2 Design — Logs Module (Complete)

> **Status:** ✅ COMPLETE (包含 Phase 2.1)
> **Date:** 2026-02-12
> **Fixes:** LOG-1 ✅ LOG-2 ✅ LOG-3 ✅ LOG-4 ✅ LOG-5 ✅

---

## 验证盖章

| 检查项 | 状态 |
|--------|:----:|
| 编译通过 (`compileKotlin`) | ✅ |
| 全量测试 48/48 PASS (100%) | ✅ |
| 5/5 审计问题 V3 修复验证 | ✅ |
| Prisma camelCase 列名兼容 | ✅ |
| JPA Specification 动态过滤 | ✅ |
| GodMode Redis 会话 (LOG-3) | ✅ |
| Archive 流式处理 (LOG-4) | ✅ |

---

## 文件结构

```
domain/log/
    LogEntities.kt          ← UPDATED: @JdbcTypeCode JSON + Transient for camelCase cols
    LogRepositories.kt      ← NEW: JPA repos + JpaSpecificationExecutor + 原生 SQL

modules/logs/
    LogQueryService.kt      ← NEW: 查询 + 统计 (修复 LOG-1, LOG-2, LOG-5)
    LogController.kt        ← NEW: REST API (19 endpoints)
    LogAlertService.kt      ← NEW: 告警规则引擎 + @Scheduled
    GodModeService.kt       ← NEW: 脱敏 + Redis 会话 (修复 LOG-3)
    LogArchiveService.kt    ← NEW: 流式归档 + 批量删除 (修复 LOG-4)
    LogExportService.kt     ← NEW: CSV/JSON 导出 + GodMode 脱敏
    dto/
        LogDtos.kt          ← NEW: 请求/响应 DTO + mapper extensions
```

## 审计问题修复映射 — 5/5 ✅

| ID | 问题 | V3 修复 | 文件 | 测试 |
|----|------|---------|------|:----:|
| LOG-1 | getErrorTrend N+1 查询 | DATE_TRUNC + GROUP BY 一次查询 | LogRepositories.kt | ✅ |
| LOG-2 | getOverviewStats 10 条 COUNT | FILTER 合并为 1 条 SQL | LogQueryService.kt | ✅ |
| LOG-3 | GodMode 会话存内存 Map | Redis + TTL 自动过期 | GodModeService.kt | ✅ |
| LOG-4 | Archive SELECT * 全表到内存 | 分页游标 + 流式写入 + 原生SQL批删 | LogArchiveService.kt | ✅ |
| LOG-5 | P99 取全表到内存 | PERCENTILE_CONT SQL | LogRepositories.kt | ✅ |

## LOG-3 修复细节

**V2 问题:** `private sessions = new Map<string, GodModeSession>()` — 进程重启丢失, 不支持多实例

**V3 修复:**
- Redis key: `godmode:{userId}` + TTL 30 分钟
- 利用已有的 `StringRedisTemplate` (SessionService 同一实例)
- 自动过期, 无需定时清理任务
- 完整保留 V2 的 6 种脱敏函数 (IP/User/Path/Strict/JSON/Traceback)

## LOG-4 修复细节

**V2 问题:** `await this.prisma.errorLog.findMany({ where: { createdAt: { lt: cutoff } } })` — 全表加载

**V3 修复:**
- 分页游标读取: 1000 条/批
- BufferedWriter 流式写入 JSONL 文件
- `entityManager.clear()` 每批次清理一级缓存
- 原生 SQL `DELETE FROM {table} WHERE created_at < :cutoff` 批量删除
- 内存占用: O(1000) 替代 O(N)

## 集成测试覆盖

| 模块 | 测试文件 | 测试数 | 覆盖 |
|------|----------|:------:|------|
| Auth | AuthIntegrationTest | 9 | login ✓ refresh ✓ /me ✓ logout ✓ JWT slim ✓ 401 ✓ |
| Users | UserIntegrationTest | 10 | CRUD ✓ search ✓ lock/unlock ✓ 401 ✓ 404 ✓ |
| Roles | RoleIntegrationTest | 9 | CRUD ✓ boundaries ✓ delete ✓ |
| Logs Core | LogIntegrationTest | 11 | overview ✓ trend ✓ errors ✓ access ✓ audit ✓ business ✓ health ✓ alerts ✓ |
| Logs Phase2.1 | LogPhase2IntegrationTest | 8 | godmode cycle ✓ archive stats ✓ export json/csv ✓ auth ✓ |
| Boot | MgmtV3ApplicationTests | 1 | contextLoads ✓ |
| **总计** | **6 文件** | **48** | **100% PASS** |
