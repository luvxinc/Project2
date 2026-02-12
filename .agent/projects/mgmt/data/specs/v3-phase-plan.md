# V3 Phase Execution Plan — 迭代审计驱动

> **核心原则:** 每个 Phase = 审计 V2 → 设计 V3 → 实施 → 验证卓越
> **Date:** 2026-02-12 (Updated)
> **Status:** IN PROGRESS — Phase 3 VMA

---

## CTO 声明

```
我确认理解并接受以下原则:

1. 迁移 ≠ 翻译  — 不是把 TypeScript 换成 Kotlin, 是重新思考每一行代码
2. 审计驱动    — 每个 Phase 开始前, 先审计对应 V2 模块的源码
3. 卓越标准    — 不仅要"能跑", 要在算法、解析、效率、可维护性上全面优秀
4. 审计输出    — 每个 Phase 产出审计报告, 记录发现的问题和V3的改进
5. 不带病上线  — 审计发现的问题必须在该 Phase 修复, 不允许技术债带入 V3
```

---

## Phase 循环模型

```
每个 Phase 的执行流程:

┌─────────────────────────────────────────────────┐
│  Step 1: AUDIT (审计 V2 源码)                     │
│  ├── 逐文件审计对应模块的 V2 代码                    │
│  ├── 审计维度: 算法效率、数据结构、错误处理、          │
│  │            安全性、可测试性、数据库查询效率          │
│  ├── 输出: Phase Audit Report                     │
│  └── 标记: KEEP / IMPROVE / REWRITE / DROP        │
│                                                   │
│  Step 2: DESIGN (V3 设计)                         │
│  ├── 针对审计发现, 设计V3方案                        │
│  ├── 数据库 schema 变更 (Flyway SQL)               │
│  ├── API 契约定义 (OpenAPI)                        │
│  └── 输出: Phase Design Doc                       │
│                                                   │
│  Step 3: BUILD (实施)                              │
│  ├── Kotlin/Spring Boot 实现                       │
│  ├── 单元测试 + 集成测试                             │
│  └── 前端对接 + React Query 集成                    │
│                                                   │
│  Step 4: VERIFY (验证卓越)                          │
│  ├── V2 vs V3 对比运行 (关键逻辑)                    │
│  ├── 性能基准测试 (响应时间, 内存, DB 调用次数)        │
│  ├── 代码审查 (CTO review)                         │
│  └── 输出: Phase Verification Report              │
│                                                   │
│  Step 5: GATE (质量门禁)                            │
│  ├── 审计问题全部解决? ✅/❌                          │
│  ├── 测试全部通过? ✅/❌                              │
│  ├── 性能优于 V2? ✅/❌                              │
│  └── 全部 ✅ → 进入下一 Phase                       │
└─────────────────────────────────────────────────┘
```

---

## Phase 0: 基础骨架 + 全局审计 (2-3 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 审计维度 |
|----------|---------|----------|
| 项目结构 | `apps/api/src/` 全貌 | 模块组织、循环依赖、import 深度 |
| Prisma 配置 | `prisma/schema/*.prisma` (13 files) | Schema 设计合理性 (已完成, 见 deep-quality-audit) |
| 公共基础设施 | `common/` (25 files) | Guards, Interceptors, Middleware, Prisma Service |
| 环境配置 | `.env`, `nest-cli.json`, `tsconfig` | 配置管理、密钥安全 |
| 依赖分析 | `package.json` | 不必要的依赖、版本安全 |

**已完成的审计:**
- ✅ 数据库 Schema 审计 (7 个 S 问题) → `audits/v3-deep-quality-audit.md`
- ✅ 算法效率审计 (7 个 A 问题) → `audits/v3-deep-quality-audit.md`

**本 Phase 补充审计:**
- [ ] 公共基础设施代码 (Guards, Interceptors, Error handling)
- [ ] Prisma Service 封装的效率和连接池管理
- [ ] Redis 集成方式和缓存策略

### Step 2: DESIGN
- Spring Boot 3.4 多模块项目骨架
- Flyway V001 baseline
- JPA Entity 映射 (融入 S1-S7 改进)
- 统一响应格式 + GlobalExceptionHandler
- Spring Security + JWT (精简 token)

### Step 3: BUILD
- `./gradlew build` 通过
- Flyway 成功执行 V001-V011
- JPA Entity 映射验证 (与现有数据兼容)
- Redis 连接 + 基础缓存

