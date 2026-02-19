# V3 Deep Quality Audit — 数据库结构 + 算法效率 + 代码质量

> **Date:** 2026-02-12
> **Auditor:** CTO + Senior Engineer
> **Scope:** 13 Prisma schema + 全部 service 代码
> **标准:** 不是"能跑就行", 是各方面的卓越

---

## Part 1: 数据库 Schema 审计

### 1.1 总体评估

| 指标 | 当前值 | 评价 |
|------|--------|------|
| 表总数 | 26 张 | 适中, 不多不少 |
| Schema 文件 | 13 个 | 模块化好 |
| 总行数 | 881 行 | 精简 |
| 索引定义 | 50+ 个 | 偏多, 有优化空间 |
| 外键关系 | 完整 | ✅ |
| Enum 使用 | 合理 | ✅ |

### 1.2 🔴 问题: 日志系统 — 4 表是否合理?

**当前设计: 4 张独立表**
```
audit_logs       → 审计日志 (敏感操作)
business_logs    → 业务日志 (普通操作)  
access_logs      → 访问日志 (HTTP 请求)
error_logs       → 错误日志 (异常记录)
```

**CTO 审计结论: ✅ 4 表设计合理, 但有优化空间**

| 优点 | 说明 |
|------|------|
| 职责清晰 | 每种日志的字段完全不同, 合成一张表会导致 50+ 列, 大部分 NULL |
| 查询优化 | 不同类型日志的查询模式完全不同 (审计按用户/风险级别查, 访问按路径/状态码查) |
| 归档独立 | access_logs 增长最快, 可以独立归档/分区, 不影响审计日志 |

| 问题 | 等级 | V3 建议 |
|------|------|---------|
| `audit_logs` 和 `business_logs` 字段重叠 60% | 🟡 | 评估是否合并为 `operation_logs` + type 字段 |
| `access_logs` 的 `username` 是冗余字段 (有 userId FK) | 🟢 | 保留: 查询优化 (避免 JOIN), 审计场景下用户可能被删 |
| 6 个单列索引过多 (audit_logs) | 🟡 | 合并为复合索引 |
| `error_logs` 有 **35 个字段** | 🔴 | 部分字段移到 JSONB `context` 列 |

**V3 方案: error_logs 精简**
```sql
-- V2: 35 columns, many nullable
error_logs (id, traceId, errorType, errorCode, errorMessage, stackTrace, rootCause,
            requestMethod, requestPath, requestQuery, requestBody, requestHeaders,
            userId, username, userRoles, sessionId, ipAddress, userAgent,
            hostname, appVersion, nodeEnv, systemContext,
            module, operation, entityType, entityId, businessContext,
            severity, category, errorHash, occurrences, firstSeenAt, lastSeenAt,
            isResolved, resolvedAt, resolvedBy, resolution, devMode, createdAt)

-- V3: 15 columns + 2 JSONB
error_logs (id, trace_id, error_type, error_code, message, stack_trace,
            severity, category, error_hash, occurrences,
            request   JSONB,   -- { method, path, query, body, headers }
            actor     JSONB,   -- { userId, username, roles, sessionId, ip, userAgent }
            context   JSONB,   -- { module, operation, entity, hostname, appVersion, env, business }
            resolution JSONB,  -- { isResolved, resolvedAt, resolvedBy, notes }
            dev_mode, created_at)
```

**效果: 35 列 → 15 列, 查询不受影响 (PostgreSQL JSONB GIN 索引)**

---

### 1.3 🔴 问题: audit_logs + business_logs 重叠

**字段对比:**

| 字段 | audit_logs | business_logs | 重叠? |
|------|:----------:|:-------------:|:-----:|
| id | ✅ | ✅ | ✅ |
| traceId | ✅ | ✅ | ✅ |
| userId | ✅ | ✅ | ✅ |
| username | ✅ | ✅ | ✅ |
| ipAddress | ✅ | ✅ | ✅ |
| module | ✅ | ✅ | ✅ |
| action | ✅ | ✅ | ✅ |
| entityType | ✅ | ✅ | ✅ |
| entityId | ✅ | ✅ | ✅ |
| details | ✅ | ✅ | ✅ |
| createdAt | ✅ | ✅ | ✅ |
| sessionId | ✅ | ❌ | |
| userAgent | ✅ | ❌ | |
| oldValue/newValue | ✅ | ❌ | |
| result (SUCCESS/DENIED/FAILED) | ✅ | ❌ | |
| riskLevel | ✅ | ❌ | |
| summary | ❌ | ✅ | |
| status | ❌ | ✅ | |
| devMode | ❌ | ✅ | |

