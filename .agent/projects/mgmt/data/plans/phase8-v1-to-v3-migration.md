# Phase 8: V1 → V3 迁移执行计划

> **来源**: `data/audits/v2-database-complete-audit.md` (51 表完整审计)  
> **路线**: V1 (Django + MySQL) → V3 (Kotlin + Spring Boot + PostgreSQL)  
> **策略**: 数据库先行 — 全量建表+迁移数据, 然后逐模块写代码  
> **原则**: V1 持续运行=真相源, PG 数据随时可从 V1 重建  
> **日期**: 2026-02-17

---

## 1. 核心策略

```
┌──────────────────────────────────────────────────────────────────────┐
│                     数据库先行策略                                    │
│                                                                      │
│  Phase 8.0: 数据库先行 (1-2 周)                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  1. Flyway 建全部 28 张 V3 表 (含 FK/索引/CHECK/生成列)      │    │
│  │  2. Python 迁移脚本: MySQL 51 表 → PG 28 表                 │    │
│  │  3. 全量导入 284,058 行                                      │    │
│  │  4. V1 对照验证 (行数 + 抽样 + 跨表一致性)                    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│      ↓ PG 中 28 张表已有完整数据, 全部 FK/索引就位                    │
│                                                                      │
│  Phase 8.1-8.5: 逐模块写 V3 Kotlin 代码                             │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  开发时: 直接对接 PG 真实数据, 跨表 JOIN 正常                  │    │
│  │  数据旧了: 重跑迁移脚本刷新 (几分钟)                          │    │
│  │  模块就绪: 最终刷新 → 验证 → 上线 → V1 该模块停用             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  V1 Django/MySQL 始终运行, 是唯一真相源, 直到全部模块切换完成         │
└──────────────────────────────────────────────────────────────────────┘
```

### 为什么数据库先行?

1. **表联动多** — 51 表中跨表引用 200+ 处, FK 约束需要目标表存在
2. **V1 = 真相源** — V1 持续运行, 数据随时可重建, 漂移不是问题
3. **数据量小** — 284k 行, 全量导出+导入几分钟
4. **开发友好** — 写任何模块代码时, 所有相关表的真实数据都在 PG 中

---

## 2. Phase 8.0: 数据库先行 (1-2 周)

### 2.1 Flyway 迁移脚本序列

```
V3 已有迁移: V001-V011 (Auth/Users/Products/VMA/Logs)

Phase 8.0 新增:
  V012__purchase_supplier.sql           ← 供应商 + 策略
  V013__purchase_order.sql              ← PO 主表 + 审计表
  V014__purchase_shipment.sql           ← 发货 + 审计表
  V015__purchase_receipt.sql            ← 收货 + 审计表
  V016__purchase_discrepancy.sql        ← 差异表
  V017__purchase_order_strategy.sql     ← PO 策略快照
  V018__warehouse_location.sql          ← 仓位 (含生成列 barcode)
  V019__finance_payment.sql             ← 统一付款表 + 审计表
  V020__sales_transaction.sql           ← 交易表 (67 TEXT → 强类型)
  V021__etl_clean_log.sql               ← ETL 去重日志
  V022__sales_order_earning.sql         ← 利润表
  V023__fifo_enhancements.sql           ← FIFO 四表增强 (ref_key/CHECK/FK)
  V024__inventory_views.sql             ← 库存聚合物化视图
  V025__ebay_token_encryption.sql       ← eBay token 加密列
```

### 2.2 V3 目标表全表清单 (28 表)