### Step 4: VERIFY
- [ ] 26 张表全部映射成功, 数据可读取
- [ ] Schema 变更 (S1-S7) 执行后数据完整
- [ ] Spring Boot 启动时间 < 5s
- [ ] Health check 端点正常

### Step 5: GATE
- [ ] 审计报告完成
- [ ] 骨架编译通过
- [ ] 所有 JPA Entity 测试通过
- [ ] Flyway 迁移全部成功

**交付物:**
```
audits/phase0-infrastructure-audit.md   ← 基础设施审计报告
specs/phase0-design.md                  ← V3 骨架设计文档
```

---

## Phase 1: Auth + Users + Roles (2 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| AuthService | `auth/auth.service.ts` | JWT 生成逻辑、Token 刷新策略、Session 管理 |
| AuthController | `auth/auth.controller.ts` | 路由设计、参数验证、错误处理 |
| JwtStrategy | `auth/strategies/*.ts` | Token 解析、过期处理、Guard 链 |
| SecurityService | `auth/security-*.ts` | L1-L4 验证、Redis lockout、暴力破解防护 |
| UsersService | `users/users.service.ts` | CRUD 效率、权限检查、数据验证 |
| UsersController | `users/users.controller.ts` | RESTful 设计、DTO 验证 |
| RolesService | `roles/roles.service.ts` | 角色模板、权限边界 |
| PermissionsGuard | `common/guards/permissions.guard.ts` | 运行时权限检查算法、bypass 逻辑 |

**审计重点问题:**
```
AUTH-1: JWT Token 包含完整 permissions 对象 (几 KB)
        → V3: 精简 Token, 权限存 Redis
        
AUTH-2: 安全码验证在 body 传递
        → V3: X-Security-Code header
        
AUTH-3: User.roles 是 String[] 无外键
        → V3: user_roles 关联表 (S3)
        
AUTH-4: PermissionsGuard 每次请求解析 Token 中的 permissions
        → V3: Redis 缓存查询, O(1)
        
AUTH-5: RefreshToken 清理策略? 有无定时清理过期 Token?
        → 审计时确认
        
AUTH-6: 密码 hash 算法是否使用 bcrypt + 合理 cost factor?
        → 审计时确认
```

### Step 2: DESIGN
- AuthController + SecurityConfig (FilterChain)
- JwtTokenProvider (sign + verify + V2 兼容)
- SecurityCodeService (L1-L4 + Redis lockout)
- @SecurityLevel AOP 注解
- UserController + RoleController
- user_roles 关联表 (Flyway V004)

### Step 3: BUILD
- 后端: Auth/Users/Roles 全部 Kotlin 实现
- 前端: `lib/api/client.ts` 更新响应格式
- 前端: `lib/api/users.ts` 安全码改 header
- 前端: 登录流程适配新 JWT
- Nginx: `/api/v1/auth/*`, `/users/*`, `/roles/*` → :8080

### Step 4: VERIFY
- [ ] 登录/登出/刷新 Token 功能正常
- [ ] L1-L4 安全码验证正常 (含 Redis lockout)
- [ ] Token 大小: V2 (~2KB) → V3 (~200B) ✅
- [ ] 权限检查响应时间: V2 (解析 Token) → V3 (Redis GET) ✅
- [ ] 所有用户页面功能不变
- [ ] V2 的 Token 仍然能被 V3 接受 (过渡期)

### Step 5: GATE
- [ ] AUTH-1 到 AUTH-6 全部解决
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试 (Testcontainers) 通过
- [ ] 前端 5 个用户相关页面全部验证

**交付物:**
```
audits/phase1-auth-users-audit.md       ← Auth/Users 源码审计
reports/phase1-verification.md          ← 性能对比 + 功能验证
```

---

## Phase 2: Logs (1 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| LogWriterService | `logs/log-writer.service.ts` | 异步写入策略、缓冲机制、错误处理 |
| AuditLogService | `logs/audit-log.service.ts` | 日志结构、字段完整性 |
| AlertService | `logs/alert.service.ts` | Gmail SMTP 配置、报警阈值、频率限制 |
| GodMode 查询 | `logs/god-mode.service.ts` | SQL 注入防护、查询限制 |
| 日志 Controller | `logs/logs.controller.ts` | 分页、过滤、导出 |