**11/18 字段重叠 = 61%**

**V3 CTO 决策: 合并为 `operation_logs`, 用 `log_type` 区分**

```sql
-- V3: 统一操作日志
CREATE TABLE operation_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id    VARCHAR,
  log_type    VARCHAR NOT NULL,  -- 'AUDIT' | 'BUSINESS'
  
  -- Actor (who)
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  username    VARCHAR,
  session_id  VARCHAR,
  ip_address  INET,              -- ← 使用 INET 类型, 比 VARCHAR 更高效
  user_agent  VARCHAR,
  
  -- Action (what)  
  module      VARCHAR NOT NULL,
  action      VARCHAR NOT NULL,
  entity_type VARCHAR,
  entity_id   VARCHAR,
  summary     VARCHAR,
  
  -- Data
  old_value   JSONB,             -- AUDIT only
  new_value   JSONB,             -- AUDIT only
  details     JSONB,
  
  -- Status
  result      VARCHAR DEFAULT 'SUCCESS', -- SUCCESS | DENIED | FAILED
  risk_level  VARCHAR DEFAULT 'LOW',     -- CRITICAL | HIGH | MEDIUM | LOW
  dev_mode    BOOLEAN DEFAULT FALSE,
  
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 复合索引 (替代 6 个单列索引)
CREATE INDEX idx_oplog_type_created ON operation_logs (log_type, created_at DESC);
CREATE INDEX idx_oplog_user_created ON operation_logs (user_id, created_at DESC);
CREATE INDEX idx_oplog_module_action ON operation_logs (module, action);
CREATE INDEX idx_oplog_risk         ON operation_logs (risk_level) WHERE risk_level IN ('CRITICAL', 'HIGH');
CREATE INDEX idx_oplog_trace        ON operation_logs (trace_id) WHERE trace_id IS NOT NULL;
```

**收益: 2 表 → 1 表, 11 个索引 → 5 个索引, 查询更快 (单表扫描)**

---

### 1.4 🟡 问题: 索引过度

**当前索引审计 (部分):**

```
audit_logs:      6 个单列索引 (traceId, userId, module, action, riskLevel, createdAt)
business_logs:   6 个单列索引  
access_logs:     6 个单列索引
error_logs:      11 个索引 (含 4 个复合索引)
```

**问题:**
1. **单列索引过多** — PostgreSQL 在大多数查询中只用 1 个索引, 多余的索引只增加写入开销
2. **缺少复合索引** — 实际查询往往是 `WHERE module = X AND created_at > Y`, 需要复合索引
3. **error_logs 有 11 个索引** — 写入性能受影响

**V3 索引策略: 少而精, 复合优先**

```
规则 1: 每张表最多 5 个索引 (含 PK)
规则 2: 优先复合索引 (覆盖最常见的 WHERE + ORDER BY 组合)
规则 3: 部分索引 (WHERE 条件) 替代全量索引
规则 4: 日志表用时间分区 + BRIN 索引替代 B-tree
```

---

### 1.5 🟡 问题: User.roles 是 String[] 而非关联表

**当前:**
```prisma
model User {
  roles String[] @default(["viewer"])  // PostgreSQL array
}

model Role {
  id    String @id 
  name  String @unique
  level Int    @unique
  // ... 没有和 User 的关联!
}
```

**问题:**
- `User.roles` 是一个字符串数组, 和 `Role` 表**没有外键关系**
- 如果有人改了 Role.name, User.roles 里的旧名字不会更新
- 无法做 JOIN 查询 (谁有 admin 角色?)
- 违反第三范式

