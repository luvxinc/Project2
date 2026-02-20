# 实施方案: V1→V3 忠实迁移 (Phase 8)

> **L1 通用 SOP → MGMT 项目 V1(Django+MySQL)→V3(Spring Boot+Kotlin) 迁移指南**
> **Phase 8 启动时加载本实施方案 + CONTEXT.md R7 铁律**
> **本文件是执行真相源：所有 V1→V3 迁移任务必须遵循此方案。**

---

## 0. 迁移全景

```
V1 (Django + MySQL)  ─────→  V3 (Kotlin/Spring Boot + JPA/Flyway + PostgreSQL)
                        │
                        │  前端: Next.js 16 直连 V3 (保持不变)
                        │  数据库: PostgreSQL (已从 MySQL 迁移)
                        │  策略: 逐模块、忠实迁移、架构优化
```

### 迁移状态

| 模块 | V1 状态 | V3 状态 | Phase |
|------|---------|---------|-------|
| Auth | Django Auth | ✅ V3 完成 | Phase 6 |
| Users / RBAC | V1 Users | ✅ V3 完成 | Phase 6 |
| Products | V1 Products | ✅ V3 完成 | Phase 6 |
| VMA (员工/培训/临床/库存) | V1 VMA | ✅ V3 完成 | Phase 6-7 |
| **Purchase** | V1 Django | 🔴 待迁移 | Phase 8 |
| **Sales** | V1 Django | 🔴 待迁移 | Phase 8 |
| **Inventory** | V1 Django | 🔴 待迁移 | Phase 8 |
| **Finance** | V1 Django | 🔴 待迁移 | Phase 8 |

---

## 1. 🔴 忠实迁移铁律 (每次任务开始必读)

> **来源: CONTEXT.md R7 — 任何违反将导致任务驳回。**

```
1. 先读 V1 源码/审计 → 完全理解后才写 V3
2. 架构变 (Django→Kotlin)，业务逻辑不变
3. V1 的每一个函数/API/字段 → V3 必须有对应实现
4. 禁止猜测、臆造、创造性发挥
5. 不理解 = 不动手 = 先问用户
6. V3 可以修复 V1 的结构缺陷，但不能改变业务结果
```

### 什么可以变 vs 什么不能变

| 维度 | V1→V3 可以改变 | V1→V3 不得改变 |
|------|---------------|---------------|
| **架构** | Django ORM → JPA/Flyway, MySQL → PostgreSQL | 业务模型语义 |
| **代码结构** | V1 过程式 → V3 DDD 分层 | 业务流程顺序 |
| **数据库** | `_final` 冗余表 → Materialized View | 数据口径/计算逻辑 |
| **API 格式** | V1 GET+参数 → V3 RESTful 标准 | 返回字段语义 |
| **安全** | 修复 V1 安全漏洞 | 权限控制范围 |
| **性能** | 优化查询、加索引 | 数据正确性 |
| **错误处理** | 统一异常机制 | 错误触发条件 |

---

## 2. 基线参考文件索引

> **所有 V1 业务知识的权威来源。迁移前必须读对应的基线文件。**

| 文件 | 内容 | 何时加载 |
|------|------|---------|
| `data/audits/BASELINE-v1-database-deep-audit.md` | **V1 全部数据库表** (29表→V3 18表映射)、冗余分析、字段语义 | 每次 Phase 8 任务开始 |
| `data/audits/BASELINE-v3-architecture-audit.md` | V3 架构质量基线 (已完成的模块) | 验证 V3 实现是否合规 |
| `data/audits/BASELINE-v3-column-traceability-matrix.md` | V3 字段追踪矩阵 (字段来源/映射) | 字段级别迁移验证 |
| `data/audits/BASELINE-v3-inventory-schema-mapping.md` | V3 库存 Schema 映射 | Inventory 模块迁移 |
| `data/audits/BASELINE-v3-products-barcode-audit.md` | V3 条形码/Products 审计 | Products 相关迁移 |

### V1 基线审计关键发现 (摘要)

从 `BASELINE-v1-database-deep-audit.md` 提取的关键架构决策:

| V1 问题 | V3 改进方案 |
|---------|------------|
| `_final` 双写冗余 (12对表) | 合并 History 表 + Materialized View 代替 Final |
| `Data_Inventory` 反模式 | 改为事件溯源 + 实时聚合视图 |
| MySQL 枚举字段 | PostgreSQL ENUM + JPA `@Enumerated(EnumType.STRING)` |
| 无软删除 | 统一加 `deleted_at` + `@SQLDelete` + `@Where` |
| 日期无时区 | 统一 `ZonedDateTime` + `America/Los_Angeles` |

---

## 3. 逐模块迁移 SOP (标准执行流程)

### Step 1: 读 V1 源码 (GATHER 阶段)

```
1. 读 V1 Django 对应模块的 models.py → 理解数据模型
2. 读 V1 views.py / api.py → 理解业务流程和 API 契约
3. 读 V1 URLs → 理解端点列表
4. 读 BASELINE-v1-database-deep-audit.md 对应章节 → 理解表冗余/字段语义
5. 读 ERROR-BOOK.md → 检查是否有该模块的已知陷阱
6. 📋 输出 GATHER 报告 (core/templates/gather-report-template.md)
```

### Step 2: 写 V3 Spec (SPEC 阶段)