**审计重点问题:**
```
LOG-1: audit_logs + business_logs 61% 字段重叠 (S2)
       → V3: 合并为 operation_logs

LOG-2: error_logs 35 列, 大部分 NULL (S1)
       → V3: 压缩到 15 列 + JSONB

LOG-3: 日志表 50+ 单列索引 → 写入性能 (S7)
       → V3: 合并为 25 个复合索引

LOG-4: LogWriter 的 @Async 缓冲策略是否高效?
       buffer size? flush 频率? 背压处理?
       → 审计时确认

LOG-5: GodMode 查询是否有 SQL 注入风险?
       → 审计时确认

LOG-6: AlertService 是否有频率限制 (防止报警风暴)?
       → 审计时确认
```

### Step 2: DESIGN
- OperationLogService (合并 audit + business)
- 压缩 ErrorLog (15 列 + JSONB)
- AsyncLogWriter (Spring @Async + 批量 flush)
- AlertService (频率限制 + Gmail)
- GodMode 端点 (参数化查询, 防注入)

### Step 3: BUILD
- 后端: Logs 模块 Kotlin 实现
- Flyway V002 + V003 执行 (logs 合并 + 压缩)
- 前端: 验证 4 类日志页面 + GodMode

### Step 4: VERIFY
- [ ] 日志写入吞吐量: V2 vs V3 (相同负载)
- [ ] 索引精简后查询性能不变或更好
- [ ] operation_logs 合并后 V2 旧查询能走 VIEW 兼容
- [ ] AlertService 频率限制生效

### Step 5: GATE
- [ ] LOG-1 到 LOG-6 全部解决
- [ ] 4 类日志前端页面验证通过
- [ ] 写入性能 ≥ V2

**交付物:**
```
audits/phase2-logs-audit.md             ← Logs 源码审计
reports/phase2-verification.md          ← 性能对比
```

---

## Phase 3: Products (1 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| ProductsService | `products/products.service.ts` | CRUD 效率、批量 COGS 更新算法 |
| BarcodeService | `products/barcode.service.ts` | PDF 生成性能、并发处理 |
| ProductsController | `products/products.controller.ts` | 分页、搜索、排序 |
| Products Prisma | `prisma/schema/products.prisma` | 索引、数据类型 |

**审计重点问题:**
```
PROD-1: Products 表没有全文搜索索引
        → V3: 评估 GIN trigram 索引 vs PostgreSQL FTS

PROD-2: 批量 COGS 更新是逐条 UPDATE 还是批量?
        → 审计时确认

PROD-3: Barcode PDF 生成是同步阻塞还是异步?
        → 审计时确认

PROD-4: Decimal 类型精度是否合理 (10,2)?
        国际贸易需要更多小数位?
        → 审计时确认
```

### Step 2-5: (BUILD → VERIFY → GATE)
- 后端 + 前端 + 验证 (标准流程)

**交付物:**
```
audits/phase3-products-audit.md
reports/phase3-verification.md
```

---

## Phase 4: VMA — Employees + Departments + Duties (2 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| VmaEmployeeService | `vma/vma-employees.service.ts` | 查询效率、N+1 问题 |
| VmaEmployeeController | `vma/vma-employees.controller.ts` | RESTful 设计 |
| Department/Duty 逻辑 | `vma/vma-departments.service.ts` | 多对多关系管理 |
| Employee-Department 分配 | `vma/vma-employee-dept.service.ts` | 历史追踪、时间维度查询 |

**审计重点问题:**
```
VMA-EMP-1: VmaDepartment 混合部门+职责 (S4)
           → V3: 拆分为 departments + duties

VMA-EMP-2: Employee 查询是否有 N+1?
           (include departmentAssignments → department → sopRequirements)
           → V3: JPA FetchGraph / 批量加载

VMA-EMP-3: 分配历史查询 (assignedAt / removedAt) 是否有索引覆盖?
           → 审计时确认

VMA-EMP-4: 员工搜索 (employeeNo, firstName, lastName) 是否走索引?
           → 审计时确认
```

### Step 2-5: (标准流程)

**交付物:**
```
audits/phase4-vma-employees-audit.md
reports/phase4-verification.md
```

---

## Phase 5: VMA — Training SOP + Records + SmartFill (2 周) ⚠️ 关键

### Step 1: AUDIT

| 审计对象 | V2 文件 | 行数 | 重点 |
|----------|---------|------|------|
| **SmartFillService** | `smart-fill.service.ts` | **800** | 算法效率 (A1, A3)、正确性 |
| TrainingRecordService | `training-record.service.ts` | **701** | 全表加载 (A2)、Roadmap (A4) |
| TrainingSopService | `vma/training-sop.service.ts` | ~200 | 版本管理逻辑 |
| PdfGeneratorService | `vma/pdf-generator.service.ts` | ~500 | PDF 生成性能 |