**V3 方案: 用关联表**
```sql
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

**注意: 这是一个 schema 变更, 需要数据迁移。但数据量极小 (几个用户), 风险低。**

---

### 1.6 🟡 问题: VmaDepartment 命名混乱

**当前:**
```prisma
model VmaDepartment {
  code   String   // 部门码
  name   String   // 部门名称  
  duties String   // 职责描述
  @@unique([code, duties])  // 一个部门可以有多条记录, 每条一个职责
}
```

这个表实际存的是 **部门+职责 (Department-Duty pair)**, 但表名叫 `VmaDepartment`。

**V3 方案: 拆分**
```sql
-- 真正的部门表
CREATE TABLE vma_departments (
  id UUID PRIMARY KEY,
  code VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 职责表 (属于某个部门)
CREATE TABLE vma_duties (
  id UUID PRIMARY KEY,
  department_id UUID REFERENCES vma_departments(id),
  title VARCHAR NOT NULL,
  sop_training_req VARCHAR,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, title)
);
```

**效果: 数据模型更清晰, 查询更直观**

---

### 1.7 🟢 设计亮点 (保留)

| 设计 | 评价 |
|------|------|
| 库存 append-only ledger | ✅ 优秀 — 会计分录模式, 从不删除/修改, 只追加 |
| SOP 版本控制 (主表 + 版本表) | ✅ 优秀 — 经典 Entity-Version 模式 |
| 临床案例用自然键 (UVP-001-003) | ✅ 合理 — 业务友好 |
| VmaDeliverySystemFit 多对多关联 | ✅ 标准设计 |
| SecurityCode 表 (level + isActive 唯一约束) | ✅ 巧妙 — 确保每个级别只有一个活跃码 |
| 软删除 (deletedAt) | ✅ 正确使用 |
| Receiving Batch → Transaction 一对多 | ✅ 合理 |

---

## Part 2: 算法与效率审计

### 2.1 🔴 SmartFill — groupByCommonSops 是 O(n³)

**当前算法 (贪心分组):**
```typescript
while (remaining.length > 0) {
  // 为每个 SOP 构建 employee index → O(E × S)
  for (const [sopKey, empSet] of sortedSops) {
    // 对每个 SOP, 检查所有其他 SOP 是否被相同员工需要
    for (const [otherKey, otherSet] of sopToEmps) {  // ← O(S)
      for (const empIdx of candidateEmps) {           // ← O(E)
        if (!otherSet.has(empIdx)) { break; }
      }
    }
  }
  // 移除已覆盖的 SOP → O(E × S)
}
```

**复杂度: O(Iterations × S² × E)** — 迭代次数取决于贪心收敛速度

**当前数据量 (小, 暂时没问题):**
- ~20 员工 × ~30 SOPs = 这个 O(n³) 跑 ~18,000 次操作, <100ms

**但如果将来 V1 员工数据迁入 (假设 200 员工 × 100 SOPs):**
- O(200 × 100² × 多次迭代) = 可能 >5 秒

**V3 方案: Set Cover 近似 (O(S × E) per iteration)**

```kotlin
// V3: 使用 bitset 加速集合交集运算
fun groupByCommonSops(employees: List<EmployeeMissing>): List<SessionPlan> {
    // 1. 构建 SOP → BitSet(employees) 映射
    val sopBits = mutableMapOf<String, BitSet>()
    employees.forEachIndexed { idx, emp ->
        emp.missingSops.forEach { sop ->
            sopBits.getOrPut("${sop.sopNo}|${sop.version}") { BitSet(employees.size) }.set(idx)
        }
    }
    
    // 2. 贪心: 每轮选覆盖最多员工的 SOP 集合
    //    BitSet.and() 做交集 → O(n/64) 而不是 O(n)
    while (sopBits.isNotEmpty()) {
        val bestSop = sopBits.maxByOrNull { it.value.cardinality() } ?: break
        val coveredEmps = bestSop.value.clone() as BitSet
        
        // 找所有被 coveredEmps 全覆盖的 SOPs
        val commonSops = sopBits.filter { (_, bits) ->
            val intersection = bits.clone() as BitSet
            intersection.and(coveredEmps)
            intersection == coveredEmps  // 所有员工都需要这个 SOP
        }.keys
        
        // 输出 session
        plans.add(SessionPlan(commonSops, coveredEmps.toEmployeeList()))
        
        // 移除已覆盖的 SOPs
        commonSops.forEach { sopBits.remove(it) }
    }
}
```

**效果: 从 O(S² × E) → O(S × E/64), 快 64 倍+**

---

### 2.2 🔴 Training Record — 全表加载 allRecords

**3 处全表加载:**

```typescript
// smart-fill.service.ts:197
const allRecords = await this.prisma.vmaTrainingRecord.findMany();

