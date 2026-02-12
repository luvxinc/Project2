# V3 迁移计划 — V2 → V3 分阶段执行路线

> **V2 到 V3 的迁移是一个系统性工程。本文档定义分阶段执行路径。**
> **核心原则: 业务零中断, 前端无感知, 数据零丢失。**
> **V1 深度分析**: `reference/v1-deep-dive.md` (30+ MySQL 表全景, V1→V3 迁移时必读)

---

## 1. 迁移原则

| 原则 | 说明 |
|------|------|
| **契约驱动** | 前后端通过 OpenAPI 3.0 契约解耦 — 后端换了, 前端无感 |
| **并行运行** | V2 NestJS 和 V3 Spring Boot 可以并行运行一段时间 |
| **模块逐个迁移** | 不做大爆炸式迁移, 一个模块一个模块切 |
| **数据库共用** | V2 和 V3 共用同一个 PostgreSQL, Prisma schema 迁移到 Flyway |
| **灰度切换** | API Gateway 做流量切换 — 先切 10% → 50% → 100% |
| **回滚能力** | 每个阶段都可以回滚到 V2 |

---

## 2. 迁移五阶段

```
Phase 0                Phase 1              Phase 2              Phase 3              Phase 4
基础设施准备            核心后端迁移          数据层扩展            辅助模块迁移          V2 退役
─────────────          ─────────────        ─────────────        ─────────────        ─────────
[2-3 周]               [4-6 周]             [3-4 周]             [4-6 周]             [2 周]

Docker Compose         Auth + Users         Kafka 集成           Purchase             停掉 NestJS
Kotlin 项目骨架        Products             OpenSearch           Sales                删除 V2 代码
Flyway 初始化          VMA (核心)           ClickHouse           Inventory            清理 Prisma
CI/CD 基础             Logs (审计)          Redis 增强           Finance              更新文档
                       OpenAPI 契约                              DB Admin
                       API Gateway                               批处理 (Batch)
```

---

## 3. Phase 0 — 基础设施准备 (2-3 周)

### 目标: 搭建 V3 项目骨架, 不影响 V2 运行

| 任务 | 详情 | 交付物 |
|------|------|--------|
| 1. 创建 Kotlin + Spring Boot 项目 | `apps/api-v3/` 目录, Gradle 构建 | 可启动的 Spring Boot 应用 |
| 2. 配置 Flyway | 从 Prisma schema 导出 SQL, 作为 V1 基线 | `V1__baseline.sql` |
| 3. 配置 Spring Security | JWT 验证 (兼容 V2 Token 格式) | 可以验证 V2 发出的 Token |
| 4. 配置 OpenAPI springdoc | 自动生成 API 文档 | `openapi.json` |
| 5. docker-compose 本地环境 | PG + Redis + Kafka + OpenSearch | 一键启动 |
| 6. CI 管道 | GitHub Actions — build + test | 自动化构建 |
| 7. ArchUnit 测试 | DDD 分层约束验证 | 架构看门狗 |

### 关键决策

```
Prisma Schema → Flyway 基线的方式:

1. 使用 prisma db pull 获取当前 PG schema
2. 导出为 raw SQL (pg_dump --schema-only)
3. 作为 Flyway V1__baseline.sql
4. 设置 Flyway baselineOnMigrate=true
5. 后续所有 DDL 变更走 Flyway V2, V3...
```

---

## 4. Phase 1 — 核心后端迁移 (4-6 周)

### 目标: 将核心模块从 NestJS 迁移到 Spring Boot

### 迁移顺序

| 顺序 | 模块 | 原因 | 复杂度 |
|------|------|------|--------|
| 1 | **Auth** | 基础依赖, 所有模块需要认证 | ★★☆ |
| 2 | **Users** | Auth 依赖 Users, RBAC 核心 | ★★★ |
| 3 | **Logs** | 审计系统, 所有模块的横切关注点 | ★★☆ |
| 4 | **Products** | 核心业务实体, 相对独立 | ★★★ |
| 5 | **VMA** | 核心业务模块 (员工/培训/库存) | ★★★★ |

### 每个模块的迁移步骤