**审计重点问题 (这是整个迁移最关键的 Phase):**
```
TRAIN-1: SmartFill writeToDB — 1000+ 次循环内 DB 调用 (A1)
         → V3: Batch INSERT ON CONFLICT

TRAIN-2: 3 处全表加载 findMany() (A2)  
         → V3: EXISTS 子查询

TRAIN-3: groupByCommonSops 是 O(S²×E) (A3)
         → V3: BitSet 集合运算

TRAIN-4: Roadmap 每节点重算全部员工 (A4)
         → V3: 增量 ComplianceTracker

TRAIN-5: GO_LIVE_DATE 硬编码 ×2 处 (A5)
         → V3: system_config 表

TRAIN-6: trainingNo 冗余在 record 上 (A7)
         → V3: 移除, JOIN session

TRAIN-7: SmartFill 的 Go-Live 规则正确性 — 边界情况:
         - 员工入职日 == GO_LIVE_DATE
         - 员工入职日 == SOP effectiveDate
         - SOP 只有 1 个版本且 trainingRequired=false
         → V3: 全部覆盖单元测试

TRAIN-8: PDF 生成是同步还是异步?
         一次 SmartFill 生成 20+ PDF — 是否阻塞?
         → 审计时确认
```

### Step 2: DESIGN
- SmartFillUseCase (完全重写, BitSet 算法)
- TrainingMatrixUseCase (增量计算)
- Batch DB writes (JdbcTemplate batchUpdate)
- system_config 表 (GO_LIVE_DATE 等)
- PDF 异步生成 (Spring @Async / CompletableFuture)

### Step 3: BUILD
- 后端: Training 模块 Kotlin 实现
- SmartFill 双跑对比框架搭建
- 前端: Training 相关页面验证

### Step 4: VERIFY (最严格)
- [ ] SmartFill 双跑: V2 和 V3 处理相同输入, 输出完全一致
- [ ] DB 调用次数: V2 (1000+) → V3 (< 10) ✅
- [ ] 内存使用: V2 (全表加载) → V3 (按需查询) ✅
- [ ] groupByCommonSops 性能: V2 vs V3 计时对比
- [ ] Go-Live 边界测试: 10+ 边界情况全部通过
- [ ] PDF 生成: 20 份 PDF 不阻塞 API 响应

### Step 5: GATE (最严格 — 这个 Phase 不过门就不继续)
- [ ] TRAIN-1 到 TRAIN-8 全部解决
- [ ] SmartFill 双跑 100% 输出一致
- [ ] 单元测试覆盖率 > 90% (SmartFill)
- [ ] 性能全面优于 V2

**交付物:**
```
audits/phase5-training-smartfill-audit.md  ← 最详细的审计报告
reports/phase5-smartfill-dual-run.md       ← SmartFill 双跑对比结果
reports/phase5-verification.md             ← 性能基准对比
```

---

## Phase 6: VMA — P-Valve + Inventory + Clinical (2 周)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| InventoryTransactionService | `inventory-transaction.service.ts` (~500 行) | Ledger 一致性、库存计算 (A6) |
| ClinicalCaseService | `vma/clinical-case.service.ts` | 案例创建/完成/回库流程 |
| ReceivingBatch 逻辑 | `vma/receiving.service.ts` | 批次接收、检验、自动 Demo |
| PValveProductService | `vma/pvalve-product.service.ts` | 产品+适配关系管理 |

**审计重点问题:**
```
INV-1: 库存计算逻辑在 summary/detail 两处重复 (A6)
       → V3: 提取 InventoryCalculator

INV-2: getDemoInventory 的 raw SQL 是否有注入风险?
       → 审计时确认 (当前用参数化, 应无风险)

INV-3: Append-only ledger 的一致性验证:
       是否有定期 reconciliation?
       → V3: 添加 ledger integrity check

INV-4: OUT_CASE → REC_CASE/USED_CASE 的业务约束:
       能否 USED_CASE 超过 OUT_CASE? 有无运行时校验?
       → 审计时确认

INV-5: Clinical Case ID 格式 (UVP-{SiteID}-{PatientID})
       是否有并发冲突? Race condition?
       → 审计时确认

INV-6: 过期判定 (expDate < today)
       时区处理是否一致? (Pacific Time)
       → 审计时确认
```

### Step 2-5: (标准流程)

**交付物:**
```
audits/phase6-inventory-clinical-audit.md
reports/phase6-verification.md
```

---

## Phase 7: 前端精炼 + macOS 审计 (2 周, 与 Phase 5-6 部分并行)