// training-record.service.ts:181
const allRecords = await this.prisma.vmaTrainingRecord.findMany();

// training-record.service.ts:321
const allRecords = await this.prisma.vmaTrainingRecord.findMany();
```

**问题:**
- **每次调用都把整张 training_records 表加载到内存**
- 当前数据量小, 但增长后 (每次 SmartFill 生成 员工×SOP 条记录) 会成为瓶颈
- 3 个不同方法各自加载一次, 同一请求可能重复加载

**V3 方案:**

```kotlin
// 方案 A: 使用数据库聚合, 不全量加载
// 只需要知道 "某员工是否完成了某SOP某版本", 不需要完整记录
fun getCompletedSet(employeeNos: List<String>): Set<String> {
    // SQL: SELECT DISTINCT employee_no || '|' || sop_no || '|' || sop_version FROM vma_training_records
    //      WHERE employee_no IN (:employeeNos)
    // 返回 Set<"EMP001|SOP-001|1.0">
}

// 方案 B: 批量 EXISTS 子查询
// 在 SQL 里判定, 不在应用层
fun findMissingSopVersions(employeeNo: String, requiredSops: List<SopVersion>): List<SopVersion> {
    return jdbcTemplate.query("""
        SELECT sv.sop_no, sv.version
        FROM unnest(?::text[], ?::text[]) AS sv(sop_no, version)
        WHERE NOT EXISTS (
            SELECT 1 FROM vma_training_records tr
            WHERE tr.employee_no = ? AND tr.sop_no = sv.sop_no AND tr.sop_version = sv.version
        )
    """, employeeNo, sopNos, versions)
}
```

**效果: 内存 O(n) → O(1), 查询性能 O(n) → O(log n)**

---

### 2.3 🟡 SmartFill — writeToDB 是 N+1 查询

**当前:** 每个 employee × SOP 一条 upsert, **在循环内**
```typescript
for (const plan of plans) {           // ~20 plans
  const session = await prisma.create(...)  // 1 INSERT
  for (const emp of plan.employees) {       // ~10 employees
    for (const sop of plan.sops) {          // ~5 SOPs
      await prisma.upsert(...)              // 1 UPSERT each!
    }
  }
}
// Total: 20 + 20×10×5 = 1020 个数据库调用!
```

**V3 方案: 批量写入**
```kotlin
// 1. 批量创建 sessions
val sessions = sessionRepository.saveAll(plans.map { it.toSessionEntity() })

// 2. 批量创建 records (使用 INSERT ... ON CONFLICT)
val allRecords = plans.flatMap { plan ->
    plan.employees.flatMap { emp ->
        plan.sops.map { sop ->
            TrainingRecord(emp.employeeNo, sop.sopNo, sop.version, plan.session)
        }
    }
}
// 单次 batch insert
jdbcTemplate.batchUpdate("""
    INSERT INTO vma_training_records (employee_no, sop_no, sop_version, session_id, ...)
    VALUES (?, ?, ?, ?, ...)
    ON CONFLICT (employee_no, sop_no, sop_version) DO UPDATE SET session_id = EXCLUDED.session_id
""", allRecords)
```

**效果: 1020 次 DB 调用 → 2 次 DB 调用**

---

### 2.4 🟡 Inventory — getInventoryDetail 逻辑重复

`getInventorySummary` 和 `getInventoryDetail` 在变体之间有 **完全相同** 的 available/wip/expired 计算逻辑。

**V3 方案: 提取为 Domain Service**
```kotlin
class InventoryCalculator {
    // 统一的计算引擎
    fun computeBalance(transactions: List<Transaction>): InventoryBalance {
        val available = transactions
            .filter { it.action in SHELF_ACTIONS }
            .sumOf { it.qty * AVAIL_MULT[it.action]!! }
        val wip = transactions
            .filter { it.action in WIP_ACTIONS }
            .sumOf { it.qty * WIP_MULT[it.action]!! }
        return InventoryBalance(max(0, available), max(0, wip))
    }
    