| # | V3 表名 | 来源 V1 表 | 行数 | 关键变化 |
|---|---------|-----------|------|----------|
| 1 | `purchase_supplier` | in_supplier | 10 | Django ORM → 原生 SQL |
| 2 | `purchase_supplier_strategy` | in_supplier_strategy | 10 | 添加 FK + is_active |
| 3 | `purchase_order` | in_po_final | 170 | 添加 PK + UNIQUE + 索引 |
| 4 | `purchase_order_audit` | in_po | 241 | JSONB diff 审计 |
| 5 | `purchase_order_strategy` | in_po_strategy | 20 | 添加 PK + 索引 |
| 6 | `purchase_shipment` | in_send_final | 125 | 添加 PK + 3 索引 |
| 7 | `purchase_shipment_audit` | in_send + in_send_list | 8+179 | 合并为审计表 |
| 8 | `purchase_receipt` | in_receive_final | 111 | 添加 PK + 3 索引, 列 NOT NULL |
| 9 | `purchase_receipt_audit` | in_receive | 111 | JSONB diff 审计 |
| 10 | `purchase_discrepancy` | in_diff_final | 0 | 生成列 diff_quantity |
| 11 | `warehouse_location` | in_mgmt_barcode | 220 | 6列复合PK → BIGSERIAL + 生成列 |
| 12 | `finance_payment` | pmt_po/deposit/prepay/logistic _final | 11 | 8表→1表, payment_type 区分 |
| 13 | `finance_payment_audit` | pmt_po/deposit/prepay/logistic | 0 | 8表→1表 |
| 14 | `sales_transaction` | Data_Transaction | 60,145 | 67 TEXT → 强类型 + 索引 |
| 15 | `etl_clean_log` | Data_Clean_Log | 60,278 | 67 TEXT → 强类型 + hash 索引 |
| 16 | `sales_order_earning` | Data_Order_Earning | 26,931 | 34 TEXT → 强类型 + 索引 |
| 17 | `fifo_transaction` | in_dynamic_tran | 37,075 | note→ref_key UNIQUE |
| 18 | `fifo_layer` | in_dynamic_fifo_layers | 351 | CHECK(qty_remaining>=0) |
| 19 | `fifo_allocation` | in_dynamic_fifo_alloc | 33,930 | 添加 allocation_type |
| 20 | `fifo_landed_price` | in_dynamic_landed_price | 107 | in_record_id INT→BIGINT |
| — | — | — | — | **以下已在 V3 中存在 (V001-V011)** |
| 21 | `system_user` | User_Account + auth_user | 已迁移 | — |
| 22 | `system_permission` | User_Permission | 已迁移 | — |
| 23 | `system_login_history` | User_Login_History | 已迁移 | — |
| 24 | `access_log` | log_access | 已迁移 | — |
| 25 | `audit_log` | log_audit | 已迁移 | — |
| 26 | `business_log` | log_business | 已迁移 | — |
| 27 | `error_log` | log_error | 已迁移 | — |
| 28 | `product_cogs` | Data_COGS | 已迁移 | — |

### 2.3 数据迁移脚本 (Python)

```python
# migrate_v1_to_v3.py — 全量迁移脚本
# 
# 输入: V1 MySQL (MGMT 数据库)
# 输出: V3 PostgreSQL (mgmt_v3 数据库)
# 
# 特性:
#   - 幂等: 每次运行先 TRUNCATE 目标表, 再重新导入
#   - 类型转换: TEXT→强类型, FLOAT→DECIMAL, ENUM→VARCHAR
#   - 验证: 每张表导入后自动校验行数
#   - 用时: < 5 分钟 (284k 行)
#
# 使用:
#   python3 migrate_v1_to_v3.py                    # 全量迁移
#   python3 migrate_v1_to_v3.py --module purchase  # 只迁移采购模块
#   python3 migrate_v1_to_v3.py --verify-only      # 只验证不迁移
```

### 2.4 类型转换规则