### Step 1: AUDIT

| 审计对象 | V2 文件 | 重点 |
|----------|---------|------|
| API Client | `lib/api/client.ts` | 错误处理、重试策略、Token 刷新 |
| React Query 使用 | 已集成页面 vs 未集成页面 | 一致性、缓存策略 |
| ThemeContext | `context/ThemeContext.tsx` (395 行) | 保留, 仅审计是否有未使用的 token |
| 全部 TSX 页面 | 97 个文件 | Emoji 使用、颜色硬编码、动画一致性 |
| useAutoRefresh | `hooks/useAutoRefresh.ts` (177 行) | 是否被 React Query 替代? |
| i18n 覆盖率 | `packages/shared/i18n/` | 是否有硬编码中英文 |

**审计重点问题:**
```
FE-1: useAutoRefresh 和 React Query 的 refetchInterval 功能重叠
      → V3: 统一用 React Query, 废弃自定义 hook

FE-2: 部分页面用 raw fetch, 部分用 React Query
      → V3: 全部 React Query

FE-3: 是否有页面硬编码颜色而不用 NSColor token?
      → V3: 全部走 ThemeContext

FE-4: API 错误处理一致性
      → V3: 统一 toast 通知 + error boundary

FE-5: Loading 状态: 有的用 spinner, 有的用 skeleton
      → V3: 统一 skeleton

FE-6: 性能: 有无不必要的 re-render, bundle size 优化空间?
      → V3: React.memo + lazy loading 审查
```

### Step 2-5: (标准流程)

**交付物:**
```
audits/phase7-frontend-audit.md
reports/phase7-ui-ux-report.md
```

---

## Phase 8: 切换 + 终极审计 (1 周)

### Step 1: FINAL AUDIT — 全局回顾

| 审计对象 | 内容 |
|----------|------|
| 所有 Phase 审计报告 | 是否有遗留问题? |
| V3 完整代码 | 架构一致性、代码风格统一 |
| 数据完整性 | 所有表数据行数对比 V2 |
| 安全审计 | 渗透测试、依赖扫描 |
| 性能基准 | V2 vs V3 全模块性能对比 |

### Step 2: CUTOVER
- 停止 V2 NestJS
- Nginx 全部路由 → Spring Boot :8080
- 监控 24h

### Step 3: STABILIZATION
- 热修复
- V2 代码归档
- 文档更新

**交付物:**
```
audits/phase8-final-audit.md           ← 终极审计报告
reports/v3-vs-v2-benchmark.md          ← 完整性能对比
reports/v3-launch-signoff.md           ← 上线签字
```

---

## 总时间线 (Updated 2026-02-12)

```
Phase 0: 基础骨架 + 全局审计         ✅ 完成
Phase 1: Auth + Users + Roles        ✅ 完成 (29 tests)
Phase 2: Logs                        ✅ 完成 (19 tests, 5/5 audit)
Phase 3: Products                    🚫 跳过 (V2 未完成 V1 迁移, 日后从 V1 直接迁)
Phase 3: VMA 员工 + 部门              ← 当前
Phase 4: VMA 培训 + SmartFill ⚠️      2 周  (最关键)
Phase 5: VMA 库存 + 临床              2 周
Phase 6: 前端精炼 (与 4-5 并行)       2 周
Phase 7: 切换 + 终极审计              1 周
─────────────────────────────────────
总计:                                10-13 周 (Products 从 V1 单独迁移)
```

## 审计产出物清单

```
每个 Phase 输出:
  ├── audits/phaseN-{module}-audit.md      ← V2 源码审计报告
  ├── reports/phaseN-verification.md       ← 性能对比 + 功能验证
  └── (Phase 5 额外) smartfill-dual-run.md ← 双跑对比

最终输出:
  ├── audits/phase8-final-audit.md         ← 终极审计
  ├── reports/v3-vs-v2-benchmark.md        ← 全量基准测试
  └── reports/v3-launch-signoff.md         ← 上线签字
```

## 质量门禁总规则

```
每个 Phase 必须满足:
  ✅ 审计报告中所有问题已解决 (KEEP/IMPROVE/REWRITE 标记清零)
  ✅ 单元测试覆盖率 ≥ 80% (SmartFill ≥ 90%)
  ✅ 集成测试全部通过
  ✅ 对应前端页面功能不退化
  ✅ 性能 ≥ V2 (不允许退步)
  ✅ 客户确认 (你审核通过)

任何一项 ❌ = 不进下一 Phase
```