```
1. 分析 V2 NestJS Service/Controller/DTO
    ↓
2. 创建 V3 Domain Model (Kotlin data class)
    ↓
3. 创建 V3 JPA Entity + Repository
    ↓
4. 创建 V3 UseCase + DTO
    ↓
5. 创建 V3 Controller (保持相同 URL 路径)
    ↓
6. 写测试 (单元 + 集成)
    ↓
7. 验证 OpenAPI Spec 与 V2 一致
    ↓
8. API Gateway 流量切换 (V2 → V3)
    ↓
9. 监控 48 小时无异常 → 确认切换
```

### API Gateway 流量切换

```
Phase 1 初期:
  /api/v1/* → V2 NestJS (100%)

Phase 1 中期 (Auth/Users 迁移完成后):
  /api/v1/auth/*     → V3 Spring Boot (100%)
  /api/v1/users/*    → V3 Spring Boot (100%)
  /api/v1/*          → V2 NestJS (剩余)

Phase 1 完成:
  /api/v1/auth/*     → V3
  /api/v1/users/*    → V3
  /api/v1/products/* → V3
  /api/v1/vma/*      → V3
  /api/v1/logs/*     → V3
  其余               → V2
```

---

## 5. Phase 2 — 数据层扩展 (3-4 周)

### 目标: 引入 Kafka + OpenSearch + ClickHouse

| 任务 | 详情 |
|------|------|
| Kafka 部署 | docker-compose (dev) + K8s (prod) |
| Kafka Topic 创建 | erp.inventory.events, erp.purchase.events, ... |
| OpenSearch 部署 | 本地开发 + 生产托管 |
| 索引同步 | PG → Kafka → OpenSearch (products, orders) |
| ClickHouse 部署 | 本地开发 + 生产 |
| OLAP 同步 | PG → Kafka → ClickHouse (sales, inventory) |
| 搜索 API | V3 模块接入 OpenSearch 全文搜索 |
| 报表 API | V3 模块接入 ClickHouse 聚合查询 |

---

## 6. Phase 3 — 辅助模块迁移 (4-6 周)

### 目标: 迁移剩余业务模块

| 顺序 | 模块 | 复杂度 |
|------|------|--------|
| 1 | **Purchase** (供应商/PO/发货/收货) | ★★★★★ |
| 2 | **Sales** (交易/ETL/FIFO) | ★★★★★ |
| 3 | **Inventory** (FIFO 层/库存动态) | ★★★★ |
| 4 | **Finance** (付款/预付/对账) | ★★★★ |
| 5 | **DB Admin** (备份/清理) | ★★☆ |

### Spring Batch 集成 (百万级 ETL)

```
V2 的 Sales ETL (自研, CSV 逐行处理)
    ↓ 迁移到
V3 的 Spring Batch (百万行 chunk-based 处理)
    - ItemReader: FlatFileItemReader (CSV)
    - ItemProcessor: FIFO 成本计算
    - ItemWriter: JPA batch insert + Kafka event
    - 进度: Prometheus metric 实时报告
```

---

## 7. Phase 4 — V2 退役 (2 周)

### 目标: 安全停掉 V2 NestJS

| 步骤 | 详情 | 回滚点 |
|------|------|--------|
| 1 | API Gateway 100% 流量切到 V3 | 可切回 V2 |
| 2 | 监控 7 天无异常 | 可切回 V2 |
| 3 | 停止 V2 NestJS 进程 | 保留容器, 可重启 |
| 4 | 等待 14 天冷却期 | 可重启 V2 |
| 5 | 删除 V2 代码 (`apps/api/`) | ❌ 不可逆 |
| 6 | 删除 Prisma schema | ❌ 不可逆 (Flyway 已接管) |
| 7 | 更新文档和 agent skills | — |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| API 契约不一致 | 前端崩溃 | Contract Testing (每次 CI 自动验证) |
| 数据库 schema 不兼容 | 数据丢失 | Flyway 迁移 + 备份验证 |
| 性能回退 | 用户体验 | 压力测试 + 灰度发布 |
| Token 格式不兼容 | 用户掉线 | V3 兼容 V2 Token 格式 |
| 团队学习成本 | 开发速度 | Kotlin 语法与 TypeScript 相似, 学习曲线低 |
| Kafka 数据丢失 | 事件遗漏 | At-least-once + 幂等 Consumer |

---

## 9. 时间线总览