| V1 MySQL 类型 | V3 PostgreSQL 类型 | 转换方式 |
|---------------|-------------------|----------|
| TEXT (全部列) | VARCHAR/INT/DECIMAL/DATE/TIMESTAMP | Python 逐列解析 |
| FLOAT / DOUBLE | NUMERIC(x,y) | `str(value)` → `Decimal(str_value)` |
| ENUM('USD','RMB') | VARCHAR(3) | 直接映射 |
| TINYINT(1) | BOOLEAN | 0→FALSE, 1→TRUE |
| VARCHAR(50) (不一致) | VARCHAR(100) (统一) | 直接映射 |
| 无主键 | BIGSERIAL PRIMARY KEY | 自增生成 |
| 6列复合PK (barcode) | BIGSERIAL + 生成列 | 自增 + GENERATED ALWAYS AS |

### 2.5 验证检查点

| # | 检查项 | V1 预期值 | SQL |
|---|--------|-----------|-----|
| 1 | 供应商总数 | 10 | `SELECT COUNT(*) FROM purchase_supplier` |
| 2 | PO 行项总数 | 170 | `SELECT COUNT(*) FROM purchase_order` |
| 3 | PO 审计记录数 | 241 | `SELECT COUNT(*) FROM purchase_order_audit` |
| 4 | 发货总数 | 125 | `SELECT COUNT(*) FROM purchase_shipment` |
| 5 | 收货总数 | 111 | `SELECT COUNT(*) FROM purchase_receipt` |
| 6 | 仓位总数 | 220 | `SELECT COUNT(*) FROM warehouse_location` |
| 7 | 付款总数 | 11 | `SELECT COUNT(*) FROM finance_payment` |
| 8 | 交易总数 | 60,145 | `SELECT COUNT(*) FROM sales_transaction` |
| 9 | 去重日志总数 | 60,278 | `SELECT COUNT(*) FROM etl_clean_log` |
| 10 | 利润表总数 | 26,931 | `SELECT COUNT(*) FROM sales_order_earning` |
| 11 | FIFO 流水总数 | 37,075 | `SELECT COUNT(*) FROM fifo_transaction` |
| 12 | FIFO 层级总数 | 351 | `SELECT COUNT(*) FROM fifo_layer` |
| 13 | INIT 层数 | 244 | `...WHERE source_type = 'INIT'` |
| 14 | FIFO 分配总数 | 33,930 | `SELECT COUNT(*) FROM fifo_allocation` |
| 15 | 到岸价记录数 | 107 | `SELECT COUNT(*) FROM fifo_landed_price` |
| 16 | 孤儿PO→供应商 | 0 | FK 约束自动保证 |
| 17 | 孤儿分配→层级 | 0 | FK 约束自动保证 |
| 18 | FIFO 数量等式 | 0 delta | `SUM(qty_in) - SUM(allocated) = SUM(qty_remaining)` |

### 2.6 交付物

```
Phase 8.0 交付:
  ├── Flyway V012-V025 (14 个迁移文件, 所有表结构就位)
  ├── migrate_v1_to_v3.py (幂等迁移脚本)
  ├── 28 张 PG 表含真实数据 (284,058 行)
  ├── 全部 FK 约束生效, 零孤儿
  ├── 验证报告 (18 项全部 ✅)
  └── README: 如何重跑迁移脚本刷新数据
```

---

## 3. Phase 8.1-8.5: 逐模块写 V3 代码

> **此阶段 PG 数据库已完备, 开发直接对接真实数据。**  
> **数据旧了? `python3 migrate_v1_to_v3.py` 重跑, 几分钟刷新。**

### 3.1 模块迁移顺序

| 子阶段 | 模块 | 复杂度 | 工期 | 依赖 |
|--------|------|--------|------|------|
| 8.1 | Purchase (供应商/PO/发货/收货/差异) | ★★★★★ | 3-4 周 | 无 |
| 8.2 | Finance (统一付款 + 到岸价计算) | ★★★★ | 2-3 周 | 8.1 |
| 8.3 | Sales ETL (Spring Batch + 强类型) | ★★★★★ | 3-4 周 | 8.1 + 8.2 |
| 8.4 | FIFO Engine (原子事务 + 双跑验证) | ★★★★★ | 2-3 周 | 8.3 |
| 8.5 | Inventory (聚合视图 + 仓位管理) | ★★★ | 1-2 周 | 8.4 |