    // 单元可测试, 零 DB 依赖
    fun classifyByExpiry(balance: InventoryBalance, expDate: LocalDate?): ExpiryClass { ... }
}
```

---

### 2.5 🟡 Training Roadmap — O(E × M × S) 嵌套循环

`getTrainingRoadmap()` 有 701 行, 包含 **逐节点 × 逐员工 × 逐SOP** 的三重循环。

**当前复杂度: O(Milestones × Employees × SOPs)**
- 10 milestones × 20 employees × 30 SOPs = 6,000 次内层操作

**V3 方案: 增量计算**
```kotlin
// 不需要每个 milestone 都从头计算全部员工
// 维护一个 "running compliance state", 每个 milestone 只计算 delta

class ComplianceTracker {
    private val employeeState = mutableMapOf<String, EmployeeCompliance>()
    
    fun applyMilestone(newSopVersions: List<SopVersion>): MilestoneSnapshot {
        // 只更新受 newSopVersions 影响的员工
        val affectedSopNos = newSopVersions.map { it.sopNo }.toSet()
        val affectedEmployees = employeeState.values
            .filter { it.requiredSopNos.intersect(affectedSopNos).isNotEmpty() }
        
        for (emp in affectedEmployees) {
            emp.updateCompliance(newSopVersions)  // O(1) per employee per SOP
        }
        
        return snapshot()
    }
}
```

**效果: O(E × M × S) → O(E × S + M × affected_E)**

---

### 2.6 🟢 高质量代码 (保留)

| 代码 | 评价 |
|------|------|
| `getInventorySummary` 使用 `groupBy` 聚合 | ✅ 优秀 — 在 DB 层面聚合, 不加载全量数据 |
| `getDemoInventory` 使用 `raw SQL` 做复杂聚合 | ✅ 优秀 — 正确使用 Prisma $queryRaw |
| Append-only ledger 的 availMult/wipMult 设计 | ✅ 优雅 — 乘数表驱动, 易维护 |
| 安全级别 L0-L4 的分层设计 | ✅ 工业级 |
| SmartFill Go-Live 日期处理逻辑 | ✅ 完善 — 边界情况全覆盖 |
| SmartFill 500 plans 安全上限 | ✅ 防御性编程好习惯 |

---

## Part 3: 代码质量与模式审计

### 3.1 🔴 GO_LIVE_DATE 魔法数字

```typescript
// smart-fill.service.ts:10
const GO_LIVE_DATE = new Date('2025-06-15T00:00:00');