```
        Phase 0          Phase 1          Phase 2          Phase 3          Phase 4
      基础设施准备       核心后端迁移       数据层扩展        辅助模块迁移       V2 退役
    ├──── 2-3 周 ────┼──── 4-6 周 ────┼──── 3-4 周 ────┼──── 4-6 周 ────┼── 2 周 ──┤
    │                │                │                │                │          │
    │ Spring Boot    │ Auth → Users   │ Kafka          │ Purchase       │ 停 V2    │
    │ Flyway         │ Products       │ OpenSearch     │ Sales          │ 删代码   │
    │ CI/CD          │ VMA            │ ClickHouse     │ Inventory      │ 更文档   │
    │ Docker         │ Logs           │ 报表/搜索 API  │ Finance        │          │
    │                │ API Gateway    │                │ Batch ETL      │          │
    │                │                │                │                │          │
    ▼                ▼                ▼                ▼                ▼          ▼
   总计: 约 15-21 周 (4-5 个月)
```

---

## 10. 前端迁移清单 (最小变更)

由于前后端通过 OpenAPI 解耦, 前端变更极小:

| 变更 | 说明 | 影响 |
|------|------|------|
| API Client 重生成 | 后端 OpenAPI spec 更新 → 重新生成 TS Client | 自动化 |
| 环境变量 | API URL 可能变 (如果用 Gateway 则无感) | 配置文件 |
| 错误码 | V3 错误码格式与 V2 保持一致 | 无 |
| 登录流程 | 如果上 OIDC SSO, 需要改登录页 | 一个页面 |
| AG Grid 引入 | 报表页面逐步使用 AG Grid | 渐进式 |
| ECharts 引入 | Dashboard 图表 | 渐进式 |

> **前端迁移最大的变更就是登录页 (如果上 OIDC)。其余几乎无感。**

---

## 8. 关键迁移约束 (生产血泪教训)

> **来源: V2 生产系统实战中发现的陷阱, 迁移到 V3 时务必严格遵循。**

### 8.1 FIFO 原子性约束

| 约束 ID | 描述 | 严重性 |
|---------|------|--------|
| **FIFO-001** | 流水创建和分配写入必须在同一事务中完成 | 🔴 Critical |
| **FIFO-002** | FIFO 分配异常必须抛出，禁止静默返回空结果 | 🔴 Critical |
| **FIFO-003** | `fifo_transactions` 与 `fifo_allocations` 必须同步审计 | 🔴 Critical |
| **FIFO-004** | `INIT-*` / `INT-*` 层级禁止被清理逻辑删除 | 🔴 Critical |

### 8.2 幂等性陷阱

```
⚠️ 若第一遍同步时分配失败 (产生了流水但没产生 Allocation),
由于流水已存在, 后续重跑时会被跳过, 导致该订单永久未分配成本。
✅ 检查时必须同时验证 fifo_allocations 是否存在对应记录。
```

### 8.3 库存恢复缺口

```
⚠️ 删除销售记录和分配后, 若未恢复 INIT 层的 qty_remaining,
后续 ETL 会因找不到 "可用余额" 而分配失败。
✅ 重置时必须执行: UPDATE fifo_layers SET qty_remaining = qty_in WHERE source_type = 'INIT'
```

### 8.4 数据验证基准

迁移后必须验证:

| 校验项 | 预期值 |
|--------|--------|
| INIT 层级数 | 244 |
| FIFO 分配非空 | > 0 |
| 采购层 100% 有落地价记录 | 100% |
| 流水与分配数量一致 | 匹配 |

### 8.5 成本查询优先级

```kotlin
// V3 中必须遵循此优先级:
val cost = landedPrice ?: fifoLayer.unitCost
// 1. 最高优先: landed_prices 表的实时财务成本
// 2. 回退优先: fifo_layers.unit_cost (入库初始成本)
```

### 8.6 代码锁定 (STRICT LOCK)

以下 V1/V2 逻辑已锁定, 迁移到 V3 时必须 1:1 复制:

| 模块 | 原始文件 | 风险 |
|------|----------|------|
| FIFO 扣减 | `sales_sync.py` | 🔴 财务核心 |
| ETL 转换 | `transformer.py` | 🔴 数据完整性 |
| 落地价计算 | `calculate_landed_prices` | 🔴 成本计算 |

---

*Version: 3.0.0*
*Created: 2026-02-11*