**总工期**: 8.0 (1-2 周) + 8.1-8.5 (11-16 周) = **12-18 周**

### 3.2 每个模块的开发流程

```
每个模块 (8.1-8.5):
  1. 写 V3 Kotlin 代码 (Domain + Repository + UseCase + Controller)
  2. 写集成测试 (Testcontainers + PG)
  3. 对接 PG 真实数据, 功能验证
  4. 与 V1 对照: 相同输入 → 相同输出
  5. 最终刷新 PG 数据 (从 V1 重导)
  6. 上线, V1 该模块停用
```

---

## 4. 每模块 V3 Kotlin 结构

### 4.1 Purchase 模块

```
purchase/
├── domain/
│   ├── Supplier.kt
│   ├── PurchaseOrder.kt
│   ├── Shipment.kt
│   ├── Receipt.kt
│   └── Discrepancy.kt
├── infrastructure/
│   ├── entity/               -- JPA Entity
│   ├── repository/           -- Spring Data
│   └── mapper/
├── application/
│   ├── usecase/
│   │   ├── CreatePoUseCase.kt
│   │   ├── EditPoUseCase.kt
│   │   ├── CreateShipmentUseCase.kt
│   │   ├── CreateReceiptUseCase.kt
│   │   └── HandleDiscrepancyUseCase.kt
│   └── dto/
├── api/
│   ├── SupplierController.kt
│   ├── PurchaseOrderController.kt
│   ├── ShipmentController.kt
│   └── ReceiptController.kt
└── event/
    └── PurchaseEventPublisher.kt   -- → Kafka
```

### 4.2 Finance 模块

```
finance/
├── domain/
│   ├── Payment.kt                   -- 统一付款 (po/deposit/prepay/logistic)
│   └── LandedPriceCalculator.kt     -- 🔴 到岸价计算 (STRICT LOCK)
├── infrastructure/
│   ├── entity/
│   └── repository/
├── application/
│   ├── usecase/
│   │   ├── CreatePaymentUseCase.kt
│   │   └── CalculateLandedPriceUseCase.kt
│   └── dto/
└── api/
    └── PaymentController.kt
```

### 4.3 Sales ETL 模块

```
sales/
├── domain/
│   ├── SalesTransaction.kt
│   └── OrderEarning.kt
├── batch/                            -- Spring Batch
│   ├── EtlJobConfig.kt              -- Job 定义
│   ├── CsvItemReader.kt             -- CSV 读取 (chunk=500)
│   ├── DedupProcessor.kt            -- 去重 (hash 匹配)
│   ├── TransactionWriter.kt         -- 写 sales_transaction
│   └── EarningCalculator.kt         -- 利润计算
├── infrastructure/
│   ├── entity/
│   └── repository/
└── api/
    └── SalesController.kt
```

### 4.4 FIFO Engine

```
fifo/
├── domain/
│   ├── FifoLayer.kt
│   ├── FifoTransaction.kt
│   ├── FifoAllocation.kt
│   └── FifoLandedPrice.kt
├── application/
│   ├── FifoAllocationService.kt     -- 🔴 STRICT LOCK (1:1 翻译)
│   ├── FifoReturnService.kt         -- 退货回库
│   └── CostQueryService.kt          -- 成本查询 (landed > fifo > cogs)
├── infrastructure/
│   ├── entity/
│   └── repository/
└── api/
    └── FifoController.kt            -- (内部 API, 不暴露给前端)
```

### 4.5 Inventory 模块

```
inventory/
├── domain/
│   ├── InventorySummary.kt           -- 聚合: 在手/下订/在途/可用
│   └── WarehouseLocation.kt
├── application/
│   ├── InventoryQueryService.kt      -- 查询物化视图
│   ├── WarehouseLocationService.kt   -- 仓位 CRUD
│   └── ShelfLabelPdfService.kt       -- 标签 PDF (JasperReports)
├── infrastructure/
│   ├── entity/
│   └── repository/
└── api/
    ├── InventoryController.kt
    └── WarehouseController.kt
```