```
1. 列出 V1 所有 API 端点 → V3 对应端点 (1:1 映射)
2. 列出 V1 所有 Model → V3 对应 Entity/Table (含冗余表合并)
3. 标注每个字段的 V1 源 → V3 目标 (含类型转换)
4. 标注需要修复的 V1 结构缺陷 (如 _final 双写)
5. 标注 V3 优化项 (索引、软删除、时区等)
6. 📋 输出 Spec (core/templates/spec-template.md)
```

### Step 3: 执行迁移 (IN_PROGRESS)

```
A. Schema 层:
   - 写 Flyway Migration SQL (V{N}__add_{module}.sql)
   - 必须覆盖 V1 全部字段 (参考 traceability matrix)
   - 冗余表合并 → 写 CREATE MATERIALIZED VIEW

B. Domain 层 (Kotlin):
   - Entity: @Entity @Table → 映射 V3 Schema
   - Repository: JpaRepository → 覆盖 V1 全部查询方法
   - Service: 实现 V1 全部业务逻辑 (逐函数对照)

C. API 层:
   - Controller: 所有 V1 端点 → V3 RestController
   - DTO: 保持 V1 返回字段语义 (允许格式标准化)
   - 端点路径: V1 /in_po/list → V3 /api/v3/purchase/orders

D. 安全层:
   - 对照 V1 权限控制 → V3 @PreAuthorize
   - 不得缩减权限范围
```

### Step 4: 等价性验证 (VERIFY — 🔴 强制)

```
1. API 等价检查: V1 每个端点 → V3 对应端点 → 相同入参 → 相同出参
2. 数据等价检查: V3 查询结果 ≡ V1 查询结果 (行数/字段/值)
3. 边界条件: V1 异常情况 → V3 同样处理 (不能静默忽略)
4. 运行脚本: core/scripts/refactor-equivalence-audit.sh
5. 📋 输出等价矩阵: core/templates/refactor-equivalence-matrix-template.md
```

---

## 4. Phase 8 模块执行顺序

### 4.1 推荐顺序 (依赖关系)

```
Inventory → Purchase → Sales → Finance
(库存基础)   (入库来源)  (出库来源)  (汇总计算)
```

### 4.2 各模块优先级

| 模块 | V1 表 | V3 目标表 | 复杂度 | 依赖 |
|------|-------|---------|--------|------|
| Inventory | `Data_Inventory`, `Data_Transaction` 等 | ~5 表 + MV | ★★★★ | 无 |
| Purchase | `in_po`, `in_po_final`, `in_po_strategy`, `in_send*` 等 | ~6 表 | ★★★ | Inventory |
| Sales | `in_so`, `in_so_final`, `in_so_strategy` 等 | ~6 表 | ★★★ | Inventory |
| Finance | `Data_COGS`, `Data_Order_Earning` 等 | ~4 表 + MV | ★★★★ | Purchase + Sales |

### 4.3 关键参考: V1 表→V3 表映射 (来自 BASELINE 审计)

> **详细映射见 `BASELINE-v1-database-deep-audit.md` §3 迁移决策**

| V1 表 (MySQL) | 迁移建议 | V3 方案 |
|--------------|---------|--------|
| `in_po` + `in_po_final` | 合并 | `purchase_orders` + MV |
| `in_send` + `in_send_list` + `in_send_final` | 合并 | `shipments` + `shipment_items` + MV |
| `Data_Inventory` | 重构 | 事件溯源 + `inventory_events` |
| `Data_Transaction` | 重构 | `inventory_transactions` (标准化) |
| `Data_COGS` | 重构 | `cogs_entries` + MV |
| `Data_Order_Earning` | 保留语义 | `order_earnings` |

---

## 5. 陷阱和注意事项

| 陷阱 | 说明 | 怎么避免 |
|------|------|----------|
| **_final 表语义丢失** | V1 final 表是快照，MV 是实时计算，行为不同 | 确认 V1 final 是否真实时，还是延迟更新 |
| **MySQL→PG 枚举** | MySQL ENUM 与 PG ENUM 语法不同 | `@Enumerated(EnumType.STRING)` + Flyway `CREATE TYPE` |
| **隐式事务边界** | V1 Django ORM 自动管理事务 | V3 显式 `@Transactional` |
| **时区陷阱** | V1 MySQL DATETIME 无时区 → 数据库存的是 PST 还是 UTC? | 读 `reference/conventions.md` R1 + 实测验证 |
| **null 值语义** | V1 null 可能有业务含义 (如 tripId=null 表示 case 模式) | 参考 ERROR-BOOK ERR-005 |
| **计算字段** | V1 `Data_COGS` 是预计算，迁移时要还原计算公式 | 读 V1 Django signal/save() 逻辑 |
| **软删除缺失** | V1 硬删除，V3 加软删除后查询要加 `WHERE deleted_at IS NULL` | 所有 Repository 方法都要考虑 |

---

## 6. 验收标准

每个模块迁移完成，必须满足:

```
[ ] V1 全部端点 → V3 等价端点 (1:1，无遗漏)
[ ] V1 全部数据表字段 → V3 有对应列 (允许合并，不允许丢失)
[ ] API 返回格式与前端约定一致 (OpenAPI 验证)
[ ] refactor-equivalence-audit.sh 通过 (数据等价性)
[ ] 所有 V1 测试用例在 V3 复现 (包括边界 + 错误情况)
[ ] V3 性能 ≥ V1 (同等数据量下响应时间)
[ ] 安全审计: 权限控制范围不缩减
```

---

*Migration Playbook v2.0 — V1→V3 忠实迁移规范*
*Updated: 2026-02-19*