// training-record.service.ts:9
private readonly GO_LIVE_DATE = new Date('2025-06-15T00:00:00');
```

**同一个常量定义了 2 次**, 且是硬编码的日期。

**V3 方案:**
```kotlin
// 存入 system_config 表, 或者环境变量
@Value("\${vma.training.go-live-date:2025-06-15}")
lateinit var goLiveDate: LocalDate
```

---

### 3.2 🔴 SecurityCode.level 是 String 而非 Enum

```prisma
model SecurityCode {
  level String  // L1, L2, L3, L4 — 用字符串存!
}
```

**V3 方案: 使用 PostgreSQL ENUM**
```sql
CREATE TYPE security_level AS ENUM ('L1', 'L2', 'L3', 'L4');
ALTER TABLE security_codes ALTER COLUMN level TYPE security_level;
```

---

### 3.3 🟡 VmaTrainingRecord.trainingNo 冗余

```prisma
model VmaTrainingRecord {
  sessionId    String?  // FK to VmaTrainingSession
  trainingNo   String?  // 冗余! Session 上已经有 trainingNo
}
```

通过 `session.trainingNo` 即可获取, 不需要在每条 record 上重复存储。

**V3: 移除冗余字段, 查询时 JOIN session 表。**

---

### 3.4 🟡 IP 地址用 VARCHAR 存

```prisma
model AccessLog {
  ipAddress String? @map("ip_address")
}
```

PostgreSQL 有专用的 `INET` 类型, 支持范围查询 (`WHERE ip << '192.168.1.0/24'`), 比字符串高效得多。

**V3: 所有 IP 字段统一用 INET 类型。**

---

## Part 4: V3 Schema 最终修正清单

### 必须修正 (V3 不可妥协)

| # | 修正 | 原因 | 复杂度 |
|---|------|------|--------|
| **S1** | error_logs 35 列 → 15 列 + 3 JSONB | 过宽, 写入慢, 大部分字段 NULL | 中 |
| **S2** | audit_logs + business_logs → operation_logs | 61% 字段重叠, 浪费索引 | 中 |
| **S3** | User.roles String[] → user_roles 关联表 | 违反第三范式, 无外键约束 | 低 |
| **S4** | VmaDepartment → 拆分 departments + duties | 命名误导, 语义不清 | 中 |
| **S5** | SecurityCode.level String → ENUM | 类型安全 | 低 |
| **S6** | 所有 IP 字段 → INET 类型 | 性能 + 功能 | 低 |
| **S7** | 日志表索引精简 (50+ → 25) | 写入性能 | 低 |

### 必须修正 (算法/效率)

| # | 修正 | 原因 | 复杂度 |
|---|------|------|--------|
| **A1** | SmartFill writeToDB → batch insert | N+1 查询 (1000+ DB 调用) | 中 |
| **A2** | Training 全表加载 → 按需查询 / EXISTS | 内存浪费, 不可扩展 | 中 |
| **A3** | groupByCommonSops → BitSet 加速 | O(S²×E) → O(S×E/64) | 高 |
| **A4** | Roadmap 增量计算 → ComplianceTracker | O(E×M×S) → O(E×S + ΔE×M) | 高 |
| **A5** | GO_LIVE_DATE → system_config 表/配置 | 硬编码 × 2 处重复 | 低 |
| **A6** | 库存计算逻辑 → InventoryCalculator 单元 | DRY, 可测试 | 中 |
| **A7** | 移除 trainingNo 冗余字段 | 数据规范化 | 低 |

---

## Part 5: 表结构最终蓝图 (V3)

```
V3 最终表清单 (26 → 24)

核心认证:
  ├── users                    (微调: roles 从 array 移到关联表)
  ├── user_roles               (新增: 取代 String[])
  ├── roles                    (保留)
  ├── role_permission_boundaries (保留)
  ├── refresh_tokens           (保留)
  └── security_codes           (微调: level → ENUM)

产品:
  └── products                 (保留)

日志与监控:
  ├── operation_logs           (合并: audit_logs + business_logs)
  ├── access_logs              (保留, 索引精简)
  ├── error_logs               (精简: 35列 → 15列)
  ├── alert_history            (保留)
  └── log_archives             (保留)

VMA 员工:
  ├── vma_departments          (拆分: 纯部门)
  ├── vma_duties               (拆分: 纯职责)
  ├── vma_employees            (保留)
  ├── vma_employee_departments (保留, 指向 duties)
  └── vma_duty_sop_history     (保留)

VMA 培训:
  ├── vma_training_sops        (保留)
  ├── vma_training_sop_versions (保留)
  ├── vma_duty_sop_requirements (保留, 指向 duties)
  ├── vma_training_sessions    (保留)
  └── vma_training_records     (微调: 移除 trainingNo 冗余)

VMA P-Valve:
  ├── vma_pvalve_products      (保留)
  ├── vma_delivery_system_products (保留)
  ├── vma_delivery_system_fits (保留)
  ├── vma_receiving_batches    (保留)
  ├── vma_inventory_transactions (保留 — 优秀的 ledger)
  ├── vma_clinical_cases       (保留)
  └── vma_sites                (保留)

系统:
  └── system_config            (新增: GO_LIVE_DATE 等)
```

**净变化: 26 表 → 24 表 (合并 2 张日志表, 拆分 1 张 department 为 2 张, 新增 2 张)**