---

## 5. 🔴 STRICT LOCK — 不可改动的核心逻辑

| 逻辑 | V1 原始文件 | V3 翻译要求 |
|------|------------|------------|
| FIFO 先进先出扣减 | `sales_sync.py` | Kotlin 1:1 翻译, 禁止优化算法 |
| ETL 去重 + 利润计算 | `etl/views.py` | Spring Batch 封装, 核心公式不变 |
| 到岸价计算 | `finance/utils/landed_price.py` | `LandedPriceCalculator.kt`, 公式不变 |
| 成本查询优先级 | `landed > fifo > cogs` | `CostQueryService.kt`, 优先级不变 |

---

## 6. 双跑验证方案 (Sales ETL + FIFO)

```
双跑验证 (8.3 + 8.4 上线前必须通过):

1. 取 V1 最近一次 CSV 上传文件
2. 分别在 V1 和 V3 执行 ETL
3. 对比:
   ├── Transaction 行数: V1 == V3 ✅
   ├── 每行关键字段值: diff < 0.01 ✅
   ├── FIFO 分配记录数: V1 == V3 ✅
   ├── 每个 SKU 的 COGS: diff < 0.01 ✅
   └── Order_Earning 利润: diff < 0.01 ✅

4. 边界测试:
   ├── 空 CSV → 不崩
   ├── 重复订单 → 幂等跳过
   ├── 负数量 (退货) → FIFO 回库
   └── 新 SKU (无 COGS) → 降级到默认成本
```

---

## 7. 风险矩阵

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| 1 | FIFO 公式翻译错误 | 中 | 🔴 致命 | 双跑验证 + STRICT LOCK |
| 2 | TEXT→强类型数据丢失 | 中 | 🔴 致命 | 逐列对比 diff < 0.01 |
| 3 | FLOAT→DECIMAL 精度差异 | 高 | 🟡 | str→Decimal 转换 |
| 4 | 到岸价计算偏差 | 中 | 🔴 致命 | 抽样 10 SKU 验证 |
| 5 | ETL 性能回退 | 低 | 🟡 | Spring Batch chunk=500 + 压测 |

---

## 8. 里程碑

| 里程碑 | 交付物 | 质量门 |
|--------|--------|--------|
| **M0** (Week 1-2) | PG 28 表 + 全量数据 + 验证通过 | 18 项检查 ✅ |
| **M1** (Week 5-6) | Purchase V3 Kotlin 上线 | CRUD ✅, 数据对齐 ✅ |
| **M2** (Week 7-9) | Finance V3 上线 | 到岸价 V1=V3 ✅ |
| **M3** (Week 10-13) | Sales ETL V3 上线 | 双跑 100% 一致 ✅ |
| **M4** (Week 12-15) | FIFO Engine V3 上线 | INIT=244 ✅, 分配完整 ✅ |
| **M5** (Week 14-17) | Inventory V3 上线 | 库存聚合 V1=V3 ✅ |
| **M6** (Week 16-18) | V1 Django 退役 | 14 天冷却 ✅ |

---

## 9. V1 Django 退役

```
全部模块切换完成后:
  1. V1 只读 7 天 (确认无遗漏)
  2. 停止 V1 Django 进程
  3. 14 天冷却期 (保留 MySQL, 可随时重启)
  4. 归档 V1 代码 (git tag v1-archived)
  5. 关闭 MySQL 实例
  6. 清理文档中所有 V1 引用
```

---

*Phase 8 执行计划 v2.0 — 2026-02-17*  
*策略: 数据库先行 (全量建表+迁移) → 逐模块写代码*  
*输入基准: v2-database-complete-audit.md (51 表完整审计)*  
*架构约束: reference/v3-architecture.md*
