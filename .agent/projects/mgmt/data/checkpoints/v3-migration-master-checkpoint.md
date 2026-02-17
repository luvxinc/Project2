# V3 迁移总进度 — 主检查点

> **最后更新**: 2026-02-17 07:00 PST
> **总测试数**: 262 (258 通过, 4 个已知失败属于 Auth/Log/Role/User 模块)

---

## 🔴 铁律 (R6 + R7) — 2026-02-17 新增

| 编号 | 铁律 | 来源 |
|------|------|------|
| R6 | **V2 已死**: V2 NestJS 已彻底移除, 项目中不存在。禁止引用、提及、参考 V2 代码 | 用户指令 2026-02-17 |
| R7 | **V1 忠实迁移**: V1→V3 必须先逐行读懂 V1 Django 源码, 完全理解后才可写 V3。禁止猜测、臆造、创造性发挥 | 用户指令 2026-02-17 |

**位置**: `CONTEXT.md` §4 全局约束表

---

## 🔴 工作流决定 — 2026-02-17

**一个模块一个模块做, 做好后端做前端, 这样才好测试。**
- 每个模块: V1 源码审读 → V3 后端代码 → 集成测试通过 → 前端对接 → 联调验证
- 只有模块完整通过后, 才进入下一个模块

---

## 数据库

- **PostgreSQL 库名**: `mgmt_v2` (在 localhost:5432)
- **用户**: `aaron`
- **连接串**: `jdbc:postgresql://localhost:5432/mgmt_v2?stringtype=unspecified`
- **应用配置**: `mgmt-v3/src/main/resources/application.yml`

---

## V3 模块完整清单 + 状态

### ✅ 已完成模块 (核心层 — Phase 7 已迁移)

| 模块 | 测试文件 | 测试数 | 状态 |
|------|---------|--------|------|
| **Auth** | `AuthIntegrationTest` + `SecurityPolicyIntegrationTest` | 7+? | ⚠️ 有已知失败 (非本次引入) |
| **Users** | `UserIntegrationTest` | ? | ⚠️ initializationError |
| **Roles** | `RoleIntegrationTest` | ? | ⚠️ initializationError |
| **Products** | `ProductIntegrationTest` + `ProductDddArchTest` | 多 | ✅ (1个 barcode PDF 失败) |
| **Logs** | `LogIntegrationTest` + `LogPhase2IntegrationTest` | 多 | ⚠️ initializationError |
| **VMA** | `VmaIntegrationTest` + `VmaPValveIntegrationTest` + `VmaTrainingIntegrationTest` | 多 | ✅ 全部通过 |

### 🔧 Phase 8 — V1→V3 辅助模块迁移

| 模块 | 后端状态 | 测试文件 | 测试数 | 前端 | V1 审读 |
|------|---------|---------|--------|------|---------|
| **Purchase** | ✅ 代码完成 | 5 个测试文件 | 55 | ❌ 未开始 | ⚠️ 需 R7 审计 |
| **Inventory** | ✅ 代码完成 | 2 个测试文件 | 多 | ❌ 未开始 | ⚠️ 需 R7 审计 |
| **Sales (ETL)** | ✅ 块1 只读API | 2 个测试文件 | 13 | ❌ 未开始 | ✅ 已完成 |
| **Finance** | ❌ 未开始 | 无 | 0 | ❌ 未开始 | ❌ 未开始 |

---

## Sales 模块详细进度

### ✅ 块 1: 只读 API (2026-02-17 完成)

**V1 源码已审读 (6个文件)**:
- `core/services/etl/ingest.py` (374行) — CSV 摄入 + hash 去重
- `core/services/etl/parser.py` (354行) — Custom label 解析 (Single/Dual/Complex)
- `core/services/etl/transformer.py` (458行) — 数据转换 + Action 逻辑 + SKU 展平 + FIFO
- `core/services/etl/repository.py` (68行) — SQL 查询
- `core/services/correction.py` (180行) — SKU 纠错 + 记忆库
- `apps/etl/views.py` (1207行) — Wizard 视图层

**已实现文件**:
```
modules/sales/
├── domain/
│   ├── model/
│   │   ├── RawTransaction.kt       — 对应 raw_transactions 表 (61,363 rows)
│   │   ├── RawTransactionItem.kt   — 对应 raw_transaction_items 表 (37,429 rows)
│   │   ├── CleanedTransaction.kt   — 对应 cleaned_transactions 表 (63,776 rows)
│   │   └── SalesAction.kt          — PostgreSQL sales_action 枚举 (NN/CA/RE/CR/CC/PD)
│   └── repository/
│       ├── RawTransactionRepository.kt
│       ├── RawTransactionItemRepository.kt
│       └── CleanedTransactionRepository.kt
├── application/
│   ├── dto/SalesDtos.kt
│   └── usecase/
│       ├── RawTransactionUseCase.kt     — 只读查询
│       └── CleanedTransactionUseCase.kt — 只读查询 + stats
└── api/
    ├── RawTransactionController.kt    — GET /api/sales/raw-transactions
    └── CleanedTransactionController.kt — GET /api/sales/cleaned-transactions + /stats
```

**API Endpoints**:
| Method | Path | V1 对应 |
|--------|------|---------|
| GET | `/api/sales/raw-transactions` | tab_transaction |
| GET | `/api/sales/raw-transactions/{id}` | 详情 |
| GET | `/api/sales/raw-transactions/by-order/{orderNumber}` | 订单搜索 |
| GET | `/api/sales/cleaned-transactions` | Data_Clean_Log 查询 |
| GET | `/api/sales/cleaned-transactions/{id}` | 详情 |
| GET | `/api/sales/cleaned-transactions/by-order/{orderNumber}` | 订单搜索 |
| GET | `/api/sales/cleaned-transactions/stats` | _get_db_stats_before + _get_data_cutoff_date |

**测试**: 13/13 通过 (RawTransaction: 5, CleanedTransaction: 8)

### ❌ 块 2: ETL Pipeline (未开始)

**V1 数据流** (已完整审读, 待实现):
```
CSV上传 → IngestService (摄入+hash去重)
  ↓ 写入 Data_Transaction / Data_Order_Earning
  ↓
TransactionParser (解析 Custom label → P_SKU{n} + P_Quantity{n})
  ↓ 正则3阶段: Single → Dual → Complex
  ↓ SKU校验 + 自动修复 (CorrectionService.memory_df)
  ↓ P_Flag: 0=待处理, 1=单品, 2=双品, 5=复杂/已修复, 99=异常
  ↓
用户手动修复 P_Flag=99 的记录 (etl_fix_sku)
  ↓
TransactionTransformer (转换入库)
  ↓ Action逻辑: type+reference_id → NN/CA/RE/CR/CC/PD
  ↓ Seller清洗, Earning合并, 物流费提取+分摊(ratio)
  ↓ SKU展平(10 slots: sku{n}, qty{n}, qtyp{n}=qty×quantity)
  ↓ 四维去重(order_number+seller+item_id+action)写入 Data_Clean_Log
  ↓ FIFO同步 (SalesFifoSyncService)
```

**关键 V1 设计细节 (备忘)**:
- Transaction hash: 整行 MD5 (`compute_row_hash_full`)
- Earning hash: 业务键 MD5 (`compute_row_hash_key`, 6列)
- Parser 正则 Pattern 1: `^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<SKU>[A-Za-z0-9\-_/]{7,})\.(?P<Quantity>\d{1,3})(?P<QuantityKey>\+2K)?`
- Transformer 物流费分类: underpaid/overpaid/return/regular/voided/bulk
- 费用分摊: `ratio = item_subtotal / order_total`
- FIFO return_ratios: `{'RE': 0.6, 'CR': 0.5, 'CC': 0.3}`

---

## Purchase 模块详细进度

### ✅ 后端代码完成

**5 个子模块测试文件**:
- `SupplierIntegrationTest.kt` — Supplier CRUD
- `PurchaseOrderIntegrationTest.kt` — PO 生命周期
- `ShipmentIntegrationTest.kt` — 发货管理
- `ReceiveIntegrationTest.kt` — 收货流程
- `PaymentIntegrationTest.kt` — 付款管理

**总计**: 55 个集成测试, 全部通过

**⚠️ 待办**: 需要按 R7 铁律对照 V1 Django 源码审计, 确认业务逻辑完全匹配

---

## Inventory 模块详细进度

### ✅ 后端代码完成

**2 个子模块测试文件**:
- `WarehouseLocationIntegrationTest.kt` — 仓库位置 CRUD
- `StocktakeIntegrationTest.kt` — 盘点管理

**⚠️ 待办**:
- 需要按 R7 铁律对照 V1 Django 源码审计
- V3 DDL (V3__inventory_module.sql 752行) 已设计但未完整验证
- Data_Order_Earning 表未在 V3 中覆盖

---

## V1 MySQL → V3 PostgreSQL 数据库映射

| V1 MySQL 表 | V3 PostgreSQL 表 | 数据量 |
|-------------|-----------------|--------|
| Data_Transaction | raw_transactions | 61,363 |
| (Parser 解析结果) | raw_transaction_items | 37,429 |
| Data_Clean_Log | cleaned_transactions | 63,776 |
| Data_Order_Earning | ❌ 未迁移 | — |
| Data_COGS | cogs_items (已有) | — |
| Data_Inventory | ❌ 待设计 | — |

**sales_action 枚举**: NN, CA, RE, CR, CC, PD (已在 PostgreSQL 中创建)

---

## 关键文件索引

| 文件 | 路径 |
|------|------|
| V3 主配置 | `mgmt-v3/src/main/resources/application.yml` |
| V3 架构参考 | `.agent/projects/mgmt/reference/v3-architecture.md` |
| V1 深度审计 | `.agent/projects/mgmt/data/audits/v1-database-deep-audit.md` |
| V3 列追踪矩阵 | `.agent/projects/mgmt/data/audits/v3-column-traceability-matrix.md` |
| V3 架构审计 | `.agent/projects/mgmt/data/audits/v3-architecture-audit.md` |
| V3 库存 DDL | `mgmt-v3/src/main/resources/db/migration/V3__inventory_module.sql` |
| 铁律 R0-R7 | `.agent/projects/mgmt/CONTEXT.md` §4 |
| Phase 8 计划 | `.agent/projects/mgmt/data/plans/phase8-v1-to-v3-migration.md` |
| 库存检查点 | `.agent/projects/mgmt/data/checkpoints/v3-inventory-migration-checkpoint.md` |

---

## 恢复指南

下次继续时:
1. **读此文件** 获取全量上下文
2. **确认当前任务** — 用户决定做哪个模块
3. **R7 铁律**: 先读 V1 源码 (`backend/apps/{module}/` + `backend/core/services/`)
4. **R6 铁律**: 绝不引用 V2
5. **工作流**: 后端 → 集成测试 → 前端 → 联调

*Master Checkpoint Created: 2026-02-17T07:00:00-08:00*
